import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { slot } from "./index.js";

test("the slot needs game intent, not a bare animal name", () => {
  for (const query of ["play snake", "play snake!", "snake game", "play a game of snake", "jugar serpiente"]) {
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of ["snake", "serpent", "Snake?", "snakes", "snake plant", "snake game strategy", "!snakeoil"]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

async function loadGame() {
  const marker = "var observer = new MutationObserver(checkWidget);";
  const source = (await readFile(new URL("./script.js", import.meta.url), "utf8")).replace(
    marker,
    `globalThis.__game = { state, updateSnake, startGame, initFromWidget };\n${marker}`,
  );
  assert.ok(source.includes("globalThis.__game"), "test hook installed");
  const attributes = {
    "data-initial-speed": "145", "data-grid-cols": "15", "data-grid-rows": "17",
    "data-cell-px": "22", "data-board-preset": "standard",
  };
  const widget = {
    isConnected: true, querySelector: () => null, querySelectorAll: () => [],
    getAttribute: (name) => attributes[name] ?? null, setAttribute() {}, focus() {},
  };
  const clock = { now: 0 };
  const context = {
    document: { addEventListener() {}, querySelector: () => widget, body: {} },
    window: {}, console, MutationObserver: class { observe() {} },
    performance: { now: () => clock.now }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const game = context.__game;
  game.initFromWidget(widget);
  game.startGame();
  return { game, clock };
}

test("moving into the cell the tail is leaving is not a collision", async () => {
  const { game, clock } = await loadGame();
  const { state } = game;
  // Head (2,2) turns left into (1,2), which the tail vacates on this tick.
  state.snake = [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }];
  state.direction = { x: -1, y: 0 };
  state.directionQueue = [];
  state.apple = { x: 10, y: 10 };
  clock.now = 1000;
  game.updateSnake();
  assert.equal(state.gameOver, false);
  assert.deepEqual({ ...state.snake[0] }, { x: 1, y: 2 });
  assert.equal(state.snake.length, 4);
});

test("running into the body still ends the game", async () => {
  const { game, clock } = await loadGame();
  const { state } = game;
  // Head (2,2) turns up into (2,1), which stays occupied by the body.
  state.snake = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }];
  state.direction = { x: 0, y: -1 };
  state.directionQueue = [];
  state.apple = { x: 10, y: 10 };
  for (const now of [1000, 1100]) {
    clock.now = now;
    game.updateSnake();
  }
  assert.equal(state.gameOver, true);
});
