import { useState, useEffect, useRef, useCallback } from 'react'
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
  
  // Ref to track last status string for change detection without causing re-renders
  const lastStatusRef = useRef(null)
  // Ref to prevent concurrent handleManualUpdate calls
  const isUpdatingRef = useRef(false)
  // Ref to track file list changes and trigger FileExplorer refresh
  const fileRefreshTriggerRef = useRef(0)

  // File Viewer State
  const [showFiles, setShowFiles] = useState(false)
  const [showLogs, setShowLogs] = useState(true)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0)
  const [showChat, setShowChat] = useState(false)

  const addLog = useCallback((msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev])
  }, [])
  const setRepo = async (path) => {
    try {
      // Stop any existing polling before setting new repo
      // This will trigger useEffect cleanup to clear the interval
      if (polling) {
        setPolling(false)
      }
      
      await axios.post(`${API_URL}/set-repo`, { path })
      setRepoPath(path)
      lastStatusRef.current = null // Reset ref for new repo
      addLog(`Repository set to: ${path}`)
      
      // Immediately fetch status with force=true to get initial summary
      try {
        await handleManualUpdate(true)
      } catch (updateErr) {
        // If manual update fails, log but continue - polling will fetch status
        console.error('Initial status update failed:', updateErr)
        addLog('Initial status update failed, polling will continue...')
      }
      
      // Start polling regardless of initial update success
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
      // Ensure polling is stopped if repo setup failed
      setPolling(false)
    }
  }

  const resetRepo = () => {
    setRepoPath('')
    setStatusData(null)
    setPolling(false)
    lastStatusRef.current = null
    fileRefreshTriggerRef.current = 0
    setFileRefreshTrigger(0)
    addLog('Repository selection reset.')
  }

  const startPolling = () => {
    if (polling) return
    setPolling(true)
    addLog('Started polling for changes...')
  }

  const handleManualUpdate = async (force = false) => {
    // Prevent concurrent calls to avoid race conditions
    if (isUpdatingRef.current && !force) {
      return // Skip if already updating (unless forced)
    }
    
    isUpdatingRef.current = true
    try {
      addLog(force ? 'Forcing update and analysis...' : 'Checking for updates...')
      const res = await axios.post(`${API_URL}/poll`, { force })

      // Update status if changed OR if forced (because we want to see the summary)
      if (res.data.has_changed || force) {
        // Update lastStatusRef to establish baseline for polling (normalize for consistency)
        if (res.data.status !== undefined) {
          lastStatusRef.current = String(res.data.status ?? '').trim()
        }
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
    } finally {
      isUpdatingRef.current = false
    }
  }

  useEffect(() => {
    let interval
    // Only poll if polling is enabled AND we have a repo path
    if (polling && repoPath) {
      const poll = async () => {
        try {
          // Capture current repoPath at start of poll to prevent stale updates
          const currentRepo = repoPath
          if (!currentRepo) {
            return // No repo set, skip polling
          }
          
          const res = await axios.post(`${API_URL}/poll`)
          
          // Handle backend error responses
          if (res.data && res.data.error) {
            console.error('Backend error:', res.data.error)
            // If repo not set, try to re-set it from current path
            if (res.data.error.includes('not set') || res.data.error.includes('Repository')) {
              if (currentRepo) {
                // Try to re-set the repository
                addLog('Repository lost on backend - re-initializing...')
                try {
                  await axios.post(`${API_URL}/set-repo`, { path: currentRepo })
                  addLog('Repository re-initialized successfully.')
                } catch (err) {
                  setPolling(false)
                  addLog(`Failed to re-initialize repository: ${err.message}`)
                }
              } else {
                setPolling(false)
                addLog('Repository not set on backend - stopping polling.')
              }
            }
            return
          }
          
          if (!res.data || res.data.status === undefined) {
            return // Skip if no data or invalid response
          }
          
          // Verify repo hasn't changed during async operation
          // Note: This check uses the closure value, which will be updated when dependencies change
          if (repoPath !== currentRepo) {
            return // Repo changed, ignore this poll result
          }
          
          // Get current status string - normalize to handle edge cases
          const currentStatus = String(res.data.status ?? '').trim()
          const lastStatus = String(lastStatusRef.current ?? '').trim()
          
          // Check for changes
          const statusChanged = currentStatus !== lastStatus
          const backendIndicatesChange = res.data.has_changed === true
          const filesChanged = res.data.files_changed === true
          const isFirstPoll = lastStatusRef.current === null
          
          // Update if anything changed or this is the first poll
          if (statusChanged || backendIndicatesChange || isFirstPoll) {
            // Update ref before UI update
            lastStatusRef.current = currentStatus
            
            // Always update UI with latest data
            setStatusData(res.data)
            
            // Log changes (skip first poll)
            if (!isFirstPoll && (statusChanged || backendIndicatesChange)) {
              const lastHadChanges = lastStatus.length > 0
              const currentHasChanges = currentStatus.length > 0
              
              if (lastHadChanges && !currentHasChanges) {
                addLog('Repository is now clean - all changes committed.')
              } else if (!lastHadChanges && currentHasChanges) {
                addLog('Changes detected - repository has uncommitted changes.')
              } else if (statusChanged || backendIndicatesChange) {
                addLog('Changes detected - status updated automatically.')
              }
              
              if (res.data.summary) {
                addLog(`Analysis: ${res.data.summary}`)
              }
            }
          }
          
          // Trigger file list refresh if files changed
          if (filesChanged) {
            fileRefreshTriggerRef.current += 1
            setFileRefreshTrigger(fileRefreshTriggerRef.current)
            if (!isFirstPoll) {
              addLog('File list updated - new files detected.')
            }
          }
        } catch (err) {
          console.error('Poll error:', err)
          // Don't log to activity log to avoid spam, just console
        }
      }

      interval = setInterval(poll, 1500) // Poll every 1.5s for faster updates
      // Initial poll immediately
      poll()
    }
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [polling, repoPath, addLog]) // Include all dependencies to ensure fresh closure
  
  // Stop polling if repoPath becomes empty (safeguard for edge cases)
  useEffect(() => {
    if (!repoPath && polling) {
      setPolling(false)
    }
  }, [repoPath, polling])

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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {repoPath && (
            <>
              <button onClick={() => setShowFiles(!showFiles)} style={{ padding: '4px 8px', fontSize: '0.9em' }}>
                {showFiles ? 'Hide Files' : 'Files'}
              </button>
              <button onClick={() => setShowLogs(!showLogs)} style={{ padding: '4px 8px', fontSize: '0.9em' }}>
                {showLogs ? 'Hide Logs' : 'Logs'}
              </button>
            </>
          )}
          <button 
            onClick={() => setShowChat(!showChat)} 
            style={{ 
              padding: '8px 12px', 
              fontSize: '0.9em',
              background: showChat ? '#1f6feb' : '#21262d',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title={showChat ? 'Close AI Agent' : 'Open AI Agent'}
          >
            <span>🤖</span>
            <span>{showChat ? 'Close' : 'AI Agent'}</span>
          </button>
        </div>
      </header>

      <div className="main-content" style={{ position: 'relative', display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>

        {/* Changes Tab - Permanent Left Sidebar (like GitHub Desktop) */}
        {repoPath && statusData && (
          <div style={{ 
            width: '350px', 
            flexShrink: 0, 
            borderRight: '1px solid #30363d',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden'
          }}>
            <StatusFeed
              data={statusData}
              onOpenFile={setSelectedFile}
              onFileReverted={() => handleManualUpdate(true)}
            />
          </div>
        )}

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto', padding: '24px' }}>
          <RepoInput
            onSetRepo={setRepo}
            currentPath={repoPath}
            onReset={resetRepo}
            onUpdate={() => handleManualUpdate(true)}
          />

          {repoPath && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Git Controls */}
              <GitControls
                repoPath={repoPath}
                onActionComplete={() => handleManualUpdate(true)}
                lastUpdated={statusData}
              />

              {/* Action Panel */}
              {statusData && statusData.dsl_suggestion && (
                <ActionPanel
                  dsl={statusData.dsl_suggestion}
                  onExecute={executeDSL}
                />
              )}

              {/* File Explorer - Optional, can be shown in main area if needed */}
              {showFiles && (
                <div style={{ width: '100%' }}>
                  <FileExplorer
                    repoPath={repoPath}
                    onSelectFile={setSelectedFile}
                    refreshTrigger={fileRefreshTrigger}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity Log Sidebar (Right) */}
        {repoPath && showLogs && (
          <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
              <div className="card-header">Activity Log</div>
              <div className="card-body" style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {logs.map((log, i) => {
                  const endBracket = log.indexOf(']');
                  const timestamp = endBracket !== -1 ? log.slice(0, endBracket + 1) : '';
                  const message = endBracket !== -1 ? log.slice(endBracket + 2) : log;

                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', fontSize: '12px', fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace', lineHeight: '1.4' }}>
                      <span style={{ flexShrink: 0, marginRight: '8px', color: '#8b949e' }}>{timestamp}</span>
                      <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c9d1d9' }}>{message}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

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

      {/* Chatbot Widget - Floating */}
      {showChat && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '400px',
          height: '600px',
          zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#161b22',
          border: '1px solid #30363d',
          animation: 'slideInUp 0.3s ease-out'
        }}>
          <ChatInterface onExecuteDSL={executeDSL} />
        </div>
      )}
    </div>
  )
}

export default App
