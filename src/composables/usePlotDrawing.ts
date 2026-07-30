import { ref, computed } from 'vue'

/** 绘制区域（WGS84 坐标） */
export interface Region {
  type: 'Polygon' | 'bbox'
  /** Polygon: [[[lon,lat],...]] 外环; bbox: [minLon,minLat,maxLon,maxLat] */
  coordinates: number[][] | number[]
}

/** 小区信息 */
export interface PlotCell {
  id: string
  label: string
  row: number
  col: number
  bbox: number[]
  polygon: number[][][]
  area_m2: number
}

/** 划分结果 */
export interface PlotsResult {
  image_id: string
  total: number
  region: { type: string; coordinates: number[] }
  rotation_deg: number
  crs: string
  plots: PlotCell[]
}

export type DrawMode = 'idle' | 'rect' | 'polygon'

export function usePlotDrawing() {
  const mode = ref<DrawMode>('idle')
  const region = ref<Region | null>(null)
  const plotsResult = ref<PlotsResult | null>(null)
  const isDrawing = computed(() => mode.value !== 'idle')
  const canDivide = computed(() => !!region.value)

  function startDraw(type: 'rect' | 'polygon') {
    mode.value = type
    region.value = null
    plotsResult.value = null
  }

  function finishDraw(r: Region) {
    region.value = r
    mode.value = 'idle'
  }

  function clearRegion() {
    region.value = null
    plotsResult.value = null
    mode.value = 'idle'
  }

  function setPlotsResult(result: PlotsResult) {
    plotsResult.value = result
  }

  function clearPlots() {
    plotsResult.value = null
  }

  return {
    mode,
    region,
    plotsResult,
    isDrawing,
    canDivide,
    startDraw,
    finishDraw,
    clearRegion,
    setPlotsResult,
    clearPlots,
  }
}
