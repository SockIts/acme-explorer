/* Generate static gallery images when the remote HTML thumbnail renderer stalls.
   Only three temporary sandboxed documents may render at once; none stay in cards. */
'use strict';
window.AcmeHtmlThumbnails=(()=>{
  const jobs=[],documents=new Map();let active=0;
  const abortError=()=>new DOMException('Preview cancelled','AbortError');
  function wait(promise,signal){if(signal.aborted)return Promise.reject(abortError());return new Promise((resolve,reject)=>{const abort=()=>reject(abortError());signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))})}
  async function seed(asset){const bytes=new TextEncoder().encode(asset);const digest=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)):sha256(bytes);return '0x'+Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('')}
  // SHA-256 fallback for local HTTP previews; seeds are public, never credentials.
  function sha256(bytes){
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;const view=new DataView(padded.buffer);view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(padded.length-4,bytes.length*8);
    const r=(x,n)=>(x>>>n)|(x<<(32-n)),w=new Uint32Array(64);
    for(let offset=0;offset<padded.length;offset+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(r(a,7)^r(a,18)^(a>>>3))+w[i-7]+(r(b,17)^r(b,19)^(b>>>10)))>>>0}let [a,b,c,d,e,f,g,z]=h;for(let i=0;i<64;i++){const t=(z+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,u=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0}for(const [i,v] of [a,b,c,d,e,f,g,z].entries())h[i]=(h[i]+v)>>>0}
    const out=new Uint8Array(32),result=new DataView(out.buffer);h.forEach((v,i)=>result.setUint32(i*4,v));return out;
  }
  function render(options){const signal=AbortSignal.any([options.signal,AbortSignal.timeout(30000)]);const document=prepared(options.origin,options.asset,signal);document.catch(()=>{});return new Promise((resolve,reject)=>{jobs.push({...options,signal,document,resolve,reject});pump()})}
  function pump(){while(active<3&&jobs.length){const job=jobs.shift();if(job.signal.aborted){job.reject(abortError());continue}active++;generate(job).then(job.resolve,job.reject).finally(()=>{active--;pump()})}}
  async function prepared(origin,asset,signal){
    const key=origin+':'+asset;let record=documents.get(key),html=record&&Date.now()-record.at<900000?record.promise:null;
    if(!html){html=fetch(origin+'/api/assets/'+encodeURIComponent(asset)+'/content',{signal,credentials:'omit'}).then(async response=>{if(!response.ok)throw Error('Artwork unavailable');return response.text()});documents.set(key,{promise:html,at:Date.now()});if(documents.size>80)documents.delete(documents.keys().next().value);html.catch(()=>{if(documents.get(key)?.promise===html)documents.delete(key)})}
    const [text,runtime,context]=await wait(Promise.all([html,interactiveRuntime(origin),interactiveAssetContext(asset,origin,signal)]),signal);
    const doc=new DOMParser().parseFromString(text,'text/html');if(!doc.querySelector('base')){const base=doc.createElement('base');base.href=origin+'/api/assets/'+encodeURIComponent(asset)+'/content';doc.head.prepend(base)}
    const source=contextualRuntime(runtime,context),bootstrap=doc.createElement('script');
    bootstrap.textContent=source+';('+runtimeReuse.toString()+')('+JSON.stringify(source).replace(/</g,'\\u003c')+');';
    const first=doc.querySelector('script');if(first)first.before(bootstrap);else doc.head.append(bootstrap);
    const capture=doc.createElement('script');capture.textContent='('+hashCompatibility.toString()+')('+sha256.toString()+');('+captureDocument.toString()+')();';doc.head.prepend(capture);
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  function hashCompatibility(hash){if(window.crypto&&!window.crypto.subtle)Object.defineProperty(window.crypto,'subtle',{value:{digest:async(algorithm,data)=>{if(String(typeof algorithm==='string'?algorithm:algorithm.name).toUpperCase()!=='SHA-256')throw Error('SHA-256 required');const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);return hash(bytes).buffer}}})}
  function runtimeReuse(source){const original=window.fetch.bind(window);window.fetch=(input,options)=>{try{const url=new URL(typeof input==='string'?input:input.url,document.baseURI);if(url.pathname==='/api/assets/ACMERUNTIME010/content'&&['acme.pics','fakefull.art'].includes(url.hostname))return Promise.resolve(new Response(source,{headers:{'Content-Type':'application/javascript'}}))}catch{}return original(input,options)}}
  async function generate({origin,asset,signal,document:readyDocument}){
    const combined=signal,html=await wait(readyDocument,combined);if(combined.aborted)throw abortError();
    const iframe=document.createElement('iframe');iframe.className='thumbnail-renderer';iframe.title='Generate '+asset+' thumbnail';iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;iframe.setAttribute('inert','');iframe.referrerPolicy='no-referrer';
    try{return await new Promise((resolve,reject)=>{
      const abort=()=>reject(abortError());combined.addEventListener('abort',abort,{once:true});
      const receive=async event=>{if(event.source!==iframe.contentWindow)return;if(event.data?.type==='acme:thumbnail-failed'){reject(Error('Artwork could not render'));return}if(event.data?.type!=='acme:thumbnail-snapshot')return;const data=event.data.image;if(typeof data!=='string'||data.length>12*1024*1024||!/^data:image\/(?:svg\+xml|png|webp|jpeg);/.test(data))return;try{const blob=await(await fetch(data)).blob();const test=new Image(),url=URL.createObjectURL(blob);try{test.src=url;await test.decode();if(!test.naturalWidth||!test.naturalHeight)throw Error('Invalid generated image')}finally{URL.revokeObjectURL(url)}blob.previewSource='local';resolve(blob)}catch(error){reject(error)}};
      iframe.cleanup=()=>{combined.removeEventListener('abort',abort);window.removeEventListener('message',receive)};window.addEventListener('message',receive);iframe.srcdoc=html;document.body.append(iframe);
    })}finally{iframe.cleanup?.();iframe.remove()}
  }
  // Runs inside an opaque sandbox. Only image data is returned to the gallery.
  function captureDocument(){
    const originalGetContext=HTMLCanvasElement.prototype.getContext,contexts=new WeakMap();
    HTMLCanvasElement.prototype.getContext=function(kind,options){const context=originalGetContext.call(this,kind,/^(webgl|webgl2|experimental-webgl)$/.test(kind)?{...options,preserveDrawingBuffer:true}:options);if(context)contexts.set(this,context);return context};
    // Background/offscreen frames may throttle rAF; allow a bounded capture-time
    // animation tick so shader backgrounds finish drawing before the snapshot.
    const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window),frames=new Map();let nextFrame=0;
    window.requestAnimationFrame=callback=>{const id=++nextFrame,entry={};frames.set(id,entry);const run=time=>{if(!frames.has(id))return;frames.delete(id);clearTimeout(entry.timer);nativeCancel(entry.native);callback(time)};entry.native=nativeRAF(run);entry.timer=setTimeout(()=>run(performance.now()),100);return id};
    window.cancelAnimationFrame=id=>{const entry=frames.get(id);if(entry){frames.delete(id);clearTimeout(entry.timer);nativeCancel(entry.native)}};
    let done=false,started=0,timer;
    const send=image=>{if(done)return;done=true;clearInterval(timer);parent.postMessage({type:'acme:thumbnail-snapshot',image},'*')};
    const visible=el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>24&&r.height>24&&r.width*r.height>=4096&&style.display!=='none'&&style.visibility!=='hidden'};
    const largest=selector=>[...document.querySelectorAll(selector)].filter(visible).sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];
    const properties=['fill','stroke','stroke-width','color','opacity','fill-opacity','stroke-opacity','font-family','font-size','font-weight','font-style','letter-spacing','white-space','text-anchor','dominant-baseline','paint-order','stop-color','stop-opacity','display','visibility'];
    function svgImage(svg){
      if(svg.getAttribute('data-error')==='true')return null;const clone=svg.cloneNode(true),originals=[svg,...svg.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      originals.forEach((el,i)=>{const style=getComputedStyle(el);for(const prop of properties){const value=style.getPropertyValue(prop);if(value)copies[i].style.setProperty(prop,value.replace(/url\(["']?[^#)]*#([^)'"\s]+)["']?\)/g,'url(#$1)'))}});
      clone.querySelectorAll('script,foreignObject,iframe').forEach(el=>el.remove());clone.querySelectorAll('*').forEach(el=>{for(const attr of [...el.attributes])if(attr.name.startsWith('on'))el.removeAttribute(attr.name)});
      clone.setAttribute('xmlns','http://www.w3.org/2000/svg');if(!clone.hasAttribute('viewBox'))clone.setAttribute('viewBox','0 0 '+svg.getBoundingClientRect().width+' '+svg.getBoundingClientRect().height);clone.setAttribute('width','512');clone.setAttribute('height','512');
      return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));
    }
    function canvasImage(canvas){
      if(!canvas.width||!canvas.height)return null;const context=contexts.get(canvas);let pixels;
      if(context?.getImageData)pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      else if(context?.readPixels){pixels=new Uint8Array(canvas.width*canvas.height*4);context.readPixels(0,0,canvas.width,canvas.height,context.RGBA,context.UNSIGNED_BYTE,pixels)}
      if(pixels){let varied=false;for(let i=4;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/400/4)*4)){if(pixels[i]!==pixels[0]||pixels[i+1]!==pixels[1]||pixels[i+2]!==pixels[2]||pixels[i+3]!==pixels[3]){varied=true;break}}if(!varied)return null}
      const copy=document.createElement('canvas'),scale=Math.min(1,512/Math.max(canvas.width,canvas.height));copy.width=Math.max(1,Math.round(canvas.width*scale));copy.height=Math.max(1,Math.round(canvas.height*scale));copy.getContext('2d').drawImage(canvas,0,0,copy.width,copy.height);const output=copy.getContext('2d').getImageData(0,0,copy.width,copy.height).data;let varied=false;for(let i=4;i<output.length;i+=Math.max(4,Math.floor(output.length/400/4)*4))if(output[i]!==output[0]||output[i+1]!==output[1]||output[i+2]!==output[2]||output[i+3]!==output[3]){varied=true;break}return varied?copy.toDataURL('image/webp',.9):null;
    }
    function capture(){if(done||performance.now()-started<500)return;try{const svg=largest('svg');if(svg?.getAttribute('data-error')==='true'){done=true;clearInterval(timer);parent.postMessage({type:'acme:thumbnail-failed'},'*');return}if(svg&&(largest('canvas')||svg.querySelector('foreignObject')||[...svg.querySelectorAll('image')].some(el=>{const href=el.getAttribute('href')||el.getAttribute('xlink:href')||'';return !href.startsWith('data:image/')&&!href.startsWith('#')}))){done=true;clearInterval(timer);parent.postMessage({type:'acme:thumbnail-failed'},'*');return}else if(svg){const image=svgImage(svg);if(image){send(image);return}}const canvas=largest('canvas');if(canvas){const image=canvasImage(canvas);if(image){send(image);return}}const image=largest('img');if(image?.complete&&image.naturalWidth){const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);send(canvas.toDataURL('image/webp',.9))}}catch{} }
    window.addEventListener('load',async()=>{try{await window.acme?.ready;await Promise.race([document.fonts?.ready,new Promise(resolve=>setTimeout(resolve,1000))]);started=performance.now();timer=setInterval(()=>window.requestAnimationFrame(capture),200);setTimeout(()=>clearInterval(timer),20000)}catch{}},{once:true});
  }
  return {render,seed};
})();
