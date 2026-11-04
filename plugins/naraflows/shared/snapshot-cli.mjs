#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { validateSnapshot, compareSnapshots, planOperations } from './audit.mjs';
import {parseToolResult,confirmedState} from './result.mjs';
const [command, first, second] = process.argv.slice(2);
if (!command || command === '--help') {
  console.log('Uso: node snapshot-cli.mjs validate snapshot.json [--formal] | diff before.json after.json | plan snapshot.json operations.json | normalize reply.json [sessionId] | state reply.json [sessionId]');
} else {
  try {
    const parse = async file => JSON.parse(await readFile(file, 'utf8'));
    const snapshot = await parse(first);
    let result;
    if(command==='normalize'||command==='state'){const normalized=parseToolResult(snapshot,{sessionId:second});result=command==='state'?confirmedState(normalized):normalized;if(!normalized.ok)process.exitCode=2;}
    else if (command === 'validate') { result = validateSnapshot(snapshot, { profile: second === '--formal' ? 'formal' : 'review' }); if (!result.valid || !result.complete) process.exitCode = 2; }
    else if (command === 'diff') result = compareSnapshots(snapshot, await parse(second));
    else if (command === 'plan') { const operations = await parse(second); if (!Array.isArray(operations)) throw Error('El plan debe ser un array de operaciones.'); result = planOperations(snapshot, operations); }
    else throw Error('Comando no admitido. Usa --help.');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
}
