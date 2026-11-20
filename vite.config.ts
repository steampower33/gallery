import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 프로젝트 사이트 경로: https://steampower33.github.io/gallery/
export default defineConfig({
  base: '/gallery/',
  plugins: [react()],
})
