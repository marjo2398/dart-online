<?php
declare(strict_types=1);

const MATCH_PERMISSIONS = ['score','correct_last','history','pause','adjudicate','confirm','reopen'];

function supportsOperations(): bool { return ($_SERVER['HTTP_X_DART_OPERATIONS'] ?? '') === '2'; }

function migrateOperations(PDO $pdo): void
{
    if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn() >= 5) { return; }
    $pdo->exec('PRAGMA foreign_keys=OFF');
    try {
        transaction($pdo,static function () use ($pdo): void {
            if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn() >= 5) { return; }
            $sequence=(int)$pdo->query("SELECT seq FROM sqlite_sequence WHERE name='visits'")->fetchColumn();
            $sql=(string)$pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='visits'")->fetchColumn();
            $sql=preg_replace('/^CREATE TABLE(?: IF NOT EXISTS)? ["`]?visits["`]?/i','CREATE TABLE visits_v5',$sql);
            $sql=preg_replace('/UNIQUE\s*\(game_id,\s*visit_no\),?/i','',$sql);
            $start=strpos($sql,'(')+1;
            $sql=substr($sql,0,$start)."active INTEGER NOT NULL DEFAULT 1, double_confirmed INTEGER NOT NULL DEFAULT 0, input_mode TEXT NOT NULL DEFAULT 'score', ".substr($sql,$start);
            $pdo->exec($sql);
            $columns=array_column($pdo->query('PRAGMA table_info(visits)')->fetchAll(),'name');
            $names=implode(',',$columns);
            $pdo->exec('INSERT INTO visits_v5('.$names.') SELECT '.$names.' FROM visits');
            $pdo->exec("DROP TABLE visits; ALTER TABLE visits_v5 RENAME TO visits;
                CREATE UNIQUE INDEX idx_visits_active_order ON visits(game_id,visit_no) WHERE active=1;
                CREATE INDEX idx_visits_game_order ON visits(game_id,active,visit_no);
                CREATE INDEX idx_visits_player ON visits(player_id);");
            foreach ($pdo->query('SELECT id,config_json FROM games')->fetchAll() as $g) {
                $config=json_decode($g['config_json'],true,32,JSON_THROW_ON_ERROR);
                if ($config['scoring']['out']==='double') {
                    $pdo->prepare("UPDATE visits SET double_confirmed=is_checkout WHERE game_id=? AND mode='aggregate'")->execute([$g['id']]);
                }
            }
            $pdo->prepare("UPDATE sqlite_sequence SET seq=MAX(seq,CAST(? AS INTEGER)) WHERE name='visits'")->execute([$sequence]);
            $pdo->prepare("INSERT INTO sqlite_sequence(name,seq) SELECT 'visits',CAST(? AS INTEGER) WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='visits')")->execute([$sequence]);
            ensureColumn($pdo,'games','is_paused','INTEGER NOT NULL DEFAULT 0');
            ensureColumn($pdo,'games','decision_json','TEXT');
            ensureColumn($pdo,'games','confirmed_at','TEXT');
            ensureColumn($pdo,'games','stats_eligible','INTEGER NOT NULL DEFAULT 1');
            ensureColumn($pdo,'devices','permissions_json','TEXT');
            ensureColumn($pdo,'device_codes','permissions_json','TEXT');
            ensureColumn($pdo,'audit','actor_context',"TEXT NOT NULL DEFAULT '{}'");
            ensureColumn($pdo,'audit','details_json',"TEXT NOT NULL DEFAULT '{}'");
            $pdo->exec("CREATE TABLE record_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL,
                record_type TEXT NOT NULL, record_id TEXT NOT NULL, original TEXT NOT NULL,
                reason TEXT NOT NULL, revision INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
                CREATE INDEX idx_record_versions_game ON record_versions(game_id,id);
                CREATE TABLE result_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, action TEXT NOT NULL,
                reason TEXT NOT NULL, actor_context TEXT NOT NULL, result_json TEXT NOT NULL, revision INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));");
            if ($pdo->query('PRAGMA foreign_key_check')->fetchAll()!==[]) { throw new RuntimeException('Operations migration: foreign key check failed'); }
            $pdo->exec("UPDATE schema_meta SET value='5' WHERE key='schema_version'");
            rebuildAllPlayerStats($pdo);
        });
    } finally { $pdo->exec('PRAGMA foreign_keys=ON'); }
}

function actorPermissions(array $actor): array
{
    if ($actor['role']==='admin') { return MATCH_PERMISSIONS; }
    return $actor['device']['permissions'] ?? [];
}

function grantPermissions(array $body, string $role): array
{
    $permissions=$body['permissions'] ?? ($role==='operator'?['score','correct_last']:[]);
    if (!is_array($permissions) || array_values($permissions)!==$permissions || array_diff($permissions,MATCH_PERMISSIONS)!==[] || ($role!=='operator' && $permissions!==[])) {
        problem(422,'invalid-permissions','Wybierz jawne uprawnienia operatora; kamera i widz nie mają uprawnień zapisu.');
    }
    return array_values(array_unique($permissions));
}

function operationPermission(string $action): ?string
{
    if (in_array($action,['history-preview','history-apply'],true)) { return 'history'; }
    if (in_array($action,['game-pause','game-resume'],true)) { return 'pause'; }
    if ($action==='game-adjudicate') { return 'adjudicate'; }
    if ($action==='result-confirm') { return 'confirm'; }
    if ($action==='result-reopen') { return 'reopen'; }
    if (in_array($action,['dart-correct','visit-correct','visit-undo'],true)) { return 'correct_last'; }
    if (in_array($action,['visit-create','remaining-create','dart-create','starter-select','observation-review','camera-select','game-rematch','game-finish'],true)) { return 'score'; }
    return null;
}

function requireOperationPermission(array $actor, string $action): void
{
    $permission=operationPermission($action);
    if ($permission!==null && !in_array($permission,actorPermissions($actor),true)) { problem(403,'permission-required','Brak uprawnienia: '.$permission.'.'); }
}

function actorContext(array $actor): array
{
    return ['role'=>$actor['role'],'device_id'=>$actor['device']['id'] ?? null,
        'declared_name'=>$actor['device']['name'] ?? null,
        'session_hash'=>$actor['device']===null && session_id()!=='' ? hash('sha256',session_id()) : null];
}

function assertOperationsRead(array $g): void
{
    if (!supportsOperations() && ((bool)($g['is_paused'] ?? false) || ($g['confirmed_at'] ?? null)!==null || ($g['decision_json'] ?? null)!==null)) {
        problem(409,'client-update-required','Ten stan meczu wymaga aktualnego WWW (operacje v2). APK 1.0.1 nie obsługuje pauzy ani zatwierdzonej decyzji.');
    }
}

function assertMatchOperation(array $g, string $action, array $body = []): void
{
    $writes=['visit-create','remaining-create','dart-create','observation-create','starter-select'];
    $accept=$action==='observation-review' && ($body['decision'] ?? '')==='accept';
    $edits=['visit-undo','visit-correct','dart-correct','history-preview','history-apply'];
    if (($g['confirmed_at'] ?? null)!==null && ($accept || in_array($action,array_merge($writes,$edits,['game-delete','game-adjudicate','game-finish']),true))) {
        problem(409,'result-locked','Wynik zatwierdzony. Uprawniona osoba musi go ponownie otworzyć z uzasadnieniem.');
    }
    if (($g['decision_json'] ?? null)!==null && ($accept || in_array($action,array_merge($writes,$edits,['game-adjudicate']),true))) {
        problem(409,'decision-closed','Najpierw ponownie otwórz decyzję administracyjną.');
    }
    if ((bool)($g['is_paused'] ?? false) && ($accept || in_array($action,$writes,true))) { problem(409,'game-paused','Mecz jest w pauzie. Wznów grę przed kolejnym rzutem.'); }
}

function operationSnapshot(array $row, array $s): array
{
    $decision=($row['decision_json'] ?? null)===null?null:json_decode($row['decision_json'],true,32,JSON_THROW_ON_ERROR);
    $s['game']['decision']=$decision;
    $s['game']['is_paused']=(bool)($row['is_paused'] ?? false);
    $s['game']['confirmed_at']=$row['confirmed_at'] ?? null;
    $s['game']['stats_eligible']=(bool)($row['stats_eligible'] ?? true);
    if ($decision!==null) {
        $s['game']['status']='finished'; $s['game']['phase']='finished'; $s['game']['current_player_id']=null;
        $s['game']['winner_id']=$decision['winner_id']; $s['game']['result']=$decision['kind'];
    }
    $s['game']['operation_state']=$s['game']['confirmed_at']!==null?'confirmed':($s['game']['status']==='finished'?'resolved':($s['game']['is_paused']?'paused':($s['game']['phase']==='awaiting_starter'?'awaiting_starter':'playing')));
    $s['can_undo']=$s['can_undo'] && $decision===null && $s['game']['confirmed_at']===null;
    return $s;
}

function reasonFrom(array $body): string
{
    $reason=$body['reason'] ?? '';
    if (!is_string($reason) || trim($reason)==='' || strlen(trim($reason))>1000) { problem(422,'reason-required','Podaj uzasadnienie (1–1000 bajtów UTF-8).'); }
    return trim($reason);
}

function changeMatchState(PDO $pdo, array $actor, string $action, array $body): array
{
    $id=requiredInt($body,'game_id',1,PHP_INT_MAX); $s=fetchGameSnapshot($pdo,$id); $g=$s['game'];
    if ($action==='game-pause' || $action==='game-resume') {
        $pause=$action==='game-pause';
        if ($g['status']!=='active' || $g['is_paused']===$pause) { problem(409,'invalid-phase','Mecz nie jest w fazie pozwalającej na tę zmianę pauzy.'); }
        $pdo->prepare('UPDATE games SET is_paused=?,camera_epoch=camera_epoch+1 WHERE id=?')->execute([(int)$pause,$id]);
        return [];
    }
    $reason=reasonFrom($body);
    if ($action==='game-adjudicate') {
        $kind=formatEnum($body,'kind',['surrender','walkover','interrupted','cancelled']);
        $winner=null; $award=null;
        if (in_array($kind,['surrender','walkover'],true)) {
            $winner=requiredInt($body,'winner_id',1,PHP_INT_MAX);
            if (!in_array($winner,[$g['player1_id'],$g['player2_id']],true)) { problem(422,'invalid-winner','Wskaż zawodnika meczu.'); }
            if (($body['award'] ?? null)!==null) {
                $a=formatObject($body,'award'); $a1=requiredInt($a,'player1',0,99); $a2=requiredInt($a,'player2',0,99);
                if (($winner===$g['player1_id'] && $a1<=$a2) || ($winner===$g['player2_id'] && $a2<=$a1)) { problem(422,'invalid-award','Przyznany wynik musi wskazywać wybranego zwycięzcę.'); }
                $award=['player1'=>$a1,'player2'=>$a2,'unit'=>$g['config']['match']['unit']==='sets'?'sets':'legs'];
            }
        } elseif (($body['winner_id'] ?? null)!==null || ($body['award'] ?? null)!==null) { problem(422,'invalid-award','Przerwanie i anulowanie nie przyznają zwycięstwa ani wyniku.'); }
        $decision=['kind'=>$kind,'winner_id'=>$winner,'award'=>$award,'reason'=>$reason];
        $pdo->prepare("UPDATE games SET decision_json=?,winner_id=?,finished_at=COALESCE(finished_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),is_paused=0,stats_eligible=? WHERE id=?")
            ->execute([canonicalJson($decision),$winner,(int)($kind==='surrender'),$id]);
    } elseif ($action==='result-confirm') {
        if ($g['status']!=='finished' || $g['confirmed_at']!==null) { problem(409,'invalid-phase','Zatwierdzić można rozstrzygnięty, niezatwierdzony mecz.'); }
        $pdo->prepare("UPDATE games SET confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")->execute([$id]);
    } elseif ($action==='result-reopen') {
        if ($g['status']!=='finished' && $g['confirmed_at']===null) { problem(409,'invalid-phase','Mecz nie jest zakończony.'); }
        $pdo->prepare('UPDATE games SET confirmed_at=NULL,decision_json=NULL,winner_id=NULL,finished_at=NULL,is_paused=0,stats_eligible=1 WHERE id=?')->execute([$id]);
        persistCompletion($pdo,$id);
    }
    $pdo->prepare('INSERT INTO result_decisions(game_id,action,reason,actor_context,result_json,revision) VALUES (?,?,?,?,?,?)')
        ->execute([$id,$action,$reason,canonicalJson(actorContext($actor)),canonicalJson(['before'=>$g,'input'=>$body]),$g['revision']+1]);
    return [];
}

function evaluateAggregate(array $c, int $start, bool $opened, int $score, int $used, bool $double): array
{
    if (!$opened || $c['scoring']['out']==='master') { problem(422,'individual-darts-required','Przed otwarciem oraz przy master-out wpisz pojedyncze lotki.'); }
    $remaining=$start-$score; $straight=$c['scoring']['out']==='straight';
    $checkout=$remaining===0 && ($straight || $double);
    $bust=$remaining<0 || (!$straight && ($remaining===1 || ($remaining===0 && !$double)));
    if (!isPossibleVisitScore($score,$used)) { problem(422,'impossible-visit-score','Wynik nieosiągalny podaną liczbą lotek.'); }
    if ($double && $remaining!==0) { problem(422,'double-not-applicable','Potwierdzenie double dotyczy wyłącznie zejścia do zera.'); }
    if ($checkout && (!$straight || $double) && !isPossibleCheckout($score,$used)) { problem(422,'impossible-checkout','Nie ma potwierdzonego zejścia na double tą liczbą lotek.'); }
    if (!$checkout && !$bust && $used!==3) { problem(422,'invalid-darts-used','Zwykła suma obejmuje pełną wizytę trzech lotek.'); }
    if (!possibleAggregateSequence($c,$start,$score,$used,$checkout,$bust)) { problem(422,'impossible-visit-sequence','Taka suma wymagałaby rzutów po wcześniejszym bust/checkout. Sprawdź liczbę lotek albo wpisz rzeczywiste pola.'); }
    return [$score,$bust?0:$score,$used,(int)$bust,(int)$checkout,1,1];
}

function possibleAggregateSequence(array $c, int $start, int $score, int $used, bool $checkout, bool $bust): bool
{
    // Existence check only. Never persist a hypothetical decomposition as actual fields.
    $fields=['MISS','25','50']; foreach (['S','D','T'] as $prefix) { for ($n=1;$n<=20;$n++) { $fields[]=$prefix.$n; } }
    $reachable=[0=>true];
    for ($i=1;$i<=$used;$i++) {
        $next=[];
        foreach ($reachable as $before=>$ignored) {
            foreach ($fields as $field) {
                $sum=$before+dartValue($field)[0]; if ($sum>$score) { continue; }
                $left=$start-$sum; $finish=$left===0 && fieldQualifies($field,$c['scoring']['out']);
                $over=$left<0 || ($left===1 && $c['scoring']['out']!=='straight') || ($left===0 && !$finish);
                if ($i===$used) { if ($sum===$score && $finish===$checkout && $over===$bust) { return true; } }
                elseif (!$over && !$finish) { $next[$sum]=true; }
            }
        }
        $reachable=$next;
    }
    return false;
}

function remainingVisit(PDO $pdo, array $body): array
{
    $id=requiredInt($body,'game_id',1,PHP_INT_MAX); $s=fetchGameSnapshot($pdo,$id);
    $player=requiredInt($body,'player_id',1,PHP_INT_MAX); $remaining=requiredInt($body,'remaining',0,$s['game']['starting_score']);
    $p=$s['players'][$s['players'][0]['id']===$player?0:1];
    if ($player!==$s['game']['current_player_id']) { problem(409,'wrong-player-turn','Rzuca inny zawodnik.'); }
    if ($remaining===$p['remaining'] && ($body['zero_visit_confirmed'] ?? false)!==true) { problem(422,'ambiguous-remaining','Niezmieniony stan może oznaczać zero lub bust. Potwierdź rzeczywistą wizytę za 0 albo wpisz bust jako sumę/pola.'); }
    $score=$p['remaining']-$remaining;
    if ($score<0 || $score>180) { problem(422,'invalid-remaining','Nie można odjąć takiej wizyty. Bust wpisz jako sumę lub pojedyncze pola.'); }
    $body['score']=$score;
    // Reject a bust disguised as a remaining-score entry.
    $values=evaluateAggregate($s['game']['config'],$p['remaining'],$p['opened'],$score,requiredInt($body,'darts_used',1,3),requiredBool($body,'double_confirmed'));
    if ($values[3]) { problem(422,'invalid-remaining','Ten stan byłby bustem. Wpisz faktyczny rzut jako sumę albo pola.'); }
    $result=recordVisit($pdo,$body);
    $last=$result['visits'][count($result['visits'])-1];
    $pdo->prepare("UPDATE visits SET input_mode='remaining' WHERE id=?")->execute([$last['id']]);
    return $result;
}

function checkoutHints(array $s, array $query): array
{
    $g=$s['game']; $player=$g['current_player_id'];
    $used=$s['partial_visit']['darts_used'] ?? 0; $left=3-$used;
    $p=null; foreach ($s['players'] as $candidate) { if ($candidate['id']===$player) { $p=$candidate; } }
    $preferred=$query['preferred_double'] ?? '';
    if ($preferred!=='' && !preg_match('/^(D([1-9]|1[0-9]|20)|50)$/D',(string)$preferred)) { problem(422,'invalid-preference','Wybierz D1–D20 lub 50.'); }
    $routes=[]; $fields=[];
    foreach (['T','D','S'] as $prefix) { for ($n=20;$n>=1;$n--) { $fields[]=$prefix.$n; } }
    $fields=array_merge($fields,['50','25']);
    if ($p && $g['operation_state']==='playing' && $p['remaining']<=180) {
        $search=static function (int $remaining, bool $opened, array $path, int $limit) use (&$search,&$routes,$fields,$g): void {
            if (count($path)>=$limit) { return; }
            foreach ($fields as $field) {
                $value=dartValue($field)[0]; $isOpen=$opened || fieldQualifies($field,$g['config']['scoring']['in']);
                if (!$isOpen) { continue; } // Non-scoring setup/miss never improves a shortest checkout.
                $after=$remaining-$value; $next=array_merge($path,[$field]);
                if ($after===0 && fieldQualifies($field,$g['config']['scoring']['out'])) { $routes[]=$next; }
                elseif ($after>0 && !($after===1 && $g['config']['scoring']['out']!=='straight')) { $search($after,$isOpen,$next,$limit); }
            }
        };
        $search($p['remaining'],$p['opened'],[],$left);
        usort($routes,static function(array $a,array $b) use ($preferred): int {
            $aPreferred=$preferred!=='' && end($a)===$preferred; $bPreferred=$preferred!=='' && end($b)===$preferred;
            return ($bPreferred<=>$aPreferred) ?: (count($a)<=>count($b)) ?: strcmp(implode(',',$a),implode(',',$b));
        });
    }
    return ['revision'=>$g['revision'],'remaining'=>$p['remaining'] ?? null,'darts_left'=>$left,'routes'=>array_slice($routes,0,5),
        'message'=>$routes===[]?'Zakończenie w tej wizycie nie jest możliwe.':'Sugestie celów, nie zapis rzeczywistych trafień.'];
}

function rematch(PDO $pdo, array $body): array
{
    $old=fetchGameSnapshot($pdo,requiredInt($body,'game_id',1,PHP_INT_MAX));
    $swap=requiredBool($body,'swap_sides'); $c=$old['game']['config'];
    $method=formatEnum($body,'starter_method',['fixed','random','bull_off']); $position=requiredInt($body,'starter_player',1,2);
    $c['starters']['method']=$method; $c['starters']['player']=$position;
    return createFormattedGame($pdo,['player1_id'=>$swap?$old['game']['player2_id']:$old['game']['player1_id'],
        'player2_id'=>$swap?$old['game']['player1_id']:$old['game']['player2_id'],'config'=>$c]);
}

function archiveRecord(PDO $pdo, int $gameId, string $type, string $id, array $row, string $reason, int $revision): void
{
    $pdo->prepare('INSERT INTO record_versions(game_id,record_type,record_id,original,reason,revision) VALUES (?,?,?,?,?,?)')
        ->execute([$gameId,$type,$id,canonicalJson($row),$reason,$revision]);
}

function correctionPlan(PDO $pdo, array $body): array
{
    $id=requiredInt($body,'game_id',1,PHP_INT_MAX); $g=fetchGameRow($pdo,$id);
    if (requiredInt($body,'expected_revision',0,PHP_INT_MAX)!==(int)$g['revision']) { problem(409,'revision-conflict','Podgląd utracił aktualność. Pobierz mecz i przygotuj nowy podgląd.'); }
    assertMatchOperation($g,'history-preview'); reasonFrom($body);
    $kind=formatEnum($body,'kind',['visit','dart']);
    $visits=fetchGameVisits($pdo,$id); $darts=sqlRows($pdo,'SELECT * FROM darts WHERE game_id=? AND active=1 ORDER BY visit_no,dart_no',[$id]);
    $targetDart=null; $targetVisit=null;
    if ($kind==='dart') {
        $dartId=requiredUuid($body,'dart_id'); dartValue($body['field'] ?? null);
        foreach ($darts as $d) { if ($d['id']===$dartId) { $targetDart=$d; $targetVisit=(int)$d['visit_id']; } }
    } else { $targetVisit=requiredInt($body,'visit_id',1,PHP_INT_MAX); }
    $original=null;
    foreach ($visits as $v) { if ($v['id']===$targetVisit) { $original=$v; } }
    if (!$original || ($kind==='dart' && !$targetDart)) { problem(404,'record-not-found','Zapis nie jest częścią obowiązującego przebiegu.'); }
    if ($kind==='visit' && $original['mode']!=='aggregate') { problem(422,'select-dart','W wizycie lotkowej wybierz konkretną lotkę.'); }
    if ($kind==='visit') { $body['score']=requiredInt($body,'score',0,180); $body['darts_used']=requiredInt($body,'darts_used',1,3); $body['double_confirmed']=requiredBool($body,'double_confirmed'); }
    $withdraw=requiredBool($body,'withdraw_dependent');
    $base=$g; $base['winner_id']=null; $base['finished_at']=null; $base['confirmed_at']=null; $base['decision_json']=null;
    $projected=[]; $keptDarts=[]; $conflicts=[]; $stopped=false; $targetSeen=false;
    foreach ($visits as $v) {
        if ($stopped) { break; }
        $isTarget=$v['id']===$targetVisit; $targetSeen=$targetSeen || $isTarget;
        $before=replayGame($base,$projected);
        if ($before['game']['status']!=='active' || $before['game']['current_leg']!==$v['leg_no'] || $before['game']['current_player_id']!==$v['player_id']) {
            $conflicts[]=['visit_id'=>$v['id'],'dart_id'=>null,'message'=>'Wizyta '.$v['visit_no'].' należała do gracza '.$v['player_id'].' w legu '.$v['leg_no'].'. Po korekcie oczekiwany gracz: '.($before['game']['current_player_id'] ?? 'brak').', leg '.$before['game']['current_leg'].'.'];
            break;
        }
        $p=$before['players'][$before['players'][0]['id']===$v['player_id']?0:1];
        if ($v['mode']==='aggregate') {
            try {
                $score=$isTarget?$body['score']:$v['declared_score']; $used=$isTarget?$body['darts_used']:$v['darts_used']; $double=$isTarget?$body['double_confirmed']:$v['double_confirmed'];
                $values=evaluateAggregate($before['game']['config'],$p['remaining'],$p['opened'],$score,$used,$double);
                $v['double_confirmed']=$double;
            } catch (ApiProblem $error) {
                if ($isTarget || !$targetSeen) { throw $error; }
                $conflicts[]=['visit_id'=>$v['id'],'dart_id'=>null,'message'=>'Wizyta '.$v['visit_no'].': '.$error->getMessage()]; break;
            }
        } else {
            $fields=[]; $local=[]; $values=null;
            foreach ($darts as $d) {
                if ((int)$d['visit_id']!==$v['id']) { continue; }
                if ($values!==null && $values[5]) {
                    $conflicts[]=['visit_id'=>$v['id'],'dart_id'=>$d['id'],'message'=>'Lotka '.$d['dart_no'].' wizyta '.$v['visit_no'].' nastąpiła po nowym bust/checkout. Wymaga jawnego wycofania.']; $stopped=true; break;
                }
                if ($targetDart && $d['id']===$targetDart['id']) { $d['field']=$body['field']; }
                $fields[]=$d['field']; $values=evaluateDarts($before['game']['config'],$p['remaining'],$p['opened'],$fields); $local[]=$d;
            }
            if ($values===null) { problem(409,'invalid-dart-history','Wizyta nie ma aktywnych pól lotek.'); }
            $keptDarts=array_merge($keptDarts,$local);
        }
        foreach (['declared_score','applied_score','darts_used','is_bust','is_checkout','is_complete','opened_after'] as $i=>$key) { $v[$key]=$i>=3?(bool)$values[$i]:$values[$i]; }
        $projected[]=$v;
    }
    if (!$targetSeen) { problem(409,'history-inconsistent','Przed wybranym zapisem istnieje konflikt przebiegu. Nie zastosowano korekty.'); }
    if ($conflicts!==[]) {
        $results=json_decode($base['starter_results'],true,32,JSON_THROW_ON_ERROR);
        $lastLeg=$projected===[]?0:$projected[count($projected)-1]['leg_no'];
        foreach ($results as $leg=>$starter) { if ((int)$leg>$lastLeg) { unset($results[$leg]); } }
        $base['starter_results']=canonicalJson((object)$results);
    }
    $proposed=replayGame($base,$projected);
    $keptVisits=array_column($projected,'id'); $keptIds=array_column($keptDarts,'id');
    $removedVisits=array_values(array_filter($visits,static fn(array $v): bool => !in_array($v['id'],$keptVisits,true)));
    $removedDarts=array_values(array_filter($darts,static fn(array $d): bool => !in_array($d['id'],$keptIds,true)));
    $params=array_intersect_key($body,array_flip(['game_id','expected_revision','kind','visit_id','dart_id','field','score','darts_used','double_confirmed','reason','withdraw_dependent']));
    $token=hash('sha256',canonicalJson(['parameters'=>$params,'proposed'=>$proposed,'removed_visits'=>$removedVisits,'removed_darts'=>$removedDarts]));
    return ['preview_token'=>$token,'can_apply'=>$conflicts===[] || $withdraw,'original'=>$targetDart ?? $original,
        'proposed'=>$proposed,'conflicts'=>$conflicts,'withdrawn_visits'=>count($removedVisits),'withdrawn_darts'=>count($removedDarts),
        '_visits'=>$projected,'_darts'=>$keptDarts,'_removed_visits'=>$removedVisits,'_removed_darts'=>$removedDarts,'_starter_results'=>$base['starter_results']];
}

function publicCorrectionPlan(array $plan): array
{
    return array_filter($plan,static fn(string $key): bool => $key[0]!=='_',ARRAY_FILTER_USE_KEY);
}

function applyCorrection(PDO $pdo, array $body): array
{
    $plan=correctionPlan($pdo,$body);
    if (!is_string($body['preview_token'] ?? null) || !hash_equals($plan['preview_token'],$body['preview_token'])) { problem(409,'preview-invalid','Potwierdź aktualny podgląd tej samej korekty.'); }
    if (!$plan['can_apply']) { problem(409,'dependent-history-conflict','Dalszy przebieg jest sprzeczny. Anuluj albo jawnie wycofaj wskazany fragment.',['conflicts'=>$plan['conflicts']]); }
    $id=(int)$body['game_id']; $reason=reasonFrom($body); $revision=(int)$body['expected_revision']+1;
    foreach ($plan['_visits'] as $v) {
        $old=sqlOne($pdo,'SELECT * FROM visits WHERE id=?',[$v['id']]);
        $keys=['declared_score','applied_score','darts_used','is_bust','is_checkout','is_complete','opened_after','double_confirmed'];
        $values=[]; $changed=false;
        foreach ($keys as $key) { $values[]=(int)$v[$key]; if ((int)$old[$key]!==end($values)) { $changed=true; } }
        if ($changed) {
            archiveRecord($pdo,$id,'visit',(string)$v['id'],$old,$reason,$revision);
            $pdo->prepare('UPDATE visits SET '.implode('=?,',$keys).'=? WHERE id=?')->execute(array_merge($values,[$v['id']]));
            $pdo->prepare("UPDATE visits SET checkout_attempts=NULL,source='correction' WHERE id=?")->execute([$v['id']]);
        }
    }
    foreach ($plan['_darts'] as $d) {
        $old=sqlOne($pdo,'SELECT * FROM darts WHERE id=?',[$d['id']]);
        if ($old['field']!==$d['field']) {
            archiveRecord($pdo,$id,'dart',$d['id'],$old,$reason,$revision);
            $pdo->prepare('UPDATE darts SET field=? WHERE id=?')->execute([$d['field'],$d['id']]);
            $pdo->prepare("UPDATE darts SET target=NULL,checkout_attempt=NULL,source='correction' WHERE id=?")->execute([$d['id']]);
            $pdo->prepare("UPDATE visits SET checkout_attempts=NULL,source='correction' WHERE id=?")->execute([$d['visit_id']]);
        }
    }
    foreach ($plan['_removed_visits'] as $v) {
        archiveRecord($pdo,$id,'visit',(string)$v['id'],sqlOne($pdo,'SELECT * FROM visits WHERE id=?',[$v['id']]),$reason,$revision);
        $pdo->prepare('UPDATE visits SET active=0 WHERE id=?')->execute([$v['id']]);
    }
    foreach ($plan['_removed_darts'] as $d) {
        archiveRecord($pdo,$id,'dart',$d['id'],$d,$reason,$revision);
        $pdo->prepare('UPDATE darts SET active=0 WHERE id=?')->execute([$d['id']]);
    }
    $pdo->prepare('UPDATE games SET winner_id=NULL,finished_at=NULL,confirmed_at=NULL,starter_results=? WHERE id=?')->execute([$plan['_starter_results'],$id]);
    persistCompletion($pdo,$id);
    return [];
}
