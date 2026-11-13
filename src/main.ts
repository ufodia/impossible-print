import './style.css';
import {
  sampleProject,
  validateProject,
  inspectRaster,
  type Project,
  type SourceImage,
} from './core';
import { rasterizeSurfaces, rasterToDataUrl } from './raster';
import { printPlanHtml } from './print';
import type { CornerPreview, PreviewView } from './preview';

type RasterResult = ReturnType<typeof rasterizeSurfaces>;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Impossible Print application root is missing.');
let project: Project = sampleProject(makeArtwork('THE OTHER SIDE', true));
let raster: RasterResult | null = null;
let sourcePixels: ImageData | null = null;
let sourceKey = '';
let floorPng = '',
  wallPng = '';
let floorCanvas: HTMLCanvasElement | null = null,
  wallCanvas: HTMLCanvasElement | null = null;
let preview: CornerPreview | null = null;
let previewEpoch = 0;
let viewMode: PreviewView = 'camera';
let building = false;
let rebuildEpoch = 0;
let textValue = 'THE OTHER SIDE';
let unsaved = false;
let message = 'A corner, a camera point, and an image that only makes sense from one place.';
let messageKind: 'info' | 'success' | 'error' = 'info';

function h(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
function icon(name: string): string {
  const paths: Record<string, string> = {
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
    coffee:
      '<path d="M4 7h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v2m4-2v2m4-2v2"/>',
    print: '<path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7v-7Zm10-3h.01"/>',
    camera: '<path d="M8 6 10 3h4l2 3h5v15H3V6h5Z"/><circle cx="12" cy="13" r="4"/>',
    orbit:
      '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="4"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 4-3 4 5"/>',
    measure: '<path d="m4 16 12-12 4 4L8 20l-4-4Zm4-4 2 2m1-5 2 2m1-5 2 2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    text: '<path d="M4 4h16M12 4v16M8 20h8"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}
function tell(text: string, kind: typeof messageKind = 'info'): void {
  message = text;
  messageKind = kind;
}
function number(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function makeArtwork(text: string, original = false): SourceImage {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to create the artwork.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#2f7180';
  context.lineWidth = 8;
  context.strokeRect(61, 61, 1078, 678);
  context.fillStyle = '#245e71';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines =
    words.length > 2
      ? [
          words.slice(0, Math.ceil(words.length / 2)).join(' '),
          words.slice(Math.ceil(words.length / 2)).join(' '),
        ]
      : [text.trim() || 'LOOK AGAIN'];
  const maxWidth = 990;
  let size = original ? 139 : 152;
  do {
    context.font = `800 ${size}px Arial, sans-serif`;
    if (lines.every((line) => context.measureText(line).width <= maxWidth)) break;
    size -= 3;
  } while (size > 24);
  lines.forEach((line, index) =>
    context.fillText(line, 600, lines.length === 1 ? 390 : 320 + index * (size * 1.15)),
  );
  context.strokeStyle = '#5b93a8';
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(490, 600);
  context.lineTo(710, 600);
  context.lineTo(680, 570);
  context.moveTo(710, 600);
  context.lineTo(680, 630);
  context.stroke();
  if (original) {
    context.fillStyle = '#3d8c8d';
    context.beginPath();
    context.arc(600, 169, 24, 0, Math.PI * 2);
    context.fill();
    context.font = '500 24px monospace';
    context.fillStyle = '#5a8998';
    context.fillText('A DIFFERENT POINT OF VIEW', 600, 690);
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
async function decodeSource(source: SourceImage): Promise<ImageData> {
  const metadata = inspectRaster(source.dataUrl);
  if (
    metadata.width !== source.width ||
    metadata.height !== source.height ||
    metadata.width > 4096 ||
    metadata.height > 4096 ||
    metadata.width * metadata.height > 12000000
  )
    throw new Error(
      'Use an image up to 4,096 pixels per side and 12 megapixels with matching saved dimensions.',
    );
  const image = new Image();
  image.src = source.dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error('The source image could not be decoded. Choose a readable PNG, JPEG or WebP.');
  }
  if (image.naturalWidth !== source.width || image.naturalHeight !== source.height)
    throw new Error('The source image dimensions do not match the saved project metadata.');
  if (
    image.naturalWidth > 4096 ||
    image.naturalHeight > 4096 ||
    image.naturalWidth * image.naturalHeight > 12000000
  )
    throw new Error('Use an image up to 4,096 pixels per side and 12 megapixels.');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('A 2D canvas is required to prepare the artwork.');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
function surfaceCanvas(surface: RasterResult['floor']): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = surface.width;
  canvas.height = surface.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to display the surface texture.');
  context.putImageData(
    new ImageData(new Uint8ClampedArray(surface.data), surface.width, surface.height),
    0,
    0,
  );
  return canvas;
}
function invalidate(): void {
  raster = null;
  floorPng = '';
  wallPng = '';
  floorCanvas = null;
  wallCanvas = null;
  preview?.dispose();
  preview = null;
}
async function rebuild(): Promise<void> {
  const epoch = ++rebuildEpoch;
  invalidate();
  building = true;
  tell('Projecting the image onto both measured surfaces. All processing stays here.');
  render();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  try {
    project = validateProject(project);
    if (!sourcePixels || sourceKey !== project.source.dataUrl) {
      const decoded = await decodeSource(project.source);
      if (epoch !== rebuildEpoch) return;
      sourcePixels = decoded;
      sourceKey = project.source.dataUrl;
    }
    const next = rasterizeSurfaces(project, sourcePixels);
    if (epoch !== rebuildEpoch) return;
    raster = next;
    floorCanvas = surfaceCanvas(next.floor);
    wallCanvas = surfaceCanvas(next.wall);
    floorPng = rasterToDataUrl(next.floor);
    wallPng = rasterToDataUrl(next.wall);
    tell(
      `Projection ready at ${number(next.effectiveDpi)} effective DPI. Compare the camera view with the orbit overview before printing.`,
      'success',
    );
  } catch (error) {
    if (epoch === rebuildEpoch)
      tell(
        error instanceof Error ? error.message : 'The projection could not be created.',
        'error',
      );
  } finally {
    if (epoch === rebuildEpoch) {
      building = false;
      render();
    }
  }
}
function numericField(
  label: string,
  name: keyof Project,
  value: number,
  minimum: number,
  maximum: number,
  step = 1,
): string {
  return `<label>${label}<span>mm</span><input aria-label="${h(label)} in millimeters" data-field="${name}" type="number" min="${minimum}" max="${maximum}" step="${step}" value="${value}"></label>`;
}
function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function savePng(data: string, filename: string): void {
  const link = document.createElement('a');
  link.href = data;
  link.download = filename;
  link.click();
}
function slug(): string {
  return (
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'impossible-print'
  );
}
function showViewState(): void {
  document.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach((item) => {
    const active = item.dataset.view === viewMode;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  const caption = document.querySelector('.view-caption>span:first-child');
  if (caption)
    caption.innerHTML = `<i></i>${viewMode === 'camera' ? 'The measured point reconstructs your image.' : 'The overview reveals the split across both surfaces.'}`;
}

function render(): void {
  const previewGeneration = ++previewEpoch;
  preview?.dispose();
  preview = null;
  root!.innerHTML = `<header class="site-header"><a class="brand" href="./" aria-label="Impossible Print home"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><span>impossible<span>print</span><sup>↗</sup></span></a><span class="header-caption">A DIFFERENT POINT OF VIEW.</span><nav class="header-actions" aria-label="Project actions"><button class="button quiet" data-action="sample" ${building ? 'disabled' : ''}>Load sample</button><button class="button quiet" data-action="open" ${building ? 'disabled' : ''}>${icon('upload')} Open project</button><button class="button outline" data-action="save" ${building ? 'disabled' : ''}>${icon('save')} Save project</button><a class="support-button" href="https://buymeacoffee.com/ufodia" target="_blank" rel="noopener noreferrer" aria-label="Support ufodia on Buy Me a Coffee">${icon('coffee')}<span>Keep the studio open</span></a></nav></header>
  <main><section class="intro"><div><p class="eyebrow"><span class="teal-dot"></span> THE CORNER ILLUSION STUDIO</p><h1>One corner. <span>An impossible view.</span></h1><p>Split an image across a wall and a table. Bring it back together from one measured point.</p></div><div class="physical-badge">${icon('measure')}<span>Real dimensions.<br><strong>Paper, not a projector.</strong></span></div></section>
  <div class="status-note ${messageKind}" role="status" aria-live="polite"><i></i><span>${h(message)}</span>${building ? '<span class="building-indicator"><i class="spinner"></i> PREPARING SURFACES</span>' : '<span class="local-label">LOCAL IMAGES · NO UPLOADS</span>'}</div>
  <div class="studio-layout"><aside class="settings-sidebar"><section class="source-panel panel"><div class="panel-heading"><h2><span>01</span> The image</h2><span class="micro-tag">${project.source.width} × ${project.source.height}</span></div><label class="field-label" for="project-name">PROJECT NAME</label><input id="project-name" aria-label="Project name" data-field="name" value="${h(project.name)}" maxlength="120"><div class="source-preview"><img data-testid="source-image" src="${h(project.source.dataUrl)}" width="${project.source.width}" height="${project.source.height}" alt="Source artwork before projection"></div><button class="upload-button" data-action="upload" ${building ? 'disabled' : ''}>${icon('upload')} Upload image <span>PNG · JPEG · WEBP</span></button><p class="field-hint">Up to 8 MiB, 4,096 pixels per side and 12 megapixels. Raster images only.</p><div class="text-maker"><label class="field-label" for="artwork-text">OR MAKE SOMETHING WITH WORDS</label><div><input id="artwork-text" aria-label="Artwork text" value="${h(textValue)}" maxlength="60"><button class="button outline small" data-action="text" ${building ? 'disabled' : ''}>Create text</button></div></div></section>
  <section class="geometry-panel panel"><div class="panel-heading"><h2><span>02</span> The corner</h2><span class="micro-tag">90° / TWO PLANES</span></div><div class="surface-drawing" aria-hidden="true"><svg viewBox="0 0 250 116" fill="none"><path d="m37 64 90 34 89-37-89-29-90 32Z" fill="#dbe6df" stroke="#92b2a8"/><path d="m37 64 90-32V5L37 32v32Z" fill="#f1eee4" stroke="#9ab4aa"/><path d="m37 64 90-32" stroke="#4a9293" stroke-width="2"/><text x="57" y="91" font-size="9" fill="#77998c" font-family="monospace">FLOOR</text><text x="75" y="34" font-size="9" fill="#77998c" font-family="monospace">WALL</text></svg></div><div class="measurement-fields">${numericField('Surface width', 'surfaceWidth', project.surfaceWidth, 100, 1800)}${numericField('Floor depth', 'floorDepth', project.floorDepth, 100, 1500)}${numericField('Wall height', 'wallHeight', project.wallHeight, 100, 1500)}</div><p class="field-hint">Measure the real corner in millimeters. Wall and floor meet at the seam.</p></section>
  <section class="camera-panel panel"><div class="panel-heading"><h2><span>03</span> The viewpoint</h2>${icon('camera')}</div><div class="measurement-fields">${numericField('Lateral offset (+ left)', 'cameraX', project.cameraX, -2000, 2000)}${numericField('Distance from wall', 'cameraDistance', project.cameraDistance, 100, 5000)}${numericField('Height above floor', 'cameraHeight', project.cameraHeight, 100, 5000)}</div><p class="field-hint">The camera looks toward the center of the seam. Positive offset moves the viewing point left when you face the wall.</p><div class="output-settings">${numericField('Artwork width', 'designWidth', project.designWidth, 50, 1600)}<label>Requested print resolution<span>DPI</span><input aria-label="Requested print resolution in DPI" data-field="dpi" type="number" min="40" max="150" step="1" value="${project.dpi}"></label><label class="auto-fit"><input aria-label="Auto-fit artwork to surfaces" data-field="autoFit" type="checkbox" ${project.autoFit ? 'checked' : ''}> Auto-fit artwork to the surfaces</label><p class="field-hint">Auto-fit can shrink the projected design. The raster budget can reduce effective DPI.</p></div><button class="button primary update-button" data-action="rebuild" ${building ? 'disabled' : ''}>${building ? '<i class="spinner"></i> Preparing…' : `Update projection ${icon('arrow')}`}</button></section></aside>
  <section class="preview-workspace"><section class="spatial-panel panel"><div class="spatial-heading"><div><p class="eyebrow">04 / SEE BOTH SIDES</p><h2>The image meets the corner.</h2></div><span class="preview-label">TRUE 3D PREVIEW</span></div><div class="view-toolbar" role="group" aria-label="Preview viewpoint"><button class="view-button ${viewMode === 'camera' ? 'active' : ''}" data-action="view" data-view="camera" aria-pressed="${viewMode === 'camera'}" ${!raster ? 'disabled' : ''}>${icon('camera')} Camera view</button><button class="view-button ${viewMode === 'overview' ? 'active' : ''}" data-action="view" data-view="overview" aria-pressed="${viewMode === 'overview'}" ${!raster ? 'disabled' : ''}>${icon('orbit')} Orbit overview</button><span>Drag to orbit · scroll to zoom</span></div><div class="corner-preview" data-testid="corner-preview" id="corner-preview"><span class="preview-corner top-left"></span><span class="preview-corner top-right"></span><span class="preview-corner bottom-left"></span><span class="preview-corner bottom-right"></span>${!raster ? `<div class="preview-empty">${icon('image')}<strong>${building ? 'Preparing the two surfaces…' : 'Your corner is ready for an image.'}</strong><p>${building ? 'The same raster textures will power this preview and the print sheets.' : 'Update the projection to inspect the result.'}</p></div>` : ''}</div><div class="view-caption"><span><i></i>${viewMode === 'camera' ? 'The measured point reconstructs your image.' : 'The overview reveals the split across both surfaces.'}</span><span>WALL y=0 / FLOOR z=0</span></div><div class="projection-summary" data-testid="projection-summary"><div><span>EFFECTIVE RASTER DPI</span><strong>${raster ? number(raster.effectiveDpi) : '—'}</strong><small>Requested ${project.dpi} DPI</small></div><div><span>ARTWORK FIT SCALE</span><strong>${raster ? number(raster.projection.fitScale * 100) : '—'}<i>${raster ? '%' : ''}</i></strong><small>Relative to requested width</small></div><div><span>CLIPPED SOURCE ESTIMATE</span><strong>${raster ? number(raster.clippedFraction * 100) : '—'}<i>${raster ? '%' : ''}</i></strong><small>Review the surface previews</small></div></div></section>
  <section class="surfaces-panel panel"><div class="panel-heading"><div><p class="eyebrow">05 / WHAT YOU WILL PRINT</p><h2>Two distorted pieces. One picture.</h2></div><span class="micro-tag">ACTUAL WARPED RASTERS</span></div><div class="surface-previews"><article><div class="surface-title"><strong>Floor</strong><span>${number(project.surfaceWidth)} × ${number(project.floorDepth)} mm</span></div><div class="surface-image-frame">${floorPng ? `<img data-testid="floor-preview" src="${floorPng}" width="${raster!.floor.width}" height="${raster!.floor.height}" alt="Warped floor artwork, with the seam at the top">` : '<span>FLOOR TEXTURE / WAITING</span>'}</div><div class="surface-foot"><span>↑ SEAM AT TOP</span><button class="text-button" data-action="floor" ${!raster || building ? 'disabled' : ''}>Download floor PNG ↗</button></div></article><article><div class="surface-title"><strong>Wall</strong><span>${number(project.surfaceWidth)} × ${number(project.wallHeight)} mm</span></div><div class="surface-image-frame">${wallPng ? `<img data-testid="wall-preview" src="${wallPng}" width="${raster!.wall.width}" height="${raster!.wall.height}" alt="Warped wall artwork, with the seam at the bottom">` : '<span>WALL TEXTURE / WAITING</span>'}</div><div class="surface-foot"><span>↓ SEAM AT BOTTOM</span><button class="text-button" data-action="wall" ${!raster || building ? 'disabled' : ''}>Download wall PNG ↗</button></div></article></div><div class="print-bar"><div>${icon('print')}<span><strong>Build the illusion at actual size.</strong><small>A4 tiles, surface measurements, placement guidance and a calibration ruler.</small></span></div><button class="button primary" data-action="print" ${!raster || building ? 'disabled' : ''}>Print A4 sheets ${icon('arrow')}</button></div></section><div class="physical-note"><span>BEFORE YOU CUT / A REAL-WORLD CHECK</span><p>Use a 90° corner, print at 100%, and verify the ruler. Match the measured camera position. Paper alignment, surface flatness and lens perspective affect the physical result.</p></div></section></div>
  <footer class="site-footer"><span><i></i> The trick is where you stand.</span><span>MIT © ufodia <a href="${import.meta.env.BASE_URL}licenses/three.txt" target="_blank" rel="noopener noreferrer">Three.js license ↗</a> <a href="https://github.com/ufodia/impossible-print" target="_blank" rel="noopener noreferrer">View source ↗</a></span></footer></main><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload artwork image" hidden><input id="project-file" type="file" accept="application/json,.json" aria-label="Import project" hidden>`;
  bindEvents();
  if (raster && floorCanvas && wallCanvas) {
    const container = document.getElementById('corner-preview')!;
    const currentProject = project,
      currentRaster = raster,
      floor = floorCanvas,
      wall = wallCanvas;
    void import('./preview')
      .then(({ CornerPreview: Preview }) => {
        if (previewGeneration !== previewEpoch || !container.isConnected) return;
        preview = new Preview(
          container,
          currentProject,
          currentRaster.projection,
          floor,
          wall,
          viewMode,
          () => {
            viewMode = 'overview';
            showViewState();
          },
        );
      })
      .catch(() => {
        if (previewGeneration !== previewEpoch || !container.isConnected) return;
        container.innerHTML = `<div class="preview-empty fallback"><span class="fallback-symbol">${icon('image')}</span><strong>3D preview is unavailable in this browser.</strong><p>The two surface previews and actual-size print sheets still work. Enable WebGL in a compatible browser to inspect the spatial view.</p></div>`;
      });
  }
}

async function importImage(file: File): Promise<void> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG or WebP image. SVG and remote images are not accepted.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Use an image no larger than 8 MiB.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
  const metadata = inspectRaster(data);
  const source: SourceImage = { dataUrl: data, width: metadata.width, height: metadata.height };
  validateProject({ ...project, source });
  const pixels = await decodeSource(source);
  project = validateProject({ ...project, source });
  sourcePixels = pixels;
  sourceKey = data;
  unsaved = true;
  await rebuild();
}
function bindEvents(): void {
  root!.onclick = (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    void (async () => {
      try {
        if (action === 'sample') {
          if (unsaved && !window.confirm('Replace this unsaved project with the original sample?'))
            return;
          project = sampleProject(makeArtwork('THE OTHER SIDE', true));
          sourcePixels = null;
          sourceKey = '';
          unsaved = false;
          textValue = 'THE OTHER SIDE';
          viewMode = 'camera';
          await rebuild();
          return;
        }
        if (action === 'upload') {
          document.getElementById('image-file')!.click();
          return;
        }
        if (action === 'open') {
          document.getElementById('project-file')!.click();
          return;
        }
        if (action === 'save') {
          download(
            JSON.stringify(validateProject(project), null, 2),
            `${slug()}.impossible-print.json`,
            'application/json',
          );
          unsaved = false;
          tell('Project downloaded with its source image and physical measurements.', 'success');
          render();
          return;
        }
        if (action === 'text') {
          textValue = (document.getElementById('artwork-text') as HTMLInputElement).value.trim();
          if (!textValue) throw new Error('Enter a few words to turn into an image.');
          project = validateProject({ ...project, source: makeArtwork(textValue) });
          sourcePixels = null;
          sourceKey = '';
          unsaved = true;
          await rebuild();
          return;
        }
        if (action === 'rebuild') {
          await rebuild();
          return;
        }
        if (action === 'view') {
          viewMode = button.dataset.view as PreviewView;
          preview?.setView(viewMode);
          showViewState();
          return;
        }
        if (action === 'floor' && raster) {
          savePng(floorPng, `${slug()}-floor.png`);
          tell('Floor PNG downloaded. Its first row is the seam edge.', 'success');
          render();
          return;
        }
        if (action === 'wall' && raster) {
          savePng(wallPng, `${slug()}-wall.png`);
          tell('Wall PNG downloaded. Its last row is the seam edge.', 'success');
          render();
          return;
        }
        if (action === 'print' && raster) {
          const html = printPlanHtml(
            validateProject(project),
            { floorDataUrl: floorPng, wallDataUrl: wallPng },
            raster.projection,
          );
          const popup = window.open('', '_blank', 'width=1000,height=800');
          if (!popup) throw new Error('Allow pop-up windows to open the measured print plan.');
          popup.opener = null;
          popup.document.open();
          popup.document.write(html);
          popup.document.close();
          tell(
            'Print plan opened. Use actual size / 100% and verify the calibration ruler before assembly.',
            'success',
          );
          render();
        }
      } catch (error) {
        tell(
          error instanceof Error ? error.message : 'That action could not be completed.',
          'error',
        );
        render();
      }
    })();
  };
  root!.onchange = (event) => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'artwork-text') {
      textValue = input.value;
      return;
    }
    const field = input.dataset.field;
    if (!field) return;
    try {
      const value =
        field === 'name'
          ? input.value.trim()
          : field === 'autoFit'
            ? input.checked
            : Number(input.value);
      project = validateProject({ ...project, [field]: value });
      unsaved = true;
      if (field === 'name') {
        tell('Project renamed. Save a file to keep the measurements and artwork.');
        render();
      } else void rebuild();
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Check that measurement.', 'error');
      render();
    }
  };
  document.getElementById('image-file')!.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file)
      void importImage(file).catch((error) => {
        tell(error instanceof Error ? error.message : 'Could not open that image.', 'error');
        render();
      });
  });
  document.getElementById('project-file')!.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 13 * 1024 * 1024) {
      tell('Project files must be smaller than 13 MiB.', 'error');
      render();
      return;
    }
    void file
      .text()
      .then(async (text) => {
        const imported = validateProject(JSON.parse(text));
        const decoded = await decodeSource(imported.source);
        if (unsaved && !window.confirm('Replace this unsaved project with the imported file?'))
          return;
        project = imported;
        sourcePixels = decoded;
        sourceKey = imported.source.dataUrl;
        unsaved = false;
        viewMode = 'camera';
        await rebuild();
      })
      .catch((error) => {
        tell(error instanceof Error ? error.message : 'Could not open the project.', 'error');
        render();
      });
  });
}

window.addEventListener('beforeunload', (event) => {
  if (unsaved) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  ++rebuildEpoch;
  ++previewEpoch;
  preview?.dispose();
  preview = null;
  sourcePixels = null;
  floorCanvas = null;
  wallCanvas = null;
});
render();
void rebuild();
