import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

function GitControls({ repoPath, onActionComplete }) {
    const [commitStats, setCommitStats] = useState({ total: null, unpushed: null })
    const [commitMessage, setCommitMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const fetchCommitCount = async () => {
        if (!repoPath) return
        try {
            const res = await axios.get(`${API_URL}/commits`)
            setCommitStats(res.data)
        } catch (err) {
            console.error('Failed to fetch commit count:', err)
        }
    }

    useEffect(() => {
        fetchCommitCount()
    }, [repoPath])

    const handleCommit = async (e) => {
        e.preventDefault()
        if (!commitMessage) return

        setLoading(true)
        setError(null)
        try {
            await axios.post(`${API_URL}/commit`, { message: commitMessage })
            setCommitMessage('')
            await fetchCommitCount()
            if (onActionComplete) onActionComplete()
        } catch (err) {
            setError(err.response?.data?.error || 'Commit failed')
        } finally {
            setLoading(false)
        }
    }

    const handlePush = async () => {
        setLoading(true)
        setError(null)
        try {
            await axios.post(`${API_URL}/push`)
            await fetchCommitCount()
            if (onActionComplete) onActionComplete()
        } catch (err) {
            setError(err.response?.data?.error || 'Push failed')
        } finally {
            setLoading(false)
        }
    }

    if (!repoPath) return null

    return (
        <div className="card" style={{ marginTop: '16px' }}>
            <div className="card-header">Git Controls</div>
            <div className="card-body">
                <div style={{ marginBottom: '12px', display: 'flex', gap: '16px' }}>
                    <div>
                        <strong>Total Commits:</strong> {commitStats.total !== null ? commitStats.total : '...'}
                    </div>
                    <div>
                        <strong>Unpushed:</strong> {commitStats.unpushed !== null ? commitStats.unpushed : '...'}
                    </div>
                </div>

                <form onSubmit={handleCommit} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Commit message..."
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            style={{ flex: 1 }}
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            className="primary"
                            disabled={!commitMessage || loading}
                        >
                            Commit
                        </button>
                    </div>
                </form>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={handlePush}
                        disabled={loading}
                        style={{ width: '100%' }}
                    >
                        Push Changes
                    </button>
                </div>

                {error && (
                    <div style={{ color: '#ff4444', marginTop: '8px', fontSize: '0.9em' }}>
                        Error: {error}
                    </div>
                )}
            </div>
        </div>
    )
}

export default GitControls
