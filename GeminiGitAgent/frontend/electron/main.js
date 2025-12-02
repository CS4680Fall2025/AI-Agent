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
  // In production, load from the built file
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

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
  let backendExecutable;
  let args = [];
  let cwd;

  if (app.isPackaged) {
    // In production, use the bundled executable
    // It is placed in resources/backend/gemini-git-agent-server.exe
    const backendPath = path.join(process.resourcesPath, 'backend');
    backendExecutable = path.join(backendPath, 'gemini-git-agent-server.exe');
    cwd = backendPath;
    console.log('Starting bundled backend from:', backendExecutable);
  } else {
    // In development, use python script
    const backendPath = path.join(__dirname, '../../backend');
    backendExecutable = 'python';
    args = [path.join(backendPath, 'server.py')];
    cwd = backendPath;
    console.log('Starting development backend from:', backendPath);
  }

  // Spawn the process
  const logFile = path.join(cwd, 'backend-startup.log');
  // Ensure cwd exists (it should)
  if (!fs.existsSync(cwd)) {
    console.error('Backend directory does not exist:', cwd);
    return;
  }

  try {
    fs.writeFileSync(logFile, 'Starting backend...\n');
  } catch (e) {
    console.error('Could not write to log file:', e);
  }

  backendProcess = spawn(backendExecutable, args, {
    cwd: cwd,
    stdio: ['ignore', 'pipe', 'pipe']
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
