/* NRLAB HYBRID — version 1. Local data stays on THIS device until synced. */
(function(global){
 'use strict';
 const NAME='nrlab-hybrid-v1', VERSION=1, ACTIVE='nrlab-hybrid-last-user';
 function db(){
  return new Promise((resolve,reject)=>{
   const req=indexedDB.open(NAME,VERSION);
   req.onupgradeneeded=()=>{
    const d=req.result;
    if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
    if(!d.objectStoreNames.contains('orders')) d.createObjectStore('orders',{keyPath:'id'});
   };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Не удалось открыть локальное хранилище'));
   req.onblocked=()=>reject(Error('Закройте другие вкладки NRLAB и повторите попытку'));
  });
 }
 async function run(store,mode,fn){
  const d=await db();
  try{
   return await new Promise((resolve,reject)=>{
    const tx=d.transaction(store,mode),req=fn(tx.objectStore(store));
    let result;
    req.onsuccess=()=>{result=req.result};
    req.onerror=()=>reject(req.error||Error('Ошибка локального хранилища'));
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error||Error('Ошибка записи на устройство'));
    tx.onabort=()=>reject(tx.error||Error('Недостаточно места или запись отменена'));
   });
  }finally{d.close()}
 }
 const get=(store,key)=>run(store,'readonly',s=>s.get(key));
 const put=(store,value)=>run(store,'readwrite',s=>s.put(value));
 const del=(store,key)=>run(store,'readwrite',s=>s.delete(key));
 const all=store=>run(store,'readonly',s=>s.getAll());
 async function cacheSnapshot(data){
  if(!data?.p?.id||data.p.status!=='approved'||!data.p.email_confirmed)return;
  const ownerId=data.p.id;
  await put('meta',{key:'snapshot-'+ownerId,value:{
   p:data.p,clinics:data.clinics||[],catalog:data.catalog||[],cachedAt:Date.now()
  }});
  try{localStorage.setItem(ACTIVE,ownerId)}catch(_){}
 }
 async function lastSnapshot(){
  let ownerId;
  try{ownerId=localStorage.getItem(ACTIVE)}catch(_){}
  if(!ownerId)return null;
  return (await get('meta','snapshot-'+ownerId))?.value||null;
 }
 function currentOwner(){try{return localStorage.getItem(ACTIVE)}catch(_){return null}}
 function clearActive(){try{localStorage.removeItem(ACTIVE)}catch(_){}}
 async function addOrder(order){
  if(!order?.id||!order?.ownerId||!order?.clinicId||!Array.isArray(order.items)||!order.items.length)throw Error('Укажите клинику и работы');
  if(!Array.isArray(order.files))order.files=[];
  for(const f of order.files)if(!f.file||f.file.size>25000000)throw Error('Размер каждого файла не должен превышать 25 МБ');
  order.status='pending';order.remoteId=null;order.error='';order.updatedAt=Date.now();
  await put('orders',order);
  return order;
 }
 async function orders(ownerId){if(!ownerId)return[];return (await all('orders')).filter(x=>x.ownerId===ownerId).sort((a,b)=>b.createdAt-a.createdAt)}
 async function count(ownerId){return (await orders(ownerId)).length}
 const api={db,get,put,del,all,cacheSnapshot,lastSnapshot,currentOwner,clearActive,addOrder,orders,count,
  update:order=>put('orders',{...order,updatedAt:Date.now()}),remove:id=>del('orders',id)};
 global.NRLABOffline=api;
})(window);
