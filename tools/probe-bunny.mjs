import fs from 'node:fs';
const endpoint=new URL(process.env.MILLER_TV_DEBUG_ENDPOINT||'http://127.0.0.1:19998');
const targets=await (await fetch(new URL('/json',endpoint))).json();
const target=targets.find(t=>t.title==='Miller TV');
if(!target)throw new Error('Miller TV not running');
const url=new URL(target.webSocketDebuggerUrl);url.hostname=endpoint.hostname;url.port=endpoint.port;
const socket=new WebSocket(url);let id=0;const pending=new Map();
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
function evaluate(expression){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(new Error('Probe timeout')),10000);pending.set(key,m=>{clearTimeout(timer);if(m.error||m.result.wasThrown)reject(new Error(JSON.stringify(m)));else resolve(m.result.result.value);});socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});}
try {
  await evaluate(`(function(){
    var bunny=document.getElementById('bunny'),screen=document.getElementById('screen');
    var start=performance.now(),samples=[],events=[],handlers=[];
    window.__bunnyProbe={samples:samples,events:events,done:false};
    ['mousemove','mouseleave','cursorStateChange','keydown','blur'].forEach(function(type){
      var handler=function(e){events.push({t:performance.now()-start,type:type,key:e.keyCode,x:e.clientX,y:e.clientY,detail:e.detail});};
      document.addEventListener(type,handler,true);handlers.push([type,handler]);
    });
    function move(x,y){var r=screen.getBoundingClientRect();var e=document.createEvent('MouseEvents');e.initMouseEvent('mousemove',true,true,window,0,0,0,r.left+x*r.width/1920,r.top+y*r.height/1080,false,false,false,false,0,null);document.dispatchEvent(e);}
    var visible=document.createEvent('CustomEvent');visible.initCustomEvent('cursorStateChange',true,true,{visibility:true});document.dispatchEvent(visible);
    move(1720,780);
    function sample(t){var r=bunny.getBoundingClientRect(),s=screen.getBoundingClientRect();samples.push({t:t-start,x:(r.left-s.left)*1920/s.width,y:(r.top-s.top)*1080/s.height,mode:bunny.getAttribute('data-mode'),className:bunny.className,style:bunny.style.transform});
      if(t-start<3500){requestAnimationFrame(sample);}else{window.__bunnyProbe.done=true;handlers.forEach(function(pair){document.removeEventListener(pair[0],pair[1],true);});}
    }requestAnimationFrame(sample);return true;
  })()`);
  await new Promise(resolve=>setTimeout(resolve,3800));
  const data=JSON.parse(await evaluate('JSON.stringify(window.__bunnyProbe)'));
  fs.writeFileSync('diagnostics/bunny-motion-'+(process.argv.includes('--after')?'after':'before')+'.json',JSON.stringify(data,null,2));
  let backward=0,largest=0;
  for(let i=1;i<data.samples.length;i++){const a=data.samples[i-1],b=data.samples[i];if(b.x<a.x-1)backward++;largest=Math.max(largest,Math.hypot(b.x-a.x,b.y-a.y));}
  console.log(JSON.stringify({samples:data.samples.length,backward,largestStep:largest,first:data.samples[0],last:data.samples.at(-1),events:data.events}));
  await evaluate("(function(){var e=document.createEvent('CustomEvent');e.initCustomEvent('cursorStateChange',true,true,{visibility:false});document.dispatchEvent(e);delete window.__bunnyProbe;return true;})()");
} finally {socket.close();}
