import React, { useState, useEffect, useRef } from 'react';
import { Player, Throw } from '../types';
import { Mic, MicOff, Undo2, ArrowRight, Trophy, Volume2, VolumeX } from 'lucide-react';

interface DartGameProps {
  gameId: number;
  player1: Player;
  player2: Player;
  legsToWin: number;
  startingScore: number;
  initialThrows?: Throw[];
  onGameEnd: () => void;
}

interface ThrowRecord {
  playerId: number;
  score: number;
  previousScore: number;
  isBust: boolean;
}

interface PlayerMatchStats {
  matchScore: number;
  matchDarts: number;
  wonLegsScore: number;
  wonLegsDarts: number;
  hiScore: number;
  legDarts: number;
}

export default function DartGame({ gameId, player1, player2, legsToWin, startingScore, initialThrows = [], onGameEnd }: DartGameProps) {
  const [p1Score, setP1Score] = useState(startingScore);
  const [p2Score, setP2Score] = useState(startingScore);
  const [p1Legs, setP1Legs] = useState(0);
  const [p2Legs, setP2Legs] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [history, setHistory] = useState<ThrowRecord[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [refereeMessage, setRefereeMessage] = useState('Rozpoczynamy mecz! Game on!');
  
  const [p1Stats, setP1Stats] = useState<PlayerMatchStats>({ matchScore: 0, matchDarts: 0, wonLegsScore: 0, wonLegsDarts: 0, hiScore: 0, legDarts: 0 });
  const [p2Stats, setP2Stats] = useState<PlayerMatchStats>({ matchScore: 0, matchDarts: 0, wonLegsScore: 0, wonLegsDarts: 0, hiScore: 0, legDarts: 0 });
  
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Modal for finishing leg
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [pendingCheckoutScore, setPendingCheckoutScore] = useState<number | null>(null);

  // Modal for double check
  const [pendingDoubleCheckScore, setPendingDoubleCheckScore] = useState<number | null>(null);

  // Voice recognition state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialThrows.length > 0) {
      reconstructGameState(initialThrows);
    }
  }, [initialThrows]);

  const reconstructGameState = (throws: Throw[]) => {
    let p1LegsCurrent = 0;
    let p2LegsCurrent = 0;
    let p1ScoreCurrent = startingScore;
    let p2ScoreCurrent = startingScore;
    let turnCurrent: 1 | 2 = 1;
    let p1MatchStats = { matchScore: 0, matchDarts: 0, wonLegsScore: 0, wonLegsDarts: 0, hiScore: 0, legDarts: 0 };
    let p2MatchStats = { matchScore: 0, matchDarts: 0, wonLegsScore: 0, wonLegsDarts: 0, hiScore: 0, legDarts: 0 };
    let currentHistory: ThrowRecord[] = [];

    throws.forEach(t => {
      const isPlayer1 = t.player_id === player1.id;
      const currentScore = isPlayer1 ? p1ScoreCurrent : p2ScoreCurrent;
      let newScore = currentScore - t.score;
      let isBust = false;
      let isLegWon = false;

      // Note: we're reconstructing, so we need to infer bust from DB data
      // In DB, if it's a bust, score is recorded as 0 but logically it was a bust
      // For accurate historical reconstruction, we assume a score of 0 might be a bust if it doesn't match a normal 0 throw,
      // but without is_bust flag in DB, we rely on standard logic
      if (newScore < 0 || newScore === 1) {
         isBust = true;
         newScore = currentScore;
      } else if (newScore === 0) {
         isLegWon = true;
      } else if (t.score === 0 && currentScore > 0) {
          // If score is 0 and it's not a bust, it's a miss
      }

      currentHistory.push({
        playerId: t.player_id,
        score: t.score,
        previousScore: currentScore,
        isBust
      });

      if (isPlayer1) {
        p1ScoreCurrent = newScore;
        p1MatchStats.matchScore += isBust ? 0 : t.score;
        p1MatchStats.matchDarts += t.darts_used;
        p1MatchStats.legDarts += t.darts_used;
        p1MatchStats.hiScore = Math.max(p1MatchStats.hiScore, t.score);
      } else {
        p2ScoreCurrent = newScore;
        p2MatchStats.matchScore += isBust ? 0 : t.score;
        p2MatchStats.matchDarts += t.darts_used;
        p2MatchStats.legDarts += t.darts_used;
        p2MatchStats.hiScore = Math.max(p2MatchStats.hiScore, t.score);
      }

      if (isLegWon) {
        if (isPlayer1) {
          p1LegsCurrent++;
          p1MatchStats.wonLegsScore += startingScore;
          p1MatchStats.wonLegsDarts += p1MatchStats.legDarts;
        } else {
          p2LegsCurrent++;
          p2MatchStats.wonLegsScore += startingScore;
          p2MatchStats.wonLegsDarts += p2MatchStats.legDarts;
        }

        // Reset for next leg
        p1ScoreCurrent = startingScore;
        p2ScoreCurrent = startingScore;
        p1MatchStats.legDarts = 0;
        p2MatchStats.legDarts = 0;
        currentHistory = [];
        // Loser starts next leg
        turnCurrent = isPlayer1 ? 2 : 1;
      } else {
        turnCurrent = isPlayer1 ? 2 : 1;
      }
    });

    setP1Score(p1ScoreCurrent);
    setP2Score(p2ScoreCurrent);
    setP1Legs(p1LegsCurrent);
    setP2Legs(p2LegsCurrent);
    setCurrentTurn(turnCurrent);
    setP1Stats(p1MatchStats);
    setP2Stats(p2MatchStats);
    setHistory(currentHistory);
    setRefereeMessage('Gra wznowiona. Game on!');
  };

  useEffect(() => {
    if (!voiceEnabled || !refereeMessage) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(refereeMessage);
      utterance.lang = 'pl-PL';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  }, [refereeMessage, voiceEnabled]);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = 'pl-PL';
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        handleVoiceCommand(command);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error !== 'no-speech') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        if (isListening) {
          recognition.start(); // Keep listening if it was intentionally started
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Simple number parser for Polish words
  const parsePolishNumber = (text: string): number | null => {
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) return num;

    // Very basic mapping for common dart scores if spoken as words
    const map: Record<string, number> = {
      'sto': 100, 'sto czterdzieści': 140, 'sto osiemdziesiąt': 180,
      'sześćdziesiąt': 60, 'dwadzieścia': 20, 'czterdzieści': 40,
      'osiemdziesiąt': 80, 'dziewięćdziesiąt': 90, 'pięćdziesiąt': 50,
      'zero': 0, 'pudło': 0
    };
    
    for (const [key, val] of Object.entries(map)) {
      if (text.includes(key)) return val;
    }
    
    return null;
  };

  const handleVoiceCommand = (command: string) => {
    console.log('Voice command:', command);
    
    if (command.includes('cofnij')) {
      handleUndo();
      return;
    }
    
    if (command.includes('następny') || command.includes('dalej')) {
      handleThrow(0);
      return;
    }

    if (command.includes('wynik')) {
      const scoreStr = command.replace('wynik', '').trim();
      const score = parsePolishNumber(scoreStr);
      if (score !== null && score >= 0 && score <= 180) {
        handleThrow(score);
      } else {
        setRefereeMessage(`Nie zrozumiałem wyniku: "${scoreStr}"`);
      }
    } else {
      // Try to parse just the number if they didn't say "wynik"
      const score = parsePolishNumber(command);
      if (score !== null && score >= 0 && score <= 180) {
        handleThrow(score);
      }
    }
  };

  const handleThrow = async (score: number) => {
    if (score < 0 || score > 180) {
      setRefereeMessage('Nieprawidłowy wynik (0-180)');
      return;
    }

    const currentPlayerId = currentTurn === 1 ? player1.id : player2.id;
    const currentScore = currentTurn === 1 ? p1Score : p2Score;
    
    let newScore = currentScore - score;
    let isBust = false;
    let isLegWon = false;

    if (newScore < 0 || newScore === 1) {
      isBust = true;
      newScore = currentScore; // Reset score
      setRefereeMessage('Bust! Za dużo punktów.');
    } else if (newScore === 0) {
      // Show modal instead of finishing immediately
      setPendingDoubleCheckScore(score);
      return; // Stop here, wait for modal
    } else {
      setRefereeMessage(getRefereeComment(score, newScore));
    }

    const actualScore = isBust ? 0 : score;
    submitThrow(score, actualScore, isBust, false, 3);
  };

  const handleDoubleCheckResponse = (isDouble: boolean) => {
    const score = pendingDoubleCheckScore!;
    setPendingDoubleCheckScore(null);

    if (isDouble) {
      setPendingCheckoutScore(score);
      setShowCheckoutModal(true);
    } else {
      setRefereeMessage('Bust! Brak podwójnej (Double).');
      submitThrow(score, 0, true, false, 3);
    }
  };

  const submitThrow = (score: number, actualScore: number, isBust: boolean, isLegWon: boolean, dartsUsed: number) => {
    const currentPlayerId = currentTurn === 1 ? player1.id : player2.id;
    const currentScore = currentTurn === 1 ? p1Score : p2Score;
    let newScore = isBust ? currentScore : currentScore - score;

    // Update stats
    if (currentTurn === 1) {
      setP1Stats(prev => ({
        ...prev,
        matchScore: prev.matchScore + actualScore,
        matchDarts: prev.matchDarts + dartsUsed,
        legDarts: prev.legDarts + dartsUsed,
        hiScore: Math.max(prev.hiScore, actualScore)
      }));
    } else {
      setP2Stats(prev => ({
        ...prev,
        matchScore: prev.matchScore + actualScore,
        matchDarts: prev.matchDarts + dartsUsed,
        legDarts: prev.legDarts + dartsUsed,
        hiScore: Math.max(prev.hiScore, actualScore)
      }));
    }

    // Save throw to DB (async, don't block UI)
    const payload: any = {
      game_id: gameId,
      player_id: currentPlayerId,
      score: actualScore, // If bust, actual scored points is 0
      darts_used: dartsUsed
    };

    if (isLegWon) {
      payload.checkout = score;
      payload.leg_darts = currentTurn === 1 ? p1Stats.legDarts + dartsUsed : p2Stats.legDarts + dartsUsed;
    }

    fetch('/api/throws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(console.error);

    // Update state
    setHistory(prev => [...prev, { playerId: currentPlayerId, score, previousScore: currentScore, isBust }]);
    
    if (currentTurn === 1) {
      setP1Score(newScore);
    } else {
      setP2Score(newScore);
    }

    if (isLegWon) {
      setRefereeMessage(`Koniec lega! Wygrywa ${currentTurn === 1 ? player1.name : player2.name}`);
      handleLegWin(currentTurn);
    } else {
      setCurrentTurn(currentTurn === 1 ? 2 : 1);
    }
    
    setInputValue('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleCheckoutSubmit = (dartsUsed: number) => {
    if (pendingCheckoutScore !== null) {
      submitThrow(pendingCheckoutScore, pendingCheckoutScore, false, true, dartsUsed);
    }
    setShowCheckoutModal(false);
    setPendingCheckoutScore(null);
  };

  const handleLegWin = (winnerTurn: 1 | 2) => {
    let newP1Legs = p1Legs;
    let newP2Legs = p2Legs;
    
    if (winnerTurn === 1) {
      newP1Legs++;
      setP1Legs(newP1Legs);
      setP1Stats(prev => ({
        ...prev,
        wonLegsScore: prev.wonLegsScore + startingScore,
        wonLegsDarts: prev.wonLegsDarts + prev.legDarts
      }));
    } else {
      newP2Legs++;
      setP2Legs(newP2Legs);
      setP2Stats(prev => ({
        ...prev,
        wonLegsScore: prev.wonLegsScore + startingScore,
        wonLegsDarts: prev.wonLegsDarts + prev.legDarts
      }));
    }

    if (newP1Legs >= legsToWin || newP2Legs >= legsToWin) {
      const winnerId = newP1Legs >= legsToWin ? player1.id : player2.id;
      finishGame(winnerId);
    } else {
      // Reset for next leg
      setTimeout(() => {
        setP1Score(startingScore);
        setP2Score(startingScore);
        setHistory([]);
        setP1Stats(prev => ({ ...prev, legDarts: 0 }));
        setP2Stats(prev => ({ ...prev, legDarts: 0 }));
        // Loser of the leg starts next leg (simplification, usually it alternates)
        setCurrentTurn(winnerTurn === 1 ? 2 : 1);
        setRefereeMessage('Nowy leg. Game on!');
      }, 3000);
    }
  };

  const finishGame = async (winnerId: number) => {
    setRefereeMessage('Koniec meczu!');
    try {
      await fetch(`/api/games/${gameId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner_id: winnerId })
      });
      setTimeout(() => {
        onGameEnd();
      }, 3000);
    } catch (error) {
      console.error('Failed to finish game', error);
    }
  };

  const handleUndo = async () => {
    if (history.length === 0) return;
    
    try {
      const res = await fetch(`/api/games/${gameId}/undo`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to undo throw on server');

      const lastThrow = history[history.length - 1];

      if (lastThrow.playerId === player1.id) {
        setP1Score(lastThrow.previousScore);
        setCurrentTurn(1);
        setP1Stats(prev => ({
          ...prev,
          matchScore: prev.matchScore - (lastThrow.isBust ? 0 : lastThrow.score),
          matchDarts: prev.matchDarts - 3,
          legDarts: prev.legDarts - 3,
        }));
      } else {
        setP2Score(lastThrow.previousScore);
        setCurrentTurn(2);
        setP2Stats(prev => ({
          ...prev,
          matchScore: prev.matchScore - (lastThrow.isBust ? 0 : lastThrow.score),
          matchDarts: prev.matchDarts - 3,
          legDarts: prev.legDarts - 3,
        }));
      }

      setHistory(prev => prev.slice(0, -1));
      setRefereeMessage('Cofnięto ostatni rzut.');

      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    } catch (error) {
      console.error(error);
      setRefereeMessage('Błąd cofania rzutu.');
    }
  };

  const getRefereeComment = (score: number, remaining: number) => {
    if (score === 180) return 'ONE HUNDRED AND EIGHTY!!!';
    if (score >= 140) return 'Brawo, świetny rzut!';
    if (score >= 100) return 'Dobra robota, ponad stówka.';
    if (score === 0) return 'Pudło...';
    
    if (remaining <= 40 && remaining % 2 === 0) {
      return `Zostało ${remaining}, potrzebny double ${remaining / 2}`;
    }
    if (remaining === 50) {
      return 'Zostało 50, Bullseye!';
    }
    
    return `Zostało ${remaining}.`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const score = parseInt(inputValue, 10);
    if (!isNaN(score)) {
      handleThrow(score);
    }
  };

  const p1History = history.filter(h => h.playerId === player1.id).slice(-2);
  const p2History = history.filter(h => h.playerId === player2.id).slice(-2);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-4 md:p-8 flex flex-col">
      {/* Double Check Modal */}
      {pendingDoubleCheckScore !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center">
            <h2 className="text-2xl font-black mb-6 text-center text-white">Czy ostatnia lotka trafiła w podwójne pole (Double)?</h2>
            <div className="flex gap-4 w-full justify-center">
              <button
                onClick={() => handleDoubleCheckResponse(true)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xl py-4 rounded-2xl transition-all"
              >
                Tak
              </button>
              <button
                onClick={() => handleDoubleCheckResponse(false)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xl py-4 rounded-2xl transition-all"
              >
                Nie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center">
            <h2 className="text-3xl font-black mb-2 text-center text-emerald-500">Koniec Lega!</h2>
            <p className="text-zinc-400 mb-8 text-center text-lg">Ile lotek potrzebowałeś na to trafienie?</p>

            <div className="flex gap-4 w-full justify-center">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  onClick={() => handleCheckoutSubmit(num)}
                  className="flex-1 bg-zinc-800 hover:bg-emerald-600 border border-zinc-700 hover:border-emerald-500 text-white font-bold text-2xl py-6 rounded-2xl transition-all hover:scale-105"
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header / Referee */}
      <div className="max-w-5xl mx-auto w-full mb-8 text-center relative">
        <div className="absolute right-0 top-0">
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`p-3 rounded-xl border transition-colors ${voiceEnabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}
            title={voiceEnabled ? "Wyłącz komentarz głosowy" : "Włącz komentarz głosowy"}
          >
            {voiceEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>
        <div className="text-zinc-400 font-medium mb-2">
          Leg {p1Legs + p2Legs + 1} z {legsToWin * 2 - 1}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl inline-block min-w-[300px]">
          <p className="text-emerald-500 font-mono text-sm uppercase tracking-widest mb-1">Wirtualny Sędzia</p>
          <p className="text-xl font-medium">{refereeMessage}</p>
        </div>
      </div>

      {/* Main Game Board */}
      <div className="max-w-5xl mx-auto w-full grid grid-cols-2 gap-4 md:gap-8 flex-1">
        {/* Player 1 */}
        <div className={`rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center border-2 transition-all duration-300 ${currentTurn === 1 ? 'bg-zinc-900 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)]' : 'bg-zinc-950 border-zinc-800 opacity-60'}`}>
          <h2 className="text-4xl md:text-5xl font-black mb-2 tracking-tight">{player1.name}</h2>
          <div className="flex items-center gap-2 text-zinc-400 mb-6 font-mono text-xl">
            Legi: <span className="text-white font-bold">{p1Legs}</span>
          </div>
          
          <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:text-sm text-zinc-400 mb-6 px-2 md:px-8">
            <div className="flex justify-between">
              <span>Średnia:</span>
              <span className="text-white font-mono">{p1Stats.matchDarts ? ((p1Stats.matchScore / p1Stats.matchDarts) * 3).toFixed(1) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>Śr. wygranych:</span>
              <span className="text-white font-mono">{p1Stats.wonLegsDarts ? ((p1Stats.wonLegsScore / p1Stats.wonLegsDarts) * 3).toFixed(1) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>Hi-Score:</span>
              <span className="text-white font-mono">{p1Stats.hiScore}</span>
            </div>
            <div className="flex justify-between">
              <span>Lotka:</span>
              <span className="text-white font-mono">{p1Stats.legDarts + 1}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-4 h-8 items-center justify-center">
            {p1History.map((h, i) => (
              <span key={i} className={`px-3 py-1 rounded font-mono text-sm ${h.isBust ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-300'}`}>
                {h.isBust ? 'BUST' : h.score}
              </span>
            ))}
          </div>

          <div className="text-[7rem] md:text-[11rem] leading-none font-black tracking-tighter font-mono">
            {p1Score}
          </div>
        </div>

        {/* Player 2 */}
        <div className={`rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center border-2 transition-all duration-300 ${currentTurn === 2 ? 'bg-zinc-900 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)]' : 'bg-zinc-950 border-zinc-800 opacity-60'}`}>
          <h2 className="text-4xl md:text-5xl font-black mb-2 tracking-tight">{player2.name}</h2>
          <div className="flex items-center gap-2 text-zinc-400 mb-6 font-mono text-xl">
            Legi: <span className="text-white font-bold">{p2Legs}</span>
          </div>
          
          <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:text-sm text-zinc-400 mb-6 px-2 md:px-8">
            <div className="flex justify-between">
              <span>Średnia:</span>
              <span className="text-white font-mono">{p2Stats.matchDarts ? ((p2Stats.matchScore / p2Stats.matchDarts) * 3).toFixed(1) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>Śr. wygranych:</span>
              <span className="text-white font-mono">{p2Stats.wonLegsDarts ? ((p2Stats.wonLegsScore / p2Stats.wonLegsDarts) * 3).toFixed(1) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>Hi-Score:</span>
              <span className="text-white font-mono">{p2Stats.hiScore}</span>
            </div>
            <div className="flex justify-between">
              <span>Lotka:</span>
              <span className="text-white font-mono">{p2Stats.legDarts + 1}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-4 h-8 items-center justify-center">
            {p2History.map((h, i) => (
              <span key={i} className={`px-3 py-1 rounded font-mono text-sm ${h.isBust ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-300'}`}>
                {h.isBust ? 'BUST' : h.score}
              </span>
            ))}
          </div>

          <div className="text-[7rem] md:text-[11rem] leading-none font-black tracking-tighter font-mono">
            {p2Score}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-2xl mx-auto w-full mt-8">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <input
            ref={inputRef}
            type="number"
            min="0"
            max="180"
            className="flex-1 bg-zinc-900 border-2 border-zinc-800 rounded-2xl p-6 text-4xl text-center font-mono focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
            placeholder="Wpisz wynik..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl px-8 flex items-center justify-center transition-colors"
          >
            <ArrowRight className="w-10 h-10" />
          </button>
        </form>

        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={toggleListening}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${isListening ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}`}
          >
            {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
            {isListening ? 'Nasłuchuję...' : 'Sterowanie Głosem'}
          </button>

          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="w-5 h-5" />
            Cofnij
          </button>
        </div>
      </div>
    </div>
  );
}
