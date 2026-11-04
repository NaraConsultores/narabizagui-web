import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export async function pngArtifact(result) {
  const bytes = Buffer.from(result.pngBase64 || '', 'base64');
  if (bytes.length < 24 || bytes.length > 8 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('El visor no devolvió un PNG válido de hasta 8 MB.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000) throw new Error('Las dimensiones del PNG exceden el límite.');
  const dir = path.join(tmpdir(), 'NaraFlows', 'exports');
  await mkdir(dir, { recursive: true });
  const name = path.basename(String(result.fileName || 'diagrama.bpmn')).replace(/\.bpmn$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80);
  const filePath = path.join(dir, `naraflows-${name}-${randomUUID()}.png`);
  await writeFile(filePath, bytes, { flag: 'wx' });
  const metadata = { filePath, mimeType: 'image/png', width, height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), revision: result.revision, sourceFileName: result.fileName, sheetId: result.sheetId, sheetName: result.sheetName, effectiveScale: result.effectiveScale, temporary: true };
  return { content: [{ type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }, { type: 'text', text: JSON.stringify(metadata) }], structuredContent: metadata };
}
