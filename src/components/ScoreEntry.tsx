import { useEffect, useState, type RefObject } from 'react';
import { api, messageFrom } from '../api';
import type { CheckoutHints, GameSnapshot } from '../types';

export default function ScoreEntry({ value, onChange, mode, disabled, remaining, onSubmit, inputRef }: {
  value: string; onChange: (v: string) => void; mode: 'score' | 'remaining';
  disabled: boolean; remaining: number; onSubmit: () => void; inputRef: RefObject<HTMLInputElement | null>;
}) {
  const preview = value === '' ? null : mode === 'score' ? remaining - Number(value) : Number(value);
  const digit = (key: string) => onChange((value === '0' ? key : value+key).slice(0,5));
  return <form className="score-entry" onSubmit={e => { e.preventDefault(); if (!disabled && value !== '') onSubmit(); }} onKeyDown={e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat && !disabled && value !== '') onSubmit(); }
    if (disabled || e.repeat) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); digit(e.key); }
    if (e.key === 'Backspace') { e.preventDefault(); onChange(value.slice(0,-1)); }
    if (e.key === 'Escape') { e.preventDefault(); onChange(''); }
  }}>
    <div className="score-form"><label className="sr-only" htmlFor="visit-score">{mode === 'score' ? 'Wynik wizyty' : 'Pozostało po wizycie'}</label>
      <input ref={inputRef} id="visit-score" inputMode="none" type="text" readOnly autoComplete="off" value={value} disabled={disabled} placeholder={mode === 'score' ? '0–180' : String(remaining)} aria-describedby="score-preview" />
      <button type="button" className="button button-secondary" disabled={disabled || value === ''} aria-label="Usuń ostatnią cyfrę" onClick={() => onChange(value.slice(0,-1))}>⌫</button>
    </div>
    <p id="score-preview" aria-live="polite" className="score-preview">{mode === 'score' ? 'Zdobyte w wizycie' : 'Pozostało po wizycie'} · podgląd pozostało: <strong>{preview ?? '—'}</strong></p>
    {mode === 'score' && <div className="popular-scores" aria-label="Popularne wyniki">{[26,41,60,100,140,180,45,81,85].map(n => <button className="button button-secondary" type="button" key={n} disabled={disabled} onClick={() => onChange(String(n))}>{n}</button>)}</div>}
    <div className="numeric-pad">{['1','2','3','4','5','6','7','8','9','CLR','0'].map(key => <button key={key} type="button" className="button button-secondary" aria-label={key==='CLR'?'Wyczyść wpis':key} disabled={disabled} onClick={() => key==='CLR'?onChange(''):digit(key)}>{key}</button>)}<button type="submit" className="button button-primary" disabled={disabled || value === ''} aria-label="Zatwierdź wynik">OK</button></div>
    <small className="keyboard-hint">Enter = OK · Backspace = usuń cyfrę · Escape = CLR. Zapis dopiero po zatwierdzeniu.</small>
  </form>;
}

export function CheckoutPanel({ snapshot, enabled, setEnabled }: { snapshot: GameSnapshot; enabled: boolean; setEnabled: (v: boolean) => void }) {
  const [preferred, setPreferred] = useState('');
  useEffect(()=>{setPreferred(snapshot.profile_preferences?.[snapshot.game.current_player_id??0]?.preferred_double??'');},[snapshot.game.current_player_id]); const [hints, setHints] = useState<CheckoutHints | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setHints(null); setError('');
    if (enabled && snapshot.game.operation_state === 'playing') api.hints(snapshot.game.id, preferred).then(h => { if (active && h.revision === snapshot.game.revision) setHints(h); }).catch(e => { if (active) setError(messageFrom(e)); });
    return () => { active = false; };
  }, [snapshot.game.id, snapshot.game.revision, preferred, enabled]);
  return <section className="panel checkout-panel"><label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Podpowiedzi zejść i komunikaty głosowe zdradzające drogę</label>
    {enabled && <><label>Preferowany double<select value={preferred} onChange={e => setPreferred(e.target.value)}><option value="">Bez preferencji</option>{Array.from({ length: 20 }, (_,i) => `D${i+1}`).concat('50').map(f => <option key={f} value={f}>{f}</option>)}</select></label>
      {snapshot.game.operation_state !== 'playing' && <p>Podpowiedzi są wstrzymane poza aktywną turą.</p>}
      {hints && snapshot.game.operation_state === 'playing' && <><p>Pozostało: {hints.remaining ?? '—'} · {snapshot.partial_visit ? `pozostało lotek według zapisanych pól: ${hints.darts_left}` : `budżet nowej wizyty: do ${hints.darts_left} lotek (brak zapisanych pól)`}. {hints.message}</p><ul>{hints.routes.map(r => <li key={r.join(',')}>Sugerowane cele: <strong>{r.join(' → ')}</strong></li>)}</ul></>}
      {error && <p role="alert">{error}</p>}<p className="muted">Sugestia nie oznacza zamiaru zawodnika ani trafienia. Faktyczne pola zapisuj osobno.</p></>}
  </section>;
}
