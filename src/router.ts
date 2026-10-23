import { createRouter, createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'
import RegisterView from './views/RegisterView.vue'
import ChatView from './views/ChatView.vue'

const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/login', name: 'Login', component: LoginView },
  { path: '/register', name: 'Register', component: RegisterView },
  { path: '/chat', name: 'Chat', component: ChatView, meta: { requiresAuth: true } },
  { 
    path: '/imaging', 
    redirect: '/imaging/map',
    meta: { requiresAuth: true } 
  },
  { 
    path: '/imaging/map', 
    name: 'SatelliteMap', 
    component: () => import('./views/ImagingView.vue'), 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/imaging/fields', 
    name: 'FieldManagement', 
    component: () => import('./views/FieldManagement.vue'), 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/imaging/parcel-timeline', 
    name: 'ParcelTimeline', 
    component: () => import('./views/ParcelTimelineView.vue'), 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/imaging/location', 
    redirect: '/imaging/map'
  },
  { path: '/:pathMatch(.*)*', redirect: '/chat' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('phenomics_token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if ((to.name === 'Login' || to.name === 'Register') && token) {
    next('/chat')
  } else {
    next()
  }
})

export default router
