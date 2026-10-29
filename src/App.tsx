import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, History, LoaderCircle, Play, Plus, RotateCcw, Target, Trash2, Users, Link as LinkIcon } from 'lucide-react';
import { api, messageFrom } from './api';
import { originLabel } from './presentation';
import DartGame from './components/DartGame';
import Devices from './components/Devices';
import GameSetup from './components/GameSetup';
import Profiles from './components/Profiles';
import { phaseNames } from './components/MatchManagement';
import WriteStatus, { useWriteState } from './components/WriteStatus';
import type { DashboardData, GameSnapshot, GameSummary } from './types';

type Page = 'home' | 'setup' | 'games' | 'profiles' | 'connections';
const pages: { id: Page; label: string; icon: typeof Target }[] = [
  { id: 'home', label: 'Start', icon: Target }, { id: 'setup', label: 'Nowa gra', icon: Plus },
  { id: 'games', label: 'Wznów i historia', icon: History }, { id: 'profiles', label: 'Gracze i statystyki', icon: Users },
  { id: 'connections', label: 'Połączenia', icon: LinkIcon },
];
function GameCard({ game, busy, onResume, onDelete }: { game: GameSummary; busy: boolean; onResume: (id: number) => Promise<void>; onDelete: (id: number) => Promise<void> }) {
  return <article className="game-card">
    <div className="game-card-score"><div><strong>{game.player1.name}</strong><span>{game.player1.remaining}</span></div>
      <b>{game.config.match.unit === 'sets' ? game.player1.sets : game.player1.legs} : {game.config.match.unit === 'sets' ? game.player2.sets : game.player2.legs}<small>{game.config.match.unit === 'sets' ? 'sety' : 'legi'}</small></b>
      <div><strong>{game.player2.name}</strong><span>{game.player2.remaining}</span></div></div>
    <div className="game-card-meta"><span>{game.format_description}</span><span>{phaseNames[game.operation_state]} · leg {game.current_leg} · {game.visit_count} wizyt</span><span>{originLabel(game)}</span></div>
    <div className="game-card-actions"><button className="button button-primary" disabled={busy} onClick={() => onResume(game.id)}><RotateCcw aria-hidden="true" />{game.origin?.read_only ? 'Otwórz archiwum' : 'Wznów'}</button>
      <button className="button button-danger-ghost button-icon" disabled={busy || game.visit_count > 0 || game.origin?.read_only} onClick={() => onDelete(game.id)} title="Usuń wyłącznie pusty mecz" aria-label={`Usuń pusty mecz ${game.player1.name} kontra ${game.player2.name}`}><Trash2 aria-hidden="true" /></button></div>
  </article>;
}
export default function App() {
  const [booting, setBooting] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [currentGame, setCurrentGame] = useState<GameSnapshot | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const writeState = useWriteState(); const busyRef = useRef(false);
  const navigationRef = useRef(0); const bootRef = useRef(0);
  const refreshDashboard = async () => setDashboard(await api.dashboard());
  const locked = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await operation(); } catch (caught) { setError(messageFrom(caught)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const restoreLocation = async () => {
    const generation = ++navigationRef.current;
    const id = Number(new URLSearchParams(window.location.hash.slice(1)).get('game'));
    if (Number.isSafeInteger(id) && id > 0) {
      const game = await api.game(id);
      if (generation === navigationRef.current) setCurrentGame(game);
    } else if (generation === navigationRef.current) setCurrentGame(null);
  };
  const boot = async () => {
    const generation = ++bootRef.current;
    setBooting(true); setError(null);
    try {
      const session = await api.session();
      if (session.access !== 'public') throw new Error('Serwer wymaga aktualizacji obsługi publicznego WWW.');
      const data = await api.dashboard();
      if (generation !== bootRef.current) return;
      setDashboard(data);
      await restoreLocation();
    } catch (caught) { if (generation === bootRef.current) setError(messageFrom(caught)); }
    finally { if (generation === bootRef.current) setBooting(false); }
  };
  useEffect(() => {
    void boot();
    const navigateHash = () => { setCurrentGame(null); void locked(restoreLocation); };
    window.addEventListener('hashchange',navigateHash);
    return () => { bootRef.current++; navigationRef.current++; window.removeEventListener('hashchange',navigateHash); };
  }, []);
  const openSnapshot = (snapshot: GameSnapshot) => { navigationRef.current++; window.history.replaceState(null, '', `#game=${snapshot.game.id}`); setCurrentGame(snapshot); };
  const openGame = (id: number) => locked(async () => openSnapshot(await api.game(id)));
  const deleteGame = (id: number) => {
    if (!window.confirm('Usunąć pusty mecz? Historia zapisanych wizyt jest chroniona.')) return Promise.resolve();
    return locked(async () => { const game = await api.game(id); await api.deleteGame(id, game.game.revision); await refreshDashboard(); });
  };
  const navigate = (next: Page) => { setPage(next); setError(null); void locked(refreshDashboard); };
  const exitGame = async () => { navigationRef.current++; await refreshDashboard(); window.history.replaceState(null, '', window.location.pathname + window.location.search); setCurrentGame(null); setPage('games'); };
  if (booting) return <main className="center-screen"><LoaderCircle className="spinner" aria-hidden="true" /><p>Łączenie z Dart Lens…</p></main>;
  if (currentGame) return <DartGame key={currentGame.game.id} initialSnapshot={currentGame} onRematch={openSnapshot} onExit={exitGame} />;
  const errorNotice = error && <div className="error-notice" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span><button onClick={() => setError(null)} aria-label="Zamknij komunikat">×</button></div>;
  if (!dashboard) return <main className="center-screen"><Target /><h1>Dart Lens</h1>{errorNotice}<button className="button button-primary" onClick={() => void boot()}>Połącz ponownie</button></main>;
  const writesBlocked = busy || writeState === 'unknown' || writeState === 'pending';
  const resume = dashboard.active_games[0];
  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark small"><Target aria-hidden="true" /></div><div><strong>Dart Lens</strong><span>Wspólna gra · publiczny panel</span></div></div><span className="public-badge">Bez logowania</span></header>
    <nav className="app-nav" aria-label="Nawigacja aplikacji">{pages.map(({ id, label, icon: Icon }) => <button key={id} className={`button ${page === id ? 'button-selected' : 'button-ghost'}`} aria-current={page === id ? 'page' : undefined} disabled={busy} onClick={() => navigate(id)}><Icon aria-hidden="true" />{label}</button>)}</nav>
    <div className="dashboard-layout">{errorNotice}<WriteStatus onRecovered={refreshDashboard} onAuthError={e => setError(messageFrom(e))} />
      {page === 'home' && <>
        <section className="home-intro"><p className="eyebrow">Gotowi przy tarczy?</p><h1>Zagrajmy.</h1><p>Wybierz zawodników i rozpocznij mecz. Wynik, historia i profile są wspólne dla wszystkich korzystających z panelu.</p><button className="button button-primary button-large" onClick={() => navigate('setup')}><Plus aria-hidden="true" />Nowa gra</button></section>
        {resume && <section className="panel resume-panel"><div><p className="eyebrow">Wróć do gry</p><h2>{resume.player1.name} — {resume.player2.name}</h2><p>{phaseNames[resume.operation_state]} · leg {resume.current_leg}</p></div><button className="button button-primary" disabled={busy} onClick={() => void openGame(resume.id)}><Play aria-hidden="true" />Wznów</button></section>}
        <div className="home-tiles">{pages.slice(2).map(({ id, label, icon: Icon }) => <button className="panel home-tile" key={id} onClick={() => navigate(id)}><Icon aria-hidden="true" /><strong>{label}</strong><span>{id === 'games' ? `${dashboard.active_games.length} aktywnych meczów` : id === 'profiles' ? `${dashboard.players.length} aktywnych profili` : 'APK, kody i urządzenia'}</span></button>)}</div>
        <p className="muted">APK może prowadzić grę offline. W WWW widoczne są mecze serwera oraz jawnie zsynchronizowane dane telefonu.</p>
      </>}
      {page === 'setup' && <><button className="button button-ghost back-link" onClick={() => navigate('home')}><ArrowLeft />Start</button>{dashboard.players.length < 2 && <section className="panel"><p>Do nowej gry potrzebujesz dwóch aktywnych profili.</p><button className="button button-primary" onClick={() => navigate('profiles')}>Dodaj graczy</button></section>}<GameSetup players={dashboard.players} templates={dashboard.templates} busy={writesBlocked} run={locked} onCreated={openSnapshot} refresh={refreshDashboard} /></>}
      {page === 'games' && <><section className="panel"><div className="section-heading"><h2>Wznów grę</h2><span className="counter">{dashboard.active_games.length}</span></div>{dashboard.active_games.length ? <div className="game-list">{dashboard.active_games.map(game => <GameCard key={game.id} game={game} busy={writesBlocked} onResume={openGame} onDelete={deleteGame} />)}</div> : <p className="muted">Brak aktywnych meczów. Zakończone znajdziesz w historii poniżej.</p>}</section><Profiles view="history" refreshDashboard={refreshDashboard} onOpenGame={openGame} /></>}
      {page === 'profiles' && <Profiles refreshDashboard={refreshDashboard} onOpenGame={openGame} />}
      {page === 'connections' && <><section className="panel"><h1>Połączenia z APK</h1><p>Przeglądarka działa publicznie. APK i urządzenia nadal wymagają własnej autoryzacji lub kodu z odpowiednią rolą. Kamera wyłącznie proponuje wynik.</p><p>Udostępnij mecz na telefonie i potwierdź przekazanie prowadzenia serwerowi. Synchronizacja zakończonego archiwum udostępnia historię do odczytu.</p></section><Devices /></>}
    </div>
  </main>;
}
