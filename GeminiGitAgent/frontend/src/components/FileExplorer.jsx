import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

// Helper to build tree from paths
const buildTree = (paths) => {
    const tree = {}
    paths.forEach(path => {
        const parts = path.split(/[/\\]/) // Handle both slash types
        let current = tree
        parts.forEach((part, i) => {
            if (!current[part]) {
                current[part] = i === parts.length - 1 ? null : {}
            }
            current = current[part]
        })
    })
    return tree
}

const FileTreeNode = ({ name, node, path, onSelectFile, depth = 0, selectedFiles, onToggleSelect }) => {
    const [expanded, setExpanded] = useState(true)
    const isFolder = node !== null
    const fullPath = path ? `${path}/${name}` : name
    const isSelected = selectedFiles.has(fullPath)

    if (!isFolder) {
        return (
            <div
                className="file-item"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 0',
                    paddingLeft: `${depth * 16 + 4}px`,
                    fontSize: '0.9em',
                    color: '#e0e0e0',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#2c313a' : 'transparent'
                }}
            >
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onToggleSelect(fullPath, e.target.checked)}
                    style={{ marginRight: '8px' }}
                    onClick={(e) => e.stopPropagation()}
                />
                <span onClick={() => onSelectFile(fullPath)} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📄 {name}
                </span>
            </div>
        )
    }

    return (
        <div>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    cursor: 'pointer',
                    padding: '4px 0',
                    paddingLeft: `${depth * 16 + 4}px`,
                    fontWeight: 'bold',
                    color: '#a0a0a0',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}
            >
                {expanded ? '📂' : '📁'} {name}
            </div>
            {expanded && Object.keys(node).sort().map(childName => (
                <FileTreeNode
                    key={childName}
                    name={childName}
                    node={node[childName]}
                    path={fullPath}
                    onSelectFile={onSelectFile}
                    depth={depth + 1}
                    selectedFiles={selectedFiles}
                    onToggleSelect={onToggleSelect}
                />
            ))}
        </div>
    )
}

function FileExplorer({ repoPath, onSelectFile, refreshTrigger }) {
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedFiles, setSelectedFiles] = useState(new Set())
    const [contextMenu, setContextMenu] = useState(null)

    const fetchFiles = useCallback(async () => {
        setLoading(true)
        try {
            const res = await axios.get(`${API_URL}/files`)
            setFiles(res.data.files)
            setError(null)
            setSelectedFiles(new Set()) // Reset selection on refresh
        } catch (err) {
            setError('Failed to load files')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (repoPath) {
            fetchFiles()
        }
    }, [repoPath, fetchFiles])

    useEffect(() => {
        if (repoPath && refreshTrigger !== undefined && refreshTrigger !== null) {
            fetchFiles()
        }
    }, [refreshTrigger, repoPath, fetchFiles])

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null)
        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [])

    const filteredFiles = files.filter(f =>
        f.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const fileTree = buildTree(filteredFiles)

    const handleToggleSelect = (path, checked) => {
        const newSelected = new Set(selectedFiles)
        if (checked) {
            newSelected.add(path)
        } else {
            newSelected.delete(path)
        }
        setSelectedFiles(newSelected)
    }

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedFiles(new Set(filteredFiles))
        } else {
            setSelectedFiles(new Set())
        }
    }

    const handleRightClick = (e, path) => {
        e.preventDefault()
        // If right-clicked file is not selected, select it (and deselect others unless ctrl is held? No, let's just add it if not present, or clear and select if not present)
        // Requirement: "When i right click one and multiple are selected, the action should be performed on all of them."

        let newSelected = new Set(selectedFiles)
        if (path && !selectedFiles.has(path)) {
            // If right clicking an unselected item, select ONLY that item (standard behavior)
            newSelected = new Set([path])
            setSelectedFiles(newSelected)
        }

        if (newSelected.size > 0) {
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                files: Array.from(newSelected)
            })
        }
    }

    const handleBulkAction = (action) => {
        if (!contextMenu) return
        console.log(`Performing ${action} on`, contextMenu.files)
        // Here you would implement the actual bulk actions
        // For now, let's just log it or maybe open the first one
        if (action === 'open') {
            contextMenu.files.forEach(f => onSelectFile(f))
        }
        setContextMenu(null)
    }

    if (!repoPath) return null

    const allSelected = filteredFiles.length > 0 && selectedFiles.size === filteredFiles.length

    return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }} onContextMenu={(e) => handleRightClick(e, null)}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                />
                Files
                <button onClick={fetchFiles} style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: '0.8em' }}>
                    ↻
                </button>
            </div>
            <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px' }}>
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ marginBottom: '8px', padding: '4px', width: '100%', flex: 'none', height: '30px' }}
                />

                {loading && <div>Loading...</div>}
                {error && <div style={{ color: 'red' }}>{error}</div>}

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {Object.keys(fileTree).sort().map(name => (
                        <FileTreeNode
                            key={name}
                            name={name}
                            node={fileTree[name]}
                            path=""
                            onSelectFile={onSelectFile}
                            selectedFiles={selectedFiles}
                            onToggleSelect={handleToggleSelect}
                        />
                    ))}
                    {filteredFiles.length === 0 && !loading && (
                        <div style={{ color: '#888', fontStyle: 'italic' }}>No files found</div>
                    )}
                </div>
            </div>

            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    padding: '4px 0'
                }}>
                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', color: '#fff' }}
                        onClick={() => handleBulkAction('open')}
                    >
                        Open {contextMenu.files.length} file(s)
                    </div>
                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', color: '#fff' }}
                        onClick={() => {
                            console.log("Delete not implemented yet")
                            setContextMenu(null)
                        }}
                    >
                        Delete (Not Impl)
                    </div>
                </div>
            )}
        </div>
    )
}

export default FileExplorer
