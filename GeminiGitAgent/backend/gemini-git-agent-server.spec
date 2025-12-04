# -*- mode: python ; coding: utf-8 -*-
import os

# Get the directory of this spec file
spec_dir = os.path.dirname(os.path.abspath(SPEC))

# Paths for GitHelper and config
githelper_path = os.path.normpath(os.path.join(spec_dir, '../../GitHelper'))
config_path = os.path.normpath(os.path.join(spec_dir, '../config'))

a = Analysis(
    ['server.py'],
    pathex=[
        githelper_path,  # Add GitHelper to Python path
    ],
    binaries=[],
    datas=[
        # Include config directory if it exists (for app_config.json template)
        (config_path, 'config') if os.path.exists(config_path) else None,
    ],
    hiddenimports=[
        'git_helper',
        'watcher',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

# Filter out None entries from datas
a.datas = [d for d in a.datas if d is not None]
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='gemini-git-agent-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
