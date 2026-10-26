/* Image-only cards, with temporary local snapshot rendering for unavailable HTML thumbnails. */
'use strict';
window.AcmePreviews=(()=>{
  const memory=new Map(),inflight=new Map(),failures=new Map(),metadata=new Map();
  const ttl=15*60*1000,maxBytes=24*1024*1024,maxItems=128;
  const cacheName='acme-artwork-previews-v1';
  let bytes=0;
  function remember(url,blob,at=Date.now()){
    if(blob.size>maxBytes)return;
    const old=memory.get(url);if(old)bytes-=old.blob.size;
    memory.delete(url);memory.set(url,{blob,at});bytes+=blob.size;
    while(bytes>maxBytes||memory.size>maxItems){const key=memory.keys().next().value;bytes-=memory.get(key).blob.size;memory.delete(key)}
  }
  async function stored(url){
    const hit=memory.get(url);
    if(hit&&Date.now()-hit.at<ttl){memory.delete(url);memory.set(url,hit);return hit.blob}
    try{
      const cache=await caches.open(cacheName),response=await cache.match(url);
      if(!response)return null;
      const at=Number(response.headers.get('X-Acme-Cached-At'));
      if(!at||Date.now()-at>ttl){await cache.delete(url);return null}
      const blob=await response.blob();if(!blob.type.startsWith('image/')||!blob.size)return null;
      blob.previewSource=response.headers.get('X-Acme-Preview-Source')||'api';remember(url,blob,at);return blob;
    }catch{return null}
  }
  async function persist(url,blob){
    // Cache only small thumbnail/fallback images, with a bounded entry count.
    if(blob.size>512*1024)return;
    try{
      const cache=await caches.open(cacheName);
      await cache.put(url,new Response(blob,{headers:{'Content-Type':blob.type,'X-Acme-Cached-At':String(Date.now()),'X-Acme-Preview-Source':blob.previewSource||'api'}}));
      const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-128)))await cache.delete(key);
    }catch{} // Private browsing / quota limits must never prevent an image loading.
  }
  function aborted(){return new DOMException('Preview cancelled','AbortError')}
  function waitFor(promise,signal){
    if(!signal)return promise;if(signal.aborted)return Promise.reject(aborted());
    return new Promise((resolve,reject)=>{const abort=()=>reject(aborted());signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))});
  }
  async function image(url,{signal,persistent=false,force=false,timeout=20000}={}){
    if(signal?.aborted)throw aborted();
    const hit=persistent?await stored(url):memory.get(url);
    const blob=hit instanceof Blob?hit:hit&&Date.now()-hit.at<ttl?hit.blob:null;
    if(signal?.aborted)throw aborted();if(blob)return blob;
    if(!force&&failures.get(url)>Date.now())throw Error('Preview service is cooling down');
    let record=inflight.get(url);
    if(!record){
      const controller=new AbortController();record={controller,users:0,done:false};
      record.promise=(async()=>{
        const response=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]),credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok){const error=Error('Preview HTTP '+response.status);error.status=response.status;throw error}
        if(!(response.headers.get('Content-Type')||'').toLowerCase().startsWith('image/'))throw Error('Preview response is not an image');
        const blob=await response.blob();if(!blob.size)throw Error('Empty preview');
        remember(url,blob);failures.delete(url);if(persistent)persist(url,blob);return blob;
      })();
      inflight.set(url,record);
      record.promise.catch(error=>{if(error.name!=='AbortError')failures.set(url,Date.now()+60000)}).finally(()=>{record.done=true;if(inflight.get(url)===record)inflight.delete(url)});
    }
    record.users++;
    try{return await waitFor(record.promise,signal)}finally{record.users--;if(!record.users&&!record.done){if(inflight.get(url)===record)inflight.delete(url);record.controller.abort()}}
  }
  function imageURI(value){
    if(typeof value!=='string'||!value.trim()||value==='content://self')return null;
    let text=value.trim();
    if(text.startsWith('ipfs://'))text='https://ipfs.io/ipfs/'+text.slice(7).replace(/^ipfs\//,'');
    else if(text.startsWith('ar://'))text='https://arweave.net/'+text.slice(5);
    try{const url=new URL(text);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
  }
  function cortexImage(origin,asset){
    const key=origin+':'+asset;let record=metadata.get(key);
    if(!record||Date.now()-record.at>ttl){
      const promise=(async()=>{
        const response=await fetch(origin+'/api/assets/'+encodeURIComponent(asset)+'/cortex',{signal:AbortSignal.timeout(7000),credentials:'omit'});
        if(!response.ok)throw Error('Image metadata unavailable');const data=await response.json();
        if(data.error||data.result?.asset!==asset)throw Error('Image metadata does not match asset');
        return imageURI(data.result.image_uri);
      })();record={at:Date.now(),promise};metadata.set(key,record);
      if(metadata.size>100)metadata.delete(metadata.keys().next().value);
      promise.catch(()=>{if(metadata.get(key)===record)metadata.delete(key)});
    }
    return record.promise;
  }
  async function load({url,origin,asset,html=false,thumbnail=false,signal,force=false}){
    if(!html)return image(url,{signal,persistent:thumbnail,force});
    const hit=await stored(url);if(signal?.aborted)throw aborted();if(hit)return hit;
    // Use a cached server image immediately. A cold server renderer must not
    // hold the gallery hostage: race it against a bounded local snapshot job.
    const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    let timer;
    const remote=image(url,{signal:combined,persistent:true,force,timeout:45000});
    const local=new Promise((resolve,reject)=>{
      let started=false;
      const start=()=>{if(started)return;started=true;clearTimeout(timer);if(combined.aborted){reject(aborted());return}Promise.resolve().then(()=>AcmeHtmlThumbnails.render({origin,asset,signal:combined})).then(resolve,reject)};
      timer=setTimeout(start,1800);remote.catch(start);
      combined.addEventListener('abort',()=>{clearTimeout(timer);if(!started)reject(aborted())},{once:true});
    });
    const poster=remote.catch(async error=>{if(combined.aborted)throw aborted();let fallback;try{fallback=await waitFor(cortexImage(origin,asset),combined)}catch{throw error}if(!fallback||fallback===url)throw error;const blob=await image(fallback,{signal:combined,persistent:true,force,timeout:12000});blob.previewSource='cortex';return blob});
    try{const blob=await Promise.any([remote,local,poster]);if(signal?.aborted)throw aborted();remember(url,blob);persist(url,blob);return blob}
    catch(error){if(signal?.aborted)throw aborted();throw error.errors?.find(e=>e.status)||error.errors?.find(e=>e.name==='TimeoutError')||error}
    finally{clearTimeout(timer);controller.abort()}
  }

  return {load,imageURI};
})();
