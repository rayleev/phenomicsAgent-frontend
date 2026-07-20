<template>
  <div class="app-layout" style="display:flex;height:100%">
    <!-- Mobile mask -->
    <div class="sidebar-mask" :class="{ show: mobileSidebarOpen }" @click="mobileSidebarOpen = false"></div>

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed, open: mobileSidebarOpen }">
      <div class="sidebar-brand">
        <div class="brand-icon">稻</div>
        <span class="brand-label">phenomicsAgent</span>
      </div>

      <!-- User info -->
      <div class="sidebar-user">
        <div class="sidebar-user-avatar">{{ userInitial }}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">{{ user?.username }}</div>
          <div class="sidebar-user-role">{{ user?.role === 'admin' ? '管理员' : '用户' }}</div>
        </div>
      </div>

      <!-- Conversation list -->
      <div class="conv-list">
        <div v-if="conversations.length === 0" class="conv-empty">暂无会话</div>
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === currentConvId }"
          @click="selectConv(conv.id)"
          @dblclick="startRename(conv)"
        >
          <span class="conv-item-title">{{ conv.title }}</span>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="nav-item" @click="sidebarCollapsed = !sidebarCollapsed" v-if="!mobileSidebarOpen">
          <span class="nav-icon">{{ sidebarCollapsed ? '▶' : '◀' }}</span>
          <span class="nav-label">{{ sidebarCollapsed ? '展开' : '收起侧栏' }}</span>
        </div>
        <div class="nav-item" @click="openConfig">
          <span class="nav-icon">⚙</span>
          <span class="nav-label">设置</span>
        </div>
        <div class="nav-item" @click="logout">
          <span class="nav-icon">🚪</span>
          <span class="nav-label">退出登录</span>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <div class="main">
      <header class="topbar">
        <button class="sidebar-toggle show" @click="toggleMobileSidebar" aria-label="打开侧栏">☰</button>
        <span class="topbar-title">{{ currentConvTitle }}</span>
        <div class="top-actions">
          <span class="pill" :class="{ ok: apiConnected }">{{ apiConnected ? 'API 已连接' : 'API 未连接' }}</span>
          <button class="btn-ghost" @click="newConversation">新建</button>
          <button class="btn-ghost" @click="clearConversation" :disabled="!currentConvId">清空</button>
        </div>
      </header>

      <!-- Chat area -->
      <div class="chat" ref="chatEl">
        <div class="chat-inner">
          <!-- Welcome screen -->
          <div class="welcome" v-if="messages.length === 0 && !streamContent && !streamThinking">
            <div class="welcome-icon">稻</div>
            <h2>你好，{{ user?.username || '用户' }}</h2>
            <p>提交你的问题，AI 将为你解答。</p>
            <div class="examples">
              <span @click="exampleClick('什么是基因编辑育种技术？')">基因编辑育种</span>
              <span @click="exampleClick('水稻的耐盐性研究进展')">耐盐性研究</span>
              <span @click="exampleClick('作物表型数据有哪些类型？')">作物表型数据</span>
            </div>
          </div>

          <!-- Rename input -->
          <div class="rename-bar" v-if="renamingConv">
            <input v-model="renameTitle" @keydown.enter="doRename" @keydown.escape="cancelRename" ref="renameInput" />
            <button class="btn-ghost" @click="doRename">确定</button>
            <button class="btn-ghost" @click="cancelRename">取消</button>
          </div>

          <!-- Messages -->
          <div v-for="msg in messages" :key="msg.id" class="msg" :class="msg.role">
            <template v-if="msg.role === 'assistant'">
              <div class="avatar bot">稻</div>
              <div class="col">
                <!-- Tool calls cards -->
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
                  <div class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
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
          <div class="msg bot" v-if="isStreaming">
            <div class="avatar bot">稻</div>
            <div class="col">
              <!-- In-stream tool call cards -->
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

      <!-- Composer (DeepSeek style: model selector + thinking toggle integrated) -->
      <div class="composer-wrap">
        <div class="composer-inner">
          <!-- Model & tools row (above input) -->
          <div class="composer-tools">
            <select class="composer-model-select" v-model="activeProviderId" @change="onProviderChange">
              <option value="" disabled>选择模型</option>
              <option v-for="p in userProviders" :key="p.id" :value="p.id">
                {{ p.provider_name }} · {{ p.model }}
              </option>
            </select>
            <button
              class="composer-tool-btn"
              :class="{ active: thinkingEnabled }"
              @click="thinkingEnabled = !thinkingEnabled"
              title="深度思考"
            >
              <span class="tool-icon">🧠</span>
              <span class="tool-label">深度思考</span>
            </button>
            <div class="services-dropdown">
              <button
                class="composer-tool-btn"
                :class="{ active: enabledServiceNames.length > 0 }"
                @click="servicesDropdownOpen = !servicesDropdownOpen"
                title="选择模型可调用的服务"
              >
                <span class="tool-icon">🔧</span>
                <span class="tool-label">
                  服务
                  <span class="services-badge" v-if="enabledServiceNames.length > 0">{{ enabledServiceNames.length }}</span>
                </span>
              </button>
              <div class="services-dropdown-panel" v-if="servicesDropdownOpen" @click.stop>
                <div class="services-dropdown-header">已注册服务</div>
                <label
                  v-for="svc in serviceList"
                  :key="svc.name"
                  class="services-dropdown-item"
                >
                  <input
                    type="checkbox"
                    :checked="enabledServiceNames.includes(svc.name)"
                    @change="toggleService(svc.name)"
                  />
                  <span class="services-dropdown-name">{{ svc.name }}</span>
                  <span class="services-dropdown-desc">{{ svc.description }}</span>
                </label>
                <div class="services-dropdown-empty" v-if="serviceList.length === 0">
                  暂无可用服务
                </div>

                <!-- Separator + Add custom service -->
                <div class="services-dropdown-divider"></div>
                <div>
                  <button class="services-dropdown-add-btn" @click="openAddService">
                    <span class="services-dropdown-add-icon">+</span>
                    <span>添加自定义服务</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Input row -->
          <div class="composer">
            <textarea
              ref="inputEl"
              v-model="inputText"
              placeholder="输入你的问题… (Enter 发送，Shift+Enter 换行)"
              rows="1"
              @keydown="onKeydown"
              @input="autoResize"
              :disabled="isStreaming"
            ></textarea>
            <button class="send" @click="onSend" :disabled="isStreaming || !inputText.trim()">发送</button>
          </div>
          <div class="hint">
            <span class="kbd">↵</span> 发送 · <span class="kbd">⇧</span>+<span class="kbd">↵</span> 换行
          </div>
        </div>
      </div>
    </div>

    <!-- Config Panel -->
    <div class="config-overlay" v-if="showConfig" @click.self="showConfig = false">
      <div class="config-panel config-panel--wide">
        <h2>{{ editingNew ? '添加供应商' : '供应商配置' }}</h2>

        <template v-if="!editingNew">
          <div class="config-provider-list">
            <div
              v-for="(p, name) in editProviders"
              :key="name"
              class="config-provider-card"
              :class="{ active: editActiveProvider === name }"
              @click="editActiveProvider = name"
            >
              <div class="card-body" style="flex:1">
                <div class="card-name">{{ name }}</div>
                <div class="card-model">{{ p.model }}</div>
              </div>
              <div class="card-actions">
                <span class="card-btn-edit" @click.stop="startEditingProvider(name)" title="编辑">✎</span>
                <span class="card-btn-del" @click.stop="removeProvider(name)" title="删除">✕</span>
              </div>
            </div>
            <div class="config-provider-card config-provider-card--add" @click="startAddProvider">
              <span style="font-size:20px;color:var(--celadon)">+</span>
              <span style="font-size:13px;color:var(--ink-muted)">添加供应商</span>
            </div>
          </div>
        </template>

        <template v-if="editingNew">
          <div class="config-group">
            <label>名称</label>
            <input v-model="editingName" placeholder="my-model" :disabled="!isNewProvider" />
          </div>
          <div class="config-group">
            <label>协议</label>
            <select v-model="editingProtocol">
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div class="config-group">
            <label>Model</label>
            <input v-model="editingModel" placeholder="claude-sonnet-4-20250514" />
          </div>
          <div class="config-group">
            <label>Base URL</label>
            <input v-model="editingBaseUrl" placeholder="https://api.anthropic.com" />
          </div>
          <div class="config-group">
            <label>API Key</label>
            <div class="config-api-key-wrap">
              <input
                :type="showEditingKey ? 'text' : 'password'"
                v-model="editingApiKey"
                :placeholder="isNewProvider ? 'sk-...' : '留空则不修改'"
              />
              <span class="toggle-vis" @click="showEditingKey = !showEditingKey">
                {{ showEditingKey ? '隐藏' : '显示' }}
              </span>
            </div>
          </div>
        </template>

        <div class="config-actions">
          <template v-if="editingNew">
            <button class="btn-ghost" @click="cancelEditingProvider">取消</button>
            <button class="btn-primary" @click="saveEditingProvider">
              {{ isNewProvider ? '添加' : '保存修改' }}
            </button>
          </template>
          <template v-else>
            <button class="btn-ghost" @click="showConfig = false">关闭</button>
          </template>
        </div>
      </div>
    </div>

    <!-- Add Service Modal -->
    <div class="config-overlay" v-if="showAddServiceModal" @click.self="cancelAddService">
      <div class="config-panel">
        <h2>添加自定义服务</h2>

        <div class="config-group">
          <label>名称 *</label>
          <input v-model="newService.name" placeholder="my_service" />
        </div>
        <div class="config-group">
          <label>描述</label>
          <input v-model="newService.description" placeholder="描述此服务的功能，模型据此决定何时调用" />
        </div>
        <div class="config-group">
          <label>URL *</label>
          <input v-model="newService.url" placeholder="https://api.example.com/endpoint" />
        </div>
        <div class="config-group">
          <label>方法</label>
          <select v-model="newService.method">
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div class="config-group">
          <label>请求体模板 (JSON)</label>
          <textarea
            v-model="newService.requestTemplate"
            :placeholder="`{\\\&quot;city\\\&quot;: \\\&quot;{city}\\\&quot;, \\\&quot;days\\\&quot;: 3}  {param} 为参数占位，将由模型填写`"
            rows="4"
          ></textarea>
        </div>
        <div class="config-group">
          <label>请求头 (JSON, 可选)</label>
          <input v-model="newService.headers" placeholder='{"Content-Type": "application/json"}' />
        </div>
        <div class="config-group">
          <label>超时 (秒)</label>
          <input v-model.number="newService.timeout" type="number" placeholder="30" />
        </div>

        <div class="services-add-error" v-if="addServiceError">{{ addServiceError }}</div>

        <div class="config-actions">
          <button class="btn-ghost" @click="cancelAddService">取消</button>
          <button class="btn-primary" @click="submitAddService" :disabled="addingService">
            {{ addingService ? '注册中...' : '注册服务' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useChat } from '../composables/useChat'
import { useAuth } from '../composables/useAuth'

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
  loadMessages,
  deleteConversation,
  sendMessage,
  selectConversation,
  newConversation,
  renderMarkdown,
} = useChat()

const { user, logout, authHeaders } = useAuth()

const userInitial = computed(() => {
  return (user.value?.username?.[0] || '?').toUpperCase()
})

// ── State ──
const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const inputText = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const chatEl = ref<HTMLElement | null>(null)
const apiConnected = ref(false)
const thinkingEnabled = ref(false)
const servicesDropdownOpen = ref(false)
const serviceList = ref<{ name: string; description: string; url?: string; method?: string }[]>([])
const enabledServiceNames = ref<string[]>([])
const showAddServiceModal = ref(false)
const addingService = ref(false)
const addServiceError = ref('')
const newService = ref({
  name: '',
  description: '',
  url: '',
  method: 'POST',
  requestTemplate: '',
  headers: '',
  timeout: 30,
})
const activeProviderId = ref('')

// ── User config state ──
const showConfig = ref(false)
const userProviders = ref<any[]>([])
const editProviders = ref<Record<string, any>>({})
const editActiveProvider = ref('')
const editingNew = ref(false)
const isNewProvider = ref(false)
const editingName = ref('')
const editingProtocol = ref('anthropic')
const editingModel = ref('')
const editingBaseUrl = ref('')
const editingApiKey = ref('')
const showEditingKey = ref(false)

// ── Rename ──
const renamingConv = ref(false)
const renameConvId = ref<string | null>(null)
const renameTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

// ── Computed ──
const currentConvTitle = computed(() => {
  if (!currentConvId.value) return '新会话'
  const conv = conversations.value.find(c => c.id === currentConvId.value)
  return conv ? conv.title : '新会话'
})

// ── Sidebar ──
function toggleMobileSidebar() {
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

async function selectConv(id: string) {
  await selectConversation(id)
  if (mobileSidebarOpen.value) mobileSidebarOpen.value = false
}

function startRename(conv: any) {
  renamingConv.value = true
  renameConvId.value = conv.id
  renameTitle.value = conv.title
  nextTick(() => renameInput.value?.focus())
}

async function doRename() {
  if (!renameConvId.value || !renameTitle.value.trim()) return
  try {
    await fetch(`/api/conversations/${renameConvId.value}/rename`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameTitle.value.trim() }),
    })
    await loadConversations()
  } catch {}
  cancelRename()
}

function cancelRename() {
  renamingConv.value = false
  renameConvId.value = null
  renameTitle.value = ''
}

async function clearConversation() {
  if (!currentConvId.value) return
  if (!confirm('确定清空当前会话？')) return
  await deleteConversation(currentConvId.value)
}

// ── Chat ──
async function onSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''
  if (inputEl.value) inputEl.value.style.height = 'auto'
  await sendMessage(text, thinkingEnabled.value, enabledServiceNames.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSend()
  }
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}

function exampleClick(text: string) {
  inputText.value = text
  if (inputEl.value) autoResize()
  inputEl.value?.focus()
}

function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

// ── User providers config ──
async function loadUserProviders() {
  try {
    const r = await fetch('/api/user/providers', { headers: authHeaders() })
    if (!r.ok) return
    userProviders.value = await r.json()
    editProviders.value = {}
    for (const p of userProviders.value) {
      editProviders.value[p.provider_name] = {
        id: p.id,
        protocol: p.protocol,
        model: p.model,
        base_url: p.base_url,
        api_key_masked: p.api_key_masked,
        is_active: p.is_active,
      }
      if (p.is_active) {
        editActiveProvider.value = p.provider_name
        activeProviderId.value = p.id
      }
    }
    // If there's at least one provider but none active, activate the first one
    if (!activeProviderId.value && userProviders.value.length > 0) {
      await switchProvider(userProviders.value[0].id)
    }
  } catch {}
}

async function onProviderChange() {
  if (!activeProviderId.value) return
  await switchProvider(activeProviderId.value)
}

async function switchProvider(providerId: string) {
  try {
    await fetch(`/api/user/providers/${providerId}/activate`, {
      method: 'PUT',
      headers: authHeaders(),
    })
    activeProviderId.value = providerId
    await loadUserProviders()
  } catch {}
}

function openConfig() {
  loadUserProviders()
  editingNew.value = false
  showConfig.value = true
}

function startEditingProvider(name: string) {
  const p = editProviders.value[name]
  if (!p) return
  editingName.value = name
  editingProtocol.value = p.protocol
  editingModel.value = p.model
  editingBaseUrl.value = p.base_url
  editingApiKey.value = ''
  isNewProvider.value = false
  editingNew.value = true
}

function startAddProvider() {
  editingName.value = ''
  editingProtocol.value = 'anthropic'
  editingModel.value = ''
  editingBaseUrl.value = ''
  editingApiKey.value = ''
  isNewProvider.value = true
  editingNew.value = true
}

function cancelEditingProvider() {
  editingNew.value = false
}

async function saveEditingProvider() {
  const name = editingName.value.trim()
  if (!name) { alert('请输入供应商名称'); return }
  if (!editingModel.value.trim()) { alert('请输入模型名称'); return }
  if (!editingBaseUrl.value.trim()) { alert('请输入 Base URL'); return }
  if (isNewProvider.value && !editingApiKey.value.trim()) { alert('请输入 API Key'); return }

  const existing = editProviders.value[name]
  const body: any = {
    provider_name: name,
    protocol: editingProtocol.value,
    model: editingModel.value.trim(),
    base_url: editingBaseUrl.value.trim(),
    api_key: editingApiKey.value.trim() || '',
  }
  if (!isNewProvider.value && existing?.id) {
    body.id = existing.id
  }

  try {
    const r = await fetch('/api/user/providers', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(await r.text())
    editingNew.value = false
    await loadUserProviders()
  } catch (e: any) {
    alert('保存失败: ' + e.message)
  }
}

async function removeProvider(name: string) {
  const p = editProviders.value[name]
  if (!p?.id) return
  if (!confirm(`确定删除供应商「${name}」？`)) return
  try {
    await fetch(`/api/user/providers/${p.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    await loadUserProviders()
  } catch {}
}

// ── Services ──
function toggleService(name: string) {
  const idx = enabledServiceNames.value.indexOf(name)
  if (idx !== -1) {
    enabledServiceNames.value.splice(idx, 1)
  } else {
    enabledServiceNames.value.push(name)
  }
}

function cancelAddService() {
  showAddServiceModal.value = false
  addServiceError.value = ''
  newService.value = { name: '', description: '', url: '', method: 'POST', requestTemplate: '', headers: '', timeout: 30 }
}

function openAddService() {
  servicesDropdownOpen.value = false
  showAddServiceModal.value = true
}

async function submitAddService() {
  const svc = newService.value
  if (!svc.name.trim()) { addServiceError.value = '请输入服务名称'; return }
  if (!svc.url.trim()) { addServiceError.value = '请输入 URL'; return }

  addingService.value = true
  addServiceError.value = ''

  let requestTemplate = {}
  let headers = {}

  if (svc.requestTemplate.trim()) {
    try {
      requestTemplate = JSON.parse(svc.requestTemplate.trim())
    } catch {
      addServiceError.value = '请求体模板不是有效的 JSON'
      addingService.value = false
      return
    }
  }
  if (svc.headers.trim()) {
    try {
      headers = JSON.parse(svc.headers.trim())
    } catch {
      addServiceError.value = '请求头不是有效的 JSON'
      addingService.value = false
      return
    }
  }

  try {
    const r = await fetch('/api/services', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: svc.name.trim(),
        description: svc.description.trim(),
        url: svc.url.trim(),
        method: svc.method,
        headers,
        request_template: requestTemplate,
        timeout: svc.timeout || 30,
      }),
    })
    if (!r.ok) {
      const err = await r.json()
      addServiceError.value = err.detail || '注册失败'
      return
    }
    // Success
    cancelAddService()
    await loadServices()
  } catch (e: any) {
    addServiceError.value = '网络错误: ' + e.message
  } finally {
    addingService.value = false
  }
}

async function loadServices() {
  try {
    const r = await fetch(`/api/services`, { headers: authHeaders() })
    if (r.ok) serviceList.value = await r.json()
  } catch {}
}

// Close services dropdown on outside click
function onServicesDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (servicesDropdownOpen.value && !target.closest('.services-dropdown')) {
    servicesDropdownOpen.value = false
  }
}

// ── Health ──
async function checkHealth() {
  try {
    const r = await fetch('/api/config')
    apiConnected.value = r.ok
  } catch { apiConnected.value = false }
}

// ── Auto-scroll ──
watch([messages, streamContent], () => {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  })
})

// ── Init ──
onMounted(async () => {
  if (!localStorage.getItem('phenomics_token')) {
    router.push('/login')
    return
  }
  await loadConversations()
  await loadUserProviders()
  await loadServices()
  await checkHealth()
  setInterval(checkHealth, 15000)
  document.addEventListener('click', onServicesDocClick)
  setTimeout(() => inputEl.value?.focus(), 200)
})
</script>
