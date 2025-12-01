import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

function StatusFeed({ data, onOpenFile, onFileReverted }) {
    const [contextMenu, setContextMenu] = useState(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [filterText, setFilterText] = useState('')
    const [stagedFiles, setStagedFiles] = useState(new Set())
    const [discardingAll, setDiscardingAll] = useState(false)
    const [activeTab, setActiveTab] = useState('changes') // 'changes' or 'history'
    const [commits, setCommits] = useState([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const contextMenuRef = useRef(null)

    const parseStatus = (raw) => {
        if (!raw) return []
        return raw.split('\n').filter(line => line.trim()).map(line => {
            const code = line.slice(0, 2)
            let path = line.slice(3)
            // Remove quotes if present (git status quotes paths with spaces)
            if (path.startsWith('"') && path.endsWith('"')) {
                path = path.slice(1, -1)
            }
            // Determine if file is staged (first char is not space)
            const isStaged = code[0] !== ' ' && code[0] !== '?'
            // Get actual status (second char for unstaged, first char for staged)
            const status = isStaged ? code[0] : (code[1] || code[0])
            return { code, path, isStaged, status }
        })
    }

    const files = parseStatus(data.status)
    const filteredFiles = files.filter(file => 
        file.path.toLowerCase().includes(filterText.toLowerCase())
    )

    // Update staged files when status changes
    useEffect(() => {
        const newStaged = new Set()
        files.forEach(file => {
            if (file.isStaged) {
                newStaged.add(file.path)
            }
        })
        setStagedFiles(newStaged)
    }, [data.status])

    // Clean up selection when files change (e.g., files are removed)
    useEffect(() => {
        const filePaths = new Set(files.map(f => f.path))
        if (selectedFile && !filePaths.has(selectedFile)) {
            setSelectedFile(null)
        }
    }, [files, selectedFile])

    // Fetch commit history when History tab is active
    const fetchHistory = async () => {
        setLoadingHistory(true)
        try {
            const res = await axios.get(`${API_URL}/history?limit=100`)
            setCommits(res.data.commits || [])
        } catch (err) {
            console.error('Failed to fetch history:', err)
            setCommits([])
        } finally {
            setLoadingHistory(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory()
        }
    }, [activeTab])

    // Refresh history when files are reverted
    useEffect(() => {
        if (activeTab === 'history' && onFileReverted) {
            // Small delay to ensure git operations complete
            setTimeout(() => {
                fetchHistory()
            }, 500)
        }
    }, [data.status, activeTab])

    const getStatusIcon = (status, code) => {
        // Status icons like GitHub Desktop
        if (status === '?' || code.includes('?')) {
            // Untracked - green square with plus
            return (
                <div style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#238636',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                    +
                </div>
            )
        } else if (status === 'D' || code.includes('D')) {
            // Deleted - red square with minus
            return (
                <div style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#da3633',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                    −
                </div>
            )
        } else if (status === 'M' || code.includes('M')) {
            // Modified - yellow/orange square with dot
            return (
                <div style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#d29922',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                    •
                </div>
            )
        } else if (status === 'A' || code.includes('A')) {
            // Added - green square with plus
            return (
                <div style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#238636',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                    +
                </div>
            )
        }
        return null
    }

    const handleContextMenu = (e, file) => {
        e.preventDefault()
        e.stopPropagation()
        // Update selection to the right-clicked file if not already selected
        if (selectedFile !== file.path) {
            setSelectedFile(file.path)
        }
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            file: file
        })
    }

    const handleRevertFile = async () => {
        if (!contextMenu || !contextMenu.file) return

        const filePath = contextMenu.file.path
        setContextMenu(null)

        try {
            await axios.post(`${API_URL}/file/revert`, { path: filePath })
            if (onFileReverted) {
                onFileReverted()
            }
        } catch (err) {
            console.error('Failed to revert file:', err)
            alert(err.response?.data?.error || `Failed to revert '${filePath}'`)
        }
    }

    // Helper: Batch stage multiple files
    const stageFiles = async (filePaths) => {
        if (filePaths.length === 0) return
        try {
            await Promise.all(filePaths.map(path => 
                axios.post(`${API_URL}/file/stage`, { path })
            ))
            setStagedFiles(prev => {
                const newSet = new Set(prev)
                filePaths.forEach(path => newSet.add(path))
                return newSet
            })
            if (onFileReverted) {
                onFileReverted()
            }
        } catch (err) {
            console.error('Failed to stage files:', err)
            alert(err.response?.data?.error || `Failed to stage ${filePaths.length} file(s)`)
        }
    }

    // Helper: Batch unstage multiple files
    const unstageFiles = async (filePaths) => {
        if (filePaths.length === 0) return
        try {
            await Promise.all(filePaths.map(path => 
                axios.post(`${API_URL}/file/unstage`, { path })
            ))
            setStagedFiles(prev => {
                const newSet = new Set(prev)
                filePaths.forEach(path => newSet.delete(path))
                return newSet
            })
            if (onFileReverted) {
                onFileReverted()
            }
        } catch (err) {
            console.error('Failed to unstage files:', err)
            alert(err.response?.data?.error || `Failed to unstage ${filePaths.length} file(s)`)
        }
    }

    // Handle checkbox click: stage/unstage single file
    const handleToggleStage = async (e, file) => {
        e.stopPropagation()
        const isStaged = stagedFiles.has(file.path)
        
        try {
            if (isStaged) {
                await axios.post(`${API_URL}/file/unstage`, { path: file.path })
                setStagedFiles(prev => {
                    const newSet = new Set(prev)
                    newSet.delete(file.path)
                    return newSet
                })
            } else {
                await axios.post(`${API_URL}/file/stage`, { path: file.path })
                setStagedFiles(prev => new Set(prev).add(file.path))
            }
            if (onFileReverted) {
                onFileReverted()
            }
        } catch (err) {
            console.error('Failed to toggle stage:', err)
            alert(err.response?.data?.error || `Failed to ${isStaged ? 'unstage' : 'stage'} '${file.path}'`)
        }
    }

    const handleSelectAll = async (e) => {
        e.stopPropagation()
        const allStaged = filteredFiles.every(f => stagedFiles.has(f.path))
        const filePaths = filteredFiles.map(f => f.path)
        
        if (allStaged) {
            await unstageFiles(filePaths)
        } else {
            await stageFiles(filePaths)
        }
    }

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
                setContextMenu(null)
            }
        }

        if (contextMenu) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => {
                document.removeEventListener('mousedown', handleClickOutside)
            }
        }
    }, [contextMenu])

    const allFilteredStaged = filteredFiles.length > 0 && filteredFiles.every(f => stagedFiles.has(f.path))

    // Discard all file changes
    const handleDiscardAll = async () => {
        if (filteredFiles.length === 0) return
        
        const confirmMessage = `Are you sure you want to discard all changes to ${filteredFiles.length} file(s)? This action cannot be undone.`
        if (!confirm(confirmMessage)) return

        setDiscardingAll(true)
        try {
            // Use the batch revert endpoint to avoid Git index locking issues
            const filePaths = filteredFiles.map(file => file.path)
            const res = await axios.post(`${API_URL}/files/revert-all`, { paths: filePaths })
            
            // Check for any failures
            if (res.data.failed && res.data.failed.length > 0) {
                const failedFiles = res.data.failed.map(f => `${f.file} (${f.error})`).join('\n')
                alert(`Failed to discard changes for:\n${failedFiles}\n\n${res.data.succeeded.length} file(s) were successfully discarded.`)
            } else if (res.data.succeeded.length > 0) {
                // All succeeded
                // No alert needed for success
            }
            
            // Refresh status
            if (onFileReverted) {
                onFileReverted()
            }
        } catch (err) {
            console.error('Failed to discard all changes:', err)
            alert(err.response?.data?.error || 'Failed to discard all changes')
        } finally {
            // Always reset the discarding state
            setDiscardingAll(false)
        }
    }

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            background: '#0d1117',
            borderRight: '1px solid #30363d'
        }}>
            {/* Header with Tabs */}
            <div style={{ 
                borderBottom: '1px solid #30363d',
                display: 'flex',
                alignItems: 'center',
                padding: '0',
                background: '#161b22',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', gap: '0', flex: 1 }}>
                    <div 
                        onClick={() => setActiveTab('changes')}
                        style={{
                            padding: '12px 16px',
                            borderBottom: activeTab === 'changes' ? '2px solid #1f6feb' : '2px solid transparent',
                            color: activeTab === 'changes' ? '#c9d1d9' : '#8b949e',
                            cursor: 'pointer',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: 1,
                            justifyContent: 'center'
                        }}
                    >
                        Changes
                        {activeTab === 'changes' && files.length > 0 && (
                            <span style={{
                                backgroundColor: '#21262d',
                                color: '#8b949e',
                                padding: '2px 6px',
                                borderRadius: '12px',
                                fontSize: '0.85em',
                                fontWeight: 'normal'
                            }}>
                                {files.length}
                            </span>
                        )}
                    </div>
                    <div 
                        onClick={() => setActiveTab('history')}
                        style={{
                            padding: '12px 16px',
                            borderBottom: activeTab === 'history' ? '2px solid #1f6feb' : '2px solid transparent',
                            color: activeTab === 'history' ? '#c9d1d9' : '#8b949e',
                            cursor: 'pointer',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: 1,
                            justifyContent: 'center'
                        }}
                    >
                        History
                        {activeTab === 'history' && commits.length > 0 && (
                            <span style={{
                                backgroundColor: '#21262d',
                                color: '#8b949e',
                                padding: '2px 6px',
                                borderRadius: '12px',
                                fontSize: '0.85em',
                                fontWeight: 'normal'
                            }}>
                                {commits.length}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area - Changes or History */}
            {activeTab === 'changes' ? (
                <>
                    {/* Filter Bar */}
                    {files.length > 0 && (
                        <div style={{
                            padding: '8px 16px',
                            borderBottom: '1px solid #30363d',
                            background: '#161b22',
                            flexShrink: 0
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#0d1117',
                                border: '1px solid #30363d',
                                borderRadius: '6px',
                                padding: '6px 12px'
                            }}>
                                <span style={{ color: '#8b949e', fontSize: '0.9em' }}>🔍</span>
                                <input
                                    type="text"
                                    placeholder="Filter"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    style={{
                                        flex: 1,
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#c9d1d9',
                                        outline: 'none',
                                        fontSize: '0.9em'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* File List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>
                {filteredFiles.length > 0 ? (
                    <div>
                        {/* Select All Option and Discard All Button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                            <div
                                onClick={handleSelectAll}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderRadius: '6px',
                                    background: 'transparent',
                                    flex: 1
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={allFilteredStaged}
                                    onChange={handleSelectAll}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ color: '#8b949e', fontSize: '0.9em' }}>
                                    {filteredFiles.length} changed {filteredFiles.length === 1 ? 'file' : 'files'}
                                </span>
                            </div>
                            <button
                                onClick={handleDiscardAll}
                                disabled={discardingAll || filteredFiles.length === 0}
                                style={{
                                    padding: '6px 12px',
                                    background: discardingAll ? '#21262d' : '#da3633',
                                    border: '1px solid #30363d',
                                    borderRadius: '6px',
                                    color: '#ffffff',
                                    cursor: discardingAll ? 'not-allowed' : 'pointer',
                                    fontSize: '0.85em',
                                    fontWeight: '500',
                                    whiteSpace: 'nowrap',
                                    opacity: discardingAll ? 0.6 : 1
                                }}
                                title="Discard all changes"
                            >
                                {discardingAll ? 'Discarding...' : 'Discard All'}
                            </button>
                        </div>

                        {/* File Items */}
                        {filteredFiles.map((file, i) => {
                            const isSelected = selectedFile === file.path
                            const isStaged = stagedFiles.has(file.path)
                            
                            return (
                                <div
                                    key={i}
                                    onClick={() => {
                                        setSelectedFile(file.path)
                                        if (onOpenFile) onOpenFile(file.path)
                                    }}
                                    onContextMenu={(e) => handleContextMenu(e, file)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        borderRadius: '6px',
                                        background: isSelected ? '#1c2128' : 'transparent',
                                        border: isSelected ? '1px solid #30363d' : '1px solid transparent'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected) e.currentTarget.style.background = 'transparent'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isStaged}
                                        onChange={(e) => handleToggleStage(e, file)}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#c9d1d9' }}>
                                        {file.path}
                                    </span>
                                    {getStatusIcon(file.status, file.code)}
                                </div>
                            )
                        })}
                    </div>
                ) : files.length === 0 ? (
                    <div style={{ padding: '24px', color: '#8b949e', textAlign: 'center' }}>
                        No changes detected.
                    </div>
                ) : (
                    <div style={{ padding: '24px', color: '#8b949e', textAlign: 'center' }}>
                        No files match the filter.
                    </div>
                )}
                    </div>
                </>
            ) : (
                /* History Tab */
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>
                    {loadingHistory ? (
                        <div style={{ padding: '24px', color: '#8b949e', textAlign: 'center' }}>
                            Loading history...
                        </div>
                    ) : commits.length > 0 ? (
                        <div>
                            {commits.map((commit, i) => {
                                const date = new Date(commit.date)
                                const formattedDate = date.toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                                })
                                const formattedTime = date.toLocaleTimeString('en-US', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                })
                                
                                return (
                                    <div
                                        key={commit.hash}
                                        style={{
                                            padding: '12px',
                                            marginBottom: '8px',
                                            borderRadius: '6px',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid #30363d',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                        }}
                                    >
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'flex-start', 
                                            justifyContent: 'space-between',
                                            marginBottom: '4px'
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ 
                                                    color: '#c9d1d9', 
                                                    fontWeight: '500',
                                                    marginBottom: '4px',
                                                    fontSize: '0.95em'
                                                }}>
                                                    {commit.message}
                                                </div>
                                                {commit.body && (
                                                    <div style={{ 
                                                        color: '#8b949e', 
                                                        fontSize: '0.85em',
                                                        marginTop: '4px',
                                                        whiteSpace: 'pre-wrap',
                                                        maxHeight: '60px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        {commit.body}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '12px',
                                            marginTop: '8px',
                                            fontSize: '0.8em',
                                            color: '#8b949e'
                                        }}>
                                            <span style={{ 
                                                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                                                color: '#58a6ff'
                                            }}>
                                                {commit.shortHash}
                                            </span>
                                            <span>{commit.author}</span>
                                            <span>{formattedDate} {formattedTime}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '24px', color: '#8b949e', textAlign: 'center' }}>
                            No commit history found.
                        </div>
                    )}
                </div>
            )}

            {/* Gemini Analysis */}
            {data.summary && (
                <div style={{
                    borderTop: '1px solid #30363d',
                    padding: '16px',
                    background: '#0d1117',
                    flexShrink: 0
                }}>
                    <strong style={{ color: '#c9d1d9' }}>Gemini Analysis:</strong>
                    <p style={{ marginTop: '8px', color: '#8b949e', fontSize: '0.9em' }}>{data.summary}</p>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: '#161b22',
                        border: '1px solid #30363d',
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        zIndex: 10000,
                        minWidth: '180px',
                        padding: '4px 0'
                    }}
                >
                    <div
                        onClick={handleRevertFile}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            color: '#ff7b72',
                            fontSize: '0.9em'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#21262d'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        {contextMenu.file.code.includes('?') ? 'Delete File' : 'Discard Changes'}
                    </div>
                </div>
            )}
        </div>
    )
}

export default StatusFeed
