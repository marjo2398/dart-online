export interface Player {
  id: number;
  name: string;
  games_played: number;
  games_won: number;
  total_points: number;
  total_darts_thrown: number;
  count_180?: number;
  count_140?: number;
  count_100?: number;
  hi_score?: number;
}

export interface Game {
  id: number;
  player1_id: number;
  player2_id: number;
  winner_id: number | null;
  legs_to_win: number;
  starting_score: number;
}

export interface Throw {
  id: number;
  game_id: number;
  player_id: number;
  score: number;
  darts_used: number;
}
