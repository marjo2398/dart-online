export interface SessionState {
  authenticated: boolean;
  csrf_token: string | null;
}

export interface Player {
  id: number;
  name: string;
  games_played: number;
  games_won: number;
  total_points: number;
  total_darts_thrown: number;
  count_100: number;
  count_140: number;
  count_180: number;
  hi_score: number;
  highest_checkout: number;
  best_leg_darts: number;
  created_at: string;
}

export interface MatchPlayerState {
  id: number;
  name: string;
  position: 1 | 2;
  remaining: number;
  legs: number;
  points: number;
  darts: number;
  average: number;
  highest_visit: number;
  current_leg_darts: number;
}

export interface Visit {
  id: number;
  game_id: number;
  leg_no: number;
  visit_no: number;
  player_id: number;
  declared_score: number;
  applied_score: number;
  darts_used: number;
  is_bust: boolean;
  is_checkout: boolean;
  created_at: string;
}

export interface GameState {
  id: number;
  player1_id: number;
  player2_id: number;
  winner_id: number | null;
  legs_to_win: number;
  starting_score: number;
  status: 'active' | 'finished';
  current_leg: number;
  max_legs: number;
  current_player_id: number | null;
  leg_starter_id: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface GameSnapshot {
  game: GameState;
  players: [MatchPlayerState, MatchPlayerState];
  visits: Visit[];
  can_undo: boolean;
}

export interface GameSummary {
  id: number;
  player1: MatchPlayerState;
  player2: MatchPlayerState;
  winner_id: number | null;
  legs_to_win: number;
  starting_score: number;
  status: 'active' | 'finished';
  current_leg: number;
  current_player_id: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  visit_count: number;
}

export interface DashboardData {
  players: Player[];
  active_games: GameSummary[];
  history: GameSummary[];
}
