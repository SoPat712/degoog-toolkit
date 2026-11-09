// Solitaire's card runtime. The Klondike rules come first, as pure functions over
// plain state objects, so index.test.mjs can run them without a DOM. The board UI
// below renders that state and turns drags, taps and keys into rule moves.
(function () {
  "use strict";

  const SUITS = ["S", "H", "D", "C"];
  const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  /* ---------- Rules ---------- */

  // A state is { stock, waste, foundations[4], tableau[7], moves }. Piles list
  // cards bottom to top. Cards are { suit, rank, up } and are never mutated, so a
  // move copies only the piles it touches and earlier states stay valid for undo.

  function cardId(card) {
    return card.suit + card.rank;
  }

  function isRed(card) {
    return card.suit === "H" || card.suit === "D";
  }

  function topOf(pile) {
    return pile[pile.length - 1];
  }

  function faceUp(card) {
    return card.up ? card : { suit: card.suit, rank: card.rank, up: true };
  }

  function faceDown(card) {
    return card.up ? { suit: card.suit, rank: card.rank, up: false } : card;
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) deck.push({ suit, rank, up: false });
    }
    return deck;
  }

  // mulberry32, so tests can replay a deal from a seed.
  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(cards, random) {
    const out = cards.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Pile i gets i + 1 cards with only the last face up; the other 24 are the stock.
  function deal(random) {
    const deck = shuffle(createDeck(), random || Math.random);
    const tableau = [];
    let next = 0;
    for (let i = 0; i < 7; i++) {
      const pile = [];
      for (let k = 0; k <= i; k++) {
        const card = deck[next++];
        pile.push(k === i ? faceUp(card) : card);
      }
      tableau.push(pile);
    }
    return {
      stock: deck.slice(next),
      waste: [],
      foundations: [[], [], [], []],
      tableau,
      moves: 0,
    };
  }

  function canPlaceOnTableau(card, pile) {
    const top = topOf(pile);
    if (!top) return card.rank === 13;
    return top.up && isRed(top) !== isRed(card) && top.rank === card.rank + 1;
  }

  function canPlaceOnFoundation(card, pile) {
    const top = topOf(pile);
    if (!top) return card.rank === 1;
    return top.suit === card.suit && card.rank === top.rank + 1;
  }

  // Sources are { type: "waste" }, { type: "foundation", index } or
  // { type: "tableau", index, card }, where card is the position the run starts
  // at. Targets are { type: "foundation" | "tableau", index }.
  function movableCards(state, from) {
    if (!from) return null;
    if (from.type === "waste") return state.waste.length ? [topOf(state.waste)] : null;
    if (from.type === "foundation") {
      const pile = state.foundations[from.index];
      return pile && pile.length ? [topOf(pile)] : null;
    }
    if (from.type !== "tableau") return null;
    const pile = state.tableau[from.index];
    if (!pile || !(from.card >= 0) || from.card >= pile.length) return null;
    const run = pile.slice(from.card);
    for (let i = 0; i < run.length; i++) {
      if (!run[i].up) return null;
      if (i && !(isRed(run[i]) !== isRed(run[i - 1]) && run[i].rank === run[i - 1].rank - 1)) return null;
    }
    return run;
  }

  function advance(state) {
    return {
      stock: state.stock,
      waste: state.waste,
      foundations: state.foundations.slice(),
      tableau: state.tableau.slice(),
      moves: state.moves + 1,
    };
  }

  // Returns the next state, or null when the move breaks the rules.
  function applyMove(state, from, to) {
    const cards = movableCards(state, from);
    if (!cards || !to) return null;
    if (to.type === "foundation") {
      const pile = state.foundations[to.index];
      if (!pile || cards.length !== 1 || from.type === "foundation") return null;
      if (!canPlaceOnFoundation(cards[0], pile)) return null;
    } else if (to.type === "tableau") {
      const pile = state.tableau[to.index];
      if (!pile || (from.type === "tableau" && from.index === to.index)) return null;
      if (!canPlaceOnTableau(cards[0], pile)) return null;
    } else {
      return null;
    }

    const next = advance(state);
    if (from.type === "waste") {
      next.waste = state.waste.slice(0, -1);
    } else if (from.type === "foundation") {
      next.foundations[from.index] = state.foundations[from.index].slice(0, -1);
    } else {
      const rest = state.tableau[from.index].slice(0, from.card);
      // Uncovering a face-down card turns it over as part of the same move.
      if (rest.length) rest[rest.length - 1] = faceUp(rest[rest.length - 1]);
      next.tableau[from.index] = rest;
    }
    const piles = to.type === "foundation" ? next.foundations : next.tableau;
    piles[to.index] = piles[to.index].concat(cards);
    return next;
  }

  // Turns 1 or 3 cards from the stock onto the waste, or turns an empty stock's
  // waste back over. Three cards flip as a packet, so the third becomes the top.
  function draw(state, drawCount) {
    const next = advance(state);
    if (state.stock.length) {
      const count = Math.min(drawCount === 3 ? 3 : 1, state.stock.length);
      const packet = state.stock.slice(state.stock.length - count).reverse().map(faceUp);
      next.stock = state.stock.slice(0, state.stock.length - count);
      next.waste = state.waste.concat(packet);
      return next;
    }
    if (!state.waste.length) return null;
    next.stock = state.waste.slice().reverse().map(faceDown);
    next.waste = [];
    return next;
  }

  function foundationIndexFor(state, card) {
    for (let i = 0; i < state.foundations.length; i++) {
      if (canPlaceOnFoundation(card, state.foundations[i])) return i;
    }
    return -1;
  }

  // Where a tap sends cards: a lone card goes up to a foundation when it can,
  // otherwise onto the next tableau pile to the right that takes it. An empty
  // pile is the last resort, and never for a king that already starts its pile.
  function bestMove(state, from) {
    const cards = movableCards(state, from);
    if (!cards) return null;
    if (cards.length === 1 && from.type !== "foundation") {
      const index = foundationIndexFor(state, cards[0]);
      if (index >= 0) return { type: "foundation", index };
    }
    const start = from.type === "tableau" ? from.index + 1 : 0;
    let empty = -1;
    for (let k = 0; k < 7; k++) {
      const index = (start + k) % 7;
      if (from.type === "tableau" && index === from.index) continue;
      const pile = state.tableau[index];
      if (!canPlaceOnTableau(cards[0], pile)) continue;
      if (pile.length) return { type: "tableau", index };
      if (empty < 0) empty = index;
    }
    if (empty >= 0 && !(from.type === "tableau" && from.card === 0)) return { type: "tableau", index: empty };
    return null;
  }

  function foundationMove(state, from) {
    const cards = movableCards(state, from);
    if (!cards || cards.length !== 1) return null;
    const index = foundationIndexFor(state, cards[0]);
    return index < 0 ? null : applyMove(state, from, { type: "foundation", index });
  }

  // Enter on a pile: its top card up to a foundation, else the longest run that
  // fits somewhere, so moving it uncovers as much as possible.
  function bestMoveForPile(state, pile) {
    if (pile.type !== "tableau") {
      const to = bestMove(state, pile);
      return to ? { from: pile, to } : null;
    }
    const cards = state.tableau[pile.index] || [];
    if (!cards.length) return null;
    const last = cards.length - 1;
    const up = foundationIndexFor(state, cards[last]);
    if (up >= 0) return { from: { type: "tableau", index: pile.index, card: last }, to: { type: "foundation", index: up } };
    for (let card = cards.findIndex((c) => c.up); card >= 0 && card < cards.length; card++) {
      const from = { type: "tableau", index: pile.index, card };
      const to = bestMove(state, from);
      if (to) return { from, to };
    }
    return null;
  }

  function isWon(state) {
    return state.foundations.every((pile) => pile.length === 13);
  }

  function foundationCount(state) {
    return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
  }

  // One auto-finish step: any card that can go up to a foundation, else a draw.
  function autoFinishMove(state, drawCount) {
    const sources = [{ type: "waste" }];
    state.tableau.forEach((pile, index) => {
      if (pile.length) sources.push({ type: "tableau", index, card: pile.length - 1 });
    });
    for (const from of sources) {
      const next = foundationMove(state, from);
      if (next) return next;
    }
    return draw(state, drawCount);
  }

  // Offered once nothing is face down and a dry run shows that foundation moves
  // and draws alone clear the board. Draw 3 can stall, so the run gives up after
  // two passes through the stock without progress.
  function canAutoFinish(state, drawCount) {
    if (isWon(state) || state.tableau.some((pile) => pile.some((card) => !card.up))) return false;
    let current = state;
    let idle = 0;
    for (let step = 0; step < 2000; step++) {
      const next = autoFinishMove(current, drawCount);
      if (!next) return false;
      if (isWon(next)) return true;
      idle = foundationCount(next) > foundationCount(current) ? 0 : idle + 1;
      if (idle > 2 * (next.stock.length + next.waste.length) + 2) return false;
      current = next;
    }
    return false;
  }

  // A game keeps every earlier state, so undo just steps back through them.
  function newGame(random) {
    return { state: deal(random), history: [] };
  }

  function play(game, next) {
    return next ? { state: next, history: game.history.concat([game.state]) } : game;
  }

  function undo(game) {
    if (!game.history.length) return game;
    return { state: topOf(game.history), history: game.history.slice(0, -1) };
  }

  const rules = {
    cardId,
    isRed,
    createDeck,
    seededRandom,
    shuffle,
    deal,
    canPlaceOnTableau,
    canPlaceOnFoundation,
    movableCards,
    applyMove,
    draw,
    bestMove,
    bestMoveForPile,
    foundationMove,
    isWon,
    autoFinishMove,
    canAutoFinish,
    newGame,
    play,
    undo,
  };

  /* ---------- Board UI ---------- */

  // Suit outlines drawn for this deck on a 24-unit grid.
  const SUIT_PATHS = {
    S: "M12 2.2c-2.6 4-8.6 7.4-8.6 11.9 0 2.7 2.1 4.6 4.5 4.6 1.6 0 2.9-.8 3.6-1.9-.2 1.9-1 3.4-2.4 4.9h5.8c-1.4-1.5-2.2-3-2.4-4.9.7 1.1 2 1.9 3.6 1.9 2.4 0 4.5-1.9 4.5-4.6 0-4.5-6-7.9-8.6-11.9z",
    H: "M12 21C6.3 16.7 2.5 13.2 2.5 8.9 2.5 6 4.7 3.8 7.4 3.8c1.9 0 3.6 1 4.6 2.7 1-1.7 2.7-2.7 4.6-2.7 2.7 0 4.9 2.2 4.9 5.1 0 4.3-3.8 7.8-9.5 12.1z",
    D: "M12 2.2c2 3.4 4.6 6.5 7.6 9.8-3 3.3-5.6 6.4-7.6 9.8-2-3.4-4.6-6.5-7.6-9.8 3-3.3 5.6-6.4 7.6-9.8z",
    C: "M7.6 7.4a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0M2.4 13.6a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0M12.8 13.6a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0M10.9 12h2.2c.2 3.7 1 6.5 2.7 9.6H8.2c1.7-3.1 2.5-5.9 2.7-9.6z",
  };
  const RECYCLE_SVG =
    '<svg class="sol-recycle" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SUIT_KEYS = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
  const RANK_KEYS = { 1: "ace", 11: "jack", 12: "queen", 13: "king" };
  // Arrow-key layout: the top row's piles and the grid column each one sits in.
  const TOP_ROW = ["stock", "waste", "f0", "f1", "f2", "f3"];
  const TOP_COLUMNS = [0, 1, 3, 4, 5, 6];
  const DOUBLE_TAP_MS = 350;
  const FALLBACK = {
    stock: "Stock, cards left: {count}",
    stockRecycle: "Stock empty, select to turn the waste over",
    stockEmpty: "Stock empty",
    waste: "Waste: {card}",
    wasteEmpty: "Waste, empty",
    foundation: "Foundation {number}: {card}",
    foundationEmpty: "Foundation {number}, empty",
    pile: "Pile {number}: {cards}",
    pileEmpty: "Pile {number}, empty",
    hidden: "face-down cards: {count}",
    card: "{rank} of {suit}",
    ace: "Ace",
    jack: "Jack",
    queen: "Queen",
    king: "King",
    spades: "spades",
    hearts: "hearts",
    diamonds: "diamonds",
    clubs: "clubs",
    noMove: "No move for that card",
    won: "You won!",
    wonSummary: "{moves} moves in {time}",
  };

  let widgetEl = null;
  let piles = {};
  let game = null;
  let drawCount = 1;
  let gesture = null;
  let lastTap = null;
  let autoTimer = null;
  const clock = { startedAt: 0, banked: 0, tickId: null };
  const bound = new WeakSet();

  function t(key) {
    const translated = typeof window.scopedT === "function" ? window.scopedT("plugin-solitaire")(key) : null;
    if (translated && translated !== key && translated !== `plugin-solitaire.${key}`) return translated;
    const attr = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    return (widgetEl && widgetEl.getAttribute(attr)) || FALLBACK[key] || key;
  }

  function format(text, values) {
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
  }

  function cardName(card) {
    const rank = RANK_KEYS[card.rank] ? t(RANK_KEYS[card.rank]) : String(card.rank);
    return format(t("card"), { rank, suit: t(SUIT_KEYS[card.suit]) });
  }

  function suitSvg(suit, className) {
    return `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT_PATHS[suit]}"/></svg>`;
  }

  function cardHtml(card, options) {
    const o = options || {};
    let style = "";
    if (o.d) style += `--sol-d:${o.d};`;
    if (o.u) style += `--sol-u:${o.u};`;
    if (o.x) style += `--sol-x:${o.x};`;
    const attrs = ` data-id="${cardId(card)}"` + (style ? ` style="${style}"` : "");
    if (!card.up) return `<div class="sol-c sol-back"${attrs}></div>`;
    const label = RANK_LABELS[card.rank];
    const middle =
      card.rank > 10
        ? `<span class="sol-court"><b>${label}</b>${suitSvg(card.suit)}</span>`
        : suitSvg(card.suit, card.rank === 1 ? "sol-pip sol-ace" : "sol-pip");
    const src = o.src ? ` data-src="${o.src}"` : "";
    return `<div class="sol-c${isRed(card) ? " sol-red" : ""}"${attrs} data-up${src}><span class="sol-ix"><b>${label}</b>${suitSvg(card.suit)}</span>${middle}</div>`;
  }

  function renderTableau(pile, index) {
    const el = piles["t" + index];
    let down = 0;
    let up = 0;
    let lastD = 0;
    let lastU = 0;
    el.innerHTML = pile
      .map((card, position) => {
        lastD = down;
        lastU = up;
        const html = cardHtml(card, { src: card.up ? `t${index}:${position}` : "", d: down, u: up });
        if (card.up) up++;
        else down++;
        return html;
      })
      .join("");
    // The pile is as tall as its fan; long runs fan tighter so a column never
    // towers over the page.
    el.style.setProperty("--sol-pd", String(lastD));
    el.style.setProperty("--sol-pu", String(lastU));
    el.style.setProperty("--sol-fan", lastU > 10 ? (10 / lastU).toFixed(3) : "1");
  }

  function render(animate) {
    if (!widgetEl) return;
    const before = animate ? snapshot() : null;
    const state = game.state;
    piles.stock.innerHTML = state.stock.length
      ? state.stock.slice(-3).map((card) => cardHtml(card)).join("")
      : state.waste.length
        ? RECYCLE_SVG
        : "";
    // Draw 3 fans the last three waste cards; draw 1 stacks two so the next card
    // shows while the top one is dragged.
    const shown = state.waste.slice(drawCount === 3 ? -3 : -2);
    piles.waste.innerHTML = shown
      .map((card, i) => cardHtml(card, { src: i === shown.length - 1 ? "w" : "", x: drawCount === 3 ? i : 0 }))
      .join("");
    state.foundations.forEach((pile, index) => {
      const top = pile.slice(-2);
      piles["f" + index].innerHTML = top
        .map((card, i) => cardHtml(card, { src: i === top.length - 1 ? "f" + index : "" }))
        .join("");
    });
    state.tableau.forEach(renderTableau);
    updateLabels(state);
    updateControls(state);
    if (before) flipFrom(before);
  }

  function updateLabels(state) {
    piles.stock.setAttribute(
      "aria-label",
      state.stock.length
        ? format(t("stock"), { count: state.stock.length })
        : t(state.waste.length ? "stockRecycle" : "stockEmpty"),
    );
    const waste = topOf(state.waste);
    piles.waste.setAttribute("aria-label", waste ? format(t("waste"), { card: cardName(waste) }) : t("wasteEmpty"));
    state.foundations.forEach((pile, index) => {
      const top = topOf(pile);
      const number = index + 1;
      piles["f" + index].setAttribute(
        "aria-label",
        top ? format(t("foundation"), { number, card: cardName(top) }) : format(t("foundationEmpty"), { number }),
      );
    });
    state.tableau.forEach((pile, index) => {
      const open = pile.filter((card) => card.up);
      const hidden = pile.length - open.length;
      const number = index + 1;
      let label = pile.length
        ? format(t("pile"), { number, cards: open.map(cardName).join(", ") })
        : format(t("pileEmpty"), { number });
      if (hidden) label += ", " + format(t("hidden"), { count: hidden });
      piles["t" + index].setAttribute("aria-label", label);
    });
  }

  function updateControls(state) {
    const find = (selector) => widgetEl.querySelector(selector);
    const moves = find("[data-sol-moves]");
    if (moves) moves.textContent = String(state.moves);
    const undoButton = find('[data-sol-action="undo"]');
    if (undoButton) undoButton.disabled = !game.history.length;
    const autoButton = find('[data-sol-action="auto"]');
    if (autoButton) autoButton.hidden = Boolean(autoTimer) || !rules.canAutoFinish(state, drawCount);
    widgetEl.querySelectorAll("[data-sol-draw]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.solDraw) === drawCount));
    });

    const won = rules.isWon(state);
    const panel = find("[data-sol-win]");
    if (!panel || panel.hidden !== won) return;
    panel.hidden = !won;
    find("[data-sol-board]").classList.toggle("sol-won", won);
    if (!won) return;
    const summary = format(t("wonSummary"), { moves: state.moves, time: formatTime(elapsed()) });
    const meta = find("[data-sol-win-meta]");
    if (meta) meta.textContent = summary;
    announce(`${t("won")} ${summary}`);
    if (widgetEl.contains(document.activeElement)) {
      const again = panel.querySelector("[data-sol-action]");
      if (again) again.focus();
    }
  }

  function snapshot() {
    const seen = new Map();
    widgetEl.querySelectorAll(".sol-board .sol-c").forEach((el) => {
      seen.set(el.dataset.id, { rect: el.getBoundingClientRect(), up: el.hasAttribute("data-up") });
    });
    return seen;
  }

  // FLIP: each moved card starts where it was drawn before the render and glides
  // to its new place; a card just turned face up flips in place.
  function flipFrom(seen) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    widgetEl.querySelectorAll(".sol-board .sol-c").forEach((el) => {
      const old = seen.get(el.dataset.id);
      if (!old || typeof el.animate !== "function") return;
      const rect = el.getBoundingClientRect();
      const dx = old.rect.left - rect.left;
      const dy = old.rect.top - rect.top;
      let frames = null;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        frames = [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }];
      } else if (!old.up && el.hasAttribute("data-up")) {
        frames = [{ transform: "scaleX(0.1)" }, { transform: "none" }];
      }
      if (!frames) return;
      el.classList.add("sol-fly");
      const animation = el.animate(frames, { duration: 190, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
      animation.onfinish = animation.oncancel = () => el.classList.remove("sol-fly");
    });
  }

  /* Clock: starts on the first move, stops on a win, pauses while no card is shown. */

  function elapsed() {
    return clock.banked + (clock.startedAt ? Date.now() - clock.startedAt : 0);
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  }

  function updateTime() {
    const el = widgetEl && widgetEl.querySelector("[data-sol-time]");
    if (el) el.textContent = formatTime(elapsed());
  }

  function startClock() {
    if (clock.startedAt) return;
    clock.startedAt = Date.now();
    clock.tickId = setInterval(updateTime, 500);
  }

  function stopClock() {
    if (clock.startedAt) clock.banked += Date.now() - clock.startedAt;
    clock.startedAt = 0;
    clearInterval(clock.tickId);
    clock.tickId = null;
  }

  /* Actions */

  function announce(text) {
    const live = widgetEl && widgetEl.querySelector("[data-sol-live]");
    if (live) live.textContent = text;
  }

  function nope(el) {
    announce(t("noMove"));
    if (!el) return;
    el.classList.remove("sol-nope");
    void el.offsetWidth; // restart the shake when the same card is tried twice
    el.classList.add("sol-nope");
    setTimeout(() => el.classList.remove("sol-nope"), 320);
  }

  function commit(next) {
    if (!next) return false;
    game = rules.play(game, next);
    if (rules.isWon(next)) stopClock();
    else startClock();
    render(true);
    updateTime();
    return true;
  }

  function stopAuto() {
    clearTimeout(autoTimer);
    autoTimer = null;
  }

  function drawCard(spoken) {
    stopAuto();
    if (!commit(rules.draw(game.state, drawCount))) nope(piles.stock);
    else if (spoken) announce(piles.waste.getAttribute("aria-label"));
  }

  function undoMove() {
    stopAuto();
    if (!game.history.length) return;
    game = rules.undo(game);
    if (!rules.isWon(game.state)) startClock();
    render(true);
  }

  function startNewGame() {
    stopAuto();
    const refocus = widgetEl.contains(document.activeElement);
    game = rules.newGame();
    stopClock();
    clock.banked = 0;
    lastTap = null;
    render(false);
    updateTime();
    if (refocus) focusPile("stock");
  }

  function runAutoFinish() {
    if (autoTimer) return;
    const step = () => {
      const next = widgetEl ? rules.autoFinishMove(game.state, drawCount) : null;
      // Queue the next step first so the button stays hidden while this one renders.
      autoTimer = next && !rules.isWon(next) ? setTimeout(step, 120) : null;
      if (next) commit(next);
      else if (widgetEl) render(false);
    };
    autoTimer = setTimeout(step, 0);
  }

  // A tap moves the card to its best pile. A second tap at the same spot soon
  // after is the double-tap: the first tap has already tried the foundations, so
  // it only acts when that tap moved nothing. Matching by spot rather than by
  // card keeps the second tap from catching whatever card is there now.
  function tap(from, el, x, y) {
    const now = Date.now();
    if (lastTap && now - lastTap.at < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 24) {
      const first = lastTap;
      lastTap = null;
      if (!first.moved && !commit(rules.foundationMove(game.state, from))) nope(el);
      return;
    }
    const to = rules.bestMove(game.state, from);
    const moved = Boolean(to) && commit(rules.applyMove(game.state, from, to));
    if (!moved) nope(el);
    lastTap = { at: now, x, y, moved };
  }

  function keyboardMove(key) {
    stopAuto();
    if (key === "stock") {
      drawCard(true);
      return;
    }
    const move = rules.bestMoveForPile(game.state, pileRef(key));
    if (move && commit(rules.applyMove(game.state, move.from, move.to))) {
      announce(piles[pileKey(move.to)].getAttribute("aria-label"));
    } else {
      nope(piles[key]);
    }
  }

  function pileRef(key) {
    if (key === "waste") return { type: "waste" };
    return { type: key[0] === "f" ? "foundation" : "tableau", index: Number(key.slice(1)) };
  }

  function pileKey(ref) {
    if (ref.type === "waste") return "waste";
    return (ref.type === "foundation" ? "f" : "t") + ref.index;
  }

  function parseSource(src) {
    if (src === "w") return { type: "waste" };
    if (src[0] === "f") return { type: "foundation", index: Number(src.slice(1)) };
    const [index, card] = src.slice(1).split(":").map(Number);
    return { type: "tableau", index, card };
  }

  /* Pointer input: one handler set covers mouse, pen and touch. */

  function draggedCards(from) {
    if (from.type === "tableau") return Array.from(piles["t" + from.index].children).slice(from.card);
    const el = piles[pileKey(from)].lastElementChild;
    return el ? [el] : [];
  }

  function overlap(a, b) {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 0 && height > 0 ? width * height : 0;
  }

  // The legal pile the dragged card covers most. Tableau columns reach to the
  // bottom of the board, so a short pile still catches a drop below it.
  function dropTarget(done) {
    const lead = done.cards[0].getBoundingClientRect();
    const boardBottom = widgetEl.querySelector("[data-sol-board]").getBoundingClientRect().bottom;
    const candidates = [];
    for (let index = 0; index < 4; index++) {
      candidates.push({ to: { type: "foundation", index }, rect: piles["f" + index].getBoundingClientRect() });
    }
    for (let index = 0; index < 7; index++) {
      const r = piles["t" + index].getBoundingClientRect();
      candidates.push({
        to: { type: "tableau", index },
        rect: { left: r.left, right: r.right, top: r.top, bottom: Math.max(r.bottom, boardBottom) },
      });
    }
    const ranked = candidates
      .map((candidate) => ({ to: candidate.to, area: overlap(lead, candidate.rect) }))
      .filter((candidate) => candidate.area > 0)
      .sort((a, b) => b.area - a.area);
    const hit = ranked.find((candidate) => rules.applyMove(game.state, done.from, candidate.to));
    return hit ? hit.to : null;
  }

  function onPointerDown(event) {
    if (gesture || (event.pointerType === "mouse" && event.button !== 0)) return;
    const card = event.target.closest("[data-src]");
    const stock = !card && event.target.closest('[data-sol-pile="stock"]');
    if (!card && !stock) return;
    stopAuto();
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      el: card || stock,
      from: card ? parseSource(card.dataset.src) : null,
      cards: null,
      slop: event.pointerType === "mouse" ? 4 : 8,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.id || !gesture.from) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.cards) {
      if (Math.hypot(dx, dy) < gesture.slop) return;
      gesture.cards = draggedCards(gesture.from);
      if (!gesture.cards.length) {
        gesture = null;
        return;
      }
      gesture.cards.forEach((el) => el.classList.add("sol-lift"));
    }
    event.preventDefault();
    const shift = `translate(${dx}px, ${dy}px)`;
    gesture.cards.forEach((el) => {
      el.style.transform = shift;
    });
  }

  function onPointerUp(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const done = gesture;
    gesture = null;
    if (!done.cards) {
      if (done.from) tap(done.from, done.el, done.x, done.y);
      else drawCard(false);
      return;
    }
    const to = dropTarget(done);
    // An illegal drop re-renders too, which glides the cards back home.
    if (!to || !commit(rules.applyMove(game.state, done.from, to))) render(true);
  }

  function onPointerCancel(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const done = gesture;
    gesture = null;
    if (done.cards) render(true);
  }

  /* Keyboard: one tab stop for the board, arrow keys between piles, Enter to move. */

  function focusPile(key) {
    Object.keys(piles).forEach((name) => {
      piles[name].tabIndex = name === key ? 0 : -1;
    });
    piles[key].focus();
  }

  function neighbor(key, direction) {
    const top = TOP_ROW.indexOf(key);
    if (top >= 0) {
      if (direction === "ArrowLeft") return TOP_ROW[top - 1];
      if (direction === "ArrowRight") return TOP_ROW[top + 1];
      return direction === "ArrowDown" ? "t" + TOP_COLUMNS[top] : null;
    }
    const column = Number(key.slice(1));
    if (direction === "ArrowLeft") return column > 0 ? "t" + (column - 1) : null;
    if (direction === "ArrowRight") return column < 6 ? "t" + (column + 1) : null;
    if (direction !== "ArrowUp") return null;
    // The top-row pile above this column, or the nearest one to its left.
    for (let i = TOP_COLUMNS.length - 1; i >= 0; i--) {
      if (TOP_COLUMNS[i] <= column) return TOP_ROW[i];
    }
    return null;
  }

  function onKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === "z") {
      event.preventDefault();
      undoMove();
      return;
    }
    const pile = event.target.closest("[data-sol-pile]");
    if (!pile) return;
    const key = pile.dataset.solPile;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      keyboardMove(key);
      return;
    }
    const next = neighbor(key, event.key);
    if (next && piles[next]) {
      event.preventDefault();
      focusPile(next);
    }
  }

  function onClick(event) {
    const action = event.target.closest("[data-sol-action]");
    if (action) {
      const name = action.dataset.solAction;
      if (name === "new") startNewGame();
      else if (name === "undo") undoMove();
      else if (name === "auto") runAutoFinish();
      return;
    }
    const mode = event.target.closest("[data-sol-draw]");
    if (mode) {
      drawCount = mode.dataset.solDraw === "3" ? 3 : 1;
      render(false);
    }
  }

  /* Lifecycle */

  function activateWidget(w) {
    widgetEl = w;
    piles = {};
    w.querySelectorAll("[data-sol-pile]").forEach((el) => {
      piles[el.dataset.solPile] = el;
      el.tabIndex = el.dataset.solPile === "stock" ? 0 : -1;
    });
    // A card degoog swaps in for a streamed panel keeps the game in progress.
    if (!game) {
      drawCount = w.getAttribute("data-draw-count") === "3" ? 3 : 1;
      game = rules.newGame();
    }
    const suits = w.querySelector("[data-sol-win-suits]");
    if (suits) {
      suits.innerHTML = SUITS.map(
        (suit, i) => `<span class="${isRed({ suit }) ? "sol-red" : ""}" style="--sol-i:${i}">${suitSvg(suit)}</span>`,
      ).join("");
    }
    if (!bound.has(w)) {
      bound.add(w);
      const board = w.querySelector("[data-sol-board]");
      board.addEventListener("pointerdown", onPointerDown);
      board.addEventListener("pointermove", onPointerMove);
      board.addEventListener("pointerup", onPointerUp);
      board.addEventListener("pointercancel", onPointerCancel);
      w.addEventListener("keydown", onKeyDown);
      w.addEventListener("click", onClick);
    }
    render(false);
    updateTime();
    if (game.state.moves && !rules.isWon(game.state)) startClock();
  }

  function checkWidget() {
    if (widgetEl && widgetEl.isConnected) return;
    const w = document.querySelector("[data-sol-widget]");
    if (w) {
      activateWidget(w);
      return;
    }
    if (widgetEl) {
      stopAuto();
      stopClock();
      widgetEl = null;
      gesture = null;
    }
  }

  function boot() {
    const observer = new MutationObserver(checkWidget);
    observer.observe(document.body, { childList: true, subtree: true });
    checkWidget();
  }

  boot();
})();
