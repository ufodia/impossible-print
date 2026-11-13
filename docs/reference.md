# Project and engine reference

This reference describes the version 1 schema used by Impossible Print 0.1.0. Physical lengths are millimetres. Source and output image dimensions are pixels.

## Project schema

| Field            | Type    | Accepted values / meaning                                                              |
| ---------------- | ------- | -------------------------------------------------------------------------------------- |
| `version`        | number  | Exactly `1`                                                                            |
| `name`           | string  | 1–120 characters before trimming; nonempty after trimming; no ASCII control characters |
| `source`         | object  | The embedded raster described below                                                    |
| `surfaceWidth`   | number  | 100–1,800; common width centred on the seam                                            |
| `floorDepth`     | number  | 100–1,500; distance outward from the wall                                              |
| `wallHeight`     | number  | 100–1,500; distance upward from the floor                                              |
| `cameraX`        | number  | −2,000–2,000; positive means left when facing the wall                                 |
| `cameraDistance` | number  | 100–5,000; outward from the wall                                                       |
| `cameraHeight`   | number  | 100–5,000; above the floor                                                             |
| `designWidth`    | number  | 50–1,600; virtual image-plane width before auto-fit                                    |
| `dpi`            | integer | 40–150; requested raster resolution                                                    |
| `autoFit`        | boolean | Shrink the image-plane footprint when necessary to fit both surfaces                   |

All numeric fields must be finite. Physical lengths may be fractional; DPI must be an integer. Unknown object fields are not preserved by validation.

The studio sample uses width 600, floor depth 450, wall height 450, camera offset 0, camera distance 800, camera height 600, artwork width 500, 72 DPI and auto-fit enabled.

### Embedded source

`source` contains `dataUrl`, `width` and `height`:

- `dataUrl` is a base64 `data:image/png`, `data:image/jpeg` or `data:image/webp` URL. Remote URLs, SVG and HTML are rejected.
- Decoded encoded-file bytes must not exceed 8 MiB. The parser checks base64 structure and actual format headers.
- `width` and `height` must match the raster header, remain at most 4,096 each, and contain at most 12,000,000 pixels in total.
- The studio also decodes the image and checks the browser's natural dimensions against that metadata.

The studio accepts project files up to 13 MiB. A saved project embeds the source image and settings; it does not embed the generated floor/wall rasters or a live camera feed.

## Output and print bounds

| Limit                                  | Behaviour                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Combined surface allocation            | At most 6,000,000 pixels across floor and wall                                  |
| Output side                            | At most 4,096 pixels                                                            |
| Effective DPI                          | Can be lower than requested to satisfy the allocation and side budgets          |
| Clipped fraction                       | 48 × 48 sampled source-image area estimate; includes transparent padding        |
| Surface texture input to print helpers | Generated PNG only; at most 32 MiB per texture, within output side/pixel bounds |
| Tile artwork size                      | 190 × 267 mm on A4 portrait with 10 mm page margins                             |
| Plan size                              | At most 120 surface tiles, plus one setup sheet                                 |

Tile count is `ceil(surfaceWidth / 190) × (ceil(floorDepth / 267) + ceil(wallHeight / 267))`. Rulers use a 100 mm reference line. Raw PNG downloads do not supply a universal physical print-size contract; the measured assembly plan does.

## Core functions

| Function                                         | Contract                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspectRaster(value, maxBytes?)`                | Reads supported data-image format headers and returns `{width, height, mime, bytes}`. Defaults to the 8 MiB source limit. Higher-level project validation applies source pixel bounds. |
| `validateProject(value)`                         | Validates and returns a normalized version 1 `Project`; throws a readable error for unsupported data or bounds.                                                                        |
| `sampleProject(source?)`                         | Returns valid sample measurements and an optional supplied source; without one, uses the core's small embedded raster fixture. The studio supplies its original text artwork.          |
| `createProjection(project)`                      | Returns camera/target/basis vectors, focal distance, image-plane size, fit scale and finite surface settings.                                                                          |
| `uvToSurface(projection, u, v, clip = true)`     | Takes source coordinates in `[0,1]`; returns the first positive floor/wall ray hit or `null`. `clip = false` allows hits beyond the finite rectangle extents.                          |
| `worldToUv(projection, point)`                   | Maps a world point back to source coordinates, or returns `null` for invalid/behind-camera geometry. A returned coordinate may lie outside `[0,1]`.                                    |
| `rasterDimensions(project)`                      | Returns bounded floor/wall pixel sizes and effective DPI.                                                                                                                              |
| `rasterizeSurfaces(project, sourcePixels)`       | Requires a matching `Uint8ClampedArray` RGBA buffer. Returns projection, floor/wall rasters, effective DPI and estimated clipped fraction.                                             |
| `rasterToDataUrl(surface)`                       | Encodes a validated raster surface to PNG through a browser canvas; not a Node-only function.                                                                                          |
| `exportSurfaceSvg(project, surface, pngDataUrl)` | Wraps an already warped floor/wall PNG in an SVG with measured millimetre dimensions. This is a core helper, not a visible studio download option.                                     |
| `printPlanHtml(project, textures, projection?)`  | Returns a self-contained HTML assembly plan. Checks PNG/output budgets and rejects a supplied projection that no longer matches the settings.                                          |

`RasterSurface` contains `surface`, pixel `width`/`height`, physical `widthMm`/`heightMm` and RGBA `data`. `RasterResult` contains `projection`, `effectiveDpi`, `floor`, `wall` and `clippedFraction`.

These functions are source-level exports, not a published npm package API. Use the committed lockfile and current source when embedding them in another application.

## Geometry and orientation

World floor: `z=0, y>=0`. World wall: `y=0, z>=0`. The camera is `(cameraX, cameraDistance, cameraHeight)` and targets `(0,0,0)` with Z up. Both printed images run from world +X on their left to −X on their right. Floor row zero is the seam; the wall's last row is the seam. Keep sheets upright and do not mirror them.

## Errors and unsupported inputs

Validation errors cover version/schema mismatch, non-finite or out-of-range measurements, invalid raster headers, metadata/dimension mismatch and oversized data. Browser decoding can still reject a file whose header parsed successfully. A projection can fail if auto-fit cannot produce a useful footprint. Print helpers reject stale supplied projection settings or excessive tile/texture allocations.

Arbitrary camera targets, room scans, curved/nonperpendicular surfaces, external image URLs and SVG imports are unsupported. See [the guide](guide.md) for practical troubleshooting.
