<template>
  <div class="imaging-layout">
    <!-- Topbar -->
    <header class="topbar">
      <button class="sidebar-toggle" @click="openMobileSidebar" aria-label="打开侧栏">☰</button>
      <span class="topbar-title">无人机影像服务</span>
      <div class="top-actions">
        <span class="pill" :class="{ ok: apiConnected }">{{ apiConnected ? '已连接' : '未连接' }}</span>
      </div>
    </header>

    <!-- Main content -->
    <div class="imaging-main">
      <!-- Map area -->
      <div class="map-area">
        <div ref="mapContainer" class="map-container"></div>

        <!-- Image layers panel -->
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

        <!-- Image info popup -->
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

      <!-- Right chat panel (resizable via left edge drag) -->
      <div class="chat-panel" :style="{ width: chatPanelWidth + 'px', minWidth: chatPanelWidth + 'px' }">
        <!-- Drag handle on left edge -->
        <div
          class="chat-panel-drag-handle"
          @mousedown="startDrag"
          title="拖拽调整宽度"
        ></div>

        <div class="chat-panel-inner">
          <div class="chat-panel-header">
            <span>影像助手</span>
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
              <div v-if="msg.tool_calls" class="tool-calls">
                <div v-for="(tc, i) in msg.tool_calls" :key="i" class="tool-card" :class="tc.status">
                  <span class="tool-name">{{ tc.tool_name }}</span>
                  <span class="tool-status">{{ tc.status === 'completed' ? '✓' : tc.status === 'error' ? '✗' : '…' }}</span>
                </div>
              </div>
            </div>

            <div v-if="isStreaming" class="chat-msg assistant">
              <div class="chat-msg-content" v-html="renderMd(streamContent || '...')"></div>
            </div>
          </div>

          <!-- Shared Composer (imaging mode: fixed services, no thinking) -->
          <Composer
            placeholder="描述你想查看的影像… (Enter 发送，Shift+Enter 换行)"
            :show-thinking="false"
            :show-services="false"
            :fixed-services="['search_images', 'get_image_detail']"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { marked } from 'marked'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useChat } from '../composables/useChat'
import Composer from '../components/Composer.vue'

const {
  messages, isStreaming, streamContent,
  loadConversations,
} = useChat()

// ── State ──
const mapContainer = ref<HTMLElement | null>(null)
const chatEl = ref<HTMLElement | null>(null)
const apiConnected = ref(false)
const imageLayers = ref<any[]>([])
const selectedImage = ref<any>(null)
const chatPanelWidth = ref(380)

let map: L.Map | null = null
const tileLayerMap = new Map<string, L.TileLayer>()
const rectMap = new Map<string, L.Rectangle>()

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
  // Dragging left (decreasing X) should widen the right panel
  const delta = dragStartX - e.clientX
  const newWidth = Math.min(720, Math.max(280, dragStartWidth + delta))
  chatPanelWidth.value = newWidth
}

function onDragEnd() {
  dragging = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ── Mobile sidebar ──
function openMobileSidebar() {
  window.dispatchEvent(new CustomEvent('phenomics:toggle-sidebar'))
}

// ── 天地图配置 ──
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY || '976ad152f68499029b95bfa5313ac9cc'
const TIANDITU_MAX_NATIVE_ZOOM = 18
const MAP_MAX_ZOOM = 22

// ── 地图初始化 ──
onMounted(async () => {
  await initMap()
  await loadConversations()
  checkApi()
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
})

onUnmounted(() => {
  if (map) { map.remove(); map = null }
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

async function initMap() {
  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    center: [18.364, 109.213],
    zoom: 15,
    maxZoom: MAP_MAX_ZOOM,
    zoomControl: true,
  })

  const dronePane = map.createPane('droneTiles')
  dronePane.style.zIndex = '300'

  const tdOpts = {
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maxNativeZoom: TIANDITU_MAX_NATIVE_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
  }
  const wmtsUrl = (layer: string, lyr: string) =>
    `http://t{s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${lyr}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TIANDITU_KEY}`

  const satelliteBase = L.layerGroup([
    L.tileLayer(wmtsUrl('img_w', 'img'), tdOpts),
    L.tileLayer(wmtsUrl('cia_w', 'cia'), tdOpts),
  ])

  const vectorBase = L.layerGroup([
    L.tileLayer(wmtsUrl('vec_w', 'vec'), tdOpts),
    L.tileLayer(wmtsUrl('cva_w', 'cva'), tdOpts),
  ])

  satelliteBase.addTo(map)

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

// ── 影像结果处理 ──
const LAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']

function toDroneProxyUrl(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+(\/.*)$/)
  if (!match) return url
  return '/api/drone' + match[1].replace(/^\/api/, '')
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

function handleSearchResults(result: any) {
  if (!result?.results || !map) return
  const results = result.results
  if (results.length === 0) return
  clearLayers()

  results.forEach((img: any, idx: number) => {
    const color = LAYER_COLORS[idx % LAYER_COLORS.length]
    if (img.tile_url) {
      const tileUrl = toDroneProxyUrl(img.tile_url)
      const layer = L.tileLayer(tileUrl, { maxZoom: MAP_MAX_ZOOM, opacity: 0.85, pane: 'droneTiles' }).addTo(map!)
      tileLayerMap.set(img.id, layer)
    }
    if (img.bbox) {
      const bounds: L.LatLngBoundsExpression = [[img.bbox[1], img.bbox[0]], [img.bbox[3], img.bbox[2]]]
      const rect = L.rectangle(bounds, { color: color, weight: 2, fill: false, dashArray: '5,5' }).addTo(map!)
      rectMap.set(img.id, rect)
      if (idx === 0) map!.fitBounds(bounds, { padding: [50, 50] })
    }
    imageLayers.value.push({ id: img.id, field_name: img.field_name, task_id: img.task_id, survey_stage: img.survey_stage, color, visible: true, ...img })
  })

  if (results.length > 0) selectedImage.value = imageLayers.value[0]
}

function clearLayers() {
  tileLayerMap.forEach(layer => layer.remove()); tileLayerMap.clear()
  rectMap.forEach(rect => rect.remove()); rectMap.clear()
  imageLayers.value = []; selectedImage.value = null
}

function selectLayer(layer: any) { selectedImage.value = layer }

function toggleLayer(layer: any) {
  const tileLayer = tileLayerMap.get(layer.id)
  if (!tileLayer || !map) return
  if (layer.visible) { tileLayer.remove(); layer.visible = false }
  else { tileLayer.addTo(map); layer.visible = true }
}
</script>

<style scoped>
.imaging-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Topbar */
.topbar {
  display: flex; align-items: center; padding: 12px 24px;
  border-bottom: 1px solid var(--border-light); background: var(--paper);
  gap: 12px; flex-shrink: 0;
}
.sidebar-toggle {
  width: 34px; height: 34px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--paper);
  color: var(--ink-muted); cursor: pointer; display: none;
  align-items: center; justify-content: center; font-size: 16px; transition: all .15s;
}
.sidebar-toggle:hover { background: var(--rice); color: var(--ink); }
.topbar-title {
  font-family: var(--display); font-weight: 600; font-size: 16px;
  color: var(--ink); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.top-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Main */
.imaging-main { flex: 1; display: flex; min-height: 0; }

/* Map area */
.map-area { flex: 1; position: relative; min-width: 0; }
.map-container { width: 100%; height: 100%; }

.layer-panel {
  position: absolute; top: 12px; left: 12px;
  background: rgba(255,255,255,0.95); border-radius: 10px; padding: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,.15); max-width: 260px; z-index: 1000;
}
.layer-panel-title { font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; }
.layer-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.layer-item:hover { background: #f0f0f0; }
.layer-item.active { background: #e8f5e9; }
.layer-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layer-stage { font-size: 11px; color: #999; }
.layer-eye { border: none; background: transparent; cursor: pointer; font-size: 14px; line-height: 1; padding: 2px; flex-shrink: 0; transition: opacity .15s, filter .15s; }
.layer-eye:hover { transform: scale(1.15); }
.layer-eye.off { opacity: 0.3; filter: grayscale(1); }

.info-popup {
  position: absolute; bottom: 12px; left: 12px;
  background: rgba(255,255,255,0.97); border-radius: 10px;
  box-shadow: 0 2px 16px rgba(0,0,0,.18); width: 320px; max-height: 300px; overflow-y: auto; z-index: 1000;
}
.info-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; font-weight: 600; font-size: 14px; border-bottom: 1px solid #eee; }
.info-close { background: none; border: none; cursor: pointer; font-size: 16px; color: #999; }
.info-popup-body { padding: 12px 14px; }
.info-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.info-row label { color: #888; }
.info-desc { margin-top: 10px; }
.info-desc label { font-size: 12px; color: #888; display: block; margin-bottom: 4px; }
.info-desc p { font-size: 13px; line-height: 1.6; color: #333; }

/* Right chat panel (resizable) */
.chat-panel {
  display: flex;
  height: 100%;
  background: #fafafa;
  border-left: 1px solid var(--border-light);
  position: relative;
}
.chat-panel-drag-handle {
  position: absolute;
  left: 0; top: 0; bottom: 0;
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
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; font-weight: 600; font-size: 15px;
  border-bottom: 1px solid var(--border-light); background: #fff; flex-shrink: 0;
}
.chat-messages { flex: 1; overflow-y: auto; padding: 16px; }
.chat-welcome { text-align: center; padding: 40px 20px; color: #888; }
.chat-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
.chat-examples span { padding: 6px 12px; background: #e8f5e9; border-radius: 16px; font-size: 12px; cursor: pointer; color: #2e7d32; }
.chat-msg { margin-bottom: 14px; }
.chat-msg.user .chat-msg-content {
  background: var(--celadon); color: #fff; padding: 10px 14px;
  border-radius: 12px 12px 2px 12px; display: inline-block; max-width: 90%; font-size: 14px;
}
.chat-msg.assistant .chat-msg-content {
  background: #fff; padding: 10px 14px; border-radius: 12px 12px 12px 2px;
  border: 1px solid var(--border-light); font-size: 14px; line-height: 1.6;
}
.tool-calls { margin-top: 6px; }
.tool-card { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #f5f5f5; border-radius: 12px; font-size: 12px; margin-right: 6px; }
.tool-card.completed { background: #e8f5e9; }
.tool-card.error { background: #fce4ec; }

.pill { font-size: 11px; color: var(--ink-muted); border: 1px solid var(--border); padding: 4px 10px; border-radius: 999px; font-family: var(--mono); }
.pill.ok { color: var(--celadon); border-color: var(--celadon-dim); background: var(--celadon-pale); }

/* Make the shared Composer fit the narrow panel */
.chat-panel-inner :deep(.composer-wrap) {
  padding: 10px 12px 12px;
}
.chat-panel-inner :deep(.composer) {
  max-width: none;
}

@media (max-width: 768px) {
  .sidebar-toggle { display: flex; }
  .topbar { padding: 10px 16px; }
  .chat-panel { width: 300px !important; min-width: 300px !important; }
  .chat-panel-drag-handle { display: none; }
}
</style>
