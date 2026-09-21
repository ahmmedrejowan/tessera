import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { VOXLoader, VOXMesh } from 'three/examples/jsm/loaders/VOXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const MODEL_EXTS = new Set(['glb', 'gltf', 'fbx', 'obj', 'dae', 'stl', 'ply', '3ds', 'usdz', 'vox']);

const fileOf = (url: string) => {
  const clean = decodeURIComponent(url.split(/[?#]/)[0]!);
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1);
};
const dirOf = (url: string) => url.slice(0, url.lastIndexOf('/') + 1);

/**
 * A loading manager that finds textures a model can't: models often point at the author's own
 * disk ("C:\Users\me\Textures\wood.png") or a folder that was renamed. Any image URL that isn't
 * a file in the pack is looked up by file name among the pack's images.
 */
interface TrackedManager extends THREE.LoadingManager {
  /** Resolves once every file the model asked for (textures included) has loaded or failed. */
  idle(timeoutMs: number): Promise<void>;
}

function manager(textures: Record<string, string> | undefined): TrackedManager {
  const m = new THREE.LoadingManager() as TrackedManager;
  // Some loaders (FBX, OBJ/MTL) return before their textures arrive; count what's in flight.
  let inFlight = 0;
  let waiters: (() => void)[] = [];
  const settle = () => {
    if (inFlight > 0) return;
    for (const w of waiters) w();
    waiters = [];
  };
  const start = m.itemStart.bind(m);
  const end = m.itemEnd.bind(m);
  const error = m.itemError.bind(m);
  m.itemStart = (url) => {
    inFlight++;
    start(url);
  };
  m.itemEnd = (url) => {
    inFlight--;
    end(url);
    settle();
  };
  m.itemError = (url) => {
    error(url);
  };
  m.idle = (timeoutMs) =>
    inFlight <= 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, timeoutMs);
        });
  const known = new Set(Object.values(textures ?? {}));
  m.setURLModifier((url) => {
    if (!textures || url.startsWith('data:') || url.startsWith('blob:') || known.has(url)) return url;
    const name = fileOf(url).toLowerCase();
    if (!/\.(png|jpe?g|webp|tga|bmp|gif)$/i.test(name)) return url;
    return textures[name] ?? textures[name.replace(/\.[^.]+$/, '.png')] ?? url;
  });
  m.addHandler(/\.tga$/i, new TGALoader(m));
  return m;
}

/** Plain material for formats that carry geometry only. */
const plain = () => new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.7, metalness: 0 });

/** Load a model, with its textures, into an object ready to add to a scene. */
export async function loadModel(url: string, ext: string, textures?: Record<string, string>): Promise<THREE.Object3D> {
  const m = manager(textures);
  const object = await parse(url, ext, m);
  await m.idle(15_000);
  return object;
}

async function parse(url: string, ext: string, m: TrackedManager): Promise<THREE.Object3D> {
  switch (ext) {
    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader(m);
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      // Other loaders hang animations on the object they return; do the same for glTF.
      gltf.scene.animations = gltf.animations;
      return gltf.scene;
    }
    case 'fbx':
      return new FBXLoader(m).loadAsync(url);
    case 'obj': {
      // The .mtl named inside the .obj gives its colours and textures.
      const text = await (await fetch(url)).text();
      const lib = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim();
      const obj = new OBJLoader(m);
      if (lib) {
        try {
          const mtl = new MTLLoader(m).setResourcePath(dirOf(url));
          const materials = await mtl.loadAsync(dirOf(url) + lib.split(/[\\/]/).map(encodeURIComponent).join('/'));
          materials.preload();
          obj.setMaterials(materials);
        } catch {
          // no usable .mtl: plain grey
        }
      }
      return obj.parse(text);
    }
    case 'dae': {
      const dae = await new ColladaLoader(m).loadAsync(url);
      if (!dae) throw new Error('the Collada file could not be read');
      return dae.scene;
    }
    case 'stl':
      return new THREE.Mesh(await new STLLoader(m).loadAsync(url), plain());
    case 'ply': {
      const geometry = await new PLYLoader(m).loadAsync(url);
      geometry.computeVertexNormals();
      const mat = plain();
      if (geometry.hasAttribute('color')) mat.vertexColors = true;
      return new THREE.Mesh(geometry, mat);
    }
    case '3ds':
      return new TDSLoader(m).loadAsync(url);
    case 'usdz':
      return new USDZLoader(m).loadAsync(url);
    case 'vox': {
      const chunks = await new VOXLoader(m).loadAsync(url);
      const group = new THREE.Group();
      for (const chunk of chunks as unknown as ConstructorParameters<typeof VOXMesh>[0][]) group.add(new VOXMesh(chunk));
      return group;
    }
    default:
      throw new Error(`.${ext} models can't be shown`);
  }
}

/** Free a loaded model's GPU memory. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/**
 * Where to put a camera to frame an object: looking down at it from the front-right, like a
 * product shot, far enough back that its bounding sphere fills the view.
 */
export function frame(object: THREE.Object3D, camera: THREE.PerspectiveCamera, fill = 0.92): { center: THREE.Vector3; radius: number } {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) throw new Error('the model has nothing to show');
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1e-4);
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / fill;
  const dir = new THREE.Vector3(1, 0.72, 1.15).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = Math.max(dist / 100, dist - radius * 4);
  camera.far = dist + radius * 4;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
  return { center: sphere.center, radius };
}
