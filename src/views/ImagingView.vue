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

        <!-- Drawing toolbar -->
        <div class="draw-toolbar" v-if="isMapReady">
          <button
            class="draw-btn"
            :class="{ active: drawMode === 'rect' }"
            @click="toggleDraw('rect')"
            title="绘制矩形"
          >▭</button>
          <button
            class="draw-btn"
            :class="{ active: drawMode === 'polygon' }"
            @click="toggleDraw('polygon')"
            title="绘制多边形"
          >⬠</button>
          <button
            class="draw-btn"
            @click="clearDrawnRegion"
            :disabled="!drawnRegion"
            title="清除区域"
          >✕</button>
        </div>

        <!-- Drawing hint -->
        <div class="draw-hint" v-if="drawMode === 'rect'">
          拖拽绘制矩形，松开完成
        </div>
        <div class="draw-hint" v-if="drawMode === 'polygon'">
          点击添加顶点，双击或按 Enter 完成
        </div>

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
          </div>
        </div>

        <!-- Plots result panel -->
        <div class="plots-panel" v-if="plotsResult">
          <div class="plots-panel-header">
            <span>划分结果 ({{ plotsResult.total }} 个小区)</span>
            <button class="info-close" @click="clearPlots">✕</button>
          </div>
          <div class="plots-panel-body">
            <div
              v-for="plot in plotsResult.plots"
              :key="plot.id"
              class="plot-item"
              @click="flyToPlot(plot)"
            >
              <span class="plot-label">{{ plot.label }}</span>
              <span class="plot-area">{{ plot.area_m2.toFixed(1) }} m²</span>
            </div>
          </div>
        </div>

        <!-- Image detail modal -->
        <div class="image-modal" v-if="showImageModal" @click.self="closeImageModal">
          <div class="image-modal-content">
            <div class="image-modal-header">
              <span>{{ modalImage?.field_name || modalImage?.task_id || '影像详情' }}</span>
              <button class="info-close" @click="closeImageModal">✕</button>
            </div>
            <div class="image-modal-body">
              <div class="image-modal-thumb">
                <img
                  v-if="modalImage?.thumbnail_url"
                  :src="toDroneProxyUrl(modalImage.thumbnail_url)"
                  :alt="modalImage.field_name || modalImage.task_id"
                />
              </div>
              <div class="image-modal-info">
                <div class="info-row"><label>任务编号</label><span>{{ modalImage?.task_id || '-' }}</span></div>
                <div class="info-row"><label>田块名称</label><span>{{ modalImage?.field_name || '-' }}</span></div>
                <div class="info-row"><label>调查阶段</label><span>{{ modalImage?.survey_stage || '-' }}</span></div>
                <div class="info-row"><label>调查时间</label><span>{{ modalImage?.survey_time || '-' }}</span></div>
                <div class="info-row"><label>相似度</label><span>{{ modalImage?.score ? (modalImage.score * 100).toFixed(1) + '%' : '-' }}</span></div>
                <div class="info-row" v-if="modalImage?.vlm_description"><label>VLM描述</label><span>{{ modalImage.vlm_description }}</span></div>
                <div class="info-row" v-if="modalImage?.bbox"><label>地理范围</label><span>[{{ modalImage.bbox.join(', ') }}]</span></div>
              </div>
            </div>
            <div class="image-modal-footer">
              <button class="btn-fullscreen" @click="openFullscreen(modalImage)">
                🔍 全屏查看
              </button>
              <button
                class="btn-satellite"
                :disabled="!modalImage?.bbox"
                @click="modalImage?.bbox && goToSatelliteLocation(modalImage)"
              >
                🛰️ 查看卫星位置
              </button>
            </div>
          </div>
        </div>

        <!-- Fullscreen view modal -->
        <div class="fullscreen-modal" v-if="showFullscreen" @click.self="closeFullscreen">
          <div class="fullscreen-container">
            <div class="fullscreen-header">
              <span>{{ fullscreenImage?.field_name || fullscreenImage?.task_id || '全屏查看' }}</span>
              <div class="fullscreen-tools">
                <button
                  class="tool-btn"
                  :class="{ active: fullscreenDrawMode === 'rect' }"
                  @click="toggleFullscreenDraw('rect')"
                  title="绘制矩形"
                >▭</button>
                <button
                  class="tool-btn"
                  :class="{ active: fullscreenDrawMode === 'polygon' }"
                  @click="toggleFullscreenDraw('polygon')"
                  title="绘制多边形"
                >⬠</button>
                <button
                  class="tool-btn"
                  @click="clearFullscreenDraw"
                  :disabled="!fullscreenDrawnRegion"
                  title="清除"
                >✕</button>
              </div>
              <button class="info-close" @click="closeFullscreen">✕</button>
            </div>
            <div class="fullscreen-map-container" ref="fullscreenMapContainer"></div>
            <div class="fullscreen-loading" v-if="isLoadingTiles">
              <div class="loading-spinner"></div>
              <span>加载影像中...</span>
            </div>
            <div class="fullscreen-hint" v-if="fullscreenDrawMode !== 'idle'">
              {{ fullscreenDrawMode === 'rect' ? '拖拽绘制矩形，松开完成' : '点击添加顶点，双击或按 Enter 完成' }}
            </div>
            <div class="fullscreen-footer" v-if="fullscreenDrawnRegion">
              <div class="region-input">
                <input
                  v-model="completionDescription"
                  placeholder="描述如何补全剩余区域，如：按这个大小，5行3列布满整个区域"
                  @keyup.enter="triggerCompletion"
                />
                <button class="btn-complete" @click="triggerCompletion" :disabled="!completionDescription.trim()">
                  智能补全
                </button>
              </div>
              <div class="strategy-info" v-if="completionStrategy">
                <span class="strategy-badge">{{ completionStrategy }}</span>
                <span class="boundary-method" v-if="completionBoundaryMethod">{{ completionBoundaryMethod }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Time series slider -->
        <TimeSeriesSlider
          :images="timeImages"
          v-model="timeDate"
          @select="onTimeSelect"
        />
      </div>

      <!-- Right chat panel (resizable via left edge drag) -->
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
              <span class="chat-header-title">影像助手</span>
              <span v-if="currentConvId" class="chat-header-conv">{{ currentConvTitle }}</span>
            </div>
            <div class="chat-header-actions">
              <button class="btn-new-conv" title="新建对话" @click="onNewConversation">+ 新对话</button>
              <button class="btn-collapse" title="收起助手" @click="chatCollapsed = true">»</button>
            </div>
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
              <div class="chat-msg-content" v-html="renderMd(msg.content || defaultSummary(msg.tool_calls))"></div>
              <div v-if="msg.tool_calls" class="tool-calls">
                <div v-for="(tc, i) in msg.tool_calls" :key="i" class="tool-call-item">
                  <!-- search_images: 影像卡片 -->
                  <div v-if="tc.tool_name === 'search_images' && tc.status === 'completed' && tc.result?.results" class="image-cards">
                    <div class="image-cards-header">
                      <span class="tool-label">🔍 影像检索</span>
                      <span class="result-count">找到 {{ tc.result.results.length }} 幅</span>
                    </div>
                    <div class="image-cards-grid">
                      <div
                        v-for="img in tc.result.results"
                        :key="img.id"
                        class="image-card"
                        @click="showImageDetail(img)"
                      >
                        <div class="image-card-thumb">
                          <img
                            v-if="img.thumbnail_url"
                            :src="toDroneProxyUrl(img.thumbnail_url)"
                            :alt="img.field_name || img.task_id"
                            loading="lazy"
                          />
                          <div v-else class="image-card-no-thumb">暂无缩略图</div>
                        </div>
                        <div class="image-card-info">
                          <div class="image-card-title">{{ img.field_name || img.task_id }}</div>
                          <div class="image-card-meta">
                            <span v-if="img.survey_stage" class="meta-tag">{{ img.survey_stage }}</span>
                            <span v-if="img.score" class="meta-score">{{ (img.score * 100).toFixed(0) }}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- divide_plots: 统计摘要 -->
                  <div v-else-if="tc.tool_name === 'divide_plots' && tc.status === 'completed' && tc.result?.plots" class="plots-summary">
                    <div class="plots-summary-header">
                      <span class="tool-label">📐 小区划分</span>
                      <span class="result-count">共 {{ tc.result.total }} 个小区</span>
                    </div>
                    <div class="plots-summary-stats">
                      <div class="stat-item">
                        <span class="stat-value">{{ tc.result.total }}</span>
                        <span class="stat-label">小区总数</span>
                      </div>
                      <div class="stat-item" v-if="tc.result.parameters">
                        <span class="stat-value">{{ tc.result.parameters.n_rows || '?' }} × {{ tc.result.parameters.n_cols || '?' }}</span>
                        <span class="stat-label">行列数</span>
                      </div>
                      <div class="stat-item" v-if="tc.result.parameters?.plot_width_m">
                        <span class="stat-value">{{ tc.result.parameters.plot_width_m }}×{{ tc.result.parameters.plot_height_m }}m</span>
                        <span class="stat-label">小区尺寸</span>
                      </div>
                    </div>
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

          <!-- Region hint -->
          <div class="region-hint" v-if="drawnRegion">
            <span>已绘制区域，描述如何划分…</span>
            <button @click="clearDrawnRegion">清除</button>
          </div>

          <!-- Shared Composer (imaging mode: fixed services, no thinking) -->
          <Composer
            placeholder="描述你想查看的影像，或描述如何划分区域… (Enter 发送，Shift+Enter 换行)"
            :show-thinking="false"
            :show-services="false"
            :fixed-services="['get_image_detail']"
          />
        </div>
      </div>

      <!-- Collapsed chat strip -->
      <button v-else class="chat-panel-collapsed" title="展开影像助手" @click="chatCollapsed = false">
        <span class="chat-panel-collapsed-icon">💬</span>
        <span class="chat-panel-collapsed-text">影像助手</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// OpenLayers imports
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import { fromLonLat, toLonLat } from 'ol/proj'
import { Draw } from 'ol/interaction'
import Feature from 'ol/Feature'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { Polygon } from 'ol/geom'
import { useChat } from '../composables/useChat'
import Composer from '../components/Composer.vue'
import TimeSeriesSlider from '../components/TimeSeriesSlider.vue'

const router = useRouter()
const {
  messages, isStreaming, streamContent,
  loadConversations, conversations, currentConvId, newConversation,
} = useChat()

// ── State ──
const mapContainer = ref<HTMLElement | null>(null)
const chatEl = ref<HTMLElement | null>(null)
const apiConnected = ref(false)
const imageLayers = ref<any[]>([])
const selectedImage = ref<any>(null)
const chatPanelWidth = ref(380)
const isMapReady = ref(false)
const chatCollapsed = ref(false)
const timeImages = ref<any[]>([])
const timeDate = ref('')

// ── Chat helpers ──
const currentConvTitle = computed(() => {
  if (!currentConvId.value) return ''
  const conv = conversations.value.find(c => c.id === currentConvId.value)
  return conv?.title || ''
})

function onNewConversation() {
  newConversation()
}

// OpenLayers objects
let map: Map | null = null
let droneTileLayer: TileLayer<any> | null = null
const bboxSource = new VectorSource()
const timeBboxSource = new VectorSource()
const drawnRegionSource = new VectorSource()
const plotsSource = new VectorSource()
let drawInteraction: Draw | null = null

// Drawing state
const drawMode = ref<'idle' | 'rect' | 'polygon'>('idle')
const drawnRegion = ref<{ type: string; coordinates: number[] } | null>(null)
const plotsResult = ref<any>(null)

// ── Fullscreen state ──
const showFullscreen = ref(false)
const fullscreenImage = ref<any>(null)
const fullscreenMapContainer = ref<HTMLElement | null>(null)
const isLoadingTiles = ref(false)
const fullscreenDrawnRegion = ref<{ type: string; coordinates: number[] } | null>(null)
const fullscreenDrawMode = ref<'idle' | 'rect' | 'polygon'>('idle')
const completionDescription = ref('')
const completionStrategy = ref<string>('')
const completionBoundaryMethod = ref<string>('')
let fullscreenMap: Map | null = null
const fullscreenDrawnSource = new VectorSource()
const fullscreenBoundarySource = new VectorSource()
const fullscreenPlotsSource = new VectorSource()
let fullscreenDrawInteraction: Draw | null = null

// ── Tianditu config ──
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY || '976ad152f68499029b95bfa5313ac9cc'
const TIANDITU_MAX_NATIVE_ZOOM = 18
const MAP_MAX_ZOOM = 22

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

// ── Mobile sidebar ──
function openMobileSidebar() {
  window.dispatchEvent(new CustomEvent('phenomics:toggle-sidebar'))
}

// ── Map initialization ──
onMounted(async () => {
  await initMap()
  await loadConversations()
  checkApi()
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
})

onUnmounted(() => {
  if (map) { map.setTarget(undefined); map = null }
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

async function initMap() {
  if (!mapContainer.value) return

  // Map source configuration - multiple fallback options
  const tiandituUrl = `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TIANDITU_KEY}`
  const tiandituAnnoUrl = `https://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TIANDITU_KEY}`

  // Free map sources (no API key required)
  const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const cartoLightUrl = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
  const cartoDarkUrl = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
  const esriWorldImageryUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

  // Determine which map source to use
  const useTianditu = TIANDITU_KEY && TIANDITU_KEY !== '976ad152f68499029b95bfa5313ac9cc'
  const baseUrl = useTianditu ? tiandituUrl : esriWorldImageryUrl

  // Base layer
  const baseLayer = new TileLayer({
    source: new XYZ({
      url: baseUrl,
      maxZoom: MAP_MAX_ZOOM,
    }),
    zIndex: 0,
  })

  // Annotation layer (only for Tianditu)
  const annoLayer = new TileLayer({
    source: new XYZ({
      url: useTianditu ? tiandituAnnoUrl : cartoLightUrl,
      maxZoom: MAP_MAX_ZOOM,
    }),
    zIndex: 1,
    opacity: useTianditu ? 1 : 0,
  })

  // Drone tile layer (dynamic source, set on search)
  droneTileLayer = new TileLayer({
    source: new XYZ({
      url: '/api/drone/api/tiles/placeholder/{z}/{x}/{y}.png',
      maxZoom: MAP_MAX_ZOOM,
    }),
    zIndex: 10,
    visible: false,
  })

  // Bounding box layer (for search results)
  const bboxLayer = new VectorLayer({
    source: bboxSource,
    style: new Style({
      stroke: new Stroke({ color: '#e74c3c', width: 2, lineDash: [5, 5] }),
    }),
    zIndex: 15,
  })

  // Time series bounding box layer
  const timeBboxLayer = new VectorLayer({
    source: timeBboxSource,
    style: new Style({
      stroke: new Stroke({ color: '#f1c40f', width: 3 }),
    }),
    zIndex: 12,
  })

  // Drawn region layer
  const drawnRegionLayer = new VectorLayer({
    source: drawnRegionSource,
    style: new Style({
      stroke: new Stroke({ color: '#e74c3c', width: 3 }),
      fill: new Fill({ color: 'rgba(231, 76, 60, 0.15)' }),
    }),
    zIndex: 20,
  })

  // Plots layer
  const plotsLayer = new VectorLayer({
    source: plotsSource,
    zIndex: 30,
  })

  map = new Map({
    target: mapContainer.value,
    layers: [baseLayer, annoLayer, droneTileLayer, timeBboxLayer, bboxLayer, drawnRegionLayer, plotsLayer],
    view: new View({
      center: fromLonLat([109.213, 18.364]),
      zoom: 15,
      maxZoom: MAP_MAX_ZOOM,
    }),
  })

  // 确保地图尺寸正确
  setTimeout(() => {
    if (map) {
      map.updateSize()
      isMapReady.value = true
      console.log('[Map] map ready, size updated')
    }
  }, 100)
}

function checkApi() {
  fetch('/api/drone/health')
    .then(r => { apiConnected.value = r.ok })
    .catch(() => { apiConnected.value = false })
}

// ── Chat ──
function renderMd(text: string) {
  if (!text) return ''
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
}

function defaultSummary(toolCalls: any[] | null) {
  if (!toolCalls || toolCalls.length === 0) return ''
  const summaries: string[] = []
  for (const tc of toolCalls) {
    if (tc.tool_name === 'search_images' && tc.status === 'completed') {
      const count = tc.result?.results?.length ?? (tc.result ? '若干' : '0')
      summaries.push(`已为您找到 ${count} 幅影像，结果已展示在地图上。`)
    } else if (tc.tool_name === 'divide_plots' && tc.status === 'completed') {
      const count = tc.result?.total ?? (tc.result ? '若干' : '0')
      summaries.push(`已完成小区划分，共生成 ${count} 个小区。`)
    } else if (tc.tool_name === 'get_image_detail' && tc.status === 'completed') {
      summaries.push(`已获取影像详情。`)
    }
  }
  return summaries.join('')
}

// ── Drawing ──
function toggleDraw(type: 'rect' | 'polygon') {
  console.log('[Drawing] toggleDraw called, type:', type, 'current mode:', drawMode.value, 'map ready:', isMapReady.value)
  if (drawMode.value === type) {
    drawMode.value = 'idle'
    removeDrawInteraction()
    return
  }
  drawMode.value = type
  addDrawInteraction(type)
}

function addDrawInteraction(type: 'rect' | 'polygon') {
  if (!map) {
    console.error('[Drawing] map is null!')
    return
  }
  console.log('[Drawing] addDrawInteraction, type:', type)
  removeDrawInteraction()

  let geometryFunction: any
  let drawType: any = 'Polygon'

  if (type === 'rect') {
    // 使用 LineString + 2个点来绘制矩形（OpenLayers 10.x 兼容）
    drawType = 'LineString'
    geometryFunction = (coordinates: any, geometry: any, projection: any) => {
      if (!geometry) {
        geometry = new Polygon([])
      }
      const start = coordinates[0]
      const end = coordinates[coordinates.length - 1]
      if (start && end) {
        const minX = Math.min(start[0], end[0])
        const maxX = Math.max(start[0], end[0])
        const minY = Math.min(start[1], end[1])
        const maxY = Math.max(start[1], end[1])
        const rect = [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
          [minX, minY],
        ]
        geometry.setCoordinates([rect])
      }
      return geometry
    }
  }

  drawInteraction = new Draw({
    source: drawnRegionSource,
    type: drawType,
    geometryFunction,
    maxPoints: type === 'rect' ? 2 : undefined,
  })

  drawInteraction.on('drawstart', () => {
    console.log('[Drawing] drawstart')
  })

  drawInteraction.on('drawend', (e: any) => {
    console.log('[Drawing] drawend', e.feature)
    const feature = e.feature as Feature
    const geom = feature.getGeometry() as Polygon
    const coords = geom.getCoordinates()[0]
    const wgs84Coords = coords.map((c: number[]) => toLonLat(c as [number, number]))
    drawnRegion.value = {
      type: 'Polygon',
      coordinates: wgs84Coords,
    }
    console.log('[Drawing] drawn region set:', drawnRegion.value)
    drawMode.value = 'idle'
    removeDrawInteraction()
  })

  map.addInteraction(drawInteraction)
  console.log('[Drawing] draw interaction added to map, active:', map.getInteractions().getLength())
}

function removeDrawInteraction() {
  if (map && drawInteraction) {
    map.removeInteraction(drawInteraction)
    drawInteraction = null
  }
}

function clearDrawnRegion() {
  drawnRegionSource.clear()
  drawnRegion.value = null
  drawMode.value = 'idle'
  removeDrawInteraction()
}

function clearPlots() {
  plotsSource.clear()
  plotsResult.value = null
}

function flyToPlot(plot: any) {
  if (!map || !plot.polygon) return
  const coords = plot.polygon[0].map((c: number[]) => fromLonLat(c as [number, number]))
  // Create a temporary polygon to fit
  const poly = new Polygon([coords])
  map.getView().fit(poly.getExtent(), { padding: [50, 50], duration: 500 })
}

// ── Fullscreen ──
function openFullscreen(img: any) {
  console.log('[Fullscreen] opening for image:', img.id)
  console.log('[Fullscreen] img keys:', Object.keys(img))
  console.log('[Fullscreen] img.tile_url:', img.tile_url)
  console.log('[Fullscreen] img.bbox:', img.bbox)
  fullscreenImage.value = img
  showFullscreen.value = true
  isLoadingTiles.value = true
  closeImageModal()
  // 使用 setTimeout 确保 DOM 完全渲染
  setTimeout(() => {
    initFullscreenMap(img)
  }, 100)
}

function initFullscreenMap(img: any) {
  if (!fullscreenMapContainer.value) {
    console.error('[Fullscreen] container not found')
    return
  }

  console.log('[Fullscreen] === DEBUG START ===')
  console.log('[Fullscreen] image id:', img.id)
  console.log('[Fullscreen] tile_url:', img.tile_url)
  console.log('[Fullscreen] bbox:', img.bbox)
  console.log('[Fullscreen] center_lon:', img.center_lon, 'center_lat:', img.center_lat)

  // 使用影像的瓦片URL
  const tileUrl = img.tile_url ? toDroneProxyUrl(img.tile_url) : ''
  console.log('[Fullscreen] converted tile URL:', tileUrl)

  if (!tileUrl) {
    console.error('[Fullscreen] no tile_url for image:', img.id)
    return
  }

  // 瓦片图层
  const droneLayer = new TileLayer({
    source: new XYZ({
      url: tileUrl,
      maxZoom: 24,
    }),
    zIndex: 10,
  })

  // 监听瓦片加载事件 - 详细调试
  let tileLoadCount = 0
  let tileErrorCount = 0
  droneLayer.getSource().on('tileloadstart', (e) => {
    console.log('[Fullscreen] tile load start:', e.tile.getTileCoord())
  })
  droneLayer.getSource().on('tileloadend', (e) => {
    tileLoadCount++
    console.log('[Fullscreen] tile load end:', e.tile.getTileCoord(), 'count:', tileLoadCount)
    isLoadingTiles.value = false
  })
  droneLayer.getSource().on('tileloaderror', (e) => {
    tileErrorCount++
    console.error('[Fullscreen] tile load error:', e.tile.getTileCoord(), 'count:', tileErrorCount)
    isLoadingTiles.value = false
  })

  // 绘制图层（用于画小区）
  const drawnLayer = new VectorLayer({
    source: fullscreenDrawnSource,
    style: new Style({
      stroke: new Stroke({ color: '#2ecc71', width: 3 }),
      fill: new Fill({ color: 'rgba(46, 204, 113, 0.2)' }),
    }),
    zIndex: 20,
  })

  const boundaryLayer = new VectorLayer({
    source: fullscreenBoundarySource,
    style: new Style({
      stroke: new Stroke({ color: '#e74c3c', width: 3 }),
      fill: new Fill({ color: 'rgba(231, 76, 60, 0.1)' }),
    }),
    zIndex: 15,
  })

  const plotsLayer = new VectorLayer({
    source: fullscreenPlotsSource,
    style: new Style({
      stroke: new Stroke({ color: '#3498db', width: 2 }),
      fill: new Fill({ color: 'rgba(52, 152, 219, 0.15)' }),
    }),
    zIndex: 25,
  })

  // 使用图片的中心点初始化地图视图
  const bbox = img.bbox
  const centerLon = (bbox && bbox.length >= 4) ? (bbox[0] + bbox[2]) / 2 : 109.213
  const centerLat = (bbox && bbox.length >= 4) ? (bbox[1] + bbox[3]) / 2 : 18.364

  // 根据 bbox 大小计算合适的缩放级别
  let initialZoom = 16
  if (bbox && bbox.length >= 4) {
    const lonDiff = Math.abs(bbox[2] - bbox[0])
    const latDiff = Math.abs(bbox[3] - bbox[1])
    const maxDiff = Math.max(lonDiff, latDiff)
    // 根据范围大小调整 zoom：范围越小，zoom 越高
    if (maxDiff < 0.0001) initialZoom = 22
    else if (maxDiff < 0.001) initialZoom = 20
    else if (maxDiff < 0.01) initialZoom = 18
    else if (maxDiff < 0.1) initialZoom = 16
    else initialZoom = 14
    console.log('[Fullscreen] bbox diff:', maxDiff, 'initial zoom:', initialZoom)
  }

  fullscreenMap = new Map({
    target: fullscreenMapContainer.value,
    layers: [droneLayer, boundaryLayer, drawnLayer, plotsLayer],
    view: new View({
      center: fromLonLat([centerLon, centerLat]),
      zoom: initialZoom,
      maxZoom: 24,
    }),
  })

  console.log('[Fullscreen] map created, view center:', fullscreenMap.getView().getCenter(), 'zoom:', fullscreenMap.getView().getZoom())
  console.log('[Fullscreen] container size:', fullscreenMapContainer.value.clientWidth, 'x', fullscreenMapContainer.value.clientHeight)

  setTimeout(() => {
    fullscreenMap?.updateSize()
    fullscreenMap?.render()
    console.log('[Fullscreen] === AFTER TIMEOUT ===')
    console.log('[Fullscreen] map zoom:', fullscreenMap?.getView().getZoom())
    console.log('[Fullscreen] map center:', fullscreenMap?.getView().getCenter())
    console.log('[Fullscreen] container size after update:', fullscreenMapContainer.value?.clientWidth, 'x', fullscreenMapContainer.value?.clientHeight)
    console.log('[Fullscreen] tile loads:', tileLoadCount, 'errors:', tileErrorCount)
    console.log('[Fullscreen] === DEBUG END ===')
  }, 300)
}

// ── 画小区模式时加载坐标 ──
function initFullscreenCoordinates() {
  const img = fullscreenImage.value
  if (!img || !fullscreenMap) return

  const bbox = img.bbox
  const isValidBBox = bbox && Array.isArray(bbox) && bbox.length >= 4 &&
    bbox.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))

  if (!isValidBBox) {
    console.warn('[Fullscreen] no valid bbox, skip coordinate init')
    return
  }

  // 计算影像中心
  const center = fromLonLat([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2])
  fullscreenMap.getView().setCenter(center)

  // 缩放到影像范围
  const poly = new Polygon([[
    fromLonLat([bbox[0], bbox[1]]),
    fromLonLat([bbox[2], bbox[1]]),
    fromLonLat([bbox[2], bbox[3]]),
    fromLonLat([bbox[0], bbox[3]]),
    fromLonLat([bbox[0], bbox[1]]),
  ]])
  const extent = poly.getExtent()

  if (extent.every(v => isFinite(v))) {
    const lonDiff = Math.abs(bbox[2] - bbox[0])
    const latDiff = Math.abs(bbox[3] - bbox[1])
    const minDiff = 0.0001

    if (lonDiff < minDiff || latDiff < minDiff) {
      // bbox 太小，扩大范围
      const centerLon = (bbox[0] + bbox[2]) / 2
      const centerLat = (bbox[1] + bbox[3]) / 2
      const expandedPoly = new Polygon([[
        fromLonLat([centerLon - minDiff, centerLat - minDiff]),
        fromLonLat([centerLon + minDiff, centerLat - minDiff]),
        fromLonLat([centerLon + minDiff, centerLat + minDiff]),
        fromLonLat([centerLon - minDiff, centerLat + minDiff]),
        fromLonLat([centerLon - minDiff, centerLat - minDiff]),
      ]])
      fullscreenMap.getView().fit(expandedPoly.getExtent(), { padding: [40, 40], maxZoom: 22 })
    } else {
      fullscreenMap.getView().fit(extent, { padding: [40, 40], maxZoom: 20 })
    }
  }

  console.log('[Fullscreen] coordinates initialized')
}

function closeFullscreen() {
  if (fullscreenMap) {
    fullscreenMap.setTarget(undefined)
    fullscreenMap = null
  }
  showFullscreen.value = false
  fullscreenImage.value = null
  fullscreenDrawnRegion.value = null
  fullscreenDrawMode.value = 'idle'
  completionDescription.value = ''
  completionStrategy.value = ''
  completionBoundaryMethod.value = ''
}

function toggleFullscreenDraw(type: 'rect' | 'polygon') {
  if (fullscreenDrawMode.value === type) {
    fullscreenDrawMode.value = 'idle'
    removeFullscreenDrawInteraction()
    return
  }
  // 进入画小区模式时，先加载坐标
  if (!isCoordinatesLoaded()) {
    initFullscreenCoordinates()
  }
  fullscreenDrawMode.value = type
  addFullscreenDrawInteraction(type)
}

// 检查是否已加载坐标
function isCoordinatesLoaded(): boolean {
  if (!fullscreenMap) return false
  const center = fullscreenMap.getView().getCenter()
  // 如果中心点是 [0, 0]，说明还没加载坐标
  return center && center[0] !== 0 && center[1] !== 0
}

function addFullscreenDrawInteraction(type: 'rect' | 'polygon') {
  if (!fullscreenMap) return
  removeFullscreenDrawInteraction()

  let geometryFunction: any
  let drawType: any = 'Polygon'

  if (type === 'rect') {
    // 使用 LineString + 2个点来绘制矩形（OpenLayers 10.x 兼容）
    drawType = 'LineString'
    geometryFunction = (coordinates: any, geometry: any, projection: any) => {
      if (!geometry) {
        geometry = new Polygon([])
      }
      // coordinates 是 LineString 的点数组，取第一个和最后一个点
      const start = coordinates[0]
      const end = coordinates[coordinates.length - 1]
      if (start && end) {
        const minX = Math.min(start[0], end[0])
        const maxX = Math.max(start[0], end[0])
        const minY = Math.min(start[1], end[1])
        const maxY = Math.max(start[1], end[1])
        const rect = [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
          [minX, minY],
        ]
        geometry.setCoordinates([rect])
      }
      return geometry
    }
  }

  fullscreenDrawInteraction = new Draw({
    source: fullscreenDrawnSource,
    type: drawType,
    geometryFunction,
    maxPoints: type === 'rect' ? 2 : undefined,
  })

  fullscreenDrawInteraction.on('drawend', (e: any) => {
    const feature = e.feature as Feature
    const geom = feature.getGeometry() as Polygon
    const coords = geom.getCoordinates()[0]
    const wgs84Coords = coords.map((c: number[]) => toLonLat(c as [number, number]))
    fullscreenDrawnRegion.value = {
      type: 'Polygon',
      coordinates: [wgs84Coords],  // GeoJSON Polygon 格式：coordinates 是 rings 数组
    }
    console.log('[Fullscreen] drawn region:', fullscreenDrawnRegion.value)
    fullscreenDrawMode.value = 'idle'
    removeFullscreenDrawInteraction()
  })

  fullscreenMap.addInteraction(fullscreenDrawInteraction)
}

function removeFullscreenDrawInteraction() {
  if (fullscreenMap && fullscreenDrawInteraction) {
    fullscreenMap.removeInteraction(fullscreenDrawInteraction)
    fullscreenDrawInteraction = null
  }
}

function clearFullscreenDraw() {
  fullscreenDrawnSource.clear()
  fullscreenBoundarySource.clear()
  fullscreenPlotsSource.clear()
  fullscreenDrawnRegion.value = null
  fullscreenDrawMode.value = 'idle'
  removeFullscreenDrawInteraction()
}

async function triggerCompletion() {
  if (!fullscreenImage.value || !fullscreenDrawnRegion.value || !completionDescription.value.trim()) {
    return
  }

  console.log('[Completion] triggering smart completion')
  console.log('[Completion] image_id:', fullscreenImage.value.id)
  console.log('[Completion] example region:', fullscreenDrawnRegion.value)
  console.log('[Completion] description:', completionDescription.value)

  try {
    const response = await fetch('/api/drone/api/plots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_id: fullscreenImage.value.id,
        example_region: fullscreenDrawnRegion.value,
        description: completionDescription.value,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('[Completion] result:', data)

    // 显示策略信息
    if (data.debug_info) {
      completionStrategy.value = data.debug_info.strategy || ''
      completionBoundaryMethod.value = data.debug_info.boundary_info?.method || ''
    }

    // 在地图上显示补全结果
    renderFullscreenPlots(data.plots, data.debug_info)
  } catch (error) {
    console.error('[Completion] failed:', error)
    alert('智能补全失败: ' + error.message)
  }
}

function renderFullscreenPlots(plots: any[], debugInfo?: any) {
  if (!fullscreenMap) return

  // 清除之前的边界和小区绘制，但保留用户绘制的框
  fullscreenBoundarySource.clear()
  fullscreenPlotsSource.clear()
  // 注意：不清除 fullscreenDrawnSource，保留用户画的示例区域

  // 显示识别的边界（如果有）
  if (debugInfo?.boundary_info?.boundaries) {
    const boundaries = debugInfo.boundary_info.boundaries
    if (Array.isArray(boundaries) && boundaries.length > 2) {
      const coords = boundaries.map((c: number[]) => fromLonLat(c as [number, number]))
      const boundaryFeature = new Feature({
        geometry: new Polygon([coords]),
      })
      boundaryFeature.setStyle(new Style({
        stroke: new Stroke({ color: '#e74c3c', width: 3 }),
        fill: new Fill({ color: 'rgba(231, 76, 60, 0.05)' }),
      }))
      fullscreenBoundarySource.addFeature(boundaryFeature)
      console.log('[Fullscreen] rendered boundary:', boundaries.length, 'points')
    }
  }

  // 逐个动画显示小区
  let idx = 0
  const delay = 120
  const total = plots.length
  console.log('[Fullscreen] starting animation for', total, 'plots')
  const timer = setInterval(() => {
    if (idx >= total) {
      clearInterval(timer)
      console.log('[Fullscreen] animation complete')
      return
    }
    const plot = plots[idx]
    if (plot.polygon) {
      const coords = plot.polygon[0].map((c: number[]) => fromLonLat(c as [number, number]))
      const feature = new Feature({
        geometry: new Polygon([coords]),
      })
      feature.setStyle(new Style({
        stroke: new Stroke({ color: '#2ecc71', width: 2 }),
        fill: new Fill({ color: 'rgba(46, 204, 113, 0.15)' }),
        text: new Text({
          text: plot.label,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: '#27ae60' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      }))
      fullscreenPlotsSource.addFeature(feature)
    }
    idx++
  }, delay)
}

// ── Search results ──
const LAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']
const _renderedResultKeys = new Set<string>()

function toDroneProxyUrl(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+(\/.*)$/)
  if (!match) return url
  return '/api/drone' + match[1]
}

async function loadTimeSeries(fieldName: string, initial?: any) {
  if (!fieldName) return
  try {
    const resp = await fetch(`/api/drone/api/images?field_name=${encodeURIComponent(fieldName)}&page_size=200`)
    if (!resp.ok) return
    const data = await resp.json()
    const items: any[] = (data.items || []).filter((it: any) => it.tile_url && it.bbox)
    if (!items.length) return
    timeImages.value = items
    timeDate.value = initial?.survey_time ? String(initial.survey_time).slice(0, 10) : ''
    if (initial) onTimeSelect(initial)
  } catch (e) {
    console.error('[ImagingView] 加载时间序列失败:', e)
  }
}

function onTimeSelect(img: any) {
  if (!img) return
  if (droneTileLayer && img.tile_url) {
    droneTileLayer.setSource(new XYZ({ url: toDroneProxyUrl(img.tile_url), maxZoom: MAP_MAX_ZOOM }))
    droneTileLayer.setVisible(true)
  }
  if (img.bbox) {
    timeBboxSource.clear()
    const coords = [[
      fromLonLat([img.bbox[0], img.bbox[1]]),
      fromLonLat([img.bbox[2], img.bbox[1]]),
      fromLonLat([img.bbox[2], img.bbox[3]]),
      fromLonLat([img.bbox[0], img.bbox[3]]),
      fromLonLat([img.bbox[0], img.bbox[1]]),
    ]]
    const feature = new Feature({ geometry: new Polygon(coords) })
    feature.setStyle(new Style({ stroke: new Stroke({ color: '#f1c40f', width: 3 }) }))
    timeBboxSource.addFeature(feature)
  }
  showImageDetail(img)
}

watch(messages, (msgs) => {
  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        console.log('[ImagingView] tool_call:', tc.tool_name, tc.status, tc.result ? 'has result' : 'no result')
        if (tc.tool_name === 'search_images' && tc.status === 'completed' && tc.result) {
          console.log('[ImagingView] search_images result keys:', Object.keys(tc.result))
          console.log('[ImagingView] search_images result.results type:', typeof tc.result.results, Array.isArray(tc.result.results) ? 'is array' : 'not array')
          const key = `${msg.id}:${tc.tool_name}:${JSON.stringify(tc.result)}`
          if (_renderedResultKeys.has(key)) continue
          _renderedResultKeys.add(key)
          console.log('[ImagingView] handleSearchResults called, results:', tc.result.results?.length)
          if (tc.result.results?.length > 0) {
            console.log('[ImagingView] first result keys:', Object.keys(tc.result.results[0]))
            console.log('[ImagingView] first result tile_url:', tc.result.results[0].tile_url)
          }
          handleSearchResults(tc.result)
        }
        if (tc.tool_name === 'divide_plots' && tc.status === 'completed' && tc.result) {
          const key = `${msg.id}:${tc.tool_name}:${JSON.stringify(tc.result)}`
          if (_renderedResultKeys.has(key)) continue
          _renderedResultKeys.add(key)
          handlePlotsResult(tc.result)
        }
      }
    }
  }
}, { deep: true })

function handleSearchResults(result: any) {
  console.log('[ImagingView] handleSearchResults called')
  console.log('[ImagingView] result:', JSON.stringify(result).slice(0, 500))
  console.log('[ImagingView] result?.results:', result?.results)
  console.log('[ImagingView] map exists:', !!map)
  if (!result?.results || !map) return
  const results = result.results
  if (results.length === 0) return
  console.log('[ImagingView] handleSearchResults: map exists, results:', results.length)

  // 更新无人机瓦片源（不移除图层，只更新源）
  // 找到第一个有 tile_url 的影像
  const tileImg = results.find((img: any) => img.tile_url)
  if (tileImg && droneTileLayer) {
    const tileUrl = toDroneProxyUrl(tileImg.tile_url)
    console.log('[ImagingView] drone tile URL:', tileUrl)
    droneTileLayer.setSource(new XYZ({ url: tileUrl, maxZoom: MAP_MAX_ZOOM }))
    droneTileLayer.setVisible(true)
    console.log('[ImagingView] drone tile source updated')
  }

  // 清除旧的红框，添加新的
  bboxSource.clear()
  results.forEach((img: any, idx: number) => {
    const color = LAYER_COLORS[idx % LAYER_COLORS.length]
    if (img.bbox) {
      const coords = [[
        fromLonLat([img.bbox[0], img.bbox[1]]),
        fromLonLat([img.bbox[2], img.bbox[1]]),
        fromLonLat([img.bbox[2], img.bbox[3]]),
        fromLonLat([img.bbox[0], img.bbox[3]]),
        fromLonLat([img.bbox[0], img.bbox[1]]),
      ]]
      const feature = new Feature({
        geometry: new Polygon(coords),
      })
      feature.setStyle(new Style({
        stroke: new Stroke({ color, width: 2, lineDash: [5, 5] }),
      }))
      bboxSource.addFeature(feature)
    }
  })
  console.log('[ImagingView] bbox features added:', bboxSource.getFeatures().length)

  // 缩放到第一个 bbox
  if (results[0].bbox) {
    const firstCoords = [[
      fromLonLat([results[0].bbox[0], results[0].bbox[1]]),
      fromLonLat([results[0].bbox[2], results[0].bbox[1]]),
      fromLonLat([results[0].bbox[2], results[0].bbox[3]]),
      fromLonLat([results[0].bbox[0], results[0].bbox[3]]),
      fromLonLat([results[0].bbox[0], results[0].bbox[1]]),
    ]]
    const firstPoly = new Polygon(firstCoords)
    const extent = firstPoly.getExtent()
    console.log('[ImagingView] bbox extent:', extent)
    console.log('[ImagingView] firstCoords:', JSON.stringify(firstCoords))
    console.log('[ImagingView] map center BEFORE fit:', map.getView().getCenter())
    // 限制最大缩放级别为 18（底图最大 native zoom）
    map.getView().fit(extent, { padding: [50, 50], maxZoom: 18 })
    console.log('[ImagingView] map fitted to bbox, zoom:', map.getView().getZoom())
    console.log('[ImagingView] map center immediately after fit:', map.getView().getCenter())

    // 修复：fit 后 center 变为 NaN 的问题（小范围 extent 的精度问题）
    const centerAfterFit = map.getView().getCenter()
    if (centerAfterFit && (isNaN(centerAfterFit[0]) || isNaN(centerAfterFit[1]))) {
      console.warn('[ImagingView] fit() produced NaN center, manually calculating...')
      const safeCenter = [
        (extent[0] + extent[2]) / 2,
        (extent[1] + extent[3]) / 2,
      ]
      map.getView().setCenter(safeCenter)
      console.log('[ImagingView] manually set center to:', map.getView().getCenter())
    }
  }

  // 通知 OpenLayers 容器尺寸可能变化
  setTimeout(() => {
    if (!map) return
    console.log('[ImagingView] map updateSize - checking container size')
    const container = map.getTarget()
    console.log('[ImagingView] map container element:', container)
    console.log('[ImagingView] map container clientHeight:', container.clientHeight)
    console.log('[ImagingView] map container clientWidth:', container.clientWidth)
    console.log('[ImagingView] map container style:', container.style.cssText)
    map.updateSize()
    map.render()
    console.log('[ImagingView] map updateSize called')
  }, 100)

  // 额外调试：检查地图 canvas 状态
  setTimeout(() => {
    if (!map) return
    const container = map.getTarget()
    const canvas = container?.querySelector('canvas')
    console.log('[ImagingView] map canvas element:', canvas)
    if (canvas) {
      console.log('[ImagingView] canvas dimensions:', canvas.width, 'x', canvas.height)
      console.log('[ImagingView] canvas style:', canvas.style.cssText)
      console.log('[ImagingView] canvas computed display:', getComputedStyle(canvas).display)
      console.log('[ImagingView] canvas computed visibility:', getComputedStyle(canvas).visibility)
      console.log('[ImagingView] canvas computed opacity:', getComputedStyle(canvas).opacity)
    }
    console.log('[ImagingView] map view center:', map.getView().getCenter())
    console.log('[ImagingView] map view zoom:', map.getView().getZoom())
    console.log('[ImagingView] map layers count:', map.getLayers().getLength())
    map.getLayers().forEach((layer: any, i: number) => {
      console.log(`[ImagingView] layer ${i}:`, layer.get('name') || layer.constructor.name, 'visible:', layer.getVisible())
    })
  }, 200)

  // 更新图层列表
  imageLayers.value = results.map((img: any, idx: number) => ({
    id: img.id,
    field_name: img.field_name,
    task_id: img.task_id,
    survey_stage: img.survey_stage,
    color: LAYER_COLORS[idx % LAYER_COLORS.length],
    visible: true,
    ...img,
  }))
  selectedImage.value = imageLayers.value[0]
}

function handlePlotsResult(result: any) {
  if (!result?.plots || !map) return
  plotsResult.value = result
  plotsSource.clear()

  result.plots.forEach((plot: any, idx: number) => {
    if (!plot.polygon) return
    const coords = plot.polygon[0].map((c: number[]) => fromLonLat(c as [number, number]))
    const feature = new Feature({
      geometry: new Polygon([coords]),
    })
    feature.setStyle(new Style({
      stroke: new Stroke({ color: '#2ecc71', width: 2 }),
      fill: new Fill({ color: 'rgba(46, 204, 113, 0.1)' }),
      text: new Text({
        text: plot.label,
        font: '12px sans-serif',
        fill: new Fill({ color: '#2ecc71' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    }))
    plotsSource.addFeature(feature)
  })
}

function clearLayers() {
  bboxSource.clear()
  drawnRegionSource.clear()
  plotsSource.clear()
  imageLayers.value = []
  selectedImage.value = null
  _renderedResultKeys.clear()
}

function selectLayer(layer: any) {
  selectedImage.value = layer
  if (layer?.field_name) loadTimeSeries(layer.field_name, layer)
}

function toggleLayer(layer: any) {
  layer.visible = !layer.visible
  // Toggle drone tile layer visibility
  if (droneTileLayer) {
    droneTileLayer.setVisible(layer.visible)
  }
}

// ── Image detail modal ──
const showImageModal = ref(false)
const modalImage = ref<any>(null)

function showImageDetail(img: any) {
  console.log('[ImageDetail] showImageDetail called with img:', img)
  console.log('[ImageDetail] img keys:', Object.keys(img))
  console.log('[ImageDetail] img.tile_url:', img.tile_url)
  modalImage.value = img
  showImageModal.value = true
  if (img?.field_name) loadTimeSeries(img.field_name, img)
}

function closeImageModal() {
  showImageModal.value = false
  modalImage.value = null
}

// ── Navigate to satellite location page ──
function goToSatelliteLocation(img: any) {
  if (!img?.bbox) {
    alert('该影像没有地理坐标信息')
    return
  }
  router.push({
    path: '/imaging/location',
    query: { image: JSON.stringify(img) }
  })
}

// ── Watch drawn region ──
watch(drawnRegion, (newRegion) => {
  console.log('[Drawing] drawnRegion changed:', newRegion)
})
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

/* Drawing toolbar */
.draw-toolbar {
  position: absolute; top: 12px; right: 12px;
  background: rgba(255,255,255,0.95); border-radius: 10px; padding: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,.15); z-index: 1000;
  display: flex; gap: 4px;
}
.draw-btn {
  width: 36px; height: 36px; border: 1px solid var(--border);
  background: #fff; border-radius: 8px; cursor: pointer;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.draw-btn:hover { background: var(--rice); }
.draw-btn.active { background: var(--celadon); color: #fff; border-color: var(--celadon); }
.draw-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.draw-hint {
  position: absolute; top: 60px; right: 12px;
  background: rgba(255,255,255,0.95); border-radius: 8px; padding: 6px 12px;
  font-size: 12px; color: var(--ink-muted); z-index: 1000;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
}

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

/* Plots panel */
.plots-panel {
  position: absolute; bottom: 12px; right: 12px;
  background: rgba(255,255,255,0.97); border-radius: 10px;
  box-shadow: 0 2px 16px rgba(0,0,0,.18); width: 220px; max-height: 300px; overflow-y: auto; z-index: 1000;
}
.plots-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #eee; position: sticky; top: 0; background: rgba(255,255,255,0.97); }
.plots-panel-body { padding: 8px 10px; }
.plot-item { display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.plot-item:hover { background: #f0f0f0; }
.plot-label { font-weight: 600; color: var(--celadon); }
.plot-area { color: #888; font-size: 12px; }

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
.tool-calls { margin-top: 8px; }
.tool-call-item { margin-bottom: 8px; }
.tool-card { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #f5f5f5; border-radius: 12px; font-size: 12px; margin-right: 6px; }
.tool-card.completed { background: #e8f5e9; }
.tool-card.error { background: #fce4ec; }

/* Image cards */
.image-cards {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--border-light);
}
.image-cards-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.tool-label { font-weight: 600; font-size: 13px; color: var(--ink); }
.result-count { font-size: 12px; color: var(--ink-muted); }
.image-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.image-card {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all .2s;
  border: 1px solid var(--border-light);
}
.image-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  border-color: var(--celadon);
}
.image-card-thumb {
  width: 100%;
  aspect-ratio: 4/3;
  background: #e9ecef;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.image-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.image-card-no-thumb {
  font-size: 11px;
  color: #999;
}
.image-card-info {
  padding: 8px 10px;
}
.image-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.image-card-meta {
  display: flex;
  gap: 6px;
  align-items: center;
}
.meta-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--celadon-pale);
  color: var(--celadon);
  border-radius: 4px;
}
.meta-score {
  font-size: 10px;
  color: var(--ink-muted);
  font-family: var(--mono);
}

/* Plots summary */
.plots-summary {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--border-light);
}
.plots-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.plots-summary-stats {
  display: flex;
  gap: 16px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  border-radius: 8px;
  min-width: 70px;
}
.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--celadon);
}
.stat-label {
  font-size: 11px;
  color: var(--ink-muted);
  margin-top: 2px;
}

/* Image modal */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}
.image-modal-content {
  background: #fff;
  border-radius: 16px;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0,0,0,.2);
}
.image-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  font-weight: 600;
  font-size: 16px;
  border-bottom: 1px solid #eee;
}
.image-modal-body {
  padding: 20px;
}
.image-modal-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  background: #e9ecef;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
}
.image-modal-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.image-modal-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.image-modal-info .info-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}
.image-modal-info .info-row label {
  color: #888;
  flex-shrink: 0;
  width: 80px;
}
.image-modal-info .info-row span {
  color: var(--ink);
  text-align: right;
}

/* Image modal footer */
.image-modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: center;
}
.btn-fullscreen {
  padding: 8px 20px;
  background: var(--celadon);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all .15s;
}
.btn-fullscreen:hover {
  background: var(--celadon-dark);
}

.btn-satellite {
  padding: 8px 20px;
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all .15s;
}
.btn-satellite:hover:not(:disabled) {
  background: #2980b9;
}
.btn-satellite:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Fullscreen modal */
.fullscreen-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1a1a1a;
  z-index: 10001;
  display: flex;
  flex-direction: column;
}
.fullscreen-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.fullscreen-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: #2a2a2a;
  color: #fff;
  flex-shrink: 0;
}
.fullscreen-header span {
  flex: 1;
  font-weight: 600;
  font-size: 15px;
}
.fullscreen-tools {
  display: flex;
  gap: 4px;
}
.tool-btn {
  width: 36px;
  height: 36px;
  border: 1px solid #555;
  background: #333;
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
}
.tool-btn:hover {
  background: #444;
}
.tool-btn.active {
  background: var(--celadon);
  border-color: var(--celadon);
}
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.fullscreen-header .info-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 20px;
  padding: 4px 8px;
}
.fullscreen-header .info-close:hover {
  color: #fff;
}
.fullscreen-map-container {
  flex: 1;
  min-height: 0;
}
.fullscreen-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-size: 14px;
  z-index: 100;
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.fullscreen-error {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(231, 76, 60, 0.9);
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 100;
}
.fullscreen-hint {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 10;
}
.fullscreen-footer {
  padding: 12px 20px;
  background: #2a2a2a;
  flex-shrink: 0;
}
.region-input {
  display: flex;
  gap: 8px;
}
.region-input input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #555;
  background: #333;
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.region-input input::placeholder {
  color: #888;
}
.region-input input:focus {
  border-color: var(--celadon);
}
.btn-complete {
  padding: 10px 20px;
  background: var(--celadon);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition: all .15s;
}
.btn-complete:hover:not(:disabled) {
  background: var(--celadon-dark);
}
.btn-complete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.strategy-info {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}
.strategy-badge {
  padding: 4px 10px;
  background: #3498db;
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.boundary-method {
  padding: 4px 10px;
  background: #9b59b6;
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
}

.pill { font-size: 11px; color: var(--ink-muted); border: 1px solid var(--border); padding: 4px 10px; border-radius: 999px; font-family: var(--mono); }
.pill.ok { color: var(--celadon); border-color: var(--celadon-dim); background: var(--celadon-pale); }

/* Region hint */
.region-hint {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--celadon-pale);
  border-top: 1px solid var(--border-light);
  font-size: 12px; color: var(--celadon);
}
.region-hint button {
  background: none; border: none; color: var(--celadon); cursor: pointer;
  font-size: 12px; text-decoration: underline;
}

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
