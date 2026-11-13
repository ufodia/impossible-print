export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface SourceImage {
  dataUrl: string;
  width: number;
  height: number;
}
export interface Project {
  version: 1;
  name: string;
  source: SourceImage;
  surfaceWidth: number;
  floorDepth: number;
  wallHeight: number;
  cameraX: number;
  cameraDistance: number;
  cameraHeight: number;
  designWidth: number;
  dpi: number;
  autoFit: boolean;
}
export interface Projection {
  camera: Vec3;
  target: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  focalDistance: number;
  planeWidth: number;
  planeHeight: number;
  fitScale: number;
  settings: { surfaceWidth: number; floorDepth: number; wallHeight: number };
}
export interface SurfaceHit {
  surface: 'floor' | 'wall';
  point: Vec3;
}
export interface RasterInfo {
  width: number;
  height: number;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: number;
}

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 12_000_000;
export const MAX_OUTPUT_PIXELS = 6_000_000;
export const MAX_OUTPUT_SIDE = 4096;
const EPS = 1e-7;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalized = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length <= EPS) throw new Error('Camera and target must be different.');
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
let rasterCache: { dataUrl: string; info: RasterInfo } | undefined;

/** Parse real raster headers before a browser is asked to decode a large image. */
export function inspectRaster(value: unknown, maxBytes = MAX_SOURCE_BYTES): RasterInfo {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3) + 100)
    throw new Error('Choose a bounded PNG, JPEG or WebP data image.');
  if (rasterCache?.dataUrl === value) {
    if (rasterCache.info.bytes > maxBytes)
      throw new Error('The raster image exceeds its byte limit.');
    return { ...rasterCache.info };
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match)
    throw new Error(
      'Only embedded PNG, JPEG and WebP images are supported. SVG, HTML and remote URLs are not images here.',
    );
  const data = match[2]!;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = (data.length / 4) * 3 - padding;
  if (data.length % 4 !== 0 || bytes > maxBytes || bytes < 12)
    throw new Error('The raster image is malformed or exceeds its byte limit.');
  let binary: string;
  try {
    binary = atob(match[1] === 'image/jpeg' ? data : data.slice(0, 128));
  } catch {
    throw new Error('The image base64 is malformed.');
  }
  const b = (at: number) => binary.charCodeAt(at);
  const be16 = (at: number) => b(at) * 256 + b(at + 1);
  const be32 = (at: number) => b(at) * 16777216 + b(at + 1) * 65536 + b(at + 2) * 256 + b(at + 3);
  const le16 = (at: number) => b(at) + b(at + 1) * 256;
  const le24 = (at: number) => b(at) + b(at + 1) * 256 + b(at + 2) * 65536;
  let width = 0;
  let height = 0;
  if (match[1] === 'image/png') {
    if (
      !binary.startsWith('\x89PNG\r\n\x1a\n') ||
      binary.slice(12, 16) !== 'IHDR' ||
      binary.length < 24
    )
      throw new Error('The image is not a supported PNG.');
    width = be32(16);
    height = be32(20);
  } else if (match[1] === 'image/jpeg') {
    if (!binary.startsWith('\xff\xd8\xff')) throw new Error('The image is not a supported JPEG.');
    let offset = 2;
    while (offset + 4 <= binary.length) {
      if (b(offset++) !== 0xff) break;
      while (b(offset) === 0xff) offset++;
      const marker = b(offset++);
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      const length = be16(offset);
      if (length < 2 || offset + length > binary.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        if (length < 7) break;
        height = be16(offset + 3);
        width = be16(offset + 5);
        break;
      }
      offset += length;
    }
  } else {
    if (!binary.startsWith('RIFF') || binary.slice(8, 12) !== 'WEBP')
      throw new Error('The image is not a supported WebP.');
    const format = binary.slice(12, 16);
    if (format === 'VP8X' && binary.length >= 30) {
      width = 1 + le24(24);
      height = 1 + le24(27);
    } else if (format === 'VP8L' && binary.length >= 25 && b(20) === 0x2f) {
      width = 1 + ((b(21) | (b(22) << 8)) & 0x3fff);
      height = 1 + (((b(22) >> 6) | (b(23) << 2) | (b(24) << 10)) & 0x3fff);
    } else if (
      format === 'VP8 ' &&
      binary.length >= 30 &&
      binary.slice(23, 26) === '\x9d\x01\x2a'
    ) {
      width = le16(26) & 0x3fff;
      height = le16(28) & 0x3fff;
    }
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('The raster image header has no valid dimensions.');
  const info: RasterInfo = { width, height, mime: match[1] as RasterInfo['mime'], bytes };
  rasterCache = { dataUrl: value, info };
  return { ...info };
}

export function validateProject(value: unknown): Project {
  if (!object(value) || value.version !== 1 || !object(value.source))
    throw new Error('Choose an Impossible Print version 1 project with a raster source.');
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 120 ||
    /[\u0000-\u001f]/.test(value.name)
  )
    throw new Error('Project name must contain 1–120 readable characters.');
  const source = value.source;
  const raster = inspectRaster(source.dataUrl);
  if (
    !finite(source.width) ||
    !finite(source.height) ||
    source.width !== raster.width ||
    source.height !== raster.height ||
    raster.width > 4096 ||
    raster.height > 4096 ||
    raster.width * raster.height > MAX_SOURCE_PIXELS
  )
    throw new Error(
      'Source dimensions must match the actual image and stay within 4096 pixels per side and 12 megapixels.',
    );
  const range = (key: string, min: number, max: number): number => {
    const n = value[key];
    if (!finite(n) || n < min || n > max)
      throw new Error(`${key} must be between ${min} and ${max}.`);
    return n;
  };
  const project: Project = {
    version: 1,
    name: value.name.trim(),
    source: { dataUrl: source.dataUrl as string, width: source.width, height: source.height },
    surfaceWidth: range('surfaceWidth', 100, 1800),
    floorDepth: range('floorDepth', 100, 1500),
    wallHeight: range('wallHeight', 100, 1500),
    cameraX: range('cameraX', -2000, 2000),
    cameraDistance: range('cameraDistance', 100, 5000),
    cameraHeight: range('cameraHeight', 100, 5000),
    designWidth: range('designWidth', 50, 1600),
    dpi: range('dpi', 40, 150),
    autoFit: value.autoFit as boolean,
  };
  if (!Number.isInteger(project.dpi)) throw new Error('Print DPI must be a whole number.');
  if (typeof value.autoFit !== 'boolean')
    throw new Error('Choose whether to fit the design within both surfaces.');
  return project;
}

export function sampleProject(source?: SourceImage): Project {
  return {
    version: 1,
    name: 'A corner of possibility',
    source: source ?? {
      width: 32,
      height: 24,
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAfUlEQVR4nGP49unF/4HEDKMOGJQO0NR3RMG4xEnFZDuAWo6gyAHUcATFDqDUERQ54EVdMBzD1CGLoWOaOoAYR9DcAYQcQRcH4HME3RyAyxF0dQA2R9DdAeiOGBAHIDuCZgURKQXOgDkAlyPo6gCYhQPqALKjgJ541AED7gAACfH8FJa60IYAAAAASUVORK5CYII=',
    },
    surfaceWidth: 600,
    floorDepth: 450,
    wallHeight: 450,
    cameraX: 0,
    cameraDistance: 800,
    cameraHeight: 600,
    designWidth: 500,
    dpi: 72,
    autoFit: true,
  };
}

function rayDirection(projection: Projection, u: number, v: number): Vec3 {
  const dx = (u - 0.5) * projection.planeWidth;
  const dy = (0.5 - v) * projection.planeHeight;
  return {
    x:
      projection.forward.x * projection.focalDistance +
      projection.right.x * dx +
      projection.up.x * dy,
    y:
      projection.forward.y * projection.focalDistance +
      projection.right.y * dx +
      projection.up.y * dy,
    z:
      projection.forward.z * projection.focalDistance +
      projection.right.z * dx +
      projection.up.z * dy,
  };
}

/** First positive ray hit on the two perpendicular half-planes, optionally clipped. */
export function uvToSurface(
  projection: Projection,
  u: number,
  v: number,
  clip = true,
): SurfaceHit | null {
  if (!finite(u) || !finite(v) || u < 0 || u > 1 || v < 0 || v > 1) return null;
  const direction = rayDirection(projection, u, v);
  const camera = projection.camera;
  const candidates: (SurfaceHit & { t: number })[] = [];
  if (direction.z < -EPS) {
    const t = -camera.z / direction.z;
    const point = { x: camera.x + t * direction.x, y: camera.y + t * direction.y, z: 0 };
    if (t > 0 && point.y >= -EPS) candidates.push({ surface: 'floor', point, t });
  }
  if (direction.y < -EPS) {
    const t = -camera.y / direction.y;
    const point = { x: camera.x + t * direction.x, y: 0, z: camera.z + t * direction.z };
    if (t > 0 && point.z >= -EPS) candidates.push({ surface: 'wall', point, t });
  }
  const hit = candidates.sort((a, b) => a.t - b.t)[0];
  if (!hit) return null;
  if (
    clip &&
    (Math.abs(hit.point.x) > projection.settings.surfaceWidth / 2 + EPS ||
      (hit.surface === 'floor'
        ? hit.point.y > projection.settings.floorDepth + EPS
        : hit.point.z > projection.settings.wallHeight + EPS))
  )
    return null;
  return { surface: hit.surface, point: hit.point };
}

/** Perspective inverse: a physical floor/wall point becomes source image UV. */
export function worldToUv(projection: Projection, point: Vec3): { u: number; v: number } | null {
  if (![point.x, point.y, point.z].every(finite)) return null;
  const relative = subtract(point, projection.camera);
  const depth = dot(relative, projection.forward);
  if (depth <= EPS || projection.planeWidth <= EPS || projection.planeHeight <= EPS) return null;
  const scale = projection.focalDistance / depth;
  return {
    u: 0.5 + (dot(relative, projection.right) * scale) / projection.planeWidth,
    v: 0.5 - (dot(relative, projection.up) * scale) / projection.planeHeight,
  };
}

/** Image corners plus the exact crossings of the physical crease with its edges. */
function footprintVertices(projection: Projection): { u: number; v: number }[] {
  const points = [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 1, v: 1 },
    { u: 0, v: 1 },
  ];
  const seam = (u: number, v: number) => {
    const d = rayDirection(projection, u, v);
    return projection.camera.y * d.z - projection.camera.z * d.y;
  };
  const c = seam(0, 0);
  const a = seam(1, 0) - c;
  const b = seam(0, 1) - c;
  for (const u of [0, 1])
    if (Math.abs(b) > EPS) {
      const v = -(a * u + c) / b;
      if (v > 0 && v < 1) points.push({ u, v });
    }
  for (const v of [0, 1])
    if (Math.abs(a) > EPS) {
      const u = -(b * v + c) / a;
      if (u > 0 && u < 1) points.push({ u, v });
    }
  return points;
}

export function createProjection(input: Project): Projection {
  const project = validateProject(input);
  const camera = { x: project.cameraX, y: project.cameraDistance, z: project.cameraHeight };
  const target = { x: 0, y: 0, z: 0 };
  const forward = normalized(subtract(target, camera));
  const right = normalized(cross(forward, { x: 0, y: 0, z: 1 }));
  const up = normalized(cross(right, forward));
  const projection: Projection = {
    camera,
    target,
    forward,
    right,
    up,
    focalDistance: Math.hypot(camera.x, camera.y, camera.z),
    planeWidth: project.designWidth,
    planeHeight: (project.designWidth * project.source.height) / project.source.width,
    fitScale: 1,
    settings: {
      surfaceWidth: project.surfaceWidth,
      floorDepth: project.floorDepth,
      wallHeight: project.wallHeight,
    },
  };
  const fits = (scale: number) => {
    const candidate = {
      ...projection,
      planeWidth: project.designWidth * scale,
      planeHeight: ((project.designWidth * project.source.height) / project.source.width) * scale,
    };
    return footprintVertices(candidate).every((uv) => uvToSurface(candidate, uv.u, uv.v) !== null);
  };
  if (project.autoFit && !fits(1)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 52; i++) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    if (low < 1e-7)
      throw new Error(
        'This camera arrangement cannot fit a useful image on the selected surfaces.',
      );
    projection.fitScale = low * (1 - 1e-8);
    projection.planeWidth *= projection.fitScale;
    projection.planeHeight *= projection.fitScale;
  }
  return projection;
}
