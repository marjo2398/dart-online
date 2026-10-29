<?php
declare(strict_types=1);

// Additive migration. Existing scoring rows, credentials and command responses are untouched.
function migrateProfiles(PDO $pdo): void
{
    if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()>=6) { return; }
    transaction($pdo,static function() use ($pdo): void {
        if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn()>=6) { return; }
        foreach (['nickname'=>'TEXT','club'=>'TEXT','throwing_hand'=>'TEXT','notes'=>'TEXT','preferred_double'=>'TEXT','hints_enabled'=>'INTEGER','archived'=>'INTEGER NOT NULL DEFAULT 0','is_guest'=>'INTEGER NOT NULL DEFAULT 0','merged_into'=>'INTEGER REFERENCES players(id)','profile_revision'=>'INTEGER NOT NULL DEFAULT 0'] as $key=>$type) { ensureColumn($pdo,'players',$key,$type); }
        foreach (['recording_level'=>'TEXT','checkout_attempts'=>'INTEGER','source'=>'TEXT'] as $key=>$type) { ensureColumn($pdo,'visits',$key,$type); }
        ensureColumn($pdo,'darts','target','TEXT'); ensureColumn($pdo,'darts','checkout_attempt','INTEGER');
        ensureColumn($pdo,'games','context_kind','TEXT'); ensureColumn($pdo,'games','venue','TEXT');
        foreach (['rule_in','rule_out','match_unit'] as $key) { ensureColumn($pdo,'games',$key,'TEXT'); }
        foreach (sqlRows($pdo,'SELECT id,config_json FROM games') as $g) { $c=json_decode($g['config_json'],true,32,JSON_THROW_ON_ERROR); $pdo->prepare('UPDATE games SET rule_in=?,rule_out=?,match_unit=? WHERE id=?')->execute([$c['scoring']['in'],$c['scoring']['out'],$c['match']['unit'],$g['id']]); }
        $pdo->exec("CREATE TABLE profile_merges(id INTEGER PRIMARY KEY AUTOINCREMENT,source_id INTEGER NOT NULL REFERENCES players(id),target_id INTEGER NOT NULL REFERENCES players(id),reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
            CREATE TABLE equipment(id INTEGER PRIMARY KEY AUTOINCREMENT,player_id INTEGER NOT NULL REFERENCES players(id),name TEXT NOT NULL,weight REAL,notes TEXT,archived INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE game_equipment(game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,player_id INTEGER NOT NULL REFERENCES players(id),equipment_id INTEGER NOT NULL REFERENCES equipment(id),name_snapshot TEXT NOT NULL,weight_snapshot REAL,PRIMARY KEY(game_id,player_id));
            CREATE INDEX idx_games_created ON games(created_at DESC,id DESC);
            CREATE INDEX idx_games_rules_date ON games(starting_score,rule_in,rule_out,match_unit,created_at DESC,id DESC);
            CREATE INDEX idx_games_p1_created ON games(player1_id,created_at DESC,id DESC);
            CREATE INDEX idx_games_p2_created ON games(player2_id,created_at DESC,id DESC);
            CREATE INDEX idx_visits_analysis ON visits(game_id,active,leg_no,visit_no);
            CREATE INDEX idx_darts_visit_active ON darts(visit_id,active,dart_no);
            CREATE INDEX idx_players_alias ON players(merged_into);
            CREATE INDEX idx_equipment_owner ON equipment(player_id,archived);
            UPDATE schema_meta SET value='6' WHERE key='schema_version';");
    });
}

function profileFields(array $r): array
{
    $out=[];
    foreach (['nickname','club','throwing_hand','notes','preferred_double','merged_into'] as $key) { $out[$key]=$r[$key] ?? null; }
    if ($out['merged_into']!==null) { $out['merged_into']=(int)$out['merged_into']; }
    $out['archived']=(bool)($r['archived'] ?? false); $out['is_guest']=(bool)($r['is_guest'] ?? false);
    $out['hints_enabled']=isset($r['hints_enabled'])?(bool)$r['hints_enabled']:null;
    $out['profile_revision']=(int)($r['profile_revision'] ?? 0);
    return $out;
}

function profileRow(PDO $pdo, int $id): array
{
    $p=sqlOne($pdo,'SELECT * FROM players WHERE id=?',[$id]);
    if (!$p) { problem(404,'player-not-found','Nie znaleziono profilu.'); }
    return $p;
}

function canonicalPlayer(PDO $pdo, int $id): int
{
    $seen=[];
    do {
        if (isset($seen[$id])) { throw new RuntimeException('Profile alias cycle'); }
        $seen[$id]=true; $p=profileRow($pdo,$id); $next=$p['merged_into'];
        if ($next!==null) { $id=(int)$next; }
    } while ($next!==null);
    return $id;
}

function profileIds(PDO $pdo, int $id): array
{
    $root=canonicalPlayer($pdo,$id); $ids=[$root];
    for ($i=0;$i<count($ids);$i++) { foreach (sqlRows($pdo,'SELECT id FROM players WHERE merged_into=?',[$ids[$i]]) as $r) { $ids[]=(int)$r['id']; } }
    sort($ids); return $ids;
}

function optionalText(array $body, string $key, int $max): ?string
{
    $v=$body[$key] ?? null;
    if ($v===null || $v==='') { return null; }
    if (!is_string($v) || !preg_match('//u',$v) || strlen($v)>$max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',$v)) { problem(422,'invalid-profile-field','Nieprawidłowe pole: '.$key.'.'); }
    return trim($v) ?: null;
}

function profileValues(array $b): array
{
    $name=optionalText($b,'name',160);
    if ($name===null || (function_exists('mb_strlen')?mb_strlen($name):strlen($name))>40) { problem(422,'invalid-player-name','Nazwa musi mieć 1–40 znaków.'); }
    $hand=optionalText($b,'throwing_hand',8); if ($hand!==null && !in_array($hand,['left','right','both'],true)) { problem(422,'invalid-profile-field','Wybierz rękę lub brak danych.'); }
    $double=optionalText($b,'preferred_double',3);
    if ($double!==null && !preg_match('/^(D([1-9]|1[0-9]|20)|50)$/D',$double)) { problem(422,'invalid-preference','Wybierz D1–D20 lub 50.'); }
    $hints=$b['hints_enabled'] ?? null; if ($hints!==null && !is_bool($hints)) { problem(422,'invalid-profile-field','Podpowiedzi: tak, nie lub brak ustawienia.'); }
    return [$name,optionalText($b,'nickname',120),optionalText($b,'club',160),$hand,optionalText($b,'notes',1000),$double,$hints===null?null:(int)$hints,(int)requiredBool($b,'is_guest')];
}

function saveProfile(PDO $pdo, array $b): array
{
    $id=requiredInt($b,'player_id',1,PHP_INT_MAX); $p=profileRow($pdo,$id);
    if ($p['merged_into']!==null) { problem(409,'profile-merged','Edytuj profil docelowy.'); }
    if (requiredInt($b,'profile_revision',0,PHP_INT_MAX)!==(int)$p['profile_revision']) { problem(409,'profile-conflict','Profil zmieniono na innym ekranie. Odśwież go.'); }
    $v=profileValues($b);
    if (sqlOne($pdo,'SELECT id FROM players WHERE name=? COLLATE NOCASE AND id<>?',[$v[0],$id])) { problem(409,'player-name-exists','Ta nazwa już istnieje. Nie łączymy profili automatycznie.'); }
    $pdo->prepare('UPDATE players SET name=?,nickname=?,club=?,throwing_hand=?,notes=?,preferred_double=?,hints_enabled=?,is_guest=?,profile_revision=profile_revision+1 WHERE id=?')->execute(array_merge($v,[$id]));
    if (array_key_exists('archived',$b)) { $pdo->prepare('UPDATE players SET archived=? WHERE id=?')->execute([(int)requiredBool($b,'archived'),$id]); }
    return normalizePlayer(profileRow($pdo,$id));
}

function createProfile(PDO $pdo, array $b): array
{
    $v=profileValues($b); $p=createPlayer($pdo,['name'=>$v[0],'is_guest'=>(bool)($b['is_guest']??false)]);
    $pdo->prepare('UPDATE players SET name=?,nickname=?,club=?,throwing_hand=?,notes=?,preferred_double=?,hints_enabled=?,is_guest=? WHERE id=?')->execute(array_merge($v,[$p['id']]));
    return normalizePlayer(profileRow($pdo,$p['id']));
}

function archiveProfile(PDO $pdo, array $b): array
{
    $id=requiredInt($b,'player_id',1,PHP_INT_MAX); $p=profileRow($pdo,$id);
    if ($p['merged_into']!==null) { problem(409,'profile-merged','Scalony profil pozostaje archiwalny.'); }
    if (requiredInt($b,'profile_revision',0,PHP_INT_MAX)!==(int)$p['profile_revision']) { problem(409,'profile-conflict','Odśwież profil.'); }
    $pdo->prepare('UPDATE players SET archived=?,profile_revision=profile_revision+1 WHERE id=?')->execute([(int)requiredBool($b,'archived'),$id]);
    return normalizePlayer(profileRow($pdo,$id));
}

function mergePreview(PDO $pdo, array $b): array
{
    $source=requiredInt($b,'source_id',1,PHP_INT_MAX); $target=requiredInt($b,'target_id',1,PHP_INT_MAX);
    if ($source===$target || canonicalPlayer($pdo,$source)!==$source || canonicalPlayer($pdo,$target)!==$target) { problem(422,'invalid-merge','Wybierz dwa różne niescalone profile.'); }
    reasonFrom($b); $a=profileIds($pdo,$source); $z=profileIds($pdo,$target); $all=array_merge($a,$z); $ph=implode(',',array_fill(0,count($all),'?'));
    $games=sqlRows($pdo,"SELECT id,player1_id,player2_id,revision,finished_at,winner_id FROM games WHERE player1_id IN ($ph) OR player2_id IN ($ph) ORDER BY id",array_merge($all,$all));
    $conflicts=[];
    foreach ($games as $g) {
        if ((in_array((int)$g['player1_id'],$a,true) && in_array((int)$g['player2_id'],$z,true)) || (in_array((int)$g['player2_id'],$a,true) && in_array((int)$g['player1_id'],$z,true))) { $conflicts[]=['game_id'=>(int)$g['id'],'reason'=>'Obie strony stałyby się tą samą osobą.']; }
        elseif ($g['finished_at']===null && $g['winner_id']===null) { $conflicts[]=['game_id'=>(int)$g['id'],'reason'=>'Aktywny mecz — najpierw zakończ go albo anuluj z uzasadnieniem.']; }
    }
    $counts=sqlOne($pdo,"SELECT COUNT(*) visits,COALESCE(SUM(darts_used),0) darts FROM visits WHERE player_id IN ($ph)",$all);
    $profiles=sqlRows($pdo,"SELECT id,profile_revision,merged_into FROM players WHERE id IN ($ph) ORDER BY id",$all);
    return ['source_id'=>$source,'target_id'=>$target,'games'=>count($games),'visits'=>(int)$counts['visits'],'darts'=>(int)$counts['darts'],'conflicts'=>$conflicts,'can_apply'=>$conflicts===[],
        'preview_token'=>hash('sha256',canonicalJson([$profiles,$games,$counts,$b['reason']]))];
}

function mergeProfiles(PDO $pdo, array $b): array
{
    $plan=mergePreview($pdo,$b);
    if (!hash_equals($plan['preview_token'],(string)($b['preview_token'] ?? ''))) { problem(409,'preview-invalid','Scalenie utraciło aktualność. Przygotuj nowy podgląd.'); }
    if (!$plan['can_apply']) { problem(409,'merge-conflict','Nie można scalić tych profili.',['conflicts'=>$plan['conflicts']]); }
    $pdo->prepare('UPDATE players SET merged_into=?,archived=1,profile_revision=profile_revision+1 WHERE id=?')->execute([$plan['target_id'],$plan['source_id']]);
    $pdo->prepare('UPDATE players SET profile_revision=profile_revision+1 WHERE id=?')->execute([$plan['target_id']]);
    $pdo->prepare('INSERT INTO profile_merges(source_id,target_id,reason) VALUES (?,?,?)')->execute([$plan['source_id'],$plan['target_id'],reasonFrom($b)]);
    return ['player'=>normalizePlayer(profileRow($pdo,$plan['target_id'])),'alias_ids'=>profileIds($pdo,$plan['target_id'])];
}

function assertProfileAdmin(array $actor): void
{
    if ($actor['role']!=='admin') { problem(403,'admin-required','Profile, analiza i eksport wymagają administratora WWW.'); }
}

function saveEquipment(PDO $pdo, array $b): array
{
    $owner=requiredInt($b,'player_id',1,PHP_INT_MAX); $p=profileRow($pdo,$owner);
    if ($p['merged_into']!==null) { problem(409,'profile-merged','Wybierz profil docelowy.'); }
    $name=optionalText($b,'name',120); if ($name===null) { problem(422,'invalid-equipment','Podaj nazwę zestawu.'); }
    $weight=$b['weight'] ?? null;
    if ($weight!==null && (!is_numeric($weight) || !is_finite((float)$weight) || (float)$weight<1 || (float)$weight>100)) { problem(422,'invalid-equipment','Masa musi mieć 1–100 g lub pozostać pusta.'); }
    $notes=optionalText($b,'notes',1000); $archived=(int)requiredBool($b,'archived');
    if (isset($b['equipment_id'])) {
        $id=requiredInt($b,'equipment_id',1,PHP_INT_MAX); $row=sqlOne($pdo,'SELECT * FROM equipment WHERE id=?',[$id]);
        if (!$row || canonicalPlayer($pdo,(int)$row['player_id'])!==$owner || (int)$row['revision']!==requiredInt($b,'equipment_revision',0,PHP_INT_MAX)) { problem(409,'equipment-conflict','Odśwież zestaw właściwego profilu.'); }
        $pdo->prepare('UPDATE equipment SET name=?,weight=?,notes=?,archived=?,revision=revision+1 WHERE id=?')->execute([$name,$weight,$notes,$archived,$id]);
    } else { $pdo->prepare('INSERT INTO equipment(player_id,name,weight,notes,archived) VALUES (?,?,?,?,?)')->execute([$owner,$name,$weight,$notes,$archived]); $id=(int)$pdo->lastInsertId(); }
    return sqlOne($pdo,'SELECT * FROM equipment WHERE id=?',[$id]);
}

function gameMetadata(PDO $pdo, array $b): array
{
    $id=requiredInt($b,'game_id',1,PHP_INT_MAX); $g=fetchGameRow($pdo,$id);
    if ($g['confirmed_at']!==null) { problem(409,'result-locked','Najpierw uprawnione otwarcie wyniku.'); }
    $kind=optionalText($b,'context_kind',16); if ($kind!==null && !in_array($kind,['training','friendly','official'],true)) { problem(422,'invalid-context','Wybierz rodzaj gry lub brak danych.'); }
    $pdo->prepare('UPDATE games SET context_kind=?,venue=? WHERE id=?')->execute([$kind,optionalText($b,'venue',160),$id]);
    foreach ([(int)$g['player1_id'],(int)$g['player2_id']] as $player) {
        $gear=$b['equipment'][(string)$player] ?? null;
        $old=sqlOne($pdo,'SELECT * FROM game_equipment WHERE game_id=? AND player_id=?',[$id,$player]);
        if ($old && (string)$old['equipment_id']===(string)$gear) { continue; }
        $pdo->prepare('DELETE FROM game_equipment WHERE game_id=? AND player_id=?')->execute([$id,$player]);
        if ($gear!==null && $gear!=='') {
            $row=sqlOne($pdo,'SELECT * FROM equipment WHERE id=?',[(int)$gear]);
            if (!$row || (bool)$row['archived'] || canonicalPlayer($pdo,(int)$row['player_id'])!==canonicalPlayer($pdo,$player)) { problem(422,'invalid-equipment','Zestaw musi należeć do zawodnika i być aktywny.'); }
            $pdo->prepare('INSERT INTO game_equipment VALUES (?,?,?,?,?)')->execute([$id,$player,$row['id'],$row['name'],$row['weight']]);
        }
    }
    return [];
}

// Optional annotation stays on the existing scoring row. NULL is different from an explicit zero.
function annotateScoring(PDO $pdo, string $action, array $body, array $result): void
{
    if (!in_array($action,['visit-create','remaining-create','dart-create','observation-review','visit-correct','dart-correct'],true) || ($action==='observation-review' && ($body['decision'] ?? '')!=='accept')) { return; }
    $game=(int)$body['game_id'];
    $v=sqlOne($pdo,'SELECT * FROM visits WHERE game_id=? AND active=1 ORDER BY visit_no DESC LIMIT 1',[$game]);
    if (!$v) { return; }
    $correction=in_array($action,['visit-correct','dart-correct'],true);
    if ($v['mode']==='aggregate') {
        $level=$body['recording_level'] ?? 'quick';
        if (!in_array($level,['quick','extended'],true)) { problem(422,'invalid-recording','Wybierz szybki lub rozszerzony zapis sumy.'); }
        $attempts=$body['checkout_attempts'] ?? null;
        if ($level==='extended' && $attempts===null) { problem(422,'attempts-required','W trybie rozszerzonym podaj liczbę prób zakończenia.'); }
        if ($attempts!==null) { $attempts=requiredInt($body,'checkout_attempts',0,(int)$v['darts_used']); if ((bool)$v['is_checkout'] && $attempts===0) { problem(422,'invalid-attempts','Zakończenie wymaga co najmniej jednej zadeklarowanej próby.'); } }
        $pdo->prepare('UPDATE visits SET recording_level=?,checkout_attempts=?,source=? WHERE id=?')->execute([$level,$attempts,$correction?'correction':'manual',$v['id']]);
    } else {
        $d=sqlOne($pdo,'SELECT * FROM darts WHERE visit_id=? AND active=1 ORDER BY dart_no DESC LIMIT 1',[$v['id']]);
        $target=$body['target'] ?? null; if ($target!==null && $target!=='') { dartValue($target); } else { $target=null; }
        $attempt=$body['checkout_attempt'] ?? null;
        if ($attempt!==null && !is_bool($attempt)) { problem(422,'invalid-attempts','Deklaracja próby musi być tak/nie lub nieznana.'); }
        if ($attempt===false && (bool)$v['is_checkout']) { problem(422,'invalid-attempts','Zapis kończący leg nie może deklarować braku próby.'); }
        $pdo->prepare('UPDATE darts SET target=?,checkout_attempt=?,source=? WHERE id=?')->execute([$target,$attempt===null?null:(int)$attempt,$correction?'correction':$d['source'],$d['id']]);
        $sum=sqlOne($pdo,'SELECT COUNT(*) n,COUNT(checkout_attempt) known,SUM(checkout_attempt) attempts FROM darts WHERE visit_id=? AND active=1',[$v['id']]);
        $pdo->prepare("UPDATE visits SET recording_level='detailed',checkout_attempts=?,source=? WHERE id=?")->execute([(int)$sum['n']===(int)$sum['known']?(int)$sum['attempts']:null,$correction?'correction':($action==='observation-review'?'camera-confirmed':'manual'),$v['id']]);
    }
}
