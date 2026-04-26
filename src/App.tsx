import React, { useEffect, useState } from 'react';
import DartGame from './components/DartGame';
import { Player, Game, Throw } from './types';
import { Trophy, Users, PlusCircle, Play, RotateCcw } from 'lucide-react';

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [player1Id, setPlayer1Id] = useState<number | ''>('');
  const [player2Id, setPlayer2Id] = useState<number | ''>('');
  const [legsToWin, setLegsToWin] = useState<number>(3);
  const [startingScore, setStartingScore] = useState<number>(501);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameId, setGameId] = useState<number | null>(null);
  const [initialThrows, setInitialThrows] = useState<Throw[]>([]);
  const [resumedGameStartingScore, setResumedGameStartingScore] = useState<number>(501);
  const [resumedGameLegsToWin, setResumedGameLegsToWin] = useState<number>(3);
  const [isResumedGame, setIsResumedGame] = useState(false);

  useEffect(() => {
    fetchPlayers();
    fetchActiveGames();
  }, []);

  const fetchPlayers = async () => {
    try {
      const res = await fetch('/api/players');
      const data = await res.json();
      setPlayers(data);
    } catch (error) {
      console.error('Failed to fetch players', error);
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    try {
      await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlayerName.trim() }),
      });
      setNewPlayerName('');
      fetchPlayers();
    } catch (error) {
      console.error('Failed to add player', error);
    }
  };

  const handleStartGame = async () => {
    if (player1Id === '' || player2Id === '' || player1Id === player2Id) {
      alert('Wybierz dwóch różnych graczy!');
      return;
    }
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1_id: player1Id,
          player2_id: player2Id,
          legs_to_win: legsToWin,
          starting_score: startingScore,
        }),
      });
      const data = await res.json();
      setGameId(data.id);
      setGameStarted(true);
    } catch (error) {
      console.error('Failed to start game', error);
    }
  };

  const fetchActiveGames = async () => {
    try {
      const res = await fetch('/api/games/active');
      const data = await res.json();
      setActiveGames(data);
    } catch (error) {
      console.error('Failed to fetch active games', error);
    }
  };

  const handleResumeGame = async (game: Game) => {
    try {
      const res = await fetch(`/api/games/${game.id}`);
      const data = await res.json();
      setPlayer1Id(game.player1_id);
      setPlayer2Id(game.player2_id);
      setResumedGameLegsToWin(game.legs_to_win);
      setResumedGameStartingScore(game.starting_score || 501);
      setInitialThrows(data.throws || []);
      setGameId(game.id);
      setIsResumedGame(true);
      setGameStarted(true);
    } catch (error) {
      console.error('Failed to resume game', error);
    }
  };

  const handleGameEnd = () => {
    setGameStarted(false);
    setGameId(null);
    setInitialThrows([]);
    setIsResumedGame(false);
    fetchPlayers(); // Refresh stats
    fetchActiveGames();
  };

  if (gameStarted && gameId) {
    const p1 = players.find(p => p.id === player1Id);
    const p2 = players.find(p => p.id === player2Id);
    if (p1 && p2) {
      return <DartGame gameId={gameId} player1={p1} player2={p2} legsToWin={isResumedGame ? resumedGameLegsToWin : legsToWin} startingScore={isResumedGame ? resumedGameStartingScore : startingScore} initialThrows={initialThrows} onGameEnd={handleGameEnd} />;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-5xl font-black tracking-tight text-emerald-500 flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10" />
            DART 501
          </h1>
          <p className="text-zinc-400 font-medium">System Sędziowski Online</p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* New Game Setup */}
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Play className="w-6 h-6 text-emerald-500" />
              Nowa Gra
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Gracz 1</label>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={player1Id}
                  onChange={(e) => setPlayer1Id(Number(e.target.value))}
                >
                  <option value="">Wybierz gracza...</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Gracz 2</label>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={player2Id}
                  onChange={(e) => setPlayer2Id(Number(e.target.value))}
                >
                  <option value="">Wybierz gracza...</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Liczba wygranych legów (Best of)</label>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={legsToWin}
                  onChange={(e) => setLegsToWin(Number(e.target.value))}
                >
                  <option value={1}>1 Leg</option>
                  <option value={2}>Best of 3 (do 2 wygranych)</option>
                  <option value={3}>Best of 5 (do 3 wygranych)</option>
                  <option value={5}>Best of 9 (do 5 wygranych)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Punkty startowe</label>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={startingScore}
                  onChange={(e) => setStartingScore(Number(e.target.value))}
                >
                  <option value={301}>301</option>
                  <option value={501}>501</option>
                  <option value={701}>701</option>
                  <option value={901}>901</option>
                </select>
              </div>
              <button
                onClick={handleStartGame}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-colors mt-4"
              >
                Rozpocznij Mecz
              </button>
            </div>

            {activeGames.length > 0 && (
              <div className="mt-8">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-emerald-500" />
                  Wznów Grę
                </h3>
                <div className="space-y-3">
                  {activeGames.map(game => (
                    <div key={game.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex justify-between items-center">
                      <div>
                        <p className="font-bold">{game.player1_name} vs {game.player2_name}</p>
                        <p className="text-sm text-zinc-500">BO{game.legs_to_win * 2 - 1} • Od {game.starting_score || 501}</p>
                      </div>
                      <button
                        onClick={() => handleResumeGame(game)}
                        className="bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
                      >
                        Wznów
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Players Management */}
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-xl flex flex-col">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-500" />
              Zawodnicy
            </h2>
            
            <form onSubmit={handleAddPlayer} className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="Imię gracza..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
              />
              <button
                type="submit"
                className="bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-xl transition-colors flex items-center justify-center"
              >
                <PlusCircle className="w-6 h-6" />
              </button>
            </form>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {players.length === 0 ? (
                <p className="text-zinc-500 text-center py-4">Brak graczy. Dodaj pierwszego!</p>
              ) : (
                players.map(p => (
                  <div key={p.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">{p.name}</span>
                      <div className="text-sm font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">
                        Avg: {p.total_darts_thrown > 0 ? ((p.total_points / p.total_darts_thrown) * 3).toFixed(1) : '-'}
                      </div>
                    </div>
                    <div className="grid grid-cols-6 gap-2 text-xs text-zinc-400 text-center bg-zinc-900 p-2 rounded-lg">
                      <div>
                        <div className="text-zinc-500 mb-1">W/L</div>
                        <div className="text-white font-medium">{p.games_won} / {p.games_played}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-1">Win %</div>
                        <div className="text-white font-medium">{p.games_played > 0 ? ((p.games_won / p.games_played) * 100).toFixed(0) : 0}%</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-1">180s</div>
                        <div className="text-white font-medium">{p.count_180 || 0}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-1">Hi-Score</div>
                        <div className="text-white font-medium">{p.hi_score || 0}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-1">Hi-Check</div>
                        <div className="text-white font-medium">{p.highest_checkout || 0}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-1">Best Leg</div>
                        <div className="text-white font-medium">{p.best_leg_darts || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
