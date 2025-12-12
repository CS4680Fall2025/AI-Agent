import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

function DiffViewer({ filePath, onClose }) {
    const [diff, setDiff] = useState('')
    const [fileContent, setFileContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [isNewFile, setIsNewFile] = useState(false)
    const [isDeleted, setIsDeleted] = useState(false)

    useEffect(() => {
        if (filePath) {
            // Load file content first, then diff
            // This ensures we have content even if diff fails
            const loadData = async () => {
                await loadFileContent()
                loadDiff()
            }
            loadData()
        }
    }, [filePath])

    const loadFileContent = async () => {
        try {
            const res = await axios.get(`${API_URL}/file`, { params: { path: filePath } })
            setFileContent(res.data.content || '')
            return true
        } catch (err) {
            // File might not exist (deleted), that's okay
            console.error('Failed to load file content:', err)
            setFileContent('')
            return false
        }
    }

    const loadDiff = async () => {
        setLoading(true)
        setError(null)
        setIsNewFile(false)
        setIsDeleted(false)
        try {
            const res = await axios.get(`${API_URL}/diff`, { params: { path: filePath } })
            const diffText = res.data.diff || ''
            const isUntracked = res.data.is_untracked || false
            const isDeletedFile = res.data.is_deleted || false
            const fileStatus = res.data.file_status || ''
            
            setIsDeleted(isDeletedFile)
            
            // Only show as new file if it's actually untracked or new
            if (isUntracked || fileStatus === 'new' || fileStatus === 'untracked') {
                setIsNewFile(true)
                setDiff('')
            } else if (isDeletedFile) {
                // For deleted files, show the diff (which will show removed content)
                setDiff(diffText)
                setIsNewFile(false)
            } else if (diffText) {
                setDiff(diffText)
                setIsNewFile(false)
            } else {
                // No diff available, might be a file with no changes or empty
                setDiff('')
                setIsNewFile(false)
            }
        } catch (err) {
            console.error('Failed to load diff:', err)
            // If diff fails, try to show file content if available
            // This handles cases where the file exists but diff can't be generated
            if (fileContent) {
                // File exists, show it as content (might be a new file or unmodified)
                setIsNewFile(true)
                setError(null)
            } else if (err.response?.status === 404) {
                // File doesn't exist, might be deleted
                setIsDeleted(true)
                setError(null)
            } else {
                // Other error, but try to show file content if we have it
                if (fileContent) {
                    setIsNewFile(true)
                    setError(null)
                } else {
                    setError(err.response?.data?.error || 'Failed to load diff')
                }
            }
        } finally {
            setLoading(false)
        }
    }

    const parseDiff = (diffText) => {
        if (!diffText) return []
        
        const lines = diffText.split('\n')
        const result = []
        let currentHunk = null
        let oldLineNum = 0
        let newLineNum = 0
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            
            // Header lines (ignore but keep for context)
            if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                continue
            }
            
            // Hunk header: @@ -old_start,old_count +new_start,new_count @@
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
                if (match) {
                    oldLineNum = parseInt(match[1]) || 0
                    newLineNum = parseInt(match[3]) || 0
                    currentHunk = {
                        oldStart: oldLineNum,
                        newStart: newLineNum,
                        lines: []
                    }
                    result.push(currentHunk)
                }
                continue
            }
            
            if (currentHunk) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    // Added line (green)
                    currentHunk.lines.push({
                        type: 'added',
                        content: line.substring(1),
                        oldLineNum: null,
                        newLineNum: newLineNum++
                    })
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    // Removed line (red)
                    currentHunk.lines.push({
                        type: 'removed',
                        content: line.substring(1),
                        oldLineNum: oldLineNum++,
                        newLineNum: null
                    })
                } else if (line.startsWith(' ')) {
                    // Context line (unchanged)
                    currentHunk.lines.push({
                        type: 'context',
                        content: line.substring(1),
                        oldLineNum: oldLineNum++,
                        newLineNum: newLineNum++
                    })
                } else if (line.startsWith('\\')) {
                    // No newline at end of file marker
                    currentHunk.lines.push({
                        type: 'marker',
                        content: line
                    })
                }
            }
        }
        
        return result
    }

    const renderNewFile = () => {
        if (!fileContent && !loading) {
            return (
                <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>
                    Empty file
                </div>
            )
        }
        
        const lines = fileContent.split('\n')
        return (
            <div style={{ 
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                fontSize: '13px',
                lineHeight: '1.5'
            }}>
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(46, 160, 67, 0.1)',
                    borderLeft: '2px solid #238636',
                    color: '#56d364',
                    marginBottom: '8px'
                }}>
                    New file
                </div>
                {lines.length === 0 ? (
                    <div style={{ padding: '8px 12px', color: '#8b949e' }}>Empty file</div>
                ) : (
                    lines.map((line, idx) => (
                        <div
                            key={idx}
                            style={{
                                display: 'flex',
                                backgroundColor: 'rgba(46, 160, 67, 0.15)',
                                color: '#c9d1d9',
                                borderLeft: '2px solid #238636',
                                padding: '2px 12px',
                                minHeight: '20px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}
                        >
                            <div style={{
                                minWidth: '60px',
                                textAlign: 'right',
                                color: '#6e7681',
                                userSelect: 'none',
                                flexShrink: 0
                            }}>
                                {idx + 1}
                            </div>
                            <div style={{ flex: 1, marginLeft: '16px', color: '#c9d1d9' }}>
                                <span style={{ color: '#56d364', marginRight: '4px' }}>+</span>
                                {line || ' '}
                            </div>
                        </div>
                    ))
                )}
            </div>
        )
    }

    const renderDiff = () => {
        if (loading) {
            return <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>Loading diff...</div>
        }
        
        if (error) {
            return <div style={{ padding: '20px', textAlign: 'center', color: '#f85149' }}>{error}</div>
        }
        
        // Show new file content if it's a new/untracked file (not deleted)
        if (isNewFile && !isDeleted) {
            return renderNewFile()
        }
        
        // Show deleted file indicator
        if (isDeleted && !diff) {
            return (
                <div style={{ padding: '20px', textAlign: 'center', color: '#f85149' }}>
                    File has been deleted
                </div>
            )
        }
        
        if (!diff && !isNewFile && !isDeleted) {
            // If we have file content but no diff, show the file content
            if (fileContent) {
                const lines = fileContent.split('\n')
                return (
                    <div style={{ 
                        fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                        fontSize: '13px',
                        lineHeight: '1.5'
                    }}>
                        {lines.map((line, idx) => (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex',
                                    padding: '2px 12px',
                                    minHeight: '20px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    color: '#c9d1d9'
                                }}
                            >
                                <div style={{
                                    minWidth: '60px',
                                    textAlign: 'right',
                                    color: '#6e7681',
                                    userSelect: 'none',
                                    flexShrink: 0
                                }}>
                                    {idx + 1}
                                </div>
                                <div style={{ flex: 1, marginLeft: '16px' }}>
                                    {line || ' '}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }
            return <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>No changes detected</div>
        }
        
        const hunks = parseDiff(diff)
        
        if (hunks.length === 0) {
            return <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>No changes to display</div>
        }
        
        return (
            <div style={{ 
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                fontSize: '13px',
                lineHeight: '1.5'
            }}>
                {hunks.map((hunk, hunkIdx) => (
                    <div key={hunkIdx} style={{ marginBottom: '16px' }}>
                        {hunk.lines.map((line, lineIdx) => {
                            let bgColor = 'transparent'
                            let textColor = '#c9d1d9'
                            let borderLeft = 'none'
                            
                            if (line.type === 'added') {
                                bgColor = 'rgba(46, 160, 67, 0.15)'
                                textColor = '#56d364'
                                borderLeft = '2px solid #238636'
                            } else if (line.type === 'removed') {
                                bgColor = 'rgba(248, 81, 73, 0.15)'
                                textColor = '#f85149'
                                borderLeft = '2px solid #da3633'
                            } else if (line.type === 'context') {
                                textColor = '#8b949e'
                            } else if (line.type === 'marker') {
                                textColor = '#6e7681'
                            }
                            
                            return (
                                <div
                                    key={lineIdx}
                                    style={{
                                        display: 'flex',
                                        backgroundColor: bgColor,
                                        color: textColor,
                                        borderLeft: borderLeft,
                                        padding: '2px 12px',
                                        minHeight: '20px',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        width: '100%',
                                        gap: '16px'
                                    }}>
                                        <div style={{
                                            minWidth: '60px',
                                            textAlign: 'right',
                                            color: '#6e7681',
                                            userSelect: 'none',
                                            flexShrink: 0
                                        }}>
                                            {line.oldLineNum !== null ? line.oldLineNum : ''}
                                        </div>
                                        <div style={{
                                            minWidth: '60px',
                                            textAlign: 'right',
                                            color: '#6e7681',
                                            userSelect: 'none',
                                            flexShrink: 0
                                        }}>
                                            {line.newLineNum !== null ? line.newLineNum : ''}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            {line.type === 'added' && '+'}
                                            {line.type === 'removed' && '-'}
                                            {line.type === 'context' && ' '}
                                            {line.content}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        )
    }

    if (!filePath) return null

    return (
        <div style={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '6px',
            overflow: 'hidden'
        }}>
            <div style={{ 
                padding: '12px 16px',
                borderBottom: '1px solid #30363d',
                background: '#161b22',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ 
                    fontWeight: '600', 
                    color: '#c9d1d9',
                    fontSize: '0.95em'
                }}>
                    {filePath}
                </div>
                {onClose && (
                    <button 
                        onClick={onClose}
                        style={{
                            padding: '4px 12px',
                            background: '#21262d',
                            border: '1px solid #30363d',
                            borderRadius: '4px',
                            color: '#c9d1d9',
                            cursor: 'pointer',
                            fontSize: '0.85em'
                        }}
                    >
                        Close
                    </button>
                )}
            </div>
            <div style={{ 
                flex: 1, 
                overflow: 'auto',
                padding: '8px 0'
            }}>
                {renderDiff()}
            </div>
        </div>
    )
}

export default DiffViewer

