import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const TOKEN_KEY = 'phenomics_token'
const USER_KEY = 'phenomics_user'

export interface UserInfo {
  id: string
  username: string
  email: string
  role: string
}

export function useAuth() {
  const router = useRouter()

  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserInfo | null>(_loadUser())

  function _loadUser(): UserInfo | null {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function _saveAuth(t: string, u: UserInfo) {
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    token.value = t
    user.value = u
  }

  function _clearAuth() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    token.value = null
    user.value = null
  }

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  function authHeaders(): Record<string, string> {
    if (!token.value) return {}
    return { 'Authorization': `Bearer ${token.value}` }
  }

  async function login(username: string, password: string): Promise<void> {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.detail || '登录失败')
    }
    const data = await r.json()
    _saveAuth(data.token, data.user)
  }

  async function register(username: string, password: string, email: string): Promise<void> {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    })
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.detail || '注册失败')
    }
    const data = await r.json()
    _saveAuth(data.token, data.user)
  }

  function logout() {
    _clearAuth()
    router.push('/login')
  }

  return {
    token,
    user,
    isAuthenticated,
    isAdmin,
    authHeaders,
    login,
    register,
    logout,
  }
}
