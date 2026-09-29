/**
 * Take out of a copied SVG everything that is not a shape.
 *
 * Elements that run or load: script, foreignObject (which holds arbitrary HTML), use and image
 * pointing anywhere but at this document, style (which can fetch), and any attribute that is an
 * event handler or an address that leaves the file. Measuring needs none of it, and a pack is
 * somebody else's file.
 */
function strip(el: Element): void {
  for (const node of [...el.querySelectorAll('script,foreignObject,style,iframe,object,embed,link,animate,set')]) node.remove();
  const walk = (e: Element) => {
    for (const a of [...e.attributes]) {
      const name = a.name.toLowerCase();
      const value = a.value.trim();
      // Anything that can run.
      if (name.startsWith('on')) e.removeAttribute(a.name);
      // Anything that can point outside this document. A fragment or an inline data URL is fine.
      else if ((name === 'href' || name === 'xlink:href' || name === 'src') && !value.startsWith('#') && !value.startsWith('data:')) e.removeAttribute(a.name);
      else if (/url\(/i.test(value) && !/url\(\s*['"]?#/.test(value)) e.removeAttribute(a.name);
    }
    for (const child of [...e.children]) walk(child);
  };
  walk(el);
}

/**
 * Make an SVG drawable at any size. Many icon-pack SVGs have no viewBox, and some (exported from
 * Flash) draw around the origin with no size at all, so an <img> shows a corner of them. The
 * drawing is measured in the page and given a viewBox that fits it.
 */
export function fitSvg(text: string, pad = 0): { svg: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('not an SVG');
  // Everything that could run or fetch comes out before this SVG is measured, drawn or shown.
  // Drawing one that points at a remote image made the request, which is a thing this application
  // promises not to do with somebody's pack, and then tainted the canvas so the preview failed
  // anyway. What is left is the drawing, which is all anybody wanted from it.
  strip(root);
  const num = (v: string | null) => (v && !v.trim().endsWith('%') ? Number.parseFloat(v) : NaN);
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  let box = vb?.length === 4 && vb.every(Number.isFinite) ? { x: vb[0]!, y: vb[1]!, w: vb[2]!, h: vb[3]! } : null;
  if (!box) {
    // Measure what's actually drawn.
    //
    // This is the one place a pack's own markup goes into the live page, and it happens while
    // thumbnails are being made, before anybody has clicked anything. It has been stripped above.
    const live = document.importNode(root, true) as unknown as SVGSVGElement;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
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
