import assert from "node:assert/strict";
import test from "node:test";
import { slot } from "./index.js";

test("a bare tempo or bpm query needs a BPM number or the word metronome", () => {
  for (const query of ["tempo", "Tempo", "bpm", "song tempo", "tempo app", "metronome 20 bpm", "metronome 241 bpm"]) {
    assert.equal(slot.trigger(query), false, query);
  }
  for (const query of ["metronome", "online metronome", "tap tempo", "metronome 120 bpm", "120 bpm", "tempo 90", "bpm 120"]) {
    assert.equal(slot.trigger(query), true, query);
  }
});
