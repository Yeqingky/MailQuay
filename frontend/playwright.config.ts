import { defineConfig, devices } from '@playwright/test';
import { SETUP_TOKEN, STORAGE_STATE } from './e2e/constants';

const port = process.env.MAILQUAY_E2E_PORT ?? '18080';
const baseURL = process.env.MAILQUAY_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

const serverEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) serverEnv[key] = value;
}
serverEnv.MAILQUAY_E2E_SETUP_TOKEN = SETUP_TOKEN;
serverEnv.MAILQUAY_E2E_PORT = port;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'en-US',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'bash ../scripts/e2e-server.sh',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: serverEnv,
  },
});
