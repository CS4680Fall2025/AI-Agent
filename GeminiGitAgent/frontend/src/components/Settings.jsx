import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

function Settings({ onClose, onKeyChanged }) {
  const [apiKeyStatus, setApiKeyStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [success, setSuccess] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showReenter, setShowReenter] = useState(false)
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash')

  // GitHub Config State
  const [githubToken, setGithubToken] = useState('')
  const [githubPath, setGithubPath] = useState('')
  const [showGithubToken, setShowGithubToken] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/config/gemini-key`)
      setApiKeyStatus(res.data)

      // Fetch GitHub config
      try {
        const tokenRes = await axios.get(`${API_URL}/config/github-token`)
        setGithubToken(tokenRes.data.github_token || '')
      } catch (e) { console.error('Failed to fetch GitHub token', e) }

      try {
        const pathRes = await axios.get(`${API_URL}/config/github-path`)
        setGithubPath(pathRes.data.github_path || '')
      } catch (e) { console.error('Failed to fetch GitHub path', e) }

      try {
        const modelRes = await axios.get(`${API_URL}/config/gemini-model`)
        setGeminiModel(modelRes.data.gemini_model || 'gemini-1.5-flash')
      } catch (e) { console.error('Failed to fetch Gemini model', e) }

    } catch (err) {
      console.error('Failed to fetch API key status:', err)
      setApiKeyStatus({ is_set: false, status: 'not_configured' })
    } finally {
      setLoading(false)
    }
  }

  const handleTestAndSave = async () => {
    if (!newKey.trim()) {
      setError('Please enter your Gemini API key')
      setWarning('')
      return
    }

    // Prevent multiple simultaneous requests
    if (testing || saving) {
      return
    }

    setTesting(true)
    setError('')
    setWarning('')
    setSuccess('')

    try {
      // First test the key
      const testResponse = await axios.post(`${API_URL}/config/gemini-key/test`, {
        gemini_key: newKey.trim()
      })

      const status = testResponse.data.status || 'unknown'
      const isValid = testResponse.data.valid === true

      // Handle different status codes
      if (status === 'rate_limited') {
        // Key is probably valid but rate limited - show warning but accept it
        setWarning(testResponse.data.warning || 'Gemini is rate-limiting this key. It may be valid, but you\'ve hit the quota. The key will be saved.')
      } else if (!isValid) {
        // Invalid key
        setError(testResponse.data.error || 'API key validation failed')
        setTesting(false)
        return
      }

      // If test passes (or rate limited), save it
      setSaving(true)
      await axios.post(`${API_URL}/config/gemini-key`, {
        gemini_key: newKey.trim()
      })

      // Save GitHub config if changed (simple check, or just always save if present)
      if (githubToken) {
        await axios.post(`${API_URL}/config/github-token`, { github_token: githubToken.trim() })
      }
      if (githubPath) {
        await axios.post(`${API_URL}/config/github-path`, { github_path: githubPath.trim() })
      }

      // Save Gemini Model
      await axios.post(`${API_URL}/config/gemini-model`, { gemini_model: geminiModel })


      setNewKey('')
      setError('')
      setWarning('')
      setSuccess('API key saved and validated successfully!')
      setShowReenter(false)
      await fetchStatus()
      if (onKeyChanged) {
        onKeyChanged()
      }
    } catch (err) {
      // Handle different error status codes
      const statusCode = err.response?.status
      const status = err.response?.data?.status || 'unknown'

      if (statusCode === 429 || status === 'rate_limited') {
        // Rate limited - key might be valid, show warning
        setWarning(err.response?.data?.warning || 'Gemini is rate-limiting this key. It may be valid, but you\'ve hit the quota. The key will be saved.')
        // Try to save anyway
        try {
          setSaving(true)
          await axios.post(`${API_URL}/config/gemini-key`, {
            gemini_key: newKey.trim(),
            skip_test: true  // Skip test since we already know it's rate limited
          })
          setNewKey('')
          setError('')
          setWarning('')
          setSuccess('API key saved (rate limited, but key appears valid).')
          setShowReenter(false)
          await fetchStatus()
          if (onKeyChanged) {
            onKeyChanged()
          }
          return
        } catch (saveErr) {
          setError('Failed to save API key. Please try again later.')
          setWarning('')
        }
      } else if (statusCode === 401 || statusCode === 403 || status === 'invalid_key') {
        // Invalid key
        setError(err.response?.data?.error || 'This API key is invalid or unauthorized. Please check your key and try again.')
      } else if (statusCode >= 500 || status === 'server_error') {
        // Server error
        setError(err.response?.data?.error || 'Gemini service error. Please try again later.')
      } else {
        // Generic error - sanitize to never show the key
        let errorMessage = err.response?.data?.error || err.message || 'Failed to validate API key'
        // Remove any potential key leakage
        if (errorMessage.includes('?key=')) {
          errorMessage = errorMessage.split('?key=')[0] + '?key=[REDACTED]'
        }
        setError(errorMessage)
      }
    } finally {
      setTesting(false)
      setSaving(false)
    }
  }

  const handleForget = async () => {
    if (!confirm('Are you sure you want to delete your Gemini API key? You will need to enter it again to use AI features.')) {
      return
    }

    try {
      await axios.delete(`${API_URL}/config/gemini-key`)
      setSuccess('API key deleted successfully')
      setNewKey('')
      setError('')
      setShowReenter(false)
      await fetchStatus()
      if (onKeyChanged) {
        onKeyChanged()
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete API key')
    }
  }

  const getStatusDisplay = () => {
    if (loading) return 'Loading...'
    if (!apiKeyStatus?.is_set) return 'Not configured'

    const status = apiKeyStatus.status || 'connected'
    if (status === 'connected') {
      return 'Connected ✓'
    }
    return status
  }

  const getStatusColor = () => {
    if (loading) return '#8b949e'
    if (!apiKeyStatus?.is_set) return '#f85149'
    return '#3fb950'
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '650px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h2 style={{
            margin: 0,
            color: '#c9d1d9',
            fontSize: '1.3em',
            fontWeight: '600'
          }}>
            Gemini API Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '1.5em',
              padding: '0 8px',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Status Display */}
        <div style={{
          marginBottom: '20px',
          padding: '12px',
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '6px'
        }}>
          <div style={{
            fontSize: '0.85em',
            color: '#8b949e',
            marginBottom: '4px'
          }}>
            Status
          </div>
          <div style={{
            fontSize: '1em',
            color: getStatusColor(),
            fontWeight: '500'
          }}>
            Connected to Gemini as: {getStatusDisplay()}
          </div>
        </div>

        {/* GitHub Configuration Section */}
        <div style={{ marginBottom: '24px', borderTop: '1px solid #30363d', paddingTop: '20px' }}>
          <h3 style={{ color: '#c9d1d9', fontSize: '1.1em', marginTop: 0, marginBottom: '16px' }}>GitHub Configuration</h3>

          {/* GitHub Token */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#c9d1d9', fontSize: '0.9em', fontWeight: '500' }}>
              GitHub Personal Access Token
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showGithubToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#c9d1d9',
                  fontSize: '0.95em',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowGithubToken(!showGithubToken)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#8b949e',
                  cursor: 'pointer',
                  padding: '4px',
                  fontSize: '0.85em'
                }}
              >
                {showGithubToken ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <div style={{ fontSize: '0.8em', color: '#8b949e', marginTop: '4px' }}>
              Required for cloning private repos and higher API limits.
            </div>
          </div>

          {/* GitHub Repo Path */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#c9d1d9', fontSize: '0.9em', fontWeight: '500' }}>
              Default Repositories Path
            </label>
            <input
              type="text"
              value={githubPath}
              onChange={(e) => setGithubPath(e.target.value)}
              placeholder="C:\Users\Name\Documents\GitHub"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '0.95em',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: '0.8em', color: '#8b949e', marginTop: '4px' }}>
              Where new repositories will be cloned by default.
            </div>
          </div>

          <button
            onClick={async () => {
              setSaving(true)
              try {
                await axios.post(`${API_URL}/config/github-token`, { github_token: githubToken.trim() })
                await axios.post(`${API_URL}/config/github-path`, { github_path: githubPath.trim() })
                setSuccess('GitHub configuration saved!')
                setTimeout(() => setSuccess(''), 3000)
              } catch (err) {
                setError('Failed to save GitHub configuration')
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving}
            style={{
              padding: '8px 16px',
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              fontSize: '0.9em',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Save GitHub Config'}
          </button>
        </div>


        {/* Gemini API Key Section */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: '#c9d1d9',
              fontSize: '0.9em',
              fontWeight: '500'
            }}>
              Gemini Model
            </label>
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '0.95em',
                cursor: 'pointer'
              }}
            >
              <option value="gemini-1.5-flash">gemini-1.5-flash (Recommended)</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash (Experimental)</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
            <div style={{ fontSize: '0.8em', color: '#8b949e', marginTop: '4px' }}>
              Select the model you want to use. Flash models are faster and cheaper.
            </div>
          </div>

          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: '#c9d1d9',
            fontSize: '0.9em',
            fontWeight: '500'
          }}>
            Gemini API Key
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value)
                setError('')
                setSuccess('')
              }}
              placeholder={apiKeyStatus?.is_set ? "Enter new key to update..." : "AIzaSy..."}
              disabled={testing || saving}
              style={{
                width: '100%',
                padding: '12px 40px 12px 12px',
                background: '#0d1117',
                border: error ? '1px solid #f85149' : '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '0.95em',
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#8b949e',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '0.85em'
              }}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {error && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.3)',
              borderRadius: '6px',
              color: '#f85149',
              fontSize: '0.85em'
            }}>
              {error}
            </div>
          )}
          {warning && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(251, 188, 5, 0.1)',
              border: '1px solid rgba(251, 188, 5, 0.3)',
              borderRadius: '6px',
              color: '#fbb305',
              fontSize: '0.85em'
            }}>
              ⚠️ {warning}
            </div>
          )}
          {success && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(63, 185, 80, 0.1)',
              border: '1px solid rgba(63, 185, 80, 0.3)',
              borderRadius: '6px',
              color: '#3fb950',
              fontSize: '0.85em'
            }}>
              {success}
            </div>
          )}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handleTestAndSave}
              disabled={testing || saving || !newKey.trim()}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: (testing || saving || !newKey.trim()) ? '#21262d' : '#238636',
                border: 'none',
                borderRadius: '6px',
                color: (testing || saving || !newKey.trim()) ? '#8b949e' : 'white',
                fontSize: '0.95em',
                fontWeight: '500',
                cursor: (testing || saving || !newKey.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              {testing ? 'Testing...' : saving ? 'Saving...' : 'Test & Save Gemini Key'}
            </button>

            {apiKeyStatus?.is_set && (
              <button
                onClick={handleForget}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(248, 81, 73, 0.1)',
                  border: '1px solid rgba(248, 81, 73, 0.3)',
                  borderRadius: '6px',
                  color: '#f85149',
                  fontSize: '0.95em',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
                title="Remove API Key"
              >
                Forget
              </button>
            )}
          </div>
        </div>

        <div style={{
          marginTop: '20px',
          paddingTop: '20px',
          borderTop: '1px solid #30363d'
        }}>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#58a6ff',
              textDecoration: 'none',
              fontSize: '0.9em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            <span>🔗</span>
            <span>How to create a Gemini API key</span>
          </a>
        </div>
      </div>
    </div>
  )
}

export default Settings

