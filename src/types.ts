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
  sets: number;
  set_legs: number;
  opened: boolean;
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
  double_confirmed: boolean;
  input_mode: 'score' | 'remaining';
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
  operation_state: 'playing' | 'paused' | 'awaiting_starter' | 'resolved' | 'confirmed';
  is_paused: boolean;
  confirmed_at: string | null;
  decision: AdministrativeDecision | null;
  stats_eligible: boolean;
  id: number;
  player1_id: number;
  player2_id: number;
  winner_id: number | null;
  legs_to_win: number;
  starting_score: number;
  status: 'active' | 'finished';
  current_leg: number;
  max_legs: number | null;
  current_player_id: number | null;
  leg_starter_id: number | null;
  set_starter_id: number;
  current_set: number;
  leg_in_set: number;
  result: 'win' | 'draw' | AdministrativeDecision['kind'] | null;
  phase: 'regular' | 'decider' | 'advantage' | 'sudden_death' | 'awaiting_starter' | 'finished';
  aggregate_allowed: boolean;
  config: MatchConfig;
  format_description: string;
  legacy_compatible: boolean;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  revision: number;
  active_camera_id: string | null;
  camera_epoch: number;
  context: GameContext;
}

export interface GameSnapshot {
  permissions: MatchPermission[];
  leg_results: { leg_no: number; set_no: number; winner_id: number; starter_id: number | null; kind: 'hold' | 'break' | 'unknown' }[];
  withdrawn_visits: Visit[];
  withdrawn_darts: Dart[];
  record_versions: { id: number; record_type: string; record_id: string; original: string; reason: string; revision: number; created_at: string }[];
  result_decisions: { id: number; action: string; reason: string; actor_context: string; created_at: string }[];
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
  permissions: MatchPermission[];
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
  actor_context?: string;
  id: number;
  command_id: string;
  action: string;
  target_id: string | null;
  created_at: string;
}

export interface GameSummary {
  operation_state: GameState['operation_state'];
  decision: AdministrativeDecision | null;
  config: MatchConfig;
  format_description: string;
  result: GameState['result'];
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
  templates: MatchTemplate[];
  statistics_scope: string;
  players: Player[];
  active_games: GameSummary[];
  history: GameSummary[];
}

export interface DecidingRule { win_by_two: boolean; extra_pairs: number | null }
export interface MatchConfig {
  version: 1;
  scoring: { start: number; in: 'straight' | 'double' | 'master'; out: 'straight' | 'double' | 'master' };
  match: { unit: 'legs' | 'sets' | 'fixed'; target: number };
  legs_per_set: number;
  deciding: DecidingRule;
  final_set: (DecidingRule & { target: number }) | null;
  starters: { method: 'fixed' | 'random' | 'bull_off'; player: 1 | 2; leg_rotation: 'alternate' | 'same'; set_rotation: 'alternate' | 'same'; decider: 'rotation' | 'initial' | 'bull_off' };
}
export interface MatchTemplate { id: number; name: string; config: MatchConfig; favorite: boolean; revision: number }

export type MatchPermission = 'score' | 'correct_last' | 'history' | 'pause' | 'adjudicate' | 'confirm' | 'reopen';
export interface AdministrativeDecision {
  kind: 'surrender' | 'walkover' | 'interrupted' | 'cancelled';
  winner_id: number | null;
  award: { player1: number; player2: number; unit: 'legs' | 'sets' } | null;
  reason: string;
}
export interface HistoryChange {
  kind: 'visit' | 'dart'; visit_id?: number; dart_id?: string; field?: string;
  score?: number; darts_used?: number; double_confirmed?: boolean;
  reason: string; withdraw_dependent: boolean;
}
export interface CorrectionPreview {
  preview_token: string; can_apply: boolean; original: Visit | Dart;
  proposed: Pick<GameSnapshot, 'players' | 'visits' | 'leg_results'> & { game: Pick<GameState, 'current_leg' | 'current_set' | 'operation_state' | 'winner_id' | 'status'> };
  conflicts: { visit_id: number; dart_id: string | null; message: string }[];
  withdrawn_visits: number; withdrawn_darts: number;
}
export interface CheckoutHints { revision: number; remaining: number | null; darts_left: number; routes: string[][]; message: string }
