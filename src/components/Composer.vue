<template>
  <div class="composer-wrap">
    <div class="composer">
      <!-- Floating pill input bar -->
      <div class="composer-pill">
        <textarea
          ref="inputEl"
          v-model="inputText"
          :placeholder="placeholder"
          rows="1"
          @keydown="onKeydown"
          @input="autoResize"
          :disabled="isStreaming"
        ></textarea>
        <button
          v-if="!isStreaming"
          class="send-btn"
          @click="onSend"
          :disabled="!inputText.trim()"
          aria-label="发送"
        >
          <span class="send-arrow">➤</span>
        </button>
        <button
          v-else
          class="send-btn stop"
          @click="stopStreaming"
          aria-label="停止生成"
        >
          <span class="stop-icon"></span>
        </button>
      </div>

      <!-- Chips row -->
      <div class="composer-chips">
        <div class="chips-left">
          <button
            v-if="showThinking"
            class="chip"
            :class="{ active: thinkingEnabled }"
            @click="thinkingEnabled = !thinkingEnabled"
            title="深度思考"
          >
            <span class="chip-icon">🧠</span>
            <span class="chip-label">深度思考</span>
          </button>
          <div class="chip-dropdown" v-if="showServices">
            <button
              class="chip"
              :class="{ active: enabledServiceNames.length > 0 }"
              @click="servicesDropdownOpen = !servicesDropdownOpen"
              title="选择模型可调用的服务"
            >
              <span class="chip-icon">🔧</span>
              <span class="chip-label">
                服务调用
                <span class="chip-badge" v-if="enabledServiceNames.length > 0">{{ enabledServiceNames.length }}</span>
              </span>
            </button>
            <div class="chip-dropdown-panel" v-if="servicesDropdownOpen" @click.stop>
              <div class="chip-dropdown-header">已注册服务</div>
              <label v-for="svc in serviceList" :key="svc.name" class="chip-dropdown-item">
                <input
                  type="checkbox"
                  :checked="enabledServiceNames.includes(svc.name)"
                  @change="toggleService(svc.name)"
                />
                <span class="chip-dropdown-name">{{ svc.name }}</span>
                <span class="chip-dropdown-desc">{{ svc.description }}</span>
              </label>
              <div class="chip-dropdown-empty" v-if="serviceList.length === 0">暂无可用服务</div>
              <div class="chip-dropdown-divider"></div>
              <button class="chip-dropdown-add-btn" @click="openAddService">
                <span class="chip-dropdown-add-icon">+</span>
                <span>添加自定义服务</span>
              </button>
            </div>
          </div>
        </div>

        <div class="chips-right">
          <div class="chip-dropdown">
            <button
              class="chip model-chip"
              @click="modelDropdownOpen = !modelDropdownOpen"
              title="选择模型"
            >
              <span class="chip-icon">🤖</span>
              <span class="chip-label">{{ activeModelLabel }}</span>
              <span class="chip-caret">▾</span>
            </button>
            <div class="chip-dropdown-panel model-panel" v-if="modelDropdownOpen" @click.stop>
              <label
                v-for="p in userProviders"
                :key="p.id"
                class="chip-dropdown-item"
                :class="{ active: p.id === activeProviderId }"
                @click="selectProvider(p.id)"
              >
                <span class="chip-dropdown-name">{{ p.provider_name }}</span>
                <span class="chip-dropdown-desc">{{ p.model }}</span>
              </label>
              <div class="chip-dropdown-divider"></div>
              <button class="chip-dropdown-add-btn" @click="openConfig">
                <span class="chip-dropdown-add-icon">⚙</span>
                <span>自定义模型</span>
              </button>
            </div>
          </div>
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
          :placeholder="`{\\&quot;city\\&quot;: \\&quot;{city}\\&quot;, \\&quot;days\\&quot;: 3}  {param} 为参数占位，将由模型填写`"
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useChat } from '../composables/useChat'
import { useAuth } from '../composables/useAuth'

const props = withDefaults(defineProps<{
  placeholder?: string
  showThinking?: boolean
  showServices?: boolean
  fixedServices?: string[] | null
}>(), {
  placeholder: '输入你的问题… (Enter 发送，Shift+Enter 换行)',
  showThinking: true,
  showServices: true,
  fixedServices: null,
})

const emit = defineEmits<{ send: [text: string] }>()

const { isStreaming, loadConversations, sendMessage, abortStream, newConversation, selectConversation } = useChat()
const { authHeaders } = useAuth()

// ── Input ──
const inputText = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const thinkingEnabled = ref(false)
const servicesDropdownOpen = ref(false)
const serviceList = ref<{ name: string; description: string; url?: string; method?: string }[]>([])
const enabledServiceNames = ref<string[]>([])
const modelDropdownOpen = ref(false)

// ── Config panel state ──
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

// ── Add service state ──
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

const activeProviderId = computed({
  get() {
    const active = userProviders.value.find((p: any) => p.is_active)
    return active?.id || ''
  },
  set() { /* set via selectProvider */ },
})

const activeModelLabel = computed(() => {
  const active = userProviders.value.find((p: any) => p.is_active)
  return active ? `${active.provider_name} · ${active.model}` : '选择模型'
})

// ── Actions ──
async function onSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''
  if (inputEl.value) inputEl.value.style.height = 'auto'
  const services = props.fixedServices ?? enabledServiceNames.value
  await sendMessage(text, props.showThinking ? thinkingEnabled.value : false, services)
  emit('send', text)
}

function stopStreaming() {
  abortStream()
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

function selectProvider(providerId: string) {
  modelDropdownOpen.value = false
  switchProvider(providerId)
}

// ── Providers ──
async function loadUserProviders() {
  try {
    const r = await fetch('/api/user/providers', { headers: authHeaders() })
    if (!r.ok) return
    userProviders.value = await r.json()
    editProviders.value = {}
    for (const p of userProviders.value) {
      editProviders.value[p.provider_name] = {
        id: p.id, protocol: p.protocol, model: p.model,
        base_url: p.base_url, api_key_masked: p.api_key_masked, is_active: p.is_active,
      }
      if (p.is_active) {
        editActiveProvider.value = p.provider_name
      }
    }
    if (!activeProviderId.value && userProviders.value.length > 0) {
      await switchProvider(userProviders.value[0].id)
    }
  } catch {}
}

async function switchProvider(providerId: string) {
  try {
    await fetch(`/api/user/providers/${providerId}/activate`, { method: 'PUT', headers: authHeaders() })
    await loadUserProviders()
  } catch {}
}

function openConfig() {
  modelDropdownOpen.value = false
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

function cancelEditingProvider() { editingNew.value = false }

async function saveEditingProvider() {
  const name = editingName.value.trim()
  if (!name) { alert('请输入供应商名称'); return }
  if (!editingModel.value.trim()) { alert('请输入模型名称'); return }
  if (!editingBaseUrl.value.trim()) { alert('请输入 Base URL'); return }
  if (isNewProvider.value && !editingApiKey.value.trim()) { alert('请输入 API Key'); return }

  const existing = editProviders.value[name]
  const body: any = {
    provider_name: name, protocol: editingProtocol.value,
    model: editingModel.value.trim(), base_url: editingBaseUrl.value.trim(),
    api_key: editingApiKey.value.trim() || '',
  }
  if (!isNewProvider.value && existing?.id) body.id = existing.id

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
    await fetch(`/api/user/providers/${p.id}`, { method: 'DELETE', headers: authHeaders() })
    await loadUserProviders()
  } catch {}
}

// ── Services ──
function toggleService(name: string) {
  const idx = enabledServiceNames.value.indexOf(name)
  if (idx !== -1) enabledServiceNames.value.splice(idx, 1)
  else enabledServiceNames.value.push(name)
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
  let requestTemplate: any = {}
  let headers: any = {}
  if (svc.requestTemplate.trim()) {
    try { requestTemplate = JSON.parse(svc.requestTemplate.trim()) }
    catch { addServiceError.value = '请求体模板不是有效的 JSON'; addingService.value = false; return }
  }
  if (svc.headers.trim()) {
    try { headers = JSON.parse(svc.headers.trim()) }
    catch { addServiceError.value = '请求头不是有效的 JSON'; addingService.value = false; return }
  }
  try {
    const r = await fetch('/api/services', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: svc.name.trim(), description: svc.description.trim(), url: svc.url.trim(),
        method: svc.method, headers, request_template: requestTemplate, timeout: svc.timeout || 30,
      }),
    })
    if (!r.ok) { const err = await r.json(); addServiceError.value = err.detail || '注册失败'; return }
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
    const r = await fetch('/api/services', { headers: authHeaders() })
    if (r.ok) serviceList.value = await r.json()
  } catch {}
}

function onServicesDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (servicesDropdownOpen.value && !target.closest('.chip-dropdown')) {
    servicesDropdownOpen.value = false
  }
  if (modelDropdownOpen.value && !target.closest('.chip-dropdown')) {
    modelDropdownOpen.value = false
  }
}

onMounted(async () => {
  await loadUserProviders()
  await loadServices()
  document.addEventListener('click', onServicesDocClick)
  window.addEventListener('phenomics:example', onExample as EventListener)
  setTimeout(() => inputEl.value?.focus(), 200)
})

onUnmounted(() => {
  document.removeEventListener('click', onServicesDocClick)
  window.removeEventListener('phenomics:example', onExample as EventListener)
})

function onExample(e: CustomEvent) {
  inputText.value = e.detail
  nextTick(() => {
    autoResize()
    inputEl.value?.focus()
  })
}
</script>

<style scoped>
.composer-wrap {
  flex-shrink: 0;
  padding: 12px 24px 16px;
  background: transparent;
}
.composer {
  max-width: 760px;
  margin: 0 auto;
}

/* Pill-shaped input bar */
.composer-pill {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 10px 12px 10px 20px;
  box-shadow: 0 4px 20px rgba(26, 26, 46, .08), 0 1px 3px rgba(26, 26, 46, .04);
  transition: box-shadow .2s, border-color .2s;
}
.composer-pill:focus-within {
  border-color: var(--celadon);
  box-shadow: 0 4px 24px rgba(136, 184, 147, .15), 0 1px 3px rgba(26, 26, 46, .04);
}
.composer-pill textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  min-height: 24px;
  max-height: 140px;
  font-size: 14px;
  line-height: 1.6;
  font-family: var(--body);
  color: var(--ink);
  padding: 6px 0;
}
.composer-pill textarea::placeholder {
  color: var(--ink-muted);
  opacity: .65;
}

.send-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--celadon);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s, transform .1s;
}
.send-btn:hover { background: #76a87e; }
.send-btn:active { transform: scale(.94); }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }
.send-arrow { font-size: 18px; transform: rotate(0deg); }
.send-btn.stop { background: var(--ink-light); }
.send-btn.stop:hover { background: var(--ink-muted); }
.stop-icon {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 3px;
}

/* Chips row */
.composer-chips {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding: 0 8px;
}
.chips-left, .chips-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--ink-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
  font-family: var(--body);
  user-select: none;
  white-space: nowrap;
}
.chip:hover {
  border-color: var(--celadon-dim);
  color: var(--ink);
  background: var(--rice);
}
.chip.active {
  border-color: var(--celadon);
  background: var(--celadon-pale);
  color: var(--celadon);
}
.chip-icon { font-size: 13px; }
.chip-label { display: inline-flex; align-items: center; gap: 4px; }
.chip-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--celadon); color: #fff;
  font-size: 10px; font-weight: 700; font-family: var(--mono);
}
.chip-caret { font-size: 10px; opacity: .6; margin-left: 2px; }

/* Dropdown */
.chip-dropdown { position: relative; }
.chip-dropdown-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  min-width: 300px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  padding: 6px;
}
.chip-dropdown-panel.model-panel {
  left: auto;
  right: 0;
  min-width: 240px;
}
.chip-dropdown-header {
  font-size: 11px; font-weight: 600; color: var(--ink-muted);
  text-transform: uppercase; letter-spacing: .03em;
  padding: 6px 10px 8px; border-bottom: 1px solid var(--border-light); margin-bottom: 4px;
}
.chip-dropdown-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  transition: background .12s;
}
.chip-dropdown-item:hover { background: var(--rice); }
.chip-dropdown-item.active { background: var(--celadon-pale); }
.chip-dropdown-item input[type="checkbox"] {
  margin-top: 2px; accent-color: var(--celadon); flex-shrink: 0;
}
.chip-dropdown-name {
  font-size: 13px; font-weight: 600; color: var(--ink-light);
  font-family: var(--mono); flex-shrink: 0;
}
.chip-dropdown-desc {
  font-size: 12px; color: var(--ink-muted);
  line-height: 1.4; overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.chip-dropdown-empty {
  text-align: center; padding: 20px 12px; font-size: 13px; color: var(--ink-muted);
}
.chip-dropdown-divider { border-top: 1px solid var(--border-light); margin: 6px 0; }
.chip-dropdown-add-btn {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 8px 10px; border-radius: 8px; border: none;
  background: none; color: var(--celadon); font-size: 13px;
  cursor: pointer; transition: background .12s; font-family: var(--body);
}
.chip-dropdown-add-btn:hover { background: var(--celadon-pale); }
.chip-dropdown-add-icon {
  width: 20px; height: 20px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  background: var(--celadon-pale); color: var(--celadon);
  font-size: 14px; font-weight: 700; flex-shrink: 0;
}

/* Config Panel */
.config-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.config-panel {
  background: var(--paper); border-radius: 16px;
  width: 520px; max-width: 90vw; max-height: 90vh;
  box-shadow: var(--shadow-lg); overflow-y: auto; padding: 32px;
}
.config-panel h2 {
  font-family: var(--display); font-weight: 700; font-size: 18px;
  color: var(--ink); margin-bottom: 20px;
}
.config-group { margin-bottom: 20px; }
.config-group label {
  display: block; font-size: 12px; color: var(--ink-muted);
  margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
}
.config-group input, .config-group select {
  width: 100%; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); font-size: 14px;
  font-family: var(--mono); background: var(--rice); color: var(--ink); outline: none;
}
.config-group input:focus, .config-group select:focus {
  border-color: var(--celadon); box-shadow: 0 0 0 3px rgba(136,184,147,.15);
}
.config-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; }
.config-actions .btn-ghost { font-size: 13px; }
.btn-ghost {
  border: 1px solid var(--border); background: var(--paper);
  color: var(--ink-muted); padding: 6px 12px; border-radius: 8px;
  font-size: 11px; cursor: pointer; transition: all .15s; font-family: var(--body);
}
.btn-ghost:hover { background: var(--rice); color: var(--ink); }
.btn-primary {
  padding: 8px 20px; border: none; border-radius: 8px;
  background: var(--celadon); color: #fff; cursor: pointer;
  font-size: 13px; font-weight: 600; transition: background .15s;
}
.btn-primary:hover { background: #76a87e; }
.config-panel--wide { width: 600px; }

.config-provider-list { display: flex; flex-direction: column; gap: 6px; max-height: 360px; overflow-y: auto; }
.config-provider-card {
  display: flex; align-items: center; gap: 12px; padding: 12px;
  border-radius: 12px; border: 1px solid var(--border); background: var(--rice);
  cursor: pointer; transition: all .15s;
}
.config-provider-card:hover { border-color: var(--celadon-dim); background: var(--celadon-pale); }
.config-provider-card.active { border-color: var(--celadon); background: var(--celadon-pale); }
.config-provider-card--add {
  justify-content: center; gap: 8px; border-style: dashed; background: var(--paper);
}
.config-provider-card--add:hover { border-color: var(--celadon); background: var(--celadon-pale); }
.card-body { flex: 1; min-width: 0; }
.card-name { font-size: 14px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-model { font-size: 11px; color: var(--ink-muted); font-family: var(--mono); margin-top: 2px; }
.card-actions { display: flex; gap: 4px; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
.config-provider-card:hover .card-actions { opacity: 1; }
.card-btn-edit, .card-btn-del {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; cursor: pointer; transition: all .15s;
}
.card-btn-edit { color: var(--ink-blue); }
.card-btn-edit:hover { background: var(--rice-dark); }
.card-btn-del { color: var(--earth); }
.card-btn-del:hover { background: var(--earth-pale); }
.config-api-key-wrap { position: relative; }
.config-api-key-wrap input { padding-right: 60px; }
.config-api-key-wrap .toggle-vis {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--ink-muted); cursor: pointer;
  background: var(--rice); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px;
}
.services-add-error {
  font-size: 12px; color: var(--earth); padding: 6px 8px;
  background: var(--earth-pale); border-radius: 6px; text-align: center; margin-bottom: 12px;
}

@media (max-width: 768px) {
  .composer-wrap { padding: 10px 16px 12px; }
  .composer-pill { padding: 8px 10px 8px 16px; border-radius: 24px; }
  .send-btn { width: 36px; height: 36px; }
  .chip { padding: 5px 10px; font-size: 11px; }
  .chip-dropdown-panel { min-width: 260px; }
}
</style>
