import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  History,
  LoaderCircle,
  LogOut,
  Plus,
  Play,
  RotateCcw,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { ApiError, api, messageFrom } from './api';
import DartGame from './components/DartGame';
import type { DashboardData, GameSnapshot, GameSummary, Player, SessionState } from './types';

const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function average(player: Player): string {
  if (player.total_darts_thrown === 0) return '—';
  return ((player.total_points / player.total_darts_thrown) * 3).toFixed(1);
}

function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <AlertTriangle aria-hidden="true" />
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Zamknij komunikat">
          ×
        </button>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="center-screen">
      <LoaderCircle className="spinner" aria-hidden="true" />
      <p>Łączenie z systemem sędziowskim…</p>
    </main>
  );
}

function LoginScreen({
  busy,
  error,
  onLogin,
}: {
  busy: boolean;
  error: string | null;
  onLogin: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    await onLogin(password);
    setPassword('');
  };

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark"><Target aria-hidden="true" /></div>
        <p className="eyebrow">Dart Online</p>
        <h1 id="login-title">Stół sędziowski</h1>
        <p className="muted">Zaloguj się PIN-em lub hasłem ustawionym przez administratora.</p>
        {error && <ErrorNotice message={error} />}
        <form onSubmit={submit} className="login-form">
          <label htmlFor="password">PIN lub hasło</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            autoFocus
          />
          <button className="button button-primary button-large" type="submit" disabled={busy || !password}>
            {busy ? <LoaderCircle className="spinner" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            {busy ? 'Logowanie…' : 'Wejdź do aplikacji'}
          </button>
        </form>
      </section>
    </main>
  );
}

function GameCard({
  game,
  busy,
  onResume,
  onDelete,
}: {
  game: GameSummary;
  busy: boolean;
  onResume: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  return (
    <article className="game-card">
      <div className="game-card-score">
        <div>
          <strong>{game.player1.name}</strong>
          <span>{game.player1.remaining}</span>
        </div>
        <b>{game.player1.legs} : {game.player2.legs}</b>
        <div>
          <strong>{game.player2.name}</strong>
          <span>{game.player2.remaining}</span>
        </div>
      </div>
      <div className="game-card-meta">
        <span>{game.starting_score} · do {game.legs_to_win} legów</span>
        <span>Leg {game.current_leg} · {game.visit_count} wizyt</span>
      </div>
      <div className="game-card-actions">
        <button className="button button-primary" type="button" disabled={busy} onClick={() => onResume(game.id)}>
          <RotateCcw aria-hidden="true" /> Wznów
        </button>
        <button
          className="button button-danger-ghost button-icon"
          type="button"
          disabled={busy}
          onClick={() => onDelete(game.id)}
          title="Usuń mecz"
          aria-label={`Usuń mecz ${game.player1.name} kontra ${game.player2.name}`}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function PlayerCard({ player, busy, onDelete }: { player: Player; busy: boolean; onDelete: (id: number) => Promise<void> }) {
  const winRate = player.games_played > 0 ? Math.round((player.games_won / player.games_played) * 100) : 0;
  return (
    <article className="player-card">
      <div className="player-card-heading">
        <div>
          <h3>{player.name}</h3>
          <span>{player.games_won} wygranych z {player.games_played} · {winRate}%</span>
        </div>
        <strong>{average(player)} <small>AVG</small></strong>
        <button
          type="button"
          className="icon-link danger"
          disabled={busy}
          onClick={() => onDelete(player.id)}
          title="Usuń zawodnika"
          aria-label={`Usuń zawodnika ${player.name}`}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      <dl className="stat-grid">
        <div><dt>100–139</dt><dd>{player.count_100}</dd></div>
        <div><dt>140–179</dt><dd>{player.count_140}</dd></div>
        <div><dt>180</dt><dd>{player.count_180}</dd></div>
        <div><dt>Najwyższa</dt><dd>{player.hi_score}</dd></div>
        <div><dt>Checkout</dt><dd>{player.highest_checkout || '—'}</dd></div>
        <div><dt>Najlepszy leg</dt><dd>{player.best_leg_darts ? `${player.best_leg_darts} lot.` : '—'}</dd></div>
      </dl>
    </article>
  );
}

function HistoryRow({ game, busy, onOpen, onDelete }: {
  game: GameSummary;
  busy: boolean;
  onOpen: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const winner = game.winner_id === game.player1.id ? game.player1 : game.player2;
  return (
    <article className="history-row">
      <div className="history-icon"><Trophy aria-hidden="true" /></div>
      <div className="history-main">
        <strong>{game.player1.name} <span>{game.player1.legs}</span> : <span>{game.player2.legs}</span> {game.player2.name}</strong>
        <small>Wygrywa {winner.name} · {game.starting_score} · BO{game.legs_to_win * 2 - 1}</small>
      </div>
      <time dateTime={game.finished_at ?? undefined}>{formatDate(game.finished_at ?? game.updated_at)}</time>
      <button type="button" className="icon-link" disabled={busy} onClick={() => onOpen(game.id)} title="Otwórz mecz" aria-label="Otwórz szczegóły meczu">
        <ChevronRight aria-hidden="true" />
      </button>
      <button type="button" className="icon-link danger" disabled={busy} onClick={() => onDelete(game.id)} title="Usuń mecz" aria-label="Usuń mecz z historii">
        <Trash2 aria-hidden="true" />
      </button>
    </article>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<SessionState | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [currentGame, setCurrentGame] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [player1Id, setPlayer1Id] = useState<number | ''>('');
  const [player2Id, setPlayer2Id] = useState<number | ''>('');
  const [legsToWin, setLegsToWin] = useState(2);
  const [startingScore, setStartingScore] = useState(501);

  const installDashboard = (data: DashboardData) => {
    setDashboard(data);
    const ids = new Set(data.players.map((player) => player.id));
    setPlayer1Id((current) => (current !== '' && ids.has(current) ? current : (data.players[0]?.id ?? '')));
    setPlayer2Id((current) => {
      if (current !== '' && ids.has(current)) return current;
      return data.players.find((player) => player.id !== data.players[0]?.id)?.id ?? '';
    });
  };

  const handleApiError = (caught: unknown) => {
    if (caught instanceof ApiError && (caught.status === 401 || caught.code === 'invalid-csrf-token')) {
      setSession({ authenticated: false, csrf_token: null });
      setDashboard(null);
      setCurrentGame(null);
    }
    setError(messageFrom(caught));
  };

  const locked = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      handleApiError(caught);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const refreshDashboard = async () => {
    const data = await api.dashboard();
    installDashboard(data);
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const nextSession = await api.session();
        if (!active) return;
        setSession(nextSession);
        if (nextSession.authenticated) {
          const data = await api.dashboard();
          if (active) installDashboard(data);
        }
      } catch (caught) {
        if (active) handleApiError(caught);
      } finally {
        if (active) setBooting(false);
      }
    };
    boot().catch((caught) => {
      if (active) {
        handleApiError(caught);
        setBooting(false);
      }
    });
    return () => { active = false; };
  }, []);

  const handleLogin = async (password: string) => {
    await locked(async () => {
      const nextSession = await api.login(password);
      const data = await api.dashboard();
      setSession(nextSession);
      installDashboard(data);
    });
  };

  const handleLogout = async () => {
    await locked(async () => {
      const nextSession = await api.logout();
      setSession(nextSession);
      setDashboard(null);
      setCurrentGame(null);
    });
  };

  const handleAddPlayer = async (event: FormEvent) => {
    event.preventDefault();
    const name = newPlayerName.trim();
    if (!name) return;
    await locked(async () => {
      await api.createPlayer(name);
      setNewPlayerName('');
      await refreshDashboard();
    });
  };

  const handleDeletePlayer = async (id: number) => {
    const player = dashboard?.players.find((candidate) => candidate.id === id);
    if (!player || !window.confirm(`Usunąć zawodnika „${player.name}”? Znikną też wszystkie jego mecze i wizyty. Tej operacji nie można cofnąć.`)) return;
    await locked(async () => {
      await api.deletePlayer(id);
      await refreshDashboard();
    });
  };

  const handleStartGame = async () => {
    if (player1Id === '' || player2Id === '' || player1Id === player2Id) {
      setError('Wybierz dwóch różnych zawodników.');
      return;
    }
    await locked(async () => {
      const snapshot = await api.createGame(player1Id, player2Id, legsToWin, startingScore);
      setCurrentGame(snapshot);
    });
  };

  const handleOpenGame = async (id: number) => {
    await locked(async () => {
      setCurrentGame(await api.game(id));
    });
  };

  const handleDeleteGame = async (id: number) => {
    if (!window.confirm('Usunąć ten mecz wraz ze wszystkimi wizytami? Statystyki zostaną przeliczone.')) return;
    await locked(async () => {
      await api.deleteGame(id);
      await refreshDashboard();
    });
  };

  const handleExitGame = async () => {
    await locked(async () => {
      await refreshDashboard();
      setCurrentGame(null);
    });
  };

  if (booting) return <LoadingScreen />;

  if (!session?.authenticated) {
    return <LoginScreen busy={busy} error={error} onLogin={handleLogin} />;
  }

  if (currentGame) {
    return <DartGame initialSnapshot={currentGame} onExit={handleExitGame} />;
  }

  if (!dashboard) return <LoadingScreen />;

  const enoughPlayers = dashboard.players.length >= 2;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark small"><Target aria-hidden="true" /></div>
          <div><strong>Dart Online</strong><span>system sędziowski</span></div>
        </div>
        <button className="button button-ghost" type="button" disabled={busy} onClick={handleLogout}>
          <LogOut aria-hidden="true" /> Wyloguj
        </button>
      </header>

      <div className="dashboard-layout">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Turniej gotowy</p>
            <h1>Game on.</h1>
            <p>Dwóch zawodników, pełna historia i sędzia pilnujący każdej wizyty.</p>
          </div>
          <Trophy aria-hidden="true" />
        </section>

        {error && <ErrorNotice message={error} onDismiss={() => setError(null)} />}

        <div className="dashboard-grid">
          <section className="panel new-game-panel" aria-labelledby="new-game-title">
            <div className="section-heading">
              <div><Play aria-hidden="true" /><div><p className="eyebrow">Mecz</p><h2 id="new-game-title">Nowa gra</h2></div></div>
              <span className="status-dot">Double out</span>
            </div>

            {!enoughPlayers && (
              <div className="empty-inline"><Users aria-hidden="true" /><span>Dodaj co najmniej dwóch zawodników, aby rozpocząć.</span></div>
            )}

            <div className="form-grid">
              <label>
                Zawodnik 1 · zaczyna pierwszy leg
                <select value={player1Id} disabled={busy || !enoughPlayers} onChange={(event) => setPlayer1Id(event.target.value ? Number(event.target.value) : '')}>
                  <option value="">Wybierz zawodnika</option>
                  {dashboard.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </select>
              </label>
              <label>
                Zawodnik 2
                <select value={player2Id} disabled={busy || !enoughPlayers} onChange={(event) => setPlayer2Id(event.target.value ? Number(event.target.value) : '')}>
                  <option value="">Wybierz zawodnika</option>
                  {dashboard.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </select>
              </label>
              <label>
                Punkty startowe
                <select value={startingScore} disabled={busy} onChange={(event) => setStartingScore(Number(event.target.value))}>
                  {[301, 501, 701, 901].map((score) => <option key={score} value={score}>{score}</option>)}
                </select>
              </label>
              <label>
                Format meczu
                <select value={legsToWin} disabled={busy} onChange={(event) => setLegsToWin(Number(event.target.value))}>
                  <option value={1}>1 leg</option>
                  <option value={2}>Best of 3 · do 2</option>
                  <option value={3}>Best of 5 · do 3</option>
                  <option value={5}>Best of 9 · do 5</option>
                </select>
              </label>
            </div>
            <button className="button button-primary button-large full-width" type="button" disabled={busy || !enoughPlayers} onClick={handleStartGame}>
              {busy ? <LoaderCircle className="spinner" aria-hidden="true" /> : <Play aria-hidden="true" />}
              Rozpocznij mecz
            </button>
          </section>

          <section className="panel active-games-panel" aria-labelledby="active-games-title">
            <div className="section-heading">
              <div><RotateCcw aria-hidden="true" /><div><p className="eyebrow">W toku</p><h2 id="active-games-title">Aktywne mecze</h2></div></div>
              <span className="counter">{dashboard.active_games.length}</span>
            </div>
            {dashboard.active_games.length === 0 ? (
              <div className="empty-state"><Target aria-hidden="true" /><strong>Brak rozpoczętych meczów</strong><span>Nowa gra pojawi się tutaj automatycznie.</span></div>
            ) : (
              <div className="game-list">
                {dashboard.active_games.map((game) => (
                  <GameCard key={game.id} game={game} busy={busy} onResume={handleOpenGame} onDelete={handleDeleteGame} />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="panel players-panel" aria-labelledby="players-title">
          <div className="section-heading section-heading-wrap">
            <div><Users aria-hidden="true" /><div><p className="eyebrow">Ranking lokalny</p><h2 id="players-title">Zawodnicy i statystyki</h2></div></div>
            <form className="inline-form" onSubmit={handleAddPlayer}>
              <label className="sr-only" htmlFor="new-player">Nazwa nowego zawodnika</label>
              <input id="new-player" type="text" maxLength={40} value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Nazwa zawodnika" disabled={busy} />
              <button className="button button-secondary" type="submit" disabled={busy || !newPlayerName.trim()}><Plus aria-hidden="true" /> Dodaj</button>
            </form>
          </div>
          {dashboard.players.length === 0 ? (
            <div className="empty-state compact"><Users aria-hidden="true" /><strong>Jeszcze nikogo tu nie ma</strong><span>Dodaj pierwszego zawodnika powyżej.</span></div>
          ) : (
            <div className="players-grid">
              {dashboard.players.map((player) => <PlayerCard key={player.id} player={player} busy={busy} onDelete={handleDeletePlayer} />)}
            </div>
          )}
        </section>

        <section className="panel history-panel" aria-labelledby="history-title">
          <div className="section-heading">
            <div><History aria-hidden="true" /><div><p className="eyebrow">Archiwum</p><h2 id="history-title">Historia meczów</h2></div></div>
            <span className="history-caption"><CalendarDays aria-hidden="true" /> Ostatnie 50</span>
          </div>
          {dashboard.history.length === 0 ? (
            <div className="empty-state compact"><History aria-hidden="true" /><strong>Brak zakończonych meczów</strong><span>Wynik pierwszego meczu zapisze się tutaj.</span></div>
          ) : (
            <div className="history-list">
              {dashboard.history.map((game) => <HistoryRow key={game.id} game={game} busy={busy} onOpen={handleOpenGame} onDelete={handleDeleteGame} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
