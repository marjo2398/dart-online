import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const php=process.env.DART_TEST_PHP || resolve(repo,'../dart-lens/.tools/online-runtime/php/php.exe');
const scratch=mkdtempSync(join(tmpdir(),'dart-v5-migration-'));const api=join(scratch,'api');mkdirSync(join(api,'data'),{recursive:true});
const args=['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
for(const name of ['index.php','sync.php','formats.php'])writeFileSync(join(api,name),execFileSync('git',['show',`96bd061:public/api/${name}`],{cwd:repo}));
const dump=`function dumpData($p){$all=[];foreach(['players','games','visits','darts','commands','audit','devices','device_codes','templates'] as $t){$all[$t]=$p->query('SELECT * FROM '.$t.' ORDER BY rowid')->fetchAll();}return $all;}`;
writeFileSync(join(scratch,'seed.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';$p=openDatabase();migrateDatabase($p);$_SERVER['HTTP_X_DART_FORMATS']='1';$_SESSION=['authenticated'=>true,'csrf_token'=>'fixture','expires_at'=>time()+3600];
function cmd($p,$action,$body,$revision=0){return runCommand($p,$action,array_merge($body,['command_id'=>uuid(),'expected_revision'=>$revision]));}
$a=cmd($p,'player-create',['name'=>'V4 A']);$b=cmd($p,'player-create',['name'=>'V4 B']);
$g=cmd($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'starting_score'=>501,'legs_to_win'=>2]);$id=$g['game']['id'];
$g=cmd($p,'dart-create',['game_id'=>$id,'player_id'=>$a['id'],'field'=>'S20']);
$g=cmd($p,'dart-create',['game_id'=>$id,'player_id'=>$a['id'],'field'=>'MISS'],1);$g=cmd($p,'visit-undo',['game_id'=>$id],2);
$c=defaultFormat(2,2);$c['match']['unit']='fixed';$d=cmd($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'config'=>$c]);
$d=cmd($p,'dart-create',['game_id'=>$d['game']['id'],'player_id'=>$a['id'],'field'=>'D1']);$d=cmd($p,'dart-create',['game_id'=>$d['game']['id'],'player_id'=>$b['id'],'field'=>'D1'],1);
$c=defaultFormat(2,1);$c['scoring']['out']='straight';$straight=cmd($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'config'=>$c]);cmd($p,'visit-create',['game_id'=>$straight['game']['id'],'player_id'=>$a['id'],'score'=>2,'darts_used'=>1,'double_confirmed'=>false]);
$grant=cmd($p,'device-code-create',['role'=>'operator','game_id'=>null,'expires_hours'=>1]);joinDevice($p,['code'=>$grant['code'],'device_name'=>'V4 OP','join_id'=>uuid()]);
${dump}file_put_contents(__DIR__.'/before.json',json_encode(dumpData($p),JSON_THROW_ON_ERROR));
file_put_contents(__DIR__.'/sequence.json',json_encode($p->query('SELECT name,seq FROM sqlite_sequence ORDER BY name')->fetchAll(),JSON_THROW_ON_ERROR));`);
execFileSync(php,[...args,join(scratch,'seed.php')]);
const rollback=join(scratch,'rollback');mkdirSync(join(rollback,'data'),{recursive:true});cpSync(join(api,'data/dart-online.sqlite'),join(rollback,'data/dart-online.sqlite'));
for(const dest of [api,rollback])for(const name of ['index.php','sync.php','formats.php','operations.php'])cpSync(join(repo,'public/api',name),join(dest,name));
writeFileSync(join(scratch,'rollback.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/rollback/index.php';$p=openDatabase();$p->exec('CREATE TABLE record_versions(collision TEXT)');$failed=false;try{migrateDatabase($p);}catch(Throwable $e){$failed=true;}
if(!$failed || columnExists($p,'games','confirmed_at') || columnExists($p,'visits','active') || $p->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()!=4 || $p->query('PRAGMA foreign_keys')->fetchColumn()!=1)throw new Exception('Partial failed migration');echo 'rollback ok';`);
assert.equal(execFileSync(php,[...args,join(scratch,'rollback.php')],{encoding:'utf8'}),'rollback ok');
writeFileSync(join(scratch,'verify.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';${dump}$p=openDatabase();migrateDatabase($p);migrateDatabase($p);$all=dumpData($p);
foreach($all['games'] as &$row){unset($row['is_paused'],$row['decision_json'],$row['confirmed_at'],$row['stats_eligible']);}unset($row);
foreach($all['visits'] as &$row){if($row['active']!=1)throw new Exception('Old visit inactive');unset($row['active'],$row['double_confirmed'],$row['input_mode']);}unset($row);
foreach($all['audit'] as &$row){unset($row['actor_context'],$row['details_json']);}unset($row);
foreach(['devices','device_codes'] as $t){foreach($all[$t] as &$row){unset($row['permissions_json']);}unset($row);}
file_put_contents(__DIR__.'/after.json',json_encode($all,JSON_THROW_ON_ERROR));
if($p->query('PRAGMA foreign_keys')->fetchColumn()!=1 || $p->query('PRAGMA foreign_key_check')->fetchAll()!==[] || $p->query('PRAGMA integrity_check')->fetchColumn()!=='ok')throw new Exception('Integrity');
if($p->query("SELECT name,seq FROM sqlite_sequence WHERE name IN ('games','visits') ORDER BY name")->fetchAll()!==array_values(array_filter(json_decode(file_get_contents(__DIR__.'/sequence.json'),true),static fn($r)=>in_array($r['name'],['games','visits']))))throw new Exception('ID sequence changed');
$g=fetchGameSnapshot($p,1);if($g['partial_visit']['darts_used']!==1 || $g['players'][0]['remaining']!==481)throw new Exception('Partial turn lost');$d=fetchGameSnapshot($p,2);if($d['game']['result']!=='draw' || $d['game']['operation_state']!=='resolved' || $d['game']['confirmed_at']!==null)throw new Exception('Old draw changed');
if($p->query('SELECT double_confirmed FROM visits WHERE game_id=3')->fetchColumn()!=0)throw new Exception('Invented double on straight-out');
$op=publicDevice($p->query('SELECT * FROM devices')->fetch());if($op['permissions']!==['score','correct_last'])throw new Exception('Permissions expanded');`);
execFileSync(php,[...args,join(scratch,'verify.php')]);
assert.deepEqual(JSON.parse(readFileSync(join(scratch,'after.json'))),JSON.parse(readFileSync(join(scratch,'before.json'))));
console.log(`PASS v4 → v5: all old data, draw, partial turn, ID sequences, grants, repeat, injected rollback; scratch=${scratch}`);
