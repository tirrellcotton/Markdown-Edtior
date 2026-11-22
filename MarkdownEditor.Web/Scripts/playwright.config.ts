import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  testDir: './tests',
  outputDir: `${root}/test-results`,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5100',
    browserName: 'chromium',
    viewport: { width: 1440, height: 960 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'dotnet run --project MarkdownEditor.Web --no-launch-profile --urls http://localhost:5100',
    cwd: root,
    url: 'http://localhost:5100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
