import assert from "node:assert/strict";
import test from "node:test";
import { parseBookQuery, slot } from "./index.js";

test("booking requests, compounds and how-to questions are not title searches", async () => {
  for (const query of [
    "book train tickets", "book a cheap flight", "book uber", "book now", "book doctor appointment",
    "book flights to paris", "book the hotel", "book a table for two", "book club", "book cover maker",
    "book report", "book of mormon", "address book", "my address book", "phone book", "guest book",
    "face book", "year book", "graphic novel", "light novel", "novel coronavirus", "how to write a book",
    "write a book", "publish my book", "book a flight", "book hotel", "I need a book", "recommend a book",
  ]) {
    assert.equal(parseBookQuery(query), null, query);
    assert.equal(slot.trigger(query), false, query);
    let calls = 0;
    const rendered = await slot.execute(query, { results: [], fetch: () => { calls++; throw new Error("must not fetch"); } });
    assert.equal(rendered.html, "", query);
    assert.equal(calls, 0, query);
  }
});

test("explicit titles, ISBNs and authors still parse", () => {
  for (const [query, kind, term] of [
    ["9780140328721", "isbn", "9780140328721"],
    ["book Dune", "title", "Dune"],
    ["book the hobbit", "title", "the hobbit"],
    ["The Hobbit book", "title", "The Hobbit"],
    ["the jungle book", "title", "the jungle"],
    ["the girl on the train book", "title", "the girl on the train"],
    ["a court of thorns and roses book", "title", "a court of thorns and roses"],
    ["book: a court of thorns and roses", "title", "a court of thorns and roses"],
    ["novel: dune", "title", "dune"],
    ["books by roald dahl", "author", "roald dahl"],
  ]) assert.deepEqual(parseBookQuery(query), { kind, term }, query);
});
