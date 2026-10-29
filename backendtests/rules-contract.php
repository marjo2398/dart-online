<?php
// No HTTP, configuration, device secret or production database is opened.
define('DART_RULES_LIBRARY_ONLY',true);
require __DIR__.'/../public/api/index.php';
$_SERVER['HTTP_X_DART_FORMATS']='1';$_SERVER['HTTP_X_DART_OPERATIONS']='2';
$actor=['role'=>'admin','actor'=>'admin:contract','device'=>null];$GLOBALS['snapshotActor']=$actor;
$fixture=json_decode(file_get_contents(__DIR__.'/../contracts-x01-v1.json'),true,64,JSON_THROW_ON_ERROR);
foreach($fixture['cases'] as $case){
 $pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
 $pdo->exec('PRAGMA foreign_keys=ON');migrateDatabase($pdo);
 $p1=createPlayer($pdo,['name'=>'A'])['id'];$p2=createPlayer($pdo,['name'=>'B'])['id'];$ids=[1=>$p1,2=>$p2];
 $c=defaultFormat($case['score'],$case['target']??2);$c['scoring']['in']=$case['in']??'straight';$c['scoring']['out']=$case['out']??'double';$c['match']['unit']=$case['unit']??'legs';$c['legs_per_set']=$case['legs_per_set']??3;$c['starters']['decider']=$case['decider']??'rotation';
 foreach(['deciding','final_set'] as $k){if(isset($case[$k]))$c[$k]=$case[$k];}
 $s=createFormattedGame($pdo,['player1_id'=>$p1,'player2_id'=>$p2,'config'=>$c]);$gameId=$s['game']['id'];
 foreach($case['steps'] as $step){
  $b=$step['body'];$b['game_id']=$gameId;$b['expected_revision']=$s['game']['revision'];$b['command_id']=uuid();foreach(['player_id','winner_id'] as $key)if(isset($b[$key]))$b[$key]=$ids[$b[$key]];
  try{transaction($pdo,static function()use($pdo,$gameId,$step,$actor,$b):void{$action=$step['action'];if($action==='history-correct'){$action='history-apply';$plan=correctionPlan($pdo,$b);$b['preview_token']=$plan['preview_token'];}assertMatchOperation(fetchGameRow($pdo,$gameId),$action,$b);$result=dispatchCommand($pdo,$actor,$action,$b);annotateScoring($pdo,$action,$b,$result);bumpGame($pdo,$gameId);});if(isset($step['error']))throw new RuntimeException('Expected '.$step['error']);}
  catch(ApiProblem $e){if(($step['error']??null)!==$e->errorCode)throw new RuntimeException($case['name'].': '.$e->errorCode.' != '.($step['error']??'success'));}
  $s=fetchGameSnapshot($pdo,$gameId);
 }
 $g=$s['game'];$p=$s['players'];$pos=static fn($id)=>$id===null?null:array_search($id,$ids,true);
 $projection=['scores'=>array_column($p,'remaining'),'darts'=>array_column($p,'darts'),'legs'=>array_column($p,'legs'),'sets'=>array_column($p,'sets'),'current'=>$pos($g['current_player_id']),'winner'=>$pos($g['winner_id']),'starter'=>$pos($g['leg_starter_id']),'leg'=>$g['current_leg'],'set'=>$g['current_set'],'phase'=>$g['phase'],'status'=>$g['status'],'paused'=>$g['is_paused'],'confirmed'=>$g['confirmed_at']!==null];
 foreach($case['expected'] as $k=>$v){if($projection[$k]!==$v)throw new RuntimeException($case['name'].'.'.$k.': '.json_encode($projection[$k]).' != '.json_encode($v));}
 echo 'PASS '.$case['name'].PHP_EOL;
}
echo count($fixture['cases'])." independent contract cases PASS\n";
