<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'no-sidebar': hideSidebar }">
    <!-- Mobile mask -->
    <div class="sidebar-mask" :class="{ show: mobileSidebarOpen }" @click="mobileSidebarOpen = false"></div>

    <!-- Sidebar (hidden on login/register pages) -->
    <AppSidebar
      v-if="!hideSidebar"
      :collapsed="sidebarCollapsed"
      :mobile-open="mobileSidebarOpen"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
      @close-mobile="mobileSidebarOpen = false"
    />

    <!-- Main content area -->
    <div class="main">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'

const route = useRoute()
const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)

const hideSidebar = computed(() => {
  return route.name === 'Login' || route.name === 'Register'
})

function toggleMobileSidebar() {
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

onMounted(() => {
  window.addEventListener('phenomics:toggle-sidebar', toggleMobileSidebar)
})
onUnmounted(() => {
  window.removeEventListener('phenomics:toggle-sidebar', toggleMobileSidebar)
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  position: relative;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: 0;
  background: var(--paper);
  overflow: hidden;
}

.sidebar-mask {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .35);
  z-index: 99;
}
.sidebar-mask.show { display: block; }

@media (max-width: 768px) {
  .sidebar-mask.show { display: block; }
}
</style>
