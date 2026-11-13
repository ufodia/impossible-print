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
  await page.screenshot({ path: 'docs/assets/workspace.png', fullPage: true });
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
