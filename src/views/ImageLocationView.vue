<template>
  <div class="location-layout">
    <!-- Topbar -->
    <header class="topbar">
      <button class="back-btn" @click="goBack" aria-label="返回">←</button>
      <span class="topbar-title">🛰️ 影像卫星定位</span>
      <div class="top-actions">
        <span class="pill" :class="{ ok: apiConnected }">{{ apiConnected ? '已连接' : '未连接' }}</span>
      </div>
    </header>

    <!-- Main content -->
    <div class="location-main">
      <!-- Map area -->
      <div class="map-area">
        <div ref="mapContainer" class="map-container"></div>

        <!-- Image info panel -->
        <div class="info-panel" v-if="imageData">
          <div class="info-panel-header">
            <span>{{ imageData.field_name || imageData.task_id || '影像信息' }}</span>
          </div>
          <div class="info-panel-body">
            <div class="info-row"><label>任务编号</label><span>{{ imageData.task_id || '-' }}</span></div>
            <div class="info-row"><label>田块名称</label><span>{{ imageData.field_name || '-' }}</span></div>
            <div class="info-row"><label>调查阶段</label><span>{{ imageData.survey_stage || '-' }}</span></div>
            <div class="info-row"><label>调查时间</label><span>{{ imageData.survey_time || '-' }}</span></div>
            <div class="info-row" v-if="imageData.bbox"><label>地理范围</label><span>[{{ imageData.bbox.join(', ') }}]</span></div>
            <div class="info-row" v-if="imageData.bbox"><label>中心点</label><span>{{ centerPoint }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// OpenLayers imports
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import Feature from 'ol/Feature'
import { Fill, Stroke, Style } from 'ol/style'
import { Polygon } from 'ol/geom'

const route = useRoute()
const router = useRouter()

// ── State ──
const mapContainer = ref<HTMLElement | null>(null)
const apiConnected = ref(false)
const imageData = ref<any>(null)

const centerPoint = computed(() => {
  const bbox = imageData.value?.bbox
  if (!bbox || bbox.length < 4) return '-'
  const centerLon = ((bbox[0] + bbox[2]) / 2).toFixed(6)
  const centerLat = ((bbox[1] + bbox[3]) / 2).toFixed(6)
  return `${centerLat}, ${centerLon}`
})

// OpenLayers objects
let map: Map | null = null
const bboxSource = new VectorSource()

// ── Tianditu config ──
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY || '976ad152f68499029b95bfa5313ac9cc'

// ── Navigation ──
function goBack() {
  router.back()
}

// ── Map initialization ──
onMounted(async () => {
  // 从路由参数获取影像数据
  const imageParam = route.query.image
  if (imageParam) {
    try {
      imageData.value = JSON.parse(imageParam as string)
    } catch (e) {
      console.error('[ImageLocation] failed to parse image param:', e)
    }
  }

  await initMap()
  checkApi()
})

onUnmounted(() => {
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})

async function initMap() {
  if (!mapContainer.value) return

  // ESRI World Imagery 卫星底图
  const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  const labelUrl = 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'

  // 底图图层
  const baseLayer = new TileLayer({
    source: new XYZ({
      url: satelliteUrl,
      maxZoom: 19,
    }),
    zIndex: 0,
  })

  // 标注图层
  const labelLayer = new TileLayer({
    source: new XYZ({
      url: labelUrl,
      maxZoom: 19,
    }),
    zIndex: 1,
  })

  // Bounding box 图层
  const bboxLayer = new VectorLayer({
    source: bboxSource,
    style: new Style({
      stroke: new Stroke({ color: '#ff6b6b', width: 3 }),
      fill: new Fill({ color: 'rgba(255, 107, 107, 0.2)' }),
    }),
    zIndex: 10,
  })

  // 初始中心点（默认位置）
  const initialCenter = fromLonLat([109.213, 18.364])

  map = new Map({
    target: mapContainer.value,
    layers: [baseLayer, labelLayer, bboxLayer],
    view: new View({
      center: initialCenter,
      zoom: 15,
      maxZoom: 19,
    }),
  })

  // 如果有影像数据，显示 bbox
  if (imageData.value?.bbox) {
    showImageBBox(imageData.value.bbox)
  }

  setTimeout(() => {
    map?.updateSize()
    map?.render()
  }, 200)
}

function showImageBBox(bbox: number[]) {
  if (!map || !bbox) return

  bboxSource.clear()

  const coords = [[
    fromLonLat([bbox[0], bbox[1]]),
    fromLonLat([bbox[2], bbox[1]]),
    fromLonLat([bbox[2], bbox[3]]),
    fromLonLat([bbox[0], bbox[3]]),
    fromLonLat([bbox[0], bbox[1]]),
  ]]

  const feature = new Feature({
    geometry: new Polygon(coords),
  })
  feature.setStyle(new Style({
    stroke: new Stroke({ color: '#ff6b6b', width: 3 }),
    fill: new Fill({ color: 'rgba(255, 107, 107, 0.2)' }),
  }))
  bboxSource.addFeature(feature)

  // 缩放到影像范围
  const poly = new Polygon(coords)
  const extent = poly.getExtent()
  map.getView().fit(extent, { padding: [80, 80], maxZoom: 17 })

  console.log('[ImageLocation] bbox displayed:', bbox)
}

function checkApi() {
  fetch('/api/drone/health')
    .then(r => { apiConnected.value = r.ok })
    .catch(() => { apiConnected.value = false })
}
</script>

<style scoped>
.location-layout {
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
.back-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--ink-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all .15s;
}
.back-btn:hover {
  background: var(--rice);
  color: var(--ink);
}
.topbar-title {
  font-family: var(--display);
  font-weight: 600;
  font-size: 16px;
  color: var(--ink);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Main */
.location-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* Map area */
.map-area {
  flex: 1;
  position: relative;
  min-width: 0;
}
.map-container {
  width: 100%;
  height: 100%;
}

/* Info panel */
.info-panel {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 10px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, .18);
  width: 320px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}
.info-panel-header {
  padding: 12px 14px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid #eee;
}
.info-panel-body {
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
  flex-shrink: 0;
  width: 80px;
}
.info-row span {
  color: var(--ink);
  text-align: right;
  font-family: var(--mono);
  font-size: 12px;
}

.pill {
  font-size: 11px;
  color: var(--ink-muted);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 999px;
  font-family: var(--mono);
}
.pill.ok {
  color: var(--celadon);
  border-color: var(--celadon-dim);
  background: var(--celadon-pale);
}

@media (max-width: 768px) {
  .topbar {
    padding: 10px 16px;
  }
  .info-panel {
    width: calc(100% - 24px);
  }
}
</style>
