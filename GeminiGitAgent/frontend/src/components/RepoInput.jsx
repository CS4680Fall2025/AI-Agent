import { useState } from 'react'

function RepoInput({ onSetRepo, currentPath, onReset, onUpdate }) {
    const [path, setPath] = useState('')

    const handleSubmit = (e) => {
        e.preventDefault()
        if (path) onSetRepo(path)
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
                    <form onSubmit={handleSubmit} className="input-group">
                        <input
                            type="text"
                            placeholder="Enter absolute path to repository..."
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                        />
                        <button type="submit" className="primary">Set Repository</button>
                    </form>
                )}
            </div>
        </div>
    )
}

export default RepoInput
