import { ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const API_BASE = ''

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('phenomics_token')
  if (!token) return {}
  return { 'Authorization': `Bearer ${token}` }
}

/** Get the raw bearer token (for query-param auth on EventSource). */
function rawToken(): string {
  return localStorage.getItem('phenomics_token') || ''
}

export interface ToolCallInfo {
  tool_name: string
  input: Record<string, any>
  status: 'started' | 'completed' | 'error'
  result?: any
  error?: string
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  thinking_content: string | null
  tool_calls?: ToolCallInfo[] | null
  created_at: string
}

// ── Module-level singleton state ──
// All components share the same chat state. This fixes the bug where
// AppSidebar and ChatView each had their own independent copy, so actions
// in one (newConversation / selectConversation) were not reflected in the other.
const conversations = ref<Conversation[]>([])
const currentConvId = ref<string | null>(localStorage.getItem('phenomics_current_conv'))
const messages = ref<Message[]>([])
const isStreaming = ref(false)
const streamContent = ref('')
const streamThinking = ref('')
const streamToolCalls = ref<ToolCallInfo[]>([])

// Shared EventSource handle so streaming can be aborted across components.
let activeEventSource: EventSource | null = null

export function useChat() {

  async function loadConversations() {
    try {
      const r = await fetch(`${API_BASE}/api/conversations`, { headers: authHeaders() })
      if (!r.ok) throw new Error('Failed to load conversations')
      conversations.value = await r.json()

      // 刷新后自动恢复当前对话
      const savedConvId = localStorage.getItem('phenomics_current_conv')
      if (savedConvId && currentConvId.value === savedConvId && messages.value.length === 0) {
        await loadMessages(savedConvId)
      }
    } catch (e) {
      console.error('loadConversations error:', e)
    }
  }

  async function loadMessages(convId: string) {
    try {
      const r = await fetch(`${API_BASE}/api/conversations/${convId}/messages`, { headers: authHeaders() })
      if (!r.ok) {
        messages.value = []
        throw new Error(`HTTP ${r.status}: ${r.statusText}`)
      }
      const data = await r.json()
      // Parse tool_calls from JSON string if needed
      for (const msg of data) {
        if (msg.tool_calls && typeof msg.tool_calls === 'string') {
          try { msg.tool_calls = JSON.parse(msg.tool_calls) } catch { msg.tool_calls = null }
        }
      }
      messages.value = data
    } catch (e) {
      console.error('loadMessages error:', e)
      // Clear messages on error so we don't show stale content
      messages.value = []
    }
  }

  async function deleteConversation(convId: string) {
    try {
      const r = await fetch(`${API_BASE}/api/conversations/${convId}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) throw new Error('Failed to delete')
      if (currentConvId.value === convId) {
        currentConvId.value = null
        messages.value = []
      }
      await loadConversations()
    } catch (e) {
      console.error('deleteConversation error:', e)
    }
  }

  async function sendMessage(content: string, thinkingEnabled: boolean = false, enabledServices: string[] = []) {
    if (isStreaming.value) return

    // Optimistically add user message
    const userMsg: Message = {
      id: 'temp-' + Math.random().toString(36).slice(2),
      role: 'user',
      content,
      thinking_content: null,
      created_at: new Date().toISOString(),
    }
    messages.value.push(userMsg)

    isStreaming.value = true
    streamContent.value = ''
    streamThinking.value = ''
    streamToolCalls.value = []

    try {
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          conversation_id: currentConvId.value,
          thinking_enabled: thinkingEnabled,
          enabled_services: enabledServices,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      const sessionId: string = data.session_id
      const convId: string = data.conversation_id

      if (!currentConvId.value) {
        currentConvId.value = convId
        localStorage.setItem('phenomics_current_conv', convId)
        await loadConversations()
      }

      // Create SSE connection (shared so it can be aborted)
      closeActiveEventSource()
      // EventSource cannot send Authorization headers, so the JWT is passed
      // as a query param (verified by the backend) (M13 + C5).
      const streamUrl = `${API_BASE}/api/chat/stream/${sessionId}?token=${encodeURIComponent(rawToken())}`
      const es = new EventSource(streamUrl)
      activeEventSource = es

      es.addEventListener('content', (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data)
          streamContent.value += d.delta
        } catch {}
      })

      es.addEventListener('thinking', (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data)
          streamThinking.value += d.delta
        } catch {}
      })

      es.addEventListener('tool_call', (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data)
          console.log('[useChat] tool_call event:', d)
          console.log('[useChat] tool_call result keys:', d.result ? Object.keys(d.result) : 'no result')
          const existingIdx = streamToolCalls.value.findIndex(t => t.tool_name === d.tool_name)
          if (existingIdx !== -1) {
            // Update existing tool call
            streamToolCalls.value[existingIdx] = { ...streamToolCalls.value[existingIdx], ...d }
          } else {
            streamToolCalls.value.push({
              tool_name: d.tool_name,
              input: d.input || {},
              status: d.status || 'started',
              result: d.result,
              error: d.error,
            })
          }
        } catch {}
      })

      es.addEventListener('done', () => {
        closeActiveEventSource()
        isStreaming.value = false
        // Add the assistant message with tool_calls if any
        messages.value.push({
          id: 'msg-' + Math.random().toString(36).slice(2),
          role: 'assistant',
          content: streamContent.value,
          thinking_content: streamThinking.value || null,
          tool_calls: streamToolCalls.value.length > 0 ? [...streamToolCalls.value] : null,
          created_at: new Date().toISOString(),
        })
        streamContent.value = ''
        streamThinking.value = ''
        streamToolCalls.value = []
        // Only update the conversations list (timestamp)
        loadConversations()
      })

      es.addEventListener('error', () => {
        closeActiveEventSource()
        isStreaming.value = false
        // Preserve whatever content we got before the error
        if (streamContent.value) {
          messages.value.push({
            id: 'msg-' + Math.random().toString(36).slice(2),
            role: 'assistant',
            content: streamContent.value + '\n\n*(连接中断，回答不完整)*',
            thinking_content: streamThinking.value || null,
            tool_calls: streamToolCalls.value.length > 0 ? [...streamToolCalls.value] : null,
            created_at: new Date().toISOString(),
          })
          streamContent.value = ''
          streamThinking.value = ''
          streamToolCalls.value = []
        }
      })
    } catch (e: any) {
      isStreaming.value = false
      console.error('sendMessage error:', e)
    }
  }

  /** Close the active SSE connection (called by the Stop button). */
  function abortStream() {
    closeActiveEventSource()
    isStreaming.value = false
    if (streamContent.value) {
      messages.value.push({
        id: 'msg-' + Math.random().toString(36).slice(2),
        role: 'assistant',
        content: streamContent.value + '\n\n*(已停止)*',
        thinking_content: streamThinking.value || null,
        tool_calls: streamToolCalls.value.length > 0 ? [...streamToolCalls.value] : null,
        created_at: new Date().toISOString(),
      })
    }
    streamContent.value = ''
    streamThinking.value = ''
    streamToolCalls.value = []
  }

  function closeActiveEventSource() {
    if (activeEventSource) {
      activeEventSource.close()
      activeEventSource = null
    }
  }

  async function selectConversation(convId: string) {
    if (isStreaming.value) {
      // Give the user feedback instead of silently ignoring (L3).
      console.warn('Cannot switch conversation while streaming; stop the current response first.')
      return
    }
    currentConvId.value = convId
    localStorage.setItem('phenomics_current_conv', convId)
    await loadMessages(convId)
    // On mobile, close the sidebar after selecting a session (L2).
    window.dispatchEvent(new CustomEvent('phenomics:close-mobile'))
  }

  function newConversation() {
    if (isStreaming.value) {
      console.warn('Cannot start a new conversation while streaming; stop the current response first.')
      return
    }
    closeActiveEventSource()
    currentConvId.value = null
    localStorage.removeItem('phenomics_current_conv')
    messages.value = []
    streamContent.value = ''
    streamThinking.value = ''
    streamToolCalls.value = []
    // On mobile, close the sidebar after starting a new session (L2).
    window.dispatchEvent(new CustomEvent('phenomics:close-mobile'))
  }

  function renderMarkdown(text: string): string {
    // marked v15: parse() is synchronous by default and returns a string.
    // DOMPurify sanitizes the HTML to prevent XSS from model output (M4).
    const rawHtml = marked.parse(text, { async: false }) as string
    return DOMPurify.sanitize(rawHtml)
  }

  return {
    conversations,
    currentConvId,
    messages,
    isStreaming,
    streamContent,
    streamThinking,
    streamToolCalls,
    loadConversations,
    loadMessages,
    deleteConversation,
    sendMessage,
    selectConversation,
    newConversation,
    abortStream,
    renderMarkdown,
  }
}
