import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function readyStudio(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
}

export async function artwork(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 160;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f08063';
    context.fillRect(0, 0, 160, 160);
    context.fillStyle = '#206d78';
    context.fillRect(160, 0, 160, 160);
    context.fillStyle = '#ffffff';
    context.font = 'bold 46px sans-serif';
    context.textAlign = 'center';
    context.fillText('CORNER', 160, 99);
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  });
}

export async function projectFixture(page: Page, name = 'Measured corner') {
  return {
    version: 1,
    name,
    source: await artwork(page),
    surfaceWidth: 300,
    floorDepth: 200,
    wallHeight: 200,
    cameraX: 0,
    cameraDistance: 500,
    cameraHeight: 400,
    designWidth: 240,
    dpi: 40,
    autoFit: true,
  };
}

export async function openProject(page: Page, project: Awaited<ReturnType<typeof projectFixture>>) {
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'test.impossible-print.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(project.name);
  await expect(page.getByRole('button', { name: 'Print A4 sheets', exact: true })).toBeEnabled();
}

export async function savedProject(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

export async function pixelDifference(page: Page, first: Buffer, second: Buffer): Promise<number> {
  return page.evaluate(
    async ({ a, b }) => {
      const images = await Promise.all(
        [a, b].map(async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          return image;
        }),
      );
      if (images[0]!.width !== images[1]!.width || images[0]!.height !== images[1]!.height)
        throw new Error('Preview dimensions changed during comparison.');
      const canvas = document.createElement('canvas');
      canvas.width = images[0]!.width;
      canvas.height = images[0]!.height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const pixels = images.map((image) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      });
      let changed = 0;
      for (let index = 0; index < pixels[0]!.length; index += 4) {
        const difference =
          Math.abs(pixels[0]![index]! - pixels[1]![index]!) +
          Math.abs(pixels[0]![index + 1]! - pixels[1]![index + 1]!) +
          Math.abs(pixels[0]![index + 2]! - pixels[1]![index + 2]!);
        if (difference > 30) changed++;
      }
      return changed / (canvas.width * canvas.height);
    },
    { a: first.toString('base64'), b: second.toString('base64') },
  );
}
