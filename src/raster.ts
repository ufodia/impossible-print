import {
  createProjection,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
  validateProject,
  uvToSurface,
  worldToUv,
  type Project,
  type Projection,
} from './core';

export interface RasterSurface {
  surface: 'floor' | 'wall';
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
  data: Uint8ClampedArray;
}
export interface RasterResult {
  projection: Projection;
  effectiveDpi: number;
  floor: RasterSurface;
  wall: RasterSurface;
  clippedFraction: number;
}
export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function rasterDimensions(input: Project): {
  width: number;
  floorHeight: number;
  wallHeight: number;
  effectiveDpi: number;
} {
  const project = validateProject(input);
  let effectiveDpi = Math.min(
    project.dpi,
    (MAX_OUTPUT_SIDE * 25.4) /
      Math.max(project.surfaceWidth, project.floorDepth, project.wallHeight),
    Math.sqrt(
      MAX_OUTPUT_PIXELS / (project.surfaceWidth * (project.floorDepth + project.wallHeight)),
    ) * 25.4,
  );
  const sizes = () => ({
    width: Math.max(1, Math.floor((project.surfaceWidth / 25.4) * effectiveDpi)),
    floorHeight: Math.max(1, Math.floor((project.floorDepth / 25.4) * effectiveDpi)),
    wallHeight: Math.max(1, Math.floor((project.wallHeight / 25.4) * effectiveDpi)),
    effectiveDpi,
  });
  let dimensions = sizes();
  while (dimensions.width * (dimensions.floorHeight + dimensions.wallHeight) > MAX_OUTPUT_PIXELS) {
    effectiveDpi *= 0.999;
    dimensions = sizes();
  }
  return dimensions;
}

/** Premultiplied-alpha bilinear sampling prevents dark halos at transparent edges. */
function sample(
  source: ImageDataLike,
  u: number,
  v: number,
  target: Uint8ClampedArray,
  offset: number,
): void {
  if (u < 0 || u > 1 || v < 0 || v > 1) return;
  const x = u * (source.width - 1);
  const y = v * (source.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(source.width - 1, x0 + 1);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const taps = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ];
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const [sx, sy, weight] of taps) {
    const at = (sy! * source.width + sx!) * 4;
    const a = (source.data[at + 3]! / 255) * weight!;
    alpha += a;
    red += source.data[at]! * a;
    green += source.data[at + 1]! * a;
    blue += source.data[at + 2]! * a;
  }
  if (alpha > 0) {
    target[offset] = red / alpha;
    target[offset + 1] = green / alpha;
    target[offset + 2] = blue / alpha;
    target[offset + 3] = alpha * 255;
  }
}

/** Output dimensions are capped independently from the input file's compression. */
export function rasterizeSurfaces(input: Project, source: ImageDataLike): RasterResult {
  const project = validateProject(input);
  const projection = createProjection(project);
  if (
    !(source.data instanceof Uint8ClampedArray) ||
    source.width !== project.source.width ||
    source.height !== project.source.height ||
    source.data.length !== source.width * source.height * 4
  )
    throw new Error('Decoded source pixels must match the validated source dimensions.');
  const dimensions = rasterDimensions(project);
  const make = (surface: 'floor' | 'wall', height: number, heightMm: number): RasterSurface => {
    const data = new Uint8ClampedArray(dimensions.width * height * 4);
    for (let row = 0; row < height; row++)
      for (let column = 0; column < dimensions.width; column++) {
        // In this right-handed Z-up world, +X is left when facing the corner.
        // Printed sheets remain upright; both preview texture U axes must flip.
        const x = (0.5 - (column + 0.5) / dimensions.width) * project.surfaceWidth;
        const point =
          surface === 'floor'
            ? { x, y: ((row + 0.5) / height) * heightMm, z: 0 }
            : { x, y: 0, z: (1 - (row + 0.5) / height) * heightMm };
        const uv = worldToUv(projection, point);
        if (uv) sample(source, uv.u, uv.v, data, (row * dimensions.width + column) * 4);
      }
    return {
      surface,
      width: dimensions.width,
      height,
      widthMm: project.surfaceWidth,
      heightMm,
      data,
    };
  };
  const floor = make('floor', dimensions.floorHeight, project.floorDepth);
  const wall = make('wall', dimensions.wallHeight, project.wallHeight);
  let clipped = 0;
  const grid = 48;
  for (let y = 0; y < grid; y++)
    for (let x = 0; x < grid; x++)
      if (!uvToSurface(projection, (x + 0.5) / grid, (y + 0.5) / grid)) clipped++;
  return {
    projection,
    effectiveDpi: dimensions.effectiveDpi,
    floor,
    wall,
    clippedFraction: clipped / (grid * grid),
  };
}

export function rasterToDataUrl(surface: RasterSurface): string {
  if (
    !Number.isInteger(surface.width) ||
    !Number.isInteger(surface.height) ||
    surface.width < 1 ||
    surface.height < 1 ||
    surface.width > MAX_OUTPUT_SIDE ||
    surface.height > MAX_OUTPUT_SIDE ||
    surface.width * surface.height > MAX_OUTPUT_PIXELS ||
    !(surface.data instanceof Uint8ClampedArray) ||
    surface.data.length !== surface.width * surface.height * 4
  )
    throw new Error('The warped surface raster is invalid or too large.');
  if (typeof document === 'undefined') throw new Error('PNG encoding needs a browser canvas.');
  const canvas = document.createElement('canvas');
  canvas.width = surface.width;
  canvas.height = surface.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot encode the warped surface.');
  const data = new Uint8ClampedArray(surface.data.length);
  data.set(surface.data);
  context.putImageData(new ImageData(data, surface.width, surface.height), 0, 0);
  const result = canvas.toDataURL('image/png');
  canvas.width = 1;
  canvas.height = 1;
  return result;
}
