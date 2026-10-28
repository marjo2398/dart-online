import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ApiError, api, messageFrom } from '../api';
import DartControls from './DartControls';
import Devices from './Devices';
import ScoreEntry, { CheckoutPanel } from './ScoreEntry';
import HistoryCorrection from './HistoryCorrection';
import MatchManagement, { phaseNames, decisionNames } from './MatchManagement';
import WriteStatus, { useWriteState } from './WriteStatus';
import type { GameSnapshot, MatchPlayerState, Visit } from '../types';

interface DartGameProps {
  initialSnapshot: GameSnapshot;
  onExit: () => Promise<void>;
  onSessionExpired: () => void;
  onRematch: (s: GameSnapshot) => void;
}

type PendingVisit =
  | { stage: 'double'; score: number; revision: number }
  | { stage: 'darts'; score: number; revision: number; doubleConfirmed: boolean; outcome: 'checkout' | 'bust' };

type Recognition = {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const polishUnits: Record<string, number> = {
  zero: 0,
  jeden: 1,
  jedna: 1,
  dwa: 2,
  dwie: 2,
  trzy: 3,
  cztery: 4,
  pięć: 5,
  sześć: 6,
  siedem: 7,
  osiem: 8,
  dziewięć: 9,
};

const polishTeens: Record<string, number> = {
  dziesięć: 10,
  jedenaście: 11,
  dwanaście: 12,
  trzynaście: 13,
  czternaście: 14,
  piętnaście: 15,
  szesnaście: 16,
  siedemnaście: 17,
  osiemnaście: 18,
  dziewiętnaście: 19,
};

const polishTens: Record<string, number> = {
  dwadzieścia: 20,
  trzydzieści: 30,
  czterdzieści: 40,
  pięćdziesiąt: 50,
  sześćdziesiąt: 60,
  siedemdziesiąt: 70,
  osiemdziesiąt: 80,
  dziewięćdziesiąt: 90,
};

function parsePolishNumber(value: string): number | null {
  const numeric = value.match(/\b\d{1,3}\b/);
  if (numeric) return Number(numeric[0]);

  const normalized = value
    .toLocaleLowerCase('pl-PL')
    .replace(/[.,!?]/g, ' ')
    .replace(/\b(punkt|punkty|punktów|pkt|wynik)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized === 'pudło' || normalized === 'pudlo') return 0;
  if (!normalized) return null;

  let total = 0;
  let recognized = false;
  for (const word of normalized.split(' ')) {
    if (word === 'sto') {
      total += 100;
      recognized = true;
    } else if (word in polishTeens) {
      total += polishTeens[word];
      recognized = true;
    } else if (word in polishTens) {
      total += polishTens[word];
      recognized = true;
    } else if (word in polishUnits) {
      total += polishUnits[word];
      recognized = true;
    }
  }
  return recognized ? total : null;
}

function visitLabel(visit: Visit): string {
  if (visit.is_bust) return `BUST · ${visit.darts_used} lot.`;
  if (visit.is_checkout) return `${visit.applied_score} · CHECK`;
  return String(visit.applied_score);
}

function PlayerBoard({ player, active, visits, setsMode }: { player: MatchPlayerState; active: boolean; visits: Visit[]; setsMode: boolean }) {
  return (
    <article className={`scoreboard-player ${active ? 'is-active' : ''}`}>
      <div className="scoreboard-player-head">
        <div>
          <p className="eyebrow">Zawodnik {player.position}</p>
          <h2>{player.name}</h2>
        </div>
        <div className="leg-badge"><span>{setsMode ? 'Sety' : 'Legi'}</span><strong>{setsMode ? player.sets : player.legs}</strong></div>
      </div>
      {setsMode && <p>Legi w tym secie: {player.set_legs} · łącznie: {player.legs}</p>}

      <div className="remaining-score" aria-label={`${player.name}, pozostało ${player.remaining}`}>
        {player.remaining}
      </div>
      {!player.opened && <p className="sync-warning">Punktowanie jeszcze nieotwarte — wpisuj pojedyncze lotki.</p>}

      <dl className="match-stat-grid">
        <div><dt>Średnia</dt><dd>{player.darts ? player.average.toFixed(1) : '—'}</dd></div>
        <div><dt>Najwyższa</dt><dd>{player.highest_visit || '—'}</dd></div>
        <div><dt>Lotki w legu</dt><dd>{player.current_leg_darts}</dd></div>
        <div><dt>Punkty</dt><dd>{player.points}</dd></div>
      </dl>

      <div className="recent-visits" aria-label={`Ostatnie wizyty: ${player.name}`}>
        {visits.length === 0 ? <span className="muted">Brak wizyt w tym legu</span> : visits.map((visit) => (
          <span key={visit.id} className={visit.is_bust ? 'bust' : visit.is_checkout ? 'checkout' : ''}>{visitLabel(visit)}</span>
        ))}
      </div>
    </article>
  );
}

export default function DartGame({ initialSnapshot, onExit, onSessionExpired, onRematch }: DartGameProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [inputValue, setInputValue] = useState('');
  const [entryMode, setEntryMode] = useState<'score' | 'remaining'>('score');
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [remainingDialog, setRemainingDialog] = useState<{ value: number; revision: number } | null>(null);
  const [remainingDarts, setRemainingDarts] = useState(3);
  const [remainingDouble, setRemainingDouble] = useState(false);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [pendingVisit, setPendingVisit] = useState<PendingVisit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refereeMessage, setRefereeMessage] = useState(
    initialSnapshot.game.status === 'finished' ? 'Mecz zakończony.' : 'Game on!',
  );
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [fresh, setFresh] = useState(true);
  const writeState = useWriteState();
  const writesDisabled = busy || !fresh || writeState === 'unknown' || writeState === 'pending';
  const scoringDisabled = writesDisabled || snapshot.game.operation_state !== 'playing' || !snapshot.permissions.includes('score');
  const snapshotRef = useRef(initialSnapshot);
  const generationRef = useRef(0);

  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const commandRef = useRef<(command: string) => Promise<void>>(async () => undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const currentPlayer = snapshot.players.find((player) => player.id === snapshot.game.current_player_id) ?? null;
  const winner = snapshot.players.find((player) => player.id === snapshot.game.winner_id) ?? null;
  const legStarter = snapshot.players.find((player) => player.id === snapshot.game.leg_starter_id);
  const currentLegVisits = snapshot.visits.filter((visit) => visit.leg_no === snapshot.game.current_leg);
  const visitsFor = (playerId: number) => currentLegVisits.filter((visit) => visit.player_id === playerId).slice(-3);

  const installSnapshot = (next: GameSnapshot, remote = false) => {
    if (next.game.id !== snapshotRef.current.game.id || next.game.revision < snapshotRef.current.game.revision) return;
    if (next.game.revision !== snapshotRef.current.game.revision) {
      setPendingVisit(null); setRemainingDialog(null); setInputValue('');
    }
    snapshotRef.current = next;
    setSnapshot(next);
  };
  const authError = (caught: unknown) => {
    if (caught instanceof ApiError && (caught.status === 401 || caught.code.includes('csrf'))) onSessionExpired();
  };
  useEffect(() => {
    let stopped = false;
    let failures = 0;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (stopped || running) return;
      running = true;
      const generation = generationRef.current;
      controller = new AbortController();
      try {
        const next = await api.game(initialSnapshot.game.id, controller.signal);
        if (stopped) return;
        failures = 0; setFresh(true);
        if (generation === generationRef.current && !busyRef.current) installSnapshot(next, true);
      } catch (caught) {
        if (stopped) return;
        failures++; setFresh(false); setPendingVisit(null);
        authError(caught);
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(poll, failures ? Math.min(15000, 1000 * 2 ** Math.min(failures, 4)) : document.hidden ? 5000 : 750);
      }
    };
    const wake = () => { if (!running && !stopped) { clearTimeout(timer); void poll(); } };
    void poll();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true; clearTimeout(timer); controller?.abort(); generationRef.current++;
      window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake);
    };
  }, [initialSnapshot.game.id]);

  const syncAfterConflict = async (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 409) {
      try {
        installSnapshot(await api.game(snapshot.game.id), true);
      } catch {
        // Pierwotny komunikat jest bardziej użyteczny; kolejne odświeżenie nastąpi przy powrocie do panelu.
      }
    }
  };

  const withLock = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    generationRef.current++;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(messageFrom(caught));
      authError(caught);
      await syncAfterConflict(caught);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const describeSnapshot = (next: GameSnapshot) => {
    if (next.game.operation_state === 'confirmed') return 'Wynik zatwierdzony.';
    if (next.game.is_paused) return 'Mecz w pauzie.';
    if (next.game.decision) return `${decisionNames[next.game.decision.kind]}. ${next.game.decision.reason}`;
    if (next.game.result === 'draw') return 'Koniec meczu — remis.';
    if (next.game.phase === 'awaiting_starter') return 'Oczekiwanie na wynik bull-off.';
    const visit = next.visits.at(-1);
    if (!visit) return 'Game on!';
    const player = next.players.find((candidate) => candidate.id === visit.player_id);
    if (visit.is_bust) return `Bust ${player?.name ?? ''}. Wynik wraca.`;
    if (visit.is_checkout && next.game.winner_id !== null) return `Koniec meczu! Wygrywa ${player?.name ?? ''}.`;
    if (visit.is_checkout) {
      const nextPlayer = next.players.find((candidate) => candidate.id === next.game.current_player_id);
      return `Leg dla ${player?.name ?? ''}. Następny leg zaczyna ${nextPlayer?.name ?? ''}.`;
    }
    const remaining = next.players.find((candidate) => candidate.id === visit.player_id)?.remaining;
    if (visit.applied_score === 180) return 'One hundred and eighty!';
    if (hintsEnabled && remaining === 50) return 'Zostało 50. Bullseye.';
    if (hintsEnabled && next.game.config.scoring.out === 'double' && remaining && remaining <= 40 && remaining % 2 === 0) return `Zostało ${remaining}. Double ${remaining / 2}.`;
    return `${visit.applied_score}. Zostało ${remaining}.`;
  };

  const sendVisit = async (score: number, dartsUsed: number, doubleConfirmed: boolean) => {
    if (scoringDisabled || !currentPlayer || snapshot.game.status === 'finished' || snapshot.partial_visit) return;
    if (pendingVisit && pendingVisit.revision !== snapshotRef.current.game.revision) {
      setPendingVisit(null); setError('Mecz zmienił się na innym urządzeniu. Sprawdź turę i wpisz wynik ponownie.'); return;
    }
    await withLock(async () => {
      const next = await api.recordVisit(snapshot.game.id, currentPlayer.id, score, dartsUsed, doubleConfirmed, snapshot.game.revision);
      installSnapshot(next);
      setRefereeMessage(describeSnapshot(next));
      setInputValue('');
      setPendingVisit(null);
    });
  };

  const beginScore = async (score: number) => {
    if (scoringDisabled || busyRef.current || pendingVisit || remainingDialog || !currentPlayer || snapshot.partial_visit) return;
    if (!snapshot.game.aggregate_allowed) { setError('Ten zapis wymaga pojedynczych lotek.'); return; }
    if (!Number.isInteger(score) || score < 0 || score > 180) {
      setError('Wynik wizyty musi być liczbą całkowitą od 0 do 180.');
      return;
    }

    setError(null);
    const remainingAfter = currentPlayer.remaining - score;
    if (remainingAfter === 0) {
      if (snapshot.game.config.scoring.out === 'straight') {
        setPendingVisit({ stage: 'darts', score, revision: snapshot.game.revision, doubleConfirmed: false, outcome: 'checkout' }); return;
      }
      setPendingVisit({ stage: 'double', score, revision: snapshot.game.revision });
      return;
    }
    if (remainingAfter < 0 || (remainingAfter === 1 && snapshot.game.config.scoring.out !== 'straight')) {
      setPendingVisit({ stage: 'darts', score, revision: snapshot.game.revision, doubleConfirmed: false, outcome: 'bust' });
      return;
    }
    await sendVisit(score, 3, false);
  };

  const answerDouble = (confirmed: boolean) => {
    if (!pendingVisit || pendingVisit.stage !== 'double') return;
    setPendingVisit({
      stage: 'darts',
      score: pendingVisit.score,
      revision: pendingVisit.revision,
      doubleConfirmed: confirmed,
      outcome: confirmed ? 'checkout' : 'bust',
    });
  };

  const handleUndo = async () => {
    if (writesDisabled || !snapshot.can_undo || !snapshot.permissions.includes('correct_last')) return;
    const undone = snapshot.visits.at(-1);
    await withLock(async () => {
      const next = await api.undoVisit(snapshot.game.id, snapshot.game.revision);
      installSnapshot(next);
      setPendingVisit(null);
      setRefereeMessage(undone?.mode === 'darts' ? 'Cofnięto ostatnią lotkę.' : 'Cofnięto ostatnią wizytę.');
    });
  };

  const handleExit = async () => {
    await withLock(onExit);
  };
  const runCommand = async (operation: () => Promise<GameSnapshot>) => {
    if (writesDisabled) return;
    await withLock(async () => {
      const next = await operation(); installSnapshot(next); setRefereeMessage(describeSnapshot(next)); setInputValue(''); setPendingVisit(null);
    });
  };
  const recover = async () => {
    generationRef.current++;
    installSnapshot(await api.game(snapshot.game.id), true); setFresh(true);
  };

  const handleVoiceCommand = async (rawCommand: string) => {
    const command = rawCommand.toLocaleLowerCase('pl-PL').trim();
    setEntryMode('score');
    if (command.includes('cofnij')) {
      await handleUndo();
      return;
    }
    if (command.includes('dalej') || command.includes('następny') || command.includes('nastepny')) {
      await beginScore(0);
      return;
    }
    const scoreText = command.includes('wynik') ? command.slice(command.indexOf('wynik') + 'wynik'.length) : command;
    const score = parsePolishNumber(scoreText);
    if (score === null || score < 0 || score > 180) {
      setError(`Nie rozpoznano wyniku w komendzie: „${rawCommand}”.`);
      return;
    }
    setInputValue(String(score));
    await beginScore(score);
  };

  commandRef.current = handleVoiceCommand;

  useEffect(() => {
    const RecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionConstructor) return;

    setVoiceAvailable(true);
    const recognition = new RecognitionConstructor() as Recognition;
    recognition.continuous = true;
    recognition.lang = 'pl-PL';
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = String(lastResult[0].transcript ?? '').trim();
      commandRef.current(transcript).catch((caught) => setError(messageFrom(caught)));
    };
    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        listeningRef.current = false;
        setIsListening(false);
        setError('Mikrofon przerwał nasłuchiwanie. Sprawdź uprawnienia przeglądarki.');
      }
    };
    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          listeningRef.current = false;
          setIsListening(false);
        }
      }
    };
    recognitionRef.current = recognition;

    return () => {
      listeningRef.current = false;
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!voiceEnabled || !refereeMessage || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(refereeMessage);
    utterance.lang = 'pl-PL';
    utterance.rate = 1.03;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [refereeMessage, voiceEnabled]);

  useEffect(() => {
    if (pendingVisit || remainingDialog) dialogRef.current?.focus();
    else if (!busy && snapshot.game.status === 'active') inputRef.current?.focus();
  }, [busy, pendingVisit, remainingDialog, snapshot.game.status]);

  const toggleListening = () => {
    if (!recognitionRef.current || busy) return;
    if (listeningRef.current) {
      listeningRef.current = false;
      setIsListening(false);
      recognitionRef.current.stop();
      return;
    }
    try {
      recognitionRef.current.start();
      listeningRef.current = true;
      setIsListening(true);
      setError(null);
    } catch {
      setError('Nie udało się uruchomić mikrofonu.');
    }
  };

  return (
    <main className="match-shell">
      {remainingDialog && <div className="modal-backdrop" role="presentation"><section ref={dialogRef} tabIndex={-1} className="decision-modal" role="dialog" aria-modal="true" aria-label="Potwierdź stan pozostało" onKeyDown={e => { if (e.key === 'Escape' && !e.repeat && !busy) setRemainingDialog(null); if (e.key === 'Enter' && e.repeat) e.preventDefault(); }}>
        <h2>Pozostało po wizycie: {remainingDialog.value}</h2>
        <p>Oryginalny stan: {currentPlayer?.remaining}. Serwer sprawdzi osiągalność i zasady zakończenia.</p>
        <label>Faktyczna liczba lotek<select value={remainingDarts} disabled={scoringDisabled} onChange={e => setRemainingDarts(Number(e.target.value))}>{[1,2,3].map(n => <option key={n}>{n}</option>)}</select></label>
        {snapshot.game.config.scoring.out === 'double' && remainingDialog.value === 0 && <label><input type="checkbox" checked={remainingDouble} disabled={scoringDisabled} onChange={e => setRemainingDouble(e.target.checked)} /> Potwierdzam zakończenie ostatnią lotką na double</label>}
        {remainingDialog.value === currentPlayer?.remaining && <label><input type="checkbox" checked={zeroConfirmed} disabled={scoringDisabled} onChange={e => setZeroConfirmed(e.target.checked)} /> To była rzeczywista wizyta za 0 punktów. Bust wpiszę jako sumę albo pola.</label>}
        <div className="secondary-controls"><button type="button" className="button button-primary" disabled={scoringDisabled || remainingDialog.revision !== snapshot.game.revision} onClick={() => runCommand(async () => {
          const next = await api.remaining(snapshot.game.id,currentPlayer!.id,remainingDialog.value,remainingDarts,remainingDouble,zeroConfirmed,remainingDialog.revision); setRemainingDialog(null); return next;
        })}>Zatwierdź stan po wizycie</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setRemainingDialog(null)}>Anuluj</button></div>
      </section></div>}
      {pendingVisit && (
        <div className="modal-backdrop" role="presentation">
          <section ref={dialogRef} tabIndex={-1} className="decision-modal" role="dialog" aria-modal="true" aria-labelledby="decision-title" onKeyDown={e => { if (e.key === 'Escape' && !e.repeat && !busy) setPendingVisit(null); if (e.key === 'Enter' && e.repeat) e.preventDefault(); }}>
            <button type="button" className="modal-close" onClick={() => setPendingVisit(null)} disabled={busy} aria-label="Anuluj zapis wizyty"><X aria-hidden="true" /></button>
            <div className={`decision-icon ${pendingVisit.stage === 'darts' && pendingVisit.outcome === 'bust' ? 'danger' : ''}`}>
              {pendingVisit.stage === 'darts' && pendingVisit.outcome === 'bust' ? <X aria-hidden="true" /> : <Target aria-hidden="true" />}
            </div>
            {pendingVisit.stage === 'double' ? (
              <>
                <p className="eyebrow">Double out</p>
                <h2 id="decision-title">Czy ostatnia lotka trafiła w podwójne pole?</h2>
                <p className="muted">Wynik {pendingVisit.score} sprowadza licznik dokładnie do zera.</p>
                <div className="decision-actions two">
                  <button type="button" className="button button-primary button-large" onClick={() => answerDouble(true)}><Check aria-hidden="true" /> Tak, double</button>
                  <button type="button" className="button button-danger button-large" onClick={() => answerDouble(false)}><X aria-hidden="true" /> Nie — bust</button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">{pendingVisit.outcome === 'checkout' ? 'Checkout' : 'Bust'}</p>
                <h2 id="decision-title">{pendingVisit.outcome === 'checkout' ? 'Którą lotką zakończono leg?' : 'Po której lotce nastąpił bust?'}</h2>
                <p className="muted">Zapisz faktyczną liczbę rzuconych lotek — wpływa na średnią i cofanie.</p>
                <div className="dart-choice">
                  {[1, 2, 3].map((darts) => (
                    <button key={darts} type="button" disabled={busy} onClick={() => sendVisit(pendingVisit.score, darts, pendingVisit.doubleConfirmed)}>
                      {busy ? <LoaderCircle className="spinner" aria-hidden="true" /> : darts}
                      <span>{darts === 1 ? 'lotka' : 'lotki'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <header className="match-topbar">
        <button className="button button-ghost" type="button" disabled={busy} onClick={handleExit}><ArrowLeft aria-hidden="true" /> Panel</button>
        <div className="match-brand"><Target aria-hidden="true" /><span>{snapshot.game.starting_score} · {snapshot.game.config.match.unit === 'sets' ? 'sety' : 'legi'}</span></div>
        <div className="match-audio-actions">
          <button
            type="button"
            className={`button button-ghost button-icon ${voiceEnabled ? 'is-on' : ''}`}
            onClick={() => setVoiceEnabled((enabled) => !enabled)}
            title={voiceEnabled ? 'Wyłącz głos sędziego' : 'Włącz głos sędziego'}
            aria-label={voiceEnabled ? 'Wyłącz głos sędziego' : 'Włącz głos sędziego'}
          >
            {voiceEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
        </div>
      </header>

      <p className={fresh ? 'sync-status' : 'sync-status sync-warning'} role="status">{fresh ? `Połączono · rewizja ${snapshot.game.revision}` : 'Brak połączenia — ostatni wynik jest nieaktualny. Zapisy wstrzymane.'}</p>
      <WriteStatus onRecovered={recover} onAuthError={authError} />
      <p role="status">Faza: <strong>{phaseNames[snapshot.game.operation_state]}</strong>{snapshot.game.status === 'finished' ? ` · zapisano wizyt: ${snapshot.visits.length}` : ` · wizyta ${snapshot.game.context.visit_no} · ${snapshot.game.current_player_id === null ? 'oczekiwanie na rozpoczynającego' : snapshot.partial_visit ? `pozostało lotek: ${3 - snapshot.partial_visit.darts_used}` : 'nowa wizyta, do 3 lotek; brak zapisanych pól'}`}</p>
      <p className="format-summary">{snapshot.game.format_description}</p>

      <section className="referee-strip" aria-live="polite">
        <div><span>Wirtualny sędzia</span><strong>{refereeMessage}</strong></div>
        <p>Leg {snapshot.game.current_leg}{snapshot.game.config.match.unit === 'sets' ? ` · set ${snapshot.game.current_set}, leg ${snapshot.game.leg_in_set}` : ''} · rozpoczynający: {legStarter?.name ?? 'oczekiwanie na bull-off'}</p>
      </section>
      {snapshot.game.phase !== 'regular' && snapshot.game.phase !== 'finished' && <div className="format-summary" role="status">
        <strong>{({ decider: 'Leg decydujący', advantage: 'Gra na przewagę dwóch legów', sudden_death: 'Sudden death — ten leg rozstrzyga', awaiting_starter: 'Bull-off: wskaż zwycięzcę przy tarczy' } as Record<string, string>)[snapshot.game.phase]}</strong>
        {snapshot.game.phase === 'awaiting_starter' && <div className="secondary-controls">{snapshot.players.map(p => <button key={p.id} type="button" className="button button-primary" disabled={writesDisabled} onClick={() => runCommand(() => api.selectStarter(snapshot.game.id, p.id, snapshot.game.revision))}>Bull-off wygrał {p.name}</button>)}</div>}
      </div>}

      {error && (
        <div className="match-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Zamknij">×</button></div>
      )}

      {winner && snapshot.game.decision === null && (
        <section className="winner-banner">
          <Trophy aria-hidden="true" />
          <div><p className="eyebrow">Koniec meczu</p><h1>Wygrywa {winner.name}</h1><span>{snapshot.game.config.match.unit === 'sets' ? `${snapshot.players[0].sets} : ${snapshot.players[1].sets} sety` : `${snapshot.players[0].legs} : ${snapshot.players[1].legs} legi`}</span></div>
        </section>
      )}
      {snapshot.game.result === 'draw' && <section className="winner-banner"><h1>Remis {snapshot.players[0].legs} : {snapshot.players[1].legs}</h1></section>}

      <section className="scoreboard">
        <PlayerBoard player={snapshot.players[0]} active={snapshot.game.current_player_id === snapshot.players[0].id} visits={visitsFor(snapshot.players[0].id)} setsMode={snapshot.game.config.match.unit === 'sets'} />
        <div className="versus"><span>VS</span></div>
        <PlayerBoard player={snapshot.players[1]} active={snapshot.game.current_player_id === snapshot.players[1].id} visits={visitsFor(snapshot.players[1].id)} setsMode={snapshot.game.config.match.unit === 'sets'} />
      </section>

      <section className="match-controls">
        {snapshot.game.status === 'active' && currentPlayer && snapshot.game.aggregate_allowed ? (
          <>
            <div className="turn-caption"><span className="live-dot" /> Rzuca <strong>{currentPlayer?.name}</strong></div>
            <ScoreEntry inputRef={inputRef} value={inputValue} onChange={setInputValue} mode={entryMode} onMode={setEntryMode} remaining={currentPlayer.remaining}
              disabled={scoringDisabled || pendingVisit !== null || remainingDialog !== null || snapshot.partial_visit !== null}
              onZero={() => { setEntryMode('score'); void beginScore(0); }}
              onSubmit={() => { if (entryMode === 'score') void beginScore(Number(inputValue)); else { setRemainingDialog({ value: Number(inputValue), revision: snapshot.game.revision }); setRemainingDarts(3); setRemainingDouble(false); setZeroConfirmed(false); } }} />
          </>
        ) : snapshot.game.status === 'active' ? <p>{currentPlayer ? 'Wpisuj pojedyncze lotki poniżej.' : 'Wynik jest wstrzymany do zapisania bull-off.'}</p> : (
          <button className="button button-primary button-large" type="button" disabled={busy} onClick={handleExit}><Trophy aria-hidden="true" /> Wróć do panelu</button>
        )}

        <div className="secondary-controls">
          <button
            type="button"
            className={`button ${isListening ? 'button-danger' : 'button-secondary'}`}
            onClick={toggleListening}
            disabled={!voiceAvailable || writesDisabled || snapshot.game.status === 'finished'}
            title={voiceAvailable ? 'Komendy: „wynik 60”, „cofnij”' : 'Ta przeglądarka nie obsługuje rozpoznawania mowy'}
          >
            {isListening ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
            {isListening ? 'Nasłuchuję…' : voiceAvailable ? 'Mikrofon' : 'Brak mikrofonu'}
          </button>
          <button className="button button-secondary" type="button" disabled={writesDisabled || !snapshot.can_undo || !snapshot.permissions.includes('correct_last')} onClick={handleUndo}>
            {busy ? <LoaderCircle className="spinner" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            Cofnij ostatni zapis
          </button>
        </div>
        <p className="voice-hint">Komendy po polsku: „wynik sześćdziesiąt”, „wynik 180”, „cofnij”.</p>
      </section>
      <CheckoutPanel snapshot={snapshot} enabled={hintsEnabled} setEnabled={setHintsEnabled} />
      <MatchManagement snapshot={snapshot} disabled={writesDisabled} run={runCommand} onRematch={onRematch} />
      <DartControls snapshot={snapshot} disabled={writesDisabled} run={runCommand} />
      <HistoryCorrection snapshot={snapshot} disabled={writesDisabled} run={runCommand} />
      <section className="panel"><h2>Wygrane legi — hold / break</h2><ul>{snapshot.leg_results.map(l => <li key={l.leg_no}>Leg {l.leg_no}, set {l.set_no}: {snapshot.players.find(p => p.id === l.winner_id)?.name} · {l.kind === 'hold' ? 'hold — utrzymane rozpoczęcie' : l.kind === 'break' ? 'break — przełamanie' : 'starter nieznany'}; zaczynał {snapshot.players.find(p => p.id === l.starter_id)?.name ?? 'nieznany'}</li>)}</ul></section>
      <Devices gameId={snapshot.game.id} />
    </main>
  );
}
