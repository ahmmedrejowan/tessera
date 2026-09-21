import CircularProgress from '@mui/material/CircularProgress';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { md, mdAlpha, SHAPE } from '../theme';

/** An HDRI as a sky you can look around in, with an exposure control. */
export function PanoramaView({ url, ext, onInfo }: { url: string; ext: string; onInfo?: (i: { width: number; height: number } | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [exposure, setExposure] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 10);
    camera.position.set(0, 0, 0.01);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = -0.35;
    controls.enableDamping = true;
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let texture: THREE.Texture | null = null;
    let cancelled = false;
    setState('loading');
    onInfo?.(null);
    (ext === 'exr' ? new EXRLoader() : new HDRLoader()).loadAsync(url).then(
      (tex) => {
        if (cancelled) return tex.dispose();
        texture = tex;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = tex;
        const img = tex.image as { width: number; height: number };
        onInfo?.({ width: img.width, height: img.height });
        setState('ready');
      },
      () => !cancelled && setState('error'),
    );
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      cancelled = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      texture?.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ext]);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.toneMappingExposure = 2 ** exposure;
  }, [exposure]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab' }} />
      {state === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <CircularProgress />
        </div>
      )}
      {state === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <Typography sx={{ color: md('onSurfaceVariant') }}>This image can't be shown here.</Typography>
        </div>
      )}
      <div style={{ position: 'absolute', left: 16, bottom: 16, width: 240, display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px', borderRadius: SHAPE.full, background: mdAlpha('surfaceContainerHigh', 0.92) }}>
        <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
          Exposure
        </Typography>
        <Slider size="small" min={-4} max={4} step={0.1} value={exposure} onChange={(_, v) => setExposure(v as number)} />
      </div>
    </div>
  );
}
