/**
 * Make an SVG drawable at any size. Many icon-pack SVGs have no viewBox, and some (exported from
 * Flash) draw around the origin with no size at all, so an <img> shows a corner of them. The
 * drawing is measured in the page and given a viewBox that fits it.
 */
export function fitSvg(text: string, pad = 0): { svg: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('not an SVG');
  const num = (v: string | null) => (v && !v.trim().endsWith('%') ? Number.parseFloat(v) : NaN);
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  let box = vb?.length === 4 && vb.every(Number.isFinite) ? { x: vb[0]!, y: vb[1]!, w: vb[2]!, h: vb[3]! } : null;
  if (!box) {
    // Measure what's actually drawn.
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
    const live = document.importNode(root, true) as unknown as SVGSVGElement;
    live.removeAttribute('width');
    live.removeAttribute('height');
    host.appendChild(live);
    document.body.appendChild(host);
    try {
      const b = live.getBBox();
      const w = num(root.getAttribute('width'));
      const h = num(root.getAttribute('height'));
      // Declared size wins when the drawing fits inside it; otherwise the drawing's own bounds.
      box = w > 0 && h > 0 && b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5 ? { x: 0, y: 0, w, h } : { x: b.x, y: b.y, w: b.width, h: b.height };
    } finally {
      host.remove();
    }
  }
  if (!(box.w > 0 && box.h > 0)) throw new Error('the SVG draws nothing');
  if (pad > 0) {
    const p = Math.max(box.w, box.h) * pad;
    box = { x: box.x - p, y: box.y - p, w: box.w + 2 * p, h: box.h + 2 * p };
  }
  root.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  root.setAttribute('width', String(box.w));
  root.setAttribute('height', String(box.h));
  return { svg: new XMLSerializer().serializeToString(root), width: box.w, height: box.h };
}
