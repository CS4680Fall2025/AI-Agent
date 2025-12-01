import ctypes
import os
import threading
from ctypes import wintypes

FILE_LIST_DIRECTORY = 0x0001
FILE_SHARE_ALL = 0x0007  # read | write | delete
OPEN_EXISTING = 0x0003
FILE_FLAG_BACKUP_SEMANTICS = 0x02000000

FILE_NOTIFY_CHANGE_FLAGS = (
    0x00000001  # FILE_NOTIFY_CHANGE_FILE_NAME
    | 0x00000002  # FILE_NOTIFY_CHANGE_DIR_NAME
    | 0x00000004  # FILE_NOTIFY_CHANGE_ATTRIBUTES
    | 0x00000008  # FILE_NOTIFY_CHANGE_SIZE
    | 0x00000010  # FILE_NOTIFY_CHANGE_LAST_WRITE
    | 0x00000040  # FILE_NOTIFY_CHANGE_CREATION
)

ERROR_OPERATION_ABORTED = 995


if os.name == "nt":
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value

    kernel32.CreateFileW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    ]
    kernel32.CreateFileW.restype = wintypes.HANDLE

    kernel32.ReadDirectoryChangesW.argtypes = [
        wintypes.HANDLE,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.BOOL,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
        ctypes.c_void_p,
        ctypes.c_void_p,
    ]
    kernel32.ReadDirectoryChangesW.restype = wintypes.BOOL

    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    try:
        kernel32.CancelIoEx.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
        kernel32.CancelIoEx.restype = wintypes.BOOL
    except AttributeError:
        pass
else:
    kernel32 = None
    INVALID_HANDLE_VALUE = None


class RepositoryWatcher:
    """
    Lightweight watcher that uses ReadDirectoryChangesW to receive notifications
    whenever files beneath `repo_path` change. The watcher debounces events and
    invokes the provided callback on a background thread, mirroring how GitHub
    Desktop refreshes repositories on Windows.
    """

    def __init__(self, repo_path, callback, debounce_interval=0.5):
        self.repo_path = os.path.abspath(repo_path)
        self.callback = callback
        self.debounce_interval = debounce_interval

        self._stop_event = threading.Event()
        self._thread = None
        self._timer = None
        self._lock = threading.Lock()
        self._handle = None
        self._change_event = threading.Event()

    def start(self):
        if self._thread and self._thread.is_alive():
            return

        if os.name != "nt" or kernel32 is None:
            print("RepositoryWatcher currently supports only Windows hosts.")
            # Still perform an initial refresh so status is available.
            self._invoke_callback()
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()
        # Prime the cache immediately
        self._invoke_callback(notify=False)

    def stop(self):
        self._stop_event.set()
        if self._handle:
            try:
                kernel32.CancelIoEx(self._handle, None)
            except AttributeError:
                # CancelIoEx is unavailable on very old Windows builds; closing the
                # handle also breaks ReadDirectoryChangesW.
                pass
            kernel32.CloseHandle(self._handle)
            self._handle = None

        if self._thread:
            self._thread.join(timeout=2)

        with self._lock:
            if self._timer:
                self._timer.cancel()
                self._timer = None

    def consume_change(self):
        """
        Returns True if filesystem changes were observed since the previous call.
        """
        changed = self._change_event.is_set()
        if changed:
            self._change_event.clear()
        return changed

    def _watch_loop(self):
        try:
            handle = kernel32.CreateFileW(
                self.repo_path,
                FILE_LIST_DIRECTORY,
                FILE_SHARE_ALL,
                None,
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                None,
            )
            if handle == INVALID_HANDLE_VALUE:
                raise ctypes.WinError(ctypes.get_last_error())
        except Exception as exc:
            print(f"Failed to watch {self.repo_path}: {exc}")
            self._invoke_callback()
            return

        self._handle = handle
        buffer_length = 32 * 1024
        result_buffer = ctypes.create_string_buffer(buffer_length)
        bytes_returned = wintypes.DWORD()

        try:
            while not self._stop_event.is_set():
                success = kernel32.ReadDirectoryChangesW(
                    handle,
                    ctypes.byref(result_buffer),
                    buffer_length,
                    True,
                    FILE_NOTIFY_CHANGE_FLAGS,
                    ctypes.byref(bytes_returned),
                    None,
                    None,
                )
                if not success:
                    error = ctypes.get_last_error()
                    if error == ERROR_OPERATION_ABORTED:
                        break
                    # Transient error; wait briefly and retry
                    print(f"ReadDirectoryChangesW error {error}, retrying...")
                    continue

                self._schedule_callback()
        finally:
            kernel32.CloseHandle(handle)
            self._handle = None

    def _schedule_callback(self):
        with self._lock:
            if self._timer:
                self._timer.cancel()

            self._timer = threading.Timer(self.debounce_interval, self._invoke_callback)
            self._timer.daemon = True
            self._timer.start()

    def _invoke_callback(self, notify=True):
        with self._lock:
            if self._timer:
                self._timer.cancel()
                self._timer = None

        if not self.callback:
            return

        try:
            self.callback()
        except Exception as exc:
            print(f"Watcher callback error: {exc}")
        finally:
            if notify:
                self._change_event.set()
