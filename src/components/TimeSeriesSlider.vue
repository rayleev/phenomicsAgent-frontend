<template>
  <div v-if="dates.length" class="tss-bar">
    <span class="tss-date tss-min">{{ minDate }}</span>
    <div class="tss-middle">
      <div class="tss-current">{{ currentDate || '-' }}</div>
      <input
        class="tss-range"
        type="range"
        :min="0"
        :max="totalDays"
        :step="1"
        :value="sliderValue"
        :disabled="totalDays <= 0"
        :aria-label="'时间轴（' + minDate + ' 至 ' + maxDate + '）'"
        @input="onInput"
      />
    </div>
    <span class="tss-date tss-max">{{ maxDate }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  images: any[]
  modelValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'select', img: any): void
}>()

function toDateKey(v: any): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.round((db - da) / 86400000)
}

function addDays(key: string, n: number): string {
  const d = new Date(key + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const byDate = computed(() => {
  const withDate = props.images
    .map((img) => ({ img, key: toDateKey(img?.survey_time) }))
    .filter((x) => x.key)
  const maxKey = withDate.reduce((acc, x) => (x.key > acc ? x.key : acc), '')

  const map = new Map<string, any>()
  for (const { img, key } of withDate) {
    const exist = map.get(key)
    if (!exist || new Date(img.survey_time).getTime() > new Date(exist.survey_time).getTime()) {
      map.set(key, img)
    }
  }

  for (const img of props.images) {
    if (!toDateKey(img?.survey_time) && maxKey) {
      const exist = map.get(maxKey)
      const t = new Date(img.upload_time || 0).getTime()
      if (!exist || t > new Date(exist.upload_time || 0).getTime()) {
        map.set(maxKey, img)
      }
    }
  }

  return map
})

const dates = computed(() => Array.from(byDate.value.keys()).sort())
const minDate = computed(() => dates.value[0] || '')
const maxDate = computed(() => dates.value[dates.value.length - 1] || '')
const totalDays = computed(() =>
  minDate.value && maxDate.value ? daysBetween(minDate.value, maxDate.value) : 0
)

const currentDate = computed(() => {
  const v = props.modelValue
  if (v && byDate.value.has(v)) return v
  return minDate.value
})

const sliderValue = computed(() => {
  if (!minDate.value) return 0
  const base = currentDate.value || minDate.value
  return Math.max(0, Math.min(totalDays.value, daysBetween(minDate.value, base)))
})

function resolve(target: string): any {
  if (byDate.value.has(target)) return byDate.value.get(target)
  const earlier = dates.value.filter((d) => d < target).pop()
  if (earlier) return byDate.value.get(earlier)
  return byDate.value.get(minDate.value)
}

function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  const target = addDays(minDate.value, v)
  const img = resolve(target)
  if (!img) return
  const key = toDateKey(img.survey_time) || maxDate.value
  emit('update:modelValue', key)
  emit('select', img)
}
</script>

<style scoped>
.tss-bar {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 12px;
  padding: 10px 16px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  max-width: calc(100% - 32px);
  box-sizing: border-box;
}

.tss-date {
  font-family: var(--mono, monospace);
  font-size: 12px;
  color: var(--ink-muted, #6b7280);
  white-space: nowrap;
}

.tss-middle {
  display: flex;
  flex-direction: column;
  width: min(520px, 56vw);
  min-width: 200px;
}

.tss-current {
  font-family: var(--mono, monospace);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink, #1f2937);
  text-align: center;
  margin-bottom: 4px;
}

.tss-range {
  width: 100%;
  accent-color: var(--celadon, #88b893);
  cursor: pointer;
}

@media (max-width: 768px) {
  .tss-middle {
    width: 52vw;
    min-width: 140px;
  }
  .tss-date {
    display: none;
  }
}
</style>
