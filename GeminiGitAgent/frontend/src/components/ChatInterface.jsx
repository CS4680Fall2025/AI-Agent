import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:5000/api'

function ChatInterface({ onExecuteDSL }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I am your Gemini Git Agent. How can I help you today?' }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(scrollToBottom, [messages])

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMsg = input
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setInput('')
        setLoading(true)

        try {
            const res = await axios.post(`${API_URL}/chat`, { message: userMsg })

            const assistantMsg = res.data.response || "I didn't get a response."
            const dsl = res.data.dsl

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: assistantMsg,
                dsl: dsl
            }])

        } catch (err) {
            const errorMessage = err.response?.data?.error || err.message
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#161b22' }}>
            <div style={{
                background: '#21262d',
                padding: '16px',
                borderBottom: '1px solid #30363d',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <span>Chat with Gemini</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        backgroundColor: msg.role === 'user' ? '#1f6feb' : '#21262d',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        color: 'white'
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
            <div style={{ padding: '12px', borderTop: '1px solid #30363d' }}>
                <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask me to commit changes, check status..."
                        style={{ flex: 1 }}
                    />
                    <button type="submit" disabled={loading} className="primary">Send</button>
                </form>
            </div>
        </div>
    )
}

export default ChatInterface
