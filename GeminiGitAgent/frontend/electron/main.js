import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // In development, load from localhost
  // In production, we would load from a built file
  mainWindow.loadURL('http://localhost:5173');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

ipcMain.handle('select-dirs', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

function startBackend() {
  const backendPath = path.join(__dirname, '../../backend');
  const scriptPath = path.join(backendPath, 'server.py');

  console.log('Starting backend from:', backendPath);

  // Spawn the python process
  // We assume 'python' is in the PATH as per previous steps
  const logFile = path.join(backendPath, 'backend-startup.log');
  fs.writeFileSync(logFile, 'Starting backend...\n');

  backendProcess = spawn('python', [scriptPath], {
    cwd: backendPath,
    stdio: ['ignore', 'pipe', 'pipe'] // Pipe output so we can capture it
  });

  backendProcess.stdout.on('data', (data) => {
    const str = data.toString();
    console.log(`[Backend]: ${str}`);
    fs.appendFileSync(logFile, `[STDOUT] ${str}`);
  });

  backendProcess.stderr.on('data', (data) => {
    const str = data.toString();
    console.error(`[Backend Error]: ${str}`);
    fs.appendFileSync(logFile, `[STDERR] ${str}`);
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
    fs.appendFileSync(logFile, `[SPAWN ERROR] ${err.toString()}\n`);
  });
}

app.on('ready', () => {
  startBackend();
  // Give the backend a moment to start, though wait-on in package.json handles the UI load
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    console.log('Killing backend process...');
    backendProcess.kill();
  }
});
