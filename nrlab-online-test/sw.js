const CACHE='nrlab-hybrid-shell-v1';
const CORE=['./offline.html','./offline-store.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);await cache.addAll(CORE);
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith('nrlab-hybrid-')&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  event.respondWith((async()=>{
   try{
    const response=await fetch(req);
    if(response.ok){const cache=await caches.open(CACHE);await cache.put(req,response.clone());}
    return response;
   }catch(_){
    const cache=await caches.open(CACHE);
    return await cache.match('./offline.html')||Response.error();
   }
  })());
  return;
 }
 if(CORE.some(p=>url.pathname.endsWith(p.slice(1)))){
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req);
    return cached||fetch(req);
  })());
 }
});