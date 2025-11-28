import { useState } from 'react'

function RepoInput({ onSetRepo, currentPath, onReset, onUpdate }) {
    const [path, setPath] = useState('')
    const [presets, setPresets] = useState(() => {
        const saved = localStorage.getItem('repo_presets')
        return saved ? JSON.parse(saved) : []
    })
    const [expandedPresets, setExpandedPresets] = useState({})
    const [showPresets, setShowPresets] = useState(false)

    const savePreset = (newPath) => {
        const pathToSave = newPath || path
        if (pathToSave && !presets.includes(pathToSave)) {
            const newPresets = [...presets, pathToSave]
            setPresets(newPresets)
            localStorage.setItem('repo_presets', JSON.stringify(newPresets))
        }
    }

    const deletePreset = (presetToDelete) => {
        const newPresets = presets.filter(p => p !== presetToDelete)
        setPresets(newPresets)
        localStorage.setItem('repo_presets', JSON.stringify(newPresets))
    }

    const toggleDetails = (preset) => {
        setExpandedPresets(prev => ({
            ...prev,
            [preset]: !prev[preset]
        }))
    }

    const handlePresetChange = (e) => {
        const val = e.target.value
        if (val) {
            setPath(val)
        }
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (path) {
            onSetRepo(path)
            savePreset(path)
        }
    }

    const handleBrowse = async () => {
        try {
            // We use window.require to access electron in the renderer process
            // when nodeIntegration is enabled
            const electron = window.require('electron')
            const selectedPath = await electron.ipcRenderer.invoke('select-dirs')
            if (selectedPath) {
                setPath(selectedPath)
            }
        } catch (err) {
            console.error('Failed to open directory dialog:', err)
        }
    }

    const getBasename = (fullPath) => {
        return fullPath.split(/[\\/]/).pop()
    }

    return (
        <div className="card">
            <div className="card-header">Repository Settings</div>
            <div className="card-body">
                {currentPath ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>Active Repository:</strong> {currentPath}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={onUpdate} className="primary">Update Status</button>
                            <button onClick={onReset}>Change Repo</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <form onSubmit={handleSubmit} className="input-group" style={{ marginBottom: '1rem' }}>
                            <input
                                type="text"
                                placeholder="Enter absolute path to repository..."
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button type="button" onClick={handleBrowse} style={{ marginRight: '8px' }}>Browse</button>
                            <button type="submit" className="primary">Set Repository</button>
                        </form>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setShowPresets(!showPresets)}
                                style={{ flex: 1 }}
                            >
                                {showPresets ? 'Hide Saved' : 'Show Saved'} ({presets.length})
                            </button>

                            {showPresets && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => savePreset()}
                                        disabled={!path || presets.includes(path)}
                                        title="Save current path as preset"
                                    >
                                        Save Preset
                                    </button>
                                    {presets.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (confirm('Clear all presets?')) {
                                                    setPresets([])
                                                    localStorage.removeItem('repo_presets')
                                                }
                                            }}
                                            style={{ backgroundColor: '#ff4444' }}
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </>
                            )}
                        </div>

                        {showPresets && presets.length > 0 && (
                            <div style={{ marginTop: '10px', fontSize: '0.9em' }}>
                                <strong>Saved:</strong>
                                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                    {presets.map((p, i) => (
                                        <li key={i} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold', marginRight: '8px' }}>
                                                {getBasename(p)}
                                            </span>

                                            <button
                                                onClick={() => onSetRepo(p)}
                                                style={{
                                                    marginRight: '5px',
                                                    padding: '2px 8px',
                                                    fontSize: '0.8em',
                                                    cursor: 'pointer',
                                                    backgroundColor: '#4CAF50',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px'
                                                }}
                                            >
                                                Set
                                            </button>

                                            <button
                                                onClick={() => toggleDetails(p)}
                                                style={{
                                                    marginRight: '5px',
                                                    padding: '2px 6px',
                                                    fontSize: '0.8em',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {expandedPresets[p] ? 'Hide Details' : 'Details'}
                                            </button>

                                            <button
                                                onClick={() => deletePreset(p)}
                                                style={{
                                                    padding: '2px 6px',
                                                    fontSize: '0.8em',
                                                    backgroundColor: '#ff4444',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ×
                                            </button>

                                            {expandedPresets[p] && (
                                                <div style={{ width: '100%', marginTop: '4px', fontSize: '0.85em', color: '#888', wordBreak: 'break-all' }}>
                                                    {p}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default RepoInput
