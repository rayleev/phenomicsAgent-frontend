<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="brand-icon">稻</div>
        <h1>phenomicsAgent</h1>
      </div>

      <h2>登录</h2>

      <form @submit.prevent="onLogin">
        <div class="auth-field">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="输入用户名" required />
        </div>
        <div class="auth-field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="输入密码" required />
        </div>

        <div class="auth-error" v-if="error">{{ error }}</div>

        <button type="submit" class="auth-btn" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <p class="auth-footer">
        没有账号？
        <router-link to="/register">去注册</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { login } = useAuth()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function onLogin() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    router.push('/chat')
  } catch (e: any) {
    error.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
