import {mkdtempSync,mkdirSync,writeFileSync,cpSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');const php=process.env.DART_TEST_PHP||resolve(repo,'../dart-lens/.tools/online-runtime/php/php.exe');const args=['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
const scratch=mkdtempSync(join(tmpdir(),'dart-v6-migration-'));const api=join(scratch,'api');mkdirSync(join(api,'data'),{recursive:true});
for(const f of ['index.php','formats.php','sync.php','operations.php'])writeFileSync(join(api,f),execFileSync('git',['show',`48b55f2:public/api/${f}`],{cwd:repo}));
const dump=`function snapshotData($p){$out=[];foreach(['players','games','visits','darts','commands','audit','devices','device_codes','record_versions','result_decisions','templates'] as $t){$out[$t]=$p->query('SELECT * FROM '.$t.' ORDER BY rowid')->fetchAll();}return $out;}`;
writeFileSync(join(scratch,'seed.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';$p=openDatabase();migrateDatabase($p);$_SERVER['HTTP_X_DART_FORMATS']='1';$_SERVER['HTTP_X_DART_OPERATIONS']='2';$_SESSION=['authenticated'=>true,'csrf_token'=>'fixture','expires_at'=>time()+3600];
function cmd($p,$a,$b,$r=0){return runCommand($p,$a,array_merge($b,['command_id'=>uuid(),'expected_revision'=>$r]));}
$a=cmd($p,'player-create',['name'=>'V5 Ala']);$b=cmd($p,'player-create',['name'=>'V5 Bartek']);$g=cmd($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'starting_score'=>501,'legs_to_win'=>1]);$id=$g['game']['id'];
$g=cmd($p,'visit-create',['game_id'=>$id,'player_id'=>$a['id'],'score'=>60,'darts_used'=>3,'double_confirmed'=>false]);$g=cmd($p,'dart-create',['game_id'=>$id,'player_id'=>$b['id'],'field'=>'D20'],1);$g=cmd($p,'visit-undo',['game_id'=>$id],2);$g=cmd($p,'dart-create',['game_id'=>$id,'player_id'=>$b['id'],'field'=>'S20'],3);
$change=['game_id'=>$id,'expected_revision'=>4,'kind'=>'visit','visit_id'=>$g['visits'][0]['id'],'score'=>40,'darts_used'=>3,'double_confirmed'=>false,'reason'=>'V5 korekta','withdraw_dependent'=>false];$plan=correctionPlan($p,$change);cmd($p,'history-apply',array_merge($change,['preview_token'=>$plan['preview_token']]),4);
$c=cmd($p,'device-code-create',['role'=>'operator','game_id'=>null,'expires_hours'=>1]);joinDevice($p,['code'=>$c['code'],'device_name'=>'V5 operator','join_id'=>uuid()]);
${dump}file_put_contents(__DIR__.'/before.json',json_encode(snapshotData($p),JSON_THROW_ON_ERROR));file_put_contents(__DIR__.'/sequences.json',json_encode($p->query('SELECT * FROM sqlite_sequence ORDER BY name')->fetchAll(),JSON_THROW_ON_ERROR));`);
execFileSync(php,[...args,join(scratch,'seed.php')]);
const rollback=join(scratch,'rollback');mkdirSync(join(rollback,'data'),{recursive:true});cpSync(join(api,'data/dart-online.sqlite'),join(rollback,'data/dart-online.sqlite'));
for(const dest of [api,rollback])for(const f of ['index.php','sync.php','formats.php','operations.php','profiles.php','analysis.php'])cpSync(join(repo,'public/api',f),join(dest,f));
writeFileSync(join(scratch,'rollback.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/rollback/index.php';$p=openDatabase();$p->exec('CREATE TABLE equipment(collision TEXT)');$failed=false;try{migrateDatabase($p);}catch(Throwable $e){$failed=true;}if(!$failed || columnExists($p,'players','merged_into') || columnExists($p,'visits','checkout_attempts') || $p->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()!=5)throw new Exception('Migration not atomic');echo 'rollback ok';`);
assert.equal(execFileSync(php,[...args,join(scratch,'rollback.php')],{encoding:'utf8'}),'rollback ok');
writeFileSync(join(scratch,'verify.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';${dump}$p=openDatabase();migrateDatabase($p);migrateDatabase($p);$old=json_decode(file_get_contents(__DIR__.'/before.json'),true);$now=snapshotData($p);
foreach($old as $t=>$rows){foreach($rows as $i=>$row){foreach($row as $key=>$value){if($now[$t][$i][$key]!==$value)throw new Exception('Old data changed '.$t.'.'.$key);}}if(count($rows)!==count($now[$t]))throw new Exception('Count changed');}
foreach($now['visits'] as $v){if($v['checkout_attempts']!==null || $v['recording_level']!==null || $v['source']!==null)throw new Exception('Invented old annotations');}
foreach($now['darts'] as $d){if($d['target']!==null || $d['checkout_attempt']!==null)throw new Exception('Invented old target');}
foreach($now['players'] as $p0){if($p0['archived'] || $p0['is_guest'] || $p0['merged_into']!==null)throw new Exception('Identity changed');}
$oldSeq=json_decode(file_get_contents(__DIR__.'/sequences.json'),true);foreach($oldSeq as $seq){$v=sqlOne($p,'SELECT * FROM sqlite_sequence WHERE name=?',[$seq['name']]);if($v!==$seq)throw new Exception('Sequence changed');}
if($p->query('PRAGMA foreign_key_check')->fetchAll()!==[] || $p->query('PRAGMA integrity_check')->fetchColumn()!=='ok')throw new Exception('Integrity');
$s=fetchGameSnapshot($p,1);if($s['players'][0]['remaining']!==461 || $s['players'][1]['remaining']!==481 || $s['partial_visit']['darts_used']!==1)throw new Exception('Old corrected turn changed');
if(publicDevice($now['devices'][0])['permissions']!==['score','correct_last'])throw new Exception('Grant changed');echo 'preserved';`);
assert.equal(execFileSync(php,[...args,join(scratch,'verify.php')],{encoding:'utf8'}),'preserved');
console.log(`PASS real v5 (48b55f2) → v6: original tables/values/IDs/credentials/commands/versions, no invented data, repeat and injected rollback; scratch=${scratch}`);
