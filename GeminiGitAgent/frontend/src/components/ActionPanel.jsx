function ActionPanel({ dsl, onExecute }) {
    return (
        <div className="card" style={{ borderColor: '#58a6ff' }}>
            <div className="card-header" style={{ color: '#58a6ff' }}>
                Suggested Action
            </div>
            <div className="card-body">
                <p>Gemini suggests the following DSL script to handle these changes:</p>
                <pre>{dsl}</pre>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="primary" onClick={() => onExecute(dsl)}>
                        Execute Script
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ActionPanel
