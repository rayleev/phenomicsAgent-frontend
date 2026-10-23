<template>
  <div class="pt-layout">
    <!-- Top bar -->
    <header class="pt-topbar">
      <span class="pt-title">地块时空管理</span>

      <label class="pt-field">
        <span class="pt-field-label">试验田</span>
        <select v-model="fieldName" :disabled="fieldNames.length === 0">
          <option v-for="f in fieldNames" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>

      <label class="pt-field">
        <span class="pt-field-label">地块</span>
        <select v-model="selectedKey">
          <option :value="FIELD_KEY">整块田（拼接影像）</option>
          <option v-for="p in plots" :key="p.plot_id" :value="p.plot_id">
            {{ p.plot_code || p.plot_id }}
          </option>
        </select>
      </label>

      <div class="pt-type">
        <button :class="{ active: productType === 'rgb' }" @click="setType('rgb')">RGB</button>
        <button :class="{ active: productType === 'ms' }" @click="setType('ms')">多光谱</button>
      </div>
    </header>

    <!-- Body -->
    <div class="pt-body">
      <div class="pt-meta" v-if="current">
        <span class="pt-meta-title">{{ current._title || '影像' }}</span>
        <span class="pt-meta-sep">·</span>
        <span>{{ formatDate(current.survey_time) }}</span>
        <span class="pt-meta-sep">·</span>
        <span>{{ productType === 'rgb' ? 'RGB 可见光' : '多光谱' }}</span>
        <template v-if="resolutionText">
          <span class="pt-meta-sep">·</span>
          <span>{{ resolutionText }}</span>
        </template>
      </div>
      <div class="pt-meta pt-meta-empty" v-else>当前地块暂无{{ productType === 'rgb' ? 'RGB' : '多光谱' }}影像</div>

      <div
        ref="stageEl"
        class="pt-stage"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @dblclick="fit"
      >
        <img
          v-show="!loadError"
          ref="imgEl"
          :src="imageUrl"
          class="pt-img"
          :style="imgStyle"
          draggable="false"
          @load="onImgLoad"
          @error="onImgError"
        />
        <div v-if="loading" class="pt-tip">加载中…</div>
        <div v-else-if="loadError" class="pt-tip pt-tip-error">加载失败：{{ loadError }}</div>
        <div v-else class="pt-tip pt-tip-hint">滚轮缩放 · 拖拽平移 · 双击适应窗口</div>

        <TimeSeriesSlider
          :images="series"
          v-model="currentDate"
          @select="onSelect"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TimeSeriesSlider from '../components/TimeSeriesSlider.vue'

/**
 * 地块时空管理：
 * 以大图形式展示某个地块（整块田拼接影像 / 单个小区原始影像）随时间变化的影像序列，
 * 不叠加地图底图（影像在卫星地图上太小，这里只看影像本身）。
 */

const route = useRoute()
const router = useRouter()

const PROXY = '/api/drone'
const FIELD_KEY = '__field__'

// ── 选择状态 ──
const fieldNames = ref<string[]>([])
const fieldName = ref<string>('')
const plots = ref<{ plot_id: string; plot_code: string }[]>([])
const selectedKey = ref<string>(FIELD_KEY)
const productType = ref<'rgb' | 'ms'>('rgb')

// ── 数据 ──
const allImages = ref<any[]>([])
const mosaics = ref<any[]>([])
const series = ref<any[]>([])
const currentDate = ref('')
const current = ref<any>(null)

// ── 大图 DOM ──
const stageEl = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
const loading = ref(false)
const loadError = ref('')

// ── 缩放 / 平移 ──
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartTx = 0
let dragStartTy = 0

const imgStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  cursor: dragging.value ? 'grabbing' : 'grab',
}))

const imageUrl = computed(() => current.value?._url || '')

const resolutionText = computed(() => {
  const c = current.value
  if (!c) return ''
  const w = c.image_width ?? c.width_pixels
  const h = c.image_height ?? c.height_pixels
  return w && h ? `${w} × ${h} px` : ''
})

function formatDate(v: any): string {
  if (!v) return '-'
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('zh-CN')
}

function dateKey(v: any): string {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── 数据加载 ──
async function loadFieldNames() {
  try {
    const resp = await fetch(`${PROXY}/api/images?page_size=500`)
    if (!resp.ok) return
    const data = await resp.json()
    const set = new Set<string>()
    for (const it of data.items || []) {
      if (it.field_name) set.add(it.field_name)
    }
    fieldNames.value = Array.from(set).sort()
  } catch (e) {
    console.error('[ParcelTimeline] 加载试验田列表失败:', e)
  }
}

function buildPlots() {
  const map = new Map<string, string>()
  for (const it of allImages.value) {
    if (it.plot_id && !map.has(it.plot_id)) {
      map.set(it.plot_id, it.plot_code || it.plot_id)
    }
  }
  plots.value = Array.from(map.entries())
    .map(([plot_id, plot_code]) => ({ plot_id, plot_code }))
    .sort((a, b) =>
      String(a.plot_code).localeCompare(String(b.plot_code), 'zh-Hans-CN', { numeric: true })
    )
}

async function loadAll() {
  if (!fieldName.value) return
  try {
    const resp = await fetch(
      `${PROXY}/api/images?field_name=${encodeURIComponent(fieldName.value)}&page_size=5000`
    )
    if (resp.ok) {
      const data = await resp.json()
      allImages.value = data.items || []
    }
  } catch (e) {
    console.error('[ParcelTimeline] 加载影像失败:', e)
  }

  try {
    const mr = await fetch(`${PROXY}/api/mosaics?mosaic_type=mission&page_size=200`)
    if (mr.ok) {
      const md = await mr.json()
      const missionIds = new Set(allImages.value.map((i) => i.mission_id).filter(Boolean))
      mosaics.value = (md.items || []).filter((m: any) => missionIds.has(m.mission_id))
    }
  } catch (e) {
    console.error('[ParcelTimeline] 加载拼接影像失败:', e)
  }

  buildPlots()
  applySelection()
}

function applySelection() {
  if (selectedKey.value === FIELD_KEY) {
    series.value = mosaics.value
      .filter((m) => !m.product_type || m.product_type === productType.value)
      .map((m) => ({
        ...m,
        _kind: 'mosaic',
        _title: '整块田拼接影像',
        _url: `${PROXY}/api/mosaics/${m.id}/original.png`,
      }))
  } else {
    series.value = allImages.value
      .filter(
        (it) =>
          it.plot_id === selectedKey.value &&
          (!it.product_type || it.product_type === productType.value)
      )
      .map((it) => ({
        ...it,
        _kind: 'image',
        _title: it.plot_code || '小区影像',
        _url: `${PROXY}/api/images/${it.id}/original.png`,
      }))
  }
  series.value.sort((a, b) =>
    String(a.survey_time || '').localeCompare(String(b.survey_time || ''))
  )

  if (series.value.length) {
    selectImage(series.value[0], false)
  } else {
    current.value = null
    currentDate.value = ''
  }
}

function selectImage(img: any, resetZoom = true) {
  current.value = img
  currentDate.value = dateKey(img?.survey_time)
  loading.value = !!img?._url
  loadError.value = ''
  if (resetZoom) reset()
}

function onSelect(img: any) {
  selectImage(img, false)
}

function setType(t: 'rgb' | 'ms') {
  if (productType.value === t) return
  productType.value = t
  applySelection()
}

// ── 缩放 / 平移 ──
function fit() {
  const stage = stageEl.value
  const img = imgEl.value
  if (!stage || !img) return
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  const sw = stage.clientWidth
  const sh = stage.clientHeight
  const s = Math.min(sw / iw, sh / ih)
  scale.value = s
  tx.value = (sw - iw * s) / 2
  ty.value = (sh - ih * s) / 2
}

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
  loadError.value = ''
  loading.value = !!imageUrl.value
}

function onImgLoad() {
  loading.value = false
  loadError.value = ''
  nextTick(() => fit())
}

function onImgError() {
  loading.value = false
  loadError.value = '无法加载影像'
}

function onWheel(e: WheelEvent) {
  const stage = stageEl.value
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const next = Math.min(50, Math.max(0.05, scale.value * factor))
  const k = next / scale.value
  tx.value = cx - (cx - tx.value) * k
  ty.value = cy - (cy - ty.value) * k
  scale.value = next
}

function onMouseDown(e: MouseEvent) {
  dragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartTx = tx.value
  dragStartTy = ty.value
}

function onMouseMove(e: MouseEvent) {
  if (!dragging.value) return
  tx.value = dragStartTx + (e.clientX - dragStartX)
  ty.value = dragStartTy + (e.clientY - dragStartY)
}

function onMouseUp() {
  dragging.value = false
}

// ── 路由参数（从“试验田管理”跳转带入）──
function applyRouteQuery() {
  const q = route.query
  if (q.field && typeof q.field === 'string') {
    fieldName.value = q.field
  }
  if (q.plot && typeof q.plot === 'string') {
    selectedKey.value = q.plot
  }
}

watch(fieldName, () => {
  loadAll()
  router.replace({ query: { ...route.query, field: fieldName.value, plot: selectedKey.value } })
})

watch(selectedKey, () => {
  applySelection()
  router.replace({ query: { ...route.query, field: fieldName.value, plot: selectedKey.value } })
})

onMounted(async () => {
  await loadFieldNames()
  if (!fieldName.value) {
    fieldName.value = fieldNames.value[0] || ''
  }
  applyRouteQuery()
  if (!fieldName.value && fieldNames.value[0]) {
    fieldName.value = fieldNames.value[0]
  }
  await loadAll()
})
</script>

<style scoped>
.pt-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--paper, #fff);
}

/* Top bar */
.pt-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.pt-title {
  font-family: var(--display);
  font-weight: 600;
  font-size: 16px;
  color: var(--ink, #1f2937);
  margin-right: 8px;
}
.pt-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-muted, #6b7280);
}
.pt-field-label {
  white-space: nowrap;
}
.pt-field select {
  padding: 6px 10px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  background: var(--paper, #fff);
  color: var(--ink, #1f2937);
  font-size: 13px;
  font-family: var(--body);
  outline: none;
  max-width: 280px;
}
.pt-field select:focus {
  border-color: var(--celadon, #88b893);
}
.pt-type {
  display: flex;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  overflow: hidden;
}
.pt-type button {
  padding: 6px 14px;
  border: none;
  background: var(--paper, #fff);
  color: var(--ink-muted, #6b7280);
  font-size: 13px;
  font-family: var(--body);
  cursor: pointer;
  transition: all .15s;
}
.pt-type button.active {
  background: var(--celadon, #88b893);
  color: #fff;
}

/* Body */
.pt-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pt-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  font-size: 13px;
  color: var(--ink-muted, #6b7280);
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  flex-shrink: 0;
  font-family: var(--mono, monospace);
}
.pt-meta-title {
  color: var(--ink, #1f2937);
  font-weight: 600;
  font-family: var(--body);
}
.pt-meta-sep {
  opacity: .5;
}
.pt-meta-empty {
  color: var(--ink-muted, #6b7280);
}

/* Stage */
.pt-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #111827;
}
.pt-img {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  max-width: none;
  user-select: none;
}
.pt-tip {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
}
.pt-tip-error {
  background: rgba(220, 38, 38, 0.85);
}
.pt-tip-hint {
  opacity: .75;
}
</style>
