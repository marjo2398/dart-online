import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync,mkdirSync,writeFileSync,existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { publicFixture } from './public-fixture.mjs';
const f=await publicFixture();
try {
  const android=resolve(f.repo,'../dart-lens');const jdk=join(android,'.tools/jdk-17.0.20.1+1/bin');
  const classes=process.env.DART_ANDROID_CLASSES||join(android,'app/build/tmp/kotlin-classes/release');
  assert(existsSync(join(classes,'pl/dartlens/localplay/LocalStatistics.class')),'Run the existing Android unit test compilation first. Do not rebuild the APK.');
  function jars(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?jars(join(dir,e.name)):e.name.endsWith('.jar')?[join(dir,e.name)]:[]);}
  const jarsRoot=join(android,'.tools/gradle-home/caches/modules-2/files-2.1');
  const dependencies=[...jars(join(jarsRoot,'org.json/json')),...jars(join(jarsRoot,'org.jetbrains.kotlin/kotlin-stdlib'))];
  const out=join(f.repo,'.tools/public-web-20261029/statistics-contract');mkdirSync(out,{recursive:true});
  const delimiter=process.platform==='win32'?';':':';const cp=[classes,...dependencies].join(delimiter);
  execFileSync(join(jdk,process.platform==='win32'?'javac.exe':'javac'),['-encoding','UTF-8','-cp',cp,'-d',out,join(f.repo,'backendtests/fixtures/ApkStatisticsFixture.java')],{stdio:'pipe'});
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.error));return r.data;};const web={};web.csrf=ok(await f.request('public-session',undefined,web)).csrf_token;
  const native=ok(await f.request('app-authorize',{password:f.password,device_name:'APK statistics parity',join_id:randomUUID()},{}));
  const results=[];
  for(const kind of ['normal','nine','partial','draw','admin','cancelled','surrender','walkover']){
    const actual=JSON.parse(execFileSync(join(jdk,process.platform==='win32'?'java.exe':'java'),['-cp',[out,cp].join(delimiter),'ApkStatisticsFixture',kind],{encoding:'utf8'}));
    const accepted=ok(await f.request('local-game-import',actual.payload,native));const report=ok(await f.request('match-analysis',undefined,web,{game_id:accepted.game_id}));
    for(let player=0;player<2;player++){
    const server=report.players[player].metrics,local=actual.locals[player];
    for(const key of ['points','darts','average1','average3','first9','checkouts','wins','losses','draws','won_legs','lost_legs','won_sets','lost_sets','holds','breaks','busts','field_visits','partial_visits','known_source_visits','decider_wins','decider_losses']){
      if(local[key]===null||server[key]===null)assert.equal(local[key],server[key],kind+':'+key);else assert(Math.abs(local[key]-server[key])<1e-9,kind+':'+key);
    }
    for(const key of ['sectors','leg_lengths'])assert.deepEqual(Object.entries(local[key]||{}).sort(),Object.entries(server[key]||{}).sort());
    for(const [key,value] of Object.entries(server.bands))assert.equal(local.bands[key]||0,value);
    assert.equal(local.checkout_attempts,server.known_attempt_visits?server.attempts:null);
    for(const key of ['highest_visit','highest_checkout'])assert.equal(local[key],server[key]?.value??null,kind+':'+key);
    assert.equal(local.games,server.confirmed+server.pending);
    assert.deepEqual(Object.entries(local.administrative).sort(),Object.entries(server.administrative).sort());
    results.push({kind,player,local,server});}
    console.log('PASS actual APK classes → import → WWW metrics (both players): '+kind);
  }
  writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));
} finally { f.close(); }
