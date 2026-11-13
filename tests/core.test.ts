import { describe, expect, it } from 'vitest';
import {
  createProjection,
  inspectRaster,
  MAX_OUTPUT_PIXELS,
  sampleProject,
  uvToSurface,
  validateProject,
  worldToUv,
  type Project,
} from '../src/core';
import { rasterDimensions, rasterizeSurfaces } from '../src/raster';
import { exportSurfaceSvg, printPlanHtml } from '../src/print';

describe('measured perspective geometry', () => {
  it('splits the original sample across real floor and wall with orthonormal camera axes', () => {
    const p = createProjection(sampleProject());
    const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
      a.x * b.x + a.y * b.y + a.z * b.z;
    expect(dot(p.forward, p.right)).toBeCloseTo(0);
    expect(dot(p.forward, p.up)).toBeCloseTo(0);
    expect(dot(p.right, p.up)).toBeCloseTo(0);
    expect(dot(p.right, p.right)).toBeCloseTo(1);
    expect(p.right.x).toBeLessThan(0);
    expect(uvToSurface(p, 0.5, 0.1)?.surface).toBe('wall');
    expect(uvToSurface(p, 0.5, 0.9)?.surface).toBe('floor');
  });
  it('round-trips image coordinates through positive ray intersections on both surfaces', () => {
    for (const cameraX of [0, 250, -500]) {
      const p = createProjection({ ...sampleProject(), cameraX });
      for (let y = 0; y <= 20; y++)
        for (let x = 0; x <= 20; x++) {
          const u = x / 20;
          const v = y / 20;
          const hit = uvToSurface(p, u, v)!;
          expect(hit).not.toBeNull();
          const inverse = worldToUv(p, hit.point)!;
          expect(inverse.u).toBeCloseTo(u, 8);
          expect(inverse.v).toBeCloseTo(v, 8);
        }
    }
  });
  it('keeps the crease continuous and rejects points behind the camera', () => {
    const p = createProjection(sampleProject());
    for (const x of [-200, 0, 200]) {
      const uv = worldToUv(p, { x, y: 0, z: 0 })!;
      const hit = uvToSurface(p, uv.u, uv.v)!;
      expect(hit.point.x).toBeCloseTo(x);
      expect(hit.point.y).toBeCloseTo(0);
      expect(hit.point.z).toBeCloseTo(0);
    }
    expect(worldToUv(p, { x: 0, y: p.camera.y * 2, z: p.camera.z * 2 })).toBeNull();
  });
  it('actually clips oversized images and automatically fits their complete footprint', () => {
    const project = {
      ...sampleProject(),
      surfaceWidth: 150,
      floorDepth: 100,
      wallHeight: 100,
      designWidth: 1600,
      cameraX: 500,
      autoFit: false,
    };
    expect(uvToSurface(createProjection(project), 0, 0)).toBeNull();
    const fitted = createProjection({ ...project, autoFit: true });
    expect(fitted.fitScale).toBeLessThan(1);
    for (let y = 0; y <= 20; y++)
      for (let x = 0; x <= 20; x++) expect(uvToSurface(fitted, x / 20, y / 20)).not.toBeNull();
  });
});

describe('raster and schema safety', () => {
  it('reads actual PNG dimensions and rejects source metadata lies', () => {
    const p = sampleProject();
    expect(inspectRaster(p.source.dataUrl)).toMatchObject({
      width: 32,
      height: 24,
      mime: 'image/png',
    });
    expect(() => validateProject({ ...p, source: { ...p.source, width: 1 } })).toThrow(
      /actual image/,
    );
  });
  it('rejects a compressed-image dimension bomb before browser decoding', () => {
    const p = sampleProject();
    const bytes = Buffer.from(p.source.dataUrl.split(',')[1]!, 'base64');
    bytes.writeUInt32BE(80_000, 16);
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    expect(() => validateProject({ ...p, source: { dataUrl, width: 80_000, height: 24 } })).toThrow(
      /4096/,
    );
  });
  it('reads JPEG and WebP dimension headers and rejects false MIME declarations', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 24, 0, 32, 1, 1, 0x11, 0, 0xff, 0xd9,
    ]);
    expect(inspectRaster(`data:image/jpeg;base64,${jpeg.toString('base64')}`)).toMatchObject({
      width: 32,
      height: 24,
      mime: 'image/jpeg',
    });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0);
    webp.writeUInt32LE(22, 4);
    webp.write('WEBPVP8X', 8);
    webp.writeUInt32LE(10, 16);
    webp[24] = 31;
    webp[27] = 23;
    expect(inspectRaster(`data:image/webp;base64,${webp.toString('base64')}`)).toMatchObject({
      width: 32,
      height: 24,
      mime: 'image/webp',
    });
    expect(() => inspectRaster(`data:image/png;base64,${jpeg.toString('base64')}`)).toThrow(/PNG/);
  });
  it.each([
    (p: Project) => ({ ...p, source: { ...p.source, dataUrl: 'https://example.com/image.png' } }),
    (p: Project) => ({
      ...p,
      source: { ...p.source, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' },
    }),
    (p: Project) => ({
      ...p,
      source: {
        ...p.source,
        dataUrl: 'data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      },
    }),
    (p: Project) => ({ ...p, cameraDistance: 0 }),
    (p: Project) => ({ ...p, cameraHeight: Infinity }),
    (p: Project) => ({ ...p, surfaceWidth: 100_000 }),
    (p: Project) => ({ ...p, dpi: 151 }),
    (p: Project) => ({ ...p, dpi: 72.5 }),
  ])('rejects an invalid project variation', (change) =>
    expect(() => validateProject(change(sampleProject()))).toThrow(),
  );
  it('bounds output pixel allocation even at maximum physical dimensions and DPI', () => {
    const dimensions = rasterDimensions({
      ...sampleProject(),
      surfaceWidth: 1800,
      floorDepth: 1500,
      wallHeight: 1500,
      dpi: 150,
    });
    expect(dimensions.width * (dimensions.floorHeight + dimensions.wallHeight)).toBeLessThanOrEqual(
      MAX_OUTPUT_PIXELS,
    );
    expect(
      Math.max(dimensions.width, dimensions.floorHeight, dimensions.wallHeight),
    ).toBeLessThanOrEqual(4096);
    expect(dimensions.effectiveDpi).toBeLessThan(150);
  });
  it('inverse-samples real RGBA data on both surfaces without mirroring the design', () => {
    const project = {
      ...sampleProject(),
      surfaceWidth: 100,
      floorDepth: 100,
      wallHeight: 100,
      designWidth: 75,
      dpi: 40,
    };
    const data = new Uint8ClampedArray(32 * 24 * 4);
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        data[i] = x < 16 ? 255 : 0;
        data[i + 2] = x >= 16 ? 255 : 0;
        data[i + 3] = 255;
      }
    const result = rasterizeSurfaces(project, { data, width: 32, height: 24 });
    for (const surface of [result.floor, result.wall]) {
      expect(surface.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      let leftRed = 0;
      let leftBlue = 0;
      let rightBlue = 0;
      let rightRed = 0;
      for (let y = 0; y < surface.height; y++)
        for (let x = 0; x < surface.width; x++) {
          const at = (y * surface.width + x) * 4;
          if (x < surface.width / 2) {
            leftRed += surface.data[at]!;
            leftBlue += surface.data[at + 2]!;
          } else {
            rightBlue += surface.data[at + 2]!;
            rightRed += surface.data[at]!;
          }
        }
      expect(leftRed).toBeGreaterThan(leftBlue * 10);
      expect(rightBlue).toBeGreaterThan(rightRed * 10);
    }
    expect(result.clippedFraction).toBe(0);
    expect(() =>
      rasterizeSurfaces(project, { data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    ).toThrow(/match/);
  });
  it('uses premultiplied-alpha interpolation and changes the physical warp with camera height', () => {
    const p = {
      ...sampleProject(),
      surfaceWidth: 100,
      floorDepth: 100,
      wallHeight: 100,
      designWidth: 75,
      dpi: 40,
    };
    const data = new Uint8ClampedArray(32 * 24 * 4);
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        data[i] = x < 16 ? 255 : 0;
        data[i + 3] = x < 16 ? 255 : 0;
      }
    const first = rasterizeSurfaces(p, { data, width: 32, height: 24 });
    const second = rasterizeSurfaces({ ...p, cameraHeight: 900 }, { data, width: 32, height: 24 });
    expect(first.floor.data).not.toEqual(second.floor.data);
    let partial = 0;
    for (const surface of [first.floor, first.wall])
      for (let at = 0; at < surface.data.length; at += 4) {
        if (surface.data[at + 3]! > 0 && surface.data[at + 3]! < 255) {
          partial++;
          expect(surface.data[at]).toBe(255);
        }
      }
    expect(partial).toBeGreaterThan(0);
  });
});

describe('physical print exports', () => {
  it('sets exact mm dimensions and embeds prewarped surface pixels', () => {
    const project = sampleProject();
    const png = project.source.dataUrl;
    const svg = exportSurfaceSvg(project, 'floor', png);
    expect(svg).toContain('width="600mm" height="450mm"');
    expect(svg).toContain('viewBox="0 0 600 450"');
    expect(svg).toContain(png);
  });
  it('embeds each surface only once across numbered A4 tiles and includes assembly/calibration', () => {
    const project = sampleProject();
    const html = printPlanHtml(
      project,
      { floorDataUrl: project.source.dataUrl, wallDataUrl: project.source.dataUrl },
      createProjection(project),
    );
    expect(html.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(html).toContain('width="190mm" height="267mm" viewBox="190 267 190 267"');
    expect(html).toContain('W2-4');
    expect(html).toContain('F2-4');
    expect(html).toContain('This line must measure 100 mm');
    expect(html).toContain('@page{size:A4 portrait;margin:10mm}');
    expect(html).toContain('positive X means left');
  });
  it('escapes hostile names and rejects stale projection settings or active texture input', () => {
    const project = sampleProject();
    const projection = createProjection(project);
    project.name = '</title><script>alert(1)</script>';
    const textures = { floorDataUrl: project.source.dataUrl, wallDataUrl: project.source.dataUrl };
    expect(printPlanHtml(project, textures)).not.toContain('<script>alert');
    expect(printPlanHtml(project, textures)).toContain('&lt;script&gt;');
    expect(() => printPlanHtml({ ...project, cameraHeight: 650 }, textures, projection)).toThrow(
      /no longer matches/,
    );
    expect(() => exportSurfaceSvg(project, 'wall', 'javascript:alert(1)')).toThrow();
  });
});
