# Building Gemini Git Agent EXE

This guide walks you through building the complete application into a distributable EXE file.

## Prerequisites

1. **Python 3.8+** with pip
2. **Node.js 16+** with npm
3. **PyInstaller** (will be installed if needed)
4. **Git** (for the application to work)

## Build Process Overview

The build process has two main steps:
1. **Backend**: Build Python server into `gemini-git-agent-server.exe`
2. **Frontend**: Build Electron app that packages the backend EXE

---

## Step 1: Build the Backend EXE

### 1.1 Install Python Dependencies

```bash
cd GeminiGitAgent/backend
pip install -r requirements.txt
pip install pyinstaller
```

### 1.2 Update PyInstaller Spec (if needed)

The spec file should include:
- GitHelper module (from `../../GitHelper`)
- Config directory (for `app_config.json`)
- All required Python packages

The spec file is located at: `GeminiGitAgent/backend/gemini-git-agent-server.spec`

### 1.3 Build the Backend EXE

```bash
cd GeminiGitAgent/backend
pyinstaller gemini-git-agent-server.spec
```

This will create:
- `dist/gemini-git-agent-server.exe` - The final executable
- `build/` - Temporary build files (can be deleted)

### 1.4 Copy EXE to Frontend

The Electron build process expects the backend EXE in a specific location:

```bash
# From GeminiGitAgent/backend directory
copy dist\gemini-git-agent-server.exe ..\frontend\backend-dist\gemini-git-agent-server.exe
```

Or manually copy:
- **From**: `GeminiGitAgent/backend/dist/gemini-git-agent-server.exe`
- **To**: `GeminiGitAgent/frontend/backend-dist/gemini-git-agent-server.exe`

---

## Step 2: Build the Frontend & Package Everything

### 2.1 Install Node Dependencies

```bash
cd GeminiGitAgent/frontend
npm install
```

### 2.2 Build Frontend Assets

```bash
npm run build
```

This creates the production-ready frontend in `dist/` directory.

### 2.3 Package with Electron Builder

```bash
npm run dist
```

This will:
1. Build the frontend (if not already done)
2. Package everything with Electron Builder
3. Create installer in `release/` directory

**Output location**: `GeminiGitAgent/frontend/release/`

You'll find:
- `Gemini Git Agent Setup X.X.X.exe` - Windows installer
- `win-unpacked/` - Unpacked application files

---

## Quick Build Script (Windows)

A build script is provided to automate the entire process:

**From the `GeminiGitAgent/` directory:**
```batch
build_exe.bat
```

This script will:
1. Install Python dependencies
2. Build the backend EXE with PyInstaller
3. Copy the EXE to the frontend directory
4. Build the frontend assets
5. Package everything with Electron Builder

**Output**: `frontend/release/Gemini Git Agent Setup X.X.X.exe`

---

## Troubleshooting

### Backend EXE Issues

**Problem**: EXE can't find GitHelper module
- **Solution**: Update the spec file to include the GitHelper path in `pathex`

**Problem**: EXE can't find config file
- **Solution**: Ensure config directory is included in `datas` in the spec file

**Problem**: Missing dependencies
- **Solution**: Run `pip install -r requirements.txt` again

### Frontend Build Issues

**Problem**: Backend EXE not found during electron build
- **Solution**: Ensure `backend-dist/gemini-git-agent-server.exe` exists before running `npm run dist`

**Problem**: Electron builder fails
- **Solution**: Check that all Node dependencies are installed: `npm install`

---

## File Structure After Build

```
GeminiGitAgent/
├── backend/
│   ├── dist/
│   │   └── gemini-git-agent-server.exe  ← Backend EXE
│   └── build/  ← Can be deleted
│
└── frontend/
    ├── backend-dist/
    │   └── gemini-git-agent-server.exe  ← Copy of backend EXE
    ├── dist/  ← Frontend build
    └── release/  ← Final installer
        ├── Gemini Git Agent Setup X.X.X.exe
        └── win-unpacked/
```

---

## Testing the Build

1. **Test Backend EXE directly**:
   ```bash
   cd GeminiGitAgent/backend/dist
   gemini-git-agent-server.exe
   ```
   Should start Flask server on port 5000

2. **Test Full Application**:
   - Run the installer from `frontend/release/`
   - Or run from `frontend/release/win-unpacked/Gemini Git Agent.exe`

---

## Notes

- The backend EXE includes all Python dependencies, so it's a standalone executable
- The config file (`app_config.json`) is created at runtime in the user's app data directory
- Users can configure their API key through the Settings UI in the application
- The build process creates a single installer that includes both frontend and backend

