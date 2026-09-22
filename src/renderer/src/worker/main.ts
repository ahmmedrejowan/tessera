import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import type { RenderJob, RenderResult } from '@shared/types';
import { readPsd } from 'ag-psd';
import UTIF from 'utif';
import { fitSvg } from '../svg';
import { disposeObject, frame, loadModel } from '../three/loadModel';

declare global {
  interface Window {
    renderBridge: { onJob(l: (job: RenderJob) => void): void; done(r: RenderResult): void };
  }
}

/**
 * The hidden render window. It draws one picture per job and hands back WebP bytes. Waveforms and
 * font samples are drawn white on transparent: the app uses them as masks and tints them with the
 * theme, so they suit light and dark alike.
 */

const SUPERSAMPLE = 2;
let renderer: THREE.WebGLRenderer | null = null;
let envMap: THREE.Texture | null = null;

function gl(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

/** Scale a canvas down to `size` on its longest edge and encode it as WebP. */
async function encode(source: HTMLCanvasElement | ImageBitmap | OffscreenCanvas, size: number): Promise<Uint8Array> {
  const scale = Math.min(1, size / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const out = new OffscreenCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  const blob = await out.convertToBlob({ type: 'image/webp', quality: 0.86 });
  return new Uint8Array(await blob.arrayBuffer());
}

async function drawModel(job: RenderJob): Promise<Uint8Array> {
  const r = gl();
  const px = job.size * SUPERSAMPLE;
  r.setSize(px, px, false);
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = 0.9;
  // Lights for the older material types (FBX, OBJ) that ignore the environment.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(3, 5, 4);
  scene.add(key);
  const model = await loadModel(job.url, job.ext, job.textures);
  try {
    scene.add(model);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    frame(model, camera);
    r.render(scene, camera);
    return await encode(r.domElement, job.size);
  } finally {
    disposeObject(model);
  }
}

async function drawImage(job: RenderJob): Promise<Uint8Array> {
  if (job.ext === 'tga') {
    const tex = await new TGALoader().loadAsync(job.url);
    const img = tex.image as { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
    const canvas = new OffscreenCanvas(img.width, img.height);
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    tex.dispose();
    // TGA rows are stored bottom-up.
    const flipped = new OffscreenCanvas(img.width, img.height);
    const fctx = flipped.getContext('2d')!;
    fctx.scale(1, -1);
    fctx.drawImage(canvas, 0, -img.height);
    return encode(flipped, job.size);
  }
  if (job.ext === 'svg') return drawSvg(job);
  if (job.ext === 'tif' || job.ext === 'tiff' || job.ext === 'psd') return encode(await decodeRaster(job), job.size);
  const blob = await (await fetch(job.url)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    return await encode(bitmap, job.size);
  } finally {
    bitmap.close();
  }
}

/** TIFF and PSD, which the browser can't decode itself: decoded in script to plain pixels. */
async function decodeRaster(job: RenderJob): Promise<OffscreenCanvas> {
  const bytes = await (await fetch(job.url)).arrayBuffer();
  let width: number;
  let height: number;
  let rgba: Uint8ClampedArray;
  if (job.ext === 'psd') {
    // The flattened image Photoshop stores alongside the layers.
    const psd = readPsd(bytes, { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
    if (!psd.imageData) throw new Error('the PSD has no flattened image');
    ({ width, height } = psd.imageData);
    rgba = new Uint8ClampedArray(psd.imageData.data.buffer, psd.imageData.data.byteOffset, psd.imageData.data.byteLength);
  } else {
    const ifds = UTIF.decode(bytes);
    const first = ifds[0];
    if (!first) throw new Error('the TIFF has no image');
    UTIF.decodeImage(bytes, first);
    width = first.width;
    height = first.height;
    rgba = new Uint8ClampedArray(UTIF.toRGBA8(first));
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

/** SVGs at thumbnail size, measured first so ones without a viewBox draw whole. */
async function drawSvg(job: RenderJob): Promise<Uint8Array> {
  // A little room around the drawing, as raster icons usually have.
  const { svg, width, height } = fitSvg(await (await fetch(job.url)).text(), 0.06);
  const scale = job.size / Math.max(width, height);
  const img = new Image(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await img.decode();
    const canvas = new OffscreenCanvas(img.width, img.height);
    canvas.getContext('2d')!.drawImage(img, 0, 0, img.width, img.height);
    return await encode(canvas, job.size);
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** HDR and EXR images, tone-mapped for display. */
async function drawHdr(job: RenderJob): Promise<Uint8Array> {
  const tex = job.ext === 'exr' ? await new EXRLoader().loadAsync(job.url) : await new HDRLoader().loadAsync(job.url);
  const r = gl();
  const img = tex.image as { width: number; height: number };
  const scale = Math.min(1, (job.size * SUPERSAMPLE) / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  r.setSize(w, h, false);
  const prev = r.toneMapping;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true })));
  r.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  r.toneMapping = prev;
  tex.dispose();
  return encode(r.domElement, job.size);
}

/** A waveform: bars for the loudness across the sound, white on transparent. */
async function drawAudio(job: RenderJob): Promise<Uint8Array> {
  const bytes = await (await fetch(job.url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audio = await ctx.decodeAudioData(bytes);
  const bars = 48;
  const w = job.size;
  const h = Math.round(job.size * 0.5);
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  const data = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bars));
  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    const from = b * step;
    const to = Math.min(data.length, from + step);
    for (let i = from; i < to; i += 8) sum += data[i]! * data[i]!;
    peaks.push(Math.sqrt(sum / Math.max(1, (to - from) / 8)));
  }
  const max = Math.max(...peaks, 1e-4);
  const gap = w / bars;
  const barW = gap * 0.6;
  peaks.forEach((p, b) => {
    const bh = Math.max(barW, (p / max) * h * 0.94);
    const x = b * gap + (gap - barW) / 2;
    g.beginPath();
    g.roundRect(x, (h - bh) / 2, barW, bh, barW / 2);
    g.fill();
  });
  return encode(canvas, job.size);
}

/** A font sample: "Aa" in the font, white on transparent. */
async function drawFont(job: RenderJob): Promise<Uint8Array> {
  const family = `f${job.id}`;
  const face = new FontFace(family, `url("${job.url}")`);
  await face.load();
  document.fonts.add(face);
  try {
    const w = job.size;
    const h = Math.round(job.size * 0.62);
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = h * 0.78;
    g.font = `${px}px "${family}"`;
    const width = g.measureText('Aa').width;
    if (width > w * 0.9) {
      px *= (w * 0.9) / width;
      g.font = `${px}px "${family}"`;
    }
    g.fillText('Aa', w / 2, h / 2 + px * 0.04);
    return await encode(canvas, job.size);
  } finally {
    document.fonts.delete(face);
  }
}

const DRAW: Record<RenderJob['kind'], (job: RenderJob) => Promise<Uint8Array>> = {
  model: drawModel,
  image: drawImage,
  hdr: drawHdr,
  audio: drawAudio,
  font: drawFont,
};

// One job at a time: WebGL state is shared, and the main process already limits how many it sends.
let chain: Promise<void> = Promise.resolve();
window.renderBridge.onJob((job) => {
  chain = chain.then(async () => {
    try {
      window.renderBridge.done({ id: job.id, data: await DRAW[job.kind](job) });
    } catch (e) {
      window.renderBridge.done({ id: job.id, data: null, error: e instanceof Error ? e.message : String(e) });
    }
  });
});
