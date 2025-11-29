import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

function FileEditor({ filePath, onClose }) {
    const [content, setContent] = useState('')
    const [diff, setDiff] = useState('')
    const [mode, setMode] = useState('edit') // 'edit' or 'diff'
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (filePath) {
            loadFile()
            loadDiff()
        }
    }, [filePath])

    const loadFile = async () => {
        setLoading(true)
        try {
            const res = await axios.get(`${API_URL}/file`, { params: { path: filePath } })
            setContent(res.data.content)
            setError(null)
        } catch (err) {
            setError('Failed to load file')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const loadDiff = async () => {
        try {
            const res = await axios.get(`${API_URL}/diff`, { params: { path: filePath } })
            setDiff(res.data.diff)
        } catch (err) {
            console.error('Failed to load diff', err)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await axios.post(`${API_URL}/file`, { path: filePath, content })
            await loadDiff() // Refresh diff after save
            alert('File saved!')
        } catch (err) {
            alert('Failed to save file')
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    const renderDiff = () => {
        if (!diff) return <div style={{ padding: '10px', color: '#888' }}>No changes compared to HEAD.</div>

        return (
            <pre style={{ margin: 0, padding: '10px', overflow: 'auto', fontFamily: 'monospace' }}>
                {diff.split('\n').map((line, i) => {
                    let style = {}
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                        style = { backgroundColor: 'rgba(0, 255, 0, 0.1)', color: '#4caf50' }
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                        style = { backgroundColor: 'rgba(255, 0, 0, 0.1)', color: '#f44336' }
                    }
                    return (
                        <div key={i} style={style}>
                            {line}
                        </div>
                    )
                })}
            </pre>
        )
    }

    if (!filePath) return null

    return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>{filePath}</span>
                <div>
                    <button onClick={handleSave} disabled={saving || mode === 'diff'} style={{ marginRight: '8px' }}>
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={onClose} className="secondary">Close</button>
                </div>
            </div>

            <div style={{ padding: '8px', borderBottom: '1px solid #333', display: 'flex', gap: '8px' }}>
                <button
                    className={mode === 'edit' ? 'primary' : 'secondary'}
                    onClick={() => setMode('edit')}
                >
                    Edit
                </button>
                <button
                    className={mode === 'diff' ? 'primary' : 'secondary'}
                    onClick={() => { setMode('diff'); loadDiff(); }}
                >
                    Diff
                </button>
            </div>

            <div className="card-body" style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative' }}>
                {loading && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        Loading...
                    </div>
                )}

                {mode === 'edit' ? (
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            padding: '10px',
                            background: 'transparent',
                            color: 'inherit',
                            fontFamily: 'monospace',
                            resize: 'none',
                            outline: 'none'
                        }}
                        spellCheck="false"
                    />
                ) : (
                    renderDiff()
                )}
            </div>
        </div>
    )
}

export default FileEditor
