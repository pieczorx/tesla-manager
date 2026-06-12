import { createRouter, createWebHashHistory } from 'vue-router'
import { RouteName } from './routeName'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: { name: RouteName.Dashcam },
    },
    {
      path: '/dashcam',
      name: RouteName.Dashcam,
      component: () => import('@/views/DashcamView.vue'),
    },
    {
      path: '/settings',
      name: RouteName.Settings,
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
