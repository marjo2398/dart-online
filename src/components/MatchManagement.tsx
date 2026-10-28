import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AdministrativeDecision, GameSnapshot, MatchConfig } from '../types';

export const phaseNames = { playing: 'Gra', paused: 'Pauza', awaiting_starter: 'Oczekiwanie na rozstrzygnięcie bull-off', resolved: 'Zakończony — oczekuje na zatwierdzenie', confirmed: 'Wynik zatwierdzony i zablokowany' };
export const decisionNames = { surrender: 'Poddanie', walkover: 'Walkower', interrupted: 'Przerwanie bez rozstrzygnięcia', cancelled: 'Anulowanie z zachowaniem historii' };
export function actorLabel(raw?: string): string {
  try {
    const c = JSON.parse(raw ?? '{}');
    if (c.role === 'admin') return `Administrator (wspólny PIN)${c.session_hash ? ` · sesja ${String(c.session_hash).slice(0,10)}` : ''}`;
    if (c.device_id) return `${c.declared_name || c.device_id} · rola ${c.role}`;
  } catch { /* Historical metadata may be absent. */ }
  return 'Starszy zapis bez metadanych sesji';
}

export default function MatchManagement({ snapshot, disabled, run, onRematch }: { snapshot: GameSnapshot; disabled: boolean; run: (operation: () => Promise<GameSnapshot>) => Promise<void>; onRematch: (s: GameSnapshot) => void }) {
  const [action, setAction] = useState<'game-adjudicate' | 'result-confirm' | 'result-reopen' | ''>('');
  const [reason, setReason] = useState(''); const [kind, setKind] = useState<AdministrativeDecision['kind']>('surrender');
  const [winner, setWinner] = useState(snapshot.players[1].id); const [award, setAward] = useState(false); const [a1, setA1] = useState(0); const [a2, setA2] = useState(1);
  const [swap, setSwap] = useState(false); const [method, setMethod] = useState<MatchConfig['starters']['method']>('fixed'); const [starter, setStarter] = useState(1); const [bullKnown, setBullKnown] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (action) reasonRef.current?.focus(); }, [action]);
  useEffect(() => { setAction(''); }, [snapshot.game.revision]);
  const g = snapshot.game; const permits = (p: GameSnapshot['permissions'][number]) => snapshot.permissions.includes(p);
  return <section className="panel match-management"><h2>Prowadzenie i wynik</h2><p role="status"><strong>{phaseNames[g.operation_state]}</strong></p>
    {g.decision && <div className="format-summary"><strong>{decisionNames[g.decision.kind]}</strong><p>{g.decision.reason}</p><p>Przyznany zwycięzca: {snapshot.players.find(p => p.id === g.decision!.winner_id)?.name ?? 'brak'}. {g.decision.award && `Przyznany wynik: ${g.decision.award.player1}:${g.decision.award.player2} (${g.decision.award.unit === 'sets' ? 'sety' : 'legi'}).`}</p><p>Faktyczne legi, sety i lotki pokazane są osobno na tablicy.</p></div>}
    {!g.stats_eligible && <p className="sync-warning">Ta decyzja wyłącza mecz ze statystyk globalnych. Zachowano rzeczywisty przebieg.</p>}
    <div className="secondary-controls">
      {g.status === 'active' && permits('pause') && <button type="button" className="button button-secondary" disabled={disabled} onClick={() => run(() => api.matchOperation(g.is_paused ? 'game-resume' : 'game-pause',g.id,g.revision))}>{g.is_paused ? 'Wznów grę' : 'Pauza'}</button>}
      {g.confirmed_at === null && g.decision === null && permits('adjudicate') && <button type="button" className="button button-secondary" disabled={disabled} onClick={() => { setAction('game-adjudicate'); setReason(''); }}>Wyjątkowe zakończenie</button>}
      {g.operation_state === 'resolved' && permits('confirm') && <button type="button" className="button button-primary" disabled={disabled} onClick={() => { setAction('result-confirm'); setReason('Sprawdzono przebieg i wynik.'); }}>Zatwierdź ostateczny wynik</button>}
      {g.status === 'finished' && permits('reopen') && <button type="button" className="button button-secondary" disabled={disabled} onClick={() => { setAction('result-reopen'); setReason(''); }}>Ponownie otwórz wynik</button>}
    </div>
    {g.is_paused && <p>Pauza blokuje rzuty i akceptację odczytów. Uprawniony operator może poprawić historię; zarządzanie kamerą/dostępem i decyzje administracyjne pozostają dostępne. Wznowienie wymaga nowego kontekstu kamery.</p>}
    {action && <form className="correction-form" onSubmit={e => { e.preventDefault(); if (!disabled) run(() => api.matchOperation(action,g.id,g.revision,{ reason, ...(action === 'game-adjudicate' ? { kind, ...(['surrender','walkover'].includes(kind) ? { winner_id: winner, ...(award ? { award: { player1: a1, player2: a2 } } : {}) } : {}) } : {}) })); }} onKeyDown={e => { if (e.key === 'Escape' && !e.repeat) { e.preventDefault(); setAction(''); } if (e.key === 'Enter' && e.repeat) e.preventDefault(); }}>
      <fieldset disabled={disabled}>
        <h3>{action === 'game-adjudicate' ? 'Decyzja administracyjna' : action === 'result-confirm' ? 'Potwierdzenie ostatecznego wyniku' : 'Ponowne otwarcie z uzasadnieniem'}</h3>
        {action === 'game-adjudicate' && <><label>Rodzaj decyzji<select value={kind} onChange={e => setKind(e.target.value as AdministrativeDecision['kind'])}>{Object.entries(decisionNames).map(([k,label]) => <option key={k} value={k}>{label}</option>)}</select></label>
          {['surrender','walkover'].includes(kind) && <><label>Przyznaj zwycięstwo<select value={winner} onChange={e => setWinner(Number(e.target.value))}>{snapshot.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><input type="checkbox" checked={award} onChange={e => setAward(e.target.checked)} /> Zapisz odrębny przyznany wynik ({g.config.match.unit === 'sets' ? 'sety' : 'legi'})</label>
            {award && <div className="form-grid"><label>{snapshot.players[0].name}<input type="number" min={0} max={99} value={a1} onChange={e => setA1(Number(e.target.value))} /></label><label>{snapshot.players[1].name}<input type="number" min={0} max={99} value={a2} onChange={e => setA2(Number(e.target.value))} /></label></div>}</>}
          <p>Nie powstaną fikcyjne wizyty ani legi. Walkower, przerwanie i anulowanie wyłączają statystyki globalne; poddanie liczy wyłącznie faktyczną grę, a zwycięstwo do bilansu dopiero jeśli były rzuty.</p></>}
        <label>Uzasadnienie<input ref={reasonRef} value={reason} maxLength={400} required onChange={e => setReason(e.target.value)} /></label>
        <p>{action === 'result-confirm' ? 'Po zatwierdzeniu zwykłe korekty i cofanie zostaną zablokowane.' : action === 'result-reopen' ? 'Bieżące zatwierdzenie i ewentualna decyzja administracyjna zostaną wycofane ze śladem w historii. Rzeczywisty przebieg pozostanie.' : 'Decyzja zostanie zapisana osobno od rzeczywistego przebiegu i będzie wymagać zatwierdzenia.'}</p>
        <div className="secondary-controls"><button type="submit" className="button button-primary" disabled={!reason.trim()}>Potwierdź tę decyzję</button><button type="button" className="button button-secondary" onClick={() => setAction('')}>Anuluj</button></div>
      </fieldset>
    </form>}
    <details><summary>Rewanż — osobny mecz</summary><fieldset disabled={disabled}>
      <label><input type="checkbox" checked={swap} onChange={e => { setSwap(e.target.checked); setBullKnown(false); }} /> Zamień strony zawodników</label>
      <label>Początek rewanżu<select value={method} onChange={e => { setMethod(e.target.value as MatchConfig['starters']['method']); setBullKnown(false); }}><option value="fixed">Wskaż zawodnika</option><option value="random">Losowanie serwera</option><option value="bull_off">Wynik rzeczywistego bull-off</option></select></label>
      {method !== 'random' && <label>{method === 'bull_off' ? 'Zwycięzca bull-off' : 'Rozpoczynający'}<select value={method === 'bull_off' && !bullKnown ? '' : starter} onChange={e => { setStarter(Number(e.target.value)); setBullKnown(true); }}><option value="" disabled>Wskaż wynik przy tarczy</option>{(swap ? [...snapshot.players].reverse() : snapshot.players).map((p,i) => <option key={p.id} value={i+1}>{p.name}</option>)}</select></label>}
      <p>Kopia zasad: {g.format_description}. Bieżący mecz i historia pozostaną zapisane.</p>
      <button type="button" className="button button-primary" disabled={!permits('score') || (method === 'bull_off' && !bullKnown)} onClick={() => run(async () => { const next = await api.rematch(g.id,g.revision,swap,method,starter); onRematch(next); return snapshot; })}>Utwórz rewanż</button>
    </fieldset></details>
    <details><summary>Historia decyzji i zatwierdzeń</summary><ul>{snapshot.result_decisions.map(d => <li key={d.id}>{d.created_at} · {d.action}: {d.reason}<small> · {actorLabel(d.actor_context)}</small></li>)}</ul><p>Wspólny PIN identyfikuje sesję administratora, nie osobę. Nazwa urządzenia jest deklaracją, a nie potwierdzoną tożsamością.</p></details>
  </section>;
}
