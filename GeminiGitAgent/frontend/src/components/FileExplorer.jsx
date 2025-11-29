import { useState, useEffect } from 'react'
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

const FileTreeNode = ({ name, node, path, onSelectFile, depth = 0 }) => {
    const [expanded, setExpanded] = useState(true) // Default expanded
    const isFolder = node !== null
    const fullPath = path ? `${path}/${name}` : name

    if (!isFolder) {
        return (
            <div
                onClick={() => onSelectFile(fullPath)}
                style={{
                    cursor: 'pointer',
                    padding: '4px 0',
                    paddingLeft: `${depth * 16 + 4}px`,
                    fontSize: '0.9em',
                    color: '#e0e0e0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}
                className="file-item"
            >
                📄 {name}
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
                />
            ))}
        </div>
    )
}

function FileExplorer({ repoPath, onSelectFile }) {
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        if (repoPath) {
            fetchFiles()
        }
    }, [repoPath])

    const fetchFiles = async () => {
        setLoading(true)
        try {
            const res = await axios.get(`${API_URL}/files`)
            setFiles(res.data.files)
            setError(null)
        } catch (err) {
            setError('Failed to load files')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const filteredFiles = files.filter(f =>
        f.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const fileTree = buildTree(filteredFiles)

    if (!repoPath) return null

    return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
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
                        />
                    ))}
                    {filteredFiles.length === 0 && !loading && (
                        <div style={{ color: '#888', fontStyle: 'italic' }}>No files found</div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default FileExplorer
