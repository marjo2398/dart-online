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
const scratch = mkdtempSync(join(tmpdir(), 'dart-analysis-'));
const apiDir = join(scratch, 'api');
mkdirSync(apiDir, { recursive: true });
cpSync(join(repo, 'public/api'), apiDir, { recursive: true, filter: p => !/config\.local\.php$|data[\\/](?!\.htaccess$|\.gitkeep$).+/.test(p) });
const secret = randomUUID();
const hash = execFileSync(php, ['-r','echo password_hash($argv[1],PASSWORD_DEFAULT);',secret], { encoding: 'utf8' });
writeFileSync(join(apiDir,'config.local.php'), `<?php return ['password_hash'=>'${hash}','secure_cookie'=>false,'session_name'=>'formats_${Date.now()}'];`);
const args = ['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
let server, log = '', count = 0;
function start() { server = spawn(php,[...args,'-S','127.0.0.1:18216','-t',scratch],{windowsHide:true}); server.stderr.on('data',d=>log+=d); }
const admin = {cookie:'',csrf:'',formats:true,operations:true};
async function request(action, body, actor=admin, query={}) {
  const u=new URL('http://127.0.0.1:18216/api/index.php'); u.searchParams.set('action',action);
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
// Expected numbers below are hand-calculated, independent of the PHP engine.
const cfg=(start=40,entry='straight')=>({version:1,scoring:{start,in:entry,out:'double'},match:{unit:'legs',target:1},legs_per_set:3,deciding:{win_by_two:false,extra_pairs:null},final_set:null,starters:{method:'fixed',player:1,leg_rotation:'alternate',set_rotation:'alternate',decider:'rotation'}});
const all={start:'all',in:'all',out:'all',unit:'all',status:'all'};
let a,b;
const create=async(c=cfg(),p1=a.id,p2=b.id)=>ok(await command('game-create',{player1_id:p1,player2_id:p2,config:c}));
const sum=async(g,score,darts=3,double=false,extra={})=>ok(await command('visit-create',{game_id:g.game.id,player_id:g.game.current_player_id,score,darts_used:darts,double_confirmed:double,...extra},g.game.revision));
const hit=async(g,field,extra={})=>ok(await command('dart-create',{game_id:g.game.id,player_id:g.game.current_player_id,field,...extra},g.game.revision));
const analyze=async(q={})=>ok(await request('analysis',undefined,admin,{...all,...q}));
const match=async(g)=>ok(await request('match-analysis',undefined,admin,{game_id:g.game.id}));
const row=(data,id=a.id)=>data.players.find(p=>p.player.id===id)?.metrics;
function sql(code){const path=join(scratch,'check.php');writeFileSync(path,`<?php $p=new PDO('sqlite:'.__DIR__.'/api/data/dart-online.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);${code}`);return execFileSync(php,[...args,path],{encoding:'utf8'}).trim();}
start();
try {
  for(let i=0;i<80;i++){try{await request('session');break;}catch{await new Promise(r=>setTimeout(r,70));}}
  admin.csrf=ok(await request('login',{password:secret})).csrf_token;
  a=ok(await command('player-create',{name:'Ala',is_guest:true}));b=ok(await command('player-create',{name:'Bartek'}));
  assert.equal(a.is_guest,true);assert.equal(a.archived,false);
  a=ok(await command('profile-save',{...a,player_id:a.id,name:'Ala Żółć',nickname:'A',club:'Klub',throwing_hand:'right',is_guest:false,preferred_double:'D10',hints_enabled:true,notes:'Bez konta'}));
  assert.equal(a.id,1);assert.equal(a.is_guest,false);
  reject(await command('profile-save',{...a,player_id:a.id,profile_revision:0}),409,'profile-conflict');
  const gear=ok(await command('equipment-save',{player_id:a.id,name:'Zestaw Żółty',weight:22.5,notes:null,archived:false}));
  let g1=await create();g1=ok(await command('game-metadata',{game_id:g1.game.id,context_kind:'friendly',venue:'Klub / 1',equipment:{[a.id]:gear.id}},g1.game.revision));
  g1=await sum(g1,0);g1=await sum(g1,60,1,false,{recording_level:'extended',checkout_attempts:1}); // bust: B uses one real dart
  g1=await hit(g1,'S20',{target:'S20',checkout_attempt:false});g1=await hit(g1,'MISS',{target:'D10',checkout_attempt:false});g1=await hit(g1,'D10',{target:'D10',checkout_attempt:true});
  let g2=await create();g2=await sum(g2,40,1,true,{recording_level:'extended',checkout_attempts:1});
  let g3=await create(cfg(100));g3=await sum(g3,60);g3=await sum(g3,0);g3=await sum(g3,20,3,false,{recording_level:'extended',checkout_attempts:0});g3=await sum(g3,0);g3=await sum(g3,20,3,true,{recording_level:'extended',checkout_attempts:2});
  let data=await analyze({player_id:a.id,status:'completed'});let m=row(data);
  assert.equal(m.points,180);assert.equal(m.darts,16);assert.equal(m.average1,11.25);assert.equal(m.average3,33.75); // not arithmetic mean of match averages
  assert.equal(m.first9,100/3);assert.equal(m.first9_known,1);assert.equal(m.first9_eligible,3);
  assert.equal(m.wins,3);assert.equal(m.won_legs,3);assert.equal(m.average_won_leg,16/3);assert.equal(m.best_leg.value,1);
  assert.equal(m.opportunities,6);assert.equal(m.opportunity_wins,3);assert.equal(m.checkout_visit_pct,50);
  assert.equal(m.attempts,4);assert.equal(m.attempt_wins,3);assert.equal(m.checkout_attempt_pct,75);assert.equal(m.known_opportunities,4);
  assert.deepEqual(m.bands,{'0–39':3,'40–59':2,'60–99':1,'100–139':0,'140–179':0,'180':0});assert.equal(m.doubles.D10.attempts,1);assert.equal(m.doubles.D10.checkouts,1);
  assert.equal(data.mixed_rules,true);assert.equal((await analyze({start:501})).sample_games,0);
  const bm=row(await match(g1),b.id);assert.equal(bm.darts,1);assert.equal(bm.busts,1);assert.equal(bm.points,0);assert.equal(bm.average3,0);assert.equal(bm.checkout_attempt_pct,0);
  pass('manual fixture: weighted 180/16, first-nine100/9, attempt75% versus visit50%, real bust darts, null versus zero');

  let di=await create(cfg(40,'double'));di=await hit(di,'S20');di=await hit(di,'D10');di=await hit(di,'D10');m=row(await match(di));assert.equal(m.points,40);assert.equal(m.darts,3);assert.equal(m.average3,40);assert.equal(m.checkout_attempt_pct,null);
  let two=await create();two=await hit(two,'S20');two=await hit(two,'D10');assert.equal(row(await match(two)).best_leg.value,2);
  let boundary=await create();boundary=await sum(boundary,0);boundary=await sum(boundary,0);boundary=await sum(boundary,60,1);boundary=await sum(boundary,0);boundary=await sum(boundary,0);boundary=await sum(boundary,0);boundary=await sum(boundary,40,3,true);m=row(await match(boundary));assert.equal(m.darts,10);assert.equal(m.first9,null);assert.equal(m.first9_eligible,1);
  pass('checkout lengths1/2/3, pre-opening darts included; first-nine crossing an aggregate stays unknown');

  const before=await match(g1);const targetDart=g1.darts.find(d=>d.field==='S20');const change={game_id:g1.game.id,kind:'dart',dart_id:targetDart.id,field:'D20',reason:'Wcześniejsze zejście',withdraw_dependent:true,expected_revision:g1.game.revision};
  const preview=ok(await request('history-preview',change));assert.equal(row(await match(g1)).darts,6);assert.equal(preview.withdrawn_darts,2);
  const body={...change,preview_token:preview.preview_token,command_id:randomUUID()};g1=ok(await request('history-apply',body));assert.deepEqual(ok(await request('history-apply',body)),g1);
  m=row(await match(g1));assert.equal(m.points,40);assert.equal(m.darts,4);assert.equal(m.average3,30);assert.equal(m.attempts,0);assert.equal(m.checkout_attempt_pct,null);assert.equal((await match(g1)).matches[0].quality.previous_versions>0,true);
  pass('historical correction withdraws suffix, clears changed declarations and retry does not double-count');

  let active=await create();active=await sum(active,20);assert.equal(row(await match(active)).wins,0);
  for(const kind of ['cancelled','interrupted','walkover','surrender']) {
    let g=await create();g=await sum(g,20);g=ok(await command('game-adjudicate',{game_id:g.game.id,kind,reason:'Decyzja testowa',...(['walkover','surrender'].includes(kind)?{winner_id:a.id}:{})},g.game.revision));
    m=row(await match(g));assert.equal(m.points,kind==='surrender'?20:0);assert.equal(m.wins,0);assert.equal(m.administrative[kind],1);assert.equal(m.won_legs,0);
  }
  g2=ok(await command('result-confirm',{game_id:g2.game.id,reason:'Sprawdzone'},g2.game.revision));assert.equal((await analyze({status:'confirmed'})).sample_games,1);
  g2=ok(await command('result-reopen',{game_id:g2.game.id,reason:'Sprawdzam'},g2.game.revision));assert.equal((await analyze({status:'confirmed'})).sample_games,0);
  pass('unfinished/admin/confirmation/reopen policies, no invented wins, legs or averages');

  a=ok(await command('profile-archive',{player_id:a.id,profile_revision:a.profile_revision,archived:true}));
  assert.equal(ok(await request('dashboard')).players.some(p=>p.id===a.id),false);assert.equal((await read(g1)).players[0].id,a.id);
  reject(await command('player-delete',{player_id:a.id}),409,'player-delete-disabled');reject(await command('game-create',{player1_id:a.id,player2_id:b.id,config:cfg()}),409,'profile-inactive');
  a=ok(await command('profile-archive',{player_id:a.id,profile_revision:a.profile_revision,archived:false}));
  const conflict=ok(await request('profile-merge-preview',{source_id:a.id,target_id:b.id,reason:'Duplikat'}));assert.equal(conflict.can_apply,false);assert.ok(conflict.conflicts.some(c=>c.game_id===g1.game.id));
  const duplicate=ok(await command('player-create',{name:'Ala drugi profil'}));
  let dg=await create(cfg(),duplicate.id,b.id);dg=await sum(dg,40,1,true); // one extra real leg, 40 points / 1 dart
  let mp=ok(await request('profile-merge-preview',{source_id:duplicate.id,target_id:a.id,reason:'Ta sama osoba'}));assert.equal(mp.can_apply,false); // A still has active game
  active=ok(await command('game-adjudicate',{game_id:active.game.id,kind:'cancelled',reason:'Koniec próby'},active.game.revision));
  mp=ok(await request('profile-merge-preview',{source_id:duplicate.id,target_id:a.id,reason:'Ta sama osoba'}));assert.equal(mp.can_apply,true);
  const pre=row(await analyze({player_id:a.id}));const mergeBody={source_id:duplicate.id,target_id:a.id,reason:'Ta sama osoba',preview_token:mp.preview_token,...meta(0)};ok(await request('profile-merge',mergeBody));ok(await request('profile-merge',mergeBody));
  const post=row(await analyze({player_id:a.id}));assert.equal(post.points,pre.points+40);assert.equal(post.darts,pre.darts+1);assert.equal((await read(dg)).game.player1_id,duplicate.id);assert.equal(ok(await request('profile',undefined,admin,{id:duplicate.id})).canonical_id,a.id);
  pass('archive/restore, old delete disabled, active/self-match merge blocked, alias preserves IDs and counts once');

  const renamed={...gear,name:'Nowa nazwa',equipment_id:gear.id,equipment_revision:gear.revision,archived:true};ok(await command('equipment-save',renamed));assert.equal((await read(g1)).equipment[0].name_snapshot,'Zestaw Żółty');assert.equal((await analyze({equipment_id:gear.id})).sample_games,1);
  const formula=ok(await command('player-create',{name:'=SUM(1;2) "Żółć"'}));let fg=await create(cfg(),formula.id,b.id);fg=await sum(fg,40,1,true);
  const exurl=new URL('http://127.0.0.1:18216/api/index.php?action=analysis-export');for(const [k,v] of Object.entries({...all,player_id:formula.id,format:'csv'}))exurl.searchParams.set(k,v);
  const csv=await (await fetch(exurl,{headers:{Cookie:admin.cookie}})).text();assert.ok(csv.includes("'=SUM(1;2)"));assert.ok(csv.includes('""Żółć""'));assert.ok(csv.includes('metrics_version;1'));assert.ok(csv.includes(';120;'));
  exurl.searchParams.set('format','json');const exported=await (await fetch(exurl,{headers:{Cookie:admin.cookie}})).json();assert.equal(exported.sample_games,1);assert.equal(exported.players[0].metrics.average3,120);assert.equal(/token_hash|device_id|observation_id|session_hash|csrf_token|password_hash/.test(JSON.stringify(exported)),false);
  pass('equipment snapshot survives archive/rename; filtered CSV/JSON, Polish quotes/separators and formula neutralization, no technical secrets');

  // Explicit UTC instants around both Warsaw DST changes, independent expected dates.
  sql(`$p->exec("UPDATE games SET created_at='2026-10-24T22:30:00.000Z' WHERE id=${g1.game.id};UPDATE games SET created_at='2026-10-25T22:30:00.000Z' WHERE id=${g2.game.id};UPDATE games SET created_at='2026-10-25T23:00:00.000Z' WHERE id=${g3.game.id}");`);
  assert.equal((await analyze({from:'2026-10-25',to:'2026-10-25'})).sample_games,2);
  sql(`$p->exec("UPDATE games SET created_at='2026-03-28T23:00:00.000Z' WHERE id=${g1.game.id};UPDATE games SET created_at='2026-03-29T21:59:59.999Z' WHERE id=${g2.game.id};UPDATE games SET created_at='2026-03-29T22:00:00.000Z' WHERE id=${g3.game.id}");`);
  assert.equal((await analyze({from:'2026-03-29',to:'2026-03-29'})).sample_games,2);reject(await request('analysis',undefined,admin,{from:'2026-02-30'}),422,'invalid-date');
  let page=ok(await request('history-search',undefined,admin,{...all,limit:2}));const firstIds=page.items.map(g=>g.id);let fresh=await create();fresh=await sum(fresh,40,1,true);const page2=ok(await request('history-search',undefined,admin,{...all,limit:2,cursor:page.next_cursor}));assert.equal(page2.items.some(g=>firstIds.includes(g.id)||g.id===fresh.game.id),false);reject(await request('history-search',undefined,admin,{...all,start:501,cursor:page.next_cursor}),422,'invalid-cursor');
  pass('Warsaw25-hour/23-hour days and stable cursor despite new matches; changed filters reject old cursor');

  for(const role of ['camera','viewer','operator']) {
    const code=ok(await command('device-code-create',{role,game_id:role==='operator'?null:fresh.game.id,expires_hours:1}));const dev=ok(await request('device-join',{code:code.code,device_name:role,join_id:randomUUID()},{formats:true,operations:true}));const actor={token:dev.token,formats:true,operations:true};
    reject(await request('analysis',undefined,actor),403,'admin-required');reject(await command('profile-archive',{player_id:b.id,profile_revision:0,archived:true},0,actor),403,'admin-required');reject(await request('analysis-export',undefined,actor),403,'admin-required');
  }
  pass('server denies profile edits, analysis and export to devices including unprivileged operator');
  assert.equal((await analyze({equipment_id:gear.id,player_id:b.id})).sample_games,0); // opponent's gear is not own gear
  reject(await command('game-delete',{game_id:fresh.game.id},fresh.game.revision),409,'history-protected');
  let invalid=await create();const prior=await read(invalid);
  reject(await command('visit-create',{game_id:invalid.game.id,player_id:a.id,score:40,darts_used:1,double_confirmed:true,recording_level:'extended',checkout_attempts:0},0),422,'invalid-attempts');
  assert.deepEqual(await read(invalid),prior);
  const empty=ok(await command('player-create',{name:'Pusty duplikat'}));const another=ok(await command('player-create',{name:'Docelowy bez meczów'}));let plan=ok(await request('profile-merge-preview',{source_id:empty.id,target_id:another.id,reason:'Test transakcji'}));
  sql(`$p->exec("CREATE TRIGGER fail_merge BEFORE INSERT ON profile_merges BEGIN SELECT RAISE(FAIL,'injected'); END");`);
  const mergeCommand={source_id:empty.id,target_id:another.id,reason:'Test transakcji',preview_token:plan.preview_token,...meta(0)};
  reject(await request('profile-merge',mergeCommand),500);assert.equal(ok(await request('profile',undefined,admin,{id:empty.id})).canonical_id,empty.id);
  sql(`$p->exec('DROP TRIGGER fail_merge');`);ok(await request('profile-merge',mergeCommand));
  const updated=ok(await command('profile-save',{...another,player_id:another.id,profile_revision:1,name:'Zmieniony cel',is_guest:false}));
  assert.equal(updated.id,another.id);
  pass('annotation rollback, protected match deletion, own-equipment filter, merge transaction rollback and exact retry');
  assert.equal(sql(`echo $p->query('PRAGMA integrity_check')->fetchColumn();`),'ok');assert.equal(sql(`echo count($p->query('PRAGMA foreign_key_check')->fetchAll());`),'0');
  console.log(`RESULT ${count} groups PASS; scratch=${scratch}`);
}catch(e){console.error(e);console.error(log.slice(-5000));process.exitCode=1;}finally{server?.kill();}
