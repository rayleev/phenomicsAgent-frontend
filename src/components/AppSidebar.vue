<template>
  <aside class="sidebar" :class="{ collapsed: props.collapsed, open: props.mobileOpen }">
    <!-- Brand row -->
    <div class="sidebar-brand">
      <div class="brand-icon">农</div>
      <span class="brand-label">表型智能体</span>
      <button
        class="sidebar-collapse-btn"
        :title="props.collapsed ? '展开侧栏' : '收起侧栏'"
        :aria-label="props.collapsed ? '展开侧栏' : '收起侧栏'"
        @click="$emit('toggle-collapse')"
      >
        {{ props.collapsed ? '▶' : '◀' }}
      </button>
    </div>

    <!-- Menu: 知识库问答 / 无人机影像服务 -->
    <div class="sidebar-menu">
      <router-link
        to="/chat"
        class="menu-item"
        :class="{ active: route.name === 'Chat' }"
        @click="$emit('close-mobile')"
      >
        <span class="menu-icon">💬</span>
        <span class="menu-label">知识库问答</span>
      </router-link>
      <router-link
        to="/imaging"
        class="menu-item"
        :class="{ active: route.name === 'Imaging' }"
        @click="$emit('close-mobile')"
      >
        <span class="menu-icon">🛰</span>
        <span class="menu-label">无人机影像服务</span>
      </router-link>
    </div>

    <!-- Session list (only on 知识库问答) -->
    <div class="sidebar-sessions" v-if="route.name === 'Chat'">
      <div class="sessions-header">
        <span class="sessions-title">对话</span>
        <button class="new-conv-btn" title="新建对话" aria-label="新建对话" @click="onNewConversation">
          <span>+</span>
        </button>
      </div>
      <div class="conv-list">
        <div v-if="conversations.length === 0" class="conv-empty">暂无会话</div>
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === currentConvId }"
          @click="selectConv(conv.id)"
          @dblclick="startRename(conv)"
        >
          <span class="conv-item-title">{{ conv.title }}</span>
          <button
            class="conv-delete"
            title="删除会话"
            aria-label="删除会话"
            @click.stop="onDeleteConv(conv)"
          >
            🗑
          </button>
        </div>
      </div>

      <!-- Rename bar -->
      <div class="rename-bar" v-if="renamingConv">
        <input
          v-model="renameTitle"
          @keydown.enter="doRename"
          @keydown.escape="cancelRename"
          ref="renameInput"
        />
      </div>
    </div>
    <!-- Spacer: pushes the user bar to the bottom on pages without a session list -->
    <div class="sidebar-spacer" v-else></div>

    <!-- Bottom user bar -->
    <div class="sidebar-user-bar">
      <div class="user-bar-trigger" ref="userTrigger" @click="userMenuOpen = !userMenuOpen">
        <div class="user-avatar">{{ userInitial }}</div>
        <span class="user-name">{{ user?.username }}</span>
      </div>
      <div class="user-menu-popover" v-if="userMenuOpen" ref="userMenu">
        <button class="user-menu-item logout" @click="onLogout">
          <span class="user-menu-icon">🚪</span>
          <span>退出登录</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChat } from '../composables/useChat'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  collapsed: boolean
  mobileOpen: boolean
}>()

defineEmits<{
  'toggle-collapse': []
  'close-mobile': []
}>()

const route = useRoute()
const router = useRouter()
const { conversations, currentConvId, loadConversations, deleteConversation, selectConversation, newConversation } = useChat()
const { user, logout, authHeaders } = useAuth()

const userInitial = computed(() => (user.value?.username?.[0] || '?').toUpperCase())

// ── User menu ──
const userMenuOpen = ref(false)
const userTrigger = ref<HTMLElement | null>(null)
const userMenu = ref<HTMLElement | null>(null)

function onUserMenuDocClick(e: MouseEvent) {
  if (userMenuOpen.value && !userTrigger.value?.contains(e.target as Node) && !userMenu.value?.contains(e.target as Node)) {
    userMenuOpen.value = false
  }
}

async function onLogout() {
  userMenuOpen.value = false
  logout()
  router.push('/login')
}

// ── Sessions ──
async function selectConv(id: string) {
  await selectConversation(id)
  emitClose()
}

async function onNewConversation() {
  newConversation()
  emitClose()
}

function emitClose() {
  if (props.mobileOpen) {
    // on mobile, close sidebar after action
    // we emit close-mobile via the menu items; for session actions do it directly
  }
}

async function onDeleteConv(conv: { id: string; title: string }) {
  if (!confirm(`确定删除会话「${conv.title}」？`)) return
  await deleteConversation(conv.id)
}

// ── Rename ──
const renamingConv = ref(false)
const renameConvId = ref<string | null>(null)
const renameTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename(conv: { id: string; title: string }) {
  renamingConv.value = true
  renameConvId.value = conv.id
  renameTitle.value = conv.title
  nextTick(() => renameInput.value?.focus())
}

async function doRename() {
  if (!renameConvId.value || !renameTitle.value.trim()) return
  try {
    await fetch(`/api/conversations/${renameConvId.value}/rename`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameTitle.value.trim() }),
    })
    await loadConversations()
  } catch {}
  cancelRename()
}

function cancelRename() {
  renamingConv.value = false
  renameConvId.value = null
  renameTitle.value = ''
}

onMounted(() => {
  loadConversations()
  document.addEventListener('click', onUserMenuDocClick)
  document.addEventListener('keydown', onUserMenuDocClickKey)
})

onUnmounted(() => {
  document.removeEventListener('click', onUserMenuDocClick)
  document.removeEventListener('keydown', onUserMenuDocClickKey)
})

function onUserMenuDocClickKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && userMenuOpen.value) userMenuOpen.value = false
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  height: 100vh;
  background: var(--paper);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width .25s ease, min-width .25s ease, transform .25s ease;
  z-index: 100;
  position: relative;
}
/* Collapsed: shrink to just the collapse button width */
.sidebar.collapsed {
  width: 44px;
  min-width: 44px;
  transform: none;
  overflow: hidden;
}
.sidebar.collapsed .sidebar-brand {
  border-bottom: none;
  justify-content: center;
  padding: 16px 4px;
}
.sidebar.collapsed .brand-icon,
.sidebar.collapsed .brand-label {
  display: none;
}
.sidebar.collapsed .sidebar-menu,
.sidebar.collapsed .sidebar-sessions,
.sidebar-collapsed .sidebar-user-bar,
.sidebar.collapsed .sidebar-spacer {
  display: none;
}

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.brand-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--celadon); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--display); font-weight: 700; font-size: 18px; flex-shrink: 0;
}
.brand-label {
  font-family: var(--display); font-weight: 700; font-size: 15px;
  color: var(--ink); white-space: nowrap; flex: 1;
}
.sidebar-collapse-btn {
  width: 28px; height: 28px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--paper);
  color: var(--ink-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; flex-shrink: 0; transition: all .15s;
}
.sidebar.collapsed .sidebar-collapse-btn {
  width: 32px; height: 32px;
}
.sidebar-collapse-btn:hover { background: var(--rice); color: var(--ink); }

/* Menu */
.sidebar-menu {
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.menu-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  cursor: pointer; color: var(--ink-muted);
  transition: all .15s; text-decoration: none;
  white-space: nowrap; font-size: 14px;
}
.menu-item:hover { background: var(--rice-dark); color: var(--ink); }
.menu-item.active { background: var(--celadon-pale); color: var(--celadon); font-weight: 600; }
.menu-icon { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.menu-label { overflow: hidden; }

/* Sessions */
.sidebar-sessions {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--border-light);
}
.sessions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
  flex-shrink: 0;
}
.sessions-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: .03em;
}
.new-conv-btn {
  width: 24px; height: 24px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--paper);
  color: var(--ink-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1; transition: all .15s;
}
.new-conv-btn:hover { background: var(--celadon-pale); color: var(--celadon); border-color: var(--celadon-dim); }

.conv-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.conv-empty {
  text-align: center;
  padding: 20px 12px;
  font-size: 13px;
  color: var(--ink-muted);
}
.conv-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--ink-light);
  transition: all .15s;
  min-width: 0;
}
.conv-item:hover { background: var(--rice-dark); }
.conv-item.active { background: var(--celadon-pale); color: var(--celadon); font-weight: 600; }
.conv-item-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conv-delete {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: .5;
  transition: all .15s;
}
.conv-delete:hover {
  opacity: 1;
  background: var(--earth-pale);
  color: var(--earth);
}
.conv-item:hover .conv-delete { opacity: .85; }

/* Rename */
.rename-bar {
  padding: 6px 8px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}
.rename-bar input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--celadon);
  font-size: 13px;
  font-family: var(--body);
  background: var(--rice);
  color: var(--ink);
  outline: none;
}

/* Spacer: pushes user bar to the bottom when session list is hidden */
.sidebar-spacer {
  flex: 1;
}

/* User bar */
.sidebar-user-bar {
  border-top: 1px solid var(--border-light);
  padding: 10px 8px;
  position: relative;
  flex-shrink: 0;
}
.user-bar-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background .15s;
}
.user-bar-trigger:hover { background: var(--rice-dark); }
.user-avatar {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--celadon-pale); color: var(--celadon);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--display); font-weight: 700; font-size: 14px;
  flex-shrink: 0;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* User menu popover */
.user-menu-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 8px;
  right: 8px;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 60;
}
.user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: none;
  background: none;
  color: var(--ink);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background .12s;
  font-family: var(--body);
}
.user-menu-item:hover { background: var(--rice); }
.user-menu-item.logout:hover { background: var(--earth-pale); color: var(--earth); }
.user-menu-icon { width: 18px; text-align: center; }

/* Mobile */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    transform: translateX(-100%);
    box-shadow: var(--shadow-lg);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar.collapsed {
    transform: translateX(-100%);
  }
  .sidebar.open.collapsed {
    transform: translateX(0);
  }
}
</style>
