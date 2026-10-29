import {mkdtempSync,mkdirSync,writeFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

// Real stage-3 v6 source, never the developer's configured database.
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const php=process.env.DART_TEST_PHP||resolve(repo,'../dart-lens/.tools/online-runtime/php/php.exe');
const args=['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
const scratch=mkdtempSync(join(tmpdir(),'dart-offline-migration-'));const api=join(scratch,'api');
mkdirSync(join(api,'data'),{recursive:true});
const modules=['index.php','sync.php','formats.php','operations.php','profiles.php','analysis.php'];
for(const file of modules)writeFileSync(join(api,file),execFileSync('git',['show',`2a03c9c:public/api/${file}`],{cwd:repo}));
const dump=`function saved($p){$result=[];foreach($p->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_meta'")->fetchAll() as $row){$t=$row['name'];$result[$t]=$p->query('SELECT * FROM '.$t.' ORDER BY rowid')->fetchAll();}return $result;}`;
writeFileSync(join(scratch,'seed.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';$p=openDatabase();migrateDatabase($p);$_SERVER['HTTP_X_DART_FORMATS']='1';$_SERVER['HTTP_X_DART_OPERATIONS']='2';$_SESSION=['authenticated'=>true,'csrf_token'=>'fixture','expires_at'=>time()+3600];
function cmd($p,$a,$b,$r=0){return runCommand($p,$a,array_merge($b,['command_id'=>uuid(),'expected_revision'=>$r]));}
$a=cmd($p,'player-create',['name'=>'Preserve A']);$b=cmd($p,'player-create',['name'=>'Preserve B']);$a=cmd($p,'profile-save',array_merge($a,['player_id'=>$a['id'],'nickname'=>'Real alias','notes'=>'Keep notes','is_guest'=>false]));
$g=cmd($p,'game-create',['player1_id'=>$a['id'],'player2_id'=>$b['id'],'starting_score'=>301,'legs_to_win'=>2]);
$code=cmd($p,'device-code-create',['role'=>'operator','game_id'=>null,'expires_hours'=>1]);$access=joinDevice($p,['code'=>$code['code'],'device_name'=>'Old operator','join_id'=>uuid()]);$_SERVER['HTTP_AUTHORIZATION']='Bearer '.$access['token'];
$pending=['command_id'=>uuid(),'expected_revision'=>0,'game_id'=>$g['game']['id'],'player_id'=>$a['id'],'field'=>'S20'];$result=runCommand($p,'dart-create',$pending);
${dump}file_put_contents(__DIR__.'/before.json',json_encode(saved($p),JSON_THROW_ON_ERROR));file_put_contents(__DIR__.'/pending.json',json_encode([$access,$pending,$result],JSON_THROW_ON_ERROR));`);
execFileSync(php,[...args,join(scratch,'seed.php')]);
const rollback=join(scratch,'rollback');mkdirSync(join(rollback,'data'),{recursive:true});cpSync(join(api,'data/dart-online.sqlite'),join(rollback,'data/dart-online.sqlite'));
for(const dest of [api,rollback])for(const file of [...modules,'offline.php','public.php'])cpSync(join(repo,'public/api',file),join(dest,file));
writeFileSync(join(scratch,'rollback.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/rollback/index.php';$p=openDatabase();$p->exec('CREATE TABLE local_profile_links(collision TEXT)');$failed=false;try{migrateDatabase($p);}catch(Throwable $e){$failed=true;}if(!$failed||columnExists($p,'devices','native_admin')||tableExists($p,'local_imports')||$p->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()!=6)throw new Exception('Partial v7 migration');echo 'rollback';`);
assert.equal(execFileSync(php,[...args,join(scratch,'rollback.php')],{encoding:'utf8'}),'rollback');
writeFileSync(join(scratch,'verify.php'),`<?php define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';${dump}$p=openDatabase();migrateDatabase($p);migrateDatabase($p);$before=json_decode(file_get_contents(__DIR__.'/before.json'),true);$after=saved($p);
foreach($before as $table=>$rows){if(count($rows)!==count($after[$table]))throw new Exception('Row count '.$table);foreach($rows as $i=>$row)foreach($row as $k=>$v)if($after[$table][$i][$k]!==$v)throw new Exception('Data changed '.$table.'.'.$k);}
foreach($after['devices'] as $device)if((int)$device['native_admin']!==0)throw new Exception('Old role upgraded');
[$access,$pending,$old]=json_decode(file_get_contents(__DIR__.'/pending.json'),true);$_SERVER['HTTP_X_DART_FORMATS']='1';$_SERVER['HTTP_X_DART_OPERATIONS']='2';$_SERVER['HTTP_AUTHORIZATION']='Bearer '.$access['token'];$retry=runCommand($p,'dart-create',$pending);if(canonicalJson($old)!==canonicalJson($retry)||count(saved($p)['darts'])!==1)throw new Exception('Old pending command changed');
if($p->query('PRAGMA foreign_key_check')->fetchAll()!==[]||$p->query('PRAGMA integrity_check')->fetchColumn()!=='ok')throw new Exception('Integrity');echo 'preserved';`);
assert.equal(execFileSync(php,[...args,join(scratch,'verify.php')],{encoding:'utf8'}),'preserved');
console.log('PASS real v6 (2a03c9c) → v8: all original data/credentials/roles/IDs/profile metadata/pending command preserved; repeat, rollback, SQLite integrity');
