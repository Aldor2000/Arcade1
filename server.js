// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DB_FILE = path.join(__dirname, "arcade.db");
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Error al abrir la DB:", err.message);
    process.exit(1);
  } else {
    console.log("Conectado a SQLite:", DB_FILE);
  }
});

// Inicializar tablas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holder TEXT NOT NULL,
      number TEXT UNIQUE NOT NULL,
      balance REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      type TEXT NOT NULL,         -- 'recarga' o 'juego'
      amount REAL NOT NULL,       -- positivo para recarga, negativo para juego
      gameId TEXT,
      note TEXT,
      date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
  `);

  // Crear una tarjeta demo si no existe
  db.get("SELECT COUNT(*) as cnt FROM cards", (err, row) => {
    if (!err && row && row.cnt === 0) {
      db.run(
        "INSERT INTO cards (holder, number, balance) VALUES (?, ?, ?)",
        ["Jugador Demo", "0000-0000-0000-0001", 50.0],
        (err2) => {
          if (err2) console.error("No se pudo crear tarjeta demo:", err2.message);
          else console.log("Tarjeta demo creada (saldo 50).");
        }
      );
    }
  });
});

// --- RUTAS ---
// Get all cards
app.get("/api/cards", (req, res) => {
  db.all("SELECT id, holder, number, balance, created_at FROM cards ORDER BY id ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create card
app.post("/api/cards", (req, res) => {
  const { holder, number, initialBalance } = req.body;
  if (!holder || !number) return res.status(400).json({ error: "holder y number son requeridos" });

  const initBal = parseFloat(initialBalance) || 0;
  const stmt = db.prepare("INSERT INTO cards (holder, number, balance) VALUES (?, ?, ?)");
  stmt.run([holder, number, initBal], function (err) {
    if (err) {
      if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "Número de tarjeta ya existe" });
      return res.status(500).json({ error: err.message });
    }
    const id = this.lastID;
    db.get("SELECT id, holder, number, balance, created_at FROM cards WHERE id = ?", [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      // If initial balance > 0, create a transaction for it
      if (initBal > 0) {
        db.run(
          "INSERT INTO transactions (card_id, type, amount, note) VALUES (?, 'recarga', ?, ?)",
          [id, initBal, "Recarga inicial"],
          (err3) => {
            if (err3) console.error("Error creando transacción inicial:", err3.message);
            res.status(201).json(row);
          }
        );
      } else {
        res.status(201).json(row);
      }
    });
  });
});

// Get single card
app.get("/api/cards/:id", (req, res) => {
  const id = req.params.id;
  db.get("SELECT id, holder, number, balance, created_at FROM cards WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Tarjeta no encontrada" });
    res.json(row);
  });
});

// Get transactions for a card
app.get("/api/cards/:id/transactions", (req, res) => {
  const id = req.params.id;
  db.all(
    "SELECT id, type, amount, gameId, note, date FROM transactions WHERE card_id = ? ORDER BY id DESC LIMIT 200",
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Recharge card
app.post("/api/cards/:id/recharge", (req, res) => {
  const id = req.params.id;
  const { amount, note } = req.body;
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: "Monto inválido" });

  db.serialize(() => {
    db.run("UPDATE cards SET balance = balance + ? WHERE id = ?", [amt, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run("INSERT INTO transactions (card_id, type, amount, note) VALUES (?, 'recarga', ?, ?)", [id, amt, note || null], (err2) => {
        if (err2) console.error("Error insert trans:", err2.message);
        db.get("SELECT id, holder, number, balance FROM cards WHERE id = ?", [id], (err3, row) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json(row);
        });
      });
    });
  });
});

// Play (deduct)
app.post("/api/cards/:id/play", (req, res) => {
  const id = req.params.id;
  const { gameId, cost } = req.body;
  const c = parseFloat(cost);
  if (!gameId || isNaN(c) || c <= 0) return res.status(400).json({ error: "Datos inválidos" });

  db.get("SELECT balance FROM cards WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Tarjeta no encontrada" });
    if (row.balance < c) return res.status(400).json({ error: "Saldo insuficiente" });

    db.serialize(() => {
      db.run("UPDATE cards SET balance = balance - ? WHERE id = ?", [c, id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        db.run("INSERT INTO transactions (card_id, type, amount, gameId) VALUES (?, 'juego', ?, ?)", [id, -c, gameId], (err3) => {
          if (err3) console.error("Error insert trans:", err3.message);
          db.get("SELECT id, holder, number, balance FROM cards WHERE id = ?", [id], (err4, updated) => {
            if (err4) return res.status(500).json({ error: err4.message });
            res.json(updated);
          });
        });
      });
    });
  });
});

// Delete a card (and its transactions)
app.delete("/api/cards/:id", (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM cards WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Tarjeta no encontrada" });
    res.json({ message: "Tarjeta eliminada" });
  });
});

// Reset DB (dangerous, dev use)
app.post("/api/reset-all", (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM cards", (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Base de datos reiniciada" });
    });
  });
});

// Start
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
