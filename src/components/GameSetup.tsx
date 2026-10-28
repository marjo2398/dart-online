import { useEffect, useState } from 'react';
import { api, messageFrom } from '../api';
import type { DecidingRule, GameSnapshot, MatchConfig, MatchTemplate, Player } from '../types';

const standard = (): MatchConfig => ({ version: 1, scoring: { start: 501, in: 'straight', out: 'double' },
  match: { unit: 'legs', target: 2 }, legs_per_set: 3, deciding: { win_by_two: false, extra_pairs: null }, final_set: null,
  starters: { method: 'fixed', player: 1, leg_rotation: 'alternate', set_rotation: 'alternate', decider: 'rotation' } });

function TargetInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const [bestOf, setBestOf] = useState(false);
  return <label>{label}<span className="target-input">
    <select aria-label={`${label}: sposób zapisu`} value={bestOf ? 'bo' : 'win'} onChange={e => setBestOf(e.target.value === 'bo')}>
      <option value="win">Do N wygranych</option><option value="bo">Best of N (nieparzyste)</option>
    </select>
    <input aria-label={`${label}: liczba`} type="number" min={1} max={bestOf ? 197 : 99} step={bestOf ? 2 : 1} value={bestOf ? value * 2 - 1 : value} onChange={e => onChange(bestOf ? (Number(e.target.value) + 1) / 2 : Number(e.target.value))} />
  </span><small>Do {value} wygranych = best of {value * 2 - 1}; pozostałych nie rozgrywa się.</small></label>;
}

function DecidingFields({ rule, onChange, target }: { rule: DecidingRule; onChange: (r: DecidingRule) => void; target: number }) {
  return <div className="rule-fields">
    <label><input type="checkbox" checked={rule.win_by_two} onChange={e => onChange({ win_by_two: e.target.checked, extra_pairs: null })} /> Wymagana przewaga dwóch legów</label>
    {rule.win_by_two && <>
      <label>Limit przedłużenia<select value={rule.extra_pairs === null ? 'none' : 'cap'} onChange={e => onChange({ ...rule, extra_pairs: e.target.value === 'none' ? null : 2 })}>
        <option value="none">Bez limitu</option><option value="cap">Sudden death po limicie</option>
      </select></label>
      {rule.extra_pairs !== null && <label>Dodatkowe pary legów (0–50)<input type="number" min={0} max={50} value={rule.extra_pairs} onChange={e => onChange({ ...rule, extra_pairs: Number(e.target.value) })} /></label>}
      <p>Od {target - 1}:{target - 1} gra trwa do przewagi 2. {rule.extra_pairs === null ? 'Bez limitu liczby legów.' : `Przy ${target - 1 + rule.extra_pairs}:${target - 1 + rule.extra_pairs} jeden leg sudden death rozstrzyga. Limit 0 oznacza natychmiastowy decider.`}</p>
    </>}
    {!rule.win_by_two && <p>Przy {target - 1}:{target - 1} następny leg rozstrzyga.</p>}
  </div>;
}

export default function GameSetup({ players, templates, busy, run, onCreated, refresh }: {
  players: Player[]; templates: MatchTemplate[]; busy: boolean;
  run: (operation: () => Promise<void>) => Promise<void>; onCreated: (s: GameSnapshot) => void; refresh: () => Promise<void>;
}) {
  const [custom, setCustom] = useState(false);
  const [config, setConfig] = useState<MatchConfig>(standard);
  const [p1, setP1] = useState(0); const [p2, setP2] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState(''); const [favorite, setFavorite] = useState(false);
  const [bullConfirmed, setBullConfirmed] = useState(false);
  const [preview, setPreview] = useState<{ description: string; legacy_compatible: boolean } | null>(null);
  const [validation, setValidation] = useState('');
  const c = custom ? config : standard();
  const serialized = JSON.stringify(c);
  useEffect(() => {
    setP1(id => players.some(p => p.id === id) ? id : players[0]?.id ?? 0);
    setP2(id => players.some(p => p.id === id) ? id : players[1]?.id ?? 0);
  }, [players]);
  useEffect(() => {
    let active = true; setPreview(null); setValidation('');
    const timer = setTimeout(() => {
      api.previewFormat(JSON.parse(serialized)).then(p => { if (active) setPreview(p); }).catch(e => { if (active) setValidation(messageFrom(e)); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [serialized]);
  const change = (next: MatchConfig) => setConfig(next);
  const template = templates.find(t => t.id === selected);
  const playerName = (position: number) => players.find(p => p.id === (position === 1 ? p1 : p2))?.name ?? `zawodnik ${position}`;
  const invalidPlayers = !p1 || !p2 || p1 === p2;
  const save = (existing: boolean) => run(async () => {
    await api.saveTemplate(name, config, favorite, existing ? template : undefined); await refresh();
  });
  return <section className="panel new-game-panel" aria-labelledby="new-game-title">
    <h2 id="new-game-title">Nowa gra</h2>
    <div className="secondary-controls">
      <button type="button" className={`button ${!custom ? 'button-primary' : 'button-secondary'}`} aria-pressed={!custom} disabled={busy} onClick={() => setCustom(false)}>Szybkie 501</button>
      <button type="button" className={`button ${custom ? 'button-primary' : 'button-secondary'}`} aria-pressed={custom} disabled={busy} onClick={() => setCustom(true)}>Własna rozgrywka</button>
    </div>
    <form onSubmit={e => { e.preventDefault(); if (!invalidPlayers && preview && (c.starters.method !== 'bull_off' || bullConfirmed)) run(async () => onCreated(await api.createConfiguredGame(p1, p2, c))); }}>
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label>Zawodnik 1<select value={p1} onChange={e => { setP1(Number(e.target.value)); setBullConfirmed(false); }}><option value={0}>Wybierz zawodnika</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Zawodnik 2<select value={p2} onChange={e => { setP2(Number(e.target.value)); setBullConfirmed(false); }}><option value={0}>Wybierz zawodnika</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
        {invalidPlayers && <p role="alert">Wybierz dwóch różnych zapisanych zawodników. Nowych dodasz w sekcji Zawodnicy.</p>}
        {custom && <>
          <label>Szablon serwera<select value={selected ?? ''} onChange={e => {
            const t = templates.find(t => t.id === Number(e.target.value)); setSelected(t?.id ?? null);
            if (t) { setConfig(structuredClone(t.config)); setName(t.name); setFavorite(t.favorite); setBullConfirmed(false); }
          }}><option value="">Własne ustawienia</option>{templates.map(t => <option key={t.id} value={t.id}>{t.favorite ? '★ ' : ''}{t.name}</option>)}</select></label>
          <details open><summary>Punktowanie i długość</summary>
            <div className="form-grid">
              <label>Wynik startowy (2–10001)<input type="number" list="start-scores" min={2} max={10001} value={c.scoring.start} onChange={e => change({ ...c, scoring: { ...c.scoring, start: Number(e.target.value) } })} /></label><datalist id="start-scores">{[301, 501, 701, 901].map(n => <option key={n}>{n}</option>)}</datalist>
              <label>Otwarcie<select value={c.scoring.in} onChange={e => change({ ...c, scoring: { ...c.scoring, in: e.target.value as MatchConfig['scoring']['in'] } })}><option value="straight">Straight-in</option><option value="double">Double-in</option><option value="master">Master-in (wariant dodatkowy)</option></select></label>
              <label>Zakończenie<select value={c.scoring.out} onChange={e => change({ ...c, scoring: { ...c.scoring, out: e.target.value as MatchConfig['scoring']['out'] } })}><option value="double">Double-out</option><option value="straight">Straight-out (rekreacyjne)</option><option value="master">Master-out (wariant dodatkowy)</option></select></label>
              <label>Struktura<select value={c.match.unit} onChange={e => {
                const unit = e.target.value as MatchConfig['match']['unit'];
                change({ ...c, match: { ...c.match, unit }, final_set: null, ...(unit === 'fixed' ? { deciding: { win_by_two: false, extra_pairs: null }, starters: { ...c.starters, decider: 'rotation' } } : {}) });
              }}><option value="legs">Mecz na legi</option><option value="sets">Mecz na sety</option><option value="fixed">Rozegraj wszystkie N legów (możliwy remis)</option></select></label>
              {c.match.unit === 'fixed' ? <label>Wszystkie legi (1–99)<input type="number" min={1} max={99} value={c.match.target} onChange={e => change({ ...c, match: { ...c.match, target: Number(e.target.value) } })} /></label> : <TargetInput label={c.match.unit === 'sets' ? 'Sety w meczu' : 'Legi w meczu'} value={c.match.target} onChange={target => change({ ...c, match: { ...c.match, target } })} />}
              {c.match.unit === 'sets' && <TargetInput label="Legi w secie" value={c.legs_per_set} onChange={n => change({ ...c, legs_per_set: n })} />}
            </div>
            <p>Standardowe 501: straight-in, double-out. Master: double lub triple; 50 to double 25, zewnętrzny bull 25 nie otwiera i nie kończy double/master. Bust unieważnia wizytę, także otwarcie w tej wizycie.</p>
            {(c.scoring.in !== 'straight' || c.scoring.out === 'master') && <p className="sync-warning">Przed otwarciem double/master-in oraz przy master-out wymagane są pojedyncze lotki.</p>}
          </details>
          {c.match.unit !== 'fixed' && <details><summary>Decydująca faza {c.match.unit === 'sets' ? 'każdego seta' : 'meczu'}</summary>
            <DecidingFields rule={c.deciding} target={c.match.unit === 'sets' ? c.legs_per_set : c.match.target} onChange={deciding => change({ ...c, deciding })} />
            {c.match.unit === 'sets' && <>
              <label><input type="checkbox" checked={c.final_set !== null} onChange={e => change({ ...c, final_set: e.target.checked ? { ...c.deciding, target: c.legs_per_set } : null })} /> Odrębne zasady ostatniego seta (gdy oba wyniki setów = {c.match.target - 1})</label>
              {c.final_set && <><TargetInput label="Legi w ostatnim secie" value={c.final_set.target} onChange={target => change({ ...c, final_set: { ...c.final_set!, target } })} /><DecidingFields rule={c.final_set} target={c.final_set.target} onChange={rule => change({ ...c, final_set: { target: c.final_set!.target, ...rule } })} /></>}
            </>}
          </details>}
          <details><summary>Rozpoczynający i rotacja</summary>
            <div className="form-grid">
              <label>Pierwszy rozpoczynający<select value={c.starters.method} onChange={e => { change({ ...c, starters: { ...c.starters, method: e.target.value as MatchConfig['starters']['method'] } }); setBullConfirmed(false); }}><option value="fixed">Wskaż zawodnika</option><option value="random">Losuje serwer (trwały wynik)</option><option value="bull_off">Wynik rzeczywistego bull-off</option></select></label>
              {c.starters.method !== 'random' && <label>{c.starters.method === 'bull_off' ? 'Zwycięzca bull-off' : 'Zaczyna'}<select value={c.starters.method === 'bull_off' && !bullConfirmed ? '' : c.starters.player} onChange={e => { change({ ...c, starters: { ...c.starters, player: Number(e.target.value) as 1 | 2 } }); setBullConfirmed(true); }}><option value="" disabled>Wskaż wynik przy tarczy</option><option value={1}>{playerName(1)}</option><option value={2}>{playerName(2)}</option></select></label>}
              <label>Legi {c.match.unit === 'sets' ? 'wewnątrz seta' : 'w meczu'}<select value={c.starters.leg_rotation} onChange={e => change({ ...c, starters: { ...c.starters, leg_rotation: e.target.value as 'alternate' | 'same' } })}><option value="alternate">Naprzemiennie od początkującego</option><option value="same">Ten sam początkujący</option></select></label>
              {c.match.unit === 'sets' && <label>Początki setów<select value={c.starters.set_rotation} onChange={e => change({ ...c, starters: { ...c.starters, set_rotation: e.target.value as 'alternate' | 'same' } })}><option value="alternate">Naprzemiennie od pierwszego seta</option><option value="same">Ten sam początkujący set</option></select></label>}
              {c.match.unit !== 'fixed' && <label>Leg decydujący / sudden death<select value={c.starters.decider} onChange={e => change({ ...c, starters: { ...c.starters, decider: e.target.value as MatchConfig['starters']['decider'] } })}><option value="rotation">Według rotacji legów</option><option value="initial">Rozpoczynający pierwszy leg meczu</option><option value="bull_off">Nowy bull-off — zaczekaj na wynik</option></select></label>}
            </div>
            <p>Rotacja setów ustala pierwszy leg każdego seta; rotacja legów liczy się od nowa wewnątrz seta. Reguła decidera ma pierwszeństwo, także w jednolegowym secie/meczu. Wynik początkowego bull-off wystarcza dla pierwszego lega; kolejne decydujące bull-off wymagają nowego wskazania przy tarczy.</p>
          </details>
          <details><summary>Zapis i edycja własnego szablonu</summary>
            <label>Nazwa<input maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
            <label><input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)} /> Ulubiony</label>
            <div className="secondary-controls">
              <button type="button" className="button button-secondary" disabled={!preview || !name.trim()} onClick={() => save(false)}>Zapisz jako nowy</button>
              <button type="button" className="button button-secondary" disabled={!template || !preview || !name.trim()} onClick={() => save(true)}>Zaktualizuj wybrany</button>
              <button type="button" className="button button-danger-ghost" disabled={!template} onClick={() => { if (template && window.confirm(`Usunąć szablon „${template.name}”? Mecze zachowają własne reguły.`)) run(async () => { await api.deleteTemplate(template); setSelected(null); await refresh(); }); }}>Usuń wybrany</button>
            </div><p>Zmiana szablonu nie zmienia istniejących meczów. Szablon wskazuje pozycje 1/2, a nie nazwiska.</p>
          </details>
        </>}
        <div className="format-summary" aria-live="polite"><strong>Przed rozpoczęciem</strong>
          <p>{preview?.description ?? (validation || 'Sprawdzanie zasad na serwerze…')}</p>
          <p>{playerName(1)} kontra {playerName(2)}. {c.starters.method === 'random' ? 'Pierwszego rozpoczynającego wylosuje i zapisze serwer.' : `Pierwszy rozpoczynający: ${playerName(c.starters.player)}${c.starters.method === 'bull_off' && !bullConfirmed ? ' — wskaż wynik bull-off' : ''}.`} Legi: {c.starters.leg_rotation === 'alternate' ? 'naprzemiennie' : 'ten sam rozpoczynający'}. {c.match.unit === 'sets' && `Sety: ${c.starters.set_rotation === 'alternate' ? 'naprzemiennie' : 'ten sam rozpoczynający'}. `}Decider: {c.starters.decider === 'bull_off' ? 'oczekiwanie na bull-off' : c.starters.decider === 'initial' ? 'rozpoczynający pierwszy leg meczu' : 'według rotacji'}.</p>
          {c.starters.decider !== 'rotation' && <p>Reguła decidera ma pierwszeństwo przed rotacją i wskazaniem początkującego.</p>}
          {preview && !preview.legacy_compatible && <p>Ten format rozgrywasz w WWW. APK 1.0.1 nie może go otworzyć ani prowadzić kamery dla tego meczu.</p>}
        </div>
        <button type="submit" className="button button-primary button-large full-width" disabled={invalidPlayers || !preview || (c.starters.method === 'bull_off' && !bullConfirmed)}>Rozpocznij mecz</button>
      </fieldset>
    </form>
  </section>;
}
