import { useEffect, useState, type RefObject } from 'react';
import { api, messageFrom } from '../api';
import type { CheckoutHints, GameSnapshot } from '../types';

export default function ScoreEntry({ value, onChange, mode, onMode, disabled, remaining, onSubmit, onZero, inputRef }: {
  value: string; onChange: (v: string) => void; mode: 'score' | 'remaining'; onMode: (m: 'score' | 'remaining') => void;
  disabled: boolean; remaining: number; onSubmit: () => void; onZero: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const preview = value === '' ? null : mode === 'score' ? remaining - Number(value) : Number(value);
  return <form className="score-entry" onSubmit={e => { e.preventDefault(); if (!disabled && value !== '') onSubmit(); }} onKeyDown={e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter' && e.repeat) e.preventDefault();
    if (e.key === 'Escape' && !e.repeat) { e.preventDefault(); onChange(''); }
  }}>
    <label>Sposób wpisywania<select disabled={disabled} value={mode} onChange={e => { onMode(e.target.value as 'score' | 'remaining'); onChange(''); }}><option value="score">Suma wizyty</option><option value="remaining">Pozostało po wizycie</option></select></label>
    <div className="score-form"><label className="sr-only" htmlFor="visit-score">{mode === 'score' ? 'Wynik wizyty' : 'Pozostało po wizycie'}</label>
      <input ref={inputRef} id="visit-score" inputMode="numeric" type="text" pattern="[0-9]+" maxLength={5} autoComplete="off" value={value} onChange={e => { if (/^\d*$/.test(e.target.value)) onChange(e.target.value); }} disabled={disabled} placeholder={mode === 'score' ? '0–180' : String(remaining)} />
      <button type="submit" className="button button-primary" disabled={disabled || value === ''}>Zapisz</button>
    </div>
    <p aria-live="polite">Wpisano: <strong>{value || '—'}</strong> · przewidywane pozostało: <strong>{preview ?? '—'}</strong>. Serwer sprawdzi zapis; bust cofa wizytę.</p>
    <div className="numeric-pad">{['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(key => <button key={key} type="button" className="button button-secondary" disabled={disabled} onClick={() => onChange(key === 'C' ? '' : key === '⌫' ? value.slice(0,-1) : (value + key).slice(0,5))}>{key}</button>)}</div>
    {mode === 'score' && <div className="popular-scores">{[26,41,45,60,81,85,100,140,180].map(n => <button className="button button-secondary" type="button" key={n} disabled={disabled} onClick={() => onChange(String(n))}>{n}</button>)}<button type="button" className="button button-secondary" disabled={disabled} onClick={onZero}>0 — pełna wizyta</button></div>}
    <small>Enter zapisuje, Backspace usuwa cyfrę, Escape czyści pole. Klawiatura działa w tym formularzu; skróty przeglądarki pozostają dostępne. Bust w trybie „Pozostało” wpisz jako faktyczną sumę albo pola lotek.</small>
  </form>;
}

export function CheckoutPanel({ snapshot, enabled, setEnabled }: { snapshot: GameSnapshot; enabled: boolean; setEnabled: (v: boolean) => void }) {
  const [preferred, setPreferred] = useState(''); const [hints, setHints] = useState<CheckoutHints | null>(null); const [error, setError] = useState('');
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
