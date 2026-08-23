import { FormEvent, useEffect, useRef, useState } from 'react';
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
import type { GameSnapshot, MatchPlayerState, Visit } from '../types';

interface DartGameProps {
  initialSnapshot: GameSnapshot;
  onExit: () => Promise<void>;
}

type PendingVisit =
  | { stage: 'double'; score: number }
  | { stage: 'darts'; score: number; doubleConfirmed: boolean; outcome: 'checkout' | 'bust' };

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

function PlayerBoard({ player, active, visits }: { player: MatchPlayerState; active: boolean; visits: Visit[] }) {
  return (
    <article className={`scoreboard-player ${active ? 'is-active' : ''}`}>
      <div className="scoreboard-player-head">
        <div>
          <p className="eyebrow">Zawodnik {player.position}</p>
          <h2>{player.name}</h2>
        </div>
        <div className="leg-badge"><span>Legi</span><strong>{player.legs}</strong></div>
      </div>

      <div className="remaining-score" aria-label={`${player.name}, pozostało ${player.remaining}`}>
        {player.remaining}
      </div>

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

export default function DartGame({ initialSnapshot, onExit }: DartGameProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [inputValue, setInputValue] = useState('');
  const [pendingVisit, setPendingVisit] = useState<PendingVisit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refereeMessage, setRefereeMessage] = useState(
    initialSnapshot.game.status === 'finished' ? 'Mecz zakończony.' : 'Game on!',
  );
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const commandRef = useRef<(command: string) => Promise<void>>(async () => undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPlayer = snapshot.players.find((player) => player.id === snapshot.game.current_player_id) ?? null;
  const winner = snapshot.players.find((player) => player.id === snapshot.game.winner_id) ?? null;
  const legStarter = snapshot.players.find((player) => player.id === snapshot.game.leg_starter_id) ?? snapshot.players[0];
  const currentLegVisits = snapshot.visits.filter((visit) => visit.leg_no === snapshot.game.current_leg);
  const visitsFor = (playerId: number) => currentLegVisits.filter((visit) => visit.player_id === playerId).slice(-3);

  const syncAfterConflict = async (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 409) {
      try {
        setSnapshot(await api.game(snapshot.game.id));
      } catch {
        // Pierwotny komunikat jest bardziej użyteczny; kolejne odświeżenie nastąpi przy powrocie do panelu.
      }
    }
  };

  const withLock = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(messageFrom(caught));
      await syncAfterConflict(caught);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const describeSnapshot = (next: GameSnapshot) => {
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
    if (remaining === 50) return 'Zostało 50. Bullseye.';
    if (remaining && remaining <= 40 && remaining % 2 === 0) return `Zostało ${remaining}. Double ${remaining / 2}.`;
    return `${visit.applied_score}. Zostało ${remaining}.`;
  };

  const sendVisit = async (score: number, dartsUsed: number, doubleConfirmed: boolean) => {
    if (!currentPlayer || snapshot.game.status === 'finished') return;
    await withLock(async () => {
      const next = await api.recordVisit(snapshot.game.id, currentPlayer.id, score, dartsUsed, doubleConfirmed);
      setSnapshot(next);
      setRefereeMessage(describeSnapshot(next));
      setInputValue('');
      setPendingVisit(null);
    });
  };

  const beginScore = async (score: number) => {
    if (busyRef.current || pendingVisit || !currentPlayer) return;
    if (!Number.isInteger(score) || score < 0 || score > 180) {
      setError('Wynik wizyty musi być liczbą całkowitą od 0 do 180.');
      return;
    }

    setError(null);
    const remainingAfter = currentPlayer.remaining - score;
    if (remainingAfter === 0) {
      setPendingVisit({ stage: 'double', score });
      return;
    }
    if (remainingAfter < 0 || remainingAfter === 1) {
      setPendingVisit({ stage: 'darts', score, doubleConfirmed: false, outcome: 'bust' });
      return;
    }
    await sendVisit(score, 3, false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (inputValue.trim() === '') return;
    await beginScore(Number(inputValue));
  };

  const answerDouble = (confirmed: boolean) => {
    if (!pendingVisit || pendingVisit.stage !== 'double') return;
    setPendingVisit({
      stage: 'darts',
      score: pendingVisit.score,
      doubleConfirmed: confirmed,
      outcome: confirmed ? 'checkout' : 'bust',
    });
  };

  const handleUndo = async () => {
    if (!snapshot.can_undo) return;
    const undone = snapshot.visits.at(-1);
    await withLock(async () => {
      const next = await api.undoVisit(snapshot.game.id);
      setSnapshot(next);
      setPendingVisit(null);
      setRefereeMessage(undone ? `Cofnięto wizytę ${undone.declared_score}, ${undone.darts_used} lotki.` : 'Cofnięto ostatnią wizytę.');
    });
  };

  const handleExit = async () => {
    await withLock(onExit);
  };

  const handleVoiceCommand = async (rawCommand: string) => {
    const command = rawCommand.toLocaleLowerCase('pl-PL').trim();
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
    if (!busy && !pendingVisit && snapshot.game.status === 'active') inputRef.current?.focus();
  }, [busy, pendingVisit, snapshot.game.status]);

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
      {pendingVisit && (
        <div className="modal-backdrop" role="presentation">
          <section className="decision-modal" role="dialog" aria-modal="true" aria-labelledby="decision-title">
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
        <div className="match-brand"><Target aria-hidden="true" /><span>{snapshot.game.starting_score} · BO{snapshot.game.max_legs}</span></div>
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

      <section className="referee-strip" aria-live="polite">
        <div><span>Wirtualny sędzia</span><strong>{refereeMessage}</strong></div>
        <p>Leg {snapshot.game.current_leg} z maks. {snapshot.game.max_legs} · zaczynał {legStarter.name}</p>
      </section>

      {error && (
        <div className="match-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Zamknij">×</button></div>
      )}

      {winner && (
        <section className="winner-banner">
          <Trophy aria-hidden="true" />
          <div><p className="eyebrow">Koniec meczu</p><h1>Wygrywa {winner.name}</h1><span>{snapshot.players[0].legs} : {snapshot.players[1].legs}</span></div>
        </section>
      )}

      <section className="scoreboard">
        <PlayerBoard player={snapshot.players[0]} active={snapshot.game.current_player_id === snapshot.players[0].id} visits={visitsFor(snapshot.players[0].id)} />
        <div className="versus"><span>VS</span></div>
        <PlayerBoard player={snapshot.players[1]} active={snapshot.game.current_player_id === snapshot.players[1].id} visits={visitsFor(snapshot.players[1].id)} />
      </section>

      <section className="match-controls">
        {snapshot.game.status === 'active' ? (
          <>
            <div className="turn-caption"><span className="live-dot" /> Rzuca <strong>{currentPlayer?.name}</strong></div>
            <form onSubmit={handleSubmit} className="score-form">
              <label className="sr-only" htmlFor="visit-score">Wynik wizyty</label>
              <input
                ref={inputRef}
                id="visit-score"
                type="number"
                inputMode="numeric"
                min={0}
                max={180}
                step={1}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="0–180"
                disabled={busy || pendingVisit !== null}
                autoComplete="off"
              />
              <button className="button button-primary score-submit" type="submit" disabled={busy || pendingVisit !== null || inputValue.trim() === ''}>
                {busy ? <LoaderCircle className="spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                <span>Zapisz</span>
              </button>
            </form>
          </>
        ) : (
          <button className="button button-primary button-large" type="button" disabled={busy} onClick={handleExit}><Trophy aria-hidden="true" /> Wróć do panelu</button>
        )}

        <div className="secondary-controls">
          <button
            type="button"
            className={`button ${isListening ? 'button-danger' : 'button-secondary'}`}
            onClick={toggleListening}
            disabled={!voiceAvailable || busy || snapshot.game.status === 'finished'}
            title={voiceAvailable ? 'Komendy: „wynik 60”, „cofnij”' : 'Ta przeglądarka nie obsługuje rozpoznawania mowy'}
          >
            {isListening ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
            {isListening ? 'Nasłuchuję…' : voiceAvailable ? 'Mikrofon' : 'Brak mikrofonu'}
          </button>
          <button className="button button-secondary" type="button" disabled={busy || !snapshot.can_undo} onClick={handleUndo}>
            {busy ? <LoaderCircle className="spinner" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            Cofnij ostatnią wizytę
          </button>
        </div>
        <p className="voice-hint">Komendy po polsku: „wynik sześćdziesiąt”, „wynik 180”, „cofnij”.</p>
      </section>
    </main>
  );
}
