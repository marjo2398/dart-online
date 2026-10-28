<?php
declare(strict_types=1);

// Versioned X01 rules. The browser only describes these rules; PHP owns all transitions.
function defaultFormat(int $score = 501, int $target = 2): array
{
    return ['version'=>1, 'scoring'=>['start'=>$score,'in'=>'straight','out'=>'double'],
        'match'=>['unit'=>'legs','target'=>$target], 'legs_per_set'=>3,
        'deciding'=>['win_by_two'=>false,'extra_pairs'=>null], 'final_set'=>null,
        'starters'=>['method'=>'fixed','player'=>1,'leg_rotation'=>'alternate','set_rotation'=>'alternate','decider'=>'rotation']];
}

function formatEnum(array $input, string $key, array $allowed): string
{
    if (!isset($input[$key]) || !in_array($input[$key], $allowed, true)) {
        problem(422,'invalid-format','Nieprawidłowa reguła: '.$key.'.');
    }
    return $input[$key];
}

function formatObject(array $input, string $key): array
{
    if (!isset($input[$key]) || !is_array($input[$key])) { problem(422,'invalid-format','Brakuje sekcji '.$key.'.'); }
    return $input[$key];
}

function validateDeciding(array $value): array
{
    $two = requiredBool($value,'win_by_two');
    $cap = ($value['extra_pairs'] ?? null) === null ? null : requiredInt($value,'extra_pairs',0,50);
    if (!$two && $cap !== null) { problem(422,'conflicting-format','Limit przedłużenia wymaga przewagi dwóch legów.'); }
    return ['win_by_two'=>$two,'extra_pairs'=>$cap];
}

function validateFormat(array $value): array
{
    requiredInt($value,'version',1,1);
    $s = formatObject($value,'scoring'); $m = formatObject($value,'match');
    $r = formatObject($value,'starters');
    if (isset($m['best_of']) || isset($m['to_win'])) { problem(422,'conflicting-format','Przechowuj wyłącznie target, bez best_of/to_win.'); }
    $unit = formatEnum($m,'unit',['legs','sets','fixed']);
    $result = ['version'=>1,
        'scoring'=>['start'=>requiredInt($s,'start',2,10001),'in'=>formatEnum($s,'in',['straight','double','master']),'out'=>formatEnum($s,'out',['straight','double','master'])],
        'match'=>['unit'=>$unit,'target'=>requiredInt($m,'target',1,99)],
        'legs_per_set'=>requiredInt($value,'legs_per_set',1,99),
        'deciding'=>validateDeciding(formatObject($value,'deciding')), 'final_set'=>null,
        'starters'=>['method'=>formatEnum($r,'method',['fixed','random','bull_off']),
            'player'=>requiredInt($r,'player',1,2), 'leg_rotation'=>formatEnum($r,'leg_rotation',['alternate','same']),
            'set_rotation'=>formatEnum($r,'set_rotation',['alternate','same']), 'decider'=>formatEnum($r,'decider',['rotation','initial','bull_off'])]];
    if (($value['final_set'] ?? null) !== null) {
        if ($unit !== 'sets') { problem(422,'conflicting-format','Ostatni set wymaga meczu na sety.'); }
        $f = formatObject($value,'final_set');
        $result['final_set'] = array_merge(validateDeciding($f), ['target'=>requiredInt($f,'target',1,99)]);
    }
    if ($unit === 'fixed' && ($result['deciding']['win_by_two'] || $result['starters']['decider'] !== 'rotation')) {
        problem(422,'conflicting-format','Wszystkie N legów dopuszcza remis; wyłącz przewagę i specjalny decider.');
    }
    return $result;
}

function compatibleFormat(array $c): bool
{
    return $c === defaultFormat($c['scoring']['start'], $c['match']['target'])
        && in_array($c['scoring']['start'], ALLOWED_STARTING_SCORES, true)
        && in_array($c['match']['target'], ALLOWED_LEGS_TO_WIN, true);
}

function supportsFormats(): bool { return ($_SERVER['HTTP_X_DART_FORMATS'] ?? '') === '1'; }
function assertFormatClient(array $game): void
{
    if (!(bool)$game['legacy_compatible'] && !supportsFormats()) {
        problem(409,'client-update-required','Ten format wymaga panelu WWW z obsługą formatów v1. APK 1.0.1 nie obsługuje tego meczu.');
    }
}

function migrateFormats(PDO $pdo): void
{
    if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn() >= 4) { return; }
    // SQLite table rebuild follows the documented create/copy/drop/rename sequence.
    // Disable FK outside the transaction; verify every reference before commit.
    $pdo->exec('PRAGMA foreign_keys=OFF');
    try {
        transaction($pdo, static function () use ($pdo): void {
            if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn() >= 4) { return; }
            $sequence=(int)($pdo->query("SELECT seq FROM sqlite_sequence WHERE name='games'")->fetchColumn() ?: 0);
            $pdo->exec(<<<'SQL'
CREATE TABLE games_v4 (
 id INTEGER PRIMARY KEY AUTOINCREMENT, player1_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 player2_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE, winner_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
 legs_to_win INTEGER NOT NULL CHECK(legs_to_win BETWEEN 1 AND 99),
 starting_score INTEGER NOT NULL CHECK(starting_score BETWEEN 2 AND 10001),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), finished_at TEXT,
 revision INTEGER NOT NULL DEFAULT 0, active_camera_id TEXT, camera_epoch INTEGER NOT NULL DEFAULT 0,
 config_json TEXT NOT NULL, starter_results TEXT NOT NULL DEFAULT '{}', legacy_compatible INTEGER NOT NULL,
 CHECK(player1_id<>player2_id)
);
SQL
            );
            $insert = $pdo->prepare('INSERT INTO games_v4(id,player1_id,player2_id,winner_id,legs_to_win,starting_score,created_at,updated_at,finished_at,revision,active_camera_id,camera_epoch,config_json,legacy_compatible) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
            foreach ($pdo->query('SELECT * FROM games')->fetchAll() as $g) {
                $insert->execute([$g['id'],$g['player1_id'],$g['player2_id'],$g['winner_id'],$g['legs_to_win'],$g['starting_score'],$g['created_at'],$g['updated_at'],$g['finished_at'],$g['revision'],$g['active_camera_id'],$g['camera_epoch'],json_encode(defaultFormat((int)$g['starting_score'],(int)$g['legs_to_win']),JSON_THROW_ON_ERROR)]);
            }
            $pdo->exec("DROP TABLE games; ALTER TABLE games_v4 RENAME TO games;
                CREATE INDEX idx_games_players ON games(player1_id,player2_id);
                CREATE INDEX idx_games_winner ON games(winner_id);
                CREATE TABLE templates(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,config_json TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);");
            $pdo->prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='games'")->execute([$sequence]);
            $pdo->prepare("INSERT INTO sqlite_sequence(name,seq) SELECT 'games',? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='games')")->execute([$sequence]);
            ensureColumn($pdo,'visits','opened_after','INTEGER NOT NULL DEFAULT 1');
            $seed = $pdo->prepare('INSERT INTO templates(name,config_json) VALUES (?,?)');
            foreach ([2,4,6] as $target) { $seed->execute(['501 BO'.($target*2-1),json_encode(defaultFormat(501,$target),JSON_THROW_ON_ERROR)]); }
            $c = defaultFormat(); $c['match']=['unit'=>'sets','target'=>3];
            $seed->execute(['501 — do 3 setów, po 3 legi',json_encode($c,JSON_THROW_ON_ERROR)]);
            if ($pdo->query('PRAGMA foreign_key_check')->fetchAll() !== []) { throw new RuntimeException('Format migration: foreign key check failed'); }
            $pdo->exec("UPDATE schema_meta SET value='4' WHERE key='schema_version'");
            rebuildAllPlayerStats($pdo);
        });
    } finally { $pdo->exec('PRAGMA foreign_keys=ON'); }
}

function listTemplates(PDO $pdo): array
{
    $rows = sqlRows($pdo,'SELECT * FROM templates ORDER BY favorite DESC,name,id');
    return array_map(static function(array $t): array {
        return ['id'=>(int)$t['id'],'name'=>$t['name'],'config'=>json_decode($t['config_json'],true,32,JSON_THROW_ON_ERROR),
            'favorite'=>(bool)$t['favorite'],'revision'=>(int)$t['revision']];
    },$rows);
}

function saveTemplate(PDO $pdo, array $body): array
{
    $name = $body['name'] ?? null;
    if (!is_string($name) || trim($name)==='' || strlen(trim($name))>120) { problem(422,'invalid-name','Nazwa szablonu: 1–120 bajtów UTF-8.'); }
    $c = validateFormat(formatObject($body,'config')); $favorite = requiredBool($body,'favorite');
    $id = ($body['template_id'] ?? null) === null ? null : requiredInt($body,'template_id',1,PHP_INT_MAX);
    if ($id === null) {
        $pdo->prepare('INSERT INTO templates(name,config_json,favorite) VALUES (?,?,?)')->execute([trim($name),json_encode($c,JSON_THROW_ON_ERROR),(int)$favorite]);
    } else {
        $rev = requiredInt($body,'template_revision',0,PHP_INT_MAX);
        $stmt = $pdo->prepare('UPDATE templates SET name=?,config_json=?,favorite=?,revision=revision+1 WHERE id=? AND revision=?');
        $stmt->execute([trim($name),json_encode($c,JSON_THROW_ON_ERROR),(int)$favorite,$id,$rev]);
        if ($stmt->rowCount()!==1) { problem(409,'template-conflict','Szablon zmieniono lub usunięto. Wczytaj listę ponownie.'); }
    }
    return ['templates'=>listTemplates($pdo)];
}

function deleteTemplate(PDO $pdo, array $body): array
{
    $stmt=$pdo->prepare('DELETE FROM templates WHERE id=? AND revision=?');
    $stmt->execute([requiredInt($body,'template_id',1,PHP_INT_MAX),requiredInt($body,'template_revision',0,PHP_INT_MAX)]);
    if ($stmt->rowCount()!==1) { problem(409,'template-conflict','Szablon zmieniono lub usunięto.'); }
    return ['templates'=>listTemplates($pdo)];
}

function formatDescription(array $c): string
{
    $m=$c['match']; $s=$c['scoring'];
    $text=$s['start'].' · '.$s['in'].'-in / '.$s['out'].'-out · ';
    $text .= $m['unit']==='fixed' ? 'wszystkie '.$m['target'].' legów (możliwy remis)' : 'do '.$m['target'].' wygranych '.($m['unit']==='sets'?'setów, set do '.$c['legs_per_set'].' legów':'legów');
    if ($m['unit']!=='fixed') {
        $text .= $c['deciding']['win_by_two'] ? ' · przewaga 2 legów' : ' · zwykły decider';
        if ($c['deciding']['win_by_two']) { $text .= $c['deciding']['extra_pairs']===null ? ', bez limitu' : ', sudden death po '.$c['deciding']['extra_pairs'].' dodatkowych parach'; }
    }
    if ($c['final_set']!==null) { $text.=' · ostatni set: do '.$c['final_set']['target'].', '.($c['final_set']['win_by_two']?'przewaga 2':'zwykły decider').($c['final_set']['extra_pairs']===null?'':', limit '.$c['final_set']['extra_pairs'].' par'); }
    return $text;
}

function createFormattedGame(PDO $pdo, array $input): array
{
    $p1=requiredInt($input,'player1_id',1,PHP_INT_MAX); $p2=requiredInt($input,'player2_id',1,PHP_INT_MAX);
    if ($p1===$p2) { problem(422,'players-must-differ','Wybierz dwóch różnych zawodników.'); }
    if (isset($input['config'])) {
        if (isset($input['legs_to_win']) || isset($input['starting_score'])) { problem(422,'conflicting-format','Wyślij config albo dawne pola, nie obie reprezentacje.'); }
        $c=validateFormat(formatObject($input,'config'));
    } else {
        $score=requiredInt($input,'starting_score',301,901); $legs=requiredInt($input,'legs_to_win',1,5);
        if (!in_array($score,ALLOWED_STARTING_SCORES,true) || !in_array($legs,ALLOWED_LEGS_TO_WIN,true)) { problem(422,'invalid-format','Dawny kontrakt obsługuje 301/501/701/901 i do 1/2/3/5 legów.'); }
        $c=defaultFormat($score,$legs);
    }
    $compatible=compatibleFormat($c);
    assertFormatClient(['legacy_compatible'=>$compatible]);
    if ($c['starters']['method']==='random') { $c['starters']['player']=random_int(1,2); }
    if (count(sqlRows($pdo,'SELECT id FROM players WHERE id IN (?,?)',[$p1,$p2]))!==2) { problem(422,'player-not-found','Wybrany zawodnik nie istnieje.'); }
    $pdo->prepare('INSERT INTO games(player1_id,player2_id,legs_to_win,starting_score,config_json,legacy_compatible) VALUES (?,?,?,?,?,?)')
        ->execute([$p1,$p2,$c['match']['unit']==='sets'?$c['legs_per_set']:$c['match']['target'],$c['scoring']['start'],json_encode($c,JSON_THROW_ON_ERROR),(int)$compatible]);
    return fetchGameSnapshot($pdo,(int)$pdo->lastInsertId());
}

function assertResultClient(array $result): void
{
    // Also guard cached game-create results (their command game_id is historically null).
    if (isset($result['game']['legacy_compatible'])) { assertFormatClient($result['game']); }
}

function contestWon(int $a, int $b, int $target, array $rule): bool
{
    if ($a<$target) { return false; }
    if (!$rule['win_by_two'] || $a-$b>=2) { return true; }
    return $rule['extra_pairs']!==null && $a+$b>=2*($target-1+$rule['extra_pairs'])+1;
}

function replayFormat(array $game, array $visits): array
{
    $c=json_decode($game['config_json'],true,32,JSON_THROW_ON_ERROR);
    $p1=(int)$game['player1_id']; $p2=(int)$game['player2_id']; $ids=[$p1,$p2];
    $initial=$ids[$c['starters']['player']-1]; $other=static fn(int $id): int => $id===$p1?$p2:$p1;
    $zero=[$p1=>0,$p2=>0]; $scores=[$p1=>$c['scoring']['start'],$p2=>$c['scoring']['start']];
    $opened=[$p1=>$c['scoring']['in']==='straight',$p2=>$c['scoring']['in']==='straight'];
    $legs=$sets=$setLegs=$points=$darts=$high=$legDarts=$zero;
    $leg=1; $set=1; $legInSet=1; $setStarter=$initial; $starter=$initial; $current=$initial;
    $winner=null; $finished=false; $results=json_decode($game['starter_results'],true,32,JSON_THROW_ON_ERROR);
    $phase='regular'; $decider=false; $sudden=false; $target=1; $rule=$c['deciding'];
    $prepare = static function () use (&$phase,&$decider,&$sudden,&$target,&$rule,&$starter,&$current,$c,&$setLegs,&$legs,&$sets,$p1,$p2,&$leg,&$legInSet,&$setStarter,$initial,$other,$results): void {
        $lastSet=$c['match']['unit']==='sets' && $sets[$p1]===$c['match']['target']-1 && $sets[$p2]===$c['match']['target']-1;
        $rule=$lastSet && $c['final_set']!==null ? $c['final_set'] : $c['deciding'];
        $target=$c['match']['unit']==='sets' ? ($lastSet && $c['final_set']!==null ? $c['final_set']['target'] : $c['legs_per_set']) : $c['match']['target'];
        $counts=$c['match']['unit']==='sets'?$setLegs:$legs;
        $tie=$counts[$p1]===$counts[$p2] && $counts[$p1]>=$target-1;
        $sudden=$c['match']['unit']!=='fixed' && $tie && $rule['win_by_two'] && $rule['extra_pairs']!==null && $counts[$p1]>=$target-1+$rule['extra_pairs'];
        $decider=$c['match']['unit']!=='fixed' && $tie && (!$rule['win_by_two'] || $sudden);
        $phase=$sudden?'sudden_death':($decider?'decider':($rule['win_by_two'] && min($counts)>=$target-1 && $c['match']['unit']!=='fixed'?'advantage':'regular'));
        $index=$c['match']['unit']==='sets'?$legInSet:$leg;
        $base=$c['match']['unit']==='sets'?$setStarter:$initial;
        $starter=$c['starters']['leg_rotation']==='alternate' && $index%2===0 ? $other($base) : $base;
        if ($decider && $c['starters']['decider']==='initial') { $starter=$initial; }
        if ($decider && $c['starters']['decider']==='bull_off') {
            $starter=$leg===1 && $c['starters']['method']==='bull_off' ? $initial : (isset($results[(string)$leg])?(int)$results[(string)$leg]:null);
            if ($starter===null) { $phase='awaiting_starter'; }
        }
        $current=$starter;
    };
    $prepare();
    foreach ($visits as $v) {
        $id=$v['player_id'];
        $scores[$id]-=$v['applied_score']; $points[$id]+=$v['applied_score']; $darts[$id]+=$v['darts_used'];
        $high[$id]=max($high[$id],$v['applied_score']); $legDarts[$id]+=$v['darts_used'];
        $opened[$id]=$v['opened_after'];
        if ($v['is_checkout']) {
            $legs[$id]++; $setLegs[$id]++;
            if ($c['match']['unit']==='fixed') {
                $finished=array_sum($legs)>=$c['match']['target'];
                if ($finished && $legs[$p1]!==$legs[$p2]) { $winner=$legs[$p1]>$legs[$p2]?$p1:$p2; }
            } elseif (contestWon(($c['match']['unit']==='sets'?$setLegs:$legs)[$id],($c['match']['unit']==='sets'?$setLegs:$legs)[$other($id)],$target,$rule)) {
                if ($c['match']['unit']==='sets') {
                    $sets[$id]++; $finished=$sets[$id]>=$c['match']['target'];
                    if (!$finished) {
                        $set++; $legInSet=0; $setLegs=$zero;
                        $setStarter=$c['starters']['set_rotation']==='alternate' && $set%2===0?$other($initial):$initial;
                    }
                } else { $finished=true; }
                if ($finished) { $winner=$id; }
            }
            if ($finished) { $current=null; break; }
            $leg++; $legInSet++; $scores=[$p1=>$c['scoring']['start'],$p2=>$c['scoring']['start']]; $legDarts=$zero;
            $opened=[$p1=>$c['scoring']['in']==='straight',$p2=>$c['scoring']['in']==='straight'];
            $prepare();
        } else { $current=$v['is_complete']?$other($id):$id; }
    }
    // Historical manually stored winners remain authoritative for old imported records.
    if ($game['winner_id']!==null) { $winner=(int)$game['winner_id']; $finished=true; $current=null; }
    $players=[];
    foreach ($ids as $i=>$id) { $players[]=['id'=>$id,'name'=>$game['player'.($i+1).'_name'],'position'=>$i+1,
        'remaining'=>$scores[$id],'legs'=>$legs[$id],'sets'=>$sets[$id],'set_legs'=>$setLegs[$id],'opened'=>$opened[$id],
        'points'=>$points[$id],'darts'=>$darts[$id],'average'=>$darts[$id]>0?round(3*$points[$id]/$darts[$id],2):0.0,
        'highest_visit'=>$high[$id],'current_leg_darts'=>$legDarts[$id]]; }
    return ['game'=>['id'=>(int)$game['id'],'player1_id'=>$p1,'player2_id'=>$p2,'winner_id'=>$winner,
        'legs_to_win'=>(int)$game['legs_to_win'],'starting_score'=>(int)$game['starting_score'],
        'status'=>$finished?'finished':'active','result'=>$finished?($winner===null?'draw':'win'):null,
        'current_leg'=>$leg,'current_set'=>$set,'leg_in_set'=>$legInSet,'max_legs'=>$c['match']['unit']==='fixed'?$c['match']['target']:($rule['win_by_two']?null:$target*2-1),
        'current_player_id'=>$current,'leg_starter_id'=>$starter,'set_starter_id'=>$setStarter,
        'phase'=>$finished?'finished':$phase,'is_decider'=>$decider,'is_sudden_death'=>$sudden,
        'config'=>$c,'format_version'=>1,'format_description'=>formatDescription($c),'legacy_compatible'=>(bool)$game['legacy_compatible'],
        'aggregate_allowed'=>$c['scoring']['out']!=='master' && ($current===null || $opened[$current]),
        'created_at'=>$game['created_at'],'updated_at'=>$game['updated_at'],'finished_at'=>$game['finished_at']],
        'players'=>$players,'visits'=>$visits,'can_undo'=>count($visits)>0];
}

function persistCompletion(PDO $pdo, int $id): void
{
    $s=fetchGameSnapshot($pdo,$id);
    if ($s['game']['status']==='finished') {
        $pdo->prepare("UPDATE games SET winner_id=?,finished_at=COALESCE(finished_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?")->execute([$s['game']['winner_id'],$id]);
    }
}

function selectStarter(PDO $pdo, array $body): array
{
    $id=requiredInt($body,'game_id',1,PHP_INT_MAX); $s=fetchGameSnapshot($pdo,$id);
    if ($s['game']['phase']!=='awaiting_starter') { problem(409,'starter-not-pending','Mecz nie oczekuje na bull-off.'); }
    $player=requiredInt($body,'player_id',1,PHP_INT_MAX);
    if (!in_array($player,[$s['game']['player1_id'],$s['game']['player2_id']],true)) { problem(422,'player-not-in-game','Wskaż zawodnika meczu.'); }
    $g=fetchGameRow($pdo,$id); $results=json_decode($g['starter_results'],true,32,JSON_THROW_ON_ERROR);
    $results[(string)$s['game']['current_leg']]=$player;
    $pdo->prepare('UPDATE games SET starter_results=? WHERE id=?')->execute([json_encode((object)$results,JSON_THROW_ON_ERROR),$id]);
    return [];
}

function fieldQualifies(string $field, string $rule): bool
{
    return $rule==='straight' || $field==='50' || $field[0]==='D' || ($rule==='master' && $field[0]==='T');
}

function evaluateDarts(array $c, int $start, bool $opened, array $fields): array
{
    $declared=0; $applied=0; $bust=false; $checkout=false; $initialOpened=$opened;
    foreach ($fields as $field) {
        if ($bust || $checkout) { problem(422,'visit-already-complete','Lotki po bust/checkout nie należą do wizyty.'); }
        $value=dartValue($field)[0]; $declared+=$value;
        if (!$opened && fieldQualifies($field,$c['scoring']['in'])) { $opened=true; }
        if (!$opened) { continue; }
        $applied+=$value; $remaining=$start-$applied;
        $checkout=$remaining===0 && fieldQualifies($field,$c['scoring']['out']);
        $bust=$remaining<0 || ($remaining===1 && $c['scoring']['out']!=='straight') || ($remaining===0 && !$checkout);
    }
    // A bust voids the whole visit, including an opening achieved during it.
    return [$declared,$bust?0:$applied,count($fields),(int)$bust,(int)$checkout,(int)($bust || $checkout || count($fields)===3),(int)($bust?$initialOpened:$opened)];
}

function recalculateDartVisit(PDO $pdo, int $gameId, int $visitId): void
{
    $g=fetchGameRow($pdo,$gameId); $visits=fetchGameVisits($pdo,$gameId);
    $visit=array_pop($visits);
    if (!$visit || $visit['id']!==$visitId) { throw new RuntimeException('Only the latest visit may be recalculated'); }
    $g['winner_id']=null; $before=replayGame($g,$visits);
    $player=$before['players'][$before['players'][0]['id']===$visit['player_id']?0:1];
    $fields=array_column(sqlRows($pdo,'SELECT field FROM darts WHERE visit_id=? AND active=1 ORDER BY dart_no',[$visitId]),'field');
    $values=evaluateDarts($before['game']['config'],$player['remaining'],$player['opened'],$fields);
    $pdo->prepare('UPDATE visits SET declared_score=?,applied_score=?,darts_used=?,is_bust=?,is_checkout=?,is_complete=?,opened_after=? WHERE id=?')->execute(array_merge($values,[$visitId]));
}
