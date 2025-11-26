function StatusFeed({ data }) {
    return (
        <div className={`card ${data.has_changed ? 'status-changed' : 'status-clean'}`}>
            <div className="card-header">
                Current Status {data.has_changed ? '(Changes Detected)' : '(Clean)'}
            </div>
            <div className="card-body">
                <div style={{ marginBottom: '16px' }}>
                    <strong>Raw Status:</strong>
                    <pre>{data.status || 'No changes'}</pre>
                </div>

                {data.summary && (
                    <div>
                        <strong>Gemini Analysis:</strong>
                        <p style={{ marginTop: '8px' }}>{data.summary}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default StatusFeed
