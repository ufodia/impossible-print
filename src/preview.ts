import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Project, Projection } from './core';

export type PreviewView = 'camera' | 'overview';

/** A disposable Z-up scene. Textures are the actual printable surface rasters. */
export class CornerPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 1, 30000);
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly cameraGuide = new THREE.Group();
  private readonly textures: THREE.Texture[] = [];
  private view: PreviewView = 'camera';
  private disposed = false;
  private readonly draw = (): void => {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  };
  private readonly manualOrbit = (): void => {
    if (this.view === 'camera') {
      this.view = 'overview';
      this.cameraGuide.visible = true;
      this.onManualOrbit?.();
    }
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly project: Project,
    private readonly projection: Projection,
    floor: HTMLCanvasElement,
    wall: HTMLCanvasElement,
    view: PreviewView = 'camera',
    private readonly onManualOrbit?: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setClearColor('#e6eeeb');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Three-dimensional floor and wall projection preview. Use the view buttons or drag to orbit.',
    );
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.append(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 18000;
    this.controls.addEventListener('change', this.draw);
    this.controls.addEventListener('start', this.manualOrbit);

    const { surfaceWidth: width, floorDepth: depth, wallHeight: height } = project;
    const backingMaterial = new THREE.MeshBasicMaterial({
      color: '#f8f5ec',
      side: THREE.DoubleSide,
    });
    const floorBacking = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), backingMaterial);
    floorBacking.position.set(0, depth / 2, -0.25);
    const wallBacking = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backingMaterial);
    wallBacking.rotation.x = Math.PI / 2;
    wallBacking.position.set(0, -0.25, height / 2);
    this.scene.add(floorBacking, wallBacking);

    const floorTexture = new THREE.CanvasTexture(floor);
    const wallTexture = new THREE.CanvasTexture(wall);
    for (const texture of [floorTexture, wallTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }
    this.textures.push(floorTexture, wallTexture);
    const floorGeometry = new THREE.PlaneGeometry(width, depth);
    const floorUv = floorGeometry.getAttribute('uv');
    // Raster row zero is the seam (y=0), rather than the front edge of the floor.
    for (let i = 0; i < floorUv.count; i++) {
      floorUv.setX(i, 1 - floorUv.getX(i));
      floorUv.setY(i, 1 - floorUv.getY(i));
    }
    floorUv.needsUpdate = true;
    const floorMesh = new THREE.Mesh(
      floorGeometry,
      new THREE.MeshBasicMaterial({ map: floorTexture, transparent: true, side: THREE.DoubleSide }),
    );
    floorMesh.position.set(0, depth / 2, 0.2);
    const wallGeometry = new THREE.PlaneGeometry(width, height);
    const wallUv = wallGeometry.getAttribute('uv');
    // Upright printed sheets run from world +X (left to the viewer) to world -X.
    for (let i = 0; i < wallUv.count; i++) wallUv.setX(i, 1 - wallUv.getX(i));
    wallUv.needsUpdate = true;
    const wallMesh = new THREE.Mesh(
      wallGeometry,
      new THREE.MeshBasicMaterial({ map: wallTexture, transparent: true, side: THREE.DoubleSide }),
    );
    wallMesh.rotation.x = Math.PI / 2;
    wallMesh.position.set(0, 0.2, height / 2);
    this.scene.add(floorMesh, wallMesh);

    const edges = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, 0, 0.7),
      new THREE.Vector3(width / 2, 0, 0.7),
      new THREE.Vector3(-width / 2, 0, 0.7),
      new THREE.Vector3(-width / 2, depth, 0.7),
      new THREE.Vector3(width / 2, 0, 0.7),
      new THREE.Vector3(width / 2, depth, 0.7),
      new THREE.Vector3(-width / 2, depth, 0.7),
      new THREE.Vector3(width / 2, depth, 0.7),
      new THREE.Vector3(-width / 2, 0.7, 0),
      new THREE.Vector3(-width / 2, 0.7, height),
      new THREE.Vector3(width / 2, 0.7, 0),
      new THREE.Vector3(width / 2, 0.7, height),
      new THREE.Vector3(-width / 2, 0.7, height),
      new THREE.Vector3(width / 2, 0.7, height),
    ]);
    this.scene.add(
      new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: '#8ba5a0', transparent: true, opacity: 0.65 }),
      ),
    );
    const seam = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, 1, 1),
      new THREE.Vector3(width / 2, 1, 1),
    ]);
    this.scene.add(new THREE.Line(seam, new THREE.LineBasicMaterial({ color: '#3a8e91' })));

    const point = new THREE.Vector3(project.cameraX, project.cameraDistance, project.cameraHeight);
    const guideLine = new THREE.BufferGeometry().setFromPoints([point, new THREE.Vector3(0, 0, 0)]);
    this.cameraGuide.add(
      new THREE.Line(
        guideLine,
        new THREE.LineDashedMaterial({ color: '#5a8fa4', dashSize: 13, gapSize: 8 }),
      ),
    );
    (this.cameraGuide.children[0] as THREE.Line).computeLineDistances();
    const pointMesh = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(width, depth, height) * 0.014, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#366a89' }),
    );
    pointMesh.position.copy(point);
    this.cameraGuide.add(pointMesh);
    this.scene.add(this.cameraGuide);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
    this.setView(view);
    this.resize();
  }

  setView(view: PreviewView): void {
    this.view = view;
    this.cameraGuide.visible = view === 'overview';
    if (view === 'camera') {
      const { camera, target } = this.projection;
      this.camera.position.set(camera.x, camera.y, camera.z);
      this.controls.target.set(target.x, target.y, target.z);
      this.setCameraFov();
    } else {
      const { surfaceWidth: width, floorDepth: depth, wallHeight: height } = this.project;
      this.controls.target.set(0, depth * 0.28, height * 0.28);
      this.camera.position.set(width * 1.05, depth * 1.55, height * 1.45);
      this.camera.fov = 45;
    }
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.draw();
  }

  private setCameraFov(): void {
    const visibleHeight =
      Math.max(
        this.projection.planeHeight,
        this.projection.planeWidth / Math.max(0.1, this.camera.aspect),
      ) * 1.28;
    const degrees =
      (2 * Math.atan(visibleHeight / (2 * this.projection.focalDistance)) * 180) / Math.PI;
    this.camera.fov = Math.max(5, Math.min(110, degrees));
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth),
      height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    if (this.view === 'camera') this.setCameraFov();
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.controls.removeEventListener('change', this.draw);
    this.controls.removeEventListener('start', this.manualOrbit);
    this.controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
