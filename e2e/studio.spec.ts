import { test, expect } from '@playwright/test';
import {
  artwork,
  openProject,
  pixelDifference,
  projectFixture,
  readyStudio,
  savedProject,
} from './fixtures';

test('camera measurements produce real, changing surface warps and a saved project roundtrip', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await readyStudio(page);
  const project = await projectFixture(page);
  await openProject(page, project);
  const floor = page.getByTestId('floor-preview'),
    wall = page.getByTestId('wall-preview');
  const beforeFloor = await floor.getAttribute('src'),
    beforeWall = await wall.getAttribute('src');
  expect(beforeFloor).toMatch(/^data:image\/png;base64,/);
  expect(beforeWall).toMatch(/^data:image\/png;base64,/);
  expect(beforeFloor).not.toBe(project.source.dataUrl);
  expect(beforeWall).not.toBe(project.source.dataUrl);
  for (const preview of [floor, wall]) {
    const visiblePixels = await preview.evaluate((element) => {
      const image = element as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let at = 3; at < pixels.length; at += 4) if (pixels[at]! > 0) painted++;
      return painted;
    });
    expect(visiblePixels).toBeGreaterThan(100);
  }
  await page.getByLabel('Lateral offset (+ left) in millimeters', { exact: true }).fill('80');
  await page.getByLabel('Lateral offset (+ left) in millimeters', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
  await expect(floor).not.toHaveAttribute('src', beforeFloor!);
  await expect(wall).not.toHaveAttribute('src', beforeWall!);
  const saved = await savedProject(page);
  expect(saved).toEqual({ ...project, cameraX: 80 });
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
  await openProject(page, saved);
  await expect(
    page.getByLabel('Lateral offset (+ left) in millimeters', { exact: true }),
  ).toHaveValue('80');
  expect(errors).toEqual([]);
});

test('configured 3D camera, orbit overview, and returning camera view render distinct actual views', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await readyStudio(page);
  const canvas = page.getByTestId('corner-preview').locator('canvas');
  await expect(page.getByTestId('corner-preview').locator('canvas, .fallback')).toHaveCount(1);
  if (!(await canvas.count())) {
    await expect(
      page.getByText('3D preview is unavailable in this browser.', { exact: true }),
    ).toBeVisible();
    test.skip(
      true,
      'This browser cannot create WebGL; the separately tested raster/print fallback remains available.',
    );
  }
  const configured = await canvas.screenshot();
  await page.getByRole('button', { name: 'Orbit overview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Orbit overview', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const overview = await canvas.screenshot();
  expect(await pixelDifference(page, configured, overview)).toBeGreaterThan(0.05);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 35, {
    steps: 5,
  });
  await page.mouse.up();
  const dragged = await canvas.screenshot();
  expect(await pixelDifference(page, overview, dragged)).toBeGreaterThan(0.005);
  await page.getByRole('button', { name: 'Camera view', exact: true }).click();
  const restored = await canvas.screenshot();
  expect(await pixelDifference(page, configured, restored)).toBeLessThan(0.02);
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile-studio.png', fullPage: true });
});

test('local image upload and text artwork both feed the real raster pipeline', async ({ page }) => {
  await readyStudio(page);
  const source = await artwork(page);
  await page.getByLabel('Upload artwork image', { exact: true }).setInputFiles({
    name: 'corner.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.dataUrl.split(',')[1]!, 'base64'),
  });
  await expect(page.getByTestId('source-image')).toHaveAttribute('src', source.dataUrl);
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
  expect((await savedProject(page)).source).toEqual(source);
  await page.getByLabel('Artwork text', { exact: true }).fill('LOOK AGAIN');
  await page.getByRole('button', { name: 'Create text', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
  await expect(page.getByTestId('source-image')).not.toHaveAttribute('src', source.dataUrl);
  expect((await savedProject(page)).source.dataUrl).toMatch(/^data:image\/png;base64,/);
});

test('malformed projects and active image formats are rejected while current artwork remains usable', async ({
  page,
}) => {
  await readyStudio(page);
  const original = await page.getByTestId('source-image').getAttribute('src');
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.getByRole('status')).toContainText(/version 1|project/i);
  await expect(page.getByTestId('source-image')).toHaveAttribute('src', original!);
  await page.getByLabel('Upload artwork image', { exact: true }).setInputFiles({
    name: 'active.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
  });
  await expect(page.getByRole('status')).toContainText('SVG');
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
});

test('keyboard edits keep the next control and the status region survives studio renders', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Update projection/ })).toBeEnabled();
  const status = await page.getByRole('status').elementHandle();
  await page.locator('#project-name').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Keyboard project');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Upload image/ })).toBeFocused();
  expect(await status!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.getByRole('status')).toContainText('Project renamed');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the spatial preview can orbit and zoom from its keyboard focus without trapping Tab', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('corner-preview').locator('canvas, .fallback')).toHaveCount(1);
  const canvas = page.getByTestId('corner-preview').locator('canvas');
  test.skip(!(await canvas.count()), 'The separate fallback test covers browsers without WebGL.');
  await canvas.focus();
  const before = await canvas.screenshot();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Orbit overview', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  const rotated = await canvas.screenshot();
  await page.keyboard.press('+');
  expect((await canvas.screenshot()).equals(rotated)).toBe(false);
  await page.keyboard.press('Tab');
  await expect(canvas).not.toBeFocused();
});

test('native preview buttons rotate and zoom with Enter while preserving focus and camera reset', async ({
  page,
}) => {
  await readyStudio(page);
  const canvas = page.getByTestId('corner-preview').locator('canvas');
  await expect(page.getByTestId('corner-preview').locator('canvas, .fallback')).toHaveCount(1);
  test.skip(!(await canvas.count()), 'The separate fallback test covers browsers without WebGL.');
  const group = page.getByRole('group', { name: 'Rotate and zoom the 3D preview', exact: true });
  const configured = await canvas.screenshot();
  for (const name of [
    'Rotate left',
    'Rotate right',
    'Rotate up',
    'Rotate down',
    'Zoom in',
    'Zoom out',
  ]) {
    const button = group.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    const before = await canvas.screenshot();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toBeFocused();
    await expect(page.getByRole('status')).toHaveText(`${name}. Orbit overview.`);
    expect(await pixelDifference(page, before, await canvas.screenshot())).toBeGreaterThan(0.001);
    await expect(page.getByRole('button', { name: 'Orbit overview', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  const zoomIn = group.getByRole('button', { name: 'Zoom in', exact: true });
  await zoomIn.focus();
  const beforeSpace = await canvas.screenshot();
  await page.keyboard.press('Space');
  await expect(zoomIn).toBeFocused();
  expect(await pixelDifference(page, beforeSpace, await canvas.screenshot())).toBeGreaterThan(
    0.001,
  );
  await page.getByRole('button', { name: 'Camera view', exact: true }).press('Enter');
  expect(await pixelDifference(page, configured, await canvas.screenshot())).toBeLessThan(0.02);
  await group.getByRole('button', { name: 'Zoom out', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(canvas).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(canvas).not.toBeFocused();
});

test('preview buttons reflow and retain visible focus in forced colors with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 900 });
  await readyStudio(page);
  const group = page.getByRole('group', { name: 'Rotate and zoom the 3D preview', exact: true });
  const buttons = group.getByRole('button');
  await expect(buttons).toHaveCount(6);
  const canvas = page.getByTestId('corner-preview').locator('canvas');
  await expect(page.getByTestId('corner-preview').locator('canvas, .fallback')).toHaveCount(1);
  test.skip(!(await canvas.count()), 'The separate fallback test covers browsers without WebGL.');
  await expect(buttons.first()).toBeEnabled();
  await buttons.first().focus();
  const appearance = await buttons.first().evaluate((button) => {
    const style = getComputedStyle(button),
      rect = button.getBoundingClientRect();
    return {
      forcedColors: matchMedia('(forced-colors: active)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(appearance.forcedColors).toBe(true);
  expect(appearance.reducedMotion).toBe(true);
  expect(appearance.outlineStyle).toBe('solid');
  expect(appearance.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(appearance.outlineColor).not.toBe(appearance.background);
  expect(appearance.borderColor).not.toBe(appearance.background);
  expect(appearance.width).toBeGreaterThanOrEqual(24);
  expect(appearance.height).toBeGreaterThanOrEqual(24);
  for (const button of await buttons.all()) {
    const rect = (await button.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('backward keyboard navigation reaches the unkeyed support link after a name edit', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#project-name').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Backward keyboard edit');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.support-button')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#project-name')).toBeFocused();
  // Native scope exits stay native instead of restoring a stale control.
  await page.locator('.brand').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.brand')).not.toBeFocused();
});
