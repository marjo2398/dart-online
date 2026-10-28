import { useEffect, useState } from 'react';
import { api, messageFrom } from '../api';
import type { CorrectionPreview, GameSnapshot, HistoryChange } from '../types';
import { FieldSelect } from './DartControls';
import { phaseNames } from './MatchManagement';

export default function HistoryCorrection({ snapshot, disabled, run }: { snapshot: GameSnapshot; disabled: boolean; run: (operation: () => Promise<GameSnapshot>) => Promise<void> }) {
  const [target, setTarget] = useState(''); const [field, setField] = useState('MISS');
  const [score, setScore] = useState('0'); const [used, setUsed] = useState(3); const [double, setDouble] = useState(false);
  const [reason, setReason] = useState(''); const [withdraw, setWithdraw] = useState(false);
  const [preview, setPreview] = useState<{ value: CorrectionPreview; change: HistoryChange; revision: number } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const locked = disabled || busy || snapshot.game.confirmed_at !== null || snapshot.game.decision !== null || !snapshot.permissions.includes('history');
  useEffect(() => { if (preview && preview.revision !== snapshot.game.revision) { setPreview(null); setError('Mecz zmienił się. Podgląd unieważniony — przygotuj go ponownie.'); } }, [snapshot.game.revision, preview]);
  const choices = snapshot.visits.flatMap(v => v.mode === 'aggregate' ? [{ key: `visit:${v.id}`, label: `Wizyta ${v.visit_no}, leg ${v.leg_no} · ${snapshot.players.find(p => p.id === v.player_id)?.name}: suma ${v.declared_score}, ${v.darts_used} lotki`, visit: v, dart: null }] : snapshot.darts.filter(d => d.visit_id === v.id).map(d => ({ key: `dart:${d.id}`, label: `Wizyta ${v.visit_no}, leg ${v.leg_no} · ${snapshot.players.find(p => p.id === v.player_id)?.name}: lotka ${d.dart_no}, ${d.field}`, visit: v, dart: d })));
  const selected = choices.find(c => c.key === target);
  const choose = (key: string) => {
    const c = choices.find(c => c.key === key); setTarget(key); setPreview(null); setWithdraw(false); setError('');
    setField(c?.dart?.field ?? 'MISS'); setScore(String(c?.visit.declared_score ?? 0)); setUsed(c?.visit.darts_used ?? 3); setDouble(c?.visit.double_confirmed ?? false);
  };
  return <section className="panel history-correction"><h2>Korekta wcześniejszego zapisu</h2>
    {!snapshot.permissions.includes('history') && <p>Wymaga jawnego uprawnienia korekty historii.</p>}
    <fieldset disabled={locked} onKeyDown={e => { if (e.key === 'Escape' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) { setPreview(null); setTarget(''); } }}>
      <button type="button" className="button button-secondary" disabled={choices.length === 0} onClick={() => choose(choices.at(-1)?.key ?? '')}>Popraw ostatni zapis — podgląd</button>
      <label>Wybierz rzeczywisty zapis<select value={target} onChange={e => choose(e.target.value)}><option value="">Wybierz wizytę lub lotkę</option>{choices.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      {selected && <>
        <p>Oryginał: {selected.label}. Przypisanie gracza, lega i identyfikatora pozostaje zachowane.</p>
        {selected.dart ? <FieldSelect label="Proponowane rzeczywiste pole" value={field} onChange={v => { setField(v); setPreview(null); }} disabled={locked} /> : <div className="form-grid">
          <label>Proponowana suma<input type="number" min={0} max={180} value={score} onChange={e => { setScore(e.target.value); setPreview(null); }} /></label>
          <label>Faktyczna liczba lotek<select value={used} onChange={e => { setUsed(Number(e.target.value)); setPreview(null); }}>{[1,2,3].map(n => <option key={n}>{n}</option>)}</select></label>
          <label><input type="checkbox" checked={double} onChange={e => { setDouble(e.target.checked); setPreview(null); }} /> Potwierdzone zakończenie na double</label>
        </div>}
        <label>Uzasadnienie korekty<input maxLength={400} value={reason} onChange={e => { setReason(e.target.value); setPreview(null); }} /></label>
        <label><input type="checkbox" checked={withdraw} onChange={e => { setWithdraw(e.target.checked); setPreview(null); }} /> W razie konfliktu jawnie wycofaj zależny fragment od pierwszego nielegalnego zapisu. Zachowaj go w historii.</label>
        <button type="button" className="button button-secondary" disabled={!reason.trim() || (!selected.dart && !/^\d{1,3}$/.test(score))} onClick={async () => {
          const change: HistoryChange = { kind: selected.dart ? 'dart' : 'visit', ...(selected.dart ? { dart_id: selected.dart.id, field } : { visit_id: selected.visit.id, score: Number(score), darts_used: used, double_confirmed: double }), reason, withdraw_dependent: withdraw };
          const revision = snapshot.game.revision; setBusy(true); setError('');
          try { setPreview({ value: await api.historyPreview(snapshot.game.id, change, revision), change, revision }); } catch (e) { setError(messageFrom(e)); } finally { setBusy(false); }
        }}>Podgląd korekty — bez zapisu</button>
      </>}
      {preview && <div className="format-summary" role="status"><h3>Przewidywany wpływ</h3>
        {preview.value.proposed.players.map(p => <p key={p.id}>{p.name}: pozostało {p.remaining}, legi {p.legs}, sety {p.sets}.</p>)}
        <p>Leg {preview.value.proposed.game.current_leg}, set {preview.value.proposed.game.current_set}, faza: {phaseNames[preview.value.proposed.game.operation_state]}. Wynik pozostaje niezatwierdzony.</p>
        <ul>{preview.value.conflicts.map((c,i) => <li key={i}>{c.message}</li>)}</ul>
        <p>Do wycofania: {preview.value.withdrawn_visits} wizyt, {preview.value.withdrawn_darts} rzeczywistych lotek.</p>
        {!preview.value.can_apply && <p className="sync-warning">Anuluj korektę lub wybierz jawne wycofanie fragmentu i przygotuj nowy podgląd.</p>}
        <div className="secondary-controls"><button type="button" className="button button-primary" disabled={!preview.value.can_apply || preview.revision !== snapshot.game.revision} onClick={() => run(async () => { const next = await api.historyApply(snapshot.game.id, preview.change, preview.value.preview_token, preview.revision); setPreview(null); setError(''); return next; })}>Zastosuj pokazaną korektę</button><button type="button" className="button button-secondary" onClick={() => setPreview(null)}>Anuluj podgląd</button></div>
      </div>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <details><summary>Wycofane zapisy i poprzednie wersje</summary>
      <p>{snapshot.withdrawn_visits.length} wycofanych wizyt, {snapshot.withdrawn_darts.length} wycofanych lotek. Nie zaliczają się ponownie do wyniku ani średniej.</p>
      <ul>{snapshot.withdrawn_visits.map(v => <li key={v.id}>Wizyta {v.visit_no}, leg {v.leg_no}, gracz #{v.player_id}: {v.declared_score} ({v.darts_used} lotki)</li>)}</ul>
      <ul>{snapshot.withdrawn_darts.map(d => <li key={d.id}>Leg {d.leg_no}, wizyta {d.visit_no}, lotka {d.dart_no}: {d.field}</li>)}</ul>
      <ul>{snapshot.record_versions.map(v => <li key={v.id}>{v.created_at} · {v.record_type} {v.record_id} · {v.reason}<details><summary>Oryginalne dane zapisu</summary><pre>{v.original}</pre></details></li>)}</ul>
    </details>
  </section>;
}
