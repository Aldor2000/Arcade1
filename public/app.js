// app.js - frontend logic (fetch to backend)
const API_ROOT = "/api";

let cards = [];
let selectedCardId = null;

const games = [
  { id: "pacman", name: "Pac-Man", cost: 2.5 },
  { id: "space", name: "Space Invaders", cost: 3 },
  { id: "donkey", name: "Donkey Kong", cost: 1.5 },
  { id: "tetris", name: "Tetris", cost: 2 },
  { id: "racing", name: "Racing X", cost: 4 },
  { id: "shoot", name: "Galactic Shoot", cost: 3.5 },
];

// DOM
const cardsListEl = document.getElementById("cards-list");
const balanceEl = document.getElementById("balance");
const selectedInfoEl = document.getElementById("selected-info");
const transactionsListEl = document.getElementById("transactions-list");
const gamesListEl = document.getElementById("games-list");
const toastEl = document.getElementById("toast");

// forms/buttons
const createCardBtn = document.getElementById("create-card-btn");
const refreshCardsBtn = document.getElementById("refresh-cards");
const resetDbBtn = document.getElementById("reset-db");
const newHolder = document.getElementById("new-holder");
const newNumber = document.getElementById("new-number");
const newInitial = document.getElementById("new-initial");

const rechargeAmountInput = document.getElementById("recharge-amount");
const rechargeNoteInput = document.getElementById("recharge-note");
const doRechargeBtn = document.getElementById("do-recharge");

// Inicializar
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadCards();
  renderGames();
});

function bindEvents() {
  createCardBtn.addEventListener("click", createCard);
  refreshCardsBtn.addEventListener("click", loadCards);
  resetDbBtn.addEventListener("click", resetDB);
  doRechargeBtn.addEventListener("click", doRecharge);
}

function showToast(msg, type = "info") {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (type === "error") toastEl.style.background = "#6b1111"; else toastEl.style.background = "#111827";
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// --- API helpers ---
async function apiGet(path) {
  const res = await fetch(`${API_ROOT}${path}`);
  return await res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_ROOT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

async function apiDelete(path) {
  const res = await fetch(`${API_ROOT}${path}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// --- Cards ---
async function loadCards() {
  try {
    cards = await apiGet("/cards");
    renderCardsList();
    // auto-select first if none selected
    if (!selectedCardId && cards.length > 0) {
      selectCard(cards[0].id);
    } else if (selectedCardId) {
      // refresh selected details
      selectCard(selectedCardId);
    } else {
      renderNoSelection();
    }
  } catch (err) {
    console.error(err);
    showToast("Error cargando tarjetas", "error");
  }
}

function renderCardsList() {
  cardsListEl.innerHTML = "";
  if (cards.length === 0) {
    cardsListEl.innerHTML = "<div style='color:var(--muted)'>No hay tarjetas registradas</div>";
    return;
  }
  cards.forEach((c) => {
    const div = document.createElement("div");
    div.className = "card-item" + (c.id === selectedCardId ? " selected" : "");
    div.innerHTML = `
      <div class="left">
        <div class="holder">${escapeHtml(c.holder)}</div>
        <div class="number">${escapeHtml(c.number)}</div>
      </div>
      <div class="bal">Bs ${Number(c.balance).toFixed(2)}</div>
    `;
    div.addEventListener("click", () => selectCard(c.id));
    // context menu to delete on right-click (confirm)
    div.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (confirm("Eliminar tarjeta? Esto eliminará sus transacciones.")) {
        deleteCard(c.id);
      }
    });
    cardsListEl.appendChild(div);
  });
}

async function createCard() {
  const holder = newHolder.value.trim();
  const number = newNumber.value.trim();
  const initial = parseFloat(newInitial.value) || 0;
  if (!holder || !number) return showToast("Nombre y número son obligatorios", "error");
  try {
    const created = await apiPost("/cards", { holder, number, initialBalance: initial });
    newHolder.value = "";
    newNumber.value = "";
    newInitial.value = "";
    showToast("Tarjeta creada", "info");
    await loadCards();
    selectCard(created.id);
  } catch (err) {
    console.error(err);
    showToast(err.error || "Error al crear tarjeta", "error");
  }
}

async function deleteCard(id) {
  try {
    await apiDelete(`/cards/${id}`);
    showToast("Tarjeta eliminada", "info");
    if (selectedCardId === id) selectedCardId = null;
    await loadCards();
  } catch (err) {
    console.error(err);
    showToast(err.error || "Error al eliminar tarjeta", "error");
  }
}

function renderNoSelection() {
  selectedInfoEl.textContent = "Seleccione una tarjeta";
  balanceEl.textContent = "Bs 0.00";
  transactionsListEl.innerHTML = "<div style='color:var(--muted)'>No hay tarjeta seleccionada</div>";
}

// --- Select card ---
async function selectCard(id) {
  try {
    const card = await apiGet(`/cards/${id}`);
    selectedCardId = card.id;
    // update UI
    selectedInfoEl.textContent = `${card.holder} — ${card.number}`;
    balanceEl.textContent = `Bs ${Number(card.balance).toFixed(2)}`;
    renderCardsList();
    loadTransactions(id);
  } catch (err) {
    console.error(err);
    showToast("No se pudo seleccionar tarjeta", "error");
  }
}

// --- Transactions ---
async function loadTransactions(cardId) {
  try {
    const tx = await apiGet(`/cards/${cardId}/transactions`);
    renderTransactions(tx);
  } catch (err) {
    console.error(err);
    transactionsListEl.innerHTML = "<div style='color:var(--muted)'>Error cargando historial</div>";
  }
}

function renderTransactions(tx) {
  transactionsListEl.innerHTML = "";
  if (!tx || tx.length === 0) {
    transactionsListEl.innerHTML = "<div style='color:var(--muted)'>No hay transacciones</div>";
    return;
  }
  tx.forEach((t) => {
    const d = document.createElement("div");
    d.className = "tx " + (t.amount > 0 ? "positive" : "negative");
    const left = document.createElement("div");
    left.innerHTML = `<div style="font-weight:700">${t.type === "recarga" ? "Recarga" : "Juego"}</div>
                      <div style="font-size:0.85rem;color:var(--muted)">${t.gameId ? t.gameId : (t.note || "")}</div>`;
    const right = document.createElement("div");
    right.innerHTML = `<div>${Number(t.amount).toFixed(2)}</div><div style="font-size:0.78rem;color:var(--muted)">${new Date(t.date).toLocaleString()}</div>`;
    d.appendChild(left);
    d.appendChild(right);
    transactionsListEl.appendChild(d);
  });
}

// --- Recharge ---
async function doRecharge() {
  if (!selectedCardId) return showToast("Seleccione una tarjeta", "error");
  const amt = parseFloat(rechargeAmountInput.value);
  const note = rechargeNoteInput.value.trim();
  if (isNaN(amt) || amt <= 0) return showToast("Monto inválido", "error");
  try {
    const updated = await apiPost(`/cards/${selectedCardId}/recharge`, { amount: amt, note });
    balanceEl.textContent = `Bs ${Number(updated.balance).toFixed(2)}`;
    rechargeAmountInput.value = "";
    rechargeNoteInput.value = "";
    showToast(`Recargaste Bs ${amt.toFixed(2)}`, "info");
    loadCards();
    loadTransactions(selectedCardId);
  } catch (err) {
    console.error(err);
    showToast(err.error || "Error recargando", "error");
  }
}

// --- Games UI & Play ---
function renderGames() {
  gamesListEl.innerHTML = "";
  games.forEach((g) => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div>
        <div class="title">${escapeHtml(g.name)}</div>
        <div class="cost">Costo: Bs ${g.cost.toFixed(2)}</div>
      </div>
      <div>
        <button data-game="${g.id}">Jugar</button>
      </div>
    `;
    const btn = card.querySelector("button");
    btn.addEventListener("click", () => playGame(g));
    gamesListEl.appendChild(card);
  });
}

async function playGame(game) {
  if (!selectedCardId) return showToast("Seleccione una tarjeta", "error");
  if (!confirm(`Jugar ${game.name} por Bs ${game.cost.toFixed(2)}?`)) return;
  try {
    const updated = await apiPost(`/cards/${selectedCardId}/play`, { gameId: game.id, cost: game.cost });
    balanceEl.textContent = `Bs ${Number(updated.balance).toFixed(2)}`;
    showToast(`Jugaste ${game.name}`, "info");
    loadCards();
    loadTransactions(selectedCardId);
  } catch (err) {
    console.error(err);
    showToast(err.error || "Error al jugar", "error");
  }
}

// --- Delete / Reset DB ---
async function resetDB() {
  if (!confirm("Reiniciar base de datos (elimina todas las tarjetas y transacciones)?")) return;
  try {
    const res = await apiPost("/reset-all", {});
    showToast("Base de datos reiniciada", "info");
    selectedCardId = null;
    loadCards();
  } catch (err) {
    console.error(err);
    showToast("Error reiniciando", "error");
  }
}

// --- util ---
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
