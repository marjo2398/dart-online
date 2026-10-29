import { useEffect, useState } from 'react';
import { api } from '../api';
import type { GameSnapshot, Observation, ScoringDetail } from '../types';
import { actorLabel } from './MatchManagement';

export const fields = ['MISS', '25', '50', ...['S', 'D', 'T'].flatMap(prefix => Array.from({ length: 20 }, (_, i) => prefix + (i + 1)))];
export function FieldSelect({ value, onChange, disabled, label }: { value: string; onChange: (value: string) => void; disabled: boolean; label: string }) {
  return <label>{label}<select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>{fields.map(field => <option key={field}>{field}</option>)}</select></label>;
}
function ObservationRow({ observation, snapshot, disabled, run, detail }: { observation: Observation; snapshot: GameSnapshot; disabled: boolean; run: (operation: () => Promise<GameSnapshot>) => Promise<void>;detail:ScoringDetail }) {
  const [field, setField] = useState(observation.field);
  return <article className="observation-row">
    <p>Propozycja {observation.field} · leg {observation.leg_no}, lotka {observation.dart_no}. Wynik jeszcze się nie zmienił.</p>
    <FieldSelect value={field} onChange={setField} disabled={disabled} label="Pole po sprawdzeniu" />
    <div className="secondary-controls">
      <button className="button button-primary" type="button" disabled={disabled} onClick={() => run(() => api.review(snapshot.game.id, observation.id, 'accept', field, snapshot.game.revision,detail))}>Zatwierdź {field}</button>
      <button className="button button-secondary" type="button" disabled={disabled} onClick={() => run(() => api.review(snapshot.game.id, observation.id, 'reject', field, snapshot.game.revision))}>Odrzuć odczyt</button>
    </div>
  </article>;
}

export default function DartControls({ snapshot, disabled, run, detailed = false, view = 'all' }: { snapshot: GameSnapshot; disabled: boolean; run: (operation: () => Promise<GameSnapshot>) => Promise<void>; detailed?:boolean; view?:'all'|'darts'|'connections'|'history' }) {
  const scoreDisabled = disabled || snapshot.game.operation_state !== 'playing' || !snapshot.permissions.includes('score');
  const [multiplier, setMultiplier] = useState('S');
  const [cameraId, setCameraId] = useState(snapshot.game.active_camera_id ?? '');
  const [target,setTarget]=useState('');const [attempt,setAttempt]=useState('');
  useEffect(()=>{setTarget('');setAttempt('');},[snapshot.game.revision]);
  const detail:ScoringDetail=detailed?{...(target?{target}:{}),...(attempt!==''?{checkout_attempt:attempt==='yes'}:{})}:{};
  useEffect(() => { setCameraId(snapshot.game.active_camera_id ?? ''); }, [snapshot.game.revision, snapshot.game.active_camera_id]);
  const dart = (hit: string) => {
    if (snapshot.game.current_player_id !== null) run(() => api.dart(snapshot.game.id, snapshot.game.current_player_id!, hit, snapshot.game.revision,detail));
  };
  return <>
    {detailed&&(view==='all'||view==='darts'||view==='connections')&&<section className="panel"><h2>Deklaracja dla następnej lotki</h2><p>Opcjonalnie, także przy akceptacji kamery. Trafione pole nie dowodzi zamiaru. Po zapisie deklaracja jest czyszczona.</p><label>Zadeklarowany cel<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Nieznany</option>{fields.map(f=><option key={f}>{f}</option>)}</select></label><label>Czy zawodnik deklaruje próbę zakończenia?<select value={attempt} onChange={e=>setAttempt(e.target.value)}><option value="">Nieznane</option><option value="yes">Tak</option><option value="no">Nie</option></select></label></section>}
    {(view==='all'||view==='darts') && snapshot.game.status === 'active' && snapshot.game.current_player_id !== null && <section className="panel single-darts">
      <h2>Pojedyncza lotka</h2>
      <p>Wizyta {snapshot.game.context.visit_no} · lotka {snapshot.game.context.dart_no}/3. Wynik zatwierdza serwer.</p>
      <div className="multiplier-switch">{['S', 'D', 'T'].map(m => <button className={`button ${m === multiplier ? 'button-primary' : 'button-secondary'}`} type="button" key={m} aria-pressed={m === multiplier} disabled={disabled} onClick={() => setMultiplier(m)}>{m === 'S' ? 'Single' : m === 'D' ? 'Double' : 'Triple'}</button>)}</div>
      <div className="dart-grid">{Array.from({ length: 20 }, (_, i) => i + 1).map(n => <button type="button" key={n} className="button button-secondary" disabled={scoreDisabled} onClick={e => { if(e.detail<2) dart(multiplier + n); }}>{multiplier}{n}</button>)}</div>
      <div className="secondary-controls">{['25', '50', 'MISS'].map(hit => <button type="button" key={hit} className="button button-secondary" disabled={scoreDisabled} onClick={e => { if(e.detail<2) dart(hit); }}>{hit==='MISS'?'Pudło lotki':hit}</button>)}</div>
      {snapshot.partial_visit && <p className="sync-warning">Trwa częściowa wizyta. Aby wpisać sumę całej wizyty, dokończ lotki albo je jawnie cofnij.</p>}
    </section>}
    {(view==='all'||view==='connections')&&<section className="panel">
      <h2>Odczyty kamery</h2>
      {snapshot.observations.filter(o => o.status === 'pending').map(o => <ObservationRow key={o.id} observation={o} snapshot={snapshot} disabled={scoreDisabled} run={run} detail={detail} />)}
      {!snapshot.observations.some(o => o.status === 'pending') && <p className="muted">Brak propozycji do sprawdzenia.</p>}
      <label>Aktywna kamera<select value={cameraId} disabled={disabled} onChange={e => setCameraId(e.target.value)}><option value="">Brak aktywnej kamery</option>{snapshot.devices.filter(d => !d.revoked && d.role !== 'viewer' && d.expires_at * 1000 > Date.now()).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <button className="button button-secondary" type="button" disabled={disabled || cameraId === (snapshot.game.active_camera_id ?? '')} onClick={() => run(() => api.selectCamera(snapshot.game.id, cameraId || null, snapshot.game.revision))}>Zatwierdź zmianę kamery</button>
      <p className="muted">Jedna aktywna kamera. Zmiana unieważnia jej oczekujące odczyty. Rozpoznawanie wspomagane; bez automatycznej akceptacji.</p>
    </section>}
    {(view==='all'||view==='history')&&<section className="panel">
      <h2>Historia i korekta</h2>
      <details><summary>Pokaż wizyty i dokładne pola</summary><ol className="visit-history">{snapshot.visits.map(v => <li key={v.id}>Leg {v.leg_no} · {snapshot.players.find(p => p.id === v.player_id)?.name}: {v.applied_score} pkt, {v.darts_used} lotki{v.is_bust ? ' · BUST' : ''}{v.is_checkout ? ' · CHECKOUT' : ''}{!v.is_complete ? ' · w trakcie' : ''}<br /><small>{v.mode === 'darts' ? snapshot.darts.filter(d => d.visit_id === v.id).map(d => d.field).join(', ') : 'Suma wizyty — brak szczegółowych pól'}</small></li>)}</ol></details>
      <details><summary>Ślad korekt i operacji</summary><ul>{snapshot.audit.map(a => <li key={a.id}>{a.action} · {a.created_at} · {actorLabel(a.actor_context)}</li>)}</ul></details>
    </section>}
  </>;
}
