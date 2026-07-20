import { ref } from 'vue'
import { marked } from 'marked'

const API_BASE = ''

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('phenomics_token')
  if (!token) return {}
  return { 'Authorization': `Bearer ${token}` }
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking_content: string | null
  created_at: string
}

export function useChat() {
  const conversations = ref<Conversation[]>([])
  const currentConvId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const isStreaming = ref(false)
  const streamContent = ref('')
  const streamThinking = ref('')

  async function loadConversations() {
    try {
      const r = await fetch(`${API_BASE}/api/conversations`, { headers: authHeaders() })
      if (!r.ok) throw new Error('Failed to load conversations')
      conversations.value = await r.json()
    } catch (e) {
      console.error('loadConversations error:', e)
    }
  }

  async function loadMessages(convId: string) {
    try {
      const r = await fetch(`${API_BASE}/api/conversations/${convId}/messages`, { headers: authHeaders() })
      if (!r.ok) throw new Error('Failed to load messages')
      messages.value = await r.json()
    } catch (e) {
      console.error('loadMessages error:', e)
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

  async function sendMessage(content: string, thinkingEnabled: boolean = false) {
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

    try {
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          conversation_id: currentConvId.value,
          thinking_enabled: thinkingEnabled,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      const sessionId: string = data.session_id
      const convId: string = data.conversation_id

      if (!currentConvId.value) {
        currentConvId.value = convId
        await loadConversations()
      }

      // Create SSE connection
      const es = new EventSource(`${API_BASE}/api/chat/stream/${sessionId}`)

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

      es.addEventListener('done', () => {
        es.close()
        isStreaming.value = false
        // Add the assistant message — we already have full content from SSE
        messages.value.push({
          id: 'msg-' + Math.random().toString(36).slice(2),
          role: 'assistant',
          content: streamContent.value,
          thinking_content: streamThinking.value || null,
          created_at: new Date().toISOString(),
        })
        streamContent.value = ''
        streamThinking.value = ''
        // Only update the conversations list (timestamp)
        loadConversations()
      })

      es.addEventListener('error', () => {
        es.close()
        isStreaming.value = false
        // Preserve whatever content we got before the error
        if (streamContent.value) {
          messages.value.push({
            id: 'msg-' + Math.random().toString(36).slice(2),
            role: 'assistant',
            content: streamContent.value + '\n\n*(连接中断，回答不完整)*',
            thinking_content: streamThinking.value || null,
            created_at: new Date().toISOString(),
          })
          streamContent.value = ''
          streamThinking.value = ''
        }
      })
    } catch (e: any) {
      isStreaming.value = false
      console.error('sendMessage error:', e)
    }
  }

  async function selectConversation(convId: string) {
    if (isStreaming.value) return
    currentConvId.value = convId
    await loadMessages(convId)
  }

  function newConversation() {
    if (isStreaming.value) return
    currentConvId.value = null
    messages.value = []
    streamContent.value = ''
    streamThinking.value = ''
  }

  function renderMarkdown(text: string): string {
    return marked.parse(text, { async: false }) as string
  }

  return {
    conversations,
    currentConvId,
    messages,
    isStreaming,
    streamContent,
    streamThinking,
    loadConversations,
    loadMessages,
    deleteConversation,
    sendMessage,
    selectConversation,
    newConversation,
    renderMarkdown,
  }
}
