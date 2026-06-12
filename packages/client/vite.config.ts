import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const fontAwesomeScripts = [
  './assets/fontawesome/fontawesome.min.js',
  './assets/fontawesome/solid.min.js',
  './assets/fontawesome/regular.min.js',
  './assets/fontawesome/brands.min.js',
  './assets/fontawesome/custom-icons.min.js',
]

function fontAwesomeHtmlPlugin() {
  return {
    name: 'fontawesome-html',
    transformIndexHtml(html: string) {
      const tags = fontAwesomeScripts
        .map((src) => `<script defer src="${src}" type="module"></script>`)
        .join('\n    ')

      return html.replace('</head>', `    ${tags}\n  </head>`)
    },
  }
}

export default defineConfig({
  base: './',
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  plugins: [vue(), fontAwesomeHtmlPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
