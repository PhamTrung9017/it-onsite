import { defineConfig, devices } from '@playwright/test';

/**
 * Kiểm thử đầu-cuối (E2E) trên bản build chạy bằng `vite preview`.
 * `npm run test:e2e` dùng API giả lập; `npm run test:e2e:backend` dùng backend thật đang chạy ở cổng 8000
 * và nạp lại dữ liệu trình diễn trước mỗi kịch bản.
 */
const backend = Boolean(process.env.E2E_BACKEND) || process.env.npm_lifecycle_event === 'test:e2e:backend';
const port = backend ? 4174 : 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    timezoneId: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /giao-dien\.spec\.js/ },
  ],
  webServer: {
    command: backend
      ? `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${port} --strictPort`
      : `npm run build && npm run preview -- --port ${port} --strictPort`,
    env: backend ? { VITE_API_URL: '/api' } : {},
    url: `http://localhost:${port}`,
    reuseExistingServer: !backend,
    timeout: 120_000,
  },
});
