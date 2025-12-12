import { useState } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

function SetupScreen({ onComplete }) {
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleTestAndSave = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your Gemini API key')
      setWarning('')
      return
    }

    // Prevent multiple simultaneous requests
    if (testing) {
      return
    }

    setTesting(true)
    setError('')
    setWarning('')

    try {
      // First test the key
      const testResponse = await axios.post(`${API_URL}/config/gemini-key/test`, {
        gemini_key: apiKey.trim()
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
      await axios.post(`${API_URL}/config/gemini-key`, {
        gemini_key: apiKey.trim()
      })

      // Clear the input
      setApiKey('')
      setError('')
      setWarning('')

      // Notify parent that setup is complete
      if (onComplete) {
        onComplete()
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
          await axios.post(`${API_URL}/config/gemini-key`, {
            gemini_key: apiKey.trim(),
            skip_test: true  // Skip test since we already know it's rate limited
          })
          setApiKey('')
          setError('')
          setWarning('')
          if (onComplete) {
            onComplete()
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
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !testing) {
      handleTestAndSave()
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#0d1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20000,
      padding: '20px'
    }}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{
            margin: '0 0 8px 0',
            color: '#c9d1d9',
            fontSize: '1.5em',
            fontWeight: '600'
          }}>
            Welcome to Gemini Git Agent
          </h1>
          <p style={{
            margin: 0,
            color: '#8b949e',
            fontSize: '0.95em'
          }}>
            To get started, please enter your Gemini API key
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: '#c9d1d9',
            fontSize: '0.9em',
            fontWeight: '500'
          }}>
            Paste your Gemini API key
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="AIzaSy..."
              disabled={testing}
              style={{
                width: '100%',
                padding: '12px 40px 12px 12px',
                background: '#0d1117',
                border: error ? '1px solid #f85149' : '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '0.95em',
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace'
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
        </div>

        <div style={{ marginBottom: '20px' }}>
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

        <button
          onClick={handleTestAndSave}
          disabled={testing || !apiKey.trim()}
          style={{
            width: '100%',
            padding: '12px 24px',
            background: testing || !apiKey.trim() ? '#21262d' : '#238636',
            border: 'none',
            borderRadius: '6px',
            color: testing || !apiKey.trim() ? '#8b949e' : 'white',
            fontSize: '1em',
            fontWeight: '600',
            cursor: testing || !apiKey.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s'
          }}
        >
          {testing ? 'Testing & Saving...' : 'Test & Save'}
        </button>

        {testing && (
          <div style={{
            marginTop: '16px',
            textAlign: 'center',
            color: '#8b949e',
            fontSize: '0.85em'
          }}>
            Testing your API key...
          </div>
        )}
      </div>
    </div>
  )
}

export default SetupScreen

