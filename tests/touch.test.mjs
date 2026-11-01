import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../editor-touch.js', import.meta.url), 'utf8');
const outer = { width: 800, height: 600 };

function harness({ erd = false } = {}) {
  const listeners = { host: {}, window: {} }, calls = [];
  let view = { x: 0, y: 0, width: 800, height: 600, scale: 1, outer };
  const canvas = { viewbox(next) { if (!next) return view; calls.push(next); view = { ...next, scale: outer.width / next.width, outer }; return view; } };
  const host = { addEventListener: (type, fn) => { listeners.host[type] = fn; }, getBoundingClientRect: () => ({ left: 100, top: 50 }) };
  const window = { addEventListener: (type, fn) => { listeners.window[type] = fn; }, NaraER: { active: () => erd } };
  const context = { window, document: { getElementById: () => host }, modeler: { get: () => canvas } };
  vm.runInNewContext(source, context);
  const event = (pointerId, clientX, clientY, extra = {}) => ({ pointerId, clientX, clientY, pointerType: 'touch', target: { closest: () => null }, preventDefault() { this.prevented = true; }, ...extra });
  return { listeners, calls, view: () => view, event, touch: window.NaraTouch };
}

test('a pinch scales around the fingers and keeps that diagram point under them', () => {
  const { touch } = harness();
  const start = { scale: 1, distance: 100, anchor: { x: 300, y: 200 } };
  const next = touch.pinchViewbox(start, [{ x: 250, y: 200 }, { x: 450, y: 200 }], outer);
  const scale = outer.width / next.width;
  assert.equal(scale, 2);
  assert.deepEqual({ x: next.x + 350 / scale, y: next.y + 200 / scale }, start.anchor);
});

test('pinch zoom stays within the editor limits', () => {
  const { touch } = harness();
  const start = { scale: 1, distance: 100, anchor: { x: 0, y: 0 } };
  assert.equal(outer.width / touch.pinchViewbox(start, [{ x: 0, y: 0 }, { x: 5000, y: 0 }], outer).width, 4);
  assert.equal(outer.width / touch.pinchViewbox(start, [{ x: 0, y: 0 }, { x: 1, y: 0 }], outer).width, 0.2);
});

test('one finger pans the diagram only after leaving the tap tolerance', () => {
  const { listeners, calls, event } = harness();
  listeners.host.pointerdown(event(1, 200, 150));
  const tap = event(1, 203, 152); listeners.window.pointermove(tap);
  assert.equal(calls.length, 0); assert.equal(tap.prevented, undefined);
  const drag = event(1, 260, 190); listeners.window.pointermove(drag);
  assert.equal(drag.prevented, true);
  assert.deepEqual({ x: calls.at(-1).x, y: calls.at(-1).y }, { x: -60, y: -40 });
  listeners.window.pointerup(event(1, 260, 190));
});

test('two fingers zoom the canvas instead of the page', () => {
  const { listeners, view, event } = harness();
  listeners.host.pointerdown(event(1, 300, 250));
  const second = event(2, 400, 250); listeners.host.pointerdown(second);
  assert.equal(second.prevented, true);
  const spread = event(2, 500, 250); listeners.window.pointermove(spread);
  assert.equal(spread.prevented, true);
  assert.equal(view().scale, 2);
});

test('mouse input, canvas controls and the data sheet keep their own handling', () => {
  for (const [options, extra] of [[{}, { pointerType: 'mouse' }], [{}, { target: { closest: () => ({}) } }], [{ erd: true }, {}]]) {
    const { listeners, calls, event } = harness(options);
    listeners.host.pointerdown(event(1, 200, 150, extra));
    listeners.window.pointermove(event(1, 300, 250, extra));
    assert.equal(calls.length, 0);
  }
});
