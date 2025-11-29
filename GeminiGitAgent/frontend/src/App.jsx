import { useState, useEffect } from 'react'
import axios from 'axios'
import RepoInput from './components/RepoInput'
import StatusFeed from './components/StatusFeed'
import ActionPanel from './components/ActionPanel'
import ChatInterface from './components/ChatInterface'
import GitControls from './components/GitControls'
import FileExplorer from './components/FileExplorer'
import FileEditor from './components/FileEditor'
import './index.css'

const API_URL = 'http://127.0.0.1:5000/api'

function App() {
  const [repoPath, setRepoPath] = useState('')
  const [statusData, setStatusData] = useState(null)
  const [polling, setPolling] = useState(false)
  const [logs, setLogs] = useState([])

  // File Viewer State
  const [showFiles, setShowFiles] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev])
  }

  const setRepo = async (path) => {
    try {
      await axios.post(`${API_URL}/set-repo`, { path })
      setRepoPath(path)
      addLog(`Repository set to: ${path}`)
      // Immediately fetch status with force=true to get initial summary
      handleManualUpdate(true)
      startPolling()
    } catch (err) {
      console.error('Full error:', err)
      addLog(`Error setting repo: ${err.message}`)
      if (err.response) {
        addLog(`Response status: ${err.response.status}`)
        addLog(`Response data: ${JSON.stringify(err.response.data)}`)
      } else if (err.request) {
        addLog('No response received from server. Is the backend running?')
        addLog(`Target URL: ${API_URL}/set-repo`)
      }
    }
  }

  const resetRepo = () => {
    setRepoPath('')
    setStatusData(null)
    setPolling(false)
    addLog('Repository selection reset.')
  }

  const startPolling = () => {
    if (polling) return
    setPolling(true)
    addLog('Started polling for changes...')
  }

  const handleManualUpdate = async (force = false) => {
    try {
      addLog(force ? 'Forcing update and analysis...' : 'Checking for updates...')
      const res = await axios.post(`${API_URL}/poll`, { force })

      // Update status if changed OR if forced (because we want to see the summary)
      if (res.data.has_changed || force) {
        setStatusData(res.data)
        addLog('Status updated.')
        if (res.data.summary) {
          addLog('Received new Gemini analysis.')
        }
      } else {
        addLog('No changes detected.')
      }
    } catch (err) {
      addLog(`Error updating: ${err.message}`)
    }
  }

  useEffect(() => {
    let interval
    if (polling) {
      const poll = async () => {
        try {
          const res = await axios.post(`${API_URL}/poll`)
          if (res.data.has_changed) {
            setStatusData(res.data)
            addLog('Changes detected! Gemini analysis received.')
          }
        } catch (err) {
          console.error(err)
        }
      }

      interval = setInterval(poll, 30000) // Poll every 30s
    }
    return () => clearInterval(interval)
  }, [polling])

  const executeDSL = async (dsl) => {
    try {
      addLog('Executing DSL script...')
      const res = await axios.post(`${API_URL}/execute`, { dsl })
      addLog('Execution complete.')
      addLog(`Output:\n${res.data.output}`)
      // Refresh status immediately
      handleManualUpdate(true)
    } catch (err) {
      addLog(`Execution error: ${err.message}`)
    }
  }

  return (
    <div className="app-container">
      <header className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg height="32" viewBox="0 0 16 16" version="1.1" width="32" fill="white">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.27-1.48-.63-1.99.63-.07 1.37-.31 1.37-1.41 0-.32-.09-.59-.25-.79.02-.07.11-.35-.02-.72 0 0-.24-.08-.79.28a7.85 7.85 0 0 0-2.2-.3c-.75 0-1.52.1-2.2.3-.65-.43-.9-.28-.9-.28-.15.4-.08.69-.03.79-.16.2-.25.47-.25.79 0 1.07.75 1.33 1.38 1.41-.28.25-.55.69-.55 1.32 0 .96.01 1.76.01 2.01 0 .21-.15.46-.55.38A8.013 8.013 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
          </svg>
          <h1>Gemini Git Agent</h1>
        </div>
        {repoPath && (
          <button onClick={() => setShowFiles(!showFiles)} style={{ padding: '4px 8px', fontSize: '0.9em' }}>
            {showFiles ? 'Hide Files' : 'Files'}
          </button>
        )}
      </header>

      <div className="main-content" style={{ position: 'relative', display: 'flex', gap: '16px' }}>

        {/* File Explorer Sidebar */}
        {showFiles && (
          <div style={{ width: '250px', flexShrink: 0 }}>
            <FileExplorer
              repoPath={repoPath}
              onSelectFile={setSelectedFile}
            />
          </div>
        )}

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <RepoInput
            onSetRepo={setRepo}
            currentPath={repoPath}
            onReset={resetRepo}
            onUpdate={() => handleManualUpdate(true)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              {statusData && (
                <>
                  <StatusFeed data={statusData} />
                  {statusData.dsl_suggestion && (
                    <ActionPanel
                      dsl={statusData.dsl_suggestion}
                      onExecute={executeDSL}
                    />
                  )}
                </>
              )}

              <GitControls
                repoPath={repoPath}
                onActionComplete={() => handleManualUpdate(true)}
              />

              <div className="card" style={{ marginTop: '16px' }}>
                <div className="card-header">Activity Log</div>
                <div className="card-body">
                  <pre style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {logs.join('\n')}
                  </pre>
                </div>
              </div>
            </div>

            <div>
              <ChatInterface onExecuteDSL={executeDSL} />
            </div>
          </div>
        </div>

        {/* File Editor Modal/Overlay */}
        {selectedFile && (
          <div style={{
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            height: '80%',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(0,0,0,0.5)'
          }}>
            <FileEditor
              filePath={selectedFile}
              onClose={() => setSelectedFile(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
