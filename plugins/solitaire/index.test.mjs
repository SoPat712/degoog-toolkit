import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseSolitaireQuery, slot } from "./index.js";

// card.js keeps the rules as pure functions ahead of its DOM boot; swapping the
// boot call for a hook runs them without a page.
const source = await readFile(new URL("./card.js", import.meta.url), "utf8");
const marker = "\n  boot();\n";
assert.ok(source.includes(marker), "card.js boots through a single boot() call");
const context = vm.createContext({});
vm.runInContext(source.replace(marker, "\n  globalThis.__rules = rules;\n"), context);
const rules = context.__rules;

// vm objects come from another realm, so compare them as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
const card = (id, up = true) => ({ suit: id[0], rank: Number(id.slice(1)), up });
const ids = (pile) => Array.from(pile, (c) => rules.cardId(c));

function board({ stock = [], waste = [], foundations = [[], [], [], []], tableau = [] } = {}) {
  const piles = [...tableau];
  while (piles.length < 7) piles.push([]);
  return { stock, waste, foundations, tableau: piles, moves: 0 };
}

function wonBoard() {
  return board({
    foundations: ["S", "H", "D", "C"].map((suit) =>
      Array.from({ length: 13 }, (_, i) => card(suit + (i + 1))),
    ),
  });
}

test("the slot triggers on solitaire game queries only", () => {
  for (const query of [
    "solitaire", "Solitaire!", "play solitaire", "klondike", "klondike solitaire",
    "play klondike", "solitaire game", "play a game of solitaire", "!solitaire",
    "jouer au solitaire", "jugar al solitario",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of [
    "solitaire ring", "spider solitaire", "freecell solitaire", "solitaire rules",
    "how to play solitaire", "play solitaire online", "klondike gold rush",
    "klondike bar", "solitario", "!solitaireplus",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("execute fills the draw setting and respects the enabled toggle", async () => {
  await slot.init({ template: '<div class="sol-card" data-draw-count="{{draw_count}}"></div>' });
  slot.configure({ enabled: "true", drawCount: "3" });
  assert.match((await slot.execute("solitaire", {})).html, /data-draw-count="3"/);
  slot.configure({ drawCount: "7" });
  assert.match((await slot.execute("solitaire", {})).html, /data-draw-count="1"/);
  assert.deepEqual(await slot.execute("solitaire", { tab: "images" }), { title: "", html: "" });
  assert.deepEqual(await slot.execute("solitaire ring", {}), { title: "", html: "" });
  slot.configure({ enabled: "false" });
  assert.equal(slot.trigger("solitaire"), false);
  assert.equal(parseSolitaireQuery("solitaire"), true);
  slot.configure({});
  assert.equal(slot.trigger("solitaire"), true);
});

test("a deal uses all 52 cards once with Klondike pile sizes", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const state = plain(rules.deal(rules.seededRandom(seed)));
    assert.deepEqual(state.tableau.map((pile) => pile.length), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(state.stock.length, 24);
    assert.deepEqual(state.waste, []);
    assert.deepEqual(state.foundations, [[], [], [], []]);
    const all = [...state.stock, ...state.tableau.flat()].map((c) => c.suit + c.rank);
    assert.equal(all.length, 52);
    assert.equal(new Set(all).size, 52);
    for (const pile of state.tableau) {
      assert.deepEqual(pile.map((c) => c.up), pile.map((_, i) => i === pile.length - 1));
    }
    assert.ok(state.stock.every((c) => !c.up));
  }
  assert.notDeepEqual(
    plain(rules.deal(rules.seededRandom(1)).stock),
    plain(rules.deal(rules.seededRandom(2)).stock),
  );
});

test("tableau moves need alternating colours one rank down, and kings for empty piles", () => {
  const state = board({ tableau: [[card("S8")], [card("H7")], [card("D7")], [card("C7")], [], [card("H13")], [card("H12")]] });
  const from = (index) => ({ type: "tableau", index, card: 0 });
  const to = (index) => ({ type: "tableau", index });

  const next = rules.applyMove(state, from(1), to(0));
  assert.deepEqual(ids(next.tableau[0]), ["S8", "H7"]);
  assert.deepEqual(ids(next.tableau[1]), []);
  assert.equal(next.moves, 1);
  assert.notEqual(rules.applyMove(state, from(2), to(0)), null, "a diamond 7 also fits a black 8");
  assert.equal(rules.applyMove(state, from(3), to(0)), null, "same colour");
  assert.equal(rules.applyMove(state, from(0), to(1)), null, "rank going up");
  assert.equal(rules.applyMove(state, from(1), to(4)), null, "only a king may fill an empty pile");
  assert.deepEqual(ids(rules.applyMove(state, from(5), to(4)).tableau[4]), ["H13"]);
  assert.equal(rules.applyMove(state, from(6), to(5)), null, "queen on a king of the same colour");
  assert.equal(rules.applyMove(state, from(0), to(0)), null, "onto its own pile");
  // The original state is untouched, so undo can return to it.
  assert.deepEqual(ids(state.tableau[0]), ["S8"]);
  assert.equal(state.moves, 0);
});

test("face-up runs move together and the uncovered card turns over", () => {
  const state = board({
    tableau: [
      [card("D4", false), card("S10"), card("H9"), card("C8")],
      [card("D11")],
      [card("S10"), card("H8")],
    ],
  });
  const next = rules.applyMove(state, { type: "tableau", index: 0, card: 1 }, { type: "tableau", index: 1 });
  assert.deepEqual(ids(next.tableau[1]), ["D11", "S10", "H9", "C8"]);
  assert.deepEqual(plain(next.tableau[0]), [{ suit: "D", rank: 4, up: true }]);
  assert.equal(
    rules.applyMove(state, { type: "tableau", index: 2, card: 0 }, { type: "tableau", index: 1 }),
    null,
    "a broken run cannot move",
  );
  assert.equal(
    rules.applyMove(state, { type: "tableau", index: 0, card: 0 }, { type: "tableau", index: 1 }),
    null,
    "face-down cards cannot move",
  );
  assert.equal(
    rules.applyMove(state, { type: "tableau", index: 0, card: 2 }, { type: "foundation", index: 0 }),
    null,
    "only single cards go to a foundation",
  );
});

test("foundations build up by suit from the ace", () => {
  const state = board({ waste: [card("H2"), card("H1")], tableau: [[card("S2")]] });
  assert.equal(rules.applyMove(state, { type: "tableau", index: 0, card: 0 }, { type: "foundation", index: 0 }), null);
  const ace = rules.applyMove(state, { type: "waste" }, { type: "foundation", index: 2 });
  assert.deepEqual(ids(ace.foundations[2]), ["H1"]);
  assert.deepEqual(ids(ace.waste), ["H2"]);
  const two = rules.foundationMove(ace, { type: "waste" });
  assert.deepEqual(ids(two.foundations[2]), ["H1", "H2"]);
  assert.equal(
    rules.applyMove(ace, { type: "tableau", index: 0, card: 0 }, { type: "foundation", index: 2 }),
    null,
    "suit must match",
  );
  assert.equal(
    rules.applyMove(two, { type: "foundation", index: 2 }, { type: "foundation", index: 0 }),
    null,
    "no moves between foundations",
  );
  const back = rules.applyMove(
    board({ foundations: [[card("H1"), card("H2"), card("H3")], [], [], []], tableau: [[card("S4")]] }),
    { type: "foundation", index: 0 },
    { type: "tableau", index: 0 },
  );
  assert.deepEqual(ids(back.tableau[0]), ["S4", "H3"], "a foundation card may come back down");
});

test("the stock draws one or three cards and the waste recycles", () => {
  const stock = ["C1", "C2", "C3", "C4", "C5"].map((id) => card(id, false));
  const one = rules.draw(board({ stock }), 1);
  assert.deepEqual(ids(one.waste), ["C5"]);
  assert.ok(one.waste[0].up);
  assert.equal(one.stock.length, 4);

  const three = rules.draw(board({ stock }), 3);
  assert.deepEqual(ids(three.waste), ["C5", "C4", "C3"], "the packet flips, so its third card is on top");
  assert.deepEqual(ids(three.stock), ["C1", "C2"]);
  const rest = rules.draw(three, 3);
  assert.deepEqual(ids(rest.waste), ["C5", "C4", "C3", "C2", "C1"]);
  assert.equal(rest.stock.length, 0);

  const recycled = rules.draw(rest, 3);
  assert.deepEqual(ids(recycled.stock), ["C1", "C2", "C3", "C4", "C5"]);
  assert.ok(recycled.stock.every((c) => !c.up));
  assert.equal(recycled.waste.length, 0);
  assert.deepEqual(ids(rules.draw(recycled, 3).waste), ids(three.waste), "the next pass repeats the order");
  assert.equal(rules.draw(board(), 1), null, "nothing to draw or recycle");
});

test("a tap picks the foundation first, then a tableau pile, never a pointless move", () => {
  const state = board({
    waste: [card("H1")],
    tableau: [[card("S9")], [card("H8")], [], [card("C13")], [card("D2", false), card("D13")]],
  });
  assert.deepEqual(plain(rules.bestMove(state, { type: "waste" })), { type: "foundation", index: 0 });
  assert.deepEqual(plain(rules.bestMove(state, { type: "tableau", index: 1, card: 0 })), { type: "tableau", index: 0 });
  assert.equal(rules.bestMove(state, { type: "tableau", index: 3, card: 0 }), null, "king already starts its pile");
  // Searching rightwards from pile 5, the first empty pile is pile 6.
  assert.deepEqual(plain(rules.bestMove(state, { type: "tableau", index: 4, card: 1 })), { type: "tableau", index: 5 });
  assert.equal(rules.bestMove(state, { type: "tableau", index: 0, card: 0 }), null);
  assert.equal(rules.foundationMove(state, { type: "tableau", index: 1, card: 0 }), null, "double-tap needs a foundation fit");

  const keyboard = plain(rules.bestMoveForPile(state, { type: "tableau", index: 4 }));
  assert.deepEqual(keyboard, { from: { type: "tableau", index: 4, card: 1 }, to: { type: "tableau", index: 5 } });
  assert.equal(rules.bestMoveForPile(state, { type: "tableau", index: 2 }), null);
});

test("undo steps back through every committed state", () => {
  let game = rules.newGame(rules.seededRandom(9));
  const start = plain(game.state);
  game = rules.play(game, rules.draw(game.state, 1));
  game = rules.play(game, rules.draw(game.state, 1));
  assert.equal(game.state.moves, 2);
  assert.equal(game.history.length, 2);
  assert.equal(rules.play(game, null), game, "an illegal move leaves the game alone");

  game = rules.undo(game);
  assert.equal(game.state.moves, 1);
  assert.equal(game.state.waste.length, 1);
  game = rules.undo(game);
  assert.deepEqual(plain(game.state), start);
  assert.equal(rules.undo(game), game, "nothing left to undo");
});

test("a full set of foundations wins, and auto-finish plays out a solved board", () => {
  assert.equal(rules.isWon(wonBoard()), true);
  assert.equal(rules.isWon(rules.deal(rules.seededRandom(3))), false);
  assert.equal(rules.canAutoFinish(wonBoard(), 1), false, "nothing left to finish");

  // Everything face up, with the spade run split between two piles and the
  // last three hearts in the stock.
  const foundations = wonBoard().foundations.map((pile) => pile.slice());
  const spades = foundations[0].splice(8);
  const hearts = foundations[1].splice(10);
  const nearlyDone = board({
    foundations,
    stock: hearts.map((c) => ({ ...c, up: false })),
    tableau: [spades.slice(3).reverse(), spades.slice(0, 3).reverse()],
  });
  assert.equal(rules.canAutoFinish(nearlyDone, 1), true);
  let state = nearlyDone;
  for (let step = 0; step < 100 && !rules.isWon(state); step++) {
    state = rules.autoFinishMove(state, 1);
  }
  assert.equal(rules.isWon(state), true);

  const hidden = board({ tableau: [[card("S1", false), card("H2")]] });
  assert.equal(rules.canAutoFinish(hidden, 1), false, "face-down cards block auto-finish");
});
