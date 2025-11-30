import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

function StatusFeed({ data, onOpenFile, onFileReverted }) {
    const [contextMenu, setContextMenu] = useState(null)
    // Multi-selection: Set of selected file paths
    const [selectedFiles, setSelectedFiles] = useState(new Set())
    // Anchor point for shift-click range selection
    const [selectionAnchor, setSelectionAnchor] = useState(null)
    // Track most recently focused file for onOpenFile callback
    const [lastFocusedFile, setLastFocusedFile] = useState(null)
    const [filterText, setFilterText] = useState('')
    const [stagedFiles, setStagedFiles] = useState(new Set())
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
        setSelectedFiles(prev => {
            const cleaned = new Set()
            prev.forEach(path => {
                if (filePaths.has(path)) {
                    cleaned.add(path)
                }
            })
            return cleaned
        })
        // If anchor is no longer in the list, reset it
        setSelectionAnchor(prev => {
            if (prev && !filePaths.has(prev)) {
                const filePathsArray = Array.from(filePaths)
                return filePathsArray.length > 0 ? filePathsArray[0] : null
            }
            return prev
        })
    }, [files])

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
        if (!selectedFiles.has(file.path)) {
            setSelectedFiles(new Set([file.path]))
            setSelectionAnchor(file.path)
            setLastFocusedFile(file.path)
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

    // Handle checkbox click: stage/unstage current selection (or clicked file if not selected)
    const handleToggleStage = async (e, file) => {
        e.stopPropagation()
        
        // Determine which files to operate on
        let filesToOperate
        if (selectedFiles.has(file.path)) {
            // Use current selection
            filesToOperate = Array.from(selectedFiles)
        } else {
            // Clicked file isn't selected, treat as single selection
            filesToOperate = [file.path]
        }
        
        // Determine if we're staging or unstaging based on the clicked file
        const isStaged = stagedFiles.has(file.path)
        
        if (isStaged) {
            await unstageFiles(filesToOperate)
        } else {
            await stageFiles(filesToOperate)
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

    // Handle file row click with multi-selection support
    const handleFileClick = (e, file, index) => {
        // Don't handle clicks on checkboxes (they have their own handler)
        if (e.target.type === 'checkbox') {
            return
        }

        const isCtrlOrCmd = e.ctrlKey || e.metaKey
        const isShift = e.shiftKey

        if (isShift && selectionAnchor !== null) {
            // Range selection: select from anchor to clicked file
            const anchorIndex = filteredFiles.findIndex(f => f.path === selectionAnchor)
            if (anchorIndex !== -1) {
                const start = Math.min(anchorIndex, index)
                const end = Math.max(anchorIndex, index)
                const rangeFiles = filteredFiles.slice(start, end + 1).map(f => f.path)
                
                setSelectedFiles(new Set(rangeFiles))
                // Update last focused to the clicked file
                setLastFocusedFile(file.path)
                if (onOpenFile) onOpenFile(file.path)
            }
        } else if (isCtrlOrCmd) {
            // Toggle individual file in selection
            const wasSelected = selectedFiles.has(file.path)
            setSelectedFiles(prev => {
                const newSet = new Set(prev)
                if (wasSelected) {
                    newSet.delete(file.path)
                    // If we removed the anchor, set a new one from remaining selection
                    if (selectionAnchor === file.path && newSet.size > 0) {
                        setSelectionAnchor(Array.from(newSet)[0])
                    } else if (newSet.size === 0) {
                        setSelectionAnchor(null)
                    }
                } else {
                    newSet.add(file.path)
                    setSelectionAnchor(file.path)
                }
                return newSet
            })
            // Only update focus and call onOpenFile when selecting (not deselecting)
            if (!wasSelected) {
                setLastFocusedFile(file.path)
                if (onOpenFile) onOpenFile(file.path)
            }
        } else {
            // Normal click: single selection
            setSelectedFiles(new Set([file.path]))
            setSelectionAnchor(file.path)
            setLastFocusedFile(file.path)
            if (onOpenFile) onOpenFile(file.path)
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
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '2px solid #1f6feb',
                        color: '#c9d1d9',
                        cursor: 'pointer',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flex: 1,
                        justifyContent: 'center'
                    }}>
                        Changes
                        {files.length > 0 && (
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
                    <div style={{
                        padding: '12px 16px',
                        color: '#8b949e',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flex: 1,
                        justifyContent: 'center'
                    }}>
                        History
                    </div>
                </div>
            </div>

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
                        {/* Select All Option */}
                        <div
                            onClick={handleSelectAll}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                marginBottom: '4px',
                                background: 'transparent'
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

                        {/* File Items */}
                        {filteredFiles.map((file, i) => {
                            const isSelected = selectedFiles.has(file.path)
                            const isStaged = stagedFiles.has(file.path)
                            
                            return (
                                <div
                                    key={i}
                                    onClick={(e) => handleFileClick(e, file, i)}
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
