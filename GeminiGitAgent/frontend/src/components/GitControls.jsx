import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

function GitControls({ repoPath, onActionComplete, lastUpdated }) {
    const [commitStats, setCommitStats] = useState({ total: null, unpushed: null, behind: 0 })
    const [commitMessage, setCommitMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [currentBranch, setCurrentBranch] = useState('')
    const [branches, setBranches] = useState({ local: [], remote: [] })
    const [showBranchSelector, setShowBranchSelector] = useState(false)
    const [switchingBranch, setSwitchingBranch] = useState(false)
    const [showCreateBranch, setShowCreateBranch] = useState(false)
    const [newBranchName, setNewBranchName] = useState('')
    const [creatingBranch, setCreatingBranch] = useState(false)
    const branchSelectorRef = useRef(null)

    const fetchCommitCount = async () => {
        if (!repoPath) return
        try {
            const res = await axios.get(`${API_URL}/commits`)
            setCommitStats(res.data)
        } catch (err) {
            console.error('Failed to fetch commit count:', err)
        }
    }

    const fetchBranchInfo = async () => {
        if (!repoPath) return
        try {
            const [branchRes, branchesRes] = await Promise.all([
                axios.get(`${API_URL}/branch`),
                axios.get(`${API_URL}/branches`)
            ])
            setCurrentBranch(branchRes.data.branch || '')
            setBranches({
                local: branchesRes.data.local || [],
                remote: branchesRes.data.remote || [],
                is_tracking: branchRes.data.is_tracking // Store tracking status
            })
        } catch (err) {
            console.error('Failed to fetch branch info:', err)
        }
    }

    useEffect(() => {
        fetchCommitCount()
        fetchBranchInfo()
    }, [repoPath, lastUpdated])

    // Close branch selector when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (branchSelectorRef.current && !branchSelectorRef.current.contains(event.target)) {
                setShowBranchSelector(false)
            }
        }

        if (showBranchSelector) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => {
                document.removeEventListener('mousedown', handleClickOutside)
            }
        }
    }, [showBranchSelector])

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
            // If not tracking, we need to publish
            const isPublishing = !branches.is_tracking
            const res = await axios.post(`${API_URL}/push`, { publish: isPublishing })

            // Update stats immediately from response if available
            if (res.data.stats) {
                setCommitStats(res.data.stats)
            } else {
                await fetchCommitCount()
            }

            // Refresh branch info to update tracking status
            await fetchBranchInfo()

            if (onActionComplete) onActionComplete()
        } catch (err) {
            setError(err.response?.data?.error || 'Push failed')
        } finally {
            setLoading(false)
        }
    }

    const handlePull = async () => {
        setLoading(true)
        setError(null)
        try {
            await axios.post(`${API_URL}/pull`)
            await fetchCommitCount()
            if (onActionComplete) onActionComplete()
        } catch (err) {
            setError(err.response?.data?.error || 'Pull failed')
        } finally {
            setLoading(false)
        }
    }

    const handleSwitchBranch = async (branchName) => {
        if (branchName === currentBranch) {
            setShowBranchSelector(false)
            return
        }

        setSwitchingBranch(true)
        setError(null)
        try {
            const res = await axios.post(`${API_URL}/branch/switch`, { branch: branchName })
            setCurrentBranch(res.data.branch || branchName)
            setShowBranchSelector(false)
            // Refresh all data after branch switch
            await Promise.all([fetchCommitCount(), fetchBranchInfo()])
            if (onActionComplete) onActionComplete()
        } catch (err) {
            setError(err.response?.data?.error || `Failed to switch to branch '${branchName}'`)
        } finally {
            setSwitchingBranch(false)
        }
    }

    const handleCreateBranch = async (e) => {
        e.preventDefault()
        if (!newBranchName.trim()) return

        setCreatingBranch(true)
        setError(null)
        try {
            const res = await axios.post(`${API_URL}/branch/create`, {
                branch: newBranchName.trim(),
                switch: true
            })
            setCurrentBranch(res.data.branch || newBranchName.trim())
            setNewBranchName('')
            setShowCreateBranch(false)
            setShowBranchSelector(false)
            // Refresh branch list
            await fetchBranchInfo()
            await fetchCommitCount()
            if (onActionComplete) onActionComplete()
        } catch (err) {
            setError(err.response?.data?.error || `Failed to create branch '${newBranchName}'`)
        } finally {
            setCreatingBranch(false)
        }
    }

    if (!repoPath) return null

    return (
        <div className="card" style={{ marginTop: '16px' }}>
            <div className="card-header">Git Controls</div>
            <div className="card-body">
                {/* Branch Selector */}
                <div style={{ marginBottom: '12px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>Branch:</strong>
                        <div ref={branchSelectorRef} style={{ position: 'relative', flex: 1, display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => setShowBranchSelector(!showBranchSelector)}
                                disabled={switchingBranch || loading}
                                style={{
                                    flex: 1,
                                    textAlign: 'left',
                                    padding: '4px 8px',
                                    background: showBranchSelector ? '#21262d' : 'transparent',
                                    border: '1px solid #30363d',
                                    borderRadius: '4px',
                                    color: '#c9d1d9',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span>{currentBranch || 'Loading...'}</span>
                                <span>{showBranchSelector ? '▲' : '▼'}</span>
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateBranch(!showCreateBranch)
                                    setShowBranchSelector(false)
                                }}
                                disabled={switchingBranch || loading || creatingBranch}
                                style={{
                                    padding: '4px 8px',
                                    background: showCreateBranch ? '#21262d' : 'transparent',
                                    border: '1px solid #30363d',
                                    borderRadius: '4px',
                                    color: '#c9d1d9',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                                title="Create new branch"
                            >
                                +
                            </button>

                            {/* Branch Selector Dropdown */}
                            {showBranchSelector && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    marginTop: '4px',
                                    background: '#161b22',
                                    border: '1px solid #30363d',
                                    borderRadius: '4px',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                }}>
                                    {branches.local.length > 0 && (
                                        <div>
                                            <div style={{ padding: '8px', fontSize: '0.85em', color: '#8b949e', borderBottom: '1px solid #30363d' }}>
                                                Local Branches
                                            </div>
                                            {branches.local.map(branch => (
                                                <div
                                                    key={branch}
                                                    onClick={() => handleSwitchBranch(branch)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        cursor: 'pointer',
                                                        color: branch === currentBranch ? '#58a6ff' : '#c9d1d9',
                                                        background: branch === currentBranch ? '#1c2128' : 'transparent',
                                                        fontWeight: branch === currentBranch ? 'bold' : 'normal',
                                                        borderLeft: branch === currentBranch ? '3px solid #58a6ff' : '3px solid transparent'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (branch !== currentBranch) {
                                                            e.target.style.background = '#21262d'
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (branch !== currentBranch) {
                                                            e.target.style.background = 'transparent'
                                                        }
                                                    }}
                                                >
                                                    {branch === currentBranch && '✓ '}
                                                    {branch}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {branches.remote.length > 0 && (
                                        <div>
                                            <div style={{ padding: '8px', fontSize: '0.85em', color: '#8b949e', borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d' }}>
                                                Remote Branches
                                            </div>
                                            {branches.remote.map(branch => (
                                                <div
                                                    key={branch}
                                                    onClick={() => handleSwitchBranch(branch)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        cursor: 'pointer',
                                                        color: '#c9d1d9',
                                                        background: 'transparent'
                                                    }}
                                                    onMouseEnter={(e) => e.target.style.background = '#21262d'}
                                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                                >
                                                    {branch} <span style={{ color: '#8b949e', fontSize: '0.85em' }}>(remote)</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {branches.local.length === 0 && branches.remote.length === 0 && (
                                        <div style={{ padding: '12px', color: '#8b949e', textAlign: 'center' }}>
                                            No branches found
                                        </div>
                                    )}
                                    <div style={{ borderTop: '1px solid #30363d', padding: '8px' }}>
                                        <button
                                            onClick={() => {
                                                setShowBranchSelector(false)
                                                setShowCreateBranch(true)
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '6px',
                                                background: 'transparent',
                                                border: '1px solid #30363d',
                                                borderRadius: '4px',
                                                color: '#58a6ff',
                                                cursor: 'pointer',
                                                fontSize: '0.9em'
                                            }}
                                            onMouseEnter={(e) => e.target.style.background = '#21262d'}
                                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                        >
                                            + Create New Branch
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Create Branch Input */}
                    {showCreateBranch && (
                        <form onSubmit={handleCreateBranch} style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
                            <input
                                type="text"
                                placeholder="New branch name..."
                                value={newBranchName}
                                onChange={(e) => setNewBranchName(e.target.value)}
                                style={{ flex: 1, padding: '4px 8px' }}
                                disabled={creatingBranch}
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={!newBranchName.trim() || creatingBranch}
                                style={{ padding: '4px 12px' }}
                            >
                                Create
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreateBranch(false)
                                    setNewBranchName('')
                                }}
                                disabled={creatingBranch}
                                style={{ padding: '4px 12px' }}
                            >
                                Cancel
                            </button>
                        </form>
                    )}
                </div>

                <div style={{ marginBottom: '12px', display: 'flex', gap: '16px' }}>
                    <div>
                        <strong>Total Commits:</strong> {commitStats.total !== null ? commitStats.total : '...'}
                    </div>
                </div>

                <form onSubmit={handleCommit} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Commit message..."
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            onKeyDown={(e) => {
                                // Prevent form submission on Enter if input is empty
                                if (e.key === 'Enter' && !commitMessage.trim()) {
                                    e.preventDefault()
                                }
                            }}
                            style={{
                                flex: 1,
                                padding: '5px 12px',
                                background: '#0d1117',
                                border: '1px solid #30363d',
                                borderRadius: '6px',
                                color: '#c9d1d9',
                                fontSize: '14px',
                                outline: 'none',
                                pointerEvents: 'auto'
                            }}
                            disabled={loading}
                            autoFocus={false}
                            readOnly={false}
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={handlePush}
                        disabled={loading || (commitStats.unpushed !== null && commitStats.unpushed === 0 && branches.is_tracking)}
                        style={{ flex: 1 }}
                    >
                        {branches.is_tracking ? (
                            `Push Changes ${commitStats.unpushed !== null && commitStats.unpushed > 0 ? `(${commitStats.unpushed})` : ''}`
                        ) : (
                            'Publish Branch'
                        )}
                    </button>
                    <button
                        onClick={handlePull}
                        disabled={loading}
                        style={{ flex: 1 }}
                    >
                        Pull Changes {commitStats.behind > 0 && `(${commitStats.behind})`}
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
