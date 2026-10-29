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
import Devices from './components/Devices';
import GameSetup from './components/GameSetup';
import Profiles from './components/Profiles';
import { decisionNames, phaseNames } from './components/MatchManagement';
import WriteStatus, { useWriteState } from './components/WriteStatus';
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
        <b>{game.config.match.unit === 'sets' ? game.player1.sets : game.player1.legs} : {game.config.match.unit === 'sets' ? game.player2.sets : game.player2.legs}{game.config.match.unit === 'sets' ? ' sety' : ' legi'}</b>
        <div>
          <strong>{game.player2.name}</strong>
          <span>{game.player2.remaining}</span>
        </div>
      </div>
      <div className="game-card-meta">
        <span>{game.format_description}</span>
        <span>{phaseNames[game.operation_state]} · leg {game.current_leg} · {game.visit_count} wizyt</span>
      </div>
      <div className="game-card-actions">
        <button className="button button-primary" type="button" disabled={busy} onClick={() => onResume(game.id)}>
          <RotateCcw aria-hidden="true" /> Wznów
        </button>
        <button
          className="button button-danger-ghost button-icon"
          type="button"
          disabled={busy || game.visit_count > 0}
          onClick={() => onDelete(game.id)}
          title={game.visit_count > 0 ? "Historia jest chroniona — anuluj mecz w jego ekranie" : "Usuń pusty mecz"}
          aria-label={`Usuń mecz ${game.player1.name} kontra ${game.player2.name}`}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
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
  const writeState = useWriteState();
  const busyRef = useRef(false);


  const installDashboard = (data: DashboardData) => setDashboard(data);

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

  const handleOpenGame = async (id: number) => {
    await locked(async () => {
      setCurrentGame(await api.game(id));
    });
  };

  const handleDeleteGame = async (id: number) => {
    if (!window.confirm('Usunąć pusty mecz? Mecz z zapisaną historią można anulować na ekranie prowadzenia gry.')) return;
    await locked(async () => {
      const current = await api.game(id);
      await api.deleteGame(id, current.game.revision);
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
    return <DartGame key={currentGame.game.id} onRematch={setCurrentGame} initialSnapshot={currentGame} onExit={handleExitGame} onSessionExpired={() => { setSession(null); setCurrentGame(null); setDashboard(null); setError('Sesja wygasła. Zaloguj się ponownie; niezakończona operacja pozostaje do bezpiecznego ponowienia.'); }} />;
  }

  if (!dashboard) return <LoadingScreen />;



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

        <WriteStatus onRecovered={refreshDashboard} onAuthError={handleApiError} />
        {writeState === 'unknown' && <p className="sync-warning">Nowe zapisy wstrzymane do rozstrzygnięcia poprzedniej operacji.</p>}
        <Devices />

        <div className="dashboard-grid">
          <GameSetup players={dashboard.players} templates={dashboard.templates} busy={busy || writeState === 'unknown' || writeState === 'pending'} run={locked} onCreated={setCurrentGame} refresh={refreshDashboard} />
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

        <Profiles refreshDashboard={refreshDashboard} onOpenGame={handleOpenGame} />
      </div>
    </main>
  );
}
