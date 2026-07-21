<template>
  <div class="imaging-layout">
    <!-- 左侧导航栏 -->
    <aside class="img-sidebar">
      <div class="sidebar-brand">
        <div class="brand-icon">稻</div>
        <span class="brand-label">phenomicsAgent</span>
      </div>

      <nav class="img-nav">
        <router-link to="/chat" class="img-nav-item">
          <span class="nav-icon">💬</span>
          <span class="nav-label">智能对话</span>
        </router-link>
        <router-link to="/imaging" class="img-nav-item active">
          <span class="nav-icon">🛰</span>
          <span class="nav-label">无人机影像</span>
        </router-link>
      </nav>

      <div class="img-sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">{{ userInitial }}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">{{ user?.username }}</div>
          </div>
        </div>
        <div class="nav-item" @click="logout">
          <span class="nav-icon">🚪</span>
          <span class="nav-label">退出</span>
        </div>
      </div>
    </aside>

    <!-- 中间地图区域 -->
    <div class="map-area">
      <div ref="mapContainer" class="map-container"></div>

      <!-- 影像图层列表（浮层） -->
      <div class="layer-panel" v-if="imageLayers.length > 0">
        <div class="layer-panel-title">影像图层</div>
        <div
          v-for="layer in imageLayers"
          :key="layer.id"
          class="layer-item"
          :class="{ active: selectedImage?.id === layer.id }"
          @click="selectLayer(layer)"
        >
          <span class="layer-dot" :style="{ background: layer.color }"></span>
          <span class="layer-name">{{ layer.field_name || layer.task_id }}</span>
          <span class="layer-stage">{{ layer.survey_stage }}</span>
          <button
            class="layer-eye"
            :class="{ off: !layer.visible }"
            :title="layer.visible ? '隐藏影像（保留红框）' : '显示影像'"
            @click.stop="toggleLayer(layer)"
          >👁</button>
        </div>
      </div>

      <!-- 影像信息浮层 -->
      <div class="info-popup" v-if="selectedImage">
        <div class="info-popup-header">
          <span>{{ selectedImage.field_name || selectedImage.task_id }}</span>
          <button class="info-close" @click="selectedImage = null">✕</button>
        </div>
        <div class="info-popup-body">
          <div class="info-row"><label>任务编号</label><span>{{ selectedImage.task_id }}</span></div>
          <div class="info-row"><label>调查阶段</label><span>{{ selectedImage.survey_stage || '-' }}</span></div>
          <div class="info-row"><label>调查时间</label><span>{{ selectedImage.survey_time || '-' }}</span></div>
          <div class="info-row"><label>相似度</label><span>{{ (selectedImage.score * 100).toFixed(1) }}%</span></div>
          <div class="info-desc" v-if="selectedImage.vlm_description">
            <label>AI 描述</label>
            <p>{{ selectedImage.vlm_description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧聊天面板 -->
    <div class="chat-panel">
      <div class="chat-panel-header">
        <span>影像助手</span>
        <span class="pill" :class="{ ok: apiConnected }">{{ apiConnected ? '已连接' : '未连接' }}</span>
      </div>

      <div class="chat-messages" ref="chatEl">
        <div v-if="messages.length === 0 && !streamContent" class="chat-welcome">
          <p>你好！我可以帮你检索和展示无人机影像。</p>
          <div class="chat-examples">
            <span @click="sendExample('帮我看一下海南试验点水稻分蘖期的影像')">海南试验点影像</span>
            <span @click="sendExample('查看最近的无人机影像')">最近影像</span>
          </div>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="chat-msg" :class="msg.role">
          <div class="chat-msg-content" v-html="renderMd(msg.content)"></div>
          <!-- 工具调用卡片 -->
          <div v-if="msg.tool_calls" class="tool-calls">
            <div v-for="(tc, i) in msg.tool_calls" :key="i" class="tool-card" :class="tc.status">
              <span class="tool-name">{{ tc.tool_name }}</span>
              <span class="tool-status">{{ tc.status === 'completed' ? '✓' : tc.status === 'error' ? '✗' : '…' }}</span>
            </div>
          </div>
        </div>

        <!-- 流式消息 -->
        <div v-if="isStreaming" class="chat-msg assistant">
          <div class="chat-msg-content" v-html="renderMd(streamContent || '...')"></div>
        </div>
      </div>

      <div class="chat-input-area">
        <textarea
          v-model="inputText"
          @keydown.enter.exact.prevent="sendMessage"
          placeholder="描述你想查看的影像..."
          rows="2"
        ></textarea>
        <button class="send-btn" @click="sendMessage" :disabled="isStreaming || !inputText.trim()">发送</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useChat } from '../composables/useChat'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, logout: authLogout } = useAuth()
const {
  messages, isStreaming, streamContent,
  sendMessage: chatSend, loadConversations,
} = useChat()

// ── 状态 ──
const mapContainer = ref<HTMLElement | null>(null)
const chatEl = ref<HTMLElement | null>(null)
const inputText = ref('')
const apiConnected = ref(false)
const imageLayers = ref<any[]>([])
const selectedImage = ref<any>(null)

let map: L.Map | null = null
const tileLayerMap = new Map<string, L.TileLayer>()
const rectMap = new Map<string, L.Rectangle>()

const userInitial = ref('U')
watch(user, (u) => {
  userInitial.value = u?.username?.charAt(0)?.toUpperCase() || 'U'
}, { immediate: true })

// ── 天地图配置 ──
// 注意：前端 Leaflet 直接在浏览器请求瓦片，必须使用「浏览器端」类型的 key
// （服务器端 key 会被天地图 WAF 拦截返回 403）。
// key 通过 Vite 环境变量 VITE_TIANDITU_KEY 配置（.env / .env.production），
// 未配置时回退到下方默认值，避免硬编码到业务逻辑里。
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY || '976ad152f68499029b95bfa5313ac9cc'

// 天地图影像底图的原生最大缩放级别（WMTS TILEMATRIXSET=w 最高到 18 级）。
// 无人机影像分辨率（约 3-4mm/px）远高于卫星底图，浏览小地块时地图会放大到
// 19-22 级，此时天地图已没有更高级别的瓦片，会返回灰色"此级别下该区域无影像"。
// 设置 maxNativeZoom 后，Leaflet 会自动放大 18 级瓦片填充更高级别（底图略模糊
// 但不会消失），无人机瓦片则在高层级继续清晰渲染。
const TIANDITU_MAX_NATIVE_ZOOM = 18
// 地图允许的最大缩放级别（需覆盖无人机瓦片的高分辨率浏览需求）。
const MAP_MAX_ZOOM = 22

// ── 地图初始化 ──
onMounted(async () => {
  await initMap()
  await loadConversations()
  checkApi()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})

async function initMap() {
  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    center: [18.364, 109.213],  // 默认海南南繁基地
    zoom: 15,
    maxZoom: MAP_MAX_ZOOM,
    zoomControl: true,
  })

  // 无人机瓦片专用图层面板（pane）：z-index 300，
  // 高于底图瓦片默认的 tilePane(200)、低于 bbox 矩形所在的 overlayPane(400)。
  // 这样无论切换到哪套底图（底图瓦片都在 tilePane），无人机影像始终压在底图之上、
  // 红框之下，修复"切换底图后影像被新底图瓦片盖住而消失"的问题。
  const dronePane = map.createPane('droneTiles')
  dronePane.style.zIndex = '300'

  // 天地图 WMTS 瓦片 URL 模板与公共参数
  const tdOpts = {
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maxNativeZoom: TIANDITU_MAX_NATIVE_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
  }
  const wmtsUrl = (layer: string, lyr: string) =>
    `http://t{s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${lyr}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TIANDITU_KEY}`

  // 底图①：卫星影像（img_w）+ 影像标注（cia_w）
  const satelliteBase = L.layerGroup([
    L.tileLayer(wmtsUrl('img_w', 'img'), tdOpts),
    L.tileLayer(wmtsUrl('cia_w', 'cia'), tdOpts),
  ])

  // 底图②：矢量地图（vec_w，含行政区划/道路）+ 矢量标注（cva_w，中文地名）
  const vectorBase = L.layerGroup([
    L.tileLayer(wmtsUrl('vec_w', 'vec'), tdOpts),
    L.tileLayer(wmtsUrl('cva_w', 'cva'), tdOpts),
  ])

  // 默认加载卫星影像
  satelliteBase.addTo(map)

  // 底图切换控件（右上角，可在卫星影像 / 矢量地图间切换）
  L.control.layers(
    { '卫星影像': satelliteBase, '矢量地图': vectorBase },
    null,
    { collapsed: false }
  ).addTo(map)
}

function checkApi() {
  fetch('/api/drone/health')
    .then(r => { apiConnected.value = r.ok })
    .catch(() => { apiConnected.value = false })
}

// ── 聊天 ──
function renderMd(text: string) {
  if (!text) return ''
  return marked.parse(text, { async: false }) as string
}

function sendExample(text: string) {
  inputText.value = text
  sendMessage()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''

  // 发送消息（enabled_services 包含影像工具）
  await chatSend(text, false, ['search_images', 'get_image_detail'])

  // 发送后检查是否有影像结果需要渲染
  await nextTick()
  scrollToBottom()
}

// 监听消息变化，提取影像数据渲染到地图
watch(messages, (msgs) => {
  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.tool_name === 'search_images' && tc.status === 'completed' && tc.result) {
          handleSearchResults(tc.result)
        }
      }
    }
  }
}, { deep: true })

// ── 影像结果处理 ──
const LAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']

// 将 droneImaging 返回的绝对地址（http://localhost:8002/api/...）
// 重写为 /api/drone/... 代理路径，浏览器才能实际访问到。
// 注意：不能用 new URL()，它会把 {z}/{x}/{y} 编码成 %7Bz%7D，
// 导致 Leaflet 无法替换瓦片坐标占位符。这里用正则提取路径以保留占位符。
function toDroneProxyUrl(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+(\/.*)$/)
  if (!match) return url
  // /api/tiles/.../{z}/{x}/{y}.png → /api/drone/tiles/.../{z}/{x}/{y}.png
  return '/api/drone' + match[1].replace(/^\/api/, '')
}

function handleSearchResults(result: any) {
  if (!result?.results || !map) return

  const results = result.results
  if (results.length === 0) return

  // 清除旧图层
  clearLayers()

  results.forEach((img: any, idx: number) => {
    const color = LAYER_COLORS[idx % LAYER_COLORS.length]

    // 添加瓦片图层
    if (img.tile_url) {
      // Leaflet 原生支持 {z}/{x}/{y} 模板，只需把地址重写为可访问的代理路径
      const tileUrl = toDroneProxyUrl(img.tile_url)

      const layer = L.tileLayer(tileUrl, {
        maxZoom: MAP_MAX_ZOOM,
        opacity: 0.85,
        pane: 'droneTiles',  // 专用 pane，确保始终位于底图瓦片之上
      }).addTo(map!)

      tileLayerMap.set(img.id, layer)
    }

    // 添加 bbox 边框
    if (img.bbox) {
      const bounds: L.LatLngBoundsExpression = [
        [img.bbox[1], img.bbox[0]],  // [min_lat, min_lon]
        [img.bbox[3], img.bbox[2]],  // [max_lat, max_lon]
      ]
      const rect = L.rectangle(bounds, {
        color: color,
        weight: 2,
        fill: false,
        dashArray: '5,5',
      }).addTo(map!)

      rectMap.set(img.id, rect)

      // 适配视野到第一张影像
      if (idx === 0) {
        map!.fitBounds(bounds, { padding: [50, 50] })
      }
    }

    imageLayers.value.push({
      id: img.id,
      field_name: img.field_name,
      task_id: img.task_id,
      survey_stage: img.survey_stage,
      color,
      visible: true,
      ...img,
    })
  })

  // 默认选中第一张
  if (results.length > 0) {
    selectedImage.value = imageLayers.value[0]
  }
}

function clearLayers() {
  tileLayerMap.forEach(layer => layer.remove())
  tileLayerMap.clear()
  rectMap.forEach(rect => rect.remove())
  rectMap.clear()
  imageLayers.value = []
  selectedImage.value = null
}

// 点击图层行：仅选中（展示信息卡片），不改变显隐
function selectLayer(layer: any) {
  selectedImage.value = layer
}

// 眼睛开关：只显示/隐藏无人机影像瓦片，bbox 红框始终保留
function toggleLayer(layer: any) {
  const tileLayer = tileLayerMap.get(layer.id)
  if (!tileLayer || !map) return
  if (layer.visible) {
    tileLayer.remove()
    layer.visible = false
  } else {
    tileLayer.addTo(map)
    layer.visible = true
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatEl.value) {
      chatEl.value.scrollTop = chatEl.value.scrollHeight
    }
  })
}

function logout() {
  authLogout()
  router.push('/login')
}
</script>

<style scoped>
.imaging-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── 左侧导航 ── */
.img-sidebar {
  width: 200px;
  min-width: 200px;
  background: var(--sidebar-bg, #1a1a2e);
  color: var(--sidebar-text, #e0e0e0);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.06);
}

.img-nav {
  flex: 1;
  padding: 12px 8px;
}

.img-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 4px;
  transition: background 0.2s;
}

.img-nav-item:hover {
  background: rgba(255,255,255,0.08);
}

.img-nav-item.active {
  background: rgba(136,184,147,0.2);
  color: #88b893;
}

.img-sidebar-footer {
  padding: 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* ── 中间地图 ── */
.map-area {
  flex: 1;
  position: relative;
}

.map-container {
  width: 100%;
  height: 100%;
}

.layer-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255,255,255,0.95);
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  max-width: 260px;
  z-index: 1000;
}

.layer-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.layer-item:hover {
  background: #f0f0f0;
}

.layer-item.active {
  background: #e8f5e9;
}

.layer-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-stage {
  font-size: 11px;
  color: #999;
}

.layer-eye {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px;
  flex-shrink: 0;
  transition: opacity 0.15s, filter 0.15s;
}

.layer-eye:hover {
  transform: scale(1.15);
}

.layer-eye.off {
  opacity: 0.3;
  filter: grayscale(1);
}

/* ── 信息浮层 ── */
.info-popup {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: rgba(255,255,255,0.97);
  border-radius: 10px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.18);
  width: 320px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.info-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid #eee;
}

.info-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #999;
}

.info-popup-body {
  padding: 12px 14px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.info-row label {
  color: #888;
}

.info-desc {
  margin-top: 10px;
}

.info-desc label {
  font-size: 12px;
  color: #888;
  display: block;
  margin-bottom: 4px;
}

.info-desc p {
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

/* ── 右侧聊天面板 ── */
.chat-panel {
  width: 360px;
  min-width: 360px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e8e8e8;
  background: #fafafa;
}

.chat-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-welcome {
  text-align: center;
  padding: 40px 20px;
  color: #888;
}

.chat-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}

.chat-examples span {
  padding: 6px 12px;
  background: #e8f5e9;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  color: #2e7d32;
}

.chat-msg {
  margin-bottom: 14px;
}

.chat-msg.user .chat-msg-content {
  background: #88b893;
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
  border: 1px solid #e8e8e8;
  font-size: 14px;
  line-height: 1.6;
}

.tool-cards {
  margin-top: 6px;
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

.tool-card.completed { background: #e8f5e9; }
.tool-card.error { background: #fce4ec; }

.chat-input-area {
  padding: 12px;
  border-top: 1px solid #e8e8e8;
  background: #fff;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.chat-input-area textarea {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  resize: none;
  font-family: inherit;
}

.chat-input-area textarea:focus {
  outline: none;
  border-color: #88b893;
}

.send-btn {
  padding: 8px 16px;
  background: #88b893;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 通用 ── */
.pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #fce4ec;
  color: #c62828;
}

.pill.ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px;
}

.brand-icon {
  width: 32px;
  height: 32px;
  background: #88b893;
  color: #fff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.brand-label {
  font-weight: 600;
  font-size: 14px;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.sidebar-user-avatar {
  width: 28px;
  height: 28px;
  background: #88b893;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.sidebar-user-name {
  font-size: 13px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.nav-item:hover {
  background: rgba(255,255,255,0.08);
}
</style>
