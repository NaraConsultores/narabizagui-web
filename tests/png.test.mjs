import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pngArtifact } from '../plugins/naraflows/server/png.mjs';

test('PNG export returns a viewable MCP image and a unique, matching report artifact', async () => {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNf8AAAAASUVORK5CYII=';
  const result = await pngArtifact({ pngBase64, fileName: 'Ejemplo genérico.bpmn', revision: 'r1', effectiveScale: 2 });
  try {
    const bytes = await readFile(result.structuredContent.filePath);
    assert.equal(bytes.toString('base64'), result.content[0].data);
    assert.equal(result.content[0].type, 'image');
    assert.equal(result.structuredContent.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.structuredContent.width, 1);
    assert.equal(result.structuredContent.height, 1);
    assert.equal(result.structuredContent.revision, 'r1');
  } finally { await unlink(result.structuredContent.filePath); }
  await assert.rejects(pngArtifact({ pngBase64: Buffer.from('not an image').toString('base64') }), /PNG válido/);
});
