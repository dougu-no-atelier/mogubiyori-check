'use strict';
// 公開のたびに必ず変える（変えないと既存の端末に新版が届かない）。index.html の meta mogubiyori-version と設定画面の版表示もそろえる。
const VERSION='mogubiyori-web-1.5.7';
const FILES=['./','./index.html','./app.js','./quick.js','./drafts.js','./local-store.js','./web.js','./style.css','./icon.svg','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable.png','./guide.html','./privacy.html','./guide.css'];
const urls=FILES.map(p=>new URL(p,self.registration.scope).href);
// Include the scope in the name so another install on the same origin is untouched.
const CACHE=VERSION+':'+self.registration.scope;
// Take over as soon as the new version is cached; web.js reloads open pages once on controllerchange.
// 1.5.5: fetch each file with cache:'reload' so a new version never assembles a mixed cache from a stale HTTP cache (a 1.5.3 install on the user's phone mixed old and new files and the update never landed). Fall back to addAll if a reload fetch fails.
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);try{await Promise.all(urls.map(async u=>{const r=await fetch(u,{cache:'reload'});if(!r.ok)throw new Error(u);await c.put(u,r)}))}catch{await c.addAll(urls)}await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('mogubiyori-web-')&&k.endsWith(':'+self.registration.scope)&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);u.search='';if(!urls.includes(u.href))return;
 // One version's HTML and scripts travel together; a waiting worker owns the update.
 e.respondWith((async()=>{const cache=await caches.open(CACHE),hit=await cache.match(u.href);return hit||fetch(e.request)})());
});
