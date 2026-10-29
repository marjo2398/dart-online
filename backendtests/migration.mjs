import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const php=process.env.DART_TEST_PHP || resolve(repo,'../dart-lens/.tools/online-runtime/php/php.exe');
const scratch=mkdtempSync(join(tmpdir(),'dart-migration-'));
const api=join(scratch,'api');mkdirSync(join(api,'data'),{recursive:true});
const args=['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
const dump=`function dumpData($p) { $all=[];foreach(['players','games','visits','darts','commands','audit','devices','device_codes','join_attempts','login_attempts'] as $table) { $all[$table]=$p->query('SELECT * FROM '.$table.' ORDER BY rowid')->fetchAll(); }return $all; }`;
for(const file of ['index.php','sync.php']) writeFileSync(join(api,file),execFileSync('git',['show',`a7f7f06:public/api/${file}`],{cwd:repo}));
writeFileSync(join(scratch,'seed.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';
$p=openDatabase();migrateDatabase($p);
$_SESSION=['authenticated'=>true,'csrf_token'=>'fixture','expires_at'=>time()+3600];
function command($p,$action,$body,$revision=0) {return runCommand($p,$action,array_merge($body,['command_id'=>uuid(),'expected_revision'=>$revision]));}
$a=command($p,'player-create',['name'=>'MIGRACJA A']);$b=command($p,'player-create',['name'=>'MIGRACJA B']);
$g=command($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'starting_score'=>301,'legs_to_win'=>1]);
$id=$g['game']['id'];
$g=command($p,'visit-create',['game_id'=>$id,'player_id'=>$a['id'],'score'=>180,'darts_used'=>3,'double_confirmed'=>false]);
$g=command($p,'visit-create',['game_id'=>$id,'player_id'=>$b['id'],'score'=>0,'darts_used'=>3,'double_confirmed'=>false],1);
$g=command($p,'visit-create',['game_id'=>$id,'player_id'=>$a['id'],'score'=>121,'darts_used'=>3,'double_confirmed'=>true],2);
$active=command($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'starting_score'=>501,'legs_to_win'=>2]);
$id=$active['game']['id'];
$active=command($p,'dart-create',['game_id'=>$id,'player_id'=>$a['id'],'field'=>'S20']);
$active=command($p,'dart-correct',['game_id'=>$id,'dart_id'=>$active['darts'][0]['id'],'field'=>'D20'],1);
$grant=command($p,'device-code-create',['role'=>'viewer','game_id'=>$id,'expires_hours'=>1]);
joinDevice($p,['code'=>$grant['code'],'device_name'=>'MIGRACJA WIDZ','join_id'=>uuid()]);
$deleted=command($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'starting_score'=>301,'legs_to_win'=>1]);
command($p,'game-delete',['game_id'=>$deleted['game']['id']]);
$p->exec('UPDATE games SET finished_at=NULL WHERE id=1'); // Historical winner without a finish timestamp.
${dump}
file_put_contents(__DIR__.'/before.json',json_encode(dumpData($p),JSON_THROW_ON_ERROR));
file_put_contents(__DIR__.'/sequence.txt',$p->query("SELECT seq FROM sqlite_sequence WHERE name='games'")->fetchColumn());
`);
execFileSync(php,[...args,join(scratch,'seed.php')]);
const rollback=join(scratch,'rollback');mkdirSync(join(rollback,'data'),{recursive:true});
cpSync(join(api,'data/dart-online.sqlite'),join(rollback,'data/dart-online.sqlite'));
for(const file of ['index.php','sync.php','formats.php','operations.php','profiles.php','analysis.php','offline.php','public.php']) cpSync(join(repo,'public/api',file),join(rollback,file));
writeFileSync(join(scratch,'rollback.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/rollback/index.php';$p=openDatabase();
$p->exec('CREATE TABLE templates(incompatible_column TEXT)');$failed=false;
try{migrateDatabase($p);}catch(Throwable $e){$failed=true;}
if(!$failed || columnExists($p,'games','config_json') || columnExists($p,'visits','opened_after') || $p->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()!=3 || $p->query('PRAGMA foreign_keys')->fetchColumn()!=1)throw new Exception('Migration did not roll back');echo 'rollback ok';`);
assert.equal(execFileSync(php,[...args,join(scratch,'rollback.php')],{encoding:'utf8'}),'rollback ok');
for(const file of ['index.php','sync.php','formats.php','operations.php','profiles.php','analysis.php','offline.php','public.php']) cpSync(join(repo,'public/api',file),join(api,file));
writeFileSync(join(scratch,'verify.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';${dump}
$p=openDatabase();$before=json_decode(file_get_contents(__DIR__.'/before.json'),true,512,JSON_THROW_ON_ERROR);
migrateDatabase($p);migrateDatabase($p);$after=dumpData($p);foreach(['players'=>['nickname','club','throwing_hand','notes','preferred_double','hints_enabled','archived','is_guest','merged_into','profile_revision'],'games'=>['import_mode','context_kind','venue','rule_in','rule_out','match_unit'],'visits'=>['recording_level','checkout_attempts','source'],'darts'=>['target','checkout_attempt']] as $table=>$cols){foreach($after[$table] as &$r){foreach($cols as $col){unset($r[$col]);}}unset($r);}
foreach($after['games'] as &$row) {if(!$row['legacy_compatible'])throw new Exception('Legacy compatibility lost');$c=json_decode($row['config_json'],true);if($c!==defaultFormat((int)$row['starting_score'],(int)$row['legs_to_win']))throw new Exception('Wrong legacy rules');unset($row['config_json'],$row['starter_results'],$row['legacy_compatible'],$row['is_paused'],$row['decision_json'],$row['confirmed_at'],$row['stats_eligible']);}unset($row);
foreach($after['visits'] as &$row) {if(!$row['opened_after'])throw new Exception('Legacy opening lost');unset($row['opened_after'],$row['active'],$row['double_confirmed'],$row['input_mode']);}unset($row);
foreach(['devices','device_codes'] as $table){foreach($after[$table] as &$row){unset($row['permissions_json'],$row['native_admin']);}unset($row);}
foreach($after['audit'] as &$row){unset($row['actor_context'],$row['details_json']);}unset($row);
if($before!==$after)throw new Exception('Data changed');
if($p->query("SELECT seq FROM sqlite_sequence WHERE name='games'")->fetchColumn()!=file_get_contents(__DIR__.'/sequence.txt'))throw new Exception('Deleted id could be reused');
if($p->query('PRAGMA foreign_keys')->fetchColumn()!=1 || $p->query('PRAGMA foreign_key_check')->fetchAll()!==[])throw new Exception('Foreign keys invalid');
if($p->query('SELECT COUNT(*) FROM templates')->fetchColumn()!=4)throw new Exception('Seed duplicated');
$s=fetchGameSnapshot($p,2);if($s['players'][0]['remaining']!==461 || $s['partial_visit']['darts_used']!==1)throw new Exception('Partial visit lost');
if(count(fetchGameRows($p,true))!==1 || count(fetchGameRows($p,false))!==1)throw new Exception('Legacy winner misclassified');
echo 'v3 data, history, devices, commands, stats, IDs, partial visits, FK and repeated migration preserved';
`);
assert.match(execFileSync(php,[...args,join(scratch,'verify.php')],{encoding:'utf8'}),/preserved/);
console.log(`PASS v3 → v8 full fixture preserved, repeat safe, injected failure rolls back; scratch=${scratch}`);
