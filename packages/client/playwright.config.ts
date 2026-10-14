import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 640, height: 324 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    { command: 'npx vite preview --port 4173', port: 4173, reuseExistingServer: true },
    { command: 'npm start -w packages/server', cwd: '../..', port: 2567, reuseExistingServer: true, env: { GYUSUJI_PACE: '0.2' } },
  ],
});
