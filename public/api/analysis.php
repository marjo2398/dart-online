<?php
declare(strict_types=1);
const METRICS_VERSION = 1;

function warsawBoundary(string $day, bool $next = false): string
{
    $d=DateTimeImmutable::createFromFormat('!Y-m-d',$day,new DateTimeZone('Europe/Warsaw'));
    if (!$d || $d->format('Y-m-d')!==$day) { problem(422,'invalid-date','Podaj prawidłowy dzień YYYY-MM-DD.'); }
    if ($next) { $d=$d->modify('+1 day'); }
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.000\Z');
}

function analysisFilters(array $q): array
{
    $f=['from'=>'','to'=>'','opponent'=>'','player_id'=>'','start'=>'501','in'=>'straight','out'=>'double','unit'=>'legs','status'=>'completed','recording'=>'all','completeness'=>'all','kind'=>'all','venue'=>'','equipment_id'=>'','q'=>''];
    foreach ($f as $key=>$default) { if (isset($q[$key])) { if (!is_scalar($q[$key]) || strlen((string)$q[$key])>200) { problem(422,'invalid-filter','Nieprawidłowy filtr: '.$key); } $f[$key]=trim((string)$q[$key]); } }
    foreach (['in'=>['all','straight','double','master'],'out'=>['all','straight','double','master'],'unit'=>['all','legs','sets','fixed'],
        'status'=>['all','completed','confirmed','pending','active','paused','surrender','walkover','interrupted','cancelled'],
        'recording'=>['all','aggregate','darts','manual','camera-confirmed','correction','unknown'],
        'completeness'=>['all','fields','attempts','partial'],'kind'=>['all','unknown','training','friendly','official']] as $key=>$allowed) {
        if (!in_array($f[$key],$allowed,true)) { problem(422,'invalid-filter','Nieprawidłowy filtr: '.$key); }
    }
    foreach (['player_id','opponent','equipment_id'] as $key) { if ($f[$key]!=='' && (!ctype_digit($f[$key]) || (int)$f[$key]<1)) { problem(422,'invalid-filter','Nieprawidłowy identyfikator.'); } }
    if ($f['start']!=='all' && (!ctype_digit($f['start']) || (int)$f['start']<2 || (int)$f['start']>10001)) { problem(422,'invalid-filter','Wynik startowy: 2–10001 lub all.'); }
    if ($f['from']!=='') { warsawBoundary($f['from']); } if ($f['to']!=='') { warsawBoundary($f['to']); }
    if ($f['from']!=='' && $f['to']!=='' && $f['from']>$f['to']) { problem(422,'invalid-date-range','Początek okresu jest po końcu.'); }
    return $f;
}

function filteredGames(PDO $pdo, array $f, ?array $cursor = null, ?int $limit = null): array
{
    $w=['1=1']; $p=[];
    foreach (['start'=>'starting_score','in'=>'rule_in','out'=>'rule_out','unit'=>'match_unit'] as $k=>$column) { if ($f[$k]!=='all') { $w[]="g.$column=?"; $p[]=$f[$k]; } }
    foreach (['from','to'] as $k) { if ($f[$k]!=='') { $w[]='g.created_at'.($k==='from'?'>=':'<').'?'; $p[]=warsawBoundary($f[$k],$k==='to'); } }
    foreach (['player_id','opponent'] as $k) { if ($f[$k]!=='') { $ids=profileIds($pdo,(int)$f[$k]); $ph=implode(',',array_fill(0,count($ids),'?')); $w[]="(g.player1_id IN ($ph) OR g.player2_id IN ($ph))"; $p=array_merge($p,$ids,$ids); } }
    if ($f['player_id']!=='' && $f['opponent']!=='' && canonicalPlayer($pdo,(int)$f['player_id'])===canonicalPlayer($pdo,(int)$f['opponent'])) { $w[]='0=1'; }
    $s=$f['status'];
    if ($s==='completed') { $w[]='(g.finished_at IS NOT NULL OR g.winner_id IS NOT NULL)'; }
    elseif ($s==='confirmed') { $w[]='g.confirmed_at IS NOT NULL'; }
    elseif ($s==='pending') { $w[]='g.confirmed_at IS NULL AND (g.finished_at IS NOT NULL OR g.winner_id IS NOT NULL)'; }
    elseif ($s==='active' || $s==='paused') { $w[]='g.finished_at IS NULL AND g.winner_id IS NULL'; if ($s==='paused') { $w[]='g.is_paused=1'; } }
    elseif ($s!=='all') { $w[]="g.decision_json LIKE ?"; $p[]='%"kind":"'.$s.'"%'; }
    if ($f['kind']==='unknown') { $w[]='g.context_kind IS NULL'; } elseif ($f['kind']!=='all') { $w[]='g.context_kind=?'; $p[]=$f['kind']; }
    if ($f['venue']!=='') { $w[]='g.venue=?'; $p[]=$f['venue']; }
    if ($f['q']!=='') { $w[]="(p1.name LIKE ? ESCAPE '\\' OR p2.name LIKE ? ESCAPE '\\' OR CAST(g.id AS TEXT)=?)"; $like='%'.strtr($f['q'],['\\'=>'\\\\','%'=>'\\%','_'=>'\\_']).'%'; array_push($p,$like,$like,$f['q']); }
    if ($f['equipment_id']!=='') {
        $owner=''; $p[]=$f['equipment_id'];
        if ($f['player_id']!=='') { $owners=profileIds($pdo,(int)$f['player_id']); $owner=' AND ge.player_id IN ('.implode(',',array_fill(0,count($owners),'?')).')'; $p=array_merge($p,$owners); }
        $w[]='EXISTS(SELECT 1 FROM game_equipment ge WHERE ge.game_id=g.id AND ge.equipment_id=?'.$owner.')';
    }
    $r=$f['recording']; if ($r!=='all') {
        if (in_array($r,['aggregate','darts'],true)) { $condition='v.mode=?'; $p[]=$r; }
        elseif ($r==='unknown') { $condition='v.source IS NULL'; } else { $condition='v.source=?'; $p[]=$r; }
        $w[]='EXISTS(SELECT 1 FROM visits v WHERE v.game_id=g.id AND v.active=1 AND '.$condition.')';
    }
    if ($f['completeness']==='fields') { $w[]="EXISTS(SELECT 1 FROM visits v WHERE v.game_id=g.id AND v.active=1) AND NOT EXISTS(SELECT 1 FROM visits v WHERE v.game_id=g.id AND v.active=1 AND v.mode<>'darts')"; }
    elseif ($f['completeness']==='attempts') { $w[]='EXISTS(SELECT 1 FROM visits v WHERE v.game_id=g.id AND v.active=1) AND NOT EXISTS(SELECT 1 FROM visits v WHERE v.game_id=g.id AND v.active=1 AND v.checkout_attempts IS NULL)'; }
    elseif ($f['completeness']==='partial') { $w[]="EXISTS(SELECT 1 FROM visits v WHERE v.game_id=g.id AND v.active=1 AND (v.mode='aggregate' OR v.checkout_attempts IS NULL OR v.is_complete=0))"; }
    if ($cursor!==null) { $w[]='g.id<=?'; $p[]=$cursor['ceiling']; if (isset($cursor['id'])) { $w[]='(g.created_at<? OR (g.created_at=? AND g.id<?))'; array_push($p,$cursor['date'],$cursor['date'],$cursor['id']); } }
    return sqlRows($pdo,'SELECT g.*,p1.name player1_name,p2.name player2_name FROM games g JOIN players p1 ON p1.id=g.player1_id JOIN players p2 ON p2.id=g.player2_id WHERE '.implode(' AND ',$w).' ORDER BY g.created_at DESC,g.id DESC'.($limit===null?'':' LIMIT '.(int)$limit),$p);
}

function analysisSources(PDO $pdo, array $rows): array
{
    $visits=$darts=$corrections=$withdrawn=$equipment=[];
    foreach (array_chunk(array_column($rows,'id'),300) as $ids) {
        $ph=implode(',',array_fill(0,count($ids),'?'));
        foreach (sqlRows($pdo,"SELECT * FROM visits WHERE active=1 AND game_id IN ($ph) ORDER BY game_id,visit_no,id",$ids) as $v) { $visits[(int)$v['game_id']][]=normalizeVisit($v); }
        foreach (sqlRows($pdo,"SELECT id,game_id,leg_no,visit_id,visit_no,player_id,dart_no,field,source,target,checkout_attempt,created_at FROM darts WHERE active=1 AND game_id IN ($ph) ORDER BY game_id,visit_no,dart_no",$ids) as $d) {
            foreach (['game_id','leg_no','visit_id','visit_no','player_id','dart_no','checkout_attempt'] as $key) { if ($d[$key]!==null) { $d[$key]=(int)$d[$key]; } } $darts[(int)$d['game_id']][]=$d;
        }
        foreach (sqlRows($pdo,"SELECT game_id,COUNT(*) n FROM record_versions WHERE game_id IN ($ph) GROUP BY game_id",$ids) as $r) { $corrections[$r['game_id']]=(int)$r['n']; }
        foreach (sqlRows($pdo,"SELECT game_id,COUNT(*) n FROM visits WHERE active=0 AND game_id IN ($ph) GROUP BY game_id",$ids) as $r) { $withdrawn[$r['game_id']]=(int)$r['n']; }
        foreach (sqlRows($pdo,"SELECT game_id,player_id,equipment_id,name_snapshot,weight_snapshot FROM game_equipment WHERE game_id IN ($ph)",$ids) as $r) { $equipment[$r['game_id']][]=$r; }
    }
    return [$visits,$darts,$corrections,$withdrawn,$equipment];
}

function analyzeMatch(array $row, array $visits, array $darts, int $corrections, int $withdrawn): array
{
    $s=replayGame($row,$visits); $s['darts']=$darts;
    $s['game']['context_kind']=$row['context_kind']; $s['game']['venue']=$row['venue'];
    $s['quality']=['field_visits'=>count(array_filter($visits,static fn(array $v):bool=>$v['mode']==='darts')),'visits'=>count($visits),'attempt_visits'=>count(array_filter($visits,static fn(array $v):bool=>$v['checkout_attempts']!==null)),
        'partial_visits'=>count(array_filter($visits,static fn(array $v):bool=>!$v['is_complete'])),'previous_versions'=>$corrections,'withdrawn_visits'=>$withdrawn];
    $s['included_scoring']=$s['game']['stats_eligible'];
    return $s;
}

function newMetrics(): array
{
    return ['games'=>0,'confirmed'=>0,'pending'=>0,'active'=>0,'wins'=>0,'losses'=>0,'draws'=>0,'administrative'=>[], 'scoring_games'=>0,
        'points'=>0,'darts'=>0,'visits'=>0,'complete_visits'=>0,'partial_visits'=>0,'field_visits'=>0,'known_source_visits'=>0,'busts'=>0,
        'bands'=>['0–39'=>0,'40–59'=>0,'60–99'=>0,'100–139'=>0,'140–179'=>0,'180'=>0],
        'highest_visit'=>null,'highest_checkout'=>null,'checkout_100'=>0,'checkouts'=>0,'opportunities'=>0,'opportunity_wins'=>0,'known_attempt_visits'=>0,'known_opportunities'=>0,'attempts'=>0,'attempt_wins'=>0,
        'first9_points'=>0,'first9_darts'=>0,'first9_known'=>0,'first9_eligible'=>0,'won_legs'=>0,'lost_legs'=>0,'won_sets'=>0,'lost_sets'=>0,'leg_darts'=>0,'best_leg'=>null,'leg_lengths'=>[],
        'holds'=>0,'breaks'=>0,'unknown_starters'=>0,'decider_wins'=>0,'decider_losses'=>0,'doubles'=>[],'sectors'=>[],'timeline'=>[]];
}

function checkoutPossible(int $remaining, bool $opened, array $c): bool
{
    static $memo=[];
    $key=$remaining.':'.(int)$opened.':'.$c['scoring']['in'].':'.$c['scoring']['out']; if (isset($memo[$key])) { return $memo[$key]; }
    if ($remaining>180 || $remaining<1) { return $memo[$key]=false; }
    $states=[[$remaining,$opened]];
    for ($i=0;$i<3;$i++) { $next=[]; foreach ($states as [$r,$op]) { foreach (array_merge(['25','50'],array_map(static fn(int $n):string=>'S'.$n,range(1,20)),array_map(static fn(int $n):string=>'D'.$n,range(1,20)),array_map(static fn(int $n):string=>'T'.$n,range(1,20))) as $f) {
        $open=$op || fieldQualifies($f,$c['scoring']['in']); if (!$open) { continue; } $after=$r-dartValue($f)[0];
        if ($after===0 && fieldQualifies($f,$c['scoring']['out'])) { return $memo[$key]=true; }
        if ($after>0 && !($after===1 && $c['scoring']['out']!=='straight')) { $next[$after]=[$after,true]; }
    } } $states=array_values($next); }
    return $memo[$key]=false;
}

function recordMaximum(?array $old, int $value, int $game, int $record): array
{
    return $old===null || $value>$old['value'] ? ['value'=>$value,'game_id'=>$game,'record_id'=>$record] : $old;
}

function accumulateMetrics(array &$m, array $s, array $ids, ?array $onlyLegs = null): void
{
    $g=$s['game']; $my=array_values(array_filter($s['players'],static fn(array $p):bool=>in_array($p['id'],$ids,true)));
    if ($my===[]) { return; } $p=$my[0]; $pid=$p['id']; $game=$g['id']; $m['games']++;
    $m[$g['operation_state']==='confirmed'?'confirmed':($g['status']==='finished'?'pending':'active')]++;
    $day=(new DateTimeImmutable($g['created_at']))->setTimezone(new DateTimeZone('Europe/Warsaw'))->format('Y-m-d');
    if (!isset($m['timeline'][$day])) { $m['timeline'][$day]=['points'=>0,'darts'=>0,'games'=>0,'wins'=>0,'losses'=>0,'draws'=>0,'administrative'=>0]; }
    $m['timeline'][$day]['games']++;
    if ($g['decision']!==null) { $m['timeline'][$day]['administrative']++; }
    elseif ($g['status']==='finished') { $m['timeline'][$day][$g['winner_id']===null?'draws':($g['winner_id']===$pid?'wins':'losses')]++; }
    if ($g['decision']!==null) { $kind=$g['decision']['kind']; $m['administrative'][$kind]=($m['administrative'][$kind] ?? 0)+1; }
    elseif ($g['status']==='finished') { $m[$g['winner_id']===null?'draws':($g['winner_id']===$pid?'wins':'losses')]++; }
    if (!$s['included_scoring']) { return; } $m['scoring_games']++;
    $opponent=$s['players'][$s['players'][0]['id']===$pid?1:0];
    if ($onlyLegs===null) { $m['won_sets']+=$p['sets']; $m['lost_sets']+=$opponent['sets']; }
    $byVisit=[]; foreach ($s['darts'] as $d) { $byVisit[$d['visit_id']][]=$d; } $visitIndex=array_column($s['visits'],null,'id');
    $legs=[];
    foreach ($s['visits'] as $v) {
        if ($v['player_id']!==$pid || ($onlyLegs!==null && !in_array($v['leg_no'],$onlyLegs,true))) { continue; }
        $m['points']+=$v['applied_score']; $m['darts']+=$v['darts_used']; $m['visits']++; $legs[$v['leg_no']][]=$v;
        if (!isset($m['timeline'][$day])) { $m['timeline'][$day]=['points'=>0,'darts'=>0]; }
        $m['timeline'][$day]['points']+=$v['applied_score']; $m['timeline'][$day]['darts']+=$v['darts_used'];
        if ($v['source']!==null) { $m['known_source_visits']++; } if ($v['mode']==='darts') { $m['field_visits']++; }
        if (!$v['is_complete']) { $m['partial_visits']++; continue; }
        $m['complete_visits']++; if ($v['is_bust']) { $m['busts']++; }
        $band=$v['applied_score']===180?'180':($v['applied_score']>=140?'140–179':($v['applied_score']>=100?'100–139':($v['applied_score']>=60?'60–99':($v['applied_score']>=40?'40–59':'0–39')))); $m['bands'][$band]++;
        $m['highest_visit']=recordMaximum($m['highest_visit'],$v['applied_score'],$game,$v['id']);
        $context=$s['visit_contexts'][$v['id']]; $possible=checkoutPossible($context['remaining'],$context['opened'],$g['config']);
        if ($possible) { $m['opportunities']++; if ($v['is_checkout']) { $m['opportunity_wins']++; } }
        if ($v['checkout_attempts']!==null) { $m['known_attempt_visits']++; $m['attempts']+=$v['checkout_attempts']; if ($possible) { $m['known_opportunities']++; } if ($v['is_checkout']) { $m['attempt_wins']++; } }
        if ($v['is_checkout']) { $m['checkouts']++; $m['highest_checkout']=recordMaximum($m['highest_checkout'],$v['applied_score'],$game,$v['id']); if ($v['applied_score']>=100) { $m['checkout_100']++; } }
    }
    // First nine: use whole aggregates only up to a known boundary; use real fields for a split.
    foreach ($legs as $list) {
        $m['first9_eligible']++; $used=0; $points=0; $known=true;
        foreach ($list as $v) {
            if ($used>=9) { break; } $take=min(9-$used,$v['darts_used']);
            if ($take===$v['darts_used']) { $points+=$v['applied_score']; }
            elseif ($v['mode']==='darts' && count($byVisit[$v['id']] ?? [])===$v['darts_used']) {
                if (!$v['is_bust']) { $ctx=$s['visit_contexts'][$v['id']]; $fields=array_column(array_slice($byVisit[$v['id']],0,$take),'field'); $values=evaluateDarts($g['config'],$ctx['remaining'],$ctx['opened'],$fields); $points+=$values[1]; }
            } else { $known=false; }
            $used+=$take;
        }
        if ($known && $used===9) { $m['first9_known']++; $m['first9_darts']+=9; $m['first9_points']+=$points; }
    }
    foreach ($s['leg_results'] as $l) {
        if ($onlyLegs!==null && !in_array($l['leg_no'],$onlyLegs,true)) { continue; }
        $won=$l['winner_id']===$pid; $m[$won?'won_legs':'lost_legs']++;
        if (in_array($l['phase'],['decider','sudden_death'],true)) { $m[$won?'decider_wins':'decider_losses']++; }
        if (!$won) { continue; }
        $m[$l['kind']==='hold'?'holds':($l['kind']==='break'?'breaks':'unknown_starters')]++; $m['leg_darts']+=$l['darts'];
        $m['leg_lengths'][$l['darts']]=($m['leg_lengths'][$l['darts']] ?? 0)+1;
        if ($m['best_leg']===null || $l['darts']<$m['best_leg']['value']) { $m['best_leg']=['value'=>$l['darts'],'game_id'=>$game,'record_id'=>$l['leg_no']]; }
    }
    foreach ($s['darts'] as $d) {
        if ($d['player_id']!==$pid || ($onlyLegs!==null && !in_array($d['leg_no'],$onlyLegs,true))) { continue; }
        $m['sectors'][$d['field']]=($m['sectors'][$d['field']] ?? 0)+1;
        if ($d['checkout_attempt']===1 && $d['target']!==null && fieldQualifies($d['target'],'double')) {
            $target=$d['target']; if (!isset($m['doubles'][$target])) { $m['doubles'][$target]=['attempts'=>0,'hits'=>0,'checkouts'=>0]; }
            $m['doubles'][$target]['attempts']++; if ($d['field']===$target) { $m['doubles'][$target]['hits']++; }
            $v=$visitIndex[$d['visit_id']]; if ($v['is_checkout'] && $v['darts_used']===$d['dart_no']) { $m['doubles'][$target]['checkouts']++; }
        }
    }
}

function finishMetrics(array $m): array
{
    $m['average1']=$m['darts']>0?$m['points']/$m['darts']:null; $m['average3']=$m['average1']===null?null:3*$m['average1'];
    $m['first9']=$m['first9_darts']>0?3*$m['first9_points']/$m['first9_darts']:null;
    $m['checkout_attempt_pct']=$m['attempts']>0?100*$m['attempt_wins']/$m['attempts']:null;
    $m['checkout_visit_pct']=$m['opportunities']>0?100*$m['opportunity_wins']/$m['opportunities']:null;
    $m['average_won_leg']=$m['won_legs']>0?$m['leg_darts']/$m['won_legs']:null;
    ksort($m['timeline']); foreach ($m['timeline'] as &$t) { $t['average3']=$t['darts']>0?3*$t['points']/$t['darts']:null; } unset($t); ksort($m['leg_lengths']); ksort($m['sectors']);
    return $m;
}

function analysisPackage(PDO $pdo, array $f): array
{
    $rows=filteredGames($pdo,$f); [$visits,$darts,$corrections,$withdrawn,$equipment]=analysisSources($pdo,$rows);
    $profiles=[]; $canonical=[];
    foreach (sqlRows($pdo,'SELECT * FROM players ORDER BY id') as $p) { $id=(int)$p['id']; $canonical[$id]=canonicalPlayer($pdo,$id); $profiles[$id]=normalizePlayer($p); }
    $metrics=[]; $groups=[]; $matches=[]; $legWindows=[];
    foreach ($rows as $r) {
        $id=(int)$r['id']; $s=analyzeMatch($r,$visits[$id] ?? [],$darts[$id] ?? [],$corrections[$id] ?? 0,$withdrawn[$id] ?? 0); $s['equipment']=$equipment[$id] ?? []; $matches[]=$s;
        $c=$s['game']['config']; $key=formatDescription($c); $groups[$key]=($groups[$key] ?? 0)+1;
        foreach ($s['players'] as $p) {
            $root=$canonical[$p['id']]; if ($f['player_id']!=='' && $root!==$canonical[(int)$f['player_id']]) { continue; }
            if (!isset($metrics[$root])) { $metrics[$root]=newMetrics(); $legWindows[$root]=[10=>newMetrics(),50=>newMetrics(),100=>newMetrics()]; }
            accumulateMetrics($metrics[$root],$s,[$p['id']]);
            if ($s['included_scoring']) {
                $legs=array_reverse(array_column($s['leg_results'],'leg_no'));
                foreach ([10,50,100] as $n) { $used=$legWindows[$root][$n]['won_legs']+$legWindows[$root][$n]['lost_legs']; $chosen=array_slice($legs,0,max(0,$n-$used)); if ($chosen!==[]) { accumulateMetrics($legWindows[$root][$n],$s,[$p['id']],$chosen); } }
            }
        }
    }
    $out=[]; foreach ($metrics as $id=>$m) { $out[]=['player'=>$profiles[$id],'metrics'=>finishMetrics($m),'last_legs'=>array_map('finishMetrics',$legWindows[$id])]; }
    return ['schema_version'=>6,'metrics_version'=>METRICS_VERSION,'generated_at'=>gmdate('Y-m-d\TH:i:s\Z'),'timezone'=>'Europe/Warsaw','filters'=>$f,
        'policy'=>'Zakończone obejmują wyniki oczekujące i zatwierdzone. Administracyjne osobno; walkower/przerwanie/anulowanie poza punktowaniem. Średnie ważone faktycznymi lotkami.',
        'rule_groups'=>$groups,'mixed_rules'=>count($groups)>1,'sample_games'=>count($rows),'players'=>$out,'matches'=>$matches,
        'aliases'=>array_filter($canonical,static fn(int $root,int $id):bool=>$root!==$id,ARRAY_FILTER_USE_BOTH)];
}

function historyPage(PDO $pdo, array $q): array
{
    $f=analysisFilters($q); $hash=hash('sha256',canonicalJson($f)); $cursor=['ceiling'=>(int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM games')->fetchColumn()];
    if (!empty($q['cursor'])) {
        $cursor=json_decode(base64_decode((string)$q['cursor'],true) ?: '',true);
        if (!is_array($cursor) || ($cursor['filters'] ?? '')!==$hash || !is_int($cursor['ceiling'] ?? null) || !is_int($cursor['id'] ?? null) || !is_string($cursor['date'] ?? null)) { problem(422,'invalid-cursor','Zmień filtry lub rozpocznij od pierwszej strony.'); }
    }
    $limit=isset($q['limit'])?requiredInt($q,'limit',1,100):20; $rows=filteredGames($pdo,$f,$cursor,$limit+1); $more=count($rows)>$limit; $rows=array_slice($rows,0,$limit);
    [$visits]=analysisSources($pdo,$rows); $items=[];
    foreach ($rows as $r) { $items[]=snapshotSummary(replayGame($r,$visits[$r['id']] ?? [])); }
    $next=null; if ($more) { $last=end($rows); $next=base64_encode(canonicalJson(['ceiling'=>$cursor['ceiling'],'id'=>(int)$last['id'],'date'=>$last['created_at'],'filters'=>$hash])); }
    return ['items'=>$items,'next_cursor'=>$next,'filters'=>$f,'sort'=>'created_at DESC,id DESC','ceiling'=>$cursor['ceiling']];
}

function csvSafe($value): string
{
    if ($value===null) { return ''; } if (is_bool($value)) { return $value?'1':'0'; }
    $text=(string)$value;
    if (is_string($value) && preg_match('/^[\s\x{FEFF}]*[=+\-@]/u',$text)) { return "'".$text; }
    return $text;
}

function exportAnalysis(array $package, array $q): void
{
    $format=$q['format'] ?? 'json'; $dataset=$q['dataset'] ?? 'summary';
    if (!in_array($format,['json','csv'],true) || !in_array($dataset,['summary','visits','darts'],true)) { problem(422,'invalid-export','Wybierz JSON lub CSV: summary/visits/darts.'); }
    header('Content-Disposition: attachment; filename="dart-lens-'.$dataset.'.'.$format.'"');
    if ($format==='json') { header('Content-Type: application/json; charset=utf-8'); echo json_encode($package,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); exit; }
    header('Content-Type: text/csv; charset=utf-8'); $fp=fopen('php://output','wb'); fwrite($fp,"\xEF\xBB\xBF");
    $write=static function(array $r) use ($fp):void { fputcsv($fp,array_map('csvSafe',$r),';','"',''); };
    $write(['schema_version',6,'metrics_version',METRICS_VERSION,'generated_at',$package['generated_at'],'timezone','Europe/Warsaw']);
    $write(['filters',canonicalJson($package['filters'])]); $write(['policy',$package['policy']]); $write(['rule_groups',canonicalJson($package['rule_groups'])]); $write(['aliases',canonicalJson($package['aliases'])]);
    if ($dataset==='summary') {
        $write(['player_id','name','games','scoring_games','points','darts','average3','first9','first9_known','first9_eligible','checkout_attempt_pct','attempts','known_opportunities','opportunities','checkout_visit_pct','wins','losses','draws','administrative','field_visits','visits']);
        foreach ($package['players'] as $p) { $m=$p['metrics']; $write([$p['player']['id'],$p['player']['name'],$m['games'],$m['scoring_games'],$m['points'],$m['darts'],$m['average3'],$m['first9'],$m['first9_known'],$m['first9_eligible'],$m['checkout_attempt_pct'],$m['attempts'],$m['known_opportunities'],$m['opportunities'],$m['checkout_visit_pct'],$m['wins'],$m['losses'],$m['draws'],canonicalJson($m['administrative']),$m['field_visits'],$m['visits']]); }
    } else {
        $keys=$dataset==='visits'?['id','leg_no','visit_no','player_id','declared_score','applied_score','darts_used','is_bust','is_checkout','is_complete','mode','recording_level','checkout_attempts','source','created_at']:['id','leg_no','visit_no','visit_id','player_id','dart_no','field','source','target','checkout_attempt','created_at'];
        $write(array_merge(['game_id','configuration','status','confirmed_at','context_kind','venue','equipment'], $keys));
        foreach ($package['matches'] as $s) { foreach ($s[$dataset] as $row) { $write(array_merge([$s['game']['id'],canonicalJson($s['game']['config']),$s['game']['operation_state'],$s['game']['confirmed_at'],$s['game']['context_kind'],$s['game']['venue'],canonicalJson($s['equipment'] ?? [])],array_map(static fn(string $key)=>$row[$key] ?? null,$keys))); } }
    }
    fclose($fp); exit;
}

function handleAnalysisRead(PDO $pdo, string $action, array $q): void
{
    if ($action==='profiles') {
        $query=optionalText($q,'q',200) ?? ''; $state=$q['state'] ?? 'all'; if (!in_array($state,['all','active','archived','guest'],true)) { problem(422,'invalid-filter','Stan profilu jest nieprawidłowy.'); }
        $rows=sqlRows($pdo,'SELECT * FROM players WHERE name LIKE ? OR nickname LIKE ? OR club LIKE ? ORDER BY name COLLATE NOCASE,id',['%'.$query.'%','%'.$query.'%','%'.$query.'%']);
        $rows=array_values(array_filter($rows,static fn(array $p):bool=>$state==='all' || ($state==='active' && !$p['archived'] && $p['merged_into']===null) || ($state==='archived' && $p['archived']) || ($state==='guest' && $p['is_guest'])));
        sendData(['players'=>array_map('normalizePlayer',$rows)]);
    }
    if ($action==='profile') {
        $id=requiredInt($q,'id',1,PHP_INT_MAX); $ids=profileIds($pdo,$id); $ph=implode(',',array_fill(0,count($ids),'?'));
        sendData(['player'=>normalizePlayer(profileRow($pdo,$id)),'canonical_id'=>canonicalPlayer($pdo,$id),'alias_ids'=>$ids,'merges'=>sqlRows($pdo,"SELECT * FROM profile_merges WHERE source_id IN ($ph) OR target_id IN ($ph) ORDER BY id",array_merge($ids,$ids)),'equipment'=>sqlRows($pdo,"SELECT * FROM equipment WHERE player_id IN ($ph) ORDER BY id",$ids)]);
    }
    if ($action==='history-search') { sendData(historyPage($pdo,$q)); }
    if ($action==='match-analysis' || (isset($q['game_id']) && $action==='analysis-export')) {
        $id=requiredInt($q,'game_id',1,PHP_INT_MAX); $row=fetchGameRow($pdo,$id); [$v,$d,$c,$w,$equipment]=analysisSources($pdo,[$row]); $s=analyzeMatch($row,$v[$id] ?? [],$d[$id] ?? [],$c[$id] ?? 0,$w[$id] ?? 0); $s['equipment']=$equipment[$id] ?? [];
        $players=[]; foreach ($s['players'] as $p) { $m=newMetrics(); accumulateMetrics($m,$s,[$p['id']]); $players[]=['player'=>['id'=>$p['id'],'name'=>$p['name']],'metrics'=>finishMetrics($m)]; }
        $package=['schema_version'=>6,'metrics_version'=>1,'generated_at'=>gmdate('Y-m-d\TH:i:s\Z'),'timezone'=>'Europe/Warsaw','filters'=>['game_id'=>$id],'policy'=>'Faktyczny przebieg; decyzja administracyjna może wyłączyć punktowanie.','rule_groups'=>[formatDescription($s['game']['config'])=>1],'aliases'=>[], 'sample_games'=>1,'players'=>$players,'matches'=>[$s],'mixed_rules'=>false];
        if ($action==='analysis-export') { exportAnalysis($package,$q); } sendData($package);
    }
    $f=analysisFilters($q); $package=analysisPackage($pdo,$f);
    if ($action==='analysis-export') { exportAnalysis($package,$q); }
    unset($package['matches']); sendData($package);
}
