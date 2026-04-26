import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'darts.db');
export const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    total_darts_thrown INTEGER DEFAULT 0,
    highest_checkout INTEGER DEFAULT 0,
    best_leg_darts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER,
    player2_id INTEGER,
    winner_id INTEGER,
    legs_to_win INTEGER,
    starting_score INTEGER DEFAULT 501,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(player1_id) REFERENCES players(id),
    FOREIGN KEY(player2_id) REFERENCES players(id),
    FOREIGN KEY(winner_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS throws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    player_id INTEGER,
    score INTEGER,
    darts_used INTEGER DEFAULT 3,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(game_id) REFERENCES games(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
  );
`);

// Migration for existing databases
try {
  db.exec("ALTER TABLE games ADD COLUMN starting_score INTEGER DEFAULT 501;");
} catch (e) {
  // Column likely already exists
}

try {
  db.exec("ALTER TABLE players ADD COLUMN highest_checkout INTEGER DEFAULT 0;");
  db.exec("ALTER TABLE players ADD COLUMN best_leg_darts INTEGER DEFAULT 0;");
} catch (e) {
  // Columns likely already exist
}
