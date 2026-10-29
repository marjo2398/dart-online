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
import MatchMetadata from './MatchMetadata';
import { MatchReport } from './Analysis';
import MatchManagement, { phaseNames, decisionNames } from './MatchManagement';
import WriteStatus, { useWriteState } from './WriteStatus';
import type { GameSnapshot, MatchPlayerState, Visit } from '../types';

interface DartGameProps {
  initialSnapshot: GameSnapshot;
  onExit: () => Promise<void>;
  onRematch: (s: GameSnapshot) => void;
}

type PendingVisit =
  | { stage: 'double'; score: number; revision: number }
  | { stage: 'darts'; score: number; revision: number; doubleConfirmed: boolean; outcome: 'checkout' | 'bust' | 'normal' };

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
  return <article className={'scoreboard-player '+(active?'is-active':'')} aria-label={player.name+(active?', aktywny zawodnik':'')}>
    <h2 title={player.name}>{active && <span aria-hidden="true">▶ </span>}{player.name}</h2>
    <div className="remaining-score" data-digits={String(player.remaining).length} aria-label={player.name+', pozostało '+player.remaining}>{player.remaining}</div>
    <p className="player-average">Średnia 3: <strong>{player.darts?player.average.toFixed(2):'—'}</strong></p>
    <p className="player-legs">Legi {setsMode?player.set_legs:player.legs}{setsMode?' · sety '+player.sets:''}</p>
    <div className="recent-visits" aria-label={'Ostatnie wizyty: '+player.name}>{visits.map(visit=><span key={visit.id} className={visit.is_bust?'bust':visit.is_checkout?'checkout':''}>{visitLabel(visit)}</span>)}</div>
    {!player.opened&&<p className="sync-warning">Wymagane otwarcie</p>}
  </article>;
}

export default function DartGame({ initialSnapshot, onExit, onRematch }: DartGameProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [inputValue, setInputValue] = useState('');
  const [panel,setPanel] = useState<'actions'|'settings'|'history'|'connections'|'management'|null>(null);
  const [requestedDarts,setRequestedDarts] = useState(false);
  const draftRef = useRef('');
  useEffect(() => { draftRef.current = inputValue; }, [inputValue]);
  const [entryMode, setEntryMode] = useState<'score' | 'remaining'>('score');
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [recording,setRecording]=useState<'quick'|'extended'|'detailed'>('quick');const [attempts,setAttempts]=useState('');const [report,setReport]=useState(false);
  const [remainingDialog, setRemainingDialog] = useState<{ value: number; revision: number } | null>(null);
  const [remainingDarts, setRemainingDarts] = useState(3);
  const [remainingDouble, setRemainingDouble] = useState(false);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [pendingVisit, setPendingVisit] = useState<PendingVisit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refereeMessage, setRefereeMessage] = useState(
    initialSnapshot.game.status === 'finished' ? 'Mecz zakończony.' : initialSnapshot.game.is_paused ? 'Pauza.' : initialSnapshot.visits.length ? 'Wznowiono mecz.' : 'Game on!',
  );
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [fresh, setFresh] = useState(true);
  const writeState = useWriteState();
  const archiveOnly = snapshot.game.origin?.read_only === true;
  const individual = requestedDarts || !!snapshot.partial_visit || !snapshot.game.aggregate_allowed || recording === 'detailed';
  const writesDisabled = archiveOnly || busy || !fresh || writeState === 'unknown' || writeState === 'pending';
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
  useEffect(()=>{setAttempts('');},[snapshot.game.revision]);
  useEffect(()=>{const pref=snapshot.profile_preferences?.[snapshot.game.current_player_id??0];setHintsEnabled(pref?.hints_enabled??false);},[snapshot.game.current_player_id]);
  const recordingDetail=recording==='extended'?{recording_level:'extended' as const,...(attempts!==''?{checkout_attempts:Number(attempts)}:{})}:{recording_level:'quick' as const};
  const winner = snapshot.players.find((player) => player.id === snapshot.game.winner_id) ?? null;
  const legStarter = snapshot.players.find((player) => player.id === snapshot.game.leg_starter_id);
  const currentLegVisits = snapshot.visits.filter((visit) => visit.leg_no === snapshot.game.current_leg);
  const visitsFor = (playerId: number) => currentLegVisits.filter((visit) => visit.player_id === playerId).slice(-3);

  const installSnapshot = (next: GameSnapshot, remote = false) => {
    if (next.game.id !== snapshotRef.current.game.id || next.game.revision < snapshotRef.current.game.revision) return;
    if (next.game.revision !== snapshotRef.current.game.revision) {
      if (remote && draftRef.current) setError('Mecz zmienił się na innym ekranie. Wpis wyczyszczono — sprawdź aktywnego zawodnika.');
      if (remote) setRefereeMessage(describeSnapshot(next));
      setPendingVisit(null); setRemainingDialog(null); setInputValue('');
    }
    snapshotRef.current = next;
    setSnapshot(next);
  };
  const authError = (caught: unknown) => {
    if (caught instanceof ApiError && (caught.status === 401 || caught.code.includes('csrf'))) { setFresh(false); setError('Nie udało się odnowić połączenia. Zapisy wstrzymane; odśwież panel bez logowania.'); }
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
      const next = await api.recordVisit(snapshot.game.id, currentPlayer.id, score, dartsUsed, doubleConfirmed, snapshot.game.revision,recordingDetail);
      installSnapshot(next);
      setRefereeMessage(describeSnapshot(next));
      setInputValue('');
      setPendingVisit(null);
    });
  };

  const beginScore = async (score: number) => {
    if(recording==='detailed'){setError('W trybie szczegółowym zapisuj rzeczywiste pojedyncze pola.');return;}
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
    if (recording==='extended') { setPendingVisit({stage:'darts',score,revision:snapshot.game.revision,doubleConfirmed:false,outcome:'normal'}); return; }
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

  const attemptField = recording==='extended' && <label>Jawne próby checkoutu<select value={attempts} disabled={scoringDisabled} onChange={e=>setAttempts(e.target.value)}><option value="">Wybierz liczbę prób</option>{[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>;
  const pendingProposals = snapshot.observations.filter(o=>o.status==='pending').length;
  const menuTitles = {actions:'Menu meczu',settings:'Ustawienia',history:'Historia i korekty',connections:'Połączenia, kamera i eksport',management:'Zakończenie i zatwierdzenie'};
  const chooseMode = (mode:'score'|'remaining'|'darts') => { setRequestedDarts(mode==='darts'); if(mode!=='darts')setEntryMode(mode); setInputValue(''); setPendingVisit(null);setRemainingDialog(null); };
  if(report)return <main className="match-shell"><MatchReport id={snapshot.game.id} onBack={()=>setReport(false)}/></main>;
  return (
    <main className="match-shell compact-match">
      {remainingDialog && <div className="modal-backdrop" role="presentation"><section ref={dialogRef} tabIndex={-1} className="decision-modal" role="dialog" aria-modal="true" aria-label="Potwierdź stan pozostało" onKeyDown={e => { if (e.key === 'Escape' && !e.repeat && !busy) setRemainingDialog(null); if (e.key === 'Enter' && e.repeat) e.preventDefault(); }}>
        <h2>Pozostało po wizycie: {remainingDialog.value}</h2>
        <p>Oryginalny stan: {currentPlayer?.remaining}. Serwer sprawdzi osiągalność i zasady zakończenia.</p>
        {attemptField}
        <label>Faktyczna liczba lotek<select value={remainingDarts} disabled={scoringDisabled} onChange={e => setRemainingDarts(Number(e.target.value))}>{[1,2,3].map(n => <option key={n}>{n}</option>)}</select></label>
        {snapshot.game.config.scoring.out === 'double' && remainingDialog.value === 0 && <label><input type="checkbox" checked={remainingDouble} disabled={scoringDisabled} onChange={e => setRemainingDouble(e.target.checked)} /> Potwierdzam zakończenie ostatnią lotką na double</label>}
        {remainingDialog.value === currentPlayer?.remaining && <label><input type="checkbox" checked={zeroConfirmed} disabled={scoringDisabled} onChange={e => setZeroConfirmed(e.target.checked)} /> To była rzeczywista wizyta za 0 punktów. Bust wpiszę jako sumę albo pola.</label>}
        <div className="secondary-controls"><button type="button" className="button button-primary" disabled={scoringDisabled || (recording==='extended'&&attempts==='') || remainingDialog.revision !== snapshot.game.revision} onClick={() => runCommand(async () => {
          const next = await api.remaining(snapshot.game.id,currentPlayer!.id,remainingDialog.value,remainingDarts,remainingDouble,zeroConfirmed,remainingDialog.revision,recordingDetail); setRemainingDialog(null); return next;
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
                  <button type="button" className="button button-primary button-large" disabled={scoringDisabled} onClick={() => answerDouble(true)}><Check aria-hidden="true" /> Tak, double</button>
                  <button type="button" className="button button-danger button-large" disabled={scoringDisabled} onClick={() => answerDouble(false)}><X aria-hidden="true" /> Nie — bust</button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">{pendingVisit.outcome === 'checkout' ? 'Checkout' : pendingVisit.outcome === 'bust' ? 'Bust' : 'Rozszerzony zapis'}</p>
                <h2 id="decision-title">{pendingVisit.outcome === 'checkout' ? 'Którą lotką zakończono leg?' : pendingVisit.outcome === 'bust' ? 'Po której lotce nastąpił bust?' : 'Próby checkoutu w pełnej wizycie'}</h2>
                <p className="muted">Zapisz faktyczną liczbę rzuconych lotek — wpływa na średnią i cofanie.</p>
                {attemptField}
                <div className="dart-choice">
                  {(pendingVisit.outcome==='normal'?[3]:[1,2,3]).map((darts) => (
                    <button key={darts} type="button" disabled={scoringDisabled || (recording==='extended'&&(attempts===''||Number(attempts)>darts))} onClick={() => sendVisit(pendingVisit.score, darts, pendingVisit.doubleConfirmed)}>
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

      <div inert={pendingVisit!==null||remainingDialog!==null}>
      <header className="match-topbar">
        <button className="button button-ghost" aria-label="Powrót do menu" disabled={busy} onClick={handleExit}><ArrowLeft aria-hidden="true" /><span>Menu</span></button>
        <div className="match-brand"><strong>{snapshot.game.starting_score} · {snapshot.game.config.match.unit==='sets'?'do '+snapshot.game.config.match.target+' setów':snapshot.game.config.match.unit==='fixed'?snapshot.game.config.match.target+' legów':'BO'+(snapshot.game.config.match.target*2-1)}</strong><small>{snapshot.game.origin?.mode==='archive'?'Archiwum z APK · tylko odczyt':snapshot.game.origin?.mode==='unknown'?'Import APK · tryb niepotwierdzony':snapshot.game.origin?.kind==='android'?'Udostępniony z APK':'Mecz online'} · #{snapshot.game.id}</small></div>
        <button className="button button-secondary" aria-expanded={panel!==null} onClick={()=>setPanel(panel?null:'actions')}>Działania{pendingProposals>0&&<span className="counter">{pendingProposals}</span>}</button>
      </header>
      <div className="match-content">
        <p className={fresh?'sync-status':'sync-status sync-warning'} role="status">{fresh?'Połączono · rewizja '+snapshot.game.revision:'Brak połączenia — wynik może być nieaktualny. Zapisy wstrzymane.'} · {phaseNames[snapshot.game.operation_state]}</p>
        <WriteStatus compact onRecovered={recover} onAuthError={authError}/>
        {error&&<div className="match-error" role="alert"><span>{error}</span><button onClick={()=>setError(null)} aria-label="Zamknij komunikat">×</button></div>}
        {archiveOnly&&<p className="sync-warning">Zsynchronizowana historia nie została udostępniona do sterowania. Zachowano wynik i statystyki.</p>}
        <div className="match-play-layout">
          <div className="match-score-side">
            <section className="scoreboard" aria-label="Wyniki obu zawodników">
              <PlayerBoard player={snapshot.players[0]} active={snapshot.game.current_player_id===snapshot.players[0].id} visits={visitsFor(snapshot.players[0].id)} setsMode={snapshot.game.config.match.unit==='sets'}/>
              <PlayerBoard player={snapshot.players[1]} active={snapshot.game.current_player_id===snapshot.players[1].id} visits={visitsFor(snapshot.players[1].id)} setsMode={snapshot.game.config.match.unit==='sets'}/>
            </section>
            <p className="leg-summary">Legi {snapshot.players[0].set_legs} : {snapshot.players[1].set_legs}{snapshot.game.config.match.unit==='sets'?' · Sety '+snapshot.players[0].sets+' : '+snapshot.players[1].sets:''} · leg {snapshot.game.current_leg}{snapshot.game.config.match.unit==='sets'?' · set '+snapshot.game.current_set:''}</p>
            <p className="referee-message" aria-live="polite">{refereeMessage}</p>
            {snapshot.game.phase!=='regular'&&snapshot.game.phase!=='finished'&&<p className="sync-warning">{({decider:'Decydujący leg',advantage:'Gra na przewagę',sudden_death:'Sudden death',awaiting_starter:'Oczekiwanie na wynik bull-off'} as Record<string,string>)[snapshot.game.phase]}</p>}
            <p className="format-caption">{snapshot.game.format_description}</p>
          </div>
          {panel ? <section className="panel match-menu" aria-label={menuTitles[panel]}>
            <div className="section-heading"><h2>{menuTitles[panel]}</h2><button className="button button-ghost" onClick={()=>setPanel(null)}>Wróć do meczu</button></div>
            {panel!=='actions'&&<button className="button button-ghost" onClick={()=>setPanel('actions')}>Wszystkie działania</button>}
            {panel==='actions'&&<div className="match-menu-actions">
              <button className="button button-secondary" onClick={()=>setPanel('history')}>Historia i korekty</button>
              <button className="button button-secondary" onClick={()=>setReport(true)}>Statystyki i eksport</button>
              <button className="button button-secondary" onClick={()=>setPanel('settings')}>Ustawienia</button>
              <button className="button button-secondary" onClick={()=>setPanel('connections')}>Połączenia i kamera{pendingProposals?' · '+pendingProposals+' do sprawdzenia':''}</button>
              {snapshot.game.status==='active'&&<button className="button button-secondary" disabled={writesDisabled||!snapshot.permissions.includes('pause')} onClick={()=>{if(window.confirm(snapshot.game.is_paused?'Wznowić grę?':'Wstrzymać grę? Częściowa wizyta zostanie zachowana.'))void runCommand(()=>api.matchOperation(snapshot.game.is_paused?'game-resume':'game-pause',snapshot.game.id,snapshot.game.revision));}}>{snapshot.game.is_paused?'Wznów grę':'Pauza'}</button>}
              <button className="button button-secondary" onClick={()=>setPanel('management')}>Zakończenie i zatwierdzenie</button>
            </div>}
            {panel==='settings'&&<>
              <label>Poziom zapisu<select value={recording} disabled={writesDisabled} onChange={e=>{setRecording(e.target.value as typeof recording);setAttempts('');setInputValue('');}}><option value="quick">Szybki — suma, bez deklaracji prób</option><option value="extended">Rozszerzony — jawne próby checkoutu</option><option value="detailed">Szczegółowy — rzeczywiste pola i opcjonalny cel</option></select></label>
              <p>Przy checkout, buście lub rozszerzonym zapisie potwierdzisz potrzebne dane w dialogu. Nieznane próby pozostają nieznane.</p>
              <button className="button button-secondary" onClick={()=>setVoiceEnabled(v=>!v)}>{voiceEnabled?<Volume2/>:<VolumeX/>}{voiceEnabled?'Wyłącz głos sędziego':'Włącz głos sędziego'}</button>
              <button className="button button-secondary" onClick={toggleListening} disabled={!voiceAvailable||scoringDisabled}>{isListening?<Mic/>:<MicOff/>}{isListening?'Zatrzymaj nasłuch':'Komendy głosowe'}</button><p className="muted">Komendy: „wynik 60”, „cofnij”. Dostępność mikrofonu zależy od przeglądarki.</p>
              <CheckoutPanel snapshot={snapshot} enabled={hintsEnabled} setEnabled={setHintsEnabled}/>
            </>}
            {panel==='history'&&<><HistoryCorrection snapshot={snapshot} disabled={writesDisabled} run={runCommand}/><DartControls snapshot={snapshot} disabled={writesDisabled} run={runCommand} view="history"/><details><summary>Legi — hold / break</summary><ul>{snapshot.leg_results.map(l=><li key={l.leg_no}>Leg {l.leg_no}, set {l.set_no}: {snapshot.players.find(p=>p.id===l.winner_id)?.name} · {l.kind}</li>)}</ul></details></>}
            {panel==='connections'&&<><DartControls snapshot={snapshot} disabled={writesDisabled} run={runCommand} view="connections" detailed={recording==='detailed'}/><Devices gameId={snapshot.game.id}/><MatchMetadata snapshot={snapshot} disabled={writesDisabled} run={runCommand}/><button className="button button-secondary" onClick={()=>setReport(true)}>Raport i eksport CSV / JSON</button><p>WWW nie uruchamia kamery. Udostępnianie lokalnej gry wykonujesz jawnie w APK; obraz pozostaje na telefonie.</p></>}
            {panel==='management'&&<MatchManagement snapshot={snapshot} disabled={writesDisabled} run={runCommand} onRematch={onRematch}/>}
          </section> : <section className="match-controls">
            {snapshot.game.status==='finished'?<div className="finished-state"><Trophy aria-hidden="true"/><h1>{winner?'Wygrywa '+winner.name:snapshot.game.result==='draw'?'Remis':'Mecz zakończony'}</h1><p>{snapshot.game.decision?decisionNames[snapshot.game.decision.kind]:phaseNames[snapshot.game.operation_state]}</p><button className="button button-primary" onClick={()=>setPanel('management')}>Wynik i dalsze działania</button><button className="button button-secondary" onClick={()=>setReport(true)}>Statystyki i eksport</button><button className="button button-secondary" disabled={writesDisabled||!snapshot.can_undo} onClick={handleUndo}>Cofnij ostatni zapis</button></div>
            :snapshot.game.is_paused?<div className="finished-state"><h2>Pauza</h2><p>Wynik i częściowa wizyta są zachowane.</p><button className="button button-primary" disabled={writesDisabled} onClick={()=>runCommand(()=>api.matchOperation('game-resume',snapshot.game.id,snapshot.game.revision))}>Wznów grę</button></div>
            :snapshot.game.phase==='awaiting_starter'?<div className="finished-state"><h2>Kto wygrał bull-off?</h2>{snapshot.players.map(p=><button className="button button-primary" key={p.id} disabled={writesDisabled} onClick={()=>runCommand(()=>api.selectStarter(snapshot.game.id,p.id,snapshot.game.revision))}>{p.name}</button>)}</div>
            :<>
              <div className="entry-toolbar"><div className="entry-tabs" aria-label="Sposób wpisywania">{(['score','remaining','darts'] as const).map(m=><button key={m} className={'button '+((m==='darts'?individual:!individual&&entryMode===m)?'button-selected':'button-secondary')} aria-pressed={m==='darts'?individual:!individual&&entryMode===m} disabled={scoringDisabled||(m!=='darts'&&(!!snapshot.partial_visit||!snapshot.game.aggregate_allowed||recording==='detailed'))} onClick={()=>chooseMode(m)}>{m==='score'?'Zdobyte':m==='remaining'?'Pozostało':'Lotki'}</button>)}</div><button className="button button-ghost" disabled={writesDisabled||!snapshot.can_undo||!snapshot.permissions.includes('correct_last')} onClick={handleUndo}><RotateCcw aria-hidden="true"/>Cofnij</button></div>
              <p className="turn-caption"><span className="live-dot"/>Rzuca <strong>{currentPlayer?.name}</strong>{snapshot.partial_visit?' · lotka '+snapshot.game.context.dart_no+'/3':''}</p>
              {individual?<DartControls snapshot={snapshot} disabled={writesDisabled} run={runCommand} detailed={recording==='detailed'} view="darts"/>:<ScoreEntry inputRef={inputRef} value={inputValue} onChange={setInputValue} mode={entryMode} remaining={currentPlayer?.remaining??0} disabled={scoringDisabled||pendingVisit!==null||remainingDialog!==null} onSubmit={()=>{if(entryMode==='score')void beginScore(Number(inputValue));else{setRemainingDialog({value:Number(inputValue),revision:snapshot.game.revision});setRemainingDarts(3);setRemainingDouble(false);setZeroConfirmed(false);}}}/>}
              {pendingProposals>0&&<button className="button button-secondary" onClick={()=>setPanel('connections')}>Sprawdź propozycję kamery · {pendingProposals}</button>}
            </>}
          </section>}
        </div>
      </div>
      </div>
    </main>
  );
}
