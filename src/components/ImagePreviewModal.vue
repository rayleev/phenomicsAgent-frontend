<template>
  <div v-if="visible" class="ipm-overlay" @click.self="close">
    <div class="ipm-dialog">
      <!-- Header -->
      <div class="ipm-header">
        <span class="ipm-title">{{ currentTitle }}</span>
        <div class="ipm-header-actions">
          <template v-if="hasMosaic">
            <button
              v-if="view === 'plot'"
              class="ipm-btn"
              @click="switchView('mosaic')"
              title="查看该小区所属的整块田影像"
            >🌾 查看所属整块田影像</button>
            <button
              v-else
              class="ipm-btn"
              @click="switchView('plot')"
              title="返回小区影像"
            >🔙 返回小区影像</button>
          </template>
          <button
            class="ipm-btn ipm-btn-primary"
            :disabled="!mosaicOriginalUrl"
            :title="mosaicOriginalUrl ? '在新标签页打开小区划分应用重新划分小区' : '该小区暂无整块田影像'"
            @click="openInFieldShape"
          >🧩 在小区划分应用中打开</button>
          <button
            class="ipm-btn"
            :disabled="!satelliteImage"
            :title="satelliteImage ? '在卫星地图中打开该影像位置' : '该影像缺少地理坐标信息'"
            @click="openInSatelliteMap"
          >🛰️ 在卫星地图中打开</button>
          <button class="ipm-close" title="关闭" @click="close">×</button>
        </div>
      </div>

      <!-- Body -->
      <div class="ipm-body">
        <div
          ref="wrapEl"
          class="ipm-canvas-wrap"
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
            :src="pngUrl"
            class="ipm-img"
            :style="imgStyle"
            draggable="false"
            @load="onImgLoad"
            @error="onImgError"
          />
          <div v-if="loading" class="ipm-tip">加载中…</div>
          <div v-else-if="loadError" class="ipm-tip ipm-tip-error">加载失败：{{ loadError }}</div>
          <div v-else class="ipm-tip ipm-tip-hint">滚轮缩放 · 拖拽平移 · 双击适应窗口</div>
        </div>

        <!-- Metadata -->
        <div class="ipm-meta">
          <div v-for="f in metaFields" :key="f.label" class="ipm-meta-row">
            <label>{{ f.label }}</label>
            <span>{{ f.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

/**
 * 影像预览弹窗：
 * - 展示原始影像（PNG，后端从 GeoTIFF 渲染）
 * - 滚轮缩放 + 拖拽平移
 * - 可切换到所属整块田影像（mosaic mission 级）
 * - 一键跳转到 field-shape-web 重新划分小区
 */

const props = defineProps<{
  visible: boolean
  image: any | null
  mosaic?: any | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()

// field-shape-web 部署地址（新标签页跳转目标）
const FIELD_SHAPE_URL = 'http://10.33.105.166:8888/'
// 本服务在 nginx 下的代理前缀（同源，避免跨域）
const PROXY_BASE = '/api/drone'

type ViewKind = 'plot' | 'mosaic'
const view = ref<ViewKind>('plot')

const wrapEl = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
const loading = ref(false)
const loadError = ref('')

const hasMosaic = computed(() => !!props.mosaic && !!props.mosaic.id)

const currentTitle = computed(() => {
  if (view.value === 'mosaic' && props.mosaic) {
    return props.mosaic.plot_code || '整块田影像'
  }
  return props.image?.original_filename || props.image?.field_name || '影像预览'
})

// 当前视图对应的 PNG（经代理，同源）
const pngUrl = computed(() => {
  if (view.value === 'mosaic' && props.mosaic) {
    return `${PROXY_BASE}/api/mosaics/${props.mosaic.id}/original.png`
  }
  return props.image?.id ? `${PROXY_BASE}/api/images/${props.image.id}/original.png` : ''
})

// 整块田影像的原始 GeoTIFF（直连 droneImaging，供 field-shape-web 拉取）
const mosaicOriginalUrl = computed(() => {
  if (!hasMosaic.value) return ''
  const origin = droneOrigin()
  return `${origin}/api/mosaics/${props.mosaic!.id}/original`
})

// 从后端返回的绝对 URL（thumbnail_url / tile_url）推断 droneImaging 的对外 origin
function droneOrigin(): string {
  const absolute = props.mosaic?.thumbnail_url || props.image?.thumbnail_url || props.image?.tile_url
  if (absolute) {
    const m = absolute.match(/^https?:\/\/[^/]+/)
    if (m) return m[0]
  }
  return window.location.origin
}

const metaFields = computed<{ label: string; value: string }[]>(() => {
  const src = view.value === 'mosaic' ? props.mosaic : props.image
  if (!src) return []
  const rows: { label: string; value: string }[] = []
  const push = (label: string, value: any) => {
    if (value === null || value === undefined || value === '') return
    rows.push({ label, value: String(value) })
  }
  push('任务编号', src.task_id)
  push('试验田名称', src.field_name)
  push('试验田分组', src.field_group)
  push('调查阶段', src.survey_stage)
  push('数据类型', src.data_type)
  push('产品类型', src.product_type)
  push('小区编号', src.plot_code)
  push('影像尺寸', src.image_width && src.image_height ? `${src.image_width} × ${src.image_height} px` : (src.width_pixels && src.height_pixels ? `${src.width_pixels} × ${src.height_pixels} px` : ''))
  push('坐标系', src.crs)
  push('状态', src.status)
  push('来源', src.source)
  push('上传时间', src.upload_time ? formatDate(src.upload_time) : '')
  if (view.value === 'mosaic') {
    push('拼接图片数', src.image_count)
  }
  return rows
})

function formatDate(v: string): string {
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN', { hour12: false })
}

function switchView(kind: ViewKind) {
  view.value = kind
}

function openInFieldShape() {
  if (!mosaicOriginalUrl.value) return
  window.open(`${FIELD_SHAPE_URL}?image_url=${encodeURIComponent(mosaicOriginalUrl.value)}`, '_blank', 'noopener')
}

function openInSatelliteMap() {
  const img = previewImage.value
  if (!img?.bbox) return
  router.push({
    path: '/imaging/location',
    query: { image: JSON.stringify(img) }
  })
}

const satelliteImage = computed(() => {
  const src = props.image
  return src && Array.isArray(src.bbox) && src.bbox.length >= 4 ? src : null
})

function close() {
  emit('close')
}

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

function fit() {
  const wrap = wrapEl.value
  const img = imgEl.value
  if (!wrap || !img) return
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  const ww = wrap.clientWidth
  const wh = wrap.clientHeight
  const s = Math.min(ww / iw, wh / ih)
  scale.value = s
  tx.value = (ww - iw * s) / 2
  ty.value = (wh - ih * s) / 2
}

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
  loadError.value = ''
  loading.value = !!pngUrl.value
}

function onImgLoad() {
  loading.value = false
  loadError.value = ''
  nextTick(() => fit())
}

function onImgError() {
  loading.value = false
  loadError.value = '无法加载原图预览'
}

function onWheel(e: WheelEvent) {
  const wrap = wrapEl.value
  if (!wrap) return
  const rect = wrap.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const next = Math.min(20, Math.max(0.05, scale.value * factor))
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

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => [props.visible, view.value, props.image, props.mosaic],
  () => {
    if (props.visible) reset()
  },
)

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.ipm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 24px;
}

.ipm-dialog {
  background: var(--paper, #fff);
  border-radius: 16px;
  width: 92%;
  max-width: 1100px;
  height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.ipm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  flex-shrink: 0;
}

.ipm-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--ink, #1f2937);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ipm-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ipm-btn {
  padding: 6px 12px;
  border: 1px solid var(--border, #d1d5db);
  background: var(--paper, #fff);
  border-radius: 8px;
  font-size: 13px;
  color: var(--ink, #1f2937);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.ipm-btn:hover:not(:disabled) {
  border-color: var(--celadon, #88b893);
  color: var(--celadon, #88b893);
}

.ipm-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ipm-btn-primary {
  background: var(--celadon, #88b893);
  border-color: var(--celadon, #88b893);
  color: #fff;
}

.ipm-btn-primary:hover:not(:disabled) {
  background: var(--celadon-dark, #6f9c7a);
  color: #fff;
}

.ipm-close {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  color: var(--ink-muted, #6b7280);
  cursor: pointer;
  border-radius: 8px;
  flex-shrink: 0;
}

.ipm-close:hover {
  background: var(--rice, #f3f4f6);
}

.ipm-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.ipm-canvas-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #111827;
  min-width: 0;
}

.ipm-img {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  max-width: none;
  user-select: none;
}

.ipm-tip {
  position: absolute;
  bottom: 12px;
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

.ipm-tip-error {
  background: rgba(220, 38, 38, 0.85);
}

.ipm-tip-hint {
  opacity: 0.75;
}

.ipm-meta {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-light, #e5e7eb);
  padding: 16px;
  overflow-y: auto;
  background: var(--rice, #fafafa);
}

.ipm-meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-light, #e5e7eb);
  font-size: 13px;
}

.ipm-meta-row:last-child {
  border-bottom: none;
}

.ipm-meta-row label {
  color: var(--ink-muted, #6b7280);
  font-size: 12px;
}

.ipm-meta-row span {
  color: var(--ink, #1f2937);
  word-break: break-all;
}

@media (max-width: 768px) {
  .ipm-body {
    flex-direction: column;
  }
  .ipm-meta {
    width: 100%;
    max-height: 30vh;
    border-left: none;
    border-top: 1px solid var(--border-light, #e5e7eb);
  }
}
</style>
