import assert from 'node:assert/strict';
import { readdirSync,readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve,dirname,join,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('status','--porcelain'),'','Commit and verify your changes before packaging.');
const commit=git('rev-parse','HEAD'),version=JSON.parse(readFileSync(join(repo,'package.json'),'utf8')).version;
const output=join(repo,'.tools/artifacts',`www-${version}-public-20261029-${commit.slice(0,7)}`);
assert(!existsSync(output),'Release directory already exists; keep the existing verified artifact.');
const api=['index.php','sync.php','formats.php','operations.php','profiles.php','analysis.php','offline.php','public.php'];
const staticFiles=['index.html',...readdirSync(join(repo,'dist/assets')).map(p=>'assets/'+p)];
const publicFiles=[...staticFiles,...api.map(p=>'api/'+p),'api/.htaccess','api/data/.htaccess'];
const copy=(source,target)=>{mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);};
for(const file of publicFiles)copy(join(repo,'dist',file),join(output,'public',file));
for(const file of ['README.md','PROJECT_STATE.md','DEPLOY_HOSTIDO.md','docs/PUBLIC_ACCESS.md','docs/WEB_UPGRADE.md','docs/API.md','docs/OFFLINE_SYNC.md','docs/METRICS.md','docs/TESTING.md'])copy(join(repo,file),join(output,file));
copy(join(repo,'tools/backup.php'),join(output,'private-tools/backup.php'));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
for(const file of files(join(output,'public'))){
  const name=relative(join(output,'public'),file).replaceAll('\\','/');
  assert(publicFiles.includes(name),'Unexpected public file: '+name);
  assert(!/config\.local|\.sqlite|\.db$|\.bin$|\.log$|\.bak$|\.env|\.key$/i.test(name),'Private file: '+name);
  const data=readFileSync(file);assert(!data.subarray(0,16).toString().startsWith('SQLite format 3'));
  const text=data.toString('utf8');assert(!/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}/.test(text),'Secret-looking literal in '+name);
  if(name.endsWith('.js'))assert(!/LoginScreen|current-password|Zaloguj się PIN-em/.test(text),'Legacy login screen in frontend.');
}
assert(!existsSync(join(output,'public/.htaccess')),'Preserve the production root .htaccess.');
const manifest={version,api_schema:8,metrics_version:1,source_commit:commit,source_branch:git('branch','--show-current'),base_commit:'188658a',created_at:new Date().toISOString(),production_deployed:false,hardware_verified:false,
  changed_files:git('diff','--name-status','188658a',commit).split('\n'),preserve:['.htaccess','api/config.local.php','api/data/ (SQLite/WAL/SHM/device-secret.bin)'],
  files:files(output).map(path=>{const data=readFileSync(path);return {path:relative(output,path).replaceAll('\\','/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};})};
writeFileSync(join(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// Run only this reviewed repository helper; do not change the user's persistent execution policy.
const archive=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(repo,'tools/zip-release.ps1'),'-Directory',output],{encoding:'utf8'}));
console.log(JSON.stringify({archive,directory:output,commit,files:manifest.files.length,public_files:publicFiles.length,verified_no_private_data:true}));
