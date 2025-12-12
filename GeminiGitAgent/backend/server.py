import json
import os
import subprocess
import sys
import time
from tempfile import NamedTemporaryFile

import requests
from dotenv import find_dotenv, load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from requests import RequestException

load_dotenv(find_dotenv())

# Determine config file path - works in both development and PyInstaller EXE
def get_config_path():
    """Get the path to app_config.json, handling both development and packaged modes."""
    # Check if running as PyInstaller EXE
    if getattr(sys, 'frozen', False):
        # Running as compiled EXE
        # sys.executable is the path to the EXE
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        
        # For Electron packaging: EXE is typically at resources/backend/gemini-git-agent-server.exe
        # Try multiple locations in order of preference:
        # 1. resources/config/ (sibling to backend/)
        parent_dir = os.path.dirname(exe_dir)
        config_in_parent = os.path.join(parent_dir, 'config', 'app_config.json')
        
        # 2. Same directory as EXE (resources/backend/config/)
        config_in_exe_dir = os.path.join(exe_dir, 'config', 'app_config.json')
        
        # 3. Same directory as EXE (resources/backend/app_config.json)
        config_next_to_exe = os.path.join(exe_dir, 'app_config.json')
        
        # Return the first path that exists, or the parent config if none exist (will be created)
        if os.path.exists(config_in_parent):
            return config_in_parent
        elif os.path.exists(config_in_exe_dir):
            return config_in_exe_dir
        elif os.path.exists(config_next_to_exe):
            return config_next_to_exe
        else:
            # Default to parent/config/ for new installs (most logical location)
            return config_in_parent
    else:
        # Running as Python script - use relative path from server.py
        return os.path.join(os.path.dirname(__file__), "../config/app_config.json")

CONFIG_PATH = get_config_path()

# Log config path for debugging (helpful for troubleshooting)
print(f"Config file path: {CONFIG_PATH}")
print(f"Config file exists: {os.path.exists(CONFIG_PATH)}")

def load_config():
    """Load configuration from app_config.json"""
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
                print(f"Config loaded successfully from: {CONFIG_PATH}")
                return config
        else:
            print(f"Config file not found at: {CONFIG_PATH}")
    except Exception as e:
        print(f"Warning: Could not load config file: {e}")
    return {}

def save_config(config):
    """Save configuration to app_config.json"""
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving config file: {e}")
        return False

# Load initial config
app_config = load_config()

# Add GitHelper to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../../GitHelper"))
import importlib

import git_helper

importlib.reload(git_helper)
from git_helper import DSLExecutor, GitHelper
from watcher import RepositoryWatcher

app = Flask(__name__)
CORS(app)

# Global state
current_repo_path = None
git_helper = None
last_status_hash = None
repo_watcher = None
cached_status = None
cached_status_hash = None
last_files_hash = None
cached_files_list = None

# Default model
DEFAULT_GEMINI_MODEL = "gemini-1.5-flash"

def get_gemini_model():
    """Get Gemini model from config file, default to gemini-1.5-flash."""
    config = load_config()
    model = config.get("gemini_model", DEFAULT_GEMINI_MODEL)
    return model if model else DEFAULT_GEMINI_MODEL

def get_gemini_url():
    """Get the Gemini API URL based on the configured model."""
    model = get_gemini_model()
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

def get_gemini_api_key():
    """Get Gemini API key from config file first, then fall back to environment variable."""
    # Always reload config to get latest (important: don't cache)
    config = load_config()
    api_key = config.get("gemini_key", "")
    
    # Handle None, empty string, or whitespace-only
    if api_key:
        api_key = str(api_key).strip()
    else:
        api_key = ""
    
    # Fall back to environment variable if not in config
    if not api_key:
        env_key = os.getenv("GEMINI_API_KEY", "")
        if env_key:
            api_key = str(env_key).strip()
    
    # Return the key if it exists, None otherwise
    return api_key if api_key else None

# Check initial API key status
initial_key = get_gemini_api_key()
if not initial_key:
    print(
        "Warning: Gemini API key is not set. Gemini endpoints will fail until you set it.",
        file=sys.stderr,
    )


def send_gemini_prompt(prompt_text, response_mime_type=None, temperature=0.6):
    """
    Send a prompt to Gemini and return the text response.
    Raises RuntimeError when the API cannot be reached or is misconfigured.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise RuntimeError("Gemini API key is not configured. Please set it in Settings.")
    
    # Verify key is not empty
    if not api_key.strip():
        raise RuntimeError("Gemini API key is empty. Please set a valid key in Settings.")

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt_text,
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": temperature,
        },
    }

    if response_mime_type:
        payload["generationConfig"]["responseMimeType"] = response_mime_type

    try:
        # Ensure API key is properly formatted (strip any whitespace)
        clean_api_key = api_key.strip()
        if not clean_api_key:
            raise RuntimeError("Gemini API key is empty. Please set a valid key in Settings.")
        
        # Verify we have a valid-looking API key (starts with AIza)
        if not clean_api_key.startswith("AIza"):
            print(f"Warning: API key format may be incorrect (doesn't start with 'AIza')")
        
        # Make the request with the cleaned key
        response = requests.post(
            get_gemini_url(),
            params={"key": clean_api_key},
            json=payload,
            timeout=45,
        )
        response.raise_for_status()
    except RequestException as exc:
        # Sanitize error message to not expose API key
        error_msg = str(exc)
        if "?key=" in error_msg:
            # Remove the key from error message for security
            error_msg = error_msg.split("?key=")[0] + "?key=[REDACTED]"
        raise RuntimeError(f"Gemini API request failed: {error_msg}") from exc

    data = response.json()
    try:
        return (
            data["candidates"][0]["content"]["parts"][0]
            .get("text", "")
            .strip()
        )
    except (KeyError, IndexError, AttributeError) as exc:
        raise RuntimeError("Gemini API returned an unexpected response.") from exc


def get_helper():
    global git_helper
    if not current_repo_path:
        return None
    if not git_helper:
        git_helper = GitHelper(current_repo_path)
    return git_helper


def update_status_cache():
    """Update the cached git status. Called by watcher when filesystem changes are detected."""
    global cached_status, cached_status_hash, cached_files_list
    helper = get_helper()
    if not helper:
        return

    # -u shows individual files in untracked directories
    try:
        # Small delay to ensure git has indexed new files (especially on Windows)
        import time
        time.sleep(0.1)
        
        status_output = (
            helper.run_command("git status --porcelain -u", strip=False) or ""
        )
        cached_status = status_output
        cached_status_hash = hash(status_output)
        
        # Also update file list cache when watcher detects changes
        update_files_cache()
    except Exception as e:
        # Only log errors, not every update (reduces I/O overhead)
        print(f"Error in update_status_cache: {e}")


def update_files_cache():
    """Update the cached file list and its hash."""
    global cached_files_list, current_repo_path
    if not current_repo_path:
        return
    
    try:
        files_list = []
        ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode"}
        
        for root, dirs, files in os.walk(current_repo_path):
            # Modify dirs in-place to skip ignored directories (more efficient)
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, current_repo_path)
                files_list.append(rel_path)
        
        cached_files_list = sorted(files_list)
    except Exception as e:
        # Only log errors, reduce I/O overhead
        print(f"Error in update_files_cache: {e}")


@app.route("/api/set-repo", methods=["POST"])
def set_repo():
    global current_repo_path, git_helper, repo_watcher, last_status_hash, last_files_hash, cached_files_list
    data = request.json
    path = data.get("path")

    if not path or not os.path.exists(path):
        return jsonify({"error": "Invalid path"}), 400

    current_repo_path = path
    git_helper = None  # Reset helper
    last_status_hash = None  # Reset hash tracking for new repo
    last_files_hash = None  # Reset file list hash tracking
    cached_files_list = None  # Reset cached file list

    # Start watcher
    if repo_watcher:
        repo_watcher.stop()

    # Use shorter debounce for faster response (0.2s for near-instant updates)
    repo_watcher = RepositoryWatcher(path, update_status_cache, debounce_interval=0.2)
    repo_watcher.start()
    
    # Initialize file list cache
    update_files_cache()

    return jsonify({"message": "Repository set", "path": path})


@app.route("/api/status", methods=["GET"])
def get_status():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    # We use run_command directly to get the raw output
    # -u shows individual files in untracked directories
    status_output = helper.run_command("git status -s -u")
    if status_output is None:
        return jsonify({"status": "Error getting status"}), 500

    return jsonify({"status": status_output})


@app.route("/api/poll", methods=["POST"])
def poll_changes():
    global last_status_hash, cached_status, cached_status_hash, last_files_hash, cached_files_list
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    force_analysis = data.get("force", False)
    # Safely check watcher - it might be None if repo was never set or server restarted
    watcher_triggered = repo_watcher.consume_change() if (repo_watcher and hasattr(repo_watcher, 'consume_change')) else False

    if force_analysis:
        # Update status cache immediately (no git fetch - too slow for forced updates)
        # Users can explicitly pull/fetch if they want remote updates
        update_status_cache()
        watcher_triggered = True

    # Use cached status if watcher just triggered (it's already fresh from the callback)
    # Otherwise fetch fresh status to catch any changes
    if watcher_triggered and cached_status is not None:
        # Watcher callback already updated the cache, use it for instant updates
        status_output = cached_status.rstrip() if cached_status else ""
    else:
        # Fetch fresh status (normal polling case)
        raw_status = helper.run_command("git status --porcelain -u", strip=False)
        if raw_status is None:
            raw_status = ""
        status_output = raw_status.rstrip() if raw_status else ""
        
        # Update cache if stale
        if cached_status is None:
            cached_status = status_output
            cached_status_hash = hash(status_output)
    
    current_hash = hash(status_output)

    # Change detection - compare against last known hash
    status_hash_changed = (last_status_hash is None) or (current_hash != last_status_hash)
    # If watcher triggered, always mark as changed to ensure UI updates immediately
    has_changed = watcher_triggered or status_hash_changed
    
    # Always update hash for next comparison (important for tracking changes)
    last_status_hash = current_hash

    # Check for file list changes (files added/removed)
    files_changed = False
    if watcher_triggered or cached_files_list is None:
        update_files_cache()
    
    if cached_files_list is not None:
        current_files_hash = hash(tuple(cached_files_list))
        files_changed = (last_files_hash is None) or (current_files_hash != last_files_hash)
        if files_changed:
            last_files_hash = current_files_hash

    summary = None
    dsl_suggestion = None

    # Trigger if changed OR forced, AND there is status output
    should_analyze = (has_changed or force_analysis) and status_output.strip()

    if should_analyze:
        prompt = f"""
You are a Git Assistant. Here is the current `git status -s` output of a repository:

{status_output}

1. Provide a concise summary of what has changed.
2. Generate a DSL script to commit these changes. The DSL supports:
   - `cd <path>`
   - `repo`
   - `status`
   - `commit "<message>"`
   - `push "<message>" (optional message, if provided will commit before pushing)`
   - `pull`
   - `deploy "<command>"`

Return JSON with keys "summary" and "dsl".
"""

        try:
            text = send_gemini_prompt(
                prompt,
                response_mime_type="application/json",
                temperature=0.3,
            )
            try:
                parsed = json.loads(text)
                summary = parsed.get("summary")
                dsl_suggestion = parsed.get("dsl")
            except json.JSONDecodeError:
                summary = "Could not parse Gemini response."
                dsl_suggestion = None
        except RuntimeError as exc:
            summary = str(exc)
            dsl_suggestion = None

    return jsonify(
        {
            "has_changed": has_changed,
            "files_changed": files_changed,
            "status": status_output,
            "summary": summary,
            "dsl_suggestion": dsl_suggestion,
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    user_message = data.get("message")

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    status_output = helper.run_command("git status -s -u") or "No changes."
    log_output = helper.run_command("git log --oneline -n 10") or "No recent commits."

    try:
        prompt = f"""
You are a helpful Git Assistant.

Current Git Status:
{status_output}

Recent Commit Log:
{log_output}

User Message: "{user_message}"

1. Respond to the user's message helpfully.
2. If a git action is needed, propose a DSL script using:
   - `cd <path>`
   - `repo`
   - `status`
   - `commit "<message>"`
   - `push "<message>"`
   - `pull`
   - `deploy "<command>"`
   - `undo`
   - `log <limit>`

Return JSON:
{{
  "response": "...",
  "dsl": "commit \\"message\\"" (or null)
}}
"""

        text = send_gemini_prompt(
            prompt,
            response_mime_type="application/json",
            temperature=0.4,
        )
        try:
            parsed = json.loads(text)
            return jsonify(
                {
                    "response": parsed.get("response", "No response received."),
                    "dsl": parsed.get("dsl"),
                }
            )
        except json.JSONDecodeError:
            return jsonify({"response": text, "dsl": None})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/execute", methods=["POST"])
def execute_dsl():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json
    dsl_code = data.get("dsl")

    if not dsl_code:
        return jsonify({"error": "No DSL code provided"}), 400

    temp_file = None
    try:
        with NamedTemporaryFile(mode="w", suffix=".dsl", delete=False) as tmp:
            tmp.write(dsl_code)
            temp_file = tmp.name

        executor = DSLExecutor(helper)

        import io
        from contextlib import redirect_stdout

        buffer = io.StringIO()
        with redirect_stdout(buffer):
            executor.execute_script(temp_file)

        output = buffer.getvalue()
        return jsonify({"output": output})
    finally:
        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)



def _get_commit_stats(helper):
    """Helper to get commit statistics."""
    total_count = helper.run_command("git rev-list --count HEAD")
    if total_count is None:
        return {"total": 0, "unpushed": 0, "behind": 0}

    # Use git status -sb to get ahead/behind info
    status_sb = helper.run_command("git status -sb")
    unpushed_count = 0
    behind_count = 0

    if status_sb:
        first_line = status_sb.splitlines()[0]
        if "..." not in first_line:
            # No upstream, so all commits are unpushed
            unpushed_count = total_count
        else:
            # Has upstream, check for [ahead N] and [behind N]
            import re

            match_ahead = re.search(r"ahead (\d+)", first_line)
            if match_ahead:
                unpushed_count = int(match_ahead.group(1))

            match_behind = re.search(r"behind (\d+)", first_line)
            if match_behind:
                behind_count = int(match_behind.group(1))
    
    try:
        return {
            "total": int(total_count.strip()),
            "unpushed": int(unpushed_count) if isinstance(unpushed_count, (int, str)) else 0,
            "behind": int(behind_count)
        }
    except ValueError:
        return {"total": 0, "unpushed": 0, "behind": 0}


@app.route("/api/commits", methods=["GET"])
def get_commit_count():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    stats = _get_commit_stats(helper)
    return jsonify(stats)


@app.route("/api/commit", methods=["POST"])
def manual_commit():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    message = data.get("message")

    if not message:
        return jsonify({"error": "Commit message required"}), 400

    helper.run_command("git add .")
    output = helper.run_command(f'git commit -m "{message}"')

    if output is None:
        return jsonify({"error": "Commit failed"}), 500

    return jsonify({"output": output})


@app.route("/api/push", methods=["POST"])
def push_changes():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400
        
    data = request.json or {}
    publish = data.get("publish", False)
    
    if publish:
        info = helper.get_branch_info()
        if not info or not info.get("branch"):
             return jsonify({"error": "Could not determine current branch"}), 500
        
        if helper.publish_branch(info["branch"]):
             # Fetch latest stats
             helper.run_command("git fetch")
             stats = _get_commit_stats(helper)
             return jsonify({"message": "Branch published successfully", "stats": stats})
        else:
             return jsonify({"error": "Failed to publish branch"}), 500
    else:
        try:
            if helper.push_changes():
                # Ensure we have latest info
                helper.run_command("git fetch")
                stats = _get_commit_stats(helper)
                return jsonify({"message": "Push successful", "stats": stats})
            else:
                return jsonify({"error": "Failed to push changes to remote"}), 500
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/api/pull", methods=["POST"])
def manual_pull():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    output = helper.run_command("git pull")

    if output is None:
        return jsonify({"error": "Pull failed"}), 500

    return jsonify({"output": output})


@app.route("/api/branch", methods=["GET"])
def get_current_branch():
    """Get the current branch name."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    info = helper.get_branch_info()
    if info:
        return jsonify(info)
    return jsonify({"error": "Failed to get branch info"}), 500


@app.route("/api/branches", methods=["GET"])
def list_branches():
    """List all branches (local and remote)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    # Get local branches (more compatible command)
    local_branches = helper.run_command("git branch", strip=False)
    # Get remote branches
    remote_branches = helper.run_command("git branch -r", strip=False)
    # Get current branch
    current = helper.run_command("git branch --show-current")

    local_list = []
    remote_list = []

    if local_branches:
        # Parse local branches, removing * marker and whitespace
        for line in local_branches.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Remove * marker if present
            branch_name = line.replace('*', '').strip()
            if branch_name:
                local_list.append(branch_name)
        
        # Ensure current branch is first in list
        if current and current.strip() in local_list:
            local_list.remove(current.strip())
            local_list.insert(0, current.strip())

    if remote_branches:
        # Parse remote branches, filter out HEAD and extract branch names
        for line in remote_branches.split('\n'):
            line = line.strip()
            if not line or 'HEAD' in line:
                continue
            # Extract branch name from "origin/branch-name" format
            if '/' in line:
                branch_name = line.split('/')[-1].strip()
                if branch_name and branch_name not in local_list:
                    remote_list.append(branch_name)

    return jsonify({
        "local": local_list,
        "remote": remote_list,
        "current": helper.run_command("git branch --show-current") or ""
    })


@app.route("/api/has-changes", methods=["GET"])
def has_changes():
    """Check if there are uncommitted changes in the working directory."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    # Check for uncommitted changes (staged or unstaged)
    status_output = helper.run_command("git status --porcelain", strip=False)
    has_changes = status_output and status_output.strip() != ""
    
    return jsonify({
        "has_changes": has_changes,
        "status": status_output.strip() if status_output else ""
    })


@app.route("/api/stash/create", methods=["POST"])
def create_stash():
    """Create a stash with an optional message."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    message = data.get("message", "Stashed changes")
    include_untracked = data.get("include_untracked", False)

    # Build stash command
    stash_cmd = "git stash push"
    if include_untracked:
        stash_cmd += " -u"
    if message:
        stash_cmd += f' -m "{message}"'

    output = helper.run_command(stash_cmd, strip=False)
    
    if output is None:
        return jsonify({"error": "Failed to create stash"}), 500

    return jsonify({
        "output": output,
        "success": True
    })


@app.route("/api/stash/list", methods=["GET"])
def list_stashes():
    """List all stashes."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    # Get stash list with format: stash@{index}: On branch: message
    output = helper.run_command("git stash list", strip=False)
    
    if output is None:
        return jsonify({"error": "Failed to list stashes"}), 500

    stashes = []
    if output and output.strip():
        for line in output.strip().split('\n'):
            if line.strip():
                # Parse stash entry: stash@{0}: On branch: message
                parts = line.split(':', 2)
                if len(parts) >= 3:
                    stash_ref = parts[0].strip()  # stash@{0}
                    branch_info = parts[1].strip()  # On branch
                    message = parts[2].strip() if len(parts) > 2 else ""
                    # Extract index from stash@{0}
                    index = stash_ref.replace('stash@{', '').replace('}', '')
                    stashes.append({
                        "index": int(index),
                        "ref": stash_ref,
                        "branch": branch_info,
                        "message": message,
                        "full": line.strip()
                    })

    return jsonify({
        "stashes": stashes
    })


@app.route("/api/stash/apply", methods=["POST"])
def apply_stash():
    """Apply a stash (keeps it in the stash list)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    stash_ref = data.get("stash", "stash@{0}")

    output = helper.run_command(f'git stash apply "{stash_ref}"', strip=False)
    
    if output is None:
        return jsonify({"error": f"Failed to apply stash '{stash_ref}'"}), 500

    return jsonify({
        "output": output,
        "success": True
    })


@app.route("/api/stash/pop", methods=["POST"])
def pop_stash():
    """Pop a stash (removes it from the stash list)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    stash_ref = data.get("stash", "stash@{0}")

    output = helper.run_command(f'git stash pop "{stash_ref}"', strip=False)
    
    if output is None:
        return jsonify({"error": f"Failed to pop stash '{stash_ref}'"}), 500

    return jsonify({
        "output": output,
        "success": True
    })


@app.route("/api/stash/drop", methods=["POST"])
def drop_stash():
    """Delete a stash without applying it."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    stash_ref = data.get("stash", "stash@{0}")

    output = helper.run_command(f'git stash drop "{stash_ref}"', strip=False)
    
    if output is None:
        return jsonify({"error": f"Failed to drop stash '{stash_ref}'"}), 500

    return jsonify({
        "output": output,
        "success": True
    })


@app.route("/api/branch/switch", methods=["POST"])
def switch_branch():
    """Switch to a different branch with options for handling uncommitted changes."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    branch_name = data.get("branch")
    stash_changes = data.get("stash_changes", False)  # If True, stash changes on current branch
    bring_changes = data.get("bring_changes", False)  # If True, bring changes to new branch

    if not branch_name:
        return jsonify({"error": "Branch name required"}), 400

    current_branch = helper.run_command("git branch --show-current")
    
    # If stashing, create a stash before switching
    if stash_changes:
        stash_message = f"Stashed changes from {current_branch.strip() if current_branch else 'unknown branch'}"
        # Use -u to include untracked files, ensuring the working directory is clean for the switch
        stash_output = helper.run_command(f'git stash push -u -m "{stash_message}"', strip=False)
        if stash_output is None:
            return jsonify({"error": "Failed to stash changes"}), 500

    # Check if branch exists locally (more compatible command)
    branches = helper.run_command("git branch", strip=False)
    branch_exists = False
    if branches:
        for line in branches.split('\n'):
            line = line.replace('*', '').strip()
            if line == branch_name:
                branch_exists = True
                break

    if branch_exists:
        # Switch to existing local branch
        if bring_changes:
            # Use git checkout to bring changes (will fail if there are conflicts)
            output = helper.run_command(f'git checkout "{branch_name}"')
        else:
            output = helper.run_command(f'git checkout "{branch_name}"')
    else:
        # Try to checkout remote branch (creates local tracking branch)
        # First check if it exists remotely
        remote_branches = helper.run_command("git branch -r", strip=False)
        remote_exists = False
        if remote_branches:
            for line in remote_branches.split('\n'):
                line = line.strip()
                if f"origin/{branch_name}" in line or line.endswith(f"/{branch_name}"):
                    remote_exists = True
                    break
        
        if remote_exists:
            output = helper.run_command(f'git checkout -b "{branch_name}" "origin/{branch_name}"')
        else:
            return jsonify({"error": f"Branch '{branch_name}' not found"}), 404

    if output is None:
        error_msg = helper.last_error if hasattr(helper, 'last_error') and helper.last_error else "Unknown git error"
        return jsonify({"error": f"Failed to switch to branch '{branch_name}': {error_msg}"}), 500

    # Get new current branch
    new_branch = helper.run_command("git branch --show-current")
    
    return jsonify({
        "output": output,
        "branch": new_branch.strip() if new_branch else branch_name,
        "stashed": stash_changes
    })


@app.route("/api/branch/create", methods=["POST"])
def create_branch():
    """Create a new branch and optionally switch to it."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    branch_name = data.get("branch")
    switch = data.get("switch", True)  # Default to switching to new branch

    if not branch_name:
        return jsonify({"error": "Branch name required"}), 400

    # Check if branch already exists
    branches = helper.run_command("git branch", strip=False)
    if branches:
        for line in branches.split('\n'):
            line = line.replace('*', '').strip()
            if line == branch_name:
                return jsonify({"error": f"Branch '{branch_name}' already exists"}), 400

    # Create new branch
    if switch:
        # Create and switch to new branch
        output = helper.run_command(f'git checkout -b "{branch_name}"')
    else:
        # Just create the branch without switching
        output = helper.run_command(f'git branch "{branch_name}"')

    if output is None:
        error_msg = helper.last_error if hasattr(helper, 'last_error') and helper.last_error else "Unknown git error"
        return jsonify({"error": f"Failed to create branch '{branch_name}': {error_msg}"}), 500

    # Get current branch (will be new branch if switch=True)
    current = helper.run_command("git branch --show-current")
    
    return jsonify({
        "output": output,
        "branch": current.strip() if current else branch_name,
        "created": branch_name
    })


@app.route("/api/file/stage", methods=["POST"])
def stage_file():
    """Stage a specific file."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_path = data.get("path")

    if not file_path:
        return jsonify({"error": "File path required"}), 400

    output = helper.run_command(f'git add "{file_path}"')
    
    if output is None:
        return jsonify({"error": f"Failed to stage file '{file_path}'"}), 500

    return jsonify({"message": f"Staged '{file_path}'", "output": output})


@app.route("/api/file/unstage", methods=["POST"])
def unstage_file():
    """Unstage a specific file."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_path = data.get("path")

    if not file_path:
        return jsonify({"error": "File path required"}), 400

    output = helper.run_command(f'git reset HEAD -- "{file_path}"')
    
    if output is None:
        return jsonify({"error": f"Failed to unstage file '{file_path}'"}), 500

    return jsonify({"message": f"Unstaged '{file_path}'", "output": output})


@app.route("/api/files/revert-all", methods=["POST"])
def revert_all_files():
    """Discard changes to multiple files at once (avoids index locking issues)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_paths = data.get("paths", [])
    
    if not file_paths or not isinstance(file_paths, list):
        return jsonify({"error": "File paths array required"}), 400

    import os
    global current_repo_path
    
    # Get git status to categorize files
    status_output = helper.run_command("git status --porcelain -u", strip=False)
    
    untracked_files = []
    new_files = []
    modified_files = []
    
    if status_output:
        status_lines = status_output.split('\n')
        for file_path in file_paths:
            found = False
            for line in status_lines:
                line = line.strip()
                if not line:
                    continue
                
                line_path = line[3:] if len(line) > 3 else ""
                if line_path.startswith('"') and line_path.endswith('"'):
                    line_path = line_path[1:-1]
                
                # Normalize paths
                normalized_line_path = line_path.replace('\\', '/')
                normalized_file_path = file_path.replace('\\', '/')
                
                if (normalized_line_path == normalized_file_path or 
                    line_path == file_path or 
                    line.endswith(file_path)):
                    status_code = line[:2]
                    if status_code == '??':
                        untracked_files.append(file_path)
                    elif status_code[0] == 'A' or (status_code[0] == ' ' and status_code[1] == 'A'):
                        new_files.append(file_path)
                    else:
                        modified_files.append(file_path)
                    found = True
                    break
            
            if not found:
                # File not in status, assume it's modified
                modified_files.append(file_path)
    
    results = {"succeeded": [], "failed": []}
    
    try:
        # First, unstage all files that need unstaging
        if modified_files or new_files:
            all_to_unstage = modified_files + new_files
            # Unstage all at once
            for file_path in all_to_unstage:
                helper.run_command(f'git reset HEAD -- "{file_path}"')
        
        # Remove untracked files
        for file_path in untracked_files:
            full_path = os.path.join(current_repo_path, file_path) if current_repo_path else None
            if full_path and os.path.exists(full_path):
                try:
                    os.remove(full_path)
                    results["succeeded"].append(file_path)
                except Exception as e:
                    results["failed"].append({"file": file_path, "error": str(e)})
            else:
                results["failed"].append({"file": file_path, "error": "File not found"})
        
        # Remove new files
        for file_path in new_files:
            full_path = os.path.join(current_repo_path, file_path) if current_repo_path else None
            if full_path and os.path.exists(full_path):
                try:
                    os.remove(full_path)
                    results["succeeded"].append(file_path)
                except Exception as e:
                    results["failed"].append({"file": file_path, "error": str(e)})
            else:
                results["failed"].append({"file": file_path, "error": "File not found"})
        
        # Restore modified files from HEAD - do this sequentially to avoid index locking
        for file_path in modified_files:
            try:
                # Check if file exists in HEAD
                check_output = helper.run_command(f'git ls-tree HEAD -- "{file_path}"')
                if check_output is None:
                    # File doesn't exist in HEAD, remove it
                    full_path = os.path.join(current_repo_path, file_path) if current_repo_path else None
                    if full_path and os.path.exists(full_path):
                        os.remove(full_path)
                        results["succeeded"].append(file_path)
                    else:
                        results["failed"].append({"file": file_path, "error": "File not found"})
                else:
                    # File exists in HEAD, restore it
                    output = helper.run_command(f'git checkout HEAD -- "{file_path}"')
                    # Check if restore was successful
                    diff_output = helper.run_command(f'git diff HEAD -- "{file_path}"')
                    if diff_output and diff_output.strip():
                        results["failed"].append({"file": file_path, "error": "File still has differences after restore"})
                    else:
                        results["succeeded"].append(file_path)
            except Exception as e:
                results["failed"].append({"file": file_path, "error": str(e)})
        
        return jsonify({
            "message": f"Reverted {len(results['succeeded'])} file(s)",
            "succeeded": results["succeeded"],
            "failed": results["failed"]
        })
    except Exception as e:
        return jsonify({"error": f"Failed to revert files: {str(e)}"}), 500


@app.route("/api/file/revert", methods=["POST"])
def revert_file():
    """Discard changes to a specific file (revert to HEAD version)."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    data = request.json or {}
    file_path = data.get("path")

    if not file_path:
        return jsonify({"error": "File path required"}), 400

    import os
    global current_repo_path
    full_path = os.path.join(current_repo_path, file_path) if current_repo_path else None

    # Get git status for this specific file to determine its state
    status_output = helper.run_command("git status --porcelain -u", strip=False)
    file_status = None
    is_untracked = False
    is_new_file = False
    
    if status_output:
        for line in status_output.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Check if this line refers to our file
            # Handle quoted paths (git status quotes paths with spaces)
            line_path = line[3:] if len(line) > 3 else ""
            if line_path.startswith('"') and line_path.endswith('"'):
                line_path = line_path[1:-1]
            
            # Normalize paths for comparison (handle Windows/Unix path separators)
            normalized_line_path = line_path.replace('\\', '/')
            normalized_file_path = file_path.replace('\\', '/')
            
            # Match exact file path (more robust matching)
            if (normalized_line_path == normalized_file_path or 
                line_path == file_path or 
                line.endswith(file_path) or
                normalized_line_path.endswith(normalized_file_path)):
                status_code = line[:2]
                # ?? = untracked
                if status_code == '??':
                    is_untracked = True
                    file_status = 'untracked'
                # A  = new file, staged
                # A? = new file, unstaged (shouldn't happen, but handle it)
                elif status_code[0] == 'A' or (status_code[0] == ' ' and status_code[1] == 'A'):
                    is_new_file = True
                    file_status = 'new'
                else:
                    file_status = 'modified'
                break

    try:
        if is_untracked:
            # For untracked files, just remove them
            if full_path and os.path.exists(full_path):
                os.remove(full_path)
                return jsonify({"message": f"Removed untracked file '{file_path}'"})
            else:
                return jsonify({"error": f"File '{file_path}' not found"}), 404
        elif is_new_file:
            # For new files (staged or unstaged), unstage first then remove
            # Unstage if staged
            helper.run_command(f'git reset HEAD -- "{file_path}"')
            # Remove the file
            if full_path and os.path.exists(full_path):
                os.remove(full_path)
                return jsonify({"message": f"Removed new file '{file_path}'"})
            else:
                return jsonify({"error": f"File '{file_path}' not found"}), 404
        else:
            # For tracked files with modifications, restore from HEAD
            # First unstage if it's staged
            helper.run_command(f'git reset HEAD -- "{file_path}"')
            
            # Check if file exists in HEAD before trying to restore
            check_output = helper.run_command(f'git ls-tree HEAD -- "{file_path}"')
            if check_output is None:
                # File doesn't exist in HEAD, so it's a new file - remove it
                if full_path and os.path.exists(full_path):
                    try:
                        os.remove(full_path)
                        return jsonify({"message": f"Removed new file '{file_path}'"})
                    except Exception as e:
                        return jsonify({"error": f"Failed to remove file: {str(e)}"}), 500
                else:
                    return jsonify({"error": f"File '{file_path}' not found"}), 404
            
            # File exists in HEAD, restore it
            output = helper.run_command(f'git checkout HEAD -- "{file_path}"')
            
            # git checkout can succeed but return empty output
            # Check if the command actually failed by verifying the file was restored
            if output is None:
                # Command might have failed, but let's check if file was actually restored
                # by comparing with HEAD version
                diff_output = helper.run_command(f'git diff HEAD -- "{file_path}"')
                if diff_output and diff_output.strip():
                    # Still has differences, revert might have failed
                    return jsonify({"error": f"Failed to revert file '{file_path}'. File may have conflicts or be locked."}), 500

            return jsonify({
                "message": f"Reverted '{file_path}' to HEAD version",
                "output": output or ""
            })
    except Exception as e:
        return jsonify({"error": f"Failed to revert file: {str(e)}"}), 500


@app.route("/api/config/github-path", methods=["GET", "POST"])
def github_path_config():
    """Get or set the GitHub path configuration."""
    global app_config
    
    if request.method == "GET":
        # Reload config to get latest
        app_config = load_config()
        github_path = app_config.get("github_path", "")
        return jsonify({"github_path": github_path})
    
    elif request.method == "POST":
        data = request.json or {}
        new_path = data.get("github_path", "").strip()
        
        if new_path:
            # Normalize the path
            new_path = os.path.normpath(new_path)
            # Convert to absolute path
            if not os.path.isabs(new_path):
                new_path = os.path.abspath(new_path)
            
            # Validate path exists
            if not os.path.exists(new_path):
                return jsonify({"error": f"Path does not exist: {new_path}"}), 400
            if not os.path.isdir(new_path):
                return jsonify({"error": f"Path is not a directory: {new_path}"}), 400
        
        # Update config
        app_config["github_path"] = new_path
        if save_config(app_config):
            print(f"GitHub path updated to: {new_path}")
            return jsonify({"message": "GitHub path updated", "github_path": new_path})
        else:
            return jsonify({"error": "Failed to save configuration"}), 500


@app.route("/api/config/github-token", methods=["GET", "POST"])
def github_token_config():
    """Get or set the GitHub token configuration."""
    global app_config
    
    if request.method == "GET":
        # Reload config to get latest
        app_config = load_config()
        github_token = app_config.get("github_token", "")
        return jsonify({"github_token": github_token})
    
    elif request.method == "POST":
        data = request.json or {}
        github_token = data.get("github_token", "").strip()
        
        if not github_token:
            return jsonify({"error": "github_token is required"}), 400
        
        # Reload config first to get latest
        app_config = load_config()
        # Update config
        app_config["github_token"] = github_token
        if save_config(app_config):
            print("GitHub token updated")
            return jsonify({"message": "GitHub token saved"})
        else:
            return jsonify({"error": "Failed to save configuration"}), 500


@app.route("/api/config/gemini-key/test", methods=["POST"])
def test_gemini_key():
    """Test a Gemini API key without saving it."""
    data = request.json or {}
    test_key = data.get("gemini_key", "").strip()
    
    if not test_key:
        return jsonify({"error": "gemini_key is required"}), 400
    
    # Sanitize URL for logging (never log the key)
    url = get_gemini_url()
    safe_url = url.split("?")[0] if "?" in url else url
    
    # Make a minimal test request to Gemini
    try:
        test_payload = {
            "contents": [{
                "parts": [{"text": "test"}]
            }],
            "generationConfig": {
                "temperature": 0.1,
            }
        }
        
        response = requests.post(
            url,
            params={"key": test_key},
            json=test_payload,
            timeout=10,
        )
        
        # Handle different status codes properly
        status_code = response.status_code
        
        if status_code == 200:
            # Key is valid and request worked
            return jsonify({
                "valid": True,
                "status": "valid",
                "message": "API key is valid"
            })
        elif status_code in (401, 403):
            # Invalid key or unauthorized
            return jsonify({
                "valid": False,
                "status": "invalid_key",
                "error": "This API key is invalid or unauthorized. Please check your key and try again."
            }), status_code
        elif status_code == 429:
            # Rate limit / quota exceeded - key is probably valid
            return jsonify({
                "valid": True,  # Accept the key even if rate limited
                "status": "rate_limited",
                "warning": "Gemini is rate-limiting this key. It may be valid, but you've hit the quota or sent too many requests. Try again later or check your quota."
            }), 429
        elif status_code >= 500:
            # Server error
            return jsonify({
                "valid": False,
                "status": "server_error",
                "error": f"Gemini service error (HTTP {status_code}). Try again later."
            }), status_code
        else:
            # Other client errors
            return jsonify({
                "valid": False,
                "status": "unknown_error",
                "error": f"Unexpected response from Gemini API (HTTP {status_code})"
            }), status_code
            
    except requests.RequestException as exc:
        # Handle network/request errors
        status_code = None
        if hasattr(exc, 'response') and exc.response is not None:
            status_code = exc.response.status_code
            
            if status_code in (401, 403):
                return jsonify({
                    "valid": False,
                    "status": "invalid_key",
                    "error": "This API key is invalid or unauthorized. Please check your key and try again."
                }), status_code
            elif status_code == 429:
                return jsonify({
                    "valid": True,  # Accept the key even if rate limited
                    "status": "rate_limited",
                    "warning": "Gemini is rate-limiting this key. It may be valid, but you've hit the quota or sent too many requests. Try again later or check your quota."
                }), status_code
            elif status_code >= 500:
                return jsonify({
                    "valid": False,
                    "status": "server_error",
                    "error": f"Gemini service error (HTTP {status_code}). Try again later."
                }), status_code
        
        # Generic error - sanitize the exception message to never include the key
        error_msg = str(exc)
        # Remove any potential key leakage from error messages
        if "?key=" in error_msg:
            error_msg = error_msg.split("?key=")[0] + "?key=[REDACTED]"
        
        # Log with sanitized URL
        print(f"Gemini API request failed: {status_code or 'N/A'} {safe_url}")
        
        return jsonify({
            "valid": False,
            "status": "request_failed",
            "error": f"Failed to connect to Gemini API. Please check your internet connection and try again."
        }), 500
    except Exception as exc:
        # Unexpected errors
        print(f"Unexpected error testing Gemini key: {type(exc).__name__}")
        return jsonify({
            "valid": False,
            "status": "unknown_error",
            "error": "An unexpected error occurred. Please try again."
        }), 500


@app.route("/api/config/gemini-key", methods=["GET", "POST", "DELETE"])
def gemini_key_config():
    """Get, set, or delete the Gemini API key configuration."""
    global app_config
    
    if request.method == "GET":
        # Reload config to get latest
        app_config = load_config()
        gemini_key = app_config.get("gemini_key", "")
        # Don't return the full key for security, just indicate if it's set
        return jsonify({
            "is_set": bool(gemini_key),
            "status": "connected" if bool(gemini_key) else "not_configured"
        })
    
    elif request.method == "POST":
        data = request.json or {}
        gemini_key = data.get("gemini_key", "").strip()
        skip_test = data.get("skip_test", False)  # Allow skipping test for migration
        
        if not gemini_key:
            return jsonify({"error": "gemini_key is required"}), 400
        
        # Test the key before saving (unless explicitly skipped)
        if not skip_test:
            try:
                test_payload = {
                    "contents": [{
                        "parts": [{"text": "test"}]
                    }],
                    "generationConfig": {
                        "temperature": 0.1,
                    }
                }
                
                # Sanitize URL for logging (never log the key)
                url = get_gemini_url()
                safe_url = url.split("?")[0] if "?" in url else url
                
                response = requests.post(
                    url,
                    params={"key": gemini_key},
                    json=test_payload,
                    timeout=10,
                )
                
                status_code = response.status_code
                
                if status_code == 200:
                    # Key is valid
                    pass
                elif status_code in (401, 403):
                    return jsonify({
                        "error": "This API key is invalid or unauthorized. Please check your key and try again.",
                        "valid": False,
                        "status": "invalid_key"
                    }), status_code
                elif status_code == 429:
                    # Rate limited - accept the key but warn
                    print(f"Warning: Gemini API rate limited during key save (HTTP 429) - {safe_url}")
                    # Continue to save the key even if rate limited
                elif status_code >= 500:
                    return jsonify({
                        "error": f"Gemini service error (HTTP {status_code}). Try again later.",
                        "valid": False,
                        "status": "server_error"
                    }), status_code
                else:
                    return jsonify({
                        "error": f"Unexpected response from Gemini API (HTTP {status_code})",
                        "valid": False,
                        "status": "unknown_error"
                    }), status_code
                    
            except requests.RequestException as exc:
                status_code = None
                if hasattr(exc, 'response') and exc.response is not None:
                    status_code = exc.response.status_code
                    
                    if status_code in (401, 403):
                        return jsonify({
                            "error": "This API key is invalid or unauthorized. Please check your key and try again.",
                            "valid": False,
                            "status": "invalid_key"
                        }), status_code
                    elif status_code == 429:
                        # Rate limited - accept the key but warn
                        print(f"Warning: Gemini API rate limited during key save (HTTP 429) - {safe_url}")
                        # Continue to save the key even if rate limited
                    elif status_code >= 500:
                        return jsonify({
                            "error": f"Gemini service error (HTTP {status_code}). Try again later.",
                            "valid": False,
                            "status": "server_error"
                        }), status_code
                
                # Generic error - sanitize to never include the key
                error_msg = str(exc)
                if "?key=" in error_msg:
                    error_msg = error_msg.split("?key=")[0] + "?key=[REDACTED]"
                
                print(f"Gemini API request failed: {status_code or 'N/A'} {safe_url}")
                
                return jsonify({
                    "error": "Failed to connect to Gemini API. Please check your internet connection and try again.",
                    "valid": False,
                    "status": "request_failed"
                }), 500
            except Exception as exc:
                print(f"Unexpected error validating Gemini key: {type(exc).__name__}")
                return jsonify({
                    "error": "An unexpected error occurred. Please try again.",
                    "valid": False,
                    "status": "unknown_error"
                }), 500
        
        # Reload config first to get latest
        app_config = load_config()
        # Update config with the key (ensure it's stored as string)
        app_config["gemini_key"] = str(gemini_key).strip()
        if save_config(app_config):
            # Verify the key was saved correctly by reloading
            verify_config = load_config()
            saved_key = verify_config.get("gemini_key", "")
            if saved_key and saved_key.strip() == gemini_key.strip():
                print(f"Gemini API key updated and validated (length: {len(saved_key)} chars)")
                return jsonify({
                    "message": "Gemini API key saved and validated",
                    "valid": True
                })
            else:
                print("Warning: Gemini API key may not have been saved correctly")
                return jsonify({
                    "message": "Gemini API key saved but verification failed. Please try again.",
                    "valid": True
                })
        else:
            return jsonify({"error": "Failed to save configuration"}), 500
    
    elif request.method == "DELETE":
        # Delete the API key
        app_config = load_config()
        if "gemini_key" in app_config:
            del app_config["gemini_key"]
            if save_config(app_config):
                print("Gemini API key deleted")
                return jsonify({"message": "Gemini API key deleted"})
            else:
                return jsonify({"error": "Failed to delete configuration"}), 500
        else:
            return jsonify({"message": "No API key to delete"})


@app.route("/api/config/gemini-model", methods=["GET", "POST"])
def gemini_model_config():
    """Get or set the Gemini model configuration."""
    global app_config
    
    if request.method == "GET":
        # Reload config to get latest
        app_config = load_config()
        model = app_config.get("gemini_model", DEFAULT_GEMINI_MODEL)
        return jsonify({"gemini_model": model})
    
    elif request.method == "POST":
        data = request.json or {}
        model = data.get("gemini_model", "").strip()
        
        if not model:
            return jsonify({"error": "gemini_model is required"}), 400
        
        # Validate model name (basic check)
        if not model.startswith("gemini-"):
            return jsonify({"error": "Invalid model name. Must start with 'gemini-'"}), 400
        
        # Reload config first to get latest
        app_config = load_config()
        # Update config
        app_config["gemini_model"] = model
        if save_config(app_config):
            print(f"Gemini model updated to: {model}")
            return jsonify({"message": "Gemini model updated", "gemini_model": model})
        else:
            return jsonify({"error": "Failed to save configuration"}), 500


@app.route("/api/repos", methods=["GET"])
def list_repositories():
    """Scan for all git repositories in common locations and group by organization."""
    global app_config
    
    # Reload config to get latest changes
    app_config = load_config()
    
    # Get user's home directory
    home_dir = os.path.expanduser("~")
    
    # Get configured GitHub path from config
    configured_github_path = app_config.get("github_path", "")
    
    # Normalize the path (handle Windows paths with backslashes)
    if configured_github_path:
        configured_github_path = os.path.normpath(configured_github_path)
        configured_github_path = os.path.abspath(configured_github_path)
    
    # Common repo locations - these are typically organization containers
    potential_dirs = []
    
    # Add configured GitHub path first if it exists
    if configured_github_path and os.path.exists(configured_github_path) and os.path.isdir(configured_github_path):
        potential_dirs.append(configured_github_path)
        print(f"Scanning configured GitHub path: {configured_github_path}")
    
    # Add other common locations
    potential_dirs.extend([
        os.path.join(home_dir, "Documents", "GitHub"),
        os.path.join(home_dir, "Documents"),
        os.path.join(home_dir, "source"),
        os.path.join(home_dir, "repos"),
        os.path.join(home_dir, "Projects"),
    ])
    
    # Remove duplicates while preserving order
    seen = set()
    potential_dirs = [d for d in potential_dirs if d not in seen and not seen.add(d)]
    
    repos = []
    scanned_dirs = set()
    
    def is_git_repo(path):
        """Check if a directory is a git repository."""
        return os.path.exists(os.path.join(path, ".git"))
    
    def get_github_organization(repo_path):
        """Get GitHub organization/user from git remote.
        
        Queries git remote to get the actual GitHub organization/user.
        Returns None if not a GitHub repo or if remote can't be determined.
        """
        try:
            # Try to get the remote URL
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode != 0:
                # Try alternative: git remote -v
                result = subprocess.run(
                    ["git", "remote", "-v"],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode != 0 or not result.stdout:
                    return None
                
                # Parse output like "origin  https://github.com/org/repo.git (fetch)"
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'origin' in line and ('github.com' in line or 'git@github.com' in line):
                        # Extract URL part
                        parts = line.split()
                        if len(parts) >= 2:
                            remote_url = parts[1]
                            break
                else:
                    return None
            else:
                remote_url = result.stdout.strip()
            
            if not remote_url:
                return None
            
            # Parse GitHub URL to extract organization/user
            # Formats:
            # - https://github.com/org/repo.git
            # - https://github.com/org/repo
            # - git@github.com:org/repo.git
            # - git@github.com:org/repo
            
            if 'github.com' in remote_url:
                # Extract the org/repo part
                if 'github.com/' in remote_url:
                    # HTTPS format
                    parts = remote_url.split('github.com/')
                    if len(parts) > 1:
                        org_repo = parts[1].rstrip('/').rstrip('.git')
                        org = org_repo.split('/')[0] if '/' in org_repo else None
                        return org
                elif 'github.com:' in remote_url:
                    # SSH format
                    parts = remote_url.split('github.com:')
                    if len(parts) > 1:
                        org_repo = parts[1].rstrip('/').rstrip('.git')
                        org = org_repo.split('/')[0] if '/' in org_repo else None
                        return org
            
            return None
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, Exception) as e:
            # If git command fails, return None (will fall back to "Other")
            return None
    
    def scan_directory(directory, max_depth=3, current_depth=0, base_dirs=None):
        """Recursively scan directory for git repos."""
        if base_dirs is None:
            base_dirs = [os.path.abspath(d) for d in potential_dirs if os.path.exists(d)]
        
        # Normalize directory path
        directory = os.path.normpath(os.path.abspath(directory))
        
        if current_depth > max_depth or directory in scanned_dirs:
            return
        
        scanned_dirs.add(directory)
        
        if not os.path.exists(directory) or not os.path.isdir(directory):
            return
        
        try:
            # Check if current directory is a git repo
            if is_git_repo(directory):
                repo_name = os.path.basename(directory)
                # Get GitHub organization from git remote
                organization = get_github_organization(directory)
                # Fall back to "Other" if not a GitHub repo or can't determine org
                if not organization:
                    organization = "Other"
                repos.append({
                    "name": repo_name,
                    "path": directory,
                    "organization": organization
                })
                return  # Don't scan inside git repos
            
            # Only scan subdirectories if we haven't exceeded max depth
            if current_depth < max_depth:
                # Scan subdirectories
                for item in os.listdir(directory):
                    item_path = os.path.join(directory, item)
                    # Normalize the path
                    item_path = os.path.normpath(item_path)
                    if os.path.isdir(item_path) and not item.startswith('.'):
                        scan_directory(item_path, max_depth, current_depth + 1, base_dirs)
        except (PermissionError, OSError) as e:
            # Skip directories we can't access
            print(f"Permission error scanning {directory}: {e}")
            pass
        except Exception as e:
            print(f"Error scanning {directory}: {e}")
            pass
    
    # Scan common locations
    # Increase max_depth to 3 to allow scanning deeper (e.g., A:\Github -> AI-Agent -> GeminiGitAgent)
    for location in potential_dirs:
        location = os.path.normpath(os.path.abspath(location))
        if os.path.exists(location) and os.path.isdir(location):
            print(f"Scanning location: {location}")
            scan_directory(location, max_depth=3)
    
    # Group repos by organization
    repos_by_org = {}
    for repo in repos:
        org = repo.get("organization", "Other")
        if org not in repos_by_org:
            repos_by_org[org] = []
        repos_by_org[org].append(repo)
    
    # Sort repos within each organization by name
    for org in repos_by_org:
        repos_by_org[org].sort(key=lambda x: x["name"].lower())
    
    # Sort organizations alphabetically
    sorted_orgs = sorted(repos_by_org.keys(), key=str.lower)
    
    # Build final structure
    result = {
        "repos": repos,  # Keep flat list for backward compatibility
        "by_organization": {org: repos_by_org[org] for org in sorted_orgs}
    }
    
    return jsonify(result)


@app.route("/api/files", methods=["GET"])
def list_files():
    global current_repo_path
    if not current_repo_path:
        return jsonify({"error": "Repository not set"}), 400

    files_list = []
    ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode"}

    for root, dirs, files in os.walk(current_repo_path):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in ignore_dirs]

        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, current_repo_path)
            files_list.append(rel_path)

    return jsonify({"files": sorted(files_list)})


@app.route("/api/file", methods=["GET", "POST"])
def handle_file():
    global current_repo_path
    if not current_repo_path:
        return jsonify({"error": "Repository not set"}), 400

    if request.method == "GET":
        rel_path = request.args.get("path")
        if not rel_path:
            return jsonify({"error": "Path required"}), 400

        full_path = os.path.join(current_repo_path, rel_path)

        # Security check: ensure path is within repo
        if not os.path.commonpath([full_path, current_repo_path]) == current_repo_path:
            return jsonify({"error": "Invalid path"}), 400

        if not os.path.exists(full_path):
            return jsonify({"error": "File not found"}), 404

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            return jsonify({"content": content})
        except UnicodeDecodeError:
            return jsonify({"error": "Binary or non-UTF-8 file"}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif request.method == "POST":
        data = request.json
        rel_path = data.get("path")
        content = data.get("content")

        if not rel_path or content is None:
            return jsonify({"error": "Path and content required"}), 400

        full_path = os.path.join(current_repo_path, rel_path)

        # Security check
        if not os.path.commonpath([full_path, current_repo_path]) == current_repo_path:
            return jsonify({"error": "Invalid path"}), 400

        try:
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)
            return jsonify({"message": "File saved"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/api/history", methods=["GET"])
def get_commit_history():
    """Get commit history with detailed information."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    limit = request.args.get("limit", 50, type=int)
    
    # Get commit history with detailed format
    # Use a unique delimiter that won't appear in commit messages
    # Format: %H = full hash, %h = short hash, %an = author name, %ae = author email
    # %ad = author date, %s = subject, %b = body
    format_string = "%H|||%h|||%an|||%ae|||%ad|||%s|||%b"
    log_output = helper.run_command(
        f'git log --pretty=format:"{format_string}" --date=iso -n {limit}',
        strip=False
    )
    
    if not log_output:
        return jsonify({"commits": []})
    
    commits = []
    for line in log_output.split('\n'):
        if not line.strip():
            continue
        
        # Split by triple pipe delimiter
        parts = line.split('|||', 6)
        if len(parts) >= 6:
            commit = {
                "hash": parts[0].strip(),
                "shortHash": parts[1].strip() if len(parts) > 1 else "",
                "author": parts[2].strip() if len(parts) > 2 else "",
                "email": parts[3].strip() if len(parts) > 3 else "",
                "date": parts[4].strip() if len(parts) > 4 else "",
                "message": parts[5].strip() if len(parts) > 5 else "",
                "body": parts[6].strip() if len(parts) > 6 else ""
            }
            commits.append(commit)
    
    return jsonify({"commits": commits})


@app.route("/api/repo/summary", methods=["GET"])
def get_repo_summary():
    """Get comprehensive repository summary including authors, description, and stats."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    import os
    global current_repo_path
    
    summary = {
        "name": os.path.basename(current_repo_path) if current_repo_path else "",
        "path": current_repo_path or "",
        "description": "",
        "authors": [],
        "totalCommits": 0,
        "branches": {"local": 0, "remote": 0},
        "remote": None,
        "remoteUrl": None,  # Formatted URL for clicking
        "lastCommit": None,
        "firstCommit": None,
        "language": None,
        "fileCount": 0,
        "repoSize": 0,
        "tags": [],
        "currentBranch": None,
        "unpushedCommits": 0,
        "behindCommits": 0
    }
    
    try:
        # Get repository name
        repo_name = helper.run_command("git rev-parse --show-toplevel")
        if repo_name:
            summary["name"] = os.path.basename(repo_name.strip())
        
        # Generate description using Gemini AI
        try:
            # Gather repository context for Gemini
            readme_content = ""
            readme_files = ["README.md", "README.txt", "README", "readme.md"]
            for readme_file in readme_files:
                readme_path = os.path.join(current_repo_path, readme_file) if current_repo_path else None
                if readme_path and os.path.exists(readme_path):
                    try:
                        with open(readme_path, 'r', encoding='utf-8', errors='ignore') as f:
                            readme_content = f.read()[:2000]  # First 2000 chars of README
                            break
                    except Exception:
                        pass
            
            # Get recent commit messages for context
            recent_commits = helper.run_command("git log --oneline -n 10", strip=False) or ""
            
            # Get file structure (top-level files and directories)
            top_level_items = []
            if current_repo_path:
                try:
                    items = os.listdir(current_repo_path)
                    for item in items[:20]:  # First 20 items
                        item_path = os.path.join(current_repo_path, item)
                        if os.path.isfile(item_path) and not item.startswith('.'):
                            top_level_items.append(f"file: {item}")
                        elif os.path.isdir(item_path) and not item.startswith('.'):
                            top_level_items.append(f"directory: {item}")
                except Exception:
                    pass
            
            # Get primary language and file types
            file_types = "Unknown"
            if current_repo_path:
                file_extensions = {}
                ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode"}
                for root, dirs, files in os.walk(current_repo_path):
                    dirs[:] = [d for d in dirs if d not in ignore_dirs]
                    for file in list(files)[:50]:  # Sample first 50 files
                        ext = os.path.splitext(file)[1].lower()
                        if ext:
                            file_extensions[ext] = file_extensions.get(ext, 0) + 1
                if file_extensions:
                    file_types = ", ".join([f"{ext} ({count})" for ext, count in sorted(file_extensions.items(), key=lambda x: x[1], reverse=True)[:5]])
            
            repo_context = f"""
Repository Name: {summary["name"]}

Top-level:
{chr(10).join(top_level_items[:15]) if top_level_items else "No files found"}

File types:
{file_types}

Recent commits:
{recent_commits[:500] if recent_commits else "No commits"}

README snippet:
{readme_content[:500] if readme_content else "No README"}
"""

            try:
                description = send_gemini_prompt(repo_context, temperature=0.4)
                if description and len(description.strip()) > 20:
                    summary["description"] = description.strip()
                else:
                    summary["description"] = "Description generation failed. Repository information unavailable."
            except RuntimeError as e:
                # Fallback to README if Gemini fails
                if readme_content:
                    lines = readme_content.split('\n')
                    description_lines = []
                    for line in lines[:10]:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            description_lines.append(line)
                        elif line.startswith('#') and len(description_lines) == 0:
                            description_lines.append(line.lstrip('#').strip())
                            break
                    summary["description"] = ' '.join(description_lines[:3])[:200] if description_lines else "No description available."
                else:
                    summary["description"] = f"Could not generate description: {str(e)}"
        except Exception as e:
            print(f"Error generating description: {e}")
            summary["description"] = "Description generation failed."
        
        # Get all unique authors from commit history
        authors_output = helper.run_command("git log --format='%an|%ae'", strip=False)
        authors_set = set()
        if authors_output:
            for line in authors_output.split('\n'):
                if '|' in line:
                    name, email = line.split('|', 1)
                    authors_set.add((name.strip(), email.strip()))
        summary["authors"] = [{"name": name, "email": email} for name, email in sorted(authors_set)]
        
        # Get total commit count
        commit_count = helper.run_command("git rev-list --count HEAD")
        if commit_count:
            summary["totalCommits"] = int(commit_count.strip())
        
        # Get branch counts
        local_branches = helper.run_command("git branch", strip=False)
        remote_branches = helper.run_command("git branch -r", strip=False)
        if local_branches:
            summary["branches"]["local"] = len([l for l in local_branches.split('\n') if l.strip()])
        if remote_branches:
            summary["branches"]["remote"] = len([l for l in remote_branches.split('\n') if l.strip() and 'HEAD' not in l])
        
        # Get remote URL and format it for display
        remote_url = helper.run_command("git remote get-url origin")
        if remote_url:
            remote_url = remote_url.strip()
            summary["remote"] = remote_url
            # Convert SSH to HTTPS URL for clicking
            if remote_url.startswith("git@github.com:"):
                summary["remoteUrl"] = remote_url.replace("git@github.com:", "https://github.com/").replace(".git", "")
            elif remote_url.startswith("https://github.com/") or remote_url.startswith("http://github.com/"):
                summary["remoteUrl"] = remote_url.replace(".git", "")
            else:
                summary["remoteUrl"] = remote_url
        
        # Get current branch
        current_branch = helper.run_command("git branch --show-current")
        if current_branch:
            summary["currentBranch"] = current_branch.strip()
        
        # Get unpushed/behind commits
        status_sb = helper.run_command("git status -sb")
        if status_sb:
            first_line = status_sb.splitlines()[0] if status_sb.splitlines() else ""
            if "..." in first_line:
                import re
                match_ahead = re.search(r"ahead (\d+)", first_line)
                match_behind = re.search(r"behind (\d+)", first_line)
                if match_ahead:
                    summary["unpushedCommits"] = int(match_ahead.group(1))
                if match_behind:
                    summary["behindCommits"] = int(match_behind.group(1))
        
        # Get first commit
        first_commit = helper.run_command("git log --reverse --format='%H|%an|%ad|%s' --date=iso | head -1")
        if first_commit and '|' in first_commit:
            parts = first_commit.split('|', 3)
            if len(parts) >= 4:
                summary["firstCommit"] = {
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3]
                }
        
        # Get tags
        tags_output = helper.run_command("git tag", strip=False)
        if tags_output:
            tags = [t.strip() for t in tags_output.split('\n') if t.strip()]
            summary["tags"] = sorted(tags, reverse=True)[:10]  # Latest 10 tags
        
        # Get file count and repository size
        if current_repo_path:
            file_count = 0
            total_size = 0
            ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode", "dist", "build"}
            for root, dirs, files in os.walk(current_repo_path):
                # Skip ignored directories
                dirs[:] = [d for d in dirs if d not in ignore_dirs]
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        if os.path.isfile(file_path):
                            file_count += 1
                            total_size += os.path.getsize(file_path)
                    except (OSError, PermissionError):
                        pass
            summary["fileCount"] = file_count
            # Format size
            if total_size < 1024:
                summary["repoSize"] = f"{total_size} B"
            elif total_size < 1024 * 1024:
                summary["repoSize"] = f"{total_size / 1024:.2f} KB"
            elif total_size < 1024 * 1024 * 1024:
                summary["repoSize"] = f"{total_size / (1024 * 1024):.2f} MB"
            else:
                summary["repoSize"] = f"{total_size / (1024 * 1024 * 1024):.2f} GB"
        
        # Get last commit info
        last_commit = helper.run_command("git log -1 --format='%H|%an|%ad|%s' --date=iso")
        if last_commit and '|' in last_commit:
            parts = last_commit.split('|', 3)
            if len(parts) >= 4:
                summary["lastCommit"] = {
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3]
                }
        
        # Try to detect primary language (simple heuristic - check for common files)
        if current_repo_path:
            common_extensions = {
                '.py': 'Python',
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.java': 'Java',
                '.cpp': 'C++',
                '.c': 'C',
                '.go': 'Go',
                '.rs': 'Rust',
                '.rb': 'Ruby',
                '.php': 'PHP'
            }
            file_counts = {}
            for root, dirs, files in os.walk(current_repo_path):
                # Skip .git and other hidden directories
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in common_extensions:
                        file_counts[common_extensions[ext]] = file_counts.get(common_extensions[ext], 0) + 1
            if file_counts:
                summary["language"] = max(file_counts.items(), key=lambda x: x[1])[0]
    
    except Exception as e:
        print(f"Error generating repo summary: {e}")
        # Return partial summary even if some parts fail
    
    return jsonify(summary)


@app.route("/api/diff", methods=["GET"])
def get_file_diff():
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    rel_path = request.args.get("path")
    if not rel_path:
        return jsonify({"error": "Path required"}), 400

    # Check file status
    status_output = helper.run_command("git status --porcelain -u", strip=False)
    file_status = None
    is_untracked = False
    is_deleted = False
    
    if status_output:
        for line in status_output.split('\n'):
            line = line.strip()
            if not line:
                continue
            line_path = line[3:] if len(line) > 3 else ""
            if line_path.startswith('"') and line_path.endswith('"'):
                line_path = line_path[1:-1]
            
            # Normalize paths for comparison
            normalized_line_path = line_path.replace('\\', '/')
            normalized_file_path = rel_path.replace('\\', '/')
            
            if (normalized_line_path == normalized_file_path or 
                line_path == rel_path or 
                line.endswith(rel_path) or
                normalized_line_path.endswith(normalized_file_path)):
                status_code = line[:2]
                if status_code == '??':
                    is_untracked = True
                    file_status = 'untracked'
                elif status_code[0] == 'D' or status_code[1] == 'D':
                    is_deleted = True
                    file_status = 'deleted'
                elif status_code[0] == 'A' or (status_code[0] == ' ' and status_code[1] == 'A'):
                    file_status = 'new'
                else:
                    file_status = 'modified'
                break
    
    # If file is untracked, return empty diff (frontend will show as new file)
    if is_untracked:
        return jsonify({"diff": "", "is_untracked": True, "is_deleted": False, "file_status": file_status})
    
    # If file is deleted, get diff showing what was removed
    if is_deleted:
        diff_output = helper.run_command(f'git diff HEAD -- "{rel_path}"')
        return jsonify({"diff": diff_output or "", "is_untracked": False, "is_deleted": True, "file_status": file_status})
    
    # git diff HEAD -- <path> shows uncommitted changes (staged + unstaged) vs HEAD
    diff_output = helper.run_command(f'git diff HEAD -- "{rel_path}"')

    if diff_output is None:
        return jsonify({"diff": "", "is_untracked": False, "is_deleted": False, "file_status": file_status})

    return jsonify({"diff": diff_output, "is_untracked": False, "is_deleted": False, "file_status": file_status})


@app.route("/api/generate-readme", methods=["POST"])
def generate_readme():
    """Generate a comprehensive README.md for the repository using Gemini."""
    helper = get_helper()
    if not helper:
        return jsonify({"error": "Repository not set"}), 400

    global current_repo_path
    if not current_repo_path:
        return jsonify({"error": "Repository path not set"}), 400

    try:
        # Gather context
        # 1. File structure
        file_structure = []
        ignore_dirs = {".git", "__pycache__", "node_modules", "venv", ".idea", ".vscode", "dist", "build"}
        for root, dirs, files in os.walk(current_repo_path):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            level = root.replace(current_repo_path, '').count(os.sep)
            if level > 2: continue # Limit depth
            indent = ' ' * 4 * (level)
            file_structure.append(f"{indent}{os.path.basename(root)}/")
            subindent = ' ' * 4 * (level + 1)
            for f in files[:10]: # Limit files per dir
                file_structure.append(f"{subindent}{f}")
        
        structure_text = "\n".join(file_structure[:50]) # Limit total lines

        # 2. Recent commits
        recent_commits = helper.run_command("git log --oneline -n 10", strip=False) or "No commits yet."

        # 3. Existing README (if any)
        existing_readme = ""
        readme_path = os.path.join(current_repo_path, "README.md")
        if os.path.exists(readme_path):
            try:
                with open(readme_path, 'r', encoding='utf-8') as f:
                    existing_readme = f.read()[:1000] # Limit size
            except Exception:
                pass

        # 4. Get primary language
        language = None
        if current_repo_path:
            common_extensions = {
                '.py': 'Python',
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.java': 'Java',
                '.cpp': 'C++',
                '.c': 'C',
                '.go': 'Go',
                '.rs': 'Rust',
                '.rb': 'Ruby',
                '.php': 'PHP'
            }
            file_counts = {}
            for root, dirs, files in os.walk(current_repo_path):
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in common_extensions:
                        file_counts[common_extensions[ext]] = file_counts.get(common_extensions[ext], 0) + 1
            if file_counts:
                language = max(file_counts.items(), key=lambda x: x[1])[0]

        prompt = f"""
You are an expert developer. Generate a comprehensive README.md using the details below.

Repository: {os.path.basename(current_repo_path)}

File Structure:
{structure_text}

Recent Commits:
{recent_commits}

Primary Language: {language or "Unknown"}

Existing README Snippet:
{existing_readme}

The README must include:
- Title and description
- Key features
- Installation/setup steps
- Usage examples
- Configuration (if applicable)
- Contributing guidelines
- License information (if known)

Return ONLY Markdown content (no code fences).
"""

        readme_content = send_gemini_prompt(prompt, temperature=0.4)

        if not readme_content:
            return jsonify({"error": "Failed to generate README content"}), 500

        # Write README.md
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(readme_content)

        return jsonify({"message": "README.md generated successfully", "content": readme_content})

    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": f"Failed to generate README: {str(e)}"}), 500



@app.route("/api/github/repos", methods=["GET"])
def list_github_repos():
    """Fetch repositories from GitHub API."""
    global app_config
    
    # Reload config
    app_config = load_config()
    token = app_config.get("github_token")
    
    if not token:
        return jsonify({"error": "GitHub token not configured"}), 400
        
    try:
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        # Fetch user's repos (including private ones)
        # Use per_page=100 to get more repos (pagination might be needed for very large accounts)
        response = requests.get(
            "https://api.github.com/user/repos?per_page=100&sort=updated",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 401:
            return jsonify({"error": "Invalid GitHub token"}), 401
            
        response.raise_for_status()
        repos = response.json()
        
        # Group by organization/owner
        repos_by_org = {}
        
        for repo in repos:
            owner = repo["owner"]["login"]
            if owner not in repos_by_org:
                repos_by_org[owner] = []
                
            repos_by_org[owner].append({
                "name": repo["name"],
                "full_name": repo["full_name"],
                "private": repo["private"],
                "html_url": repo["html_url"],
                "clone_url": repo["clone_url"],
                "description": repo["description"],
                "updated_at": repo["updated_at"]
            })
            
        # Sort organizations
        sorted_orgs = sorted(repos_by_org.keys(), key=str.lower)
        
        return jsonify({
            "repos": {org: repos_by_org[org] for org in sorted_orgs}
        })
        
    except requests.RequestException as e:
        print(f"GitHub API error: {e}")
        return jsonify({"error": f"Failed to fetch from GitHub: {str(e)}"}), 500
    except Exception as e:
        print(f"Error processing GitHub repos: {e}")
        return jsonify({"error": f"Internal error: {str(e)}"}), 500


@app.route("/api/github/clone", methods=["POST"])
def clone_github_repo():
    """Clone a repository from GitHub."""
    global app_config
    
    data = request.json or {}
    repo_url = data.get("repo_url")
    
    if not repo_url:
        return jsonify({"error": "Repository URL required"}), 400
        
    # Reload config
    app_config = load_config()
    github_path = app_config.get("github_path")
    
    if not github_path:
        # Fallback to default location if not set
        github_path = os.path.join(os.path.expanduser("~"), "Documents", "GitHub")
        
    # Ensure directory exists
    if not os.path.exists(github_path):
        try:
            os.makedirs(github_path)
        except Exception as e:
            return jsonify({"error": f"Failed to create directory {github_path}: {str(e)}"}), 500
            
    try:
        # Extract repo name from URL
        # e.g. https://github.com/owner/repo.git -> repo
        repo_name = repo_url.split("/")[-1]
        if repo_name.endswith(".git"):
            repo_name = repo_name[:-4]
            
        target_path = os.path.join(github_path, repo_name)
        
        if os.path.exists(target_path):
            return jsonify({"error": f"Directory already exists: {target_path}"}), 400
            
        # Run git clone
        result = subprocess.run(
            ["git", "clone", repo_url, target_path],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return jsonify({"error": f"Git clone failed: {result.stderr}"}), 500
            
        return jsonify({
            "message": "Repository cloned successfully",
            "path": target_path
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to clone repository: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
