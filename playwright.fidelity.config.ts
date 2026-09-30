import { defineConfig } from '@playwright/test';
import { NORMALIZATION } from './fidelity/fidelity.config';

// The Wix reference run needs no local server; only the React run builds and serves the app.
const isWix = process.argv.some((a) => a.includes('measure-wix'));

export default defineConfig({
  testDir: './fidelity',
  testMatch: /measure-.*\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 300_000,
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: { args: NORMALIZATION.chromiumArgs },
  },
  webServer: isWix
    ? undefined
    : {
        // If you serve the app yourself, set FIDELITY_REACT_URL and start it beforehand (reuseExistingServer).
        command: 'npm run build && npm run preview -- --port 4197 --strictPort',
        url: 'http://localhost:4197',
        reuseExistingServer: false,
        timeout: 300_000,
      },
});
