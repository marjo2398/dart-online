import type { DashboardData, GameSnapshot, Player, SessionState } from './types';

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken: string | null = null;

function endpoint(action: string, query?: Record<string, string | number>): string {
  const url = new URL('./api/index.php', window.location.href);
  url.searchParams.set('action', action);
  Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

function rememberSession(session: SessionState): SessionState {
  csrfToken = session.csrf_token;
  return session;
}

async function request<T>(
  action: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: Record<string, string | number> } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (method === 'POST') {
    headers.set('Content-Type', 'application/json');
    if (action !== 'login') {
      if (!csrfToken) {
        throw new ApiError(403, 'missing-csrf-token', 'Brak tokenu sesji. Odśwież stronę i zaloguj się ponownie.');
      }
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  let response: Response;
  try {
    response = await fetch(endpoint(action, options.query), {
      method,
      headers,
      credentials: 'same-origin',
      body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network-error', 'Nie można połączyć się z API. Sprawdź serwer i połączenie.');
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch {
    throw new ApiError(response.status, 'invalid-response', 'Serwer zwrócił nieprawidłową odpowiedź.');
  }

  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new ApiError(response.status, 'invalid-response', 'Serwer zwrócił nieprawidłową odpowiedź.');
  }

  const payload = decoded as ApiSuccess<T> | ApiFailure;

  if (!response.ok || payload.ok !== true) {
    const failure = payload as ApiFailure;
    const error = failure.error ?? { code: 'request-failed', message: 'Operacja nie powiodła się.' };
    if (response.status === 401 || response.status === 403) {
      csrfToken = null;
    }
    throw new ApiError(response.status, error.code, error.message, error.details);
  }

  return payload.data;
}

export const api = {
  async session(): Promise<SessionState> {
    return rememberSession(await request<SessionState>('session'));
  },

  async login(password: string): Promise<SessionState> {
    return rememberSession(await request<SessionState>('login', { method: 'POST', body: { password } }));
  },

  async logout(): Promise<SessionState> {
    const session = await request<SessionState>('logout', { method: 'POST' });
    return rememberSession(session);
  },

  dashboard(): Promise<DashboardData> {
    return request<DashboardData>('dashboard');
  },

  createPlayer(name: string): Promise<Player> {
    return request<Player>('player-create', { method: 'POST', body: { name } });
  },

  deletePlayer(playerId: number): Promise<{ deleted: true; id: number; name: string }> {
    return request('player-delete', { method: 'POST', body: { player_id: playerId } });
  },

  createGame(player1Id: number, player2Id: number, legsToWin: number, startingScore: number): Promise<GameSnapshot> {
    return request<GameSnapshot>('game-create', {
      method: 'POST',
      body: {
        player1_id: player1Id,
        player2_id: player2Id,
        legs_to_win: legsToWin,
        starting_score: startingScore,
      },
    });
  },

  game(gameId: number): Promise<GameSnapshot> {
    return request<GameSnapshot>('game', { query: { id: gameId } });
  },

  recordVisit(
    gameId: number,
    playerId: number,
    score: number,
    dartsUsed: number,
    doubleConfirmed: boolean,
  ): Promise<GameSnapshot> {
    return request<GameSnapshot>('visit-create', {
      method: 'POST',
      body: {
        game_id: gameId,
        player_id: playerId,
        score,
        darts_used: dartsUsed,
        double_confirmed: doubleConfirmed,
      },
    });
  },

  undoVisit(gameId: number): Promise<GameSnapshot> {
    return request<GameSnapshot>('visit-undo', { method: 'POST', body: { game_id: gameId } });
  },

  deleteGame(gameId: number): Promise<{ deleted: true; id: number }> {
    return request('game-delete', { method: 'POST', body: { game_id: gameId } });
  },
};

export function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Wystąpił nieoczekiwany błąd.';
}
