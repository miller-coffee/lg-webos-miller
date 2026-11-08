import fs from 'node:fs';
const endpoint=new URL(process.env.MILLER_TV_DEBUG_ENDPOINT || 'http://127.0.0.1:19998');
const targets=await (await fetch(new URL('/json',endpoint))).json();
const target=targets.find(item=>item.title==='Miller TV');
if(!target)throw new Error('Miller TV debug target not found');
const debugUrl=new URL(target.webSocketDebuggerUrl);
debugUrl.hostname=endpoint.hostname;debugUrl.port=endpoint.port;
const socket=new WebSocket(debugUrl);
let next=0;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}});
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
function call(method,params){return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>reject(new Error('TV debugger timeout')),8000);pending.set(id,message=>{clearTimeout(timer);resolve(message);});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const response=await call('Runtime.evaluate',{expression,returnByValue:true});if(response.error||response.result.wasThrown)throw new Error(JSON.stringify(response));return response.result.result.value;}
try {
  for(const file of ['apps.js','catalog.js','editor.js','intro.js','giraffe.js','launcher.js']){
    const source=fs.readFileSync(new URL('../app/'+file,import.meta.url),'utf8');
    await evaluate('new Function('+JSON.stringify(source)+'); true');
    console.log('TV engine compiled '+file);
  }
  console.log(await evaluate("JSON.stringify({apps:document.getElementById('apps').children.length,splash:document.getElementById('splash').className,clock:document.getElementById('clock').textContent,date:document.getElementById('date').textContent,clockSize:getComputedStyle(document.getElementById('clock')).fontSize,dateSize:getComputedStyle(document.getElementById('date')).fontSize,editor:typeof window.createAppEditor})"));
  if(process.argv.includes('--intro')) {
    let state;
    const deadline=Date.now()+8000;
    do {
      state=JSON.parse(await evaluate("(function(){var v=document.getElementById('intro-video');return JSON.stringify({splash:document.getElementById('splash').className,hidden:document.hidden,paused:v.paused,time:v.currentTime,ready:v.readyState,width:v.videoWidth,height:v.videoHeight,muted:v.muted,audioDecoded:v.webkitAudioDecodedByteCount||0,error:v.error?v.error.code:null});})()"));
      if((state.time>2.2&&!state.paused&&!state.hidden)||state.error)break;
      await new Promise(resolve=>setTimeout(resolve,200));
    } while(Date.now()<deadline);
    console.log('TV intro: '+JSON.stringify(state));
    if(state.splash!=='intro-playing'||state.paused||!(state.time>2.2)||state.hidden||state.muted||state.error)throw new Error('TV intro playback failed');
  }
  if(process.argv.includes('--skip-intro')) {
    await evaluate("(function(){var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{value:13});document.dispatchEvent(e);return true;})()");
    const state=JSON.parse(await evaluate("JSON.stringify({splash:document.getElementById('splash').className,paused:document.getElementById('intro-video').paused,src:document.getElementById('intro-video').getAttribute('src')})"));
    console.log('TV intro skipped: '+JSON.stringify(state));
    if(state.splash!=='dismissed'||!state.paused||state.src)throw new Error('TV intro skip failed');
  }
  if(process.argv.includes('--carousel') || process.argv.includes('--scroll')) {
    const previous=await evaluate("document.activeElement.getAttribute('data-app')");
    try {
      const state=JSON.parse(await evaluate("(function(){var apps=document.getElementById('apps').children;function key(code){var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{value:code});document.dispatchEvent(e);}if(!apps.length||!apps[0].hasAttribute('data-app'))return JSON.stringify({empty:true});for(var reset=0;reset<=apps.length;reset++){key(38);}var visited=[];for(var i=0;i<apps.length;i++){visited.push(document.activeElement.getAttribute('data-app'));if(i<apps.length-1)key(40);}var selected=document.activeElement;key(39);var controls=document.activeElement.parentNode.id==='tools';key(38);return JSON.stringify({apps:apps.length,visited:visited,expectedLast:apps[apps.length-1].getAttribute('data-app'),last:selected.getAttribute('data-app'),centered:selected.style.transform==='translateY(271px)',controls:controls,restored:document.activeElement===selected,position:document.getElementById('app-position').textContent});})()"));
      console.log('TV carousel: '+JSON.stringify(state));
      if(!state.empty && (new Set(state.visited).size!==state.apps||state.last!==state.expectedLast||!state.centered||!state.controls||!state.restored))throw new Error('TV carousel navigation failed');
      let geometry;
      const settleDeadline=Date.now()+1800;
      do {
        await new Promise(resolve=>setTimeout(resolve,100));
        geometry=JSON.parse(await evaluate("(function(){var r=document.activeElement.getBoundingClientRect();var b=document.getElementById('app-scroll').getBoundingClientRect();var scale=document.getElementById('screen').getBoundingClientRect().width/1920;return JSON.stringify({visible:r.top>=b.top&&r.bottom<=b.bottom,top:r.top,bottom:r.bottom,expectedTop:b.top+271*scale,scrollTop:document.getElementById('app-scroll').scrollTop});})()"));
        if(geometry.visible&&Math.abs(geometry.top-geometry.expectedTop)<2)break;
      } while(Date.now()<settleDeadline);
      console.log('TV selection bounds: '+JSON.stringify(geometry));
      if(!state.empty&&(!geometry.visible||geometry.scrollTop!==0))throw new Error('Carousel selection is clipped');
    } finally {
      if(previous)await evaluate("(function(){var previous="+JSON.stringify(previous)+";var apps=document.getElementById('apps').children;var wanted=-1;for(var i=0;i<apps.length;i++){if(apps[i].getAttribute('data-app')===previous)wanted=i;}if(wanted>=0){for(var n=0;n<=apps.length;n++){var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{value:38});document.dispatchEvent(e);}for(var j=0;j<wanted;j++){var down=document.createEvent('Event');down.initEvent('keydown',true,true);Object.defineProperty(down,'keyCode',{value:40});document.dispatchEvent(down);}}else{var b=document.querySelector('[data-app='+JSON.stringify(previous)+']');if(b)b.focus();}return true;})()");
    }
  }
  if(process.argv.includes('--interactions')) {
    await new Promise(resolve=>setTimeout(resolve,350));
    const initial=JSON.parse(await evaluate("(function(){var a=document.getElementById('apps').children;var selected=document.querySelector('.tile.selected');var c=document.createElement('canvas').getContext('2d');c.font='90px \"Miller Anton\"';var condensed=c.measureText('Netflix').width;c.font='90px Arial';var regular=c.measureText('Netflix').width;var scale=document.getElementById('screen').getBoundingClientRect().width/1920;return JSON.stringify({id:document.activeElement.getAttribute('data-app'),selected:selected.getAttribute('data-app'),next:selected.nextElementSibling?selected.nextElementSibling.getAttribute('data-app'):null,font:getComputedStyle(selected.children[2]).fontFamily,shadow:getComputedStyle(selected.children[2]).textShadow,condensed:condensed,regular:regular,left:(selected.children[2].getBoundingClientRect().left+54*scale)/scale});})()"));
    if(!initial.next)throw new Error('Interaction probe needs a selection before the last app');
    if(!(initial.left<=80)||initial.shadow==='none'||Math.abs(initial.condensed-initial.regular)<10)throw new Error('Font, left alignment or bloom failed');
    await evaluate("(function(){var e=document.createEvent('Event');e.initEvent('wheel',true,true);Object.defineProperty(e,'deltaY',{value:120});document.dispatchEvent(e);return true;})()");
    const afterWheel=await evaluate("document.activeElement.getAttribute('data-app')");
    if(afterWheel!==initial.next)throw new Error('Standard wheel did not browse one app');
    await new Promise(resolve=>setTimeout(resolve,120));
    await evaluate("(function(){var e=document.createEvent('Event');e.initEvent('mousewheel',true,true);Object.defineProperty(e,'wheelDelta',{value:120});document.dispatchEvent(e);return true;})()");
    if(await evaluate("document.activeElement.getAttribute('data-app')")!==initial.selected)throw new Error('Legacy Magic Remote wheel did not browse back');
    await evaluate("(function(){var state=document.createEvent('CustomEvent');state.initCustomEvent('cursorStateChange',true,true,{visibility:true});document.dispatchEvent(state);var r=document.getElementById('screen').getBoundingClientRect();var move=document.createEvent('MouseEvents');move.initMouseEvent('mousemove',true,true,window,0,0,0,r.width*.8,r.height*.55,false,false,false,false,0,null);document.dispatchEvent(move);return true;})()");
    const before=await evaluate("document.getElementById('bunny').style.transform");
    await new Promise(resolve=>setTimeout(resolve,650));
    const chase=JSON.parse(await evaluate("JSON.stringify({mode:document.getElementById('bunny').getAttribute('data-mode'),transform:document.getElementById('bunny').style.transform,focus:document.activeElement.getAttribute('data-app')})"));
    if(chase.mode!=='chase'||chase.transform===before||chase.focus!==initial.selected)throw new Error('Cursor chase failed or changed selection');
    await evaluate("(function(){for(var i=0;i<2;i++){var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{value:1536+i});document.dispatchEvent(e);}var state=document.createEvent('CustomEvent');state.initCustomEvent('cursorStateChange',true,true,{visibility:false});document.dispatchEvent(state);state=document.createEvent('CustomEvent');state.initCustomEvent('cursorStateChange',true,true,{visibility:true});document.dispatchEvent(state);return true;})()");
    await new Promise(resolve=>setTimeout(resolve,500));
    const uninterrupted=JSON.parse(await evaluate("JSON.stringify({mode:document.getElementById('bunny').getAttribute('data-mode'),transform:document.getElementById('bunny').style.transform,focus:document.activeElement.getAttribute('data-app')})"));
    if(uninterrupted.mode!=='chase'||uninterrupted.transform===chase.transform||uninterrupted.focus!==initial.selected)throw new Error('Cursor notifications interrupted chasing');
    console.log('TV chase survived cursor notifications: '+JSON.stringify(uninterrupted));
    await evaluate("(function(){var state=document.createEvent('CustomEvent');state.initCustomEvent('cursorStateChange',true,true,{visibility:false});document.dispatchEvent(state);return true;})()");
    await new Promise(resolve=>setTimeout(resolve,1100));
    const perch=JSON.parse(await evaluate("(function(){var bunny=document.getElementById('bunny');var point=bunny.style.transform.match(/[-0-9.]+/g);var x=Number(point[0])+56;var y=Number(point[1])+102;var scale=document.getElementById('screen').getBoundingClientRect().width/1920;var apps=document.getElementById('apps').children;var onText=false;for(var i=0;i<apps.length;i++){if(Number(apps[i].style.opacity)===0)continue;var r=apps[i].children[2].getBoundingClientRect();var factor=apps[i].getAttribute('aria-current')==='true'?1.5:1;var left=r.left/scale+36*factor;var right=r.right/scale-36*factor;if(x>=left-2&&x<=right+2&&Math.abs(y-(r.top/scale+(apps[i].getAttribute('aria-current')==='true'?36:24)))<3)onText=true;}return JSON.stringify({mode:bunny.getAttribute('data-mode'),onText:onText});})()"));
    console.log('TV interaction: '+JSON.stringify({initial,afterWheel,chase,perch}));
    if(perch.mode!=='text'||!perch.onText)throw new Error('Bunny did not return to a text perch');
  }
  if(process.argv.includes('--layout')) {
    await new Promise(resolve=>setTimeout(resolve,400));
    const layout=JSON.parse(await evaluate("(function(){var screen=document.getElementById('screen').getBoundingClientRect();var scale=screen.width/1920;var selected=document.querySelector('.tile.selected .app-title');var neighbor=document.querySelector('.tile:not(.selected) .app-title');var title=selected.getBoundingClientRect();var brand=document.querySelector('.brand').getBoundingClientRect();var footer=document.querySelector('footer').getBoundingClientRect();var style=getComputedStyle(selected);return JSON.stringify({textLeft:(title.left-screen.left)/scale+54,brandLeft:(brand.left-screen.left)/scale,hintLeft:(footer.left-screen.left)/scale,activeSize:parseFloat(style.fontSize),activeScale:title.height/selected.offsetHeight/scale,transitionProperty:style.transitionProperty,neighborSize:neighbor?parseFloat(getComputedStyle(neighbor).fontSize):90,transition:style.transitionDuration,selectedTop:title.top,selectedBottom:title.bottom,above:document.getElementById('app-scroll').getBoundingClientRect().top,below:document.getElementById('app-scroll').getBoundingClientRect().bottom});})()"));
    console.log('TV layout: '+JSON.stringify(layout));
    if(Math.abs(layout.textLeft-layout.brandLeft)>1||Math.abs(layout.textLeft-layout.hintLeft)>1||Math.abs(layout.activeSize*layout.activeScale/layout.neighborSize-1.5)>.01||layout.transition.indexOf('0.22s')<0||layout.transitionProperty!=='transform'||layout.selectedTop<layout.above||layout.selectedBottom>layout.below)throw new Error('Carousel alignment or selected text growth failed');
  }
  if(process.argv.includes('--growth')) {
    await evaluate("(function(){var selected=document.querySelector('.tile.selected');if(!selected.nextElementSibling)throw new Error('Need a next app for growth probe');var target=selected.nextElementSibling.children[2];window.__millerGrowthSamples=[];var start=performance.now();function sample(time){var box=target.getBoundingClientRect();var factor=document.getElementById('screen').getBoundingClientRect().width/1920;window.__millerGrowthSamples.push({time:time-start,scale:box.height/target.offsetHeight/factor,font:parseFloat(getComputedStyle(target).fontSize)});if(time-start<450)requestAnimationFrame(sample);}requestAnimationFrame(sample);var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{value:40});document.dispatchEvent(e);return true;})()");
    await new Promise(resolve=>setTimeout(resolve,650));
    const samples=await evaluate("window.__millerGrowthSamples");
    await evaluate("(function(){delete window.__millerGrowthSamples;var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{value:38});document.dispatchEvent(e);return true;})()");
    const intermediate=samples.filter(s=>s.scale>1.01&&s.scale<1.49);
    const gaps=samples.slice(1).map((s,i)=>s.time-samples[i].time);
    console.log('TV growth: '+JSON.stringify({frames:samples.length,intermediateFrames:intermediate.length,finalScale:samples.at(-1)?.scale,fontSizes:[...new Set(samples.map(s=>s.font))],averageFrameMs:gaps.reduce((a,b)=>a+b,0)/gaps.length,maxFrameMs:Math.max(...gaps)}));
    if(intermediate.length<2||samples.some(s=>s.font!==90)||Math.abs(samples.at(-1).scale-1.5)>.01)throw new Error('Transform growth did not animate smoothly at fixed font size');
  }
  if(process.argv.includes('--giraffe')) {
    const read="(function(){var g=document.getElementById('giraffe');var s=document.getElementById('giraffe-frame');return JSON.stringify({transform:g.style.transform,state:g.getAttribute('data-state'),opacity:g.style.opacity,frame:s.style.backgroundPosition,background:getComputedStyle(s).backgroundImage,pointer:getComputedStyle(g).pointerEvents,z:Number(getComputedStyle(g).zIndex),controlsZ:Number(getComputedStyle(document.getElementById('tools')).zIndex),bottom:getComputedStyle(g).bottom,focus:document.activeElement.getAttribute('data-app')});})()";
    const before=JSON.parse(await evaluate(read));
    await new Promise(resolve=>setTimeout(resolve,1100));
    const after=JSON.parse(await evaluate(read));
    console.log('TV giraffe: '+JSON.stringify({before,after}));
    if(after.opacity!=='1'||after.pointer!=='none'||!(after.controlsZ>after.z)||after.focus!==before.focus||after.background.indexOf('assets/giraffe/sprites.png')<0||before.transform===after.transform&&before.frame===after.frame)throw new Error('Giraffe motion or control layering failed');
  }
  if(process.argv.includes('--editor')) {
    const before=await evaluate("localStorage.getItem('miller-apps-v1')");
    await evaluate("document.querySelector('[data-app=\"miller:edit\"]').click(); true");
    try {
      let state;
      const deadline=Date.now()+8000;
      do {
        state=JSON.parse(await evaluate("JSON.stringify({hidden:document.getElementById('app-editor').hidden,status:document.getElementById('editor-status').textContent,buttons:document.getElementById('editor-list').children.length,count:document.getElementById('editor-count').textContent})"));
        if(state.status.indexOf('Checking')!==0)break;
        await new Promise(resolve=>setTimeout(resolve,200));
      } while(Date.now()<deadline);
      console.log('TV editor: '+JSON.stringify(state));
      if(state.hidden||!state.buttons||state.status!=='Select apps to show on your home screen.')throw new Error('Live editor discovery failed');
    } finally {
      await evaluate("(function(){var buttons=document.getElementById('editor-controls').children;for(var i=0;i<buttons.length;i++){if(buttons[i].textContent==='Cancel'){buttons[i].click();break;}}return true;})()");
    }
    const after=await evaluate("localStorage.getItem('miller-apps-v1')");
    if(before!==after)throw new Error('Editor probe changed saved choices');
    console.log('TV editor cancelled without changing saved choices');
  }
} finally {socket.close();}
