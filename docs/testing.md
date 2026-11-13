# Verify the geometry, browser and paper separately

Use this guide with Impossible Print 0.1.0. Automated tests verify the implemented model and browser workflows; a particular printer, lens and physical corner still need their own checks.

## Source checks

Install Node.js 24 and the locked dependencies:

```sh
npm ci
npm run verify
```

`verify` runs strict TypeScript checking, the unit suite and the production build. Unit coverage includes forward/inverse projection, crease crossings, shrinking auto-fit, camera-dependent warp changes, physical orientation, premultiplied-alpha interpolation, raster-header validation and output allocation limits.

## Browser workflows

```sh
npx playwright install --no-shell chromium
npm run test:e2e
```

The suite uses full Playwright Chromium. The CI workflow installs Linux browser dependencies with `--with-deps` before running it.

| Area                 | What the suite checks                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Actual output pixels | Camera edits change generated floor/wall PNGs, not only summary labels                         |
| Portability          | Saving and reopening source images and measurements preserves a project                        |
| 3D rendering         | Camera and orbit views differ, dragging changes the overview, and Camera view restores it      |
| Imports              | Raster/text creation works; malformed projects and active SVG inputs are rejected              |
| Print output         | Physical tile/ruler dimensions, embedded generated textures, escaped names and offline display |
| Fallback             | A forced WebGL failure retains usable PNG and print output                                     |
| Layout               | Narrow-screen workspace remains usable without horizontal overflow                             |

The 3D test can explicitly skip when its browser cannot create WebGL; inspect the result rather than equating a skip with 3D verification. The workspace screenshot is an actual browser capture of the implemented preview, not evidence of a completed physical installation.

## Physical verification checklist

1. Print a calibration page at 100% / Actual size and measure its 100 mm line.
2. Confirm the wall/tabletop angle, surface flatness and all measured lengths.
3. Keep every tile upright; join floor top to wall bottom with matching columns.
4. Place the viewing point at the recorded offset, wall distance and floor height.
5. Aim toward the seam centre and compare with the virtual Camera view.
6. Record the printer settings, actual measurements and lens/camera used when reporting a discrepancy.

No automated result establishes physical paper alignment, printer scaling or lens-distortion accuracy. Do not label those checks as passed without measuring the installation.

## Reproducible reports

Include the source commit, browser/OS, a minimal nonprivate project and the observed versus expected behaviour. For geometry failures, include the exact dimensions and viewpoint. For print failures, include the selected paper, scale, margins and measured ruler length.
