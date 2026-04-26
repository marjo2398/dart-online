import express from "express";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/players", (req, res) => {
    try {
      const players = db.prepare(`
        SELECT p.*,
               (SELECT COUNT(*) FROM throws WHERE player_id = p.id AND score = 180) as count_180,
               (SELECT COUNT(*) FROM throws WHERE player_id = p.id AND score >= 140 AND score < 180) as count_140,
               (SELECT COUNT(*) FROM throws WHERE player_id = p.id AND score >= 100 AND score < 140) as count_100,
               (SELECT MAX(score) FROM throws WHERE player_id = p.id) as hi_score
        FROM players p
      `).all();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.post("/api/players", (req, res) => {
    try {
      const { name } = req.body;
      const info = db.prepare("INSERT INTO players (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid, name });
    } catch (error) {
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.delete("/api/players/:id", (req, res) => {
    try {
      const { id } = req.params;

      // Delete player throws
      db.prepare("DELETE FROM throws WHERE player_id = ?").run(id);

      // Find and handle games involving the player
      const games = db.prepare("SELECT id FROM games WHERE player1_id = ? OR player2_id = ?").all(id, id) as any[];
      for (const game of games) {
        // Delete all throws for this game (even opponent's) since the game is being deleted
        db.prepare("DELETE FROM throws WHERE game_id = ?").run(game.id);
        db.prepare("DELETE FROM games WHERE id = ?").run(game.id);
      }

      db.prepare("DELETE FROM players WHERE id = ?").run(id);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  app.post("/api/games", (req, res) => {
    try {
      const { player1_id, player2_id, legs_to_win, starting_score } = req.body;
      const score = starting_score || 501;
      const info = db.prepare("INSERT INTO games (player1_id, player2_id, legs_to_win, starting_score) VALUES (?, ?, ?, ?)").run(player1_id, player2_id, legs_to_win, score);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to create game" });
    }
  });

  app.post("/api/throws", (req, res) => {
    try {
      const { game_id, player_id, score, darts_used, checkout, leg_darts } = req.body;
      const info = db.prepare("INSERT INTO throws (game_id, player_id, score, darts_used) VALUES (?, ?, ?, ?)").run(game_id, player_id, score, darts_used);
      
      // Update basic player stats
      db.prepare("UPDATE players SET total_points = total_points + ?, total_darts_thrown = total_darts_thrown + ? WHERE id = ?").run(score, darts_used, player_id);
      
      // Update advanced stats if provided
      if (checkout !== undefined) {
        const player = db.prepare("SELECT highest_checkout, best_leg_darts FROM players WHERE id = ?").get(player_id) as any;
        if (player) {
          if (checkout > player.highest_checkout) {
            db.prepare("UPDATE players SET highest_checkout = ? WHERE id = ?").run(checkout, player_id);
          }
          if (leg_darts !== undefined && leg_darts > 0) {
            if (player.best_leg_darts === 0 || leg_darts < player.best_leg_darts) {
              db.prepare("UPDATE players SET best_leg_darts = ? WHERE id = ?").run(leg_darts, player_id);
            }
          }
        }
      }

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to record throw" });
    }
  });

  const recalculatePlayerStats = (playerId: number) => {
    const games = db.prepare("SELECT * FROM games WHERE player1_id = ? OR player2_id = ?").all(playerId, playerId) as any[];

    let highestCheckout = 0;
    let bestLegDarts = 0;

    for (const game of games) {
      const throws = db.prepare("SELECT * FROM throws WHERE game_id = ? ORDER BY id ASC").all(game.id) as any[];

      let p1Score = game.starting_score;
      let p2Score = game.starting_score;
      let p1LegDarts = 0;
      let p2LegDarts = 0;

      for (const t of throws) {
        if (t.player_id === game.player1_id) {
          p1LegDarts += t.darts_used;
          p1Score -= t.score;
          if (p1Score === 0) {
            if (t.player_id === playerId) {
              highestCheckout = Math.max(highestCheckout, t.score);
              if (bestLegDarts === 0 || p1LegDarts < bestLegDarts) {
                bestLegDarts = p1LegDarts;
              }
            }
            p1Score = game.starting_score;
            p2Score = game.starting_score;
            p1LegDarts = 0;
            p2LegDarts = 0;
          }
        } else if (t.player_id === game.player2_id) {
          p2LegDarts += t.darts_used;
          p2Score -= t.score;
          if (p2Score === 0) {
            if (t.player_id === playerId) {
              highestCheckout = Math.max(highestCheckout, t.score);
              if (bestLegDarts === 0 || p2LegDarts < bestLegDarts) {
                bestLegDarts = p2LegDarts;
              }
            }
            p1Score = game.starting_score;
            p2Score = game.starting_score;
            p1LegDarts = 0;
            p2LegDarts = 0;
          }
        }
      }
    }

    db.prepare("UPDATE players SET highest_checkout = ?, best_leg_darts = ? WHERE id = ?").run(highestCheckout, bestLegDarts, playerId);
  };

  app.post("/api/games/:id/undo", (req, res) => {
    try {
      const { id } = req.params;

      // Get the last throw for this game
      const lastThrow = db.prepare("SELECT * FROM throws WHERE game_id = ? ORDER BY id DESC LIMIT 1").get(id) as any;

      if (!lastThrow) {
        return res.status(400).json({ error: "No throws to undo" });
      }

      // Check if this throw ended a leg
      const game = db.prepare("SELECT * FROM games WHERE id = ?").get(id) as any;
      const allThrows = db.prepare("SELECT * FROM throws WHERE game_id = ? ORDER BY id ASC").all(id) as any[];

      let p1Score = game.starting_score;
      let p2Score = game.starting_score;
      let wasCheckout = false;

      for (const t of allThrows) {
        if (t.player_id === game.player1_id) {
          p1Score -= t.score;
          if (p1Score === 0) {
            if (t.id === lastThrow.id) wasCheckout = true;
            p1Score = game.starting_score;
            p2Score = game.starting_score;
          }
        } else if (t.player_id === game.player2_id) {
          p2Score -= t.score;
          if (p2Score === 0) {
            if (t.id === lastThrow.id) wasCheckout = true;
            p1Score = game.starting_score;
            p2Score = game.starting_score;
          }
        }
      }

      // Revert player stats
      db.prepare("UPDATE players SET total_points = total_points - ?, total_darts_thrown = total_darts_thrown - ? WHERE id = ?").run(lastThrow.score, lastThrow.darts_used, lastThrow.player_id);

      // Delete the throw
      db.prepare("DELETE FROM throws WHERE id = ?").run(lastThrow.id);

      // Recalculate if it was a checkout
      if (wasCheckout) {
        recalculatePlayerStats(lastThrow.player_id);
      }

      res.json({ success: true, undoneThrow: lastThrow });
    } catch (error) {
      res.status(500).json({ error: "Failed to undo throw" });
    }
  });

  app.delete("/api/games/:id", (req, res) => {
    try {
      const { id } = req.params;

      // We must delete throws first to maintain referential integrity
      db.prepare("DELETE FROM throws WHERE game_id = ?").run(id);
      db.prepare("DELETE FROM games WHERE id = ?").run(id);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete game" });
    }
  });

  app.get("/api/games/active", (req, res) => {
    try {
      const games = db.prepare(`
        SELECT g.*,
               p1.name as player1_name,
               p2.name as player2_name
        FROM games g
        JOIN players p1 ON g.player1_id = p1.id
        JOIN players p2 ON g.player2_id = p2.id
        WHERE g.winner_id IS NULL
        ORDER BY g.created_at DESC
      `).all();
      res.json(games);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active games" });
    }
  });

  app.get("/api/games/:id", (req, res) => {
    try {
      const { id } = req.params;
      const game = db.prepare("SELECT * FROM games WHERE id = ?").get(id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const throws = db.prepare("SELECT * FROM throws WHERE game_id = ? ORDER BY id ASC").all(id);

      res.json({ game, throws });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch game details" });
    }
  });

  app.post("/api/games/:id/finish", (req, res) => {
    try {
      const { id } = req.params;
      const { winner_id } = req.body;
      
      db.prepare("UPDATE games SET winner_id = ? WHERE id = ?").run(winner_id, id);
      
      const game = db.prepare("SELECT * FROM games WHERE id = ?").get() as any;
      
      db.prepare("UPDATE players SET games_played = games_played + 1 WHERE id IN (?, ?)").run(game.player1_id, game.player2_id);
      db.prepare("UPDATE players SET games_won = games_won + 1 WHERE id = ?").run(winner_id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to finish game" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
