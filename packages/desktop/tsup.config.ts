import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    preload: 'src/preload.ts',
  },
  format: ['cjs'],
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  sourcemap: true,
  clean: true,
  external: ['electron'],
})
