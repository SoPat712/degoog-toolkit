import test from 'node:test';
import assert from 'node:assert/strict';
import FoodFacts from './food-facts/index.js';

test('Food Facts requests full-text search with projected fields and real pagination', async () => {
  const engine = new FoodFacts();
  engine.configure({pageSize:'40'});
  let pages;
  const results = await engine.executeSearch('oat milk', 2, undefined, {
    lang:'fr-FR', pagination:value=>{pages=value;},
    fetch:async (url, options) => {
      const request = new URL(url);
      assert.equal(request.origin, 'https://search.openfoodfacts.org');
      assert.equal(request.searchParams.get('q'), 'oat milk');
      assert.equal(request.searchParams.get('page'), '2');
      assert.equal(request.searchParams.get('page_size'), '40');
      assert.equal(request.searchParams.get('langs'), 'fr');
      assert.ok(request.searchParams.get('fields').includes('product_name'));
      assert.equal(options.headers.Accept, 'application/json');
      return Response.json({page_count:5,hits:[
        {code:'0012345678901', product_name:'Oat Milk', brands:['Example'], quantity:'1 l', nutriscore_grade:'b'},
        {code:'0012345678901', product_name:'duplicate'},
        {code:'invalid/path', product_name:'invalid'},
        {code:'1234'},
      ]});
    },
  });
  assert.deepEqual(pages, {total:5});
  assert.deepEqual(results, [{title:'Oat Milk',url:'https://world.openfoodfacts.org/product/0012345678901',snippet:'Example · 1 l · Nutri-Score B',source:'Food Facts'}]);
});

test('Food Facts distinguishes rate limits, incomplete searches, and malformed responses from empty results', async () => {
  for (const [response,status] of [
    [new Response('',{status:429}),'rate_limited'],
    [Response.json({hits:[],timed_out:true}),'timeout'],
    [Response.json({errors:[{title:'bad request'}]}),'parse_error'],
    [new Response('<html>blocked</html>'),'parse_error'],
  ]) {
    await assert.rejects(new FoodFacts().executeSearch('milk',1,undefined,{fetch:async()=>response}),error=>error.status===status);
  }
  assert.deepEqual(await new FoodFacts().executeSearch('unknown',1,undefined,{fetch:async()=>Response.json({hits:[]})}),[]);
});

test('Food Facts forwards cancellation and performs no request after cancellation or for blank input', async () => {
  const engine = new FoodFacts();
  const controller = new AbortController();
  controller.abort();
  let fetched = false;
  await assert.rejects(engine.executeSearch('milk',1,undefined,{signal:controller.signal,fetch:async()=>{fetched=true;}}), {name:'AbortError'});
  assert.deepEqual(await engine.executeSearch('  ',1,undefined,{fetch:async()=>{fetched=true;}}),[]);
  assert.equal(fetched,false);
  const signal = new AbortController().signal;
  await engine.executeSearch('milk',1,undefined,{signal,fetch:async(_url,options)=>{assert.equal(options.signal,signal);return Response.json({hits:[]});}});
});
