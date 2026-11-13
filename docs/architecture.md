# How the corner becomes an image

Impossible Print 0.1.0 is a static TypeScript application. Geometry, decoding, raster generation and print preparation run in the visitor's browser. The 3D view uses Three.js; there is no projection server or camera-capture service.

## Coordinate contract

The seam centre is `(0, 0, 0)`. The floor is the half-plane `z = 0, y >= 0`; the wall is `y = 0, z >= 0`. Both are clipped to the selected width and their separate depth or height.

The measured camera point is `(cameraX, cameraDistance, cameraHeight)`, looking toward the seam centre with world Z as up. This right-handed basis makes positive X point left when you face the corner. Printed raster columns already account for that convention.

## Forward projection

`createProjection` builds an orthonormal forward/right/up basis and a virtual image plane centred at the seam. Its width is `designWidth`; its height follows the source image's aspect ratio.

`uvToSurface` casts a ray from the measured point through a source-image coordinate. It selects the first positive intersection with the floor or wall, then optionally rejects a hit outside the finite rectangles. This is perspective geometry across two planes, rather than a pair of affine image transforms.

Auto-fit checks the footprint's image corners and its exact crossings of the crease with the image edges. When necessary, a bounded binary search shrinks the image plane. A fit scale of 1 leaves the requested width intact; lower values shrink it.

## Inverse rasterization

For each output pixel, `rasterizeSurfaces` maps the corresponding physical floor or wall point back through `worldToUv` into the source image. Premultiplied-alpha bilinear sampling preserves transparent edges without dark interpolation halos. Samples outside the source remain transparent.

Output dimensions follow the requested DPI, then reduce as needed to stay within 4,096 pixels per side and 6 megapixels across both surfaces. The result records effective DPI. Clipping is a separate estimate: 48 × 48 source-coordinate samples count how much source-image area misses the finite corner. It includes transparent source padding.

## One set of pixels, three uses

The studio converts the generated rasters to PNGs and canvases. It uses those actual pixels in the 2D surface previews, the 3D floor/wall textures and the print plan.

`CornerPreview` loads lazily. It positions a Three.js perspective camera at the measured point for **Camera view**, or uses an orbit overview to expose the split. Texture orientation matches upright physical sheets: the floor's top edge joins the wall's bottom edge. View dimensions determine the virtual preview framing; the application does not estimate a real camera lens.

Editing or leaving the page disposes the renderer, controls, observers, geometry, materials and textures. A WebGL failure leaves raster generation and printing available.

## Printing without multiplying large images

`printPlanHtml` embeds each generated PNG once in SVG definitions. Numbered tile pages reference those textures at their physical millimetre scale. A cover sheet records measurements and placement instructions. Generated names are HTML-escaped; the plan requires no network requests and its print button invokes the browser's own print dialog.

The core also exposes `exportSurfaceSvg`, a measured wrapper around an already warped PNG. It is a source helper; the studio's visible surface-download controls produce PNG files.

## Module map

| Source           | Responsibility                                                                          |
| ---------------- | --------------------------------------------------------------------------------------- |
| `src/core.ts`    | Versioned validation, raster-header inspection, camera basis and ray/inverse projection |
| `src/raster.ts`  | Output budgets, interpolation, warped surface pixels and PNG encoding                   |
| `src/preview.ts` | Disposable Three.js two-plane scene and viewpoint controls                              |
| `src/print.ts`   | Measured surface wrapper and self-contained A4 assembly plan                            |
| `src/main.ts`    | Local imports, text artwork, settings, downloads and UI state                           |

See [reference](reference.md) for public function contracts and [testing](testing.md) for automated and physical verification boundaries.
