import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

export async function publicFixture() {
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const php=process.env.DART_TEST_PHP||resolve(repo,'../dart-lens/.tools/online-runtime/php/php.exe');
  const scratch=mkdtempSync(join(tmpdir(),'dart-public-'));
  const apiDir=join(scratch,'dart/api');const sessions=join(scratch,'sessions');
  mkdirSync(apiDir,{recursive:true});mkdirSync(sessions);
  cpSync(join(repo,'public/api'),apiDir,{recursive:true,filter:p=>!/config\.local\.php$|data[\\/](?!\.htaccess$|\.gitkeep$).+/.test(p)});
  const password=randomUUID();
  const hash=execFileSync(php,['-r','echo password_hash($argv[1],PASSWORD_DEFAULT);',password],{encoding:'utf8'});
  writeFileSync(join(apiDir,'config.local.php'),`<?php return ['password_hash'=>'${hash}','secure_cookie'=>false,'session_name'=>'dart_public_fixture','session_lifetime'=>900];`);
  const args=['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=pdo_sqlite','-d',`session.save_path=${sessions}`];
  let logs='';const children=[];
  async function start() {
    const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
    const child=spawn(php,[...args,'-S',`127.0.0.1:${port}`,'-t',scratch],{windowsHide:true});children.push(child);child.stderr.on('data',d=>{logs+=d;});
    for(let i=0;i<60;i++){try{await fetch(`http://127.0.0.1:${port}/dart/api/index.php?action=session`);return port;}catch{await new Promise(r=>setTimeout(r,100));}}
    throw Error('Local PHP did not respond: '+logs);
  }
  const ports=[await start(),await start()];
  async function request(action,body,actor={},query={},extra={}) {
    const u=new URL(`http://127.0.0.1:${extra.port||ports[0]}/dart/api/index.php`);u.searchParams.set('action',action);
    for(const [k,v] of Object.entries(query))u.searchParams.set(k,String(v));
    const headers={'Accept':'application/json','X-Dart-Formats':'1','X-Dart-Operations':'2'};
    if(actor.public!==false&&!actor.token)headers['X-Dart-Client']='public-web';
    if(actor.cookie)headers.Cookie=actor.cookie;if(actor.token)headers.Authorization='Bearer '+actor.token;
    if(body!==undefined){headers['Content-Type']='application/json';if(actor.csrf)headers['X-CSRF-Token']=actor.csrf;}
    Object.assign(headers,extra.headers);
    const response=await fetch(u,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(response.headers.get('set-cookie')&&!actor.token)actor.cookie=response.headers.get('set-cookie').split(';')[0];
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{return {status:response.status,text,headers:response.headers};}
    return {status:response.status,...data,headers:response.headers};
  }
  function cli(code){const path=join(scratch,'check.php');writeFileSync(path,'<?php '+code);return execFileSync(php,[...args,path],{encoding:'utf8'}).trim();}
  const sql=code=>cli(`$p=new PDO('sqlite:'.__DIR__.'/dart/api/data/dart-online.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);${code}`);
  const close=()=>{for(const child of children)child.kill();};
  return {repo,scratch,apiDir,sessions,ports,password,request,cli,sql,close,logs:()=>logs};
}
export const meta=(revision=0)=>({command_id:randomUUID(),expected_revision:revision});
