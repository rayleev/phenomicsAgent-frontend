<template>
  <div class="chat-view">
    <!-- Topbar -->
    <header class="topbar">
      <button class="sidebar-toggle" @click="openMobileSidebar" aria-label="打开侧栏">☰</button>
      <span class="topbar-title">{{ currentConvTitle }}</span>
      <div class="top-actions">
        <span class="pill" :class="{ ok: apiConnected }">{{ apiConnected ? 'API 已连接' : 'API 未连接' }}</span>
      </div>
    </header>

    <!-- Chat area -->
    <div class="chat" ref="chatEl">
      <div class="chat-inner">
        <!-- Welcome screen -->
        <div class="welcome" v-if="messages.length === 0 && !streamContent && !streamThinking">
          <div class="welcome-icon">农</div>
          <h2>你好</h2>
          <p>提交你的问题，AI 将为你解答。</p>
          <div class="examples">
            <span @click="exampleClick('什么是基因编辑育种技术？')">基因编辑育种</span>
            <span @click="exampleClick('水稻的耐盐性研究进展')">耐盐性研究</span>
            <span @click="exampleClick('作物表型数据有哪些类型？')">作物表型数据</span>
          </div>
        </div>

        <!-- Messages -->
        <div v-for="msg in messages" :key="msg.id" class="msg" :class="msg.role">
          <template v-if="msg.role === 'assistant'">
            <div class="avatar assistant">农</div>
            <div class="col">
              <div v-if="msg.tool_calls && msg.tool_calls.length > 0" class="tool-calls-area">
                <details v-for="(tc, tci) in msg.tool_calls" :key="tci" class="tool-call-card" :class="tc.status">
                  <summary class="tool-call-summary">
                    <span class="tool-call-icon">{{ tc.status === 'error' ? '❌' : '🔧' }}</span>
                    <span class="tool-call-name">调用了 {{ tc.tool_name }}</span>
                    <span class="tool-call-status" v-if="tc.status === 'started'">⏳ 进行中</span>
                    <span class="tool-call-status" v-else-if="tc.status === 'completed'">✅ 完成</span>
                    <span class="tool-call-status" v-else>❌ 失败</span>
                  </summary>
                  <div class="tool-call-detail">
                    <div class="tool-call-section">
                      <strong>参数：</strong>
                      <pre>{{ JSON.stringify(tc.input, null, 2) }}</pre>
                    </div>
                    <div v-if="tc.status === 'completed' && tc.result" class="tool-call-section">
                      <strong>结果：</strong>
                      <pre>{{ typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2) }}</pre>
                    </div>
                    <div v-if="tc.status === 'error' && tc.error" class="tool-call-section tool-call-error">
                      <strong>错误：</strong>
                      <pre>{{ tc.error }}</pre>
                    </div>
                  </div>
                </details>
              </div>
              <details class="thinking-wrap" v-if="msg.thinking_content" :open="false">
                <summary class="thinking-summary">深度思考</summary>
                <div class="thinking-content">{{ msg.thinking_content }}</div>
              </details>
              <div class="bubble">
                <div class="markdown-body" v-html="renderMarkdown(msg.content || defaultSummary(msg.tool_calls))"></div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="col">
              <div class="bubble">{{ msg.content }}</div>
              <div class="meta">{{ formatTime(msg.created_at) }}</div>
            </div>
            <div class="avatar user">问</div>
          </template>
        </div>

        <!-- Streaming message -->
        <div class="msg assistant" v-if="isStreaming">
          <div class="avatar assistant">农</div>
          <div class="col">
            <div v-if="streamToolCalls.length > 0" class="tool-calls-area">
              <details v-for="(tc, tci) in streamToolCalls" :key="'s-' + tci" class="tool-call-card" :class="tc.status" :open="true">
                <summary class="tool-call-summary">
                  <span class="tool-call-icon">{{ tc.status === 'error' ? '❌' : tc.status === 'completed' ? '✅' : '🔧' }}</span>
                  <span class="tool-call-name">调用了 {{ tc.tool_name }}</span>
                  <span class="tool-call-status" v-if="tc.status === 'started'">⏳ 运行中...</span>
                  <span class="tool-call-status" v-else-if="tc.status === 'completed'">✅ 完成</span>
                  <span class="tool-call-status" v-else>❌ 失败</span>
                </summary>
                <div class="tool-call-detail">
                  <div class="tool-call-section">
                    <strong>参数：</strong>
                    <pre>{{ JSON.stringify(tc.input, null, 2) }}</pre>
                  </div>
                  <div v-if="tc.status === 'completed' && tc.result" class="tool-call-section">
                    <strong>结果：</strong>
                    <pre>{{ typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2) }}</pre>
                  </div>
                  <div v-if="tc.status === 'error' && tc.error" class="tool-call-section tool-call-error">
                    <strong>错误：</strong>
                    <pre>{{ tc.error }}</pre>
                  </div>
                </div>
              </details>
            </div>
            <details class="thinking-wrap" v-if="streamThinking" :open="false">
              <summary class="thinking-summary">深度思考</summary>
              <div class="thinking-content">{{ streamThinking }}</div>
            </details>
            <div class="bubble">
              <div class="markdown-body" v-if="streamContent" v-html="renderMarkdown(streamContent)"></div>
              <span class="typing" v-else>
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Composer -->
    <Composer placeholder="请输入你的问题… (Enter 发送，Shift+Enter 换行)" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useChat } from '../composables/useChat'
import Composer from '../components/Composer.vue'

const router = useRouter()
const {
  conversations,
  currentConvId,
  messages,
  isStreaming,
  streamContent,
  streamThinking,
  streamToolCalls,
  loadConversations,
  renderMarkdown,
} = useChat()

function defaultSummary(toolCalls: any[] | null) {
  if (!toolCalls || toolCalls.length === 0) return ''
  const summaries: string[] = []
  for (const tc of toolCalls) {
    if (tc.status === 'completed') {
      summaries.push(`已完成 **${tc.tool_name}** 操作。`)
    }
  }
  return summaries.join('')
}

// ── State ──
const chatEl = ref<HTMLElement | null>(null)
const apiConnected = ref(false)
let healthIntervalId: ReturnType<typeof setInterval> | null = null

// ── Computed ──
const currentConvTitle = computed(() => {
  if (!currentConvId.value) return '新会话'
  const conv = conversations.value.find(c => c.id === currentConvId.value)
  return conv ? conv.title : '新会话'
})

function openMobileSidebar() {
  window.dispatchEvent(new CustomEvent('phenomics:toggle-sidebar'))
}

function exampleClick(text: string) {
  // populate composer input via event
  window.dispatchEvent(new CustomEvent('phenomics:example', { detail: text }))
}

function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

async function checkHealth() {
  try {
    const r = await fetch('/api/config')
    apiConnected.value = r.ok
  } catch { apiConnected.value = false }
}

watch([messages, streamContent], () => {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  })
})

onMounted(async () => {
  if (!localStorage.getItem('phenomics_token')) {
    router.push('/login')
    return
  }
  await loadConversations()
  await checkHealth()
  healthIntervalId = setInterval(checkHealth, 15000)
  await nextTick()
})

onUnmounted(() => {
  // Clean up the health-check interval so it doesn't keep running and
  // mutating state after the component is gone (M11).
  if (healthIntervalId !== null) {
    clearInterval(healthIntervalId)
    healthIntervalId = null
  }
})
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Topbar */
.topbar {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-light);
  background: var(--paper);
  gap: 12px;
  flex-shrink: 0;
}
.sidebar-toggle {
  width: 34px; height: 34px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--paper);
  color: var(--ink-muted); cursor: pointer;
  display: none;
  align-items: center; justify-content: center; font-size: 16px; transition: all .15s;
}
.sidebar-toggle:hover { background: var(--rice); color: var(--ink); }
.topbar-title {
  font-family: var(--display); font-weight: 600; font-size: 16px;
  color: var(--ink); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.top-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Chat */
.chat {
  flex: 1; overflow-y: auto; padding: 16px 0; scroll-behavior: smooth;
}
.chat::-webkit-scrollbar { width: 5px; }
.chat::-webkit-scrollbar-track { background: transparent; }
.chat::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
.chat-inner { max-width: 760px; margin: 0 auto; padding: 0 24px; }

/* Welcome */
.welcome {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 64px 24px 32px;
}
.welcome-icon {
  width: 64px; height: 64px; border-radius: 20px;
  background: var(--celadon-pale);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--display); font-weight: 700; font-size: 28px; color: var(--celadon);
  margin-bottom: 16px;
}
.welcome h2 {
  font-family: var(--display); font-weight: 700; font-size: 20px;
  color: var(--ink); letter-spacing: .02em; margin-bottom: 8px;
}
.welcome p { font-size: 14px; color: var(--ink-muted); max-width: 400px; line-height: 1.6; }
.welcome .examples {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px;
}
.welcome .examples span {
  font-size: 12px; color: var(--ink-muted);
  border: 1px solid var(--border); padding: 6px 14px; border-radius: 999px;
  cursor: pointer; transition: all .15s; background: var(--rice);
}
.welcome .examples span:hover {
  border-color: var(--celadon); color: var(--celadon); background: var(--celadon-pale);
}

/* Messages */
.msg { display: flex; gap: 12px; margin: 24px 0; align-items: flex-start; }
.msg.user { justify-content: flex-end; }
.msg > .col { min-width: 0; max-width: 86%; display: flex; flex-direction: column; }
.msg.user > .col { align-items: flex-end; }

.avatar {
  width: 34px; height: 34px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; flex-shrink: 0; font-family: var(--display); font-weight: 600;
}
.avatar.assistant { background: var(--celadon-pale); color: var(--celadon); border: 1px solid var(--celadon-dim); }
.avatar.user { background: var(--earth-pale); color: var(--earth); border: 1px solid var(--border); }

.bubble {
  display: inline-block; border-radius: 16px; padding: 10px 16px;
  line-height: 1.75; font-size: 14px;
  overflow-wrap: break-word;
}
.msg.assistant .bubble {
  background: var(--paper);
  border: 1px solid var(--border-light);
  color: var(--ink);
  position: relative;
  padding-left: 18px;
}
.msg.assistant .bubble::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 3px; border-radius: 2px;
  background: var(--celadon-dim);
  opacity: .45;
}
.msg.user .bubble {
  background: var(--rice-dark);
  color: var(--ink);
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(26,26,46,.04);
  white-space: pre-wrap;
}

.meta { font-size: 11px; color: var(--ink-muted); margin-top: 6px; padding: 0 4px; }

/* Thinking block */
.thinking-wrap {
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  overflow: hidden;
}
.thinking-summary {
  padding: 8px 12px; font-size: 12px; font-family: var(--mono);
  color: var(--ink-muted); cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 6px;
}
.thinking-summary:hover { background: var(--rice); }
.thinking-summary::before {
  content: '▶'; display: inline-block; transition: transform .2s;
  font-size: 10px; color: var(--celadon-dim);
}
.thinking-wrap[open] .thinking-summary::before { transform: rotate(90deg); }
.thinking-content {
  padding: 10px 14px 14px; font-size: 13px; font-family: var(--mono);
  color: var(--ink-muted); line-height: 1.6; white-space: pre-wrap;
  background: var(--rice); border-top: 1px solid var(--border-light);
}

/* Typing indicator */
.typing { display: inline-flex; gap: 5px; align-items: center; padding: 2px 0; }
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--celadon-dim);
  animation: bounce 1.3s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: .16s; }
.dot:nth-child(3) { animation-delay: .32s; }
@keyframes bounce {
  0%,80%,100% { transform: translateY(0); opacity: .6; }
  40% { transform: translateY(-6px); opacity: 1; }
}

/* Markdown in assistant bubbles */
.msg.assistant .markdown-body {
  background: transparent; color: var(--ink);
  font-family: var(--body); font-size: 14px; line-height: 1.75;
}
.msg.assistant .markdown-body h1,
.msg.assistant .markdown-body h2,
.msg.assistant .markdown-body h3,
.msg.assistant .markdown-body h4,
.msg.assistant .markdown-body h5,
.msg.assistant .markdown-body h6 {
  font-family: var(--display); color: var(--ink); margin: 1em 0 0.4em;
  font-weight: 700; line-height: 1.3;
}
.msg.assistant .markdown-body h1 { font-size: 16px; border-bottom: none; }
.msg.assistant .markdown-body h2 { font-size: 15px; }
.msg.assistant .markdown-body h3 { font-size: 14px; }
.msg.assistant .markdown-body p { margin: 0 0 0.65em; }
.msg.assistant .markdown-body p:last-child { margin-bottom: 0; }
.msg.assistant .markdown-body ul, .msg.assistant .markdown-body ol { padding-left: 1.4em; margin: 0.4em 0; }
.msg.assistant .markdown-body li { margin: 0.2em 0; }
.msg.assistant .markdown-body li > p { margin: 0; }
.msg.assistant .markdown-body code {
  background: var(--rice-dark); color: var(--ink-light);
  padding: 2px 6px; border-radius: 5px;
  font-family: var(--mono); font-size: 12px;
}
.msg.assistant .markdown-body pre {
  background: var(--rice-dark); border: 1px solid var(--border);
  border-radius: 10px; padding: 14px; overflow-x: auto; margin: 0.65em 0;
  box-shadow: inset 0 1px 4px rgba(0,0,0,.03);
}
.msg.assistant .markdown-body pre code {
  background: none; padding: 0; border-radius: 0;
  font-size: 12px; line-height: 1.6;
}
.msg.assistant .markdown-body table { border-collapse: collapse; margin: 0.65em 0; font-size: 13px; width: 100%; }
.msg.assistant .markdown-body th, .msg.assistant .markdown-body td {
  border: 1px solid var(--border); padding: 8px 12px; text-align: left;
}
.msg.assistant .markdown-body th { background: var(--rice-dark); font-weight: 600; font-family: var(--display); }
.msg.assistant .markdown-body blockquote {
  border-left: 3px solid var(--celadon-dim); padding: 6px 14px;
  margin: 0.65em 0; color: var(--ink-muted); background: var(--rice);
  border-radius: 0 8px 8px 0; line-height: 1.6;
}
.msg.assistant .markdown-body a { color: var(--ink-blue); text-decoration: underline; text-underline-offset: 2px; }
.msg.assistant .markdown-body a:hover { color: var(--ink-blue-hover); }
.msg.assistant .markdown-body hr { border: none; border-top: 1px solid var(--border-light); margin: 1em 0; }
.msg.assistant .markdown-body strong { font-weight: 700; color: var(--ink); }
.msg.assistant .markdown-body img { max-width: 100%; border-radius: 8px; margin: 0.5em 0; }

/* Tool Call Cards */
.tool-calls-area { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.tool-call-card { border: 1px solid var(--border); border-radius: 10px; background: transparent; overflow: hidden; }
.tool-call-card.error { border-color: var(--earth); }
.tool-call-summary {
  padding: 8px 12px; font-size: 13px; cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 6px; color: var(--ink-light);
}
.tool-call-summary:hover { background: var(--rice); }
.tool-call-summary::before {
  content: '▶'; display: inline-block; transition: transform .2s;
  font-size: 10px; color: var(--celadon-dim);
}
.tool-call-card[open] .tool-call-summary::before { transform: rotate(90deg); }
.tool-call-icon { font-size: 14px; flex-shrink: 0; }
.tool-call-name { font-weight: 600; font-family: var(--mono); font-size: 12px; }
.tool-call-status { margin-left: auto; font-size: 11px; color: var(--ink-muted); font-family: var(--mono); }
.tool-call-detail { padding: 8px 12px 12px; border-top: 1px solid var(--border-light); background: #faf8f4; font-size: 13px; }
.tool-call-section { margin-bottom: 8px; }
.tool-call-section:last-child { margin-bottom: 0; }
.tool-call-section strong { display: block; font-size: 11px; color: var(--ink-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
.tool-call-section pre {
  background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
  font-family: var(--mono); font-size: 12px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; color: var(--ink-light);
}
.tool-call-error pre { color: var(--earth); border-color: var(--earth); background: #fff8f2; }

@media (max-width: 768px) {
  .sidebar-toggle { display: flex; }
  .topbar { padding: 10px 16px; }
  .chat-inner { padding: 0 16px; }
  .msg > .col { max-width: 88%; }
  .msg { margin: 18px 0; }
}
</style>
