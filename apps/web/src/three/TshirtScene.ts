// Scène 3D maison : T-shirt procédural + impression projetée sur les coordonnées du tissu.
// Aucune bibliothèque de mockup, aucun modèle importé : tout est généré par le code du projet.
import * as THREE from 'three';
import { buildTshirt, luminance, type PreviewView, type PrintZone, type ProductDef, type TshirtModel } from '@dprinting/core';
import { createContactShadow, createFabricMaps, createStudioEnvironment } from './fabric';

export type PrintPanel = {
  canvas: HTMLCanvasElement;
  /** Rectangle de la zone dans le repère du panneau, en millimètres (u vers la droite, v vers le bas depuis le col). */
  rect: { uMin: number; uMax: number; vMin: number; vMax: number };
};

const BACKGROUND = '#efece5';
const FOV = 27;
const TARGET_Y = 348;

export class TshirtScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 10, 8000);
  private model: TshirtModel;
  private group = new THREE.Group();

  private fabric: ReturnType<typeof createFabricMaps>;
  private env: THREE.Texture;
  private normalFront: THREE.Texture;
  private normalBack: THREE.Texture;
  private normalPlain: THREE.Texture;

  private bodyMaterial: THREE.MeshPhysicalMaterial;
  private sleeveMaterial: THREE.MeshPhysicalMaterial;
  private collarMaterial: THREE.MeshPhysicalMaterial;
  private frontMaterial: THREE.MeshPhysicalMaterial;
  private backMaterial: THREE.MeshPhysicalMaterial;

  private frontPrint: THREE.CanvasTexture;
  private backPrint: THREE.CanvasTexture;
  private frontUniforms: Record<string, THREE.IUniform> = {};
  private backUniforms: Record<string, THREE.IUniform> = {};
  private frontState = { zone: new THREE.Vector4(0, 0, 1, 1), panel: new THREE.Vector4(-1, 1, 0, 1), has: false };
  private backState = { zone: new THREE.Vector4(0, 0, 1, 1), panel: new THREE.Vector4(-1, 1, 0, 1), has: false };
  private shadow: THREE.Mesh;

  private dirty = true;
  private frame = 0;
  private disposed = false;
  private width = 1;
  private height = 1;
  private dpr = 1;

  private view: PreviewView = 'face';
  private azimuth = 0;
  private elevation = 0.1;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
  };
  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.azimuth -= dx * 0.0062;
    this.elevation = Math.max(-0.16, Math.min(0.42, this.elevation + dy * 0.0032));
    this.dirty = true;
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grab';
  };
  private readonly onResize = () => this.resize();

  constructor(private readonly canvas: HTMLCanvasElement, productColor = '#f5f5f2') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(BACKGROUND);

    this.fabric = createFabricMaps(256);
    this.env = createStudioEnvironment(this.renderer);
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.75;

    this.normalFront = this.fabric.normalMap.clone();
    this.normalFront.repeat.set(15, 19);
    this.normalFront.needsUpdate = true;
    this.normalBack = this.fabric.normalMap.clone();
    this.normalBack.repeat.set(15, 19);
    this.normalBack.needsUpdate = true;
    this.normalPlain = this.fabric.normalMap.clone();
    this.normalPlain.repeat.set(9, 9);
    this.normalPlain.needsUpdate = true;

    this.bodyMaterial = this.makeMaterial(productColor, this.normalPlain);
    this.sleeveMaterial = this.makeMaterial(productColor, this.normalPlain);
    this.collarMaterial = this.makeMaterial(productColor, this.normalPlain);
    this.collarMaterial.color.offsetHSL(0, 0, -0.035);
    this.collarMaterial.roughness = 0.86;

    this.frontPrint = this.makePrintTexture();
    this.backPrint = this.makePrintTexture();
    this.frontMaterial = this.makeMaterial(productColor, this.normalFront);
    this.backMaterial = this.makeMaterial(productColor, this.normalBack);
    this.attachPrint(this.frontMaterial, this.frontPrint, this.frontUniforms, this.frontState);
    this.attachPrint(this.backMaterial, this.backPrint, this.backUniforms, this.backState);

    this.model = buildTshirt({ folds: true });
    this.buildMeshes();
    this.addLights();

    const shadowTex = createContactShadow();
    const shadowGeo = new THREE.PlaneGeometry(1050, 560);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 1.5;
    this.scene.add(this.shadow);

    this.scene.add(this.group);
    this.setView('face');
    this.resize();
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'pan-y';
    this.loop();
  }

  get supported(): boolean {
    return Boolean(this.renderer.getContext());
  }

  // ---------------------------------------------------------------- matières
  private makeMaterial(color: string, normalMap: THREE.Texture): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: 0.93,
      metalness: 0,
      normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: this.fabric.roughnessMap,
      sheen: 0.55,
      sheenRoughness: 0.9,
      sheenColor: new THREE.Color('#ffffff'),
      envMapIntensity: 0.8,
    });
  }

  private makePrintTexture(): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(document.createElement('canvas'));
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.premultiplyAlpha = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Injection de l'impression dans le shader standard : on projette le canvas de la zone sur les
   * coordonnées du tissu. Pas de décalage possible entre l'éditeur, la 3D et le fichier d'impression.
   */
  private attachPrint(
    material: THREE.MeshPhysicalMaterial,
    texture: THREE.CanvasTexture,
    uniforms: Record<string, THREE.IUniform>,
    state: { zone: THREE.Vector4; panel: THREE.Vector4; has: boolean },
  ): void {
    material.customProgramCacheKey = () => 'dprinting-print-v1';
    material.onBeforeCompile = shader => {
      shader.uniforms.dpPrintMap = { value: texture };
      // Les mêmes objets Vector4 sont partagés avec l'état : une mise à jour est vue par le GPU.
      shader.uniforms.dpZone = { value: state.zone };
      shader.uniforms.dpPanel = { value: state.panel };
      shader.uniforms.dpHasPrint = { value: state.has ? 1 : 0 };
      Object.assign(uniforms, shader.uniforms);

      shader.vertexShader = `attribute vec2 dpUv;\nvarying vec2 vDpUv;\n${shader.vertexShader}`.replace(
        'void main() {',
        'void main() {\n  vDpUv = dpUv;',
      );

      shader.fragmentShader = `
        uniform sampler2D dpPrintMap;
        uniform vec4 dpZone;
        uniform vec4 dpPanel;
        uniform float dpHasPrint;
        varying vec2 vDpUv;
        float dpInk = 0.0;
        ${shader.fragmentShader}`
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            float dpU = dpPanel.x + vDpUv.x * (dpPanel.y - dpPanel.x);
            float dpV = dpPanel.w - vDpUv.y * (dpPanel.w - dpPanel.z);
            vec2 dpS = vec2(
              (dpU - dpZone.x) / max(0.0001, dpZone.z - dpZone.x),
              (dpV - dpZone.y) / max(0.0001, dpZone.w - dpZone.y)
            );
            float dpInside = step(0.0, dpS.x) * step(dpS.x, 1.0) * step(0.0, dpS.y) * step(dpS.y, 1.0);
            vec4 dpC = texture2D(dpPrintMap, dpS);
            dpInk = dpC.a * dpInside * dpHasPrint;
            // L'encre recouvre le tissu : la couleur est remplacée, l'éclairage reste celui du vêtement.
            diffuseColor.rgb = mix(diffuseColor.rgb, dpC.rgb, dpInk);
          }`,
        )
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.55, dpInk);`);
    };
  }

  private buildMeshes(): void {
    const { model } = this;
    const add = (data: TshirtModel['front'] | TshirtModel['sleeveLeft'], material: THREE.Material) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      geometry.setAttribute('uv1', new THREE.BufferAttribute(data.uvs2, 2));
      geometry.setAttribute('dpUv', new THREE.BufferAttribute(data.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    add(model.front, this.frontMaterial);
    add(model.back, this.backMaterial);
    add(model.sleeveLeft, this.sleeveMaterial);
    add(model.sleeveRight, this.sleeveMaterial);
    add(model.collar, this.collarMaterial);
    // Corps intérieur (le maillage devant/dos est ouvert sur les côtés) : un manchon sombre évite de voir à travers.
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(238, 246, 648, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2a2a'), roughness: 1, side: THREE.BackSide }),
    );
    inner.position.y = 324;
    inner.scale.z = 0.44;
    this.group.add(inner);
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight('#fffaf0', '#6d6459', 1.35);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff6e6', 2.5);
    key.position.set(520, 980, 720);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.85);
    fill.position.set(-680, 420, 520);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 1.1);
    rim.position.set(0, 620, -900);
    this.scene.add(rim);
    const under = new THREE.DirectionalLight('#fff1dd', 0.35);
    under.position.set(0, -200, 400);
    this.scene.add(under);
  }

  // ---------------------------------------------------------------- données
  setColor(hex: string): void {
    const color = new THREE.Color(hex);
    for (const m of [this.bodyMaterial, this.frontMaterial, this.backMaterial, this.sleeveMaterial]) m.color.copy(color);
    this.collarMaterial.color.copy(color).offsetHSL(0, 0, -0.04);
    const l = luminance(hex);
    for (const m of [this.bodyMaterial, this.frontMaterial, this.backMaterial, this.sleeveMaterial, this.collarMaterial]) {
      m.sheen = 0.35 + 0.3 * (1 - l);
      m.envMapIntensity = 0.55 + 0.5 * l;
    }
    this.dirty = true;
  }

  /** Associe les zones réellement imprimées (une par panneau) et les rectangles physiques correspondants. */
  setPrint(product: ProductDef, panels: Partial<Record<'front' | 'back', PrintPanel>>): void {
    const apply = (
      zoneId: 'front' | 'back',
      texture: THREE.CanvasTexture,
      uniforms: Record<string, THREE.IUniform>,
      state: { zone: THREE.Vector4; panel: THREE.Vector4; has: boolean },
    ) => {
      const zone = product.zones.find(z => z.panel === zoneId) as PrintZone | undefined;
      const panel = panels[zoneId];
      if (!zone || !panel) {
        state.has = false;
        if (uniforms.dpHasPrint) uniforms.dpHasPrint.value = 0;
        return;
      }
      texture.image = panel.canvas;
      texture.needsUpdate = true;
      state.zone.set(panel.rect.uMin, panel.rect.vMin, panel.rect.uMax, panel.rect.vMax);
      const ext = zoneId === 'front' ? this.model.front.extents : this.model.back.extents;
      state.panel.set(ext.uMin, ext.uMax, ext.vMin, ext.vMax);
      state.has = true;
      if (uniforms.dpHasPrint) uniforms.dpHasPrint.value = 1;
    };
    apply('front', this.frontPrint, this.frontUniforms, this.frontState);
    apply('back', this.backPrint, this.backUniforms, this.backState);
    this.dirty = true;
  }

  setView(view: PreviewView): void {
    this.view = view;
    this.azimuth = view === 'face' ? 0 : view === 'back' ? Math.PI : view === 'right' ? Math.PI / 2 : -Math.PI / 2;
    this.elevation = view === 'face' || view === 'back' ? 0.1 : 0.06;
    this.dirty = true;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private placeCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
    camera.fov = FOV;
    camera.aspect = aspect;
    const tanV = Math.tan((FOV / 2) * (Math.PI / 180));
    const halfH = 372;
    // Largeur projetée du vêtement selon l'angle : le corps est large, les profils sont fins.
    const halfW = 472 * Math.abs(Math.cos(this.azimuth)) + 128 * Math.abs(Math.sin(this.azimuth));
    const distV = halfH / tanV;
    const distH = halfW / (tanV * Math.max(0.3, aspect));
    const dist = Math.max(distV, distH) * 1.055;
    const cosEl = Math.cos(this.elevation);
    camera.position.set(
      Math.sin(this.azimuth) * cosEl * dist,
      TARGET_Y + Math.sin(this.elevation) * dist,
      Math.cos(this.azimuth) * cosEl * dist,
    );
    camera.lookAt(0, TARGET_Y, 0);
    camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    this.placeCamera(this.camera, this.width / this.height);
    this.shadow.visible = this.elevation < 0.35;
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Rend les quatre vues fixes en haute résolution dans un second contexte WebGL puis renvoie des PNG.
   * Le rendu visible n'est ni redimensionné ni perturbé.
   */
  async capture(views: readonly PreviewView[], width = 1600, height = 2000): Promise<Record<PreviewView, Blob>> {
    const temp = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    temp.setPixelRatio(1);
    temp.setSize(width, height, false);
    temp.outputColorSpace = THREE.SRGBColorSpace;
    temp.toneMapping = THREE.ACESFilmicToneMapping;
    temp.toneMappingExposure = 1.06;
    const camera = new THREE.PerspectiveCamera(FOV, width / height, 10, 8000);
    const previousEnv = this.scene.environment;
    const env = createStudioEnvironment(temp);
    this.scene.environment = env;
    const previousAz = this.azimuth, previousEl = this.elevation;
    const out: Partial<Record<PreviewView, Blob>> = {};
    try {
      for (const view of views) {
        this.azimuth = view === 'face' ? 0 : view === 'back' ? Math.PI : view === 'right' ? Math.PI / 2 : -Math.PI / 2;
        this.elevation = view === 'face' || view === 'back' ? 0.1 : 0.06;
        this.placeCamera(camera, width / height);
        temp.render(this.scene, camera);
        const blob = await new Promise<Blob>((resolve, reject) => {
          temp.domElement.toBlob(b => (b ? resolve(b) : reject(new Error('Aperçu PNG impossible.'))), 'image/png');
        });
        out[view] = blob;
      }
    } finally {
      this.azimuth = previousAz;
      this.elevation = previousEl;
      this.scene.environment = previousEnv;
      env.dispose();
      temp.dispose();
      this.dirty = true;
    }
    return out as Record<PreviewView, Blob>;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const material = obj.material;
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material.dispose();
      }
    });
    this.fabric.normalMap.dispose();
    this.fabric.roughnessMap.dispose();
    this.normalFront.dispose();
    this.normalBack.dispose();
    this.normalPlain.dispose();
    this.frontPrint.dispose();
    this.backPrint.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}
