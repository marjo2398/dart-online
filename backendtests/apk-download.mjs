import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022
} }).outputText;
const { trustedApkUrl } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const file = 'https://drive.google.com/file/d/test-file_123/view';
assert.equal(trustedApkUrl(file), file);
assert.equal(trustedApkUrl(file + '?usp=drivesdk'), file + '?usp=drivesdk');
for (const invalid of [undefined, null, '', 42, 'https://example.org/file/d/id/view',
  file.replace('drive.google.com','drive.google.com.example.org'), file.replace('https:', 'http:'),
  'https://drive.google.com/open?id=id', file + '?next=https://example.org', file + '\n']) {
  assert.equal(trustedApkUrl(invalid), null);
}
console.log('PASS: Drive file link, optional sharing parameter, missing and untrusted links');
