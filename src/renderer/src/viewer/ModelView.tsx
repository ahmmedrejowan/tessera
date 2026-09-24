import Pause from '@mui/icons-material/Pause';
import PlayArrow from '@mui/icons-material/PlayArrow';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeObject, frame, loadModel } from '../three/loadModel';
import { md, mdAlpha, SHAPE } from '../theme';

export interface ModelStats {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  textures: number;
  /** Bounding box size in the model's units. */
  size: [number, number, number];
  animations: string[];
}

function measure(root: THREE.Object3D, animations: THREE.AnimationClip[]): ModelStats {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes++;
    const g = mesh.geometry;
    const count = g.attributes.position?.count ?? 0;
    vertices += count;
    triangles += g.index ? g.index.count / 3 : count / 3;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(m);
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const s = box.getSize(new THREE.Vector3());
  return { triangles: Math.round(triangles), vertices, meshes, materials: materials.size, textures: textures.size, size: [s.x, s.y, s.z], animations: animations.map((a) => a.name || 'Unnamed') };
}

type View = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; mixer: THREE.AnimationMixer | null };

/**
 * An interactive 3D view: drag to orbit, scroll to zoom, right-drag to pan. Plays the model's
 * animations when it has any. The floor grid is sized to the model so scale reads at a glance.
 */
export function ModelView({ url, ext, textures, dark, onStats }: { url: string; ext: string; textures: Record<string, string>; dark: boolean; onStats?: (s: ModelStats | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const clips = useRef<THREE.AnimationClip[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [anim, setAnim] = useState<string>('');
  const [playing, setPlaying] = useState(true);
  const [animations, setAnimations] = useState<string[]>([]);

  // One renderer for the life of the viewer.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setClearColor(0, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const v: View = { renderer, scene, camera, controls, mixer: null };
    view.current = v;
    const clock = new THREE.Clock();
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
      v.mixer?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => o !== scene && disposeObject(o));
      renderer.dispose();
      el.removeChild(renderer.domElement);
      view.current = null;
    };
  }, []);

  // Load the model whenever the file changes.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    let cancelled = false;
    let model: THREE.Object3D | null = null;
    let grid: THREE.GridHelper | null = null;
    setState('loading');
    onStats?.(null);
    void (async () => {
      try {
        const loaded = await loadModel(url, ext, textures);
        if (cancelled) {
          disposeObject(loaded);
          return;
        }
        model = loaded;
        v.scene.add(model);
        const { center, radius } = frame(model, v.camera, 0.8);
        v.controls.target.copy(center);
        v.controls.minDistance = radius * 0.2;
        v.controls.maxDistance = radius * 20;
        v.controls.update();
        // A floor under the model, a little wider than it, in its own units.
        const box = new THREE.Box3().setFromObject(model);
        const extent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.6 || 1;
        const step = 10 ** Math.floor(Math.log10(extent / 4));
        const cells = Math.max(2, Math.ceil(extent / step));
        grid = new THREE.GridHelper(cells * step, cells, dark ? 0x5a6470 : 0xa0a8b0, dark ? 0x323a42 : 0xd6dade);
        grid.position.set(center.x, box.min.y, center.z);
        (grid.material as THREE.Material).transparent = true;
        (grid.material as THREE.Material).opacity = 0.7;
        v.scene.add(grid);
        const found = ((model as THREE.Object3D & { animations?: THREE.AnimationClip[] }).animations ?? []).filter((c) => c.duration > 0);
        clips.current = found;
        v.mixer = found.length ? new THREE.AnimationMixer(model) : null;
        setAnimations(found.map((c) => c.name || 'Unnamed'));
        setAnim(found.length ? '0' : '');
        onStats?.(measure(model, found));
        setState('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
      v.mixer?.stopAllAction();
      v.mixer = null;
      if (model) {
        v.scene.remove(model);
        disposeObject(model);
      }
      if (grid) {
        v.scene.remove(grid);
        grid.geometry.dispose();
        (grid.material as THREE.Material).dispose();
      }
    };
    // `textures` is rebuilt with the asset; the URL identifies the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ext]);

  // Play the chosen animation.
  useEffect(() => {
    const v = view.current;
    if (!v?.mixer) return;
    v.mixer.stopAllAction();
    const clip = clips.current[Number(anim)];
    if (clip) {
      const action = v.mixer.clipAction(clip);
      action.paused = !playing;
      action.play();
    }
  }, [anim, playing, state]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab' }} />
      {state === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <CircularProgress />
        </div>
      )}
      {state === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}>
          <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant'), maxWidth: 420 }}>
            This model can't be shown here. {error}
          </Typography>
        </div>
      )}
      {animations.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: SHAPE.full,
            background: mdAlpha('surfaceContainerHigh', 0.92),
            backdropFilter: 'blur(8px)',
          }}
        >
          <Tooltip title={playing ? 'Pause' : 'Play'}>
            <IconButton aria-label="Play or pause" size="small" onClick={() => setPlaying(!playing)}>
              {playing ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Select
            variant="standard"
            disableUnderline
            value={anim}
            onChange={(e) => setAnim(e.target.value)}
            sx={{ minWidth: 160, typography: 'labelLarge' }}
            MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
          >
            {animations.map((name, i) => (
              <MenuItem key={i} value={String(i)}>
                {name}
              </MenuItem>
            ))}
          </Select>
          <Typography variant="labelSmall" sx={{ color: md('onSurfaceVariant'), pr: 1 }}>
            {animations.length} animation{animations.length > 1 ? 's' : ''}
          </Typography>
        </div>
      )}
    </div>
  );
}
