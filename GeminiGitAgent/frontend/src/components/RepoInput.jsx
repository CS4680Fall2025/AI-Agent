import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

// API URL: Use environment variable or default to localhost for development
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

function RepoInput({ onSetRepo, currentPath, onReset, onUpdate }) {
    const [path, setPath] = useState('')
    const [presets, setPresets] = useState(() => {
        const saved = localStorage.getItem('repo_presets')
        return saved ? JSON.parse(saved) : []
    })
    const [expandedPresets, setExpandedPresets] = useState({})
    const [showPresets, setShowPresets] = useState(false)
    const [allRepos, setAllRepos] = useState([])
    const [reposByOrg, setReposByOrg] = useState({})
    const [loadingRepos, setLoadingRepos] = useState(false)
    const [showRepoList, setShowRepoList] = useState(false)
    const [expandedOrgs, setExpandedOrgs] = useState({})
    const [showSettings, setShowSettings] = useState(false)
    const [githubPath, setGithubPath] = useState('')
    const [loadingGithubPath, setLoadingGithubPath] = useState(false)
    const [savingGithubPath, setSavingGithubPath] = useState(false)
    const [githubToken, setGithubToken] = useState('')
    const [loadingGithubToken, setLoadingGithubToken] = useState(false)
    const [savingGithubToken, setSavingGithubToken] = useState(false)
    const [geminiKey, setGeminiKey] = useState('')
    const [loadingGeminiKey, setLoadingGeminiKey] = useState(false)
    const [savingGeminiKey, setSavingGeminiKey] = useState(false)
    const [geminiKeyIsSet, setGeminiKeyIsSet] = useState(false)

    const [showClonePanel, setShowClonePanel] = useState(false)
    const [githubRepos, setGithubRepos] = useState({})
    const [loadingGithubRepos, setLoadingGithubRepos] = useState(false)
    const [expandedGithubOrgs, setExpandedGithubOrgs] = useState({})
    const [cloningRepo, setCloningRepo] = useState(null)
    const folderInputRef = useRef(null)

    const fetchGithubToken = async () => {
        setLoadingGithubToken(true)
        try {
            const res = await axios.get(`${API_URL}/config/github-token`)
            setGithubToken(res.data.github_token || '')
        } catch (err) {
            console.error('Failed to fetch GitHub token:', err)
        } finally {
            setLoadingGithubToken(false)
        }
    }

    const saveGithubToken = async () => {
        setSavingGithubToken(true)
        try {
            await axios.post(`${API_URL}/config/github-token`, { github_token: githubToken })
            alert('GitHub token saved!')
        } catch (err) {
            console.error('Failed to save GitHub token:', err)
            alert(err.response?.data?.error || 'Failed to save GitHub token')
        } finally {
            setSavingGithubToken(false)
        }
    }

    const fetchGeminiKey = async () => {
        setLoadingGeminiKey(true)
        try {
            const res = await axios.get(`${API_URL}/config/gemini-key`)
            setGeminiKeyIsSet(res.data.is_set || false)
            // Don't set the actual key value for security (it's masked on backend)
            setGeminiKey('')
        } catch (err) {
            console.error('Failed to fetch Gemini key:', err)
        } finally {
            setLoadingGeminiKey(false)
        }
    }

    const saveGeminiKey = async () => {
        setSavingGeminiKey(true)
        try {
            await axios.post(`${API_URL}/config/gemini-key`, { gemini_key: geminiKey })
            setGeminiKeyIsSet(true)
            setGeminiKey('') // Clear input after saving
            alert('Gemini API key saved!')
        } catch (err) {
            console.error('Failed to save Gemini key:', err)
            alert(err.response?.data?.error || 'Failed to save Gemini API key')
        } finally {
            setSavingGeminiKey(false)
        }
    }



    const fetchGithubRepos = async () => {
        setLoadingGithubRepos(true)
        try {
            const res = await axios.get(`${API_URL}/github/repos`)
            setGithubRepos(res.data.repos || {})
            // Auto-expand all organizations
            const orgs = Object.keys(res.data.repos || {})
            const expanded = {}
            orgs.forEach(org => {
                expanded[org] = true
            })
            setExpandedGithubOrgs(expanded)
        } catch (err) {
            console.error('Failed to fetch GitHub repos:', err)
            alert(err.response?.data?.error || 'Failed to fetch GitHub repositories. Check your token.')
        } finally {
            setLoadingGithubRepos(false)
        }
    }

    const toggleGithubOrg = (org) => {
        setExpandedGithubOrgs(prev => ({
            ...prev,
            [org]: !prev[org]
        }))
    }

    const handleClone = async (repoUrl, repoName) => {
        if (!confirm(`Clone ${repoName} to ${githubPath}\\${repoName}?`)) {
            return
        }

        setCloningRepo(repoUrl)
        try {
            const res = await axios.post(`${API_URL}/github/clone`, {
                repo_url: repoUrl
            })
            alert(`Successfully cloned ${repoName}!`)
            // Refresh local repos
            fetchAllRepos()
            // Optionally set as active repo
            if (confirm(`Successfully cloned ${repoName}. Open it now?`)) {
                onSetRepo(res.data.path)
            }
        } catch (err) {
            console.error('Failed to clone repo:', err)
            alert(err.response?.data?.error || 'Failed to clone repository')
        } finally {
            setCloningRepo(null)
        }
    }

    const fetchGithubPath = async () => {
        setLoadingGithubPath(true)
        try {
            const res = await axios.get(`${API_URL}/config/github-path`)
            setGithubPath(res.data.github_path || '')
        } catch (err) {
            console.error('Failed to fetch GitHub path:', err)
        } finally {
            setLoadingGithubPath(false)
        }
    }

    const saveGithubPath = async () => {
        setSavingGithubPath(true)
        try {
            await axios.post(`${API_URL}/config/github-path`, { github_path: githubPath })
            // Refresh repo list after updating path
            if (showRepoList) {
                fetchAllRepos()
            }
        } catch (err) {
            console.error('Failed to save GitHub path:', err)
            alert(err.response?.data?.error || 'Failed to save GitHub path')
        } finally {
            setSavingGithubPath(false)
        }
    }

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
            // Check if we're in Electron
            if (typeof window !== 'undefined' && window.require) {
                const electron = window.require('electron')
                const selectedPath = await electron.ipcRenderer.invoke('select-dirs')
                if (selectedPath) {
                    setPath(selectedPath)
                }
            } else {
                // Browser: Try File System Access API first (Chrome, Edge, Opera)
                if ('showDirectoryPicker' in window) {
                    try {
                        const directoryHandle = await window.showDirectoryPicker()
                        const dirName = directoryHandle.name
                        
                        // Try to get more info by reading the directory
                        // Check if it's a git repository by looking for .git folder
                        let isGitRepo = false
                        try {
                            for await (const entry of directoryHandle.values()) {
                                if (entry.name === '.git' && entry.kind === 'directory') {
                                    isGitRepo = true
                                    break
                                }
                            }
                        } catch (e) {
                            // Can't read directory contents, that's okay
                        }
                        
                        // Show helpful message
                        const message = isGitRepo 
                            ? `Selected Git repository: ${dirName}\n\nPlease enter the full path to this repository in the input field above.\nExample: C:\\Users\\YourName\\Projects\\${dirName}`
                            : `Selected folder: ${dirName}\n\nPlease enter the full path to your repository in the input field above.\nExample: C:\\Users\\YourName\\Projects\\${dirName}`
                        
                        alert(message)
                        
                        // Store the directory name as a hint
                        // User will need to enter the full path manually
                        setPath('') // Clear to prompt user to enter full path
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            console.error('Directory picker error:', err)
                            // Fall back to hidden input method
                            folderInputRef.current?.click()
                        }
                    }
                } else {
                    // Fallback: Use hidden file input with webkitdirectory
                    folderInputRef.current?.click()
                }
            }
        } catch (err) {
            console.error('Failed to open directory dialog:', err)
            alert(`Failed to open directory browser: ${err.message}\n\nPlease enter the repository path manually in the text field above.`)
        }
    }

    const handleFolderInputChange = (e) => {
        const files = e.target.files
        if (files && files.length > 0) {
            // webkitdirectory gives relative paths, not absolute paths
            // We can't get the full file system path for security reasons
            const firstFile = files[0]
            const relativePath = firstFile.webkitRelativePath || ''
            
            // Extract the root directory name from the relative path
            // Format is usually "FolderName/subfolder/file.txt"
            const rootDir = relativePath.split('/')[0] || relativePath.split('\\')[0]
            
            // Check if .git folder is present (indicates it's a git repo)
            const hasGitFolder = Array.from(files).some(f => 
                f.webkitRelativePath.includes('.git/') || f.webkitRelativePath.includes('.git\\')
            )
            
            const message = hasGitFolder
                ? `Selected Git repository folder: ${rootDir}\n\nFound ${files.length} files in this repository.\n\nFor security reasons, browsers don't provide full file system paths.\nPlease enter the full repository path manually in the input field above.\nExample: C:\\Users\\YourName\\Projects\\${rootDir}`
                : `Selected folder: ${rootDir}\n\nFound ${files.length} files.\n\nFor security reasons, browsers don't provide full file system paths.\nPlease enter the full repository path manually in the input field above.\nExample: C:\\Users\\YourName\\Projects\\${rootDir}`
            
            alert(message)
            
            // Clear the input field to prompt user to enter full path
            setPath('')
        }
        // Reset input so same folder can be selected again
        e.target.value = ''
    }

    const getBasename = (fullPath) => {
        return fullPath.split(/[\\/]/).pop()
    }

    const getRepoName = (fullPath) => {
        // Extract just the repository name from the path
        return fullPath.split(/[\\/]/).pop() || fullPath
    }

    const fetchAllRepos = async () => {
        setLoadingRepos(true)
        try {
            const res = await axios.get(`${API_URL}/repos`)
            setAllRepos(res.data.repos || [])
            setReposByOrg(res.data.by_organization || {})
            // Auto-expand all organizations by default
            const orgs = Object.keys(res.data.by_organization || {})
            const expanded = {}
            orgs.forEach(org => {
                expanded[org] = true
            })
            setExpandedOrgs(expanded)
        } catch (err) {
            console.error('Failed to fetch repos:', err)
        } finally {
            setLoadingRepos(false)
        }
    }

    const toggleOrg = (org) => {
        setExpandedOrgs(prev => ({
            ...prev,
            [org]: !prev[org]
        }))
    }

    useEffect(() => {
        // Fetch repos when component mounts
        fetchAllRepos()
        // Fetch GitHub path config
        fetchGithubPath()
        // Fetch GitHub token
        fetchGithubToken()
        // Fetch Gemini key
        fetchGeminiKey()

    }, [])

    return (
        <div className="card" style={{
            flex: !currentPath ? 1 : undefined,
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 0
        }}>
            <div className="card-header">Repository Settings</div>
            <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {currentPath ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>Active Repository:</strong> {getRepoName(currentPath)}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={onUpdate} className="primary">Update</button>
                            <button onClick={onReset}>Change</button>
                        </div>
                    </div>
                ) : (
                    <div style={{
                        flex: 1,
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '20px'
                    }}>
                        <div style={{ fontSize: '1.2em', color: '#c9d1d9', marginBottom: '20px' }}>
                            Welcome to Gemini Git Agent
                        </div>
                        <form onSubmit={handleSubmit} className="input-group" style={{ width: '100%', maxWidth: '800px', display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                placeholder="Enter absolute path to repository..."
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    fontSize: '1.1em',
                                    background: '#0d1117',
                                    border: '1px solid #30363d',
                                    borderRadius: '6px',
                                    color: '#c9d1d9'
                                }}
                            />
                            <button 
                                type="button" 
                                onClick={handleBrowse} 
                                style={{ 
                                    padding: '0 20px', 
                                    fontSize: '1em',
                                    cursor: 'pointer',
                                    pointerEvents: 'auto',
                                    zIndex: 10,
                                    position: 'relative'
                                }}
                            >
                                Browse
                            </button>
                            <button type="submit" className="primary" style={{ padding: '0 24px', fontSize: '1em' }}>Set Repository</button>
                        </form>
                        <input
                            ref={folderInputRef}
                            type="file"
                            webkitdirectory=""
                            directory=""
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleFolderInputChange}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRepoList(!showRepoList)
                                    if (!showRepoList && allRepos.length === 0) {
                                        fetchAllRepos()
                                    }
                                    setShowClonePanel(false)
                                }}
                                style={{ flex: 1 }}
                            >
                                {showRepoList ? 'Hide Local Repos' : 'Local Repos'} {loadingRepos ? '...' : allRepos.length > 0 ? `(${allRepos.length})` : ''}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowClonePanel(!showClonePanel)
                                    if (!showClonePanel && Object.keys(githubRepos).length === 0) {
                                        fetchGithubRepos()
                                    }
                                    setShowRepoList(false)
                                }}
                                style={{ flex: 1 }}
                            >
                                {showClonePanel ? 'Hide GitHub' : 'Clone from GitHub'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPresets(!showPresets)}
                                style={{ flex: 1 }}
                            >
                                {showPresets ? 'Hide Saved' : 'Show Saved'} ({presets.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSettings(!showSettings)
                                    if (!showSettings) {
                                        fetchGithubPath()
                                        fetchGithubToken()
                                        fetchGeminiKey()
                                    }
                                }}
                                style={{ flex: 1 }}
                            >
                                {showSettings ? 'Hide Settings' : 'Settings'}
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

                        {/* Clone from GitHub Panel */}
                        {showClonePanel && (
                            <div style={{ marginTop: '10px', fontSize: '0.9em', width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <strong>GitHub Repositories:</strong>
                                    <button
                                        type="button"
                                        onClick={fetchGithubRepos}
                                        disabled={loadingGithubRepos}
                                        style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                    >
                                        {loadingGithubRepos ? 'Fetching...' : 'Refresh'}
                                    </button>
                                </div>
                                {loadingGithubRepos ? (
                                    <div style={{ padding: '12px', textAlign: 'center', color: '#8b949e' }}>Fetching repositories from GitHub...</div>
                                ) : Object.keys(githubRepos).length > 0 ? (
                                    <div style={{
                                        maxHeight: '400px',
                                        overflowY: 'auto',
                                        border: '1px solid #30363d',
                                        borderRadius: '6px',
                                        padding: '8px'
                                    }}>
                                        {Object.entries(githubRepos).map(([org, repos]) => (
                                            <div key={org} style={{ marginBottom: '12px' }}>
                                                {/* Organization Header */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '8px 12px',
                                                        background: 'rgba(255,255,255,0.08)',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        marginBottom: '4px',
                                                        border: '1px solid #30363d'
                                                    }}
                                                    onClick={() => toggleGithubOrg(org)}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            fontSize: '0.85em',
                                                            color: '#8b949e',
                                                            userSelect: 'none'
                                                        }}>
                                                            {expandedGithubOrgs[org] ? '▼' : '▶'}
                                                        </span>
                                                        <span style={{
                                                            fontWeight: '600',
                                                            color: '#c9d1d9',
                                                            fontSize: '0.95em'
                                                        }}>
                                                            {org}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.8em',
                                                            color: '#8b949e'
                                                        }}>
                                                            ({repos.length})
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Repositories in Organization */}
                                                {expandedGithubOrgs[org] && (
                                                    <div style={{ paddingLeft: '20px' }}>
                                                        {repos.map((repo, i) => (
                                                            <div
                                                                key={i}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    marginBottom: '2px',
                                                                    borderRadius: '4px',
                                                                    background: 'rgba(255,255,255,0.03)',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span style={{
                                                                        fontWeight: '400',
                                                                        color: '#c9d1d9',
                                                                        fontSize: '0.9em'
                                                                    }}>
                                                                        {repo.name}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.75em', color: '#8b949e' }}>
                                                                        {repo.private ? '🔒 Private' : 'Public'}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleClone(repo.clone_url, repo.name)}
                                                                    disabled={cloningRepo === repo.clone_url}
                                                                    style={{
                                                                        padding: '3px 10px',
                                                                        fontSize: '0.75em',
                                                                        cursor: 'pointer',
                                                                        backgroundColor: '#1f6feb',
                                                                        color: 'white',
                                                                        border: 'none',
                                                                        borderRadius: '4px',
                                                                        opacity: cloningRepo === repo.clone_url ? 0.7 : 1
                                                                    }}
                                                                >
                                                                    {cloningRepo === repo.clone_url ? 'Cloning...' : 'Clone'}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '12px', textAlign: 'center', color: '#8b949e' }}>
                                        No repositories found. Check your token and connection.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* All Repositories List */}
                        {showRepoList && (
                            <div style={{ marginTop: '10px', fontSize: '0.9em', width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <strong>All Repositories:</strong>
                                    <button
                                        type="button"
                                        onClick={fetchAllRepos}
                                        disabled={loadingRepos}
                                        style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                    >
                                        {loadingRepos ? 'Scanning...' : 'Refresh'}
                                    </button>
                                </div>
                                {loadingRepos ? (
                                    <div style={{ padding: '12px', textAlign: 'center', color: '#8b949e' }}>Scanning for repositories...</div>
                                ) : Object.keys(reposByOrg).length > 0 ? (
                                    <div style={{
                                        maxHeight: '70vh',
                                        overflowY: 'auto',
                                        border: '1px solid #30363d',
                                        borderRadius: '6px',
                                        padding: '8px'
                                    }}>
                                        {Object.entries(reposByOrg).map(([org, repos]) => (
                                            <div key={org} style={{ marginBottom: '12px' }}>
                                                {/* Organization Header */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '8px 12px',
                                                        background: 'rgba(255,255,255,0.08)',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        marginBottom: '4px',
                                                        border: '1px solid #30363d'
                                                    }}
                                                    onClick={() => toggleOrg(org)}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            fontSize: '0.85em',
                                                            color: '#8b949e',
                                                            userSelect: 'none'
                                                        }}>
                                                            {expandedOrgs[org] ? '▼' : '▶'}
                                                        </span>
                                                        <span style={{
                                                            fontWeight: '600',
                                                            color: '#c9d1d9',
                                                            fontSize: '0.95em'
                                                        }}>
                                                            {org}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.8em',
                                                            color: '#8b949e'
                                                        }}>
                                                            ({repos.length})
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Repositories in Organization */}
                                                {expandedOrgs[org] && (
                                                    <div style={{ paddingLeft: '20px' }}>
                                                        {repos.map((repo, i) => (
                                                            <div
                                                                key={i}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    marginBottom: '2px',
                                                                    borderRadius: '4px',
                                                                    background: 'rgba(255,255,255,0.03)',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    cursor: 'pointer'
                                                                }}
                                                                onClick={() => onSetRepo(repo.path)}
                                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                            >
                                                                <span style={{
                                                                    fontWeight: '400',
                                                                    color: '#c9d1d9',
                                                                    fontSize: '0.9em'
                                                                }}>
                                                                    {repo.name}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        onSetRepo(repo.path)
                                                                    }}
                                                                    style={{
                                                                        padding: '3px 10px',
                                                                        fontSize: '0.75em',
                                                                        cursor: 'pointer',
                                                                        backgroundColor: '#238636',
                                                                        color: 'white',
                                                                        border: 'none',
                                                                        borderRadius: '4px'
                                                                    }}
                                                                >
                                                                    Select
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '12px', textAlign: 'center', color: '#8b949e' }}>
                                        No repositories found. Try scanning common directories.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Settings Panel */}
                        {showSettings && (
                            <div style={{ marginTop: '10px', fontSize: '0.9em', width: '100%' }}>
                                <div style={{
                                    padding: '12px',
                                    border: '1px solid #30363d',
                                    borderRadius: '6px',
                                    background: 'rgba(255,255,255,0.03)'
                                }}>
                                    <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
                                        Configuration
                                    </div>
                                    <div style={{ marginBottom: '8px', fontSize: '0.85em', color: '#8b949e' }}>
                                        Set the path where your GitHub repositories are located. This path will be scanned first when searching for repositories.
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="e.g., A:\Github or C:\Users\YourName\Documents\GitHub"
                                            value={githubPath}
                                            onChange={(e) => setGithubPath(e.target.value)}
                                            style={{
                                                flex: 1,
                                                padding: '6px 12px',
                                                background: '#0d1117',
                                                border: '1px solid #30363d',
                                                borderRadius: '4px',
                                                color: '#c9d1d9',
                                                fontSize: '0.9em'
                                            }}
                                            disabled={loadingGithubPath || savingGithubPath}
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const electron = window.require('electron')
                                                    const selectedPath = await electron.ipcRenderer.invoke('select-dirs')
                                                    if (selectedPath) {
                                                        setGithubPath(selectedPath)
                                                    }
                                                } catch (err) {
                                                    console.error('Failed to open directory dialog:', err)
                                                }
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '0.9em',
                                                cursor: 'pointer',
                                                background: '#21262d',
                                                border: '1px solid #30363d',
                                                borderRadius: '4px',
                                                color: '#c9d1d9'
                                            }}
                                            disabled={loadingGithubPath || savingGithubPath}
                                        >
                                            Browse
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveGithubPath}
                                            disabled={loadingGithubPath || savingGithubPath || !githubPath.trim()}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '0.9em',
                                                cursor: 'pointer',
                                                background: '#238636',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: 'white'
                                            }}
                                        >
                                            {savingGithubPath ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                    {githubPath && (
                                        <div style={{ fontSize: '0.85em', color: '#8b949e', marginTop: '8px' }}>
                                            Current: <span style={{ color: '#c9d1d9' }}>{githubPath}</span>
                                        </div>
                                    )}
                                    {loadingGithubPath && (
                                        <div style={{ fontSize: '0.85em', color: '#8b949e', marginTop: '8px' }}>
                                            Loading...
                                        </div>
                                    )}

                                    {/* GitHub Token */}
                                    <div style={{ marginTop: '16px', borderTop: '1px solid #30363d', paddingTop: '16px' }}>
                                        <div style={{ marginBottom: '4px', fontSize: '0.85em', color: '#c9d1d9', fontWeight: '600' }}>
                                            GitHub Personal Access Token
                                        </div>
                                        <div style={{ marginBottom: '8px', fontSize: '0.8em', color: '#8b949e' }}>
                                            Required for fetching private repos and higher rate limits.
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="password"
                                                value={githubToken}
                                                onChange={(e) => setGithubToken(e.target.value)}
                                                placeholder={githubToken ? '••••••••' : 'Enter GitHub token'}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px 12px',
                                                    background: '#0d1117',
                                                    border: '1px solid #30363d',
                                                    borderRadius: '4px',
                                                    color: '#c9d1d9',
                                                    fontSize: '0.9em'
                                                }}
                                                disabled={loadingGithubToken || savingGithubToken}
                                            />
                                            <button
                                                type="button"
                                                onClick={saveGithubToken}
                                                disabled={loadingGithubToken || savingGithubToken || !githubToken.trim()}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '0.9em',
                                                    cursor: 'pointer',
                                                    background: '#238636',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: 'white'
                                                }}
                                            >
                                                {savingGithubToken ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Gemini API Key */}
                                    <div style={{ marginTop: '16px', borderTop: '1px solid #30363d', paddingTop: '16px' }}>
                                        <div style={{ marginBottom: '4px', fontSize: '0.85em', color: '#c9d1d9', fontWeight: '600' }}>
                                            Gemini API Key
                                        </div>
                                        <div style={{ marginBottom: '8px', fontSize: '0.8em', color: '#8b949e' }}>
                                            Required for AI features. Get your key from{' '}
                                            <a 
                                                href="https://aistudio.google.com/apikey" 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{ color: '#58a6ff', textDecoration: 'none' }}
                                                onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                                                onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                                            >
                                                Google AI Studio
                                            </a>
                                            {geminiKeyIsSet && (
                                                <span style={{ marginLeft: '8px', color: '#3fb950' }}>
                                                    ✓ Key is set
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="password"
                                                value={geminiKey}
                                                onChange={(e) => setGeminiKey(e.target.value)}
                                                placeholder={geminiKeyIsSet ? 'Enter new key to update' : 'Enter Gemini API key'}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px 12px',
                                                    background: '#0d1117',
                                                    border: '1px solid #30363d',
                                                    borderRadius: '4px',
                                                    color: '#c9d1d9',
                                                    fontSize: '0.9em'
                                                }}
                                                disabled={loadingGeminiKey || savingGeminiKey}
                                            />
                                            <button
                                                type="button"
                                                onClick={saveGeminiKey}
                                                disabled={loadingGeminiKey || savingGeminiKey || !geminiKey.trim()}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '0.9em',
                                                    cursor: 'pointer',
                                                    background: '#238636',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: 'white'
                                                }}
                                            >
                                                {savingGeminiKey ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>


                                </div>
                            </div>
                        )}

                        {/* Saved Presets */}
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
                )
                }
            </div >
        </div >
    )
}

export default RepoInput
