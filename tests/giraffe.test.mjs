import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(options={}) {
  let time=0, playing=true, timer;
  const actor={style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
  const sprite={style:{}};
  const context={Math,Date,document:{getElementById:id=>id==='giraffe'?actor:sprite},setTimeout(fn){timer=fn;return 1;},clearTimeout(){timer=null;}};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/giraffe.js','utf8'),context);
  const controller=context.createMillerGiraffe({now:()=>time,random:()=>0,canPlay:()=>playing,...options});
  const step=(frames=1)=>{for(let i=0;i<frames;i++){time+=40;assert.ok(timer);timer();}};
  return {actor,sprite,step,controller,setPlaying(value){playing=value;},x:()=>Number(actor.style.transform.match(/[-0-9.]+/)[0])};
}
test('giraffe walks slowly with a complete gait, rests and meanders without accepting input',()=>{
  const f=fixture();const start=f.x();const frames=new Set();
  for(let i=0;i<45;i++){f.step();frames.add(f.sprite.style.backgroundPosition);}
  assert.equal(frames.size,12);assert.ok(start-f.x()>50&&start-f.x()<60);
  f.step(410);assert.equal(f.actor.attributes['data-state'],'idle');
  const rest=f.x();f.step(35);assert.equal(f.x(),rest);
  f.step(60);assert.equal(f.actor.attributes['data-state'],'walk');assert.equal(f.actor.attributes['data-direction'],'right');
});
test('giraffe pauses at the edge and turns around while remaining within the viewport',()=>{
  const f=fixture({startX:4,direction:-1});f.step(4);
  assert.equal(f.x(),0);assert.equal(f.actor.attributes['data-state'],'idle');
  f.step(80);assert.equal(f.actor.attributes['data-direction'],'right');assert.ok(f.x()>0);
  for(let i=0;i<600;i++){f.step();assert.ok(f.x()>=0&&f.x()<=1680);}
});
test('giraffe freezes while hidden and resumes without jumping, and can stop its timer',()=>{
  const f=fixture();f.step(10);const before=f.x();const frame=f.sprite.style.backgroundPosition;
  f.setPlaying(false);f.step(500);assert.equal(f.x(),before);assert.equal(f.sprite.style.backgroundPosition,frame);assert.equal(f.actor.style.opacity,'0');
  f.setPlaying(true);f.step();assert.ok(before-f.x()<2);assert.equal(f.actor.style.opacity,'1');
  f.controller.stop();assert.equal(f.actor.style.opacity,'0');
});
