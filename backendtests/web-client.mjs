import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import http from 'node:http';

// The actual TypeScript client talks to a controlled HTTP server, without browser state or production data.
const records = new Map();
let dropReply = true;
let seen = [];
let rejectNext = false;
let delayedDashboard;
let csrf = 'test-csrf';
let limitNext=false; let csrfFailures=0; let expireNext=false; let sessionReads=0; let csrfBodies=[];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  assert.equal(url.pathname, '/dart/api/index.php');
  const action = url.searchParams.get('action');
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  res.setHeader('Content-Type', 'application/json');
  if (action === 'public-session') { sessionReads++; return res.end(JSON.stringify({ok:true,data:{access:'public',authenticated:false,csrf_token:csrf}})); }
  if (action === 'dashboard') { delayedDashboard = res; return; }
  if (action === 'login') { csrf = 'new-test-csrf'; return res.end(JSON.stringify({ ok: true, data: { authenticated: true, csrf_token: csrf } })); }
  assert.equal(req.headers['x-dart-client'],'public-web');
  if(limitNext){limitNext=false;res.statusCode=429;return res.end(JSON.stringify({ok:false,error:{code:'public-rate-limited',message:'rate'}}));}
  if(csrfFailures>0){csrfFailures--;res.statusCode=403;return res.end(JSON.stringify({ok:false,error:{code:'invalid-csrf-token',message:'expired'}}));}
  if(expireNext){expireNext=false;csrf='renewed-public-csrf';csrfBodies.push(JSON.stringify(body));res.statusCode=403;return res.end(JSON.stringify({ok:false,error:{code:'invalid-csrf-token',message:'expired'}}));}
  assert.equal(req.headers['x-csrf-token'], csrf);
  seen.push(JSON.stringify(body));
  if (rejectNext) { rejectNext = false; res.statusCode = 409; return res.end(JSON.stringify({ ok: false, error: { code: 'revision-conflict', message: 'conflict' } })); }
  if (!records.has(body.command_id)) records.set(body.command_id, { id: records.size + 1, name: body.name });
  if (dropReply) { dropReply = false; req.socket.destroy(); return; }
  res.end(JSON.stringify({ ok: true, data: records.get(body.command_id) }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const storage = new Map();
globalThis.sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
globalThis.window = Object.assign(new EventTarget(), { location: { href: `http://127.0.0.1:${server.address().port}/dart/` }, setTimeout, clearTimeout });
const source = ts.transpileModule(fs.readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = suffix => import('data:text/javascript;base64,' + Buffer.from(source + '\n//' + suffix).toString('base64'));
try {
  const first = await load('first'); await first.api.session();
  await assert.rejects(first.api.createPlayer('TEST'), e => e.code === 'network-error');
  assert.equal(records.size, 1); assert.equal(first.currentWriteState(), 'unknown');
  const original = first.pendingCommand();
  await assert.rejects(first.api.createPlayer('OTHER'), e => e.code === 'unresolved-command');
  assert.equal(seen.length, 1);
  const restarted = await load('restarted'); await restarted.api.session();
  assert.equal(restarted.currentWriteState(), 'unknown');
  assert.deepEqual(restarted.pendingCommand(), original);
  const recovered = await restarted.retryPending();
  assert.equal(recovered.name, 'TEST'); assert.equal(records.size, 1);
  assert.equal(seen[0], seen[1]); assert.equal(restarted.pendingCommand(), null);
  assert.equal(restarted.currentWriteState(), 'saved');
  rejectNext = true;
  await assert.rejects(restarted.api.dart(7, 1, 'S20', 42), e => e.status === 409);
  assert.equal(restarted.currentWriteState(), 'rejected'); assert.equal(restarted.pendingCommand(), null);
  const conflict = JSON.parse(seen.at(-1)); assert.equal(conflict.expected_revision, 42);
  const beforeStorageFailure = seen.length;
  const set = sessionStorage.setItem;
  sessionStorage.setItem = () => { throw new Error('disk full'); };
  await assert.rejects(restarted.api.createPlayer('NOT SENT'));
  assert.equal(seen.length, beforeStorageFailure);
  sessionStorage.setItem = set;
  expireNext=true;const reads=sessionReads;
  await restarted.api.createPlayer('AFTER EXPIRY');
  assert.equal(sessionReads,reads+1);assert.equal(csrfBodies[0],seen.at(-1));
  assert.equal(restarted.pendingCommand(),null);
  console.log('PASS: public technical session renews once; unchanged command UUID/body; no login');
  limitNext=true;await assert.rejects(restarted.api.createPlayer('RETRY AFTER RATE'),e=>e.status===429);const limited=restarted.pendingCommand();assert(limited);assert.equal(restarted.currentWriteState(),'unknown');await restarted.retryPending();assert.equal(JSON.parse(seen.at(-1)).command_id,limited.body.command_id);
  csrfFailures=2;const beforeRenew=sessionReads;await assert.rejects(restarted.api.createPlayer('COOKIE BLOCKED'),e=>e.status===403);assert.equal(sessionReads,beforeRenew+1);assert(restarted.pendingCommand());await restarted.retryPending();
  console.log('PASS: 429 preserves pending UUID and repeated CSRF denial stops after one renewal');
  const stale = restarted.api.dashboard();
  const staleResult = assert.rejects(stale, e => e.status === 401);
  while (!delayedDashboard) await new Promise(resolve => setTimeout(resolve, 5));
  await restarted.api.login('fixture');
  delayedDashboard.statusCode = 401;
  delayedDashboard.end(JSON.stringify({ ok: false, error: { code: 'expired', message: 'expired' } }));
  await staleResult;
  await restarted.api.createPlayer('NEW SESSION');
  console.log('PASS: stale unauthorized response does not invalidate a newer login');
  console.log('PASS: subdirectory, lost response, blocked second write, reload recovery, identical command/body, single application, revision rejection, storage failure prevents transmission');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
