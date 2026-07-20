<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="brand-icon">稻</div>
        <h1>phenomicsAgent</h1>
      </div>

      <h2>注册</h2>

      <form @submit.prevent="onRegister">
        <div class="auth-field">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="3-50 个字符" required />
        </div>
        <div class="auth-field">
          <label>邮箱</label>
          <input v-model="email" type="email" placeholder="your@email.com" required />
        </div>
        <div class="auth-field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="至少 6 位" required />
        </div>
        <div class="auth-field">
          <label>确认密码</label>
          <input v-model="confirmPassword" type="password" placeholder="再次输入密码" required />
        </div>

        <div class="auth-error" v-if="error">{{ error }}</div>

        <button type="submit" class="auth-btn" :disabled="loading">
          {{ loading ? '注册中…' : '注册' }}
        </button>
      </form>

      <p class="auth-footer">
        已有账号？
        <router-link to="/login">去登录</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { register } = useAuth()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

async function onRegister() {
  error.value = ''

  if (username.value.length < 3 || username.value.length > 50) {
    error.value = '用户名需要 3-50 个字符'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次密码不一致'
    return
  }
  if (!email.value.includes('@')) {
    error.value = '邮箱格式不正确'
    return
  }

  loading.value = true
  try {
    await register(username.value, password.value, email.value)
    router.push('/chat')
  } catch (e: any) {
    error.value = e.message || '注册失败'
  } finally {
    loading.value = false
  }
}
</script>
