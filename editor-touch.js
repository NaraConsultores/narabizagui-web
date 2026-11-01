'use strict';
// Touch gestures over the BPMN canvas move and zoom the diagram, never the page.
// Page pinch-zoom enlarged the HTML controls over the canvas and broke panning.
(() => {
  const MIN_SCALE = 0.2, MAX_SCALE = 4, TAP_SLOP = 6;
  const clamp = value => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Keeps the diagram point under the fingers' midpoint fixed while it scales.
  function pinchViewbox(start, points, outer) {
    const [a, b] = points, scale = clamp(start.scale * distance(a, b) / start.distance), m = middle(a, b);
    return { x: start.anchor.x - m.x / scale, y: start.anchor.y - m.y / scale, width: outer.width / scale, height: outer.height / scale };
  }
  function panViewbox(start, point) {
    return { x: start.view.x - (point.x - start.point.x) / start.view.scale, y: start.view.y - (point.y - start.point.y) / start.view.scale, width: start.view.width, height: start.view.height };
  }
  window.NaraTouch = { pinchViewbox, panViewbox };

  const host = document.getElementById('canvas');
  if (!host || typeof modeler === 'undefined') return;
  const canvas = modeler.get('canvas'), touches = new Map();
  let gesture = null;
  const local = event => { const box = host.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
  const ignored = event => event.pointerType !== 'touch' || window.NaraER?.active() || event.target.closest?.('.nara-direction-tools,.djs-popup,.djs-direct-editing-parent,input,textarea,select,[contenteditable="true"]');
  function begin() {
    const points = [...touches.values()], view = canvas.viewbox();
    if (points.length === 1) gesture = { kind: 'pan', point: points[0], view, moving: false };
    else {
      const [a, b] = points, m = middle(a, b);
      gesture = { kind: 'pinch', distance: distance(a, b), scale: view.scale, anchor: { x: view.x + m.x / view.scale, y: view.y + m.y / view.scale } };
    }
  }
  host.addEventListener('pointerdown', event => {
    if (ignored(event)) return;
    touches.set(event.pointerId, local(event));
    if (touches.size > 2) return;
    begin();
    if (touches.size === 2) event.preventDefault();
  });
  window.addEventListener('pointermove', event => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, local(event));
    if (!gesture) return;
    if (gesture.kind === 'pinch' && touches.size >= 2) {
      canvas.viewbox(pinchViewbox(gesture, [...touches.values()].slice(0, 2), canvas.viewbox().outer));
      event.preventDefault();
    } else if (gesture.kind === 'pan' && touches.size === 1) {
      const point = touches.get(event.pointerId);
      // A short movement stays a tap, so selection keeps working.
      if (!gesture.moving && distance(point, gesture.point) < TAP_SLOP) return;
      gesture.moving = true;
      canvas.viewbox(panViewbox(gesture, point));
      event.preventDefault();
    }
  }, { passive: false });
  const end = event => {
    if (!touches.delete(event.pointerId)) return;
    // Lifting one finger of a pinch continues as a pan from where it stands.
    if (touches.size) begin(); else gesture = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
})();
