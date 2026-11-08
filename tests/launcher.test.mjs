import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({tv = false, last, saved, failSave = false, boot = false, playThrows = false, initialHidden = false} = {}) {
  const listeners = {};
  const windowListeners = {};
  const elements = {};
  const timers = new Map();
  const storage = new Map(last ? [['miller-last-app', last]] : []);
  if (saved !== undefined) storage.set('miller-apps-v1', typeof saved === 'string' ? saved : JSON.stringify(saved));
  const calls = [];
  let nextTimer = 0;
  let frameTime = 0;
  let closed = 0;
  const document = {
    hidden:initialHidden,
    activeElement:null,
    getElementById(id) { return elements[id] ||= element(); },
    createElement() { return element(); },
    addEventListener(name, handler) { (listeners[name] ||= []).push(handler); }
  };
  function element() {
    const events = {};
    const attributes = {};
    return {
      children:[], style:{}, className:'', _text:'', hidden:true,
      get textContent() { return this._text; },
      set textContent(value) { this._text = value; this.children = []; },
      getBoundingClientRect() { return {left:0,top:0,width:1920,height:1080}; },
      offsetWidth:326, offsetHeight:177, offsetLeft:0, offsetTop:0, offsetParent:null, scrollTop:0, clientHeight:424,
      appendChild(child) {
        if (this === elements.apps) {
          child.offsetTop = 16 + Math.floor(this.children.length / 5) * 195;
          child.offsetLeft = 9 + (this.children.length % 5) * 344;
          child.offsetParent = elements['app-scroll'];
        }
        this.children.push(child);
      },
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute(name) { return attributes[name]; },
      removeAttribute(name) { delete attributes[name]; if(name === 'src')this.src = ''; },
      paused:true, loads:0,
      play() { if(playThrows)throw new Error('Decoder unavailable');this.paused = false; },
      pause() { this.paused = true; },
      load() { this.loads++; },
      emit(type) { for(const handler of events[type] || [])handler(); },
      addEventListener(name, handler) { (events[name] ||= []).push(handler); },
      focus() { document.activeElement = this; for (const handler of events.focus || []) handler(); },
      click() { for (const handler of events.click || []) handler(); }
    };
  }
  const context = {
    document, console, Date, JSON, Math,
    innerWidth:1920, innerHeight:1080,
    localStorage:{getItem:key => storage.get(key), setItem:(key,value) => { if (failSave) throw new Error('Storage full'); storage.set(key,value); }},
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, {fn,ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id=++nextTimer;timers.set(id,{fn:()=>fn(frameTime+=16),ms:16});return id; },
    cancelAnimationFrame(id) { timers.delete(id); },
    setInterval() {}, close() { closed++; },
    addEventListener(name, handler) { (windowListeners[name] ||= []).push(handler); }
  };
  if (tv) context.PalmServiceBridge = function () {
    this.call = (uri, payload) => calls.push({uri, payload:JSON.parse(payload), respond:this.onservicecallback});
  };
  if(boot)context.PalmSystem = {launchParams:JSON.stringify({millerBoot:true,millerBootToken:'boot-1'}),activations:0,activate(){this.activations++;}};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../app/apps.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../app/catalog.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../app/editor.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../app/intro.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../app/giraffe.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../app/launcher.js', import.meta.url), 'utf8'), context);
  const fire = (type, event = {}) => { for (const handler of listeners[type] || []) handler(event); };
  const key = code => fire('keydown', {keyCode:code, preventDefault(){}});
  const runTimer = ms => {
    const entry = [...timers.entries()].find(([,timer]) => timer.ms === ms);
    assert.ok(entry, 'expected timer ' + ms);
    timers.delete(entry[0]); entry[1].fn();
  };
  if(!boot)runTimer(1200);
  return {document,elements,key,fire,runTimer,calls,storage,context,closed:() => closed};
}

test('vertical carousel browses one app at a time and restores selection from controls', () => {
  const f = fixture();
  const focused = () => f.document.activeElement.getAttribute('data-app');
  assert.equal(focused(), 'netflix');
  f.key(38); assert.equal(focused(), 'netflix');
  f.key(40); assert.equal(focused(), 'amazon');
  f.key(40); assert.equal(f.elements['app-position'].textContent,'03 / 10');
  const selected = focused();
  f.key(39); assert.equal(focused(), 'com.webos.app.hdmi1');
  for (let i = 0; i < 4; i++) f.key(39);
  assert.equal(focused(), 'miller:edit');
  f.key(38); assert.equal(focused(), selected);
  f.key(39); f.key(37); assert.equal(focused(),selected);
});

test('launches the selected installed app and surfaces TV failures', () => {
  const f = fixture({tv:true});
  f.key(40); f.key(13);
  assert.equal(f.calls[0].uri, 'luna://com.webos.applicationManager/launch');
  assert.equal(f.calls[0].payload.id, 'amazon');
  f.calls[0].respond(JSON.stringify({returnValue:false,errorText:'Unavailable'}));
  assert.match(f.elements.notice.textContent, /Prime Video: Unavailable/);
  assert.equal(f.storage.has('miller-last-app'), false);
  f.key(13); f.calls[1].respond(JSON.stringify({returnValue:true}));
  assert.equal(f.storage.get('miller-last-app'), 'amazon');
});

test('preview mode reports an unavailable TV bridge without throwing', () => {
  const f = fixture(); f.key(13);
  assert.match(f.elements.notice.textContent, /Preview only/);
});

test('secret remote sequence opens a temporary overlay without launching an app', () => {
  const f = fixture({tv:true});
  for (const code of [38,38,40,40,37,39,37,39,13]) f.key(code);
  assert.equal(f.elements.easter.hidden, false);
  assert.equal(f.calls.length, 0);
  f.runTimer(6500); assert.equal(f.elements.easter.hidden, true);
});

test('restores the last selected app, dims when idle, and wakes on input', () => {
  const f = fixture({last:'spotify-beehive'});
  assert.equal(f.document.activeElement.getAttribute('data-app'), 'spotify-beehive');
  f.runTimer(60000); assert.equal(f.elements.screen.className, 'idle');
  f.fire('mousemove'); assert.equal(f.elements.screen.className, '');
  f.key(461); assert.equal(f.closed(), 1);
});

test('a document relaunch event restores the grid and lets webOS foreground it', () => {
  const info = JSON.parse(fs.readFileSync(new URL('../app/appinfo.json', import.meta.url), 'utf8'));
  assert.equal(info.handlesRelaunch, false, 'webOS must bring the existing app forward automatically');
  const f = fixture({last:'amazon'});
  f.runTimer(60000);
  assert.equal(f.elements.screen.className, 'idle');
  f.document.activeElement = null;
  f.fire('webOSRelaunch');
  assert.equal(f.elements.screen.className, '');
  assert.equal(f.document.activeElement.getAttribute('data-app'), 'amazon');
});

test('bunny visits visible carousel entries without changing focus and pauses when idle or hidden', () => {
  const f = fixture();
  const apps = f.elements.apps.children;
  apps.forEach((app, index) => { app.offsetLeft = index * 100; });
  const focus = f.document.activeElement;
  const visited = [];
  f.runTimer(1800);
  for (let i = 0; i < 3; i++) {
    visited.push(f.elements.bunny.style.transform);
    assert.equal(f.document.activeElement, focus);
    f.runTimer(950);
    if (i < 2) f.runTimer(7000);
  }
  assert.equal(new Set(visited).size, 3);
  f.runTimer(60000);
  const before = f.elements.bunny.style.transform;
  f.runTimer(7000);
  assert.equal(f.elements.bunny.style.transform, before);
  f.fire('mousemove'); f.document.hidden = true;
  f.runTimer(7000);
  assert.equal(f.elements.bunny.style.transform, before);
});

test('bunny plays the full one-shot carrot sequence and switches back to travel', () => {
  const f = fixture();
  f.elements.apps.children.forEach((app, index) => { app.offsetLeft = index * 100; });
  f.runTimer(1800);
  const sprite = f.elements['bunny-frame'];
  assert.equal(sprite.getAttribute('data-state'), 'idle');
  f.runTimer(950);
  assert.equal(sprite.getAttribute('data-state'), 'carrot');
  const frames = new Set([sprite.style.backgroundPosition]);
  for (let i = 0; i < 15; i++) { f.runTimer(200); frames.add(sprite.style.backgroundPosition); }
  assert.equal(frames.size, 16);
  f.runTimer(200);
  assert.equal(sprite.style.backgroundPosition, '-784px -784px');
  f.runTimer(7000);
  assert.equal(sprite.getAttribute('data-state'), 'run');
  f.runTimer(112);
  assert.equal(sprite.style.backgroundPosition, '-112px -448px');
  f.runTimer(950);
  assert.equal(sprite.getAttribute('data-state'), 'wave');
  f.runTimer(60000);
  const paused = sprite.style.backgroundPosition;
  f.runTimer(163);
  assert.equal(sprite.style.backgroundPosition, paused);
});

function openEditor(f) {
  f.elements.tools.children.find(button => button.getAttribute('data-app') === 'miller:edit').click();
}
function editorControl(f, title) {
  f.elements['editor-controls'].children.find(button => button.textContent === title).click();
}
function findEditorApp(f, id) {
  for (let page = 0; page < 10; page++) {
    const found = f.elements['editor-list'].children.find(button => button.getAttribute('data-app') === id);
    if (found) return found;
    const next = f.elements['editor-controls'].children.find(button => button.textContent === 'Next');
    if (!next) break;
    next.click();
  }
  assert.fail('Missing picker app ' + id);
}

test('editor queries installed apps, adds and removes without uninstalling, and persists choices', () => {
  const f = fixture({tv:true}); openEditor(f);
  assert.equal(f.calls[0].uri, 'luna://com.webos.applicationManager/listApps');
  f.calls[0].respond(JSON.stringify({returnValue:true,apps:[
    {id:'netflix',title:'Netflix',visible:true},
    {id:'new.app',title:'New app',visible:true,folderPath:'/media/cryptofs/apps/usr/palm/applications/new.app',icon:'icon.png'},
    {id:'hidden.service',title:'Hidden',visible:false}
  ]}));
  findEditorApp(f,'netflix').click();
  findEditorApp(f,'new.app').click();
  editorControl(f,'Save');
  assert.equal(f.elements['app-editor'].hidden,true);
  const chosen = JSON.parse(f.storage.get('miller-apps-v1'));
  assert.equal(chosen.length,10);
  assert.ok(!chosen.some(app => app.id === 'netflix'));
  assert.equal(chosen[9].id,'new.app');
  assert.ok(chosen[9].icon.indexOf('file:///media/') === 0);
  assert.equal(f.calls.length,1,'editing only queries installed apps');
  const reopened = fixture({saved:chosen});
  assert.equal(reopened.elements.apps.children[9].getAttribute('data-app'),'new.app');
  assert.equal(reopened.elements.apps.children.length,10);
});

test('editor Back cancels changes and ignores an app-list response after closing', () => {
  const f = fixture({tv:true}); openEditor(f);
  findEditorApp(f,'netflix').click(); f.key(461);
  assert.equal(f.closed(),0);
  assert.equal(f.elements['app-editor'].hidden,true);
  assert.equal(f.storage.has('miller-apps-v1'),false);
  assert.equal(f.elements.apps.children[0].getAttribute('data-app'),'netflix');
  f.calls[0].respond(JSON.stringify({returnValue:true,apps:[]}));
  assert.equal(f.elements['app-editor'].hidden,true);
  assert.equal(f.document.activeElement.getAttribute('data-app'),'miller:edit');
});

test('editor supports remote toggles and paging, and reports storage failure without applying changes', () => {
  const f = fixture({failSave:true}); openEditor(f);
  const first = f.document.activeElement;
  f.key(13);
  assert.notEqual(f.elements['editor-list'].children[0].getAttribute('aria-pressed'),first.getAttribute('aria-pressed'));
  f.key(40); f.key(40); f.key(40);
  assert.equal(f.document.activeElement.textContent,'Previous');
  f.key(39); f.key(13);
  assert.match(f.elements['editor-count'].textContent,/Page 2/);
  editorControl(f,'Save');
  assert.equal(f.elements['app-editor'].hidden,false);
  assert.match(f.elements['editor-status'].textContent,/Could not save/);
  assert.equal(f.elements.apps.children.length,10);
  editorControl(f,'Cancel');
});

test('an empty grid can add an app and a one-app grid keeps the bunny on that app', () => {
  const f = fixture({saved:[]});
  f.runTimer(1800);
  assert.equal(f.elements.bunny.style.opacity,'0');
  openEditor(f); findEditorApp(f,'netflix').click(); editorControl(f,'Save');
  assert.equal(f.elements.apps.children.length,1);
  f.runTimer(7000); f.runTimer(950);
  const first = f.elements.bunny.style.transform;
  f.runTimer(7000);
  assert.notEqual(f.elements.bunny.style.transform,first, 'one app still gives the bunny room to run along its text');
  f.key(38); assert.equal(f.document.activeElement.getAttribute('data-app'),'netflix');
  f.key(40); assert.equal(f.document.activeElement.getAttribute('data-app'),'com.webos.app.hdmi1');
});

test('all apps stay in one carousel and selection is centered through the last entry', () => {
  const saved = Array.from({length:18},(_,i) => ({id:'test.app'+i,title:'Test '+i}));
  const f = fixture({saved});
  assert.equal(f.elements.apps.children.length,18);
  for(let i=0;i<18;i++) {
    const selected=f.document.activeElement;
    assert.equal(selected.getAttribute('data-app'),'test.app'+i);
    assert.equal(selected.style.transform,'translateY(271px)');
    assert.equal(selected.getAttribute('aria-current'),'true');
    assert.equal(f.elements.apps.children.filter(x=>x.getAttribute('aria-current')==='true').length,1);
    f.key(40);
  }
  assert.equal(f.document.activeElement.getAttribute('data-app'),'com.webos.app.hdmi1');
  f.key(38); assert.equal(f.document.activeElement.getAttribute('data-app'),'test.app17');
  for(let i=0;i<17;i++)f.key(38);
  assert.equal(f.document.activeElement.getAttribute('data-app'),'test.app0');
});

test('restoring a distant app centers it and the bunny visits only its visible neighbors', () => {
  const saved = Array.from({length:18},(_,i) => ({id:'test.app'+i,title:'Test '+i}));
  const f = fixture({saved,last:'test.app17'});
  assert.equal(f.document.activeElement.getAttribute('data-app'),'test.app17');
  assert.equal(f.document.activeElement.style.transform,'translateY(271px)');
  assert.equal(f.elements.apps.children[0].style.visibility,'hidden');
  assert.equal(f.elements['app-position'].textContent,'18 / 18');
  f.runTimer(380);
  const positions=new Set();
  for(let i=0;i<3;i++) {
    positions.add(f.elements.bunny.style.transform);
    f.runTimer(950); f.runTimer(7000);
  }
  assert.equal(positions.size,3);
  assert.ok([...positions].every(value=>{const [x,y]=value.match(/[\d.]+/g).map(Number);return x+56>=76 && x+56<=330 && [171,287,415].includes(y);}));
  assert.equal(f.elements.bunny.getAttribute('data-mode'),'text');
});

test('broken saved data falls back to defaults and a failed live query keeps the local catalog usable', () => {
  const f = fixture({tv:true,saved:'{broken'});
  assert.equal(f.elements.apps.children.length,10);
  openEditor(f);
  f.calls[0].respond(JSON.stringify({returnValue:false,errorText:'Not permitted'}));
  assert.equal(f.calls[1].uri,'luna://org.webosbrew.hbchannel.service/exec');
  f.calls[1].respond(JSON.stringify({returnValue:false}));
  assert.match(f.elements['editor-status'].textContent,/saved app list/);
  assert.ok(findEditorApp(f,'com.webos.app.browser'));
});


test('legacy TV discovery uses the existing Homebrew service and can read a newly installed icon', () => {
  const f = fixture({tv:true}); openEditor(f);
  f.calls[0].respond(JSON.stringify({returnValue:false}));
  assert.equal(f.calls[1].payload.command,"luna-send -n 1 -w 5000 luna://com.webos.applicationManager/listApps '{}'");
  f.calls[1].respond(JSON.stringify({returnValue:true,stdoutString:JSON.stringify({returnValue:true,apps:[
    {id:'fresh.app',title:'Fresh App',visible:true,folderPath:'/media/cryptofs/apps/usr/palm/applications/fresh.app',icon:'icon.png'}
  ]})}));
  assert.equal(f.elements['editor-status'].textContent,'Select apps to show on your home screen.');
  findEditorApp(f,'fresh.app').click(); editorControl(f,'Save');
  const icon = f.elements.apps.children[10].children[1];
  icon.onerror();
  const read = f.calls[f.calls.length - 1];
  assert.equal(read.uri,'luna://org.webosbrew.hbchannel.service/exec');
  assert.equal(read.payload.command,"base64 '/media/cryptofs/apps/usr/palm/applications/fresh.app/icon.png'");
  read.respond(JSON.stringify({returnValue:true,stdoutString:'iVBORw0KGgo=\n'}));
  assert.equal(icon.src,'data:image/png;base64,iVBORw0KGgo=');
});

test('boot intro plays the prepared soundtrack video and any key skips without launching an app', () => {
  const f=fixture({boot:true,tv:true});
  const video=f.elements['intro-video'];
  assert.equal(video.src,'assets/intro/startup.mp4');
  assert.equal(video.muted,false);
  assert.equal(video.paused,false);
  assert.equal(f.elements.splash.className,'intro-playing');
  f.key(13);
  assert.equal(video.paused,true);
  assert.equal(video.src,'');
  assert.equal(f.elements.splash.className,'dismissed');
  assert.equal(f.calls.length,2);
  assert.match(f.calls[0].payload.command, /'accepted'/);
  assert.match(f.calls[1].payload.command, /'stopped'/);
  assert.equal(f.document.activeElement.getAttribute('data-app'),'netflix');
});

test('ending, decode errors and loading timeouts safely release the intro into the grid', () => {
  for(const type of ['ended','error']) {
    const f=fixture({boot:true});f.elements['intro-video'].emit('playing');f.runTimer(2000);f.elements['intro-video'].emit(type);
    assert.equal(f.elements.splash.className,'dismissed');
    assert.equal(f.elements['intro-video'].paused,true);
  }
  const timeout=fixture({boot:true});timeout.runTimer(30000);
  assert.equal(timeout.elements.splash.className,'dismissed');
  const failed=fixture({boot:true,playThrows:true});
  failed.runTimer(500);failed.runTimer(500);failed.runTimer(1000);failed.runTimer(1500);
  assert.equal(failed.elements.splash.className,'dismissed');
});

test('Home skips the intro, stale boot tokens do not replay it, and a fresh power-on token does', () => {
  const f=fixture({boot:true});
  f.context.PalmSystem.launchParams='{}';
  f.fire('webOSRelaunch');
  assert.equal(f.elements.splash.className,'dismissed');
  f.fire('webOSRelaunch');
  assert.equal(f.elements.splash.className,'dismissed');
  f.context.PalmSystem.launchParams=JSON.stringify({millerBoot:true,millerBootToken:'boot-2'});
  f.fire('webOSRelaunch');
  assert.equal(f.elements.splash.className,'intro-playing');
  f.elements['intro-video'].emit('playing');f.runTimer(2000);
  f.document.hidden=true;f.fire('visibilitychange');
  assert.equal(f.elements['intro-video'].paused,true);
  assert.equal(f.elements.splash.className,'dismissed');
});

test('a hidden boot waits for visibility instead of dropping the intro during activation', () => {
  const f=fixture({boot:true,initialHidden:true,tv:true});
  const video=f.elements['intro-video'];
  assert.equal(video.paused,true);
  assert.equal(video.src,undefined);
  assert.equal(f.elements.splash.className,'intro-playing');
  assert.match(f.calls[0].payload.command,/'accepted'/);
  f.document.hidden=false;f.fire('visibilitychange');
  assert.equal(video.paused,false);
  video.emit('playing');
  assert.match(f.calls[1].payload.command,/'playing'/);
});

test('a transient hidden event before playback waits and resumes rather than cancelling', () => {
  const f=fixture({boot:true});const video=f.elements['intro-video'];
  f.document.hidden=true;f.fire('visibilitychange');
  assert.equal(video.paused,true);
  assert.equal(f.elements.splash.className,'intro-playing');
  f.document.hidden=false;f.fire('visibilitychange');
  assert.equal(video.paused,false);
  video.emit('playing');f.runTimer(2000);
  f.document.hidden=true;f.fire('visibilitychange');
  assert.equal(f.elements.splash.className,'dismissed');
});

test('retrying the same boot token preserves a running intro, but an ordinary Home skips it', () => {
  const f=fixture({boot:true});const video=f.elements['intro-video'];
  const loads=video.loads;
  f.fire('webOSRelaunch');f.fire('webOSRelaunch');
  assert.equal(video.loads,loads);
  assert.equal(f.elements.splash.className,'intro-playing');
  f.context.PalmSystem.launchParams=JSON.stringify({millerSkip:true});f.fire('webOSRelaunch');
  assert.equal(f.elements.splash.className,'dismissed');
});

test('a cold decoder error retries and succeeds without prematurely arming the remote skip marker', () => {
  const f=fixture({boot:true,tv:true});const video=f.elements['intro-video'];
  video.emit('error');
  assert.equal(f.elements.splash.className,'intro-playing');
  assert.equal(f.calls.length,1);
  f.runTimer(500);f.runTimer(500);video.emit('playing');
  assert.equal(video.paused,false);
  assert.equal(f.calls.length,2);
  assert.match(f.calls[1].payload.command,/'playing'/);
});

test('boot and wake explicitly activate the launcher before starting playback', () => {
  const f=fixture({boot:true});
  assert.equal(f.context.PalmSystem.activations,1);
  f.context.PalmSystem.launchParams=JSON.stringify({millerBoot:true,millerBootToken:'next-wake'});
  f.fire('webOSRelaunch');
  assert.equal(f.context.PalmSystem.activations,2);
});

test('late startup focus stealing is recovered until playback has settled', () => {
  const f=fixture({boot:true});const video=f.elements['intro-video'];
  video.emit('playing');
  f.document.hidden=true;f.fire('visibilitychange');
  assert.equal(f.elements.splash.className,'intro-playing');
  f.runTimer(500);
  assert.ok(f.context.PalmSystem.activations>=2);
  f.document.hidden=false;f.fire('visibilitychange');video.emit('playing');
  f.runTimer(2000);
  f.document.hidden=true;f.fire('visibilitychange');
  assert.equal(f.elements.splash.className,'dismissed');
});


test('wheel browses the carousel, supports old mousewheel, deduplicates events and stays out of controls', () => {
  const f=fixture();
  const focused=()=>f.document.activeElement.getAttribute('data-app');
  const wheel=(type,values,time)=>f.fire(type,{type,timeStamp:time,preventDefault(){},...values});
  wheel('wheel',{deltaY:120},100); assert.equal(focused(),'amazon');
  wheel('mousewheel',{wheelDelta:-120},105); assert.equal(focused(),'amazon');
  wheel('mousewheel',{wheelDelta:-120},200); assert.equal(focused(),'com.disney.disneyplus-prod');
  wheel('wheel',{deltaY:-3,deltaMode:1},400); assert.equal(focused(),'amazon');
  wheel('wheel',{deltaY:-1},700); assert.equal(focused(),'amazon');
  for(let i=0;i<4;i++)wheel('wheel',{deltaY:-10},800+i*20);
  assert.equal(focused(),'netflix');
  for(let i=0;i<30;i++)wheel('wheel',{deltaY:120},1000+i*100);
  assert.equal(focused(),'com.curiositystream.app');
  f.key(39);wheel('wheel',{deltaY:-120},4500);assert.equal(focused(),'pandora.lgerp.app');
  openEditor(f);const selected=f.document.activeElement;wheel('wheel',{deltaY:120},5000);assert.equal(f.document.activeElement,selected);
});

test('wheel skips an intro without browsing or launching anything', () => {
  const f=fixture({boot:true});
  f.fire('wheel',{type:'wheel',timeStamp:100,deltaY:120,preventDefault(){}});
  assert.equal(f.elements.splash.className,'dismissed');
  assert.equal(f.document.activeElement.getAttribute('data-app'),'netflix');
});

test('bunny runs on text, then jumps to the next visible text without changing focus', () => {
  const f=fixture();f.runTimer(1800);
  const first=f.elements.bunny.style.transform;
  const selected=f.document.activeElement;
  f.runTimer(950);f.runTimer(7000);
  assert.equal(f.elements['bunny-frame'].getAttribute('data-state'),'run');
  assert.notEqual(f.elements.bunny.style.transform,first);
  f.runTimer(950);f.runTimer(7000);
  assert.equal(f.elements['bunny-frame'].getAttribute('data-state'),'hop');
  assert.equal(f.document.activeElement,selected);
});

test('bunny chases a scaled cursor without stealing selection and returns when cursor hides', () => {
  const f=fixture();f.runTimer(1800);
  f.elements.screen.getBoundingClientRect=()=>({left:0,top:0,width:960,height:540});
  const selected=f.document.activeElement;
  f.fire('cursorStateChange',{detail:{visibility:true}});
  f.fire('mousemove',{clientX:700,clientY:350});
  assert.equal(f.elements.bunny.getAttribute('data-mode'),'chase');
  assert.equal(f.elements['bunny-frame'].getAttribute('data-state'),'run');
  const first=f.elements.bunny.style.transform;
  f.runTimer(16);assert.notEqual(f.elements.bunny.style.transform,first);
  for(let i=0;i<300;i++)f.runTimer(16);
  const [x,y]=f.elements.bunny.style.transform.match(/[\d.]+/g).map(Number);
  assert.ok(Math.abs(x-1344)<13 && Math.abs(y-630)<13,'uses launcher coordinates after preview scaling');
  assert.equal(f.document.activeElement,selected);
  f.fire('cursorStateChange',{detail:{visibility:false}});f.runTimer(600);f.runTimer(380);
  assert.equal(f.elements.bunny.getAttribute('data-mode'),'text');
  assert.equal(f.elements.bunny.className,'travelling','returns from its chase position with a hop');
});

test('cursor notifications and brief pointer loss do not interrupt the chase', () => {
  const f=fixture();f.runTimer(1800);
  f.fire('cursorStateChange',{detail:{visibility:true}});
  f.fire('mousemove',{clientX:1700,clientY:800});
  const point=()=>f.elements.bunny.style.transform.match(/[-\d.]+/g).map(Number);
  let previous=point();
  for (let i=0;i<8;i++) {
    f.key(i%2?1536:1537);
    f.fire('cursorStateChange',{detail:{visibility:false}});
    f.fire('mouseleave');
    f.fire('cursorStateChange',{detail:{visibility:true}});
    f.runTimer(16);
    const current=point();
    assert.ok(current[0]>=previous[0] && current[1]>=previous[1],'keeps moving toward the cursor');
    assert.equal(f.elements.bunny.getAttribute('data-mode'),'chase');
    previous=current;
  }
  f.key(40);f.runTimer(380);
  assert.equal(f.elements.bunny.getAttribute('data-mode'),'text','real navigation still ends chasing');
});

test('cursor chasing pauses in dialogs and stops on arrow input or pointer inactivity', () => {
  const f=fixture();f.runTimer(1800);
  f.fire('mousemove',{clientX:1200,clientY:600});f.key(40);f.runTimer(380);
  assert.equal(f.elements.bunny.getAttribute('data-mode'),'text');
  f.fire('mousemove',{clientX:1200,clientY:600});f.runTimer(4000);f.runTimer(380);
  assert.equal(f.elements.bunny.getAttribute('data-mode'),'text');
  openEditor(f);const before=f.elements.bunny.style.transform;
  f.fire('mousemove',{clientX:500,clientY:100});assert.equal(f.elements.bunny.style.transform,before);
  f.key(461);f.fire('mousemove',{clientX:800,clientY:600});
  f.document.hidden=true;f.fire('visibilitychange');f.runTimer(380);
  assert.equal(f.elements.bunny.style.opacity,'0');
});

test('chasing takes over at the rendered mid-hop position and visibility cannot restart stale movement', () => {
  const f=fixture();f.runTimer(1800);
  f.elements.screen.getBoundingClientRect=()=>({left:10,top:20,width:960,height:540});
  f.elements['bunny-frame'].getBoundingClientRect=()=>({left:460,top:120,width:56,height:56});
  f.fire('mousemove',{clientX:100,clientY:150});
  assert.equal(f.elements.bunny.style.transform,'translate(900px,200px)','preserves the visible position, including hop height');
  f.runTimer(16);
  const before=f.elements.bunny.style.transform;
  for(let i=0;i<10;i++)f.fire('cursorStateChange',{detail:{visibility:true}});
  assert.equal(f.elements.bunny.style.transform,before,'visibility events never advance or restart the motion loop');
  f.runTimer(16);
  const [x]=f.elements.bunny.style.transform.match(/[-\d.]+/g).map(Number);
  assert.ok(x<900 && x>884,'one bounded movement per frame');
});

test('small cursor jitter near a caught bunny does not toggle running or flip its direction', () => {
  const f=fixture();f.runTimer(1800);
  f.elements['bunny-frame'].getBoundingClientRect=()=>({left:100,top:200,width:112,height:112});
  f.fire('cursorStateChange',{detail:{visibility:true}});
  f.fire('mousemove',{clientX:156,clientY:270});f.runTimer(16);
  const before=f.elements.bunny.style.transform;
  assert.equal(f.elements['bunny-frame'].getAttribute('data-state'),'idle');
  for(let i=0;i<12;i++){
    f.fire('mousemove',{clientX:156+(i%2?5:-5),clientY:270});f.runTimer(16);
    assert.equal(f.elements.bunny.style.transform,before);
    assert.equal(f.elements['bunny-frame'].getAttribute('data-state'),'idle');
  }
  f.fire('mousemove',{clientX:300,clientY:270});f.runTimer(16);
  assert.equal(f.elements['bunny-frame'].getAttribute('data-state'),'run');
});


test('volume and mute controls leave the intro playing without consuming normal volume behavior',()=>{
  const f=fixture({boot:true});
  for(const keyCode of [173,174,175,447,448,449]) {
    let prevented=false;f.fire('keydown',{keyCode,preventDefault(){prevented=true;}});
    assert.equal(f.elements.splash.className,'intro-playing');assert.equal(f.elements['intro-video'].paused,false);assert.equal(prevented,false);
  }
  f.fire('keydown',{keyCode:0,key:'AudioVolumeUp',preventDefault(){assert.fail('volume must pass through');}});
  assert.equal(f.elements.splash.className,'intro-playing');
  f.key(13);assert.equal(f.elements.splash.className,'dismissed');
});


test('cursor visibility notifications do not skip the boot movie and real keys record a precise reason',()=>{
  const f=fixture({boot:true,tv:true});
  f.key(1536);f.key(1537);
  assert.equal(f.elements.splash.className,'intro-playing');
  f.key(13);assert.equal(f.elements.splash.className,'dismissed');
  assert.match(f.calls[f.calls.length-1].payload.command,/'key-13'/);
});
