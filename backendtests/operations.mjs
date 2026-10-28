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
const scratch = mkdtempSync(join(tmpdir(), 'dart-operations-'));
const apiDir = join(scratch, 'api');
mkdirSync(apiDir, { recursive: true });
cpSync(join(repo, 'public/api'), apiDir, { recursive: true, filter: p => !/config\.local\.php$|data[\\/](?!\.htaccess$|\.gitkeep$).+/.test(p) });
const secret = randomUUID();
const hash = execFileSync(php, ['-r','echo password_hash($argv[1],PASSWORD_DEFAULT);',secret], { encoding: 'utf8' });
writeFileSync(join(apiDir,'config.local.php'), `<?php return ['password_hash'=>'${hash}','secure_cookie'=>false,'session_name'=>'formats_${Date.now()}'];`);
const args = ['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
let server, log = '', count = 0;
function start() { server = spawn(php,[...args,'-S','127.0.0.1:18211','-t',scratch],{windowsHide:true}); server.stderr.on('data',d=>log+=d); }
const admin = {cookie:'',csrf:'',formats:true,operations:true};
async function request(action, body, actor=admin, query={}) {
  const u=new URL('http://127.0.0.1:18211/api/index.php'); u.searchParams.set('action',action);
  Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const headers={Accept:'application/json'};
  if(actor.formats) headers['X-Dart-Formats']='1';
  if(actor.operations) headers['X-Dart-Operations']='2';
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
const state=async(g,action,extra={},actor=admin)=>ok(await command(action,{game_id:g.game.id,...extra},g.game.revision,actor));
const preview=async(g,extra)=>ok(await request('history-preview',{game_id:g.game.id,expected_revision:g.game.revision,reason:'Błąd operatora',withdraw_dependent:false,...extra}));
const correctionBody=(g,change,plan)=>({game_id:g.game.id,reason:'Błąd operatora',withdraw_dependent:false,...change,preview_token:plan.preview_token,...meta(g.game.revision)});
try {
  start();for(let i=0;i<50;i++){try{await request('session');break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}
  admin.csrf=ok(await request('login',{password:secret})).csrf_token;
  p1=ok(await command('player-create',{name:'OP A'}));p2=ok(await command('player-create',{name:'OP B'}));
  let c=cfg();c.scoring.start=501;c.match.target=1;
  let a=await create(c),b=await create(c),d=await create(c);
  a=ok(await sum(a,60));for(let i=0;i<3;i++)b=await hit(b,'S20');
  d=await state(d,'remaining-create',{player_id:p1.id,remaining:441,darts_used:3,double_confirmed:false});
  assert.equal(a.players[0].remaining,441);assert.equal(b.players[0].remaining,441);assert.equal(d.players[0].remaining,441);assert.equal(d.darts.length,0);assert.equal(d.visits[0].input_mode,'remaining');
  reject(await stateRequest(d,'remaining-create',{player_id:p2.id,remaining:501,darts_used:3,double_confirmed:false}),422,'ambiguous-remaining');
  reject(await sum(await create(c),179),422,'impossible-visit-score');
  let small=cfg();small.match.target=1;let g=await create(small);
  reject(await stateRequest(g,'remaining-create',{player_id:p1.id,remaining:1,darts_used:3,double_confirmed:false}),422,'invalid-remaining');
  g=await hit(g,'MISS');reject(await stateRequest(g,'remaining-create',{player_id:p1.id,remaining:0,darts_used:1,double_confirmed:true}),409,'partial-visit-exists');
  small.scoring.in='double';g=await create(small);reject(await stateRequest(g,'remaining-create',{player_id:p1.id,remaining:0,darts_used:1,double_confirmed:true}),422,'individual-darts-required');
  small.scoring.in='straight';g=await create(small);reject(await sum(g,180,3),422,'impossible-visit-sequence');
  pass('sum, fields, remaining agree; ambiguity, impossible score, bust, entry and partial turn guarded');

  c.scoring.start=170;g=await create(c);
  let hints=ok(await request('checkout-hints',undefined,admin,{game_id:g.game.id,preferred_double:'50'}));
  assert.deepEqual(hints.routes[0],['T20','T20','50']);assert.equal(hints.darts_left,3);
  g=await hit(g,'T20');hints=ok(await request('checkout-hints',undefined,admin,{game_id:g.game.id}));assert.equal(hints.darts_left,2);assert(hints.routes.some(r=>r.join(',')==='T20,50'));
  g=await hit(g,'S1');hints=ok(await request('checkout-hints',undefined,admin,{game_id:g.game.id}));assert.equal(hints.darts_left,1);assert.deepEqual(hints.routes,[]);
  small=cfg();small.scoring={start:3,in:'straight',out:'master'};g=await create(small);hints=ok(await request('checkout-hints',undefined,admin,{game_id:g.game.id}));assert(hints.routes.some(r=>r.join(',')==='T1'));assert(!hints.routes.some(r=>r.join(',')==='S3'));
  pass('hints use actual remaining darts, double/master-out and never fabricate actual darts');

  c.scoring.start=501;a=await create(c);a=ok(await sum(a,60));a=ok(await sum(a,100));a=ok(await sum(a,60));
  const old=await read(a);const edit={kind:'visit',visit_id:a.visits[0].id,score:100,darts_used:3,double_confirmed:false};
  const plan=await preview(a,edit);assert(plan.can_apply);assert.equal(plan.proposed.players[0].remaining,341);assert.deepEqual(await read(a),old);
  const normalized=await preview(a,{...edit,score:'100',darts_used:'3'});assert.equal(normalized.preview_token,plan.preview_token);
  const atomicBody=correctionBody(a,edit,plan);
  sql(`$p->exec("CREATE TRIGGER fail_history_commit BEFORE INSERT ON commands WHEN NEW.action='history-apply' BEGIN SELECT RAISE(ABORT,'fixture'); END");`);
  reject(await request('history-apply',atomicBody),500);assert.deepEqual(await read(a),old);
  sql(`$p->exec('DROP TRIGGER fail_history_commit');`);
  a=ok(await request('history-apply',atomicBody));assert.deepEqual(a.visits.map(v=>v.id),old.visits.map(v=>v.id));assert.deepEqual(a.visits.map(v=>v.player_id),old.visits.map(v=>v.player_id));assert.equal(a.players[1].remaining,401);assert(a.record_versions.length>0);
  const stale=await preview(a,edit);a=ok(await sum(a,0));reject(await request('history-apply',correctionBody(old,edit,stale)),409,'revision-conflict');
  pass('read-only historical aggregate preview; deterministic legal replay, stable IDs/owners, stale preview refused');

  small=cfg();small.match.target=1;g=await create(small);g=await hit(g,'MISS');g=await hit(g,'MISS');g=await hit(g,'MISS');g=await hit(g,'D1');
  const original=g;const change={kind:'dart',dart_id:g.darts[0].id,field:'D1'};
  let p=await preview(g,change);assert(!p.can_apply);assert(p.conflicts[0].dart_id);assert.equal(p.proposed.game.winner_id,p1.id);assert.deepEqual(await read(g),original);
  reject(await request('history-apply',correctionBody(g,change,p)),409,'dependent-history-conflict');
  p=await preview(g,{...change,withdraw_dependent:true});const apply=correctionBody(g,{...change,withdraw_dependent:true},p);g=ok(await request('history-apply',apply));
  assert.equal(g.game.winner_id,p1.id);assert.equal(g.visits.length,1);assert.equal(g.darts.length,1);assert.equal(g.darts[0].id,original.darts[0].id);assert.equal(g.withdrawn_darts.length,3);assert.equal(g.withdrawn_visits.length,1);assert.deepEqual(ok(await request('history-apply',apply)),g);
  assert.equal(sql(`echo $p->query('SELECT COUNT(*) FROM visits WHERE game_id=${g.game.id}')->fetchColumn();`),'2');
  assert.equal(g.leg_results[0].kind,'hold');
  pass('early checkout changes winner; explicit dependent withdrawal archives real IDs without moving/deleting history; retry once');

  small=cfg();small.match={unit:'sets',target:2};small.legs_per_set=1;g=await create(small);
  g=await hit(g,'MISS');g=await hit(g,'MISS');g=await hit(g,'MISS');g=await hit(g,'D1');assert.equal(g.players[1].sets,1);assert.equal(g.leg_results[0].kind,'break');
  const setChange={kind:'dart',dart_id:g.darts[0].id,field:'D1',withdraw_dependent:true};p=await preview(g,setChange);g=ok(await request('history-apply',correctionBody(g,setChange,p)));assert.equal(g.players[0].sets,1);assert.equal(g.players[1].sets,0);assert.equal(g.game.current_set,2);
  pass('historical correction replays set winner and actual hold/break starter');

  c.scoring.start=501;g=await create(c);const oldClient={...admin,operations:false};
  const first={game_id:g.game.id,player_id:p1.id,field:'S20',...meta(g.game.revision)};g=ok(await request('dart-create',first,oldClient));
  const beforePause=g;g=await state(g,'game-pause');assert.equal(g.game.operation_state,'paused');assert.equal(g.partial_visit.darts_used,1);
  reject(await stateRequest(g,'dart-create',{player_id:p1.id,field:'S20'},oldClient),409,'game-paused');
  assert.deepEqual(ok(await request('dart-create',first,oldClient)),beforePause);assert.equal((await read(g)).darts.length,1);
  reject(await request('game',undefined,oldClient,{id:g.game.id}),409,'client-update-required');
  assert.equal((await read(g)).game.is_paused,true);g=await state(g,'game-resume');assert.equal(g.game.operation_state,'playing');assert.equal(g.game.current_player_id,p1.id);assert.equal(g.game.context.dart_no,2);assert.equal(g.players[0].remaining,481);
  pass('pause keeps partial turn across reload; old-client writes blocked, accepted retry still returns original once');

  // Camera observation survives as history, but cannot cross pause/resume context.
  const grant=ok(await command('device-code-create',{role:'camera',game_id:g.game.id,expires_hours:1}));
  const camera=ok(await request('device-join',{code:grant.code,device_name:'CAM',join_id:randomUUID()},{formats:true,operations:true}));
  g=await state(g,'camera-select',{device_id:camera.device.id});
  const observationId=randomUUID();const context=g.game.context;
  ok(await command('observation-create',{game_id:g.game.id,observation_id:observationId,...context,field:'S20'},g.game.revision,{token:camera.token,formats:true,operations:true}));
  g=await state(g,'game-pause');reject(await stateRequest(g,'observation-review',{observation_id:observationId,decision:'accept',field:'S20'}),409,'game-paused');
  g=await state(g,'game-resume');reject(await stateRequest(g,'observation-review',{observation_id:observationId,decision:'accept',field:'S20'}),409,'observation-context-stale');
  assert.equal(g.darts.length,1);
  pass('pause/resume invalidates camera observations and rejects stale acceptance');

  for(const kind of ['walkover','interrupted','cancelled','surrender']) {
    g=await create(c);g=await state(g,'game-adjudicate',{kind,reason:'Decyzja testowa',...(['walkover','surrender'].includes(kind)?{winner_id:p2.id,award:{player1:0,player2:1}}:{})});
    assert.equal(g.visits.length,0);assert.equal(g.darts.length,0);assert.equal(g.players[0].legs,0);assert.equal(g.players[1].points,0);assert.equal(g.game.result,kind);assert.equal(g.game.operation_state,'resolved');
    g=await state(g,'result-confirm',{reason:'Sprawdzono wynik'});assert.equal(g.game.operation_state,'confirmed');
    reject(await stateRequest(g,'visit-undo',{},oldClient),409,'result-locked');reject(await stateRequest(g,'dart-create',{player_id:p2.id,field:'D1'},oldClient),409,'result-locked');
    g=await state(g,'result-reopen',{reason:'Ponowne sprawdzenie decyzji'});assert.equal(g.game.status,'active');assert.equal(g.game.confirmed_at,null);assert.equal(g.game.decision,null);assert.equal(g.result_decisions.length,3);
  }
  pass('distinct administrative endings, declared award separate, confirmation lock and reasoned reopening without fictitious stats');

  const statsBefore=ok(await request('dashboard')).players;
  g=ok(await command('game-create',{player1_id:p1.id,player2_id:p2.id,starting_score:301,legs_to_win:1}));g=ok(await sum(g,60));
  let ps=ok(await request('dashboard')).players.find(p=>p.id===p1.id);assert.equal(ps.total_points,statsBefore.find(p=>p.id===p1.id).total_points+60);
  g=await state(g,'game-adjudicate',{kind:'interrupted',reason:'Nieukończona próba'});assert.deepEqual(ok(await request('dashboard')).players,statsBefore);assert.equal(g.visits[0].applied_score,60);
  g=await state(g,'result-reopen',{reason:'Można kontynuować'});g=await state(g,'game-adjudicate',{kind:'surrender',winner_id:p2.id,reason:'Poddanie po rzeczywistym rzucie'});
  ps=ok(await request('dashboard')).players.find(p=>p.id===p1.id);assert.equal(ps.total_points,statsBefore.find(p=>p.id===p1.id).total_points+60);assert.equal(g.players[1].legs,0);assert.equal(g.visits.length,1);
  pass('interruption excludes actual projections from global stats; surrender retains only actual points, without awarded legs');

  small=cfg();small.match.target=1;g=await create(small);g=await hit(g,'D1');assert.equal(g.game.operation_state,'resolved');g=await state(g,'result-confirm',{reason:'Wynik sprawdzony'});
  reject(await command('player-delete',{player_id:p1.id}),409,'result-locked');
  reject(await request('history-preview',{game_id:g.game.id,expected_revision:g.game.revision,kind:'dart',dart_id:g.darts[0].id,field:'MISS',reason:'Korekta',withdraw_dependent:false}),409,'result-locked');
  g=await state(g,'result-reopen',{reason:'Błąd końcowej lotki'});const fixed={kind:'dart',dart_id:g.darts[0].id,field:'MISS'};p=await preview(g,fixed);g=ok(await request('history-apply',correctionBody(g,fixed,p)));assert.equal(g.game.status,'active');assert.equal(g.game.confirmed_at,null);
  pass('normal result awaits confirmation; reopen then correction invalidates prior approval');

  const opGrant=ok(await command('device-code-create',{role:'operator',game_id:g.game.id,expires_hours:1}));
  const op=ok(await request('device-join',{code:opGrant.code,device_name:'OLD OP',join_id:randomUUID()},{formats:true,operations:true}));
  const opActor={token:op.token,formats:true,operations:true};assert.deepEqual(op.device.permissions,['score','correct_last']);
  for(const action of ['game-pause','game-adjudicate','result-confirm','result-reopen','history-apply']) reject(await stateRequest(g,action,{reason:'Nie wolno'},opActor),403,'permission-required');
  reject(await stateRequest(g,'dart-create',{player_id:g.game.current_player_id,field:'S20'},{token:camera.token,formats:true,operations:true}),403,'game-access-denied');
  const allGrant=ok(await command('device-code-create',{role:'operator',game_id:g.game.id,expires_hours:1,permissions:['score','correct_last','history','pause','adjudicate','confirm','reopen']}));
  const ref=ok(await request('device-join',{code:allGrant.code,device_name:'Sędzia (deklaracja)',join_id:randomUUID()},{formats:true,operations:true}));
  g=await state(g,'game-pause',{}, {token:ref.token,formats:true,operations:true});assert.equal(g.game.is_paused,true);
  pass('existing operator grants unchanged; explicit referee permissions required and enforced');

  const rematchBody={game_id:g.game.id,swap_sides:true,starter_method:'fixed',starter_player:2,...meta(g.game.revision)};
  const r=ok(await request('game-rematch',rematchBody));assert.deepEqual(ok(await request('game-rematch',rematchBody)),r);assert.notEqual(r.game.id,g.game.id);assert.equal(r.game.player1_id,p2.id);assert.equal(r.game.leg_starter_id,p1.id);assert.equal(r.visits.length,0);assert.equal((await read(g)).game.is_paused,true);
  pass('rematch copies rules, swaps players, selects starter, keeps separate history and deduplicates creation');
  assert.equal(sql(`echo $p->query('PRAGMA integrity_check')->fetchColumn();`),'ok');assert.equal(sql(`echo count($p->query('PRAGMA foreign_key_check')->fetchAll());`),'0');
  console.log(`RESULT ${count} PASS; scratch=${scratch}`);
} catch(e){console.error(e);console.error(log.slice(-3500));process.exitCode=1;}finally{server?.kill();}
function stateRequest(g,action,extra={},actor=admin){return command(action,{game_id:g.game.id,...extra},g.game.revision,actor);}
