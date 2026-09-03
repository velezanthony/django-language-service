import { positionsState } from '$lib/state/positions.svelte';

const escXml = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const emptyExportSvg = (): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120">' +
  '<rect width="360" height="120" fill="#1e1e1e"/>' +
  '<text x="20" y="68" fill="#858585" font-family="sans-serif" font-size="14">No visible models to export</text>' +
  '</svg>';

/**
 * WYSIWYG export: clones the rendered DOM (model boxes with detail-mode fields,
 * hub colors, compare tints, orphan styling) and the relation SVG into one
 * composite SVG. Model boxes are HTML, so they go inside <foreignObject>;
 * relation paths are SVG, so they stay as native SVG.
 *
 * The page CSS is pulled from <style> tags; `body.X` selectors are rewritten
 * to `.X` so mode classes (detail-mode, show-cycles) on our cloned wrapper
 * div match the same rules.
 */
export const buildExportSvg = (): string => {
  // 1. Bounding box of VISIBLE boxes only — respects filters + right-click hidden.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visibleBoxes: { el: Element; x: number; y: number; w: number; h: number }[] = [];
  document.querySelectorAll('.model-box').forEach(box => {
    if (box.classList.contains('hidden')) return;
    const el = box as HTMLElement;
    const key = el.getAttribute('data-model');
    const p = key ? positionsState.byKey[key] : null;
    if (!p) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + w);
    maxY = Math.max(maxY, p.y + h);
    visibleBoxes.push({ el: box, x: p.x, y: p.y, w, h });
  });
  if (visibleBoxes.length === 0) return emptyExportSvg();

  const pad = 40;
  const svgW = Math.ceil(maxX - minX + pad * 2);
  const svgH = Math.ceil(maxY - minY + pad * 2);
  const shiftX = -minX + pad;
  const shiftY = -minY + pad;

  // 2. Page CSS. body.X → .X so mode classes on our wrapper div match the same rules.
  let cssText = '';
  document.querySelectorAll('style').forEach(style => {
    cssText += (style.textContent || '') + '\n';
  });
  cssText = cssText.replace(/\bbody\./g, '.');

  // 3. Live relation SVG: split <defs> (markers) from paths/texts so we can
  //    position defs at the outer SVG root (url(#...) references resolve) and
  //    wrap the lines in a translated group.
  const liveSvg = document.getElementById('svg');
  const defsMarkup: string[] = [];
  const relMarkup: string[] = [];
  if (liveSvg) {
    for (let i = 0; i < liveSvg.children.length; i++) {
      const child = liveSvg.children[i];
      if (!child) continue;
      const tag = (child.tagName || '').toLowerCase();
      if (tag === 'defs') defsMarkup.push(child.outerHTML || '');
      else relMarkup.push(child.outerHTML || '');
    }
  }

  // 4. Clone visible boxes — keeps detail-mode content + hub-N + orphan + compare-* classes.
  const boxesHtml = visibleBoxes
    .map(b => {
      const clone = b.el.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-dragging');
      clone.style.transform = '';
      clone.style.left = b.x + 'px';
      clone.style.top = b.y + 'px';
      return clone.outerHTML || '';
    })
    .join('');

  // 5. App zones (coloured app groupings).
  const zonesHtml = Array.from(document.querySelectorAll('.app-zone, .app-zone-label'))
    .map(el => el.outerHTML || '')
    .join('');

  // 6. Carry body modes (detail-mode, show-cycles, compare-mode) to the wrapper.
  const bodyClass = document.body.className || '';

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    svgW +
    '" height="' +
    svgH +
    '" viewBox="0 0 ' +
    svgW +
    ' ' +
    svgH +
    '">' +
    '<style>' +
    cssText +
    '</style>' +
    defsMarkup.join('') +
    '<rect width="' +
    svgW +
    '" height="' +
    svgH +
    '" fill="#1e1e1e"/>' +
    '<g id="svg" transform="translate(' +
    shiftX +
    ',' +
    shiftY +
    ')">' +
    relMarkup.join('') +
    '</g>' +
    '<foreignObject x="0" y="0" width="' +
    svgW +
    '" height="' +
    svgH +
    '">' +
    '<div xmlns="http://www.w3.org/1999/xhtml" class="' +
    escXml(bodyClass) +
    '" style="position:relative;width:' +
    svgW +
    'px;height:' +
    svgH +
    'px;">' +
    '<div style="position:absolute;left:' +
    shiftX +
    'px;top:' +
    shiftY +
    'px;">' +
    zonesHtml +
    boxesHtml +
    '</div>' +
    '</div>' +
    '</foreignObject>' +
    '</svg>'
  );
};
