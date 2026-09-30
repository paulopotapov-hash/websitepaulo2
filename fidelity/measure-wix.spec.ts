import { test } from '@playwright/test';
import { DEVICE_SCALE_FACTOR, VIEWPORTS } from './fidelity.config';
import { captureTarget } from './lib/capture';

test.describe.configure({ mode: 'serial' });

for (const vp of VIEWPORTS) {
  test(`wix reference @ ${vp.name}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      reducedMotion: 'reduce',
      locale: 'en-US',
    });
    const page = await context.newPage();
    await captureTarget(page, 'wix', vp);
    await context.close();
  });
}
