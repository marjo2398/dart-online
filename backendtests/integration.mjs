import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Every write goes to a new temporary tree, never the configured/production database.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const php = process.env.DART_TEST_PHP || resolve(repo, '../dart-lens/.tools/online-runtime/php/php.exe');
const scratch = mkdtempSync(join(tmpdir(), 'dart-sqlite-test-'));
const apiDir = join(scratch, 'dart', 'api');
mkdirSync(apiDir, { recursive: true });
cpSync(join(repo, 'public/api'), apiDir, { recursive: true, filter: p => !/config\.local\.php$|data[\\/](?!\.htaccess$|\.gitkeep$).+/.test(p) });
mkdirSync(join(apiDir, 'data'), { recursive: true });
const secret = randomUUID();
writeFileSync(join(scratch, 'fixture-login.json'), JSON.stringify({ password: secret }));
const hash = execFileSync(php, ['-r', 'echo password_hash($argv[1],PASSWORD_DEFAULT);', secret], { encoding: 'utf8' });
writeFileSync(join(apiDir, 'config.local.php'), `<?php return ['password_hash'=>'${hash}','secure_cookie'=>false,'session_name'=>'dart_test_${Date.now()}','session_lifetime'=>900];`);
const phpArgs = ['-d', `extension_dir=${join(dirname(php), 'ext')}`, '-d', 'extension=pdo_sqlite'];
const servers = [];
let errors = '';
const basePorts = [18191, 18192];
const start = port => {
  const child = spawn(php, [...phpArgs, '-S', `127.0.0.1:${port}`, '-t', scratch], { windowsHide: true });
  child.stderr.on('data', data => { errors += data.toString(); });
  servers.push(child);
  return child;
};
let count = 0;
const pass = name => { count++; console.log(`PASS ${name}`); };
const admin = { cookie: '', csrf: '' };
async function request(action, body, actor = admin, port = basePorts[0], query = {}) {
  const u = new URL(`http://127.0.0.1:${port}/dart/api/index.php`);
  u.searchParams.set('action', action);
  for (const [k,v] of Object.entries(query)) u.searchParams.set(k, String(v));
  const headers = { Accept: 'application/json' };
  if (actor?.formats) headers['X-Dart-Formats'] = '1';
  if (actor?.token) headers.Authorization = `Bearer ${actor.token}`;
  else if (actor?.cookie) headers.Cookie = actor.cookie;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (actor?.csrf) headers['X-CSRF-Token'] = actor.csrf;
  }
  const res = await fetch(u, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (actor && res.headers.get('set-cookie') && !actor.token) actor.cookie = res.headers.get('set-cookie').split(';')[0];
  const payload = await res.json();
  return { status: res.status, data: payload.data, error: payload.error, headers: res.headers };
}
function ok(result) { assert.equal(result.status, 200, JSON.stringify(result.error)); assert(result.data); return result.data; }
function rejected(result, status, code) { assert.equal(result.status, status, JSON.stringify(result)); if (code) assert.equal(result.error?.code, code); }
const meta = rev => ({ command_id: randomUUID(), expected_revision: rev });
const command = (action, body = {}, rev = 0, actor = admin, port) => request(action, { ...body, ...meta(rev) }, actor, port);
const game = async (id, actor = admin) => ok(await request('game', undefined, actor, undefined, {id}));
const create = async (score=501, legs=1) => ok(await command('game-create',{player1_id:p1.id,player2_id:p2.id,starting_score:score,legs_to_win:legs}));
const hit = async (g, field, actor=admin) => ok(await command('dart-create',{game_id:g.game.id,player_id:g.game.current_player_id,field},g.game.revision,actor));
const visit = async (g, score, darts=3, dbl=false) => ok(await command('visit-create',{game_id:g.game.id,player_id:g.game.current_player_id,score,darts_used:darts,double_confirmed:dbl},g.game.revision));
const undo = async g => ok(await command('visit-undo',{game_id:g.game.id},g.game.revision));
function sql(code) {
  const script = join(scratch, 'db-check.php');
  writeFileSync(script, `<?php $p=new PDO('sqlite:'.__DIR__.'/dart/api/data/dart-online.sqlite'); $p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION); ${code}`);
  return execFileSync(php, [...phpArgs, script], { encoding: 'utf8' }).trim();
}
async function pair(role, id = null) {
  const grant = ok(await command('device-code-create',{role,game_id:id,expires_hours:1}));
  const body = {code:grant.code,device_name:`TEST ${role}`,join_id:randomUUID()};
  const joined = ok(await request('device-join', body, {}));
  return {...joined, grant, body};
}
let p1, p2;
try {
  // Build an actual v2 database with existing ids/stats/aggregate visit using the checked-in baseline.
  const baseline = execFileSync('git',['show','ef9c07e:public/api/index.php'],{cwd:repo,encoding:'utf8'});
  const library = baseline.slice(0, baseline.lastIndexOf('\ntry {'));
  writeFileSync(join(apiDir,'baseline-fixture.php'), library + `\n$p=openDatabase();migrateDatabase($p);$a=createPlayer($p,['name'=>'LEGACY A']);$b=createPlayer($p,['name'=>'LEGACY B']);$g=createGame($p,['player1_id'=>$a['id'],'player2_id'=>$b['id'],'legs_to_win'=>1,'starting_score'=>301]);recordVisit($p,['game_id'=>$g['game']['id'],'player_id'=>$a['id'],'score'=>60,'darts_used'=>3,'double_confirmed'=>false]);`);
  execFileSync(php,[...phpArgs,join(apiDir,'baseline-fixture.php')]);
  const original = sql(`echo json_encode($p->query('SELECT id,game_id,player_id,declared_score,applied_score,darts_used FROM visits')->fetchAll(PDO::FETCH_ASSOC));`);
  basePorts.forEach(start);
  for(let i=0;i<50;i++) {
    try { await request('session',undefined,{}); break; } catch(e) { if(i===49) throw e; await new Promise(r=>setTimeout(r,100)); }
  }
  const session = ok(await request('login',{password:secret})); admin.csrf=session.csrf_token;
  assert.equal(sql(`echo json_encode($p->query('SELECT id,game_id,player_id,declared_score,applied_score,darts_used FROM visits')->fetchAll(PDO::FETCH_ASSOC));`),original);
  assert.equal(sql(`echo $p->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn();`),'4');
  let legacy = await game(1); assert.equal(legacy.players[0].remaining,241); assert.equal(legacy.darts.length,0); assert.equal(legacy.visits[0].mode,'aggregate');
  pass('v2 migration preserves ids, visits and stats without inventing darts');
  const baseDashboard=ok(await request('dashboard')); p1=baseDashboard.players[0];p2=baseDashboard.players[1];
  let g=await create(); const gId=g.game.id;
  const one = {game_id:gId,player_id:p1.id,field:'S20',...meta(g.game.revision)};
  g=ok(await request('dart-create',one)); assert.equal(g.players[0].remaining,481); assert.equal(g.game.current_player_id,p1.id); assert.equal(g.partial_visit.darts_used,1); assert.equal(g.game.context.dart_no,2);
  pass('single dart immediately visible; partial turn stays with player');
  rejected(await command('visit-create',{game_id:gId,player_id:p1.id,score:60,darts_used:3,double_confirmed:false},g.game.revision),409,'partial-visit-exists');
  pass('aggregate visit cannot double count partial darts');
  assert.deepEqual(ok(await request('dart-create',one)),g);
  rejected(await request('dart-create',{...one,field:'T20'}),409,'command-payload-conflict');
  rejected(await command('dart-create',{game_id:gId,player_id:p1.id,field:'S20'},0),409,'revision-conflict');
  pass('lost-response retry stable; changed key content and stale revision refused');
  g=await hit(g,'MISS');g=await hit(g,'T20'); assert.equal(g.players[0].remaining,421);assert.equal(g.game.current_player_id,p2.id);assert.equal(g.visits.length,1);assert.equal(g.visits[0].darts_used,3);
  g=await undo(g); assert.equal(g.players[0].remaining,481);assert.equal(g.partial_visit.darts_used,2);assert.equal(g.game.current_player_id,p1.id);
  g=ok(await command('dart-correct',{game_id:gId,dart_id:g.darts.at(-1).id,field:'D20'},g.game.revision)); assert.equal(g.players[0].remaining,441); assert.equal(g.visits[0].darts_used,2);
  assert.equal(Number(sql(`echo $p->query("SELECT COUNT(*) FROM darts WHERE game_id=${gId} AND active=0")->fetchColumn();`)),2);
  pass('undo/correction preserves inactive original darts and monotonic revision');
  let m=await create(301,2);m=await visit(m,180);m=await visit(m,0);m=await hit(m,'T20');m=await hit(m,'T20'); // 121 ->61 ->1 bust
  assert.equal(m.players[0].remaining,121);assert.equal(m.visits.at(-1).is_bust,true);assert.equal(m.visits.at(-1).darts_used,2);assert.equal(m.game.current_player_id,p2.id);
  m=await undo(m);assert.equal(m.players[0].remaining,61);assert.equal(m.partial_visit.darts_used,1);
  m=await hit(m,'T7');m=await hit(m,'D20');assert.equal(m.game.current_leg,2);assert.equal(m.game.current_player_id,p2.id);assert.equal(m.players[0].legs,1);assert.equal(m.players[0].remaining,301);
  m=await undo(m);assert.equal(m.game.current_leg,1);assert.equal(m.players[0].remaining,40);assert.equal(m.game.current_player_id,p1.id);
  pass('bust on second dart, undo, checkout and alternating leg starter');
  let b=await create(301);b=await visit(b,180);b=await visit(b,0);b=await visit(b,81);b=await visit(b,0);b=await hit(b,'T20');assert.equal(b.visits.at(-1).is_bust,true);assert.equal(b.visits.at(-1).darts_used,1);assert.equal(b.players[0].remaining,40);
  b=await undo(b);b=await hit(b,'D20');assert.equal(b.game.status,'finished');assert.equal(b.players[0].remaining,0);b=await undo(b);assert.equal(b.game.status,'active');assert.equal(b.players[0].remaining,40);
  pass('first dart bust, single double checkout, undo reopens finished game');
  let agg=await create(701,5);agg=await visit(agg,100);const agid=agg.visits[0].id;agg=ok(await command('visit-correct',{game_id:agg.game.id,visit_id:agid,score:60,darts_used:3,double_confirmed:false},agg.game.revision));assert.equal(agg.visits.length,1);assert.equal(agg.players[0].remaining,641);agg=await undo(agg);assert.equal(agg.visits.length,0);assert(agg.audit.length>=2);
  const formats=await Promise.all([create(301,1),create(501,2),create(701,3),create(901,5)]);assert.deepEqual(formats.map(x=>[x.game.starting_score,x.game.max_legs]),[[301,1],[501,3],[701,5],[901,9]]);
  pass('aggregate correction/undo retain audit; all scores and formats preserved');
  let cameraGame=await create();const cam=await pair('camera',cameraGame.game.id);const operator=await pair('operator');const viewer=await pair('viewer',cameraGame.game.id);
  const repeated=ok(await request('device-join',cam.body,{}));assert.equal(repeated.token,cam.token);assert.equal(repeated.device.id,cam.device.id);
  rejected(await request('device-join',{...cam.body,device_name:'changed'},{}),409,'join-payload-conflict');
  rejected(await request('device-join',{...cam.body,join_id:randomUUID()},{}),401,'invalid-pairing-code');
  rejected(await request('game',undefined,cam,undefined,{id:gId}),403,'game-access-denied');
  rejected(await command('player-delete',{player_id:p1.id},0,cam),403);
  rejected(await command('dart-create',{game_id:cameraGame.game.id,player_id:p1.id,field:'S20'},0,viewer),403);
  assert.equal(ok(await request('dashboard',undefined,cam)).active_games.length,1);
  pass('pairing retry same token; one-use code; role and game scope enforced');
  cameraGame=ok(await command('camera-select',{game_id:cameraGame.game.id,device_id:cam.device.id},cameraGame.game.revision));
  const observe = async (snap, who=cam) => {
    const input={game_id:snap.game.id,observation_id:randomUUID(),...snap.game.context,field:'T20',...meta(snap.game.revision)};delete input.revision;
    const next=ok(await request('observation-create',input,who));return {input,next};
  };
  let obs=await observe(cameraGame);assert.equal(obs.next.game.revision,cameraGame.game.revision);assert.deepEqual(obs.next.players,cameraGame.players);
  const obsId=obs.input.observation_id;
  const review={game_id:cameraGame.game.id,observation_id:obsId,decision:'accept',field:'D20'};
  const simultaneous=await Promise.all([command('observation-review',review,cameraGame.game.revision,admin,basePorts[0]),command('observation-review',review,cameraGame.game.revision,operator,basePorts[1])]);
  assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409]);cameraGame=await game(cameraGame.game.id);
  assert.equal(cameraGame.darts.length,1);assert.equal(cameraGame.players[0].remaining,461);assert.equal(cameraGame.observations[0].status,'accepted');assert.equal(cameraGame.observations[0].accepted_revision,cameraGame.game.revision);assert.equal(cameraGame.observations[0].accepted_dart_id,cameraGame.darts[0].id);
  pass('camera publication does not score; two independent PHP processes accept once');
  obs=await observe(cameraGame);cameraGame=await undo(cameraGame);assert.equal(cameraGame.observations.find(x=>x.id===obs.input.observation_id).status,'stale');
  rejected(await command('observation-review',{...review,observation_id:obs.input.observation_id},cameraGame.game.revision),409,'observation-context-stale');
  pass('undo invalidates pending observation');
  obs=await observe(cameraGame);sql(`$p->exec("UPDATE observations SET created_at='2000-01-01T00:00:00.000Z' WHERE id='${obs.input.observation_id}'");`);
  rejected(await command('observation-review',{...review,observation_id:obs.input.observation_id},cameraGame.game.revision),409,'observation-context-stale');
  assert.equal((await game(cameraGame.game.id)).observations.find(x=>x.id===obs.input.observation_id).status,'stale');
  pass('observation TTL fails closed without changing score');
  cameraGame=ok(await command('camera-select',{game_id:cameraGame.game.id,device_id:operator.device.id},cameraGame.game.revision));
  rejected(await request('observation-create',{...obs.input,observation_id:randomUUID(),command_id:randomUUID(),expected_revision:cameraGame.game.revision,camera_epoch:cameraGame.game.camera_epoch},cam),409,'inactive-camera');
  obs=await observe(cameraGame,operator);cameraGame=ok(await command('observation-review',{game_id:cameraGame.game.id,observation_id:obs.input.observation_id,decision:'reject'},cameraGame.game.revision));assert.equal(cameraGame.darts.length,0);assert.equal(cameraGame.observations.find(x=>x.id===obs.input.observation_id).status,'rejected');
  pass('operator can be active camera; old camera denied; rejection does not score');
  const beforeRace=cameraGame.game.revision;
  const race=await Promise.all([command('dart-create',{game_id:cameraGame.game.id,player_id:p1.id,field:'S1'},beforeRace,admin,basePorts[0]),command('dart-create',{game_id:cameraGame.game.id,player_id:p1.id,field:'S2'},beforeRace,operator,basePorts[1])]);
  assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);cameraGame=await game(cameraGame.game.id);assert.equal(cameraGame.game.revision,beforeRace+1);
  pass('concurrent independent operators commit one expected revision');
  const saved=ok(await request('command-status',undefined,admin,undefined,{command_id:one.command_id}));assert.equal(saved.status,'saved');assert.deepEqual(saved.result.players,ok(await request('dart-create',one)).players);
  rejected(await command('device-revoke',{device_id:cam.device.id},0,operator),403);ok(await command('device-revoke',{device_id:cam.device.id}));
  rejected(await request('device-self',undefined,cam),401,'device-expired');rejected(await request('device-join',cam.body,{}),401,'device-expired');
  sql(`$p->exec("UPDATE devices SET expires_at=1 WHERE id='${viewer.device.id}'");`);rejected(await request('game',undefined,viewer,undefined,{id:cameraGame.game.id}),401);
  pass('status recovery, revocation and expiry precede deduplication/rejoin');
  const beforeRollback=await game(gId);const failed={game_id:gId,player_id:beforeRollback.game.current_player_id,field:'S5',...meta(beforeRollback.game.revision)};
  sql(`$p->exec("CREATE TRIGGER fail_commands BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT,'injected test failure'); END");`);
  rejected(await request('dart-create',failed),500);sql(`$p->exec('DROP TRIGGER fail_commands');`);
  const afterRollback=await game(gId);assert.deepEqual(afterRollback,beforeRollback);ok(await request('dart-create',failed));
  pass('injected command-ledger failure rolls back dart, score, audit and revision atomically');
  const stats=JSON.parse(sql(`echo json_encode($p->query('SELECT p.id,p.total_points,p.total_darts_thrown,(SELECT COALESCE(SUM(v.applied_score),0) FROM visits v WHERE v.player_id=p.id) AS expected_points,(SELECT COALESCE(SUM(v.darts_used),0) FROM visits v WHERE v.player_id=p.id) AS expected_darts FROM players p')->fetchAll(PDO::FETCH_ASSOC));`));
  for(const p of stats) {assert.equal(p.total_points,p.expected_points);assert.equal(p.total_darts_thrown,p.expected_darts);}
  pass('global statistics count visit projections once, never audit/darts twice');
  rejected(await request('dart-create',{game_id:gId,player_id:p1.id,field:'S20'}),422,'invalid-uuid');
  rejected(await request('player-create',{name:'NO CSRF',...meta(0)},{cookie:admin.cookie,csrf:''}),403,'invalid-csrf-token');
  assert.match((await request('game',undefined,admin,undefined,{id:gId})).headers.get('cache-control'),/no-store/);
  pass('legacy write bypass closed; CSRF and no-store preserved');
  const beforeRestart=await game(gId);servers[0].kill();await new Promise(r=>servers[0].once('exit',r));start(basePorts[0]);await new Promise(r=>setTimeout(r,300));assert.deepEqual(await game(gId),beforeRestart);
  pass('process restart preserves database state and shared WWW session');
  console.log(`RESULT ${count} PASS, scratch=${scratch}`);
} catch(e) {
  console.error(e.stack);console.error(errors.slice(-6000));process.exitCode=1;
} finally {
  for(const server of servers) server.kill();
}
