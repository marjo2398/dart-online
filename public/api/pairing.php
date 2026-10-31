<?php
declare(strict_types=1);
const DART_RELEASE='1.3.0';
function migratePairing(PDO $pdo):void {
 if((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()>=9)return;
 transaction($pdo,static function()use($pdo):void {
  if((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()>=9)return;
  $pdo->exec('CREATE TABLE pairing_codes(id TEXT PRIMARY KEY,code_hash TEXT NOT NULL,issuer_hash TEXT NOT NULL,role TEXT NOT NULL,game_id INTEGER,expires_at INTEGER NOT NULL,device_lifetime INTEGER NOT NULL,permissions_json TEXT NOT NULL,used_by TEXT,invalidated_at INTEGER);
   CREATE UNIQUE INDEX idx_pairing_unused ON pairing_codes(code_hash) WHERE used_by IS NULL AND invalidated_at IS NULL;
   CREATE INDEX idx_pairing_issuer ON pairing_codes(issuer_hash);
   CREATE TABLE pairing_generations(ip_hash TEXT NOT NULL,issuer_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE INDEX idx_pairing_generations ON pairing_generations(created_at);');
  $pdo->exec("UPDATE schema_meta SET value='9' WHERE key='schema_version'");
 });
}
function pairingHash(string $code):string {return hash_hmac('sha256','pair-pin:'.$code,deviceSecret());}
function pairingIssuer(array $body):string {
 $actor=$GLOBALS['snapshotActor'];$slot=isset($body['pairing_session'])?requiredUuid($body,'pairing_session'):'legacy';
 return hash_hmac('sha256',$actor['actor'].'|'.($actor['role']==='public'?session_id():'').'|'.$slot,deviceSecret());
}
function issuePairingCode(PDO $pdo,array $body):array {
 $role=$body['role']??'';if(!in_array($role,['operator','camera','viewer'],true))problem(422,'invalid-role','Wybierz rolę urządzenia.');
 $permissions=grantPermissions($body,$role);$id=($body['game_id']??null)===null?null:requiredInt($body,'game_id',1,PHP_INT_MAX);
 if($id!==null)fetchGameRow($pdo,$id);if($role!=='operator'&&$id===null)problem(422,'game-required','Kamera i widz wymagają meczu.');
 $hours=requiredInt($body,'expires_hours',1,168);$now=time();$issuer=pairingIssuer($body);$ip=clientIpHash();
 $pdo->prepare('DELETE FROM pairing_generations WHERE created_at<?')->execute([$now-900]);
 if((int)sqlOne($pdo,'SELECT COUNT(*) n FROM pairing_generations WHERE created_at>? AND (ip_hash=? OR issuer_hash=?)',[$now-60,$ip,$issuer])['n']>=12)problem(429,'pairing-generation-limited','Zbyt wiele nowych kodów. Odczekaj minutę.');
 $pdo->prepare('INSERT INTO pairing_generations VALUES(?,?,?)')->execute([$ip,$issuer,$now]);
 $pdo->prepare('UPDATE pairing_codes SET invalidated_at=? WHERE used_by IS NULL AND invalidated_at IS NULL AND (expires_at<=? OR issuer_hash=?)')->execute([$now,$now,$issuer]);
 $code=null;for($i=0;$i<100;$i++){$candidate=str_pad((string)random_int(0,9999),4,'0',STR_PAD_LEFT);if(!sqlOne($pdo,'SELECT id FROM pairing_codes WHERE code_hash=? AND used_by IS NULL AND invalidated_at IS NULL',[pairingHash($candidate)])){$code=$candidate;break;}}
 if($code===null)problem(503,'pairing-capacity','Brak wolnego kodu. Spróbuj za pięć minut.');
 $grant=uuid();$pdo->prepare('INSERT INTO pairing_codes(id,code_hash,issuer_hash,role,game_id,expires_at,device_lifetime,permissions_json) VALUES(?,?,?,?,?,?,?,?)')->execute([$grant,pairingHash($code),$issuer,$role,$id,$now+300,$hours*3600,canonicalJson($permissions)]);
 return ['code'=>$code,'pairing_id'=>$grant,'expires_at'=>$now+300,'server_time'=>$now,'role'=>$role,'game_id'=>$id];
}
function storedCommandResult(array $row):array {
 $result=json_decode($row['result'],true,512,JSON_THROW_ON_ERROR);
 if(isset($result['sealed_pairing'])){$bytes=base64_decode($result['sealed_pairing'],true);if($bytes===false||strlen($bytes)<29)throw new RuntimeException('Invalid sealed response');$plain=openssl_decrypt(substr($bytes,28),'aes-256-gcm',deviceSecret(),OPENSSL_RAW_DATA,substr($bytes,0,12),substr($bytes,12,16));if($plain===false)throw new RuntimeException('Cannot read sealed response');$result=json_decode($plain,true,512,JSON_THROW_ON_ERROR);}
 return $result;
}
function sealPairingResult(array $result):array {
 $nonce=random_bytes(12);$tag='';$bytes=openssl_encrypt(canonicalJson($result),'aes-256-gcm',deviceSecret(),OPENSSL_RAW_DATA,$nonce,$tag);if($bytes===false)throw new RuntimeException('Cannot protect pairing response');return ['sealed_pairing'=>base64_encode($nonce.$tag.$bytes)];
}
function recoverDeviceCommand(PDO $pdo,array $actor,array $body):array {
 if(!$actor['device'])problem(403,'device-required','Połącz ponownie uprawnione urządzenie.');
 $oldId=requiredUuid($body,'previous_device_id');$token=$body['previous_token']??null;$old=sqlOne($pdo,'SELECT * FROM devices WHERE id=?',[$oldId]);
 if(!$old||!is_string($token)||!hash_equals($old['token_hash'],hash('sha256',$token)))problem(403,'recovery-proof-invalid','Nie potwierdzono starego dostępu.');
 if(!(bool)$old['revoked']&&(int)$old['expires_at']>time())problem(409,'previous-access-active','Poprzedni dostęp jest nadal ważny.');
 $action=$body['action']??'';$command=$body['command']??null;if(!is_string($action)||!is_array($command))problem(422,'invalid-recovery','Brak zachowanej komendy.');
 $id=requiredUuid($command,'command_id');requiredInt($command,'expected_revision',0,PHP_INT_MAX);
 authorizeCommand($pdo,$actor,$action,$command);
 $row=sqlOne($pdo,'SELECT * FROM commands WHERE actor=? AND command_id=?',['device:'.$oldId,$id]);
 if($row&&!hash_equals($row['payload_hash'],hash('sha256',canonicalJson(['action'=>$action,'body'=>$command]))))problem(409,'command-payload-conflict','UUID miał inną treść.');
 return ['status'=>$row?'saved':'not-saved','command_id'=>$id,'result'=>$row?storedCommandResult($row):null,'replayed'=>false];
}
