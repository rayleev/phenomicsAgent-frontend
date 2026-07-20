import { ref } from 'vue'

const API_BASE = ''

export interface ProviderConfig {
  protocol: string
  model: string
  base_url: string
  api_key?: string
  api_key_masked?: string
}

export interface FullConfig {
  provider: string
  providers: Record<string, ProviderConfig>
}

export function useConfig() {
  const config = ref<FullConfig | null>(null)
  const showConfig = ref(false)
  const saving = ref(false)
  const saveSuccess = ref(false)

  async function loadConfig() {
    try {
      const r = await fetch(`${API_BASE}/api/config`)
      if (!r.ok) throw new Error('Failed to load config')
      config.value = await r.json()
    } catch (e) {
      console.error('loadConfig error:', e)
    }
  }

  async function saveConfig(updated: FullConfig) {
    saving.value = true
    saveSuccess.value = false
    try {
      // Map frontend's api_key_masked back to api_key for the backend
      const body: any = {
        provider: updated.provider,
        providers: {} as Record<string, any>,
      }
      for (const [name, p] of Object.entries(updated.providers)) {
        body.providers[name] = {
          protocol: p.protocol,
          model: p.model,
          base_url: p.base_url,
          api_key: p.api_key || p.api_key_masked || '',
        }
      }
      const r = await fetch(`${API_BASE}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      saveSuccess.value = true
      config.value = updated
      setTimeout(() => { saveSuccess.value = false }, 2000)
    } catch (e: any) {
      console.error('saveConfig error:', e)
    } finally {
      saving.value = false
    }
  }

  async function deleteProvider(name: string) {
    try {
      const r = await fetch(`${API_BASE}/api/config/provider/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error(await r.text())
      await loadConfig()
    } catch (e: any) {
      console.error('deleteProvider error:', e)
    }
  }

  return {
    config,
    showConfig,
    saving,
    saveSuccess,
    loadConfig,
    saveConfig,
    deleteProvider,
  }
}
