import { test } from '@playwright/test';
import { DEVICE_SCALE_FACTOR, VIEWPORTS } from './fidelity.config';
import { captureTarget } from './lib/capture';

test.describe.configure({ mode: 'serial' });

for (const vp of VIEWPORTS) {
  test(`react current @ ${vp.name}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      reducedMotion: 'reduce',
      locale: 'en-US', // reference copy is English; keep the same locale for PT/EN detection
    });
    const page = await context.newPage();
    await captureTarget(page, 'react', vp);
    await context.close();
  });
}
