import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const fail = (code, message) => Object.assign(new Error(message), { code });

// Writes the complete editable XML to a temporary file instead of returning it to the chat.
export async function bpmnArtifact(state, { expectedRevision, directory = path.join(tmpdir(), 'NaraFlows', 'exports') } = {}) {
  if (state?.documentReady === false) throw fail('NOT_READY', 'El visor todavía no puede leer el documento. Espera y lee de nuevo.');
  if (typeof state?.xml !== 'string' || !/^\s*</.test(state.xml)) throw fail('BPMN_EXPORT_ERROR', 'El visor no devolvió el XML del documento.');
  if (expectedRevision && state.revision !== expectedRevision) throw fail('REVISION_CONFLICT', 'El diagrama cambió desde la revisión indicada. Lee de nuevo antes de exportar.');
  const bytes = Buffer.from(state.xml, 'utf8');
  if (bytes.length > 8 * 1024 * 1024) throw fail('BPMN_TOO_LARGE', 'El BPMN supera 8 MB.');
  await mkdir(directory, { recursive: true });
  const name = path.basename(String(state.fileName || 'diagrama.bpmn')).replace(/\.bpmn$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'diagrama';
  const filePath = path.join(directory, `naraflows-${name}-${randomUUID()}.bpmn`);
  await writeFile(filePath, bytes, { flag: 'wx' });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { exported: true, filePath, mimeType: 'application/xml', bytes: bytes.length, sha256, ...(state.sha256 ? { matchesEditorSha256: state.sha256 === sha256 } : {}), revision: state.revision, sourceFileName: state.fileName, ...(state.documentId ? { documentId: state.documentId } : {}), activeSheetId: state.activeSheetId, sheets: (state.sheets || []).map(({ id, name, kind, processId }) => ({ id, name, kind, ...(processId ? { processId } : {}) })), temporary: true, saved: false };
}
