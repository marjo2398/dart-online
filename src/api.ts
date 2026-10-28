import type { DashboardData, Device, GameSnapshot, Player, SessionState, MatchConfig, MatchTemplate, HistoryChange, CorrectionPreview, CheckoutHints, MatchPermission } from './types';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
  }
}
export interface PendingCommand { action: string; body: Record<string, unknown>; created_at: string }
export type WriteState = 'idle' | 'pending' | 'saved' | 'rejected' | 'unknown';
const pendingKey = 'dart-online.pending-command.v3';
let csrfToken: string | null = null;
let inFlight = false;
let writeState: WriteState = 'idle';

export function pendingCommand(): PendingCommand | null {
  const value = sessionStorage.getItem(pendingKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PendingCommand;
    if (typeof parsed.action === 'string' && typeof parsed.body?.command_id === 'string') return parsed;
  } catch { /* Fail closed: never silently drop an unresolved write. */ }
  throw new ApiError(0, 'pending-storage-invalid', 'Nie można odczytać niezakończonej operacji. Zachowaj tę kartę i sprawdź historię meczu.');
}
export function currentWriteState(): WriteState {
  return pendingCommand() && !inFlight ? 'unknown' : writeState;
}
function announce(state: WriteState) {
  writeState = state;
  window.dispatchEvent(new Event('dart-write-state'));
}
function endpoint(action: string, query?: Record<string, string | number>): string {
  const url = new URL('./api/index.php', window.location.href);
  url.searchParams.set('action', action);
  Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

async function request<T>(action: string, options: {
  method?: 'GET' | 'POST'; body?: Record<string, unknown>;
  query?: Record<string, string | number>; signal?: AbortSignal;
} = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const requestCsrfToken = csrfToken;
  const headers = new Headers({ Accept: 'application/json' });
  headers.set('X-Dart-Formats', '1');
  headers.set('X-Dart-Operations', '2');
  if (method === 'POST') {
    headers.set('Content-Type', 'application/json');
    if (action !== 'login') {
      if (!csrfToken) throw new ApiError(403, 'missing-csrf-token', 'Sesja wygasła. Zaloguj się ponownie.');
      headers.set('X-CSRF-Token', csrfToken);
    }
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timeout = window.setTimeout(cancel, 8000);
  try {
    const response = await fetch(endpoint(action, options.query), {
      method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: controller.signal,
      body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
    });
    let payload: any;
    try { payload = await response.json(); }
    catch { throw new ApiError(response.status, 'invalid-response', 'Nie udało się odczytać odpowiedzi serwera.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.ok !== 'boolean') {
      throw new ApiError(response.status, 'invalid-response', 'Serwer zwrócił nieprawidłową odpowiedź.');
    }
    if (!response.ok || payload.ok !== true) {
      const error = payload.error ?? { code: 'request-failed', message: 'Operacja nie powiodła się.' };
      if (response.status === 401 && csrfToken === requestCsrfToken) csrfToken = null;
      throw new ApiError(response.status, error.code, error.message, error.details);
    }
    return payload.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'network-error', 'Brak odpowiedzi API. Ostatni wynik może być nieaktualny.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
function ambiguous(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.code === 'invalid-response';
}
async function execute<T>(command: PendingCommand): Promise<T> {
  if (inFlight) throw new ApiError(409, 'write-pending', 'Poczekaj na zakończenie zapisu.');
  inFlight = true;
  announce('pending');
  try {
    const result = await request<T>(command.action, { method: 'POST', body: command.body });
    sessionStorage.removeItem(pendingKey);
    announce('saved');
    return result;
  } catch (error) {
    // Expired auth on a retry cannot establish whether the first attempt committed.
    if (ambiguous(error) || (error instanceof ApiError && [401, 403].includes(error.status))) {
      announce('unknown');
    } else {
      sessionStorage.removeItem(pendingKey);
      announce('rejected');
    }
    throw error;
  } finally { inFlight = false; window.dispatchEvent(new Event('dart-write-state')); }
}
async function mutate<T>(action: string, body: Record<string, unknown>, revision = 0): Promise<T> {
  if (pendingCommand() || inFlight) throw new ApiError(409, 'unresolved-command', 'Najpierw sprawdź poprzednią operację przyciskiem „Ponów ten sam zapis”.');
  const command = { action, body: { ...body, command_id: crypto.randomUUID(), expected_revision: revision }, created_at: new Date().toISOString() };
  // Persist before transmitting. Storage failure prevents an unsafe write.
  sessionStorage.setItem(pendingKey, JSON.stringify(command));
  return execute<T>(command);
}
export async function retryPending(): Promise<unknown> {
  const command = pendingCommand();
  return command ? execute(command) : null;
}
function remember(session: SessionState): SessionState { csrfToken = session.csrf_token; return session; }

export const api = {
  remaining(gameId: number, playerId: number, remaining: number, dartsUsed: number, doubleConfirmed: boolean, zeroConfirmed: boolean, revision: number): Promise<GameSnapshot> {
    return mutate('remaining-create', { game_id: gameId, player_id: playerId, remaining, darts_used: dartsUsed, double_confirmed: doubleConfirmed, zero_visit_confirmed: zeroConfirmed }, revision);
  },
  hints(gameId: number, preferred: string): Promise<CheckoutHints> { return request('checkout-hints', { query: { game_id: gameId, preferred_double: preferred } }); },
  historyPreview(gameId: number, change: HistoryChange, revision: number): Promise<CorrectionPreview> {
    return request('history-preview', { method: 'POST', body: { game_id: gameId, ...change, expected_revision: revision } });
  },
  historyApply(gameId: number, change: HistoryChange, previewToken: string, revision: number): Promise<GameSnapshot> {
    return mutate('history-apply', { game_id: gameId, ...change, preview_token: previewToken }, revision);
  },
  matchOperation(action: 'game-pause' | 'game-resume' | 'game-adjudicate' | 'result-confirm' | 'result-reopen', gameId: number, revision: number, body: Record<string, unknown> = {}): Promise<GameSnapshot> {
    return mutate(action, { game_id: gameId, ...body }, revision);
  },
  rematch(gameId: number, revision: number, swapSides: boolean, method: MatchConfig['starters']['method'], player: number): Promise<GameSnapshot> {
    return mutate('game-rematch', { game_id: gameId, swap_sides: swapSides, starter_method: method, starter_player: player }, revision);
  },
  previewFormat(config: MatchConfig): Promise<{ description: string; legacy_compatible: boolean }> {
    return request('format-preview', { method: 'POST', body: { config } });
  },
  createConfiguredGame(player1Id: number, player2Id: number, config: MatchConfig): Promise<GameSnapshot> {
    return mutate('game-create', { player1_id: player1Id, player2_id: player2Id, config });
  },
  saveTemplate(name: string, config: MatchConfig, favorite: boolean, template?: MatchTemplate): Promise<{ templates: MatchTemplate[] }> {
    return mutate('template-save', { name, config, favorite, ...(template ? { template_id: template.id, template_revision: template.revision } : {}) });
  },
  deleteTemplate(template: MatchTemplate): Promise<{ templates: MatchTemplate[] }> {
    return mutate('template-delete', { template_id: template.id, template_revision: template.revision });
  },
  selectStarter(gameId: number, playerId: number, revision: number): Promise<GameSnapshot> {
    return mutate('starter-select', { game_id: gameId, player_id: playerId }, revision);
  },
  async session(): Promise<SessionState> { return remember(await request('session')); },
  async login(password: string): Promise<SessionState> { return remember(await request('login', { method: 'POST', body: { password } })); },
  async logout(): Promise<SessionState> { return remember(await request('logout', { method: 'POST' })); },
  dashboard(): Promise<DashboardData> { return request('dashboard'); },
  createPlayer(name: string): Promise<Player> { return mutate('player-create', { name }); },
  deletePlayer(playerId: number): Promise<{ deleted: true; id: number; name: string }> { return mutate('player-delete', { player_id: playerId }); },
  createGame(player1Id: number, player2Id: number, legsToWin: number, startingScore: number): Promise<GameSnapshot> {
    return mutate('game-create', { player1_id: player1Id, player2_id: player2Id, legs_to_win: legsToWin, starting_score: startingScore });
  },
  game(gameId: number, signal?: AbortSignal): Promise<GameSnapshot> { return request('game', { query: { id: gameId }, signal }); },
  recordVisit(gameId: number, playerId: number, score: number, dartsUsed: number, doubleConfirmed: boolean, revision: number): Promise<GameSnapshot> {
    return mutate('visit-create', { game_id: gameId, player_id: playerId, score, darts_used: dartsUsed, double_confirmed: doubleConfirmed }, revision);
  },
  dart(gameId: number, playerId: number, field: string, revision: number): Promise<GameSnapshot> {
    return mutate('dart-create', { game_id: gameId, player_id: playerId, field }, revision);
  },
  correctDart(gameId: number, dartId: string, field: string, revision: number): Promise<GameSnapshot> {
    return mutate('dart-correct', { game_id: gameId, dart_id: dartId, field }, revision);
  },
  correctVisit(gameId: number, visitId: number, score: number, dartsUsed: number, doubleConfirmed: boolean, revision: number): Promise<GameSnapshot> {
    return mutate('visit-correct', { game_id: gameId, visit_id: visitId, score, darts_used: dartsUsed, double_confirmed: doubleConfirmed }, revision);
  },
  undoVisit(gameId: number, revision: number): Promise<GameSnapshot> { return mutate('visit-undo', { game_id: gameId }, revision); },
  deleteGame(gameId: number, revision: number): Promise<{ deleted: true; id: number }> { return mutate('game-delete', { game_id: gameId }, revision); },
  selectCamera(gameId: number, deviceId: string | null, revision: number): Promise<GameSnapshot> {
    return mutate('camera-select', { game_id: gameId, device_id: deviceId }, revision);
  },
  review(gameId: number, observationId: string, decision: 'accept' | 'reject', field: string, revision: number): Promise<GameSnapshot> {
    return mutate('observation-review', { game_id: gameId, observation_id: observationId, decision, ...(decision === 'accept' ? { field } : {}) }, revision);
  },
  devices(): Promise<{ devices: Device[] }> { return request('devices'); },
  pairCode(role: Device['role'], gameId: number | null, hours: number, permissions?: MatchPermission[]): Promise<{ code: string; expires_at: number; role: string; game_id: number | null }> {
    return mutate('device-code-create', { role, game_id: gameId, expires_hours: hours, ...(permissions ? { permissions } : {}) });
  },
  revoke(deviceId: string): Promise<unknown> { return mutate('device-revoke', { device_id: deviceId }); },
};
export function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Wystąpił nieoczekiwany błąd.';
}
