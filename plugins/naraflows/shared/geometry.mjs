export const same = (a, b) => Math.abs(a - b) < .01;
export const pointEqual = (a, b) => same(a.x, b.x) && same(a.y, b.y);
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const between = (p, a, b) => Math.abs(cross(a, b, p)) < .01 && p.x >= Math.min(a.x, b.x) - .01 && p.x <= Math.max(a.x, b.x) + .01 && p.y >= Math.min(a.y, b.y) - .01 && p.y <= Math.max(a.y, b.y) + .01;
export const segments = flow => (flow.waypoints || []).slice(1).map((p, i) => [flow.waypoints[i], p]);
export function segmentContact(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < .0001) {
    if (Math.abs(cross(a, b, c)) > .01) return null;
    const common = [a, b, c, d].filter(p => between(p, a, b) && between(p, c, d));
    const unique = common.filter((p, i) => !common.slice(0, i).some(q => pointEqual(p, q)));
    return unique.length > 1 ? { type: 'overlap' } : unique.length ? { type: 'contact', point: unique[0] } : null;
  }
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denominator;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denominator;
  if (t < -.00001 || t > 1.00001 || u < -.00001 || u > 1.00001) return null;
  return { type: t > .00001 && t < .99999 && u > .00001 && u < .99999 ? 'crossing' : 'contact', point: { x: a.x + t * r.x, y: a.y + t * r.y } };
}
export function lineHitsBox(a, b, box, padding = 0) {
  const left = box.x - padding + .01, top = box.y - padding + .01, right = box.x + box.width + padding - .01, bottom = box.y + box.height + padding - .01;
  let low = 0, high = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, left, right], [a.y, b.y - a.y, top, bottom]]) {
    if (Math.abs(delta) < .00001) { if (origin < min || origin > max) return false; }
    else { const x = (min - origin) / delta, y = (max - origin) / delta; low = Math.max(low, Math.min(x, y)); high = Math.min(high, Math.max(x, y)); if (low > high) return false; }
  }
  return high >= 0 && low <= 1;
}
export const boxesOverlap = (a, b) => a.x < b.x + b.width - .01 && a.x + a.width > b.x + .01 && a.y < b.y + b.height - .01 && a.y + a.height > b.y + .01;
export const segmentAlongBox = (a,b,box) =>
  same(a.x,b.x)&&(same(a.x,box.x)||same(a.x,box.x+box.width))&&Math.min(a.y,b.y)<box.y+box.height-.01&&Math.max(a.y,b.y)>box.y+.01||
  same(a.y,b.y)&&(same(a.y,box.y)||same(a.y,box.y+box.height))&&Math.min(a.x,b.x)<box.x+box.width-.01&&Math.max(a.x,b.x)>box.x+.01;
