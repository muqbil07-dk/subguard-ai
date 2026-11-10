import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  outputDir: '/tmp/subguard-playwright-results',
  use: { baseURL: 'http://localhost:4174', viewport: { width: 1440, height: 1000 }, headless: true, launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: false, timeout: 30000 },
})
