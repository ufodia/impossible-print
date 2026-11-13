import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openProject, projectFixture, readyStudio } from './fixtures';

test('assembly sheets contain actual warped pixels, measured tiles, escaped names, and no network assets', async ({
  page,
  browser,
}, info) => {
  await readyStudio(page);
  const project = await projectFixture(page, '<img src=x onerror=alert(1)>');
  await openProject(page, project);
  const floor = await page.getByTestId('floor-preview').getAttribute('src');
  const wall = await page.getByTestId('wall-preview').getAttribute('src');
  const requests: string[] = [];
  const dialogs: string[] = [];
  page.context().on('request', (request) => {
    if (/^https?:/.test(request.url()) && request.frame().page() !== page)
      requests.push(request.url());
  });
  page.context().on('page', (popup) =>
    popup.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    }),
  );
  const pending = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print A4 sheets', exact: true }).click();
  const popup = await pending;
  await expect(popup.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await expect(popup.locator('.sheet.cover')).toHaveCount(1);
  await expect(popup.locator('.sheet.tile')).toHaveCount(4);
  await expect(popup.locator('.tile-art').first()).toHaveAttribute('width', '190mm');
  await expect(popup.locator('.tile-art').first()).toHaveAttribute('height', '267mm');
  await expect(popup.getByLabel('100 millimetre print calibration', { exact: true })).toHaveCount(
    5,
  );
  await expect(popup.locator('#floor-texture')).toHaveAttribute('href', floor!);
  await expect(popup.locator('#wall-texture')).toHaveAttribute('href', wall!);
  await expect(popup.locator('img[onerror], svg[onload], script')).toHaveCount(0);
  const html = await popup.content();
  expect(html).toContain('@page{size:A4 portrait;margin:10mm}');
  expect(requests).toEqual([]);
  expect(dialogs).toEqual([]);
  const filename = info.outputPath('assembly-plan.html');
  await writeFile(filename, html);
  const offline = await browser.newContext({ offline: true });
  try {
    const standalone = await offline.newPage();
    const network: string[] = [];
    standalone.on('request', (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await standalone.goto(pathToFileURL(filename).href);
    await expect(
      standalone.getByRole('button', { name: 'Print assembly plan', exact: true }),
    ).toBeVisible();
    await expect(standalone.locator('.tile-art')).toHaveCount(4);
    expect(network).toEqual([]);
  } finally {
    await offline.close();
    await popup.close();
  }
});

test('without WebGL the explicit fallback retains real surface PNG and print output', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
        return Reflect.apply(original, this, [type, ...args]);
      } as typeof original;
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await expect(
      page.getByText('3D preview is unavailable in this browser.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
    await expect(page.getByTestId('floor-preview')).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Download floor PNG/ }).click();
    const download = await pending;
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await context.close();
  }
});
