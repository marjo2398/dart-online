import { mkdirSync,cpSync,writeFileSync,readFileSync,readdirSync,mkdtempSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const php=process.env.DART_TEST_PHP||resolve(repo,'../dart-lens/.tools/online-runtime/php/php.exe');
const args=['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite'];
const scratch=mkdtempSync(join(tmpdir(),'dart-public-migration-'));const api=join(scratch,'api');mkdirSync(join(api,'data'),{recursive:true});
const baseline=['index.php','sync.php','formats.php','operations.php','profiles.php','analysis.php','offline.php'];
for(const file of baseline)writeFileSync(join(api,file),execFileSync('git',['show',`188658a:public/api/${file}`],{cwd:repo}));
const config={version:1,scoring:{start:40,in:'straight',out:'double'},match:{unit:'legs',target:1},legs_per_set:3,deciding:{win_by_two:false,extra_pairs:null},final_set:null,starters:{method:'fixed',player:1,leg_rotation:'alternate',set_rotation:'alternate',decider:'rotation'}};
const fixtures=[true,false,true].map((share,i)=>({command_id:randomUUID(),expected_revision:0,contract:'dart-lens-x01/1',origin_id:randomUUID(),local_game_id:randomUUID(),share,config,
players:[{id:randomUUID(),name:`Migrated ${i} A`,is_guest:false},{id:randomUUID(),name:`Migrated ${i} B`,is_guest:false}],mappings:[{mode:'new'},{mode:'new'}],
commands:[{action:'visit-create',body:{command_id:randomUUID(),expected_revision:0,player_id:1,score:40,darts_used:1,double_confirmed:true}}],
expected_state:{scores:[0,40],darts:[1,0],legs:[1,0],sets:[0,0],current:null,winner:1,starter:1,leg:1,set:1,phase:'finished',status:'finished',paused:false,confirmed:false}}));
writeFileSync(join(scratch,'imports.json'),JSON.stringify(fixtures));
const dump=`function saved($p){$r=[];foreach($p->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll() as $t){$n=$t['name'];$r[$n]=$p->query('SELECT * FROM '.$n.' ORDER BY rowid')->fetchAll();}return $r;}`;
function run(name,code){const file=join(scratch,name+'.php');writeFileSync(file,'<?php '+code);return execFileSync(php,[...args,file],{encoding:'utf8'}).trim();}
run('seed',`define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';$p=openDatabase();migrateDatabase($p);$_SERVER['HTTP_X_DART_FORMATS']='1';$_SERVER['HTTP_X_DART_OPERATIONS']='2';$_SESSION=['authenticated'=>true,'csrf_token'=>'fixture','expires_at'=>time()+3600];$imports=json_decode(file_get_contents(__DIR__.'/imports.json'),true);foreach($imports as $b)runCommand($p,'local-game-import',$b);$p->prepare("DELETE FROM audit WHERE action='local-game-import' AND instr(details_json,?)>0")->execute([$imports[2]['origin_id']]);${dump}file_put_contents(__DIR__.'/before.json',json_encode(saved($p)));$p->exec('PRAGMA wal_checkpoint(TRUNCATE)');`);
const rollback=join(scratch,'rollback');mkdirSync(join(rollback,'data'),{recursive:true});cpSync(join(api,'data/dart-online.sqlite'),join(rollback,'data/dart-online.sqlite'));
for(const dest of [api,rollback])for(const file of readdirSync(join(repo,'public/api')).filter(f=>f.endsWith('.php')&&f!=='config.local.php'))cpSync(join(repo,'public/api',file),join(dest,file));
assert.equal(run('rollback',`define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/rollback/index.php';$p=openDatabase();$p->exec("CREATE TRIGGER reject_public BEFORE UPDATE ON schema_meta WHEN NEW.value='8' BEGIN SELECT RAISE(ABORT,'injected'); END;");$failed=false;try{migrateDatabase($p);}catch(Throwable $e){$failed=true;}if(!$failed||tableExists($p,'web_request_limits')||columnExists($p,'games','import_mode')||$p->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()!=7)throw new Exception('Partial v8 migration');echo 'rollback';`),'rollback');
assert.equal(run('verify',`define('DART_API_LIBRARY_ONLY',true);require __DIR__.'/api/index.php';${dump}$p=openDatabase();migrateDatabase($p);migrateDatabase($p);$before=json_decode(file_get_contents(__DIR__.'/before.json'),true);$after=saved($p);foreach($before as $table=>$rows){if($table==='schema_meta')continue;if(count($rows)!==count($after[$table]))throw new Exception('Row count '.$table);foreach($rows as $i=>$row)foreach($row as $k=>$v)if($after[$table][$i][$k]!==$v)throw new Exception('Changed '.$table.'.'.$k);}
if(array_column($after['games'],'import_mode')!==['shared','archive','unknown'])throw new Exception('Share decision not preserved');$_SERVER['HTTP_X_DART_FORMATS']='1';$_SERVER['HTTP_X_DART_OPERATIONS']='2';foreach([1=>false,2=>true,3=>true] as $id=>$locked)if(fetchGameSnapshot($p,$id)['game']['origin']['read_only']!==$locked)throw new Exception('Archive control');if($p->query('PRAGMA foreign_key_check')->fetchAll()!==[]||$p->query('PRAGMA integrity_check')->fetchColumn()!=='ok')throw new Exception('Integrity');echo 'preserved';`),'preserved');
console.log('PASS v7 (188658a) → v8: all old data/IDs/commands/credentials unchanged; shared/archive audit recovered, missing evidence read-only; repeat and injected rollback atomic');
