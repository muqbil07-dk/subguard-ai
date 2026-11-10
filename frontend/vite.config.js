import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.js', include: ['src/**/*.test.{js,jsx}'] },
  build: { rolldownOptions: { output: { manualChunks(id) { if (id.includes('node_modules/recharts') || id.includes('node_modules/@reduxjs')) return 'charts'; if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-')) return 'motion' } } } },
})
