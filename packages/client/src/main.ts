import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingVue from 'floating-vue'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import './styles/floating-vue-style.scss'

const app = createApp(App)

app.component('FontAwesomeIcon', FontAwesomeIcon)
app.use(createPinia())
app.use(router)
app.use(FloatingVue, {
  themes: {
    tooltip: {
      delay: {
        show: 0,
        hide: 0,
      },
    },
  },
})
app.mount('#app')
