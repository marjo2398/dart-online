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
  mode: 'aggregate' | 'darts';
  is_complete: boolean;
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
  revision: number;
  active_camera_id: string | null;
  camera_epoch: number;
  context: GameContext;
}

export interface GameSnapshot {
  game: GameState;
  players: [MatchPlayerState, MatchPlayerState];
  visits: Visit[];
  can_undo: boolean;
  partial_visit: Visit | null;
  darts: Dart[];
  observations: Observation[];
  devices: Device[];
  audit: AuditEntry[];
}

export interface GameContext {
  revision: number;
  player_id: number | null;
  leg_no: number;
  visit_no: number;
  dart_no: number;
  camera_epoch: number;
}

export interface Device {
  id: string;
  name: string;
  role: 'operator' | 'viewer' | 'camera';
  game_id: number | null;
  expires_at: number;
  revoked: boolean;
}

export interface Dart {
  id: string;
  game_id: number;
  leg_no: number;
  visit_id: number;
  visit_no: number;
  player_id: number;
  dart_no: number;
  field: string;
  source: string;
  device_id: string | null;
  observation_id: string | null;
  created_at: string;
  active: boolean;
}

export interface Observation extends GameContext {
  id: string;
  game_id: number;
  device_id: string;
  field: string;
  status: 'pending' | 'accepted' | 'rejected' | 'stale';
  created_at: string;
  accepted_dart_id: string | null;
  accepted_revision: number | null;
}

export interface AuditEntry {
  id: number;
  command_id: string;
  action: string;
  target_id: string | null;
  created_at: string;
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
