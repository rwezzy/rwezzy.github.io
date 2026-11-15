import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingBufferSize } from '../js/studio-render-budget.js';

test('a retina desktop presentation stays inside its physical pixel budget', () => {
  for (const [width, height, dpr] of [[1816, 870, 2], [3840, 2160, 2], [1440, 900, 3]]) {
    const buffer = drawingBufferSize(width, height, dpr);
    assert.ok(buffer.width * buffer.height <= 1800000);
    assert.ok(Math.abs(buffer.width / buffer.height - width / height) < .005, 'Pixel budgeting preserves the canvas aspect');
  }
});

test('small canvases retain extra sampling, while ordinary desktop pixels stay native', () => {
  assert.deepEqual(drawingBufferSize(390, 440, 3), { width: 585, height: 660 });
  assert.deepEqual(drawingBufferSize(1280, 720, 1), { width: 1280, height: 720 });
});
