import {
  createProjection,
  inspectRaster,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
  validateProject,
  type Project,
  type Projection,
} from './core';

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const n = (value: number): string => Number(value.toFixed(4)).toString();
const MAX_TEXTURE_BYTES = 32 * 1024 * 1024;
const TILE_WIDTH = 190;
const TILE_HEIGHT = 267;

function checkTexture(dataUrl: string) {
  const info = inspectRaster(dataUrl, MAX_TEXTURE_BYTES);
  if (
    info.mime !== 'image/png' ||
    info.width > MAX_OUTPUT_SIDE ||
    info.height > MAX_OUTPUT_SIDE ||
    info.width * info.height > MAX_OUTPUT_PIXELS
  )
    throw new Error('Surface exports need a generated PNG within the output pixel budget.');
  return info;
}

function checkedProjection(project: Project, given?: Projection): Projection {
  const actual = createProjection(project);
  if (
    given &&
    (Math.abs(given.planeWidth - actual.planeWidth) > 1e-5 ||
      Math.abs(given.planeHeight - actual.planeHeight) > 1e-5 ||
      Math.abs(given.camera.x - actual.camera.x) > 1e-5 ||
      Math.abs(given.camera.y - actual.camera.y) > 1e-5 ||
      Math.abs(given.camera.z - actual.camera.z) > 1e-5 ||
      given.settings.surfaceWidth !== actual.settings.surfaceWidth ||
      given.settings.floorDepth !== actual.settings.floorDepth ||
      given.settings.wallHeight !== actual.settings.wallHeight)
  )
    throw new Error(
      'The warped output no longer matches these settings. Generate the surfaces again.',
    );
  return actual;
}

/** The embedded pixels are already projectively warped; this only sets mm scale. */
export function exportSurfaceSvg(
  input: Project,
  surface: 'floor' | 'wall',
  pngDataUrl: string,
): string {
  const project = validateProject(input);
  checkTexture(pngDataUrl);
  if (surface !== 'floor' && surface !== 'wall') throw new Error('Choose floor or wall.');
  const height = surface === 'floor' ? project.floorDepth : project.wallHeight;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${n(project.surfaceWidth)}mm" height="${n(height)}mm" viewBox="0 0 ${n(project.surfaceWidth)} ${n(height)}"><title>${escapeHtml(project.name)} — ${surface} warped surface</title><desc>Already inverse-rasterized for a measured right-angle corner. Physical dimensions are millimetres. Keep this image upright and verify print scale.</desc><image x="0" y="0" width="${n(project.surfaceWidth)}" height="${n(height)}" preserveAspectRatio="none" href="${pngDataUrl}"/></svg>`;
}

/** Self-contained, 1:1 A4 assembly plan; each PNG is embedded only once. */
export function printPlanHtml(
  input: Project,
  textures: { floorDataUrl: string; wallDataUrl: string },
  givenProjection?: Projection,
): string {
  const project = validateProject(input);
  const projection = checkedProjection(project, givenProjection);
  const floorInfo = checkTexture(textures.floorDataUrl);
  const wallInfo = checkTexture(textures.wallDataUrl);
  if (floorInfo.width * floorInfo.height + wallInfo.width * wallInfo.height > MAX_OUTPUT_PIXELS)
    throw new Error('Combined surface textures exceed the 6 megapixel budget.');
  const columns = Math.ceil(project.surfaceWidth / TILE_WIDTH);
  const floorRows = Math.ceil(project.floorDepth / TILE_HEIGHT);
  const wallRows = Math.ceil(project.wallHeight / TILE_HEIGHT);
  const count = columns * (floorRows + wallRows);
  if (count > 120)
    throw new Error(
      'This installation needs more than 120 surface tiles. Reduce its physical dimensions.',
    );
  const ruler = `<svg width="108mm" height="5mm" viewBox="0 0 108 5" aria-label="100 millimetre print calibration"><path d="M2 0V3M2 1.5H102M102 0V3" stroke="#111" stroke-width=".25" fill="none"/><text x="52" y="4.8" font-size="2.3" text-anchor="middle">This line must measure 100 mm</text></svg>`;
  const pages: string[] = [];
  for (const surface of ['wall', 'floor'] as const) {
    const height = surface === 'wall' ? project.wallHeight : project.floorDepth;
    const rows = surface === 'wall' ? wallRows : floorRows;
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const x = column * TILE_WIDTH;
        const y = row * TILE_HEIGHT;
        const seam = surface === 'floor' ? 0 : height;
        pages.push(
          `<article class="sheet tile"><header><strong>${surface.toUpperCase()} ${surface === 'wall' ? 'W' : 'F'}${row + 1}-${column + 1}</strong> · column ${column + 1}/${columns}, row ${row + 1}/${rows} · print origin ${n(x)}, ${n(y)} mm</header><svg class="tile-art" xmlns="http://www.w3.org/2000/svg" width="190mm" height="267mm" viewBox="${n(x)} ${n(y)} 190 267" aria-label="${surface} tile ${row + 1}-${column + 1}"><rect x="${n(x)}" y="${n(y)}" width="190" height="267" fill="white"/><use href="#${surface}-texture"/><rect x="0" y="0" width="${n(project.surfaceWidth)}" height="${n(height)}" fill="none" stroke="#333" stroke-width=".25"/><path d="M0 ${n(seam)}H${n(project.surfaceWidth)}" stroke="#b1462b" stroke-width=".6" stroke-dasharray="3 2"/><rect x="${n(x + 0.2)}" y="${n(y + 0.2)}" width="189.6" height="266.6" fill="none" stroke="#888" stroke-width=".2" stroke-dasharray="2 2"/></svg><footer>${ruler}<span>${surface === 'wall' ? 'Upright · bottom edge meets floor' : 'Top edge meets wall · keep upright'}</span></footer></article>`,
        );
      }
  }
  const cover = `<article class="sheet cover"><small>IMPOSSIBLE PRINT / MEASURED INSTALLATION</small><h1>${escapeHtml(project.name)}</h1><p>One right-angle corner. One marked viewing position. ${count} surface tiles plus this setup sheet.</p><svg width="170mm" height="95mm" viewBox="0 0 680 380" aria-label="Side view of the wall, floor and camera"><rect width="680" height="380" fill="#f5f2e9"/><path d="M130 50V300H600" fill="none" stroke="#293a46" stroke-width="8"/><path d="M130 170V300H340" fill="none" stroke="#da7958" stroke-width="15" opacity=".6"/><path d="M480 100L130 300" stroke="#7b6b98" stroke-width="2" stroke-dasharray="8 6"/><rect x="452" y="78" width="58" height="38" rx="7" fill="#293a46"/><circle cx="475" cy="97" r="9" fill="#e4d0a4"/><path d="M130 330H480M130 321V339M480 321V339M540 100V300M531 100H549M531 300H549" stroke="#6d7480" stroke-width="2"/><text x="220" y="357" font-family="sans-serif" font-size="17">camera distance ${n(project.cameraDistance)} mm</text><text x="560" y="193" font-family="sans-serif" font-size="16">height</text><text x="560" y="217" font-family="sans-serif" font-size="16">${n(project.cameraHeight)} mm</text><text x="38" y="148" font-family="sans-serif" font-size="17">WALL</text><text x="310" y="275" font-family="sans-serif" font-size="17">FLOOR</text><text x="370" y="58" font-family="sans-serif" font-size="16">camera / marked eye position</text></svg><ol><li>Print A4 portrait at <strong>100% / Actual size</strong>, 10 mm margins. Disable browser headers and footers. Measure the 100 mm line before assembling.</li><li>Trim blank margins and join matching W or F row/column tiles at the dashed edges. Keep every sheet upright. The top of FLOOR touches the bottom of WALL at the crease.</li><li>Use a true 90° corner. Wall: ${n(project.surfaceWidth)} × ${n(project.wallHeight)} mm. Floor: ${n(project.surfaceWidth)} × ${n(project.floorDepth)} mm. Align matching horizontal columns across the crease.</li><li>Measure the camera ${n(project.cameraDistance)} mm out from the crease and ${n(project.cameraHeight)} mm above the floor. Lateral offset is ${n(project.cameraX)} mm; positive X means left when facing the corner. Aim at the crease centre.</li><li>Use the configured camera lens/view as a visual reference, then adjust the physical camera position carefully. Paper stretch, lens distortion and measurement error can affect alignment.</li></ol><p>Projected image-plane width: ${n(projection.planeWidth)} mm (${n(projection.fitScale * 100)}% of requested). +X runs leftwards when facing the corner; the printed columns already account for this. Do not mirror either surface.</p><footer>${ruler}<span>ufodia · Geometry is a setup aid; verify the physical result.</span></footer></article>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.name)} — Impossible Print assembly</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#e7e7e1;color:#202d34;font-family:system-ui,sans-serif}.controls{max-width:900px;margin:25px auto;padding:25px;background:white;border-radius:12px;line-height:1.6}button{border:0;border-radius:8px;background:#253c4a;color:white;padding:12px 22px;font:inherit;cursor:pointer}.sheet{width:190mm;height:277mm;overflow:hidden;background:white;margin:14px auto;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.tile header{height:5mm;line-height:5mm;font-size:2.4mm;white-space:nowrap}.tile-art{display:block;width:190mm;height:267mm}footer{height:5mm;display:flex;align-items:center;justify-content:space-between;font-size:2.3mm;white-space:nowrap}footer svg{flex:none}.cover{padding:6mm}.cover small{font-size:2.7mm;letter-spacing:.5mm}.cover h1{font-size:8mm;line-height:1.1;margin:6mm 0 4mm}.cover p,.cover li{font-size:3.1mm;line-height:1.55}.cover ol{padding-left:5mm}.cover li{margin-bottom:2.2mm}.cover>svg{display:block;width:170mm;height:95mm;margin:5mm auto}.cover footer{margin-top:5mm}.texture-definitions{position:absolute;width:0;height:0;overflow:hidden}@media print{body{background:white}.controls{display:none}.sheet{margin:0}.texture-definitions{position:absolute}}</style></head><body><section class="controls"><h1>Your corner, in pieces.</h1><p>These images are already inverse-rasterized for the measured camera position. The following pages include the setup diagram, numbered wall/floor tiles and a physical calibration ruler. Both textures are embedded once; this file makes no network requests.</p><button type="button" onclick="window.print()">Print assembly plan</button></section><svg class="texture-definitions" xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true"><defs><image id="floor-texture" x="0" y="0" width="${n(project.surfaceWidth)}" height="${n(project.floorDepth)}" preserveAspectRatio="none" href="${textures.floorDataUrl}"/><image id="wall-texture" x="0" y="0" width="${n(project.surfaceWidth)}" height="${n(project.wallHeight)}" preserveAspectRatio="none" href="${textures.wallDataUrl}"/></defs></svg>${cover}${pages.join('')}</body></html>`;
}
