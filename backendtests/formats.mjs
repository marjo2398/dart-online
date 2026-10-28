import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Isolated HTTP + real SQLite, no configured database or production requests.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const php = process.env.DART_TEST_PHP || resolve(repo, '../dart-lens/.tools/online-runtime/php/php.exe');
const scratch = mkdtempSync(join(tmpdir(), 'dart-formats-'));
const apiDir = join(scratch, 'api');
mkdirSync(apiDir, { recursive: true });
cpSync(join(repo, 'public/api'), apiDir, { recursive: true, filter: p => !/config\.local\.php$|data[\\/](?!\.htaccess$|\.gitkeep$).+/.test(p) });
const secret = randomUUID();
const hash = execFileSync(php, ['-r','echo password_hash($argv[1],PASSWORD_DEFAULT);',secret], { encoding: 'utf8' });
writeFileSync(join(apiDir,'config.local.php'), `<?php return ['password_hash'=>'${hash}','secure_cookie'=>false,'session_name'=>'formats_${Date.now()}'];`);
const args = ['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
let server, log = '', count = 0;
function start() { server = spawn(php,[...args,'-S','127.0.0.1:18201','-t',scratch],{windowsHide:true}); server.stderr.on('data',d=>log+=d); }
const admin = {cookie:'',csrf:'',formats:true};
async function request(action, body, actor=admin, query={}) {
  const u=new URL('http://127.0.0.1:18201/api/index.php'); u.searchParams.set('action',action);
  Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const headers={Accept:'application/json'};
  if(actor.formats) headers['X-Dart-Formats']='1';
  if(actor.token) headers.Authorization=`Bearer ${actor.token}`;
  else if(actor.cookie) headers.Cookie=actor.cookie;
  if(body!==undefined) { headers['Content-Type']='application/json'; if(actor.csrf) headers['X-CSRF-Token']=actor.csrf; }
  const r=await fetch(u,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(r.headers.get('set-cookie')) actor.cookie=r.headers.get('set-cookie').split(';')[0];
  return {status:r.status,...await r.json()};
}
function ok(r) { assert.equal(r.status,200,JSON.stringify(r)); return r.data; }
function reject(r,status,code) { assert.equal(r.status,status,JSON.stringify(r)); if(code) assert.equal(r.error.code,code); }
const meta=rev=>({command_id:randomUUID(),expected_revision:rev});
const command=(action,body={},rev=0,actor=admin)=>request(action,{...body,...meta(rev)},actor);
const read=async(g,actor=admin)=>ok(await request('game',undefined,actor,{id:g.game.id}));
const pass=name=>{count++;console.log('PASS '+name)};
const cfg=()=>({version:1,scoring:{start:2,in:'straight',out:'double'},match:{unit:'legs',target:2},legs_per_set:3,deciding:{win_by_two:false,extra_pairs:null},final_set:null,starters:{method:'fixed',player:1,leg_rotation:'alternate',set_rotation:'alternate',decider:'rotation'}});
let p1,p2;
const create=async c=>ok(await command('game-create',{player1_id:p1.id,player2_id:p2.id,config:c}));
const hit=async(g,field)=>ok(await command('dart-create',{game_id:g.game.id,player_id:g.game.current_player_id,field},g.game.revision));
const undo=async g=>ok(await command('visit-undo',{game_id:g.game.id},g.game.revision));
const sum=async(g,score,darts=3,double=false)=>command('visit-create',{game_id:g.game.id,player_id:g.game.current_player_id,score,darts_used:darts,double_confirmed:double},g.game.revision);
async function win(g,id) { if(g.game.current_player_id!==id) g=ok(await sum(g,0)); return hit(g,'D1'); }
function sql(code) { const path=join(scratch,'check.php');writeFileSync(path,`<?php $p=new PDO('sqlite:'.__DIR__.'/api/data/dart-online.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);${code}`);return execFileSync(php,[...args,path],{encoding:'utf8'}).trim(); }
async function pair(id,formats=true) {
  const grant=ok(await command('device-code-create',{role:'operator',game_id:id,expires_hours:1}));
  const body={code:grant.code,device_name:'Format test',join_id:randomUUID()};
  return {grant,body,result:await request('device-join',body,{formats})};
}
try {
  start();
  for(let i=0;i<50;i++) { try { await request('session');break; } catch(e) { if(i===49) throw e;await new Promise(r=>setTimeout(r,100)); } }
  admin.csrf=ok(await request('login',{password:secret})).csrf_token;
  p1=ok(await command('player-create',{name:'FORMAT A'}));p2=ok(await command('player-create',{name:'FORMAT B'}));
  let c=cfg(); let g=await create(c);
  assert.equal(g.game.config.version,1);assert.equal(g.game.legacy_compatible,false);assert.equal(g.game.current_player_id,p1.id);
  g=await win(g,p1.id);assert.equal(g.game.leg_starter_id,p2.id);assert.equal(g.players[0].legs,1);
  g=await win(g,p1.id);assert.equal(g.game.status,'finished');assert.equal(g.game.winner_id,p1.id);
  g=await undo(g);assert.equal(g.game.status,'active');assert.equal(g.players[0].legs,1);assert.equal(g.game.current_player_id,p1.id);
  g=await hit(g,'D1');assert.equal(g.game.status,'finished');assert.deepEqual(await read(g),g);
  pass('legs, alternating start, match checkout/undo and resume');

  c=cfg();c.scoring.start=501; c.match.target=4;
  const old={...admin,formats:false};
  reject(await request('game',undefined,old,{id:g.game.id}),409,'client-update-required');
  reject(await command('game-create',{player1_id:p1.id,player2_id:p2.id,config:c},0,old),409,'client-update-required');
  reject(await command('visit-undo',{game_id:g.game.id},g.game.revision,old),409,'client-update-required');
  const grant=await pair(g.game.id,false);reject(grant.result,409,'client-update-required');
  const device=ok(await request('device-join',grant.body,{formats:true}));
  reject(await request('game',undefined,{token:device.token,formats:false},{id:g.game.id}),409,'client-update-required');
  reject(await command('dart-create',{game_id:g.game.id,player_id:p1.id,field:'D1'},g.game.revision,{token:device.token,formats:false}),409,'client-update-required');
  const oldDashboard=ok(await request('dashboard',undefined,old));assert(!oldDashboard.history.some(x=>x.id===g.game.id));
  const legacy=ok(await command('game-create',{player1_id:p1.id,player2_id:p2.id,starting_score:301,legs_to_win:1},0,old));
  assert.equal((await read(legacy,old)).game.legacy_compatible,true);
  pass('old APK receives no unsupported games, pairing/read/write blocked; legacy requests work');

  for(const mutate of [x=>x.scoring.start=1,x=>x.scoring.start=10002,x=>x.match.target=2.5,x=>x.match.best_of=3,x=>x.deciding.extra_pairs=1,x=>x.final_set={target:2,win_by_two:false,extra_pairs:null}]) {
    const bad=cfg();mutate(bad);reject(await command('game-create',{player1_id:p1.id,player2_id:p2.id,config:bad}),422);
  }
  c=cfg();c.match.unit='fixed';c.deciding.win_by_two=true;reject(await command('game-create',{player1_id:p1.id,player2_id:p2.id,config:c}),422,'conflicting-format');
  reject(await command('game-create',{player1_id:p1.id,player2_id:p1.id,config:cfg()}),422,'players-must-differ');
  c=cfg();c.scoring.start=10001;assert.equal((await create(c)).game.starting_score,10001);
  pass('authoritative range, conflicting rules, best-of normalization and distinct-player validation');

  c=cfg();c.match={unit:'fixed',target:2};g=await create(c);
  g=await win(g,p1.id);g=await win(g,p2.id);assert.equal(g.game.result,'draw');assert.equal(g.game.winner_id,null);assert.equal(g.game.status,'finished');
  assert(ok(await request('dashboard')).history.some(x=>x.id===g.game.id && x.result==='draw'));
  reject(await command('dart-create',{game_id:g.game.id,player_id:p1.id,field:'D1'},g.game.revision),409,'game-finished');
  g=await undo(g);assert.equal(g.game.status,'active');assert.equal(g.game.current_player_id,p2.id);g=await hit(g,'D1');
  c.match.target=3;g=await create(c);g=await win(g,p1.id);g=await win(g,p1.id);assert.equal(g.game.status,'active');g=await win(g,p2.id);assert.equal(g.game.winner_id,p1.id);
  pass('all N legs, mandatory last leg, draw persistence, history and undo');

  c=cfg();c.match={unit:'sets',target:2};c.legs_per_set=2;
  g=await create(c);g=await win(g,p1.id);g=await win(g,p1.id);
  assert.equal(g.players[0].sets,1);assert.equal(g.players[0].set_legs,0);assert.equal(g.game.current_set,2);assert.equal(g.game.leg_in_set,1);assert.equal(g.game.leg_starter_id,p2.id);
  g=await undo(g);assert.equal(g.players[0].sets,0);assert.equal(g.players[0].set_legs,1);assert.equal(g.game.current_set,1);
  g=await hit(g,'D1');g=await win(g,p2.id);g=await win(g,p2.id);assert.equal(g.game.current_set,3);assert.equal(g.game.leg_starter_id,p1.id);
  g=await win(g,p1.id);g=await win(g,p1.id);assert.equal(g.game.winner_id,p1.id);assert.equal(g.players[0].sets,2);
  g=await undo(g);assert.equal(g.game.status,'active');assert.equal(g.players[0].sets,1);assert.equal(g.players[0].set_legs,1);
  pass('sets, reset leg counts, independent set rotation, undo set and match');

  c=cfg();c.deciding={win_by_two:true,extra_pairs:2};g=await create(c);
  for(const id of [p1.id,p2.id,p1.id,p2.id,p1.id,p2.id]) g=await win(g,id);
  assert.equal(g.game.phase,'sudden_death');assert.equal(g.game.current_leg,7);g=await win(g,p2.id);assert.equal(g.game.winner_id,p2.id);
  g=await undo(g);assert.equal(g.game.phase,'sudden_death');assert.equal(g.game.current_leg,7);
  c.deciding.extra_pairs=null;g=await create(c);g=await win(g,p1.id);g=await win(g,p2.id);assert.equal(g.game.phase,'advantage');g=await win(g,p1.id);assert.equal(g.game.status,'active');g=await win(g,p1.id);assert.equal(g.game.status,'finished');
  c.deciding.extra_pairs=0;g=await create(c);g=await win(g,p1.id);g=await win(g,p2.id);assert.equal(g.game.phase,'sudden_death');g=await win(g,p1.id);assert.equal(g.game.status,'finished');
  pass('win by two, unlimited extension, cap in extra pairs, sudden death and undo');

  c=cfg();c.match={unit:'sets',target:2};c.legs_per_set=1;c.final_set={target:2,win_by_two:true,extra_pairs:1};
  g=await create(c);g=await win(g,p1.id);g=await win(g,p2.id);assert.equal(g.game.current_set,3);
  for(const id of [p1.id,p2.id,p1.id,p2.id]) g=await win(g,id);
  assert.equal(g.game.phase,'sudden_death');g=await win(g,p1.id);assert.equal(g.players[0].sets,2);
  pass('distinct last set target, advantage and capped decider');

  c=cfg();c.starters.player=2;c.starters.leg_rotation='same';g=await create(c);assert.equal(g.game.leg_starter_id,p2.id);g=await win(g,p1.id);assert.equal(g.game.leg_starter_id,p2.id);
  c=cfg();c.starters.method='random';const body={player1_id:p1.id,player2_id:p2.id,config:c,...meta(0)};
  const first=ok(await request('game-create',body));assert.deepEqual(ok(await request('game-create',body)),first);assert.equal((await read(first)).game.leg_starter_id,first.game.leg_starter_id);
  reject(await request('game-create',body,old),409,'client-update-required');
  reject(await request('command-status',undefined,old,{command_id:body.command_id}),409,'client-update-required');
  c=cfg();c.starters.method='bull_off';c.starters.player=2;g=await create(c);assert.equal(g.game.leg_starter_id,p2.id);
  c=cfg();c.starters.decider='initial';g=await create(c);g=await win(g,p1.id);g=await win(g,p2.id);assert.equal(g.game.phase,'decider');assert.equal(g.game.leg_starter_id,p1.id);
  c.starters.decider='bull_off';g=await create(c);g=await win(g,p1.id);g=await win(g,p2.id);assert.equal(g.game.phase,'awaiting_starter');assert.equal(g.game.current_player_id,null);assert.equal(g.game.leg_starter_id,null);
  reject(await command('dart-create',{game_id:g.game.id,player_id:p1.id,field:'D1'},g.game.revision),409,'wrong-player-turn');
  const select={game_id:g.game.id,player_id:p2.id,...meta(g.game.revision)};
  g=ok(await request('starter-select',select));assert.equal(g.game.current_player_id,p2.id);assert.deepEqual(ok(await request('starter-select',select)),g);
  g=await hit(g,'D1');g=await undo(g);assert.equal(g.game.leg_starter_id,p2.id);
  g=await undo(g);assert.equal(g.game.current_leg,2);g=await hit(g,'D1');assert.equal(g.game.phase,'awaiting_starter');
  c.match.target=1;c.starters.method='bull_off';c.starters.player=2;g=await create(c);assert.equal(g.game.current_player_id,p2.id);assert.equal(g.game.phase,'decider');
  c.starters.method='fixed';g=await create(c);assert.equal(g.game.phase,'awaiting_starter');
  pass('fixed/random/bull-off, stable retry, decider wait and invalidation on boundary undo');

  c=cfg();c.match.target=1;c.scoring.in='double';g=await create(c);
  reject(await sum(g,0),422,'individual-darts-required');g=await hit(g,'S1');assert.equal(g.players[0].remaining,2);assert.equal(g.players[0].opened,false);
  g=await hit(g,'D2');assert.equal(g.visits.at(-1).is_bust,true);assert.equal(g.players[0].opened,false);g=await undo(g);assert.equal(g.partial_visit.darts_used,1);assert.equal(g.players[0].opened,false);
  g=await hit(g,'D1');assert.equal(g.game.status,'finished');g=await undo(g);assert.equal(g.players[0].opened,false);
  c.scoring.start=40;g=await create(c);g=await hit(g,'S20');g=await hit(g,'D5');assert.equal(g.players[0].remaining,30);g=await hit(g,'MISS');assert.equal(g.players[0].opened,true);
  for(let i=0;i<3;i++) g=await hit(g,'MISS');
  g=ok(await sum(g,30,1,true));assert.equal(g.game.status,'finished');
  pass('double-in misses, exact opening score, opening rollback on bust/undo, sums after opening');

  c=cfg();c.match.target=1;c.scoring={start:60,in:'master',out:'master'};g=await create(c);g=await hit(g,'T20');assert.equal(g.game.status,'finished');
  g=await create(c);g=await hit(g,'25');assert.equal(g.players[0].remaining,60);g=await hit(g,'50');assert.equal(g.players[0].remaining,10);g=await hit(g,'D5');assert.equal(g.game.status,'finished');
  c.scoring={start:3,in:'straight',out:'master'};g=await create(c);reject(await sum(g,3,1),422,'individual-darts-required');g=await hit(g,'S3');assert.equal(g.visits.at(-1).is_bust,true);
  const dartId=g.darts.at(-1).id;g=ok(await command('dart-correct',{game_id:g.game.id,dart_id:dartId,field:'T1'},g.game.revision));assert.equal(g.game.status,'finished');assert.equal(g.darts.at(-1).field,'T1');
  c.scoring={start:50,in:'straight',out:'master'};g=await create(c);g=await hit(g,'50');assert.equal(g.game.status,'finished');
  c.scoring={start:25,in:'straight',out:'master'};g=await create(c);g=await hit(g,'25');assert.equal(g.visits.at(-1).is_bust,true);
  pass('master triple/double/inner bull, outer bull excluded, explicit fields and correction');

  c=cfg();c.match.target=1;c.scoring.out='straight';g=await create(c);g=await hit(g,'S1');assert.equal(g.players[0].remaining,1);assert.equal(g.visits.at(-1).is_bust,false);g=await hit(g,'S1');assert.equal(g.game.status,'finished');
  g=await create(c);g=ok(await sum(g,2,1));assert.equal(g.game.status,'finished');g=await undo(g);assert.equal(g.game.status,'active');
  g=ok(await sum(g,3,1));assert.equal(g.visits.at(-1).is_bust,true);assert.equal(g.players[0].remaining,2);
  pass('straight-out may leave one, single-field and aggregate checkout/bust/undo');

  let templates=ok(await request('dashboard')).templates;
  assert.equal(templates.length,4);assert(templates.some(t=>t.name==='501 BO11'));
  c=cfg();const saved=ok(await command('template-save',{name:'Mój format',config:c,favorite:true}));
  let t=saved.templates.find(t=>t.name==='Mój format');assert.equal(t.favorite,true);g=await create(t.config);
  c.match.target=9;
  const edited=ok(await command('template-save',{template_id:t.id,template_revision:t.revision,name:'Nowa nazwa',config:c,favorite:false}));
  reject(await command('template-save',{template_id:t.id,template_revision:0,name:'Konflikt',config:c,favorite:false}),409,'template-conflict');
  t=edited.templates.find(x=>x.id===t.id);assert.equal(t.config.match.target,9);
  ok(await command('template-delete',{template_id:t.id,template_revision:t.revision}));assert.deepEqual((await read(g)).game.config,cfg());
  pass('server templates: seeds, save, rename/edit/favorite, conflict, delete and frozen match config');

  const beforeStats=ok(await request('dashboard')).players.map(p=>[p.id,p.total_points,p.total_darts_thrown,p.games_played]);
  c=cfg();g=await create(c);g=await win(g,p1.id);g=await win(g,p1.id);
  assert.deepEqual(ok(await request('dashboard')).players.map(p=>[p.id,p.total_points,p.total_darts_thrown,p.games_played]),beforeStats);
  assert.match(ok(await request('dashboard')).statistics_scope,/straight-in\/double-out/);
  const before=await read(g);server.kill();await new Promise(r=>server.once('exit',r));start();await new Promise(r=>setTimeout(r,300));assert.deepEqual(await read(g),before);
  assert.equal(sql(`echo $p->query('PRAGMA integrity_check')->fetchColumn();`),'ok');
  assert.equal(sql(`echo count($p->query('PRAGMA foreign_key_check')->fetchAll());`),'0');
  assert.equal(sql(`echo $p->query('SELECT COUNT(*) FROM templates')->fetchColumn();`),'4');
  pass('statistics scoped, restart/migration idempotency, SQLite integrity and references');
  console.log(`RESULT ${count} PASS; scratch=${scratch}`);
} catch(e) {console.error(e);console.error(log.slice(-4000));process.exitCode=1;}
finally {server?.kill();}
