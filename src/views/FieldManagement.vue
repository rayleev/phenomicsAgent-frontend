<template>
  <div class="field-management">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2>试验田管理</h2>
      </div>
      <div class="toolbar-right">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索..."
            @input="onSearchInput"
          />
        </div>
        <select v-model="pageSize" @change="onPageSizeChange">
          <option :value="20">20 条/页</option>
          <option :value="50">50 条/页</option>
          <option :value="80">80 条/页</option>
        </select>
        <button class="btn-primary" @click="openCreateDialog">+ 新增</button>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 左侧：筛选栏 + 数据表格 -->
      <div class="table-section" :style="{ flex: '1', minWidth: '0' }">
        <!-- 筛选栏 -->
        <div class="filter-bar">
          <div class="filter-item">
            <label>状态：</label>
            <select v-model="filters.status" @change="applyFilters">
              <option value="">全部</option>
              <option value="uploaded">已上传</option>
              <option value="parsing">解析中</option>
              <option value="converting">转换中</option>
              <option value="describing">描述中</option>
              <option value="embedding">嵌入中</option>
              <option value="ready">就绪</option>
              <option value="error">错误</option>
            </select>
          </div>
          <div class="filter-item">
            <label>数据类型：</label>
            <select v-model="filters.data_type" @change="applyFilters">
              <option value="">全部</option>
              <option value="可见光">可见光</option>
              <option value="多光谱">多光谱</option>
              <option value="高光谱">高光谱</option>
              <option value="RGB">RGB</option>
            </select>
          </div>
          <div class="filter-item">
            <label>调查阶段：</label>
            <input
              v-model="filters.survey_stage"
              type="text"
              placeholder="输入调查阶段"
              @input="onFilterInput"
            />
          </div>
          <div class="filter-item">
            <label>任务编号：</label>
            <input
              v-model="filters.task_id"
              type="text"
              placeholder="输入任务编号"
              @input="onFilterInput"
            />
          </div>
          <button class="btn-secondary" @click="resetFilters">重置</button>
        </div>

        <!-- 数据表格 -->
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 80px;">缩略图</th>
                <th>任务编号</th>
                <th>试验田分组</th>
                <th>试验田名称</th>
                <th>调查阶段</th>
                <th>数据类型</th>
                <th>调查员</th>
                <th>调查时间</th>
                <th>上传时间</th>
                <th>状态</th>
                <th style="width: 150px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="11" class="loading-cell">加载中...</td>
              </tr>
              <tr v-else-if="displayItems.length === 0">
                <td colspan="11" class="empty-cell">暂无数据</td>
              </tr>
              <tr v-for="item in displayItems" :key="item.id">
                <td class="thumbnail-cell">
                  <img
                    v-if="item.thumbnail_url"
                    :src="item.thumbnail_url"
                    :alt="item.original_filename"
                    class="thumbnail"
                    @error="onImageError"
                    @click="openPreview(item)"
                  />
                  <div v-else class="thumbnail-placeholder">无图</div>
                </td>
                <td>{{ item.task_id }}</td>
                <td>{{ item.field_group || '-' }}</td>
                <td>{{ item.field_name || '-' }}</td>
                <td>{{ item.survey_stage || '-' }}</td>
                <td>{{ item.data_type || '-' }}</td>
                <td>{{ item.surveyor || '-' }}</td>
                <td>{{ formatDate(item.survey_time) }}</td>
                <td>{{ formatDate(item.upload_time) }}</td>
                <td>
                  <span class="status-badge" :class="`status-${item.status}`">
                    {{ statusText(item.status) }}
                  </span>
                </td>
                <td class="action-cell">
                  <button class="btn-icon" title="查看详情" @click="openDetailDialog(item)">👁</button>
                  <button class="btn-icon" title="编辑" @click="openEditDialog(item)">✏</button>
                  <button class="btn-icon btn-danger" title="删除" @click="onDelete(item)">🗑</button>
                  <button
                    class="btn-icon"
                    title="时空管理（查看该田块各时期影像）"
                    :disabled="!item.field_name"
                    @click="openParcelTimeline(item)"
                  >🕑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div class="pagination" v-if="!usingSearchResults">
          <div class="pagination-info">
            共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页
          </div>
          <div class="pagination-controls">
            <button :disabled="page <= 1" @click="goToPage(1)">首页</button>
            <button :disabled="page <= 1" @click="goToPage(page - 1)">上一页</button>
            <span class="page-number">{{ page }}</span>
            <button :disabled="page >= totalPages" @click="goToPage(page + 1)">下一页</button>
            <button :disabled="page >= totalPages" @click="goToPage(totalPages)">末页</button>
          </div>
        </div>
      </div>

      <!-- 右侧：聊天面板 -->
      <div v-if="!chatCollapsed" class="chat-panel" :style="{ width: chatPanelWidth + 'px', minWidth: chatPanelWidth + 'px' }">
        <!-- Drag handle on left edge -->
        <div
          class="chat-panel-drag-handle"
          @mousedown="startDrag"
          title="拖拽调整宽度"
        ></div>

        <div class="chat-panel-inner">
          <div class="chat-panel-header">
            <div class="chat-header-info">
              <span class="chat-header-title">试验田助手</span>
              <span v-if="currentConvId" class="chat-header-conv">{{ currentConvTitle }}</span>
            </div>
            <div class="chat-header-actions">
              <button class="btn-new-conv" title="新建对话" @click="onNewConversation">+ 新对话</button>
              <button class="btn-collapse" title="收起助手" @click="chatCollapsed = true">»</button>
            </div>
          </div>

          <div class="chat-messages" ref="chatEl">
            <div v-for="msg in messages" :key="msg.id" class="chat-msg" :class="msg.role">
              <div class="chat-msg-content" v-html="renderMd(msg.content || defaultSummary(msg.tool_calls))"></div>
              <div v-if="msg.tool_calls" class="tool-calls">
                <div v-for="(tc, i) in msg.tool_calls" :key="i" class="tool-call-item">
                  <!-- search_fields: 结果摘要 -->
                  <div v-if="tc.tool_name === 'search_fields' && tc.status === 'completed'" class="tool-result-summary">
                    <span class="tool-label">🔍 试验田检索</span>
                    <span class="result-count" v-if="tc.result?.items">找到 {{ tc.result.items.length }} 条记录</span>
                    <span class="result-count" v-else-if="tc.result">已查询</span>
                  </div>

                  <!-- create_field: 创建结果 -->
                  <div v-else-if="tc.tool_name === 'create_field' && tc.status === 'completed'" class="tool-result-message success">
                    <span class="tool-label">✅ 创建成功</span>
                    <span v-if="tc.result?.field_name">{{ tc.result.field_name }}</span>
                    <span v-else>记录已创建</span>
                  </div>
                  <div v-else-if="tc.tool_name === 'create_field' && tc.status === 'error'" class="tool-result-message error">
                    <span class="tool-label">❌ 创建失败</span>
                    <span>{{ tc.error || '未知错误' }}</span>
                  </div>

                  <!-- update_field: 更新结果 -->
                  <div v-else-if="tc.tool_name === 'update_field' && tc.status === 'completed'" class="tool-result-message success">
                    <span class="tool-label">✅ 更新成功</span>
                    <span v-if="tc.result?.field_name">{{ tc.result.field_name }}</span>
                    <span v-else>记录已更新</span>
                  </div>
                  <div v-else-if="tc.tool_name === 'update_field' && tc.status === 'error'" class="tool-result-message error">
                    <span class="tool-label">❌ 更新失败</span>
                    <span>{{ tc.error || '未知错误' }}</span>
                  </div>

                  <!-- delete_field: 删除结果 -->
                  <div v-else-if="tc.tool_name === 'delete_field' && tc.status === 'completed'" class="tool-result-message success">
                    <span class="tool-label">✅ 删除成功</span>
                    <span>记录已删除</span>
                  </div>
                  <div v-else-if="tc.tool_name === 'delete_field' && tc.status === 'error'" class="tool-result-message error">
                    <span class="tool-label">❌ 删除失败</span>
                    <span>{{ tc.error || '未知错误' }}</span>
                  </div>

                  <!-- 其他工具: 默认状态显示 -->
                  <div v-else class="tool-card" :class="tc.status">
                    <span class="tool-name">{{ tc.tool_name }}</span>
                    <span class="tool-status">{{ tc.status === 'completed' ? '✓' : tc.status === 'error' ? '✗' : '…' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="isStreaming" class="chat-msg assistant">
              <div class="chat-msg-content" v-html="renderMd(streamContent || '...')"></div>
            </div>
          </div>

          <!-- Composer -->
          <Composer
            placeholder="询问试验田数据，或描述如何管理记录… (Enter 发送，Shift+Enter 换行)"
            :show-thinking="false"
            :show-services="false"
            :fixed-services="['search_fields', 'create_field', 'update_field', 'delete_field']"
          />
        </div>
      </div>

      <!-- 收起后的细边栏 -->
      <button v-else class="chat-panel-collapsed" title="展开试验田助手" @click="chatCollapsed = false">
        <span class="chat-panel-collapsed-icon">💬</span>
        <span class="chat-panel-collapsed-text">试验田助手</span>
      </button>
    </div>

    <!-- 新增/编辑弹窗 -->
    <div v-if="showDialog" class="modal-overlay" @click.self="closeDialog">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ dialogMode === 'create' ? '新增影像' : dialogMode === 'edit' ? '编辑影像' : '影像详情' }}</h3>
          <button class="btn-close" @click="closeDialog">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-item">
              <label>任务编号 <span class="required">*</span></label>
              <input v-model="form.task_id" type="text" :disabled="dialogMode === 'detail'" placeholder="输入任务编号" />
            </div>
            <div class="form-item">
              <label>试验田分组</label>
              <input v-model="form.field_group" type="text" :disabled="dialogMode === 'detail'" placeholder="输入试验田分组" />
            </div>
            <div class="form-item">
              <label>试验田名称</label>
              <input v-model="form.field_name" type="text" :disabled="dialogMode === 'detail'" placeholder="输入试验田名称" />
            </div>
            <div class="form-item">
              <label>调查阶段</label>
              <input v-model="form.survey_stage" type="text" :disabled="dialogMode === 'detail'" placeholder="如：分蘖期、抽穗期" />
            </div>
            <div class="form-item">
              <label>设备型号</label>
              <input v-model="form.device_model" type="text" :disabled="dialogMode === 'detail'" placeholder="输入设备型号" />
            </div>
            <div class="form-item">
              <label>数据类型</label>
              <select v-model="form.data_type" :disabled="dialogMode === 'detail'">
                <option value="">请选择</option>
                <option value="可见光">可见光</option>
                <option value="多光谱">多光谱</option>
                <option value="高光谱">高光谱</option>
                <option value="RGB">RGB</option>
              </select>
            </div>
            <div class="form-item">
              <label>调查员</label>
              <input v-model="form.surveyor" type="text" :disabled="dialogMode === 'detail'" placeholder="输入调查员" />
            </div>
            <div class="form-item">
              <label>调查时间</label>
              <input v-model="form.survey_time" type="datetime-local" :disabled="dialogMode === 'detail'" />
            </div>
            <div class="form-item">
              <label>状态</label>
              <select v-model="form.status" :disabled="dialogMode === 'detail'">
                <option value="uploaded">已上传</option>
                <option value="parsing">解析中</option>
                <option value="converting">转换中</option>
                <option value="describing">描述中</option>
                <option value="embedding">嵌入中</option>
                <option value="ready">就绪</option>
                <option value="error">错误</option>
              </select>
            </div>
            <div class="form-item">
              <label>来源</label>
              <select v-model="form.source" :disabled="dialogMode === 'detail'">
                <option value="upload">上传</option>
                <option value="fetch">抓取</option>
              </select>
            </div>
            <div class="form-item form-item-full">
              <label>错误信息</label>
              <input v-model="form.error_message" type="text" :disabled="dialogMode === 'detail'" placeholder="输入错误信息" />
            </div>
            <div class="form-item form-item-full">
              <label>VLM 描述</label>
              <textarea v-model="form.vlm_description" :disabled="dialogMode === 'detail'" placeholder="输入 VLM 描述" rows="3"></textarea>
            </div>
            <div class="form-item form-item-full">
              <label>扩展元数据 (JSON)</label>
              <textarea v-model="form.extra_metadata" :disabled="dialogMode === 'detail'" placeholder='{"key": "value"}' rows="3"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer" v-if="dialogMode !== 'detail'">
          <button class="btn-secondary" @click="closeDialog">取消</button>
          <button class="btn-primary" @click="onSubmit" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 原图预览弹窗（可缩放 + 查看整块田 + 跳转 field-shape-web） -->
    <ImagePreviewModal
      :visible="previewVisible"
      :image="previewImage"
      :mosaic="previewMosaic"
      @close="previewVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useChat } from '../composables/useChat'
import Composer from '../components/Composer.vue'
import ImagePreviewModal from '../components/ImagePreviewModal.vue'

const router = useRouter()

interface ImageItem {
  id: string
  task_id: string
  field_group: string | null
  field_name: string | null
  survey_stage: string | null
  device_model: string | null
  data_type: string | null
  surveyor: string | null
  survey_time: string | null
  upload_time: string
  original_filename: string
  status: string
  source: string
  thumbnail_url: string | null
  tile_url: string | null
  error_message: string | null
  vlm_description: string | null
  extra_metadata: Record<string, any> | null
}

const API_BASE = '/api/drone'

// ── Chat state ──
const {
  messages,
  isStreaming,
  streamContent,
  loadConversations,
  conversations,
  currentConvId,
  newConversation,
} = useChat()

const chatCollapsed = ref(true)
const searchResults = ref<ImageItem[] | null>(null)
const chatPanelWidth = ref(380)
const chatEl = ref<HTMLElement | null>(null)
const previewVisible = ref(false)
const previewImage = ref<ImageItem | null>(null)
const previewMosaic = ref<any | null>(null)

async function openPreview(item: ImageItem) {
  previewImage.value = item
  previewMosaic.value = null
  previewVisible.value = true

  try {
    const resp = await fetch(`${API_BASE}/api/images/${item.id}`)
    if (!resp.ok) return
    const detail = await resp.json()
    previewImage.value = { ...item, ...detail }

    if (!detail.mission_id) return
    const params = new URLSearchParams({
      mosaic_type: 'mission',
      mission_id: String(detail.mission_id),
      page_size: '1',
    })
    const mr = await fetch(`${API_BASE}/api/mosaics?${params.toString()}`)
    if (!mr.ok) return
    const md = await mr.json()
    if (md.items?.length) previewMosaic.value = md.items[0]
  } catch (e) {
    console.error('加载预览信息失败:', e)
  }
}

// 跳转到「地块时空管理」，带入该行的试验田（默认整块田视图）
function openParcelTimeline(item: ImageItem) {
  if (!item.field_name) return
  router.push({
    path: '/imaging/parcel-timeline',
    query: { field: item.field_name },
  })
}

// ── Chat helpers ──
const currentConvTitle = computed(() => {
  if (!currentConvId.value) return ''
  const conv = conversations.value.find(c => c.id === currentConvId.value)
  return conv?.title || ''
})

function onNewConversation() {
  newConversation()
}

// ── Drag to resize chat panel ──
let dragging = false
let dragStartX = 0
let dragStartWidth = 0

function startDrag(e: MouseEvent) {
  dragging = true
  dragStartX = e.clientX
  dragStartWidth = chatPanelWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!dragging) return
  const delta = dragStartX - e.clientX
  const newWidth = Math.min(720, Math.max(280, dragStartWidth + delta))
  chatPanelWidth.value = newWidth
}

function onDragEnd() {
  dragging = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ── Existing table state ──
const items = ref<ImageItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchQuery = ref('')

const filters = reactive({
  status: '',
  data_type: '',
  survey_stage: '',
  task_id: ''
})

const showDialog = ref(false)
const dialogMode = ref<'create' | 'edit' | 'detail'>('create')
const submitting = ref(false)
const currentId = ref<string | null>(null)

const form = reactive({
  task_id: '',
  field_group: '',
  field_name: '',
  survey_stage: '',
  device_model: '',
  data_type: '',
  surveyor: '',
  survey_time: '',
  status: 'uploaded',
  source: 'upload',
  error_message: '',
  vlm_description: '',
  extra_metadata: ''
})

const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

const usingSearchResults = computed(() => searchResults.value !== null)

const displayItems = computed(() => {
  if (searchResults.value !== null) {
    return searchResults.value
  }
  return items.value
})

let searchTimeout: ReturnType<typeof setTimeout> | null = null
let filterTimeout: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    loadData()
  }, 300)
}

function onFilterInput() {
  if (filterTimeout) clearTimeout(filterTimeout)
  filterTimeout = setTimeout(() => {
    page.value = 1
    loadData()
  }, 300)
}

function onPageSizeChange() {
  page.value = 1
  loadData()
}

function applyFilters() {
  page.value = 1
  loadData()
}

function resetFilters() {
  filters.status = ''
  filters.data_type = ''
  filters.survey_stage = ''
  filters.task_id = ''
  searchQuery.value = ''
  page.value = 1
  loadData()
}

function goToPage(p: number) {
  page.value = p
  loadData()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    uploaded: '已上传',
    parsing: '解析中',
    converting: '转换中',
    describing: '描述中',
    embedding: '嵌入中',
    ready: '就绪',
    error: '错误'
  }
  return map[status] || status
}

function onImageError(e: Event) {
  const target = e.target as HTMLImageElement
  target.style.display = 'none'
}

function renderMd(text: string) {
  if (!text) return ''
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
}

function defaultSummary(toolCalls: any[] | null) {
  if (!toolCalls || toolCalls.length === 0) return ''
  const summaries: string[] = []
  for (const tc of toolCalls) {
    if (tc.tool_name === 'search_fields' && tc.status === 'completed') {
      const count = tc.result?.items?.length ?? (tc.result ? '若干' : '0')
      summaries.push(`已为您找到 ${count} 条试验田记录，结果已展示在表格中。`)
    } else if (tc.tool_name === 'create_field' && tc.status === 'completed') {
      summaries.push(`✅ 试验田记录创建成功${tc.result?. field_name ? '：' + tc.result.field_name : ''}。`)
    } else if (tc.tool_name === 'update_field' && tc.status === 'completed') {
      summaries.push(`✅ 试验田记录更新成功${tc.result?.field_name ? '：' + tc.result.field_name : ''}。`)
    } else if (tc.tool_name === 'delete_field' && tc.status === 'completed') {
      summaries.push(`✅ 试验田记录已删除。`)
    }
  }
  return summaries.join('')
}

async function loadData() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (searchQuery.value) params.set('search', searchQuery.value)
    if (filters.status) params.set('status', filters.status)
    if (filters.data_type) params.set('data_type', filters.data_type)
    if (filters.survey_stage) params.set('survey_stage', filters.survey_stage)
    if (filters.task_id) params.set('task_id', filters.task_id)
    params.set('page', page.value.toString())
    params.set('page_size', pageSize.value.toString())

    const resp = await fetch(`${API_BASE}/api/images?${params.toString()}`)
    if (!resp.ok) throw new Error('加载失败')
    const data = await resp.json()
    items.value = data.items || []
    total.value = data.total || 0
  } catch (e) {
    console.error('加载数据失败:', e)
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.task_id = ''
  form.field_group = ''
  form.field_name = ''
  form.survey_stage = ''
  form.device_model = ''
  form.data_type = ''
  form.surveyor = ''
  form.survey_time = ''
  form.status = 'uploaded'
  form.source = 'upload'
  form.error_message = ''
  form.vlm_description = ''
  form.extra_metadata = ''
}

function openCreateDialog() {
  dialogMode.value = 'create'
  currentId.value = null
  resetForm()
  showDialog.value = true
}

function openEditDialog(item: ImageItem) {
  dialogMode.value = 'edit'
  currentId.value = item.id
  form.task_id = item.task_id
  form.field_group = item.field_group || ''
  form.field_name = item.field_name || ''
  form.survey_stage = item.survey_stage || ''
  form.device_model = item.device_model || ''
  form.data_type = item.data_type || ''
  form.surveyor = item.surveyor || ''
  form.survey_time = item.survey_time ? item.survey_time.slice(0, 16) : ''
  form.status = item.status
  form.source = item.source
  form.error_message = item.error_message || ''
  form.vlm_description = item.vlm_description || ''
  form.extra_metadata = item.extra_metadata ? JSON.stringify(item.extra_metadata, null, 2) : ''
  showDialog.value = true
}

function openDetailDialog(item: ImageItem) {
  dialogMode.value = 'detail'
  currentId.value = item.id
  form.task_id = item.task_id
  form.field_group = item.field_group || ''
  form.field_name = item.field_name || ''
  form.survey_stage = item.survey_stage || ''
  form.device_model = item.device_model || ''
  form.data_type = item.data_type || ''
  form.surveyor = item.surveyor || ''
  form.survey_time = item.survey_time ? item.survey_time.slice(0, 16) : ''
  form.status = item.status
  form.source = item.source
  form.error_message = item.error_message || ''
  form.vlm_description = item.vlm_description || ''
  form.extra_metadata = item.extra_metadata ? JSON.stringify(item.extra_metadata, null, 2) : ''
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  resetForm()
}

async function onSubmit() {
  if (!form.task_id.trim()) {
    alert('请输入任务编号')
    return
  }

  submitting.value = true
  try {
    const body: Record<string, any> = {
      task_id: form.task_id,
      field_group: form.field_group || null,
      field_name: form.field_name || null,
      survey_stage: form.survey_stage || null,
      device_model: form.device_model || null,
      data_type: form.data_type || null,
      surveyor: form.surveyor || null,
      survey_time: form.survey_time || null,
      status: form.status,
      source: form.source,
      error_message: form.error_message || null,
      vlm_description: form.vlm_description || null,
      extra_metadata: form.extra_metadata ? JSON.parse(form.extra_metadata) : null
    }

    let resp: Response
    if (dialogMode.value === 'create') {
      resp = await fetch(`${API_BASE}/api/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } else {
      resp = await fetch(`${API_BASE}/api/images/${currentId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    }

    if (!resp.ok) {
      const err = await resp.json()
      throw new Error(err.detail || '保存失败')
    }

    closeDialog()
    loadData()
  } catch (e: any) {
    alert(e.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function onDelete(item: ImageItem) {
  if (!confirm(`确定删除影像「${item.original_filename}」？`)) return

  try {
    const resp = await fetch(`${API_BASE}/api/images/${item.id}`, {
      method: 'DELETE'
    })
    if (!resp.ok) throw new Error('删除失败')
    loadData()
  } catch (e: any) {
    alert(e.message || '删除失败')
  }
}

// Watch messages for tool calls
watch(messages, (msgs) => {
  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.tool_name === 'search_fields' && tc.status === 'completed' && tc.result) {
          // Update search results for the table
          if (tc.result.items && Array.isArray(tc.result.items)) {
            searchResults.value = tc.result.items
          } else if (tc.result.results && Array.isArray(tc.result.results)) {
            searchResults.value = tc.result.results
          }
        }

        // After create/update/delete, refresh the table data
        if ((tc.tool_name === 'create_field' || tc.tool_name === 'update_field' || tc.tool_name === 'delete_field') && tc.status === 'completed') {
          loadData()
        }
      }
    }
  }
  // Auto-scroll chat to bottom
  nextTick(() => {
    if (chatEl.value) {
      chatEl.value.scrollTop = chatEl.value.scrollHeight
    }
  })
}, { deep: true })

// Watch streaming content to auto-scroll
watch(streamContent, () => {
  nextTick(() => {
    if (chatEl.value) {
      chatEl.value.scrollTop = chatEl.value.scrollHeight
    }
  })
})

onMounted(() => {
  loadData()
  loadConversations()
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
</script>

<style scoped>
.field-management {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  background: var(--paper);
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.toolbar-left h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-box input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  width: 200px;
  outline: none;
  transition: border-color .15s;
}

.search-box input:focus {
  border-color: var(--celadon);
}

.toolbar-right select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--paper);
}

.btn-primary {
  padding: 8px 16px;
  background: var(--celadon);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background .15s;
}

.btn-primary:hover {
  background: var(--celadon-dark);
}

.btn-primary:disabled {
  background: var(--border);
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background .15s;
}

.btn-secondary:hover {
  background: var(--rice);
}

/* Main content area */
.main-content {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.table-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* Filter bar */
.filter-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--rice);
  border-radius: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-item label {
  font-size: 13px;
  color: var(--ink-muted);
  white-space: nowrap;
}

.filter-item input,
.filter-item select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  background: var(--paper);
}

.filter-item input:focus,
.filter-item select:focus {
  border-color: var(--celadon);
}

/* Welcome screen */
.welcome-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: linear-gradient(135deg, var(--rice) 0%, var(--paper) 100%);
}

.welcome-content {
  text-align: center;
  max-width: 600px;
  animation: fadeInUp .5s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.welcome-icon {
  font-size: 56px;
  margin-bottom: 16px;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.welcome-title {
  font-family: var(--display);
  font-size: 32px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 12px;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--ink-muted);
  margin-bottom: 32px;
  line-height: 1.6;
}

.welcome-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.welcome-chip {
  padding: 12px 20px;
  background: var(--paper);
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  transition: all .2s ease;
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .06);
}

.welcome-chip:hover {
  border-color: var(--celadon);
  box-shadow: 0 4px 16px rgba(136, 184, 147, .2);
  transform: translateY(-2px);
}

.welcome-chip.primary {
  background: var(--celadon);
  color: #fff;
  border-color: var(--celadon);
  box-shadow: 0 4px 16px rgba(136, 184, 147, .3);
}

.welcome-chip.primary:hover {
  background: var(--celadon-dark);
  box-shadow: 0 6px 20px rgba(136, 184, 147, .4);
}

/* Table */
.table-container {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
}

.data-table th {
  background: var(--rice);
  font-weight: 600;
  color: var(--ink);
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table tbody tr:hover {
  background: var(--rice-dark);
}

.loading-cell,
.empty-cell {
  text-align: center;
  padding: 40px !important;
  color: var(--ink-muted);
}

.thumbnail-cell {
  width: 80px;
}

.thumbnail {
  width: 60px;
  height: 45px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}

.thumbnail:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .15);
}

.thumbnail-placeholder {
  width: 60px;
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--rice);
  border-radius: 6px;
  color: var(--ink-muted);
  font-size: 12px;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-uploaded { background: #e3f2fd; color: #1976d2; }
.status-parsing { background: #fff3e0; color: #f57c00; }
.status-converting { background: #fff3e0; color: #f57c00; }
.status-describing { background: #fff3e0; color: #f57c00; }
.status-embedding { background: #fff3e0; color: #f57c00; }
.status-ready { background: #e8f5e9; color: #388e3c; }
.status-error { background: #ffebee; color: #d32f2f; }

.action-cell {
  display: flex;
  gap: 4px;
}

.btn-icon {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background .15s;
}

.btn-icon:hover {
  background: var(--rice-dark);
}

.btn-danger:hover {
  background: var(--earth-pale);
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  flex-shrink: 0;
}

.pagination-info {
  font-size: 13px;
  color: var(--ink-muted);
}

.pagination-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pagination-controls button {
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--paper);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}

.pagination-controls button:hover:not(:disabled) {
  background: var(--rice);
}

.pagination-controls button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.page-number {
  padding: 6px 12px;
  background: var(--celadon);
  color: #fff;
  border-radius: 6px;
  font-weight: 600;
}

/* Bottom composer (initial state) */
.bottom-composer {
  flex-shrink: 0;
  padding: 12px 0 0;
  background: transparent;
}

/* Chat panel */
.chat-panel {
  display: flex;
  height: 100%;
  background: #fafafa;
  border-left: 1px solid var(--border-light);
  position: relative;
  border-radius: 10px 0 0 10px;
}

.chat-panel-drag-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  z-index: 10;
  transition: background .15s;
}

.chat-panel-drag-handle:hover,
.chat-panel-drag-handle:active {
  background: var(--celadon);
  opacity: 0.5;
}

.chat-panel-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-left: 6px;
}

.chat-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid var(--border-light);
  gap: 8px;
}

.chat-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.chat-header-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--ink);
}

.chat-header-conv {
  font-size: 12px;
  color: var(--ink-muted);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-new-conv {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--ink-muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
}

.btn-new-conv:hover {
  background: var(--celadon-pale);
  color: var(--celadon);
  border-color: var(--celadon);
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-collapse {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--ink-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all .15s;
}

.btn-collapse:hover {
  background: var(--celadon-pale);
  color: var(--celadon);
  border-color: var(--celadon);
}

.chat-panel-collapsed {
  width: 40px;
  height: 100%;
  border: none;
  border-left: 1px solid var(--border-light);
  background: var(--paper);
  color: var(--ink-muted);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 14px 0;
  transition: background .15s;
}

.chat-panel-collapsed:hover {
  background: var(--celadon-pale);
  color: var(--celadon);
}

.chat-panel-collapsed-icon {
  font-size: 16px;
}

.chat-panel-collapsed-text {
  writing-mode: vertical-rl;
  font-size: 13px;
  letter-spacing: 2px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-msg {
  margin-bottom: 14px;
}

.chat-msg.user .chat-msg-content {
  background: var(--celadon);
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px 12px 2px 12px;
  display: inline-block;
  max-width: 90%;
  font-size: 14px;
}

.chat-msg.assistant .chat-msg-content {
  background: #fff;
  padding: 10px 14px;
  border-radius: 12px 12px 12px 2px;
  border: 1px solid var(--border-light);
  font-size: 14px;
  line-height: 1.6;
}

.tool-calls {
  margin-top: 8px;
}

.tool-call-item {
  margin-bottom: 8px;
}

.tool-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #f5f5f5;
  border-radius: 12px;
  font-size: 12px;
  margin-right: 6px;
}

.tool-card.completed {
  background: #e8f5e9;
}

.tool-card.error {
  background: #fce4ec;
}

.tool-result-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  font-size: 13px;
}

.tool-result-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.tool-result-message.success {
  background: #e8f5e9;
  border: 1px solid #c8e6c9;
  color: #2e7d32;
}

.tool-result-message.error {
  background: #fce4ec;
  border: 1px solid #ffcdd2;
  color: #c62828;
}

.tool-label {
  font-weight: 600;
  font-size: 13px;
}

.result-count {
  font-size: 12px;
  color: var(--ink-muted);
}

/* Make the shared Composer fit the narrow panel */
.chat-panel-inner :deep(.composer-wrap) {
  padding: 10px 12px 12px;
}

.chat-panel-inner :deep(.composer) {
  max-width: none;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--paper);
  border-radius: 16px;
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  color: var(--ink-muted);
  border-radius: 8px;
}

.btn-close:hover {
  background: var(--rice);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-item-full {
  grid-column: span 2;
}

.form-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}

.form-item label .required {
  color: var(--earth);
}

.form-item input,
.form-item select,
.form-item textarea {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color .15s;
  font-family: inherit;
}

.form-item input:focus,
.form-item select:focus,
.form-item textarea:focus {
  border-color: var(--celadon);
}

.form-item input:disabled,
.form-item select:disabled,
.form-item textarea:disabled {
  background: var(--rice);
  cursor: not-allowed;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-light);
}

@media (max-width: 768px) {
  .chat-panel {
    width: 300px !important;
    min-width: 300px !important;
  }

  .chat-panel-drag-handle {
    display: none;
  }

  .welcome-screen {
    padding: 24px 16px;
  }

  .welcome-icon {
    font-size: 40px;
  }

  .welcome-title {
    font-size: 24px;
  }

  .welcome-subtitle {
    font-size: 14px;
  }

  .welcome-chips {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .welcome-chip {
    width: 100%;
    text-align: center;
    padding: 10px 16px;
    font-size: 13px;
  }
}
</style>
