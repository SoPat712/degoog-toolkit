const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const base = new URL('../plugins/tmdb/', import.meta.url).pathname;
const {default:slot,routes}=await import(pathToFileURL(base+'index.js'));
slot.configure({apiKey:'fixture'});
await slot.init({template:'<div class="tmdb-result">{{content}}</div>',apiBase:'/api/plugin/store-tmdb',readFile:f=>readFile(base+f,'utf8'),fetch:async address=>{
 const u=new URL(address); const p=u.pathname;
 if (/\/person\/1$/.test(p))return Response.json({id:1,name:'Beispiel Schauspieler',known_for_department:'Acting',birthday:'1980-01-01',biography:'Eine Biografie.'});
 if(p.endsWith('/combined_credits'))return Response.json({cast:[{id:10,media_type:'movie',title:'Beispielfilm',release_date:'2024-01-01'},{id:20,media_type:'tv',name:'Beispielserie'}]});
 if (/\/movie\/10$/.test(p))return Response.json({id:10,title:'Beispielfilm',overview:'Ein Film.',runtime:150,release_date:'2024-01-01'});
 if (/\/tv\/20$/.test(p))return Response.json({id:20,name:'Beispielserie',overview:'Eine Serie.',seasons:[]});
 if(p.endsWith('/credits'))return Response.json({cast:[{id:1,name:'Beispiel Schauspieler'}],crew:[]});
 return Response.json({results:[],profiles:[],posters:[],backdrops:[]});
}});
async function panel(type,id){const r=await routes.find(r=>r.path===type).handler(new Request(`https://local.test/api/plugin/store-tmdb/${type}?id=${id}&lang=de-DE`));return await r.json();}
const initial=await panel('movie',10);
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1200,height:900}});
let failures=false, calls=0;
await page.route('https://local.test/**',async route=>{
 const u=new URL(route.request().url());
 if(u.pathname==='/'){return route.fulfill({contentType:'text/html',body:`<html lang="de-DE"><style>:root{--bg:#fff;--bg-light:#f6f6f6;--text-primary:#222;--text-secondary:#555;--border:#ddd;--text-link:#1a73e8}body{margin:20px}${await readFile(base+'style.css','utf8')}</style><div class="tmdb-result">${initial.html}</div></html>`});}
 if(!["movie","tv","person"].includes(u.pathname.split("/").at(-1)))return route.fulfill({status:204,body:""});
 assert.equal(u.searchParams.get("lang"), "de-DE");
 calls++;
 await new Promise(r=>setTimeout(r,80));
 if(failures)return route.fulfill({status:503,body:'offline'});
 const data=await panel(u.pathname.split('/').at(-1),u.searchParams.get('id'));
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('https://local.test/');
await page.addScriptTag({content:(await readFile(base+'script.js','utf8')).replaceAll('__PLUGIN_ID__',JSON.stringify('store-tmdb'))});
await page.locator('[data-tmdb-nav="person"]').focus();await page.keyboard.press('Enter');
await page.waitForSelector('.tmdb-panel--person');
await page.getByRole('tab',{name:'Film & Fernsehen'}).click();
await page.locator('[data-tmdb-nav="movie"]').focus();
await page.keyboard.press('Space');
await page.waitForSelector('.tmdb-panel:not(.tmdb-panel--person)');
await page.locator('[data-tmdb-back]').click();
await page.waitForSelector('.tmdb-panel--person');
const before=calls;
await page.locator('[data-tmdb-nav="movie"]').evaluate(el=>{el.click();el.click();});
await page.waitForSelector('.tmdb-panel:not(.tmdb-panel--person)');assert.equal(calls,before+1);
await page.locator('[data-tmdb-back]').click();await page.waitForSelector('.tmdb-panel--person');
assert.ok(await page.locator('[data-tmdb-nav="tv"]').isVisible());
failures=true;await page.locator('[data-tmdb-nav="tv"]').click();await page.waitForSelector('.tmdb-navigation-error');
assert.equal(await page.locator('.tmdb-panel--person').count(),1);
assert.match(await page.locator('.tmdb-navigation-error').textContent(),/erneut versuchen/i);
failures=false;await page.locator('.tmdb-navigation-error button').click();await page.waitForSelector('.tmdb-panel--tv');
await page.locator('[data-tmdb-back]').click();await page.waitForSelector('.tmdb-panel--person');
await page.locator('[data-tmdb-back]').click();assert.equal(await page.locator('[data-tmdb-back]').count(),0);
await page.setViewportSize({width:390,height:844});
await page.locator('[data-tmdb-nav="person"]').click();await page.waitForSelector('.tmdb-panel--person');
await page.getByRole('tab',{name:'Film & Fernsehen'}).click();
await page.screenshot({path:'/tmp/tmdb-mobile-films.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.deepEqual(errors,[]);
console.log('PASS: keyboard, movie/person/TV, back stack, overlapping clicks, error/retry, mobile width.');

} finally { await browser.close(); }
