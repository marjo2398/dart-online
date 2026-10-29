<?php
declare(strict_types=1);
const LOCAL_RULES_CONTRACT='dart-lens-x01/1';
function migrateOffline(PDO $pdo):void {
 if((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()>=7)return;
 transaction($pdo,static function()use($pdo):void {
  if((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()>=7)return;
  if(sqlOne($pdo,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('local_imports','local_profile_links')"))throw new RuntimeException('Unexpected offline migration table; database preserved.');
  ensureColumn($pdo,'devices','native_admin','INTEGER NOT NULL DEFAULT 0');
  $pdo->exec("CREATE TABLE IF NOT EXISTS local_imports(origin_id TEXT NOT NULL,local_game_id TEXT NOT NULL,payload_hash TEXT NOT NULL,game_id INTEGER NOT NULL REFERENCES games(id),result_json TEXT NOT NULL,PRIMARY KEY(origin_id,local_game_id)); CREATE TABLE IF NOT EXISTS local_profile_links(origin_id TEXT NOT NULL,local_id TEXT NOT NULL,server_id INTEGER NOT NULL REFERENCES players(id),PRIMARY KEY(origin_id,local_id)); UPDATE schema_meta SET value='7' WHERE key='schema_version';");
 });
}
function authorizeNative(PDO $pdo,array $config,array $b):array {
 $password=$b['password']??null;$name=$b['device_name']??null;$join=requiredUuid($b,'join_id');
 if(!is_string($password)||$password===''||strlen($password)>256||!is_string($name)||trim($name)===''||strlen($name)>120||!preg_match('//u',$name)||preg_match('/[\x00-\x1F\x7F]/',$name))problem(422,'invalid-credentials','Podaj PIN/hasło i nazwę urządzenia.');
 $ip=clientIpHash();$now=time();
 transaction($pdo,static function()use($pdo,$ip,$now):void {
  $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at<?')->execute([$now-LOGIN_WINDOW_SECONDS]);
  if((int)sqlOne($pdo,'SELECT COUNT(*) n FROM login_attempts WHERE ip_hash=?',[$ip])['n']>=LOGIN_MAX_ATTEMPTS)problem(429,'login-rate-limited','Zbyt wiele prób logowania.');
  $pdo->prepare('INSERT INTO login_attempts(ip_hash,attempted_at) VALUES(?,?)')->execute([$ip,$now]);
 });
 if(!password_verify($password,(string)$config['password_hash']))problem(401,'invalid-credentials','Nieprawidłowy PIN lub hasło.');
 return transaction($pdo,static function()use($pdo,$b,$name,$join,$ip,$now):array {
  $old=null;
  if(isset($b['device_id'],$b['previous_token'])){
   $old=sqlOne($pdo,'SELECT * FROM devices WHERE id=?',[$b['device_id']]);
   if(!$old||!is_string($b['previous_token'])||!hash_equals($old['token_hash'],hash('sha256',$b['previous_token'])))problem(409,'credential-mismatch','Nie można odtworzyć tożsamości oczekującej operacji.');
  }
  $id=$old['id']??uuid();$token=$old?$b['previous_token']:deviceToken($id,$join);
  // Renewal keeps the same token/actor. Losing this response cannot strand an uncertain score command.
  if($old)$pdo->prepare("UPDATE devices SET name=?,role='operator',game_id=NULL,expires_at=?,revoked=0,permissions_json=?,native_admin=1 WHERE id=?")->execute([trim($name),$now+43200,canonicalJson(MATCH_PERMISSIONS),$id]);
  else $pdo->prepare("INSERT INTO devices(id,name,role,game_id,token_hash,expires_at,join_id,join_hash,permissions_json,native_admin) VALUES(?,?,'operator',NULL,?,?,?,?,?,1)")->execute([$id,trim($name),hash('sha256',$token),$now+43200,$join,hash('sha256',$join),canonicalJson(MATCH_PERMISSIONS)]);
  $pdo->prepare('DELETE FROM login_attempts WHERE ip_hash=?')->execute([$ip]);
  return ['token'=>$token,'device'=>publicDevice(sqlOne($pdo,'SELECT * FROM devices WHERE id=?',[$id]))];
 });
}
function importLocalGame(PDO $pdo,array $actor,array $b):array {
 assertScope($actor,null);
 if(!in_array($actor['role'],['admin','operator'],true)||!in_array('score',actorPermissions($actor),true))problem(403,'operator-required','Synchronizacja wymaga operatora z prawem zapisu.');
 if(($b['contract']??null)!==LOCAL_RULES_CONTRACT)problem(409,'rules-version','Nieobsługiwana wersja zasad.');
 $origin=requiredUuid($b,'origin_id');$local=requiredUuid($b,'local_game_id');$share=requiredBool($b,'share');
 $payload=hash('sha256',canonicalJson(array_diff_key($b,['command_id'=>true,'expected_revision'=>true])));
 $old=sqlOne($pdo,'SELECT * FROM local_imports WHERE origin_id=? AND local_game_id=?',[$origin,$local]);
 if($old){if(!hash_equals($old['payload_hash'],$payload))problem(409,'import-conflict','Ten mecz już zaimportowano z inną historią. Nie nadpisano nowszych danych.');$result=json_decode($old['result_json'],true,512,JSON_THROW_ON_ERROR);$result['command_id']=$b['command_id'];return $result;}
 $players=$b['players']??null;$mapping=$b['mappings']??null;$commands=$b['commands']??null;
 if(!is_array($players)||count($players)!==2||!is_array($mapping)||count($mapping)!==2||!is_array($commands)||count($commands)>3000)problem(422,'invalid-import','Wymagane dwa profile, dwa jawne mapowania i ograniczona historia.');
 $ids=[];$links=[];$newArchived=[];
 foreach($players as $i=>$profile){
  if(!is_array($profile))problem(422,'invalid-profile','Niepoprawny profil.');
  $localId=requiredUuid($profile,'id');$map=$mapping[$i];$linked=sqlOne($pdo,'SELECT server_id FROM local_profile_links WHERE origin_id=? AND local_id=?',[$origin,$localId]);
  if(($map['mode']??null)==='existing'){
   $id=requiredInt($map,'server_id',1,PHP_INT_MAX);$server=profileRow($pdo,$id);
   if($server['archived']||$server['merged_into']!==null)problem(409,'profile-inactive','Wybrany profil jest archiwalny lub scalony.');
   if((int)$server['profile_revision']!==requiredInt($map,'profile_revision',0,PHP_INT_MAX))problem(409,'profile-conflict','Profil serwera zmienił się. Wybierz tożsamość ponownie.');
   if(($map['update_profile']??false)===true){
    assertProfileAdmin($actor);$values=$profile;$values['player_id']=$id;$values['profile_revision']=(int)$server['profile_revision'];
    unset($values['id'],$values['archived']);saveProfile($pdo,$values);
    if(($profile['archived']??false)===true)$newArchived[]=$id;
   }
  }elseif(($map['mode']??null)==='new'){
   if($linked)problem(409,'profile-conflict','Ten lokalny profil ma już mapowanie. Wybierz przypisany profil serwera.');
   $name=$map['name']??$profile['name']??null;$created=createPlayer($pdo,['name'=>$name]);$id=$created['id'];
   $values=$profile;$values['name']=$name;$values['is_guest']=(bool)($profile['is_guest']??false);$v=profileValues($values);
   $pdo->prepare('UPDATE players SET name=?,nickname=?,club=?,throwing_hand=?,notes=?,preferred_double=?,hints_enabled=?,is_guest=? WHERE id=?')->execute(array_merge($v,[$id]));
   if(($profile['archived']??false)===true)$newArchived[]=$id;
  }else problem(422,'identity-required','Wybierz istniejący profil albo utwórz odrębny.');
  if($linked&&(int)$linked['server_id']!==$id)problem(409,'profile-conflict','Nie można automatycznie zmienić wcześniejszej tożsamości.');
  $ids[$i+1]=$id;$links[]=['local_id'=>$localId,'server_id'=>$id,'profile_revision'=>(int)profileRow($pdo,$id)['profile_revision']];
  if(!$linked)$pdo->prepare('INSERT INTO local_profile_links VALUES(?,?,?)')->execute([$origin,$localId,$id]);
 }
 if($ids[1]===$ids[2])problem(422,'players-must-differ','Obaj zawodnicy nie mogą wskazywać tego samego profilu.');
 $c=validateFormat(formatObject($b,'config'));$frozen=$c;$c['starters']['method']='fixed';$s=createFormattedGame($pdo,['player1_id'=>$ids[1],'player2_id'=>$ids[2],'config'=>$c]);$id=$s['game']['id'];
 $pdo->prepare('UPDATE games SET config_json=?,legacy_compatible=? WHERE id=?')->execute([canonicalJson($frozen),(int)compatibleFormat($frozen),$id]);
 $visitIds=[];$dartIds=[];$nextVisit=1;$seen=[];$finishedAt=null;
 $allowed=['dart-create','visit-create','remaining-create','visit-undo','history-correct','starter-select','game-pause','game-resume','game-adjudicate','result-confirm','result-reopen'];
 foreach($commands as $index=>$command){
  $action=$command['action']??null;$input=$command['body']??null;
  if(!in_array($action,$allowed,true)||!is_array($input))problem(422,'invalid-command','Nieobsługiwana komenda historii.');
  $key=requiredUuid($input,'command_id');if(isset($seen[$key]))problem(422,'duplicate-command','Powtórzony identyfikator w historii.');$seen[$key]=true;
  if(requiredInt($input,'expected_revision',0,3000)!==$index)problem(422,'invalid-revision','Historia ma nieciągłą rewizję.');
  $recorded=isset($command['recorded_at'])?offlineTimestamp($command['recorded_at']):null;
  $before=fetchGameSnapshot($pdo,$id);$input['expected_revision']=$before['game']['revision'];$input['game_id']=$id;
  foreach(['player_id','winner_id'] as $k)if(isset($input[$k]))$input[$k]=$ids[requiredInt($input,$k,1,2)];
  if($action==='history-correct'){
   $action='history-apply';$localVisit=requiredInt($input,'visit_id',1,PHP_INT_MAX);if(!isset($visitIds[$localVisit]))problem(422,'invalid-history','Nie znaleziono wizyty korekty.');$input['visit_id']=$visitIds[$localVisit];
   if(($input['kind']??null)==='dart'){$localDart=$input['dart_id']??'';if(!isset($dartIds[$localDart]))problem(422,'invalid-history','Nie znaleziono lotki korekty.');$input['dart_id']=$dartIds[$localDart];}
   $plan=correctionPlan($pdo,$input);$input['preview_token']=$plan['preview_token'];
  }
  requireOperationPermission($actor,$action);assertMatchOperation(fetchGameRow($pdo,$id),$action,$input);
  $scored=dispatchCommand($pdo,$actor,$action,$input);annotateScoring($pdo,$action,$input,$scored);
  if($action==='dart-create'&&($input['source']??null)==='camera-confirmed'){
   // Import preserves the human-confirmed local camera provenance, not a new autonomous observation.
   $v=sqlOne($pdo,'SELECT id FROM visits WHERE game_id=? AND active=1 ORDER BY visit_no DESC LIMIT 1',[$id]);
   $pdo->prepare("UPDATE darts SET source='camera-confirmed' WHERE id=?")->execute([$scored['dart_id']]);
   $pdo->prepare("UPDATE visits SET source='camera-confirmed' WHERE id=?")->execute([$v['id']]);
  }
  bumpGame($pdo,$id);$after=fetchGameSnapshot($pdo,$id);
  if($after['game']['status']==='active')$finishedAt=null;
  elseif($before['game']['status']==='active')$finishedAt=$recorded;
  if(in_array($action,['dart-create','visit-create','remaining-create'],true)){
   $last=$after['visits'][count($after['visits'])-1];
   if($before['partial_visit']===null){$visitIds[$nextVisit++]=$last['id'];if($recorded!==null)$pdo->prepare('UPDATE visits SET created_at=? WHERE id=?')->execute([$recorded,$last['id']]);}
   if($action==='dart-create'){$dart=$after['darts'][count($after['darts'])-1]['id'];$dartIds[$key]=$dart;if($recorded!==null)$pdo->prepare('UPDATE darts SET created_at=? WHERE id=?')->execute([$recorded,$dart]);}
  }
  if($recorded!==null){
   if($action==='result-confirm')$pdo->prepare('UPDATE games SET confirmed_at=? WHERE id=?')->execute([$recorded,$id]);
   if($action==='history-apply')$pdo->prepare('UPDATE record_versions SET created_at=? WHERE game_id=? AND revision=?')->execute([$recorded,$id,$after['game']['revision']]);
   if(in_array($action,['game-adjudicate','result-confirm','result-reopen'],true))$pdo->prepare('UPDATE result_decisions SET created_at=? WHERE game_id=? AND revision=?')->execute([$recorded,$id,$after['game']['revision']]);
  }
  $pdo->prepare('INSERT INTO audit(actor,command_id,game_id,action,target_id,original,actor_context,details_json) VALUES(?,?,?,?,?,?,?,?)')->execute([$actor['actor'],$key,$id,'local-replay:'.$action,null,canonicalJson($before),canonicalJson(actorContext($actor)),canonicalJson(['origin_id'=>$origin,'local_game_id'=>$local])]);
 }
 $snapshot=fetchGameSnapshot($pdo,$id);
 $g=$snapshot['game'];$p=$snapshot['players'];$position=static fn($value)=>$value===null?null:array_search($value,$ids,true);
 $actual=['scores'=>array_column($p,'remaining'),'legs'=>array_column($p,'legs'),'sets'=>array_column($p,'sets'),'darts'=>array_column($p,'darts'),
  'current'=>$position($g['current_player_id']),'winner'=>$position($g['winner_id']),'starter'=>$position($g['leg_starter_id']),
  'leg'=>$g['current_leg'],'set'=>$g['current_set'],'phase'=>$g['phase'],'status'=>$g['status'],'paused'=>$g['is_paused'],'confirmed'=>$g['confirmed_at']!==null];
 if(!isset($b['expected_state'])||canonicalJson($actual)!==canonicalJson($b['expected_state']))problem(422,'rules-replay-mismatch','Odtworzony stan różni się od telefonu. Import wycofano; lokalna gra pozostaje zachowana.');
 if(!$share&&$snapshot['game']['status']!=='finished')problem(422,'active-archive','Archiwum wymaga zakończonego meczu.');
 if(isset($b['created_at'])){
  $created=offlineTimestamp($b['created_at']);$pdo->prepare('UPDATE games SET created_at=? WHERE id=?')->execute([$created,$id]);
 }
 if($finishedAt!==null&&$g['status']==='finished')$pdo->prepare('UPDATE games SET finished_at=? WHERE id=?')->execute([$finishedAt,$id]);
 foreach($newArchived as $archivedId)$pdo->prepare('UPDATE players SET archived=1 WHERE id=?')->execute([$archivedId]);
 $pdo->prepare('UPDATE games SET import_mode=? WHERE id=?')->execute([$share?'shared':'archive',$id]);
 rebuildAllPlayerStats($pdo);$snapshot=fetchGameSnapshot($pdo,$id);
 $result=['local_game_id'=>$local,'command_id'=>$b['command_id'],'game_id'=>$id,'players'=>$links,'snapshot'=>$snapshot,'owner'=>'server'];
 $pdo->prepare('INSERT INTO local_imports VALUES(?,?,?,?,?)')->execute([$origin,$local,$payload,$id,canonicalJson($result)]);return $result;
}
function offlineTimestamp($value):string {
 if(!is_string($value)||strlen($value)>40||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/D',$value))problem(422,'invalid-timestamp','Nieprawidłowy czas zapisanej historii.');
 try{$date=new DateTimeImmutable($value);}catch(Throwable $error){problem(422,'invalid-timestamp','Nieprawidłowy czas zapisanej historii.');}
 if($date->format('Y-m-d\TH:i:s')!==substr($value,0,19)||$date->getTimestamp()<0||$date->getTimestamp()>time()+300)problem(422,'invalid-timestamp','Sprawdź zegar telefonu przed synchronizacją; lokalna gra jest zachowana.');
 return $date->format('Y-m-d\TH:i:s.v\Z');
}
