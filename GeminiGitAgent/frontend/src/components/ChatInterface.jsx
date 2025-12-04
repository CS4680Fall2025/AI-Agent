import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

// API URL: Use environment variable or default to localhost for development
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

function ChatInterface({ onExecuteDSL }) {
    const initialMessage = { role: 'assistant', content: 'Hello! I am your Gemini Git Agent. How can I help you today?' }
    const [messages, setMessages] = useState([initialMessage])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef(null)
    const abortControllerRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(scrollToBottom, [messages])

    const refreshChat = () => {
        // Cancel any ongoing requests
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        // Reset chat to initial state
        setMessages([initialMessage])
        setInput('')
        setLoading(false)
    }

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMsg = input
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setInput('')
        setLoading(true)

        // Create abort controller for this request
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        try {
            const res = await axios.post(`${API_URL}/chat`, { message: userMsg }, {
                signal: abortController.signal
            })

            // Check if request was aborted
            if (abortController.signal.aborted) {
                return
            }

            const assistantMsg = res.data.response || "I didn't get a response."
            const dsl = res.data.dsl

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: assistantMsg,
                dsl: dsl
            }])

        } catch (err) {
            // Don't show error if request was aborted
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError' || abortController.signal.aborted) {
                setLoading(false)
                return
            }
            const errorMessage = err.response?.data?.error || err.message
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }])
        } finally {
            if (!abortController.signal.aborted) {
                setLoading(false)
            }
            abortControllerRef.current = null
        }
    }

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#161b22', pointerEvents: 'auto' }}>
            <div style={{
                background: '#21262d',
                padding: '16px',
                borderBottom: '1px solid #30363d',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pointerEvents: 'auto'
            }}>
                <span>Chat with Gemini</span>
                <button
                    onClick={refreshChat}
                    title={loading ? "Cancel request and refresh chat" : "Refresh chat (clear conversation)"}
                    style={{
                        background: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: '6px',
                        color: loading ? '#f85149' : '#c9d1d9',
                        padding: '6px 12px',
                        fontSize: '0.85em',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = '#30363d'
                        e.target.style.borderColor = loading ? '#f85149' : '#58a6ff'
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = '#21262d'
                        e.target.style.borderColor = '#30363d'
                    }}
                >
                    <span>🔄</span>
                    <span>{loading ? 'Cancel' : 'Refresh'}</span>
                </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', pointerEvents: 'auto' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        backgroundColor: msg.role === 'user' ? '#1f6feb' : '#21262d',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        color: 'white',
                        pointerEvents: 'auto'
                    }}>
                        <div>{msg.content}</div>
                        {msg.dsl && (
                            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>Suggested Action:</div>
                                <pre style={{ margin: 0, fontSize: '11px' }}>{msg.dsl}</pre>
                                <button
                                    onClick={() => onExecuteDSL(msg.dsl)}
                                    style={{ marginTop: '8px', width: '100%', fontSize: '12px', padding: '4px' }}
                                    className="primary"
                                >
                                    Execute
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {loading && <div style={{ alignSelf: 'flex-start', color: '#8b949e', fontSize: '12px' }}>Gemini is thinking...</div>}
                <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: '12px', borderTop: '1px solid #30363d', pointerEvents: 'auto', position: 'relative', zIndex: 10001 }}>
                <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="Ask me to commit changes, check status..."
                        autoFocus={!loading}
                        disabled={loading}
                        readOnly={false}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: '#0d1117',
                            border: '1px solid #30363d',
                            borderRadius: '6px',
                            color: '#c9d1d9',
                            outline: 'none',
                            pointerEvents: 'auto',
                            zIndex: 10002,
                            position: 'relative'
                        }}
                    />
                    <button type="submit" disabled={loading} className="primary" style={{ pointerEvents: 'auto', zIndex: 10002 }}>Send</button>
                </form>
            </div>
        </div>
    )
}

export default ChatInterface
