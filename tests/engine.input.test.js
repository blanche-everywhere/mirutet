'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/engine.js');
const R=require('./engine.reference.js');

function rig(settings={},options={}){
  let now=0;
  const events=[],locks=[];
  const handler=new E.InputHandler({clock:()=>now,settings,autoNext:false,
    onEvent:e=>events.push(structuredClone(e)),onLock:r=>locks.push(structuredClone(r)),...options});
  return {h:handler,events,locks,set:t=>{now=t;},at:t=>{now=t;handler.update();}};
}

test('default handling and settings validation/clamping',()=>{
  assert.deepEqual(E.DEFAULT_SETTINGS,{das:110,arr:0,sdf:40,dcd:0,are:80,gravity:0,lockDelayOn:true,lockDelay:500,irs:true,ihs:false,allow180:true,spawnDrop:false});
  assert.deepEqual(E.normalizeSettings({das:-1,arr:300,sdf:Infinity,are:900,gravity:80}),
    {...E.DEFAULT_SETTINGS,das:0,arr:200,sdf:41,are:500,gravity:20});
  assert.equal(E.normalizeSettings({sdf:'instant'}).sdf,41);
  assert.throws(()=>E.normalizeSettings({das:NaN}));assert.throws(()=>E.normalizeSettings({irs:1}));
});

for(const type of E.PIECE_TYPES)for(const action of ['cw','ccw','rotate180']){
  test('IRS held through ARE: '+type+' '+action+' rotates once and counts once',()=>{
    const {h,at}=rig();h.scheduleSpawn(type,0);
    assert.equal(h.active,null);assert.equal(h.pending.type,type);
    h.keyDown(action,20);h.keyDown(action,30,{repeat:true});
    at(79);assert.equal(h.active,null);assert.equal(h.inputCount,0);
    at(80);
    const ref=R.turn(type,{c:3,r:18,o:0},{cw:1,ccw:-1,rotate180:2}[action]);
    assert.deepEqual(h.active,R.toEngine(type,ref));
    assert.equal(h.inputCount,1);assert.equal(h.inputs[0].irs,true);
    at(500);assert.equal(h.inputCount,1);assert.deepEqual(h.active,R.toEngine(type,ref));
    h.keyUp(action,501);assert.equal(h.inputCount,1);
  });
}

test('IRS off, disabled 180, release before spawn, and most-recent rotate priority',()=>{
  for(const settings of [{irs:false},{allow180:false}]){
    const {h}=rig(settings);h.keyDown('rotate180',0);h.scheduleSpawn('T',0);h.update(80);
    assert.equal(h.active.rot,0);assert.equal(h.inputCount,0);
  }
  const {h}=rig();h.scheduleSpawn('L',0);h.keyDown('cw',5);h.keyDown('ccw',10);h.keyDown('rotate180',15);
  h.keyUp('rotate180',20);h.update(80);assert.equal(h.active.rot,3);assert.equal(h.inputCount,1);
  const b=rig().h;b.scheduleSpawn('T',0);b.keyDown('cw',5);b.keyUp('cw',10);b.update(80);assert.equal(b.active.rot,0);
});

test('IRS applies collision kicks for CW, CCW and 180 and falls back when every kick fails',()=>{
  for(const action of ['cw','ccw','rotate180']){
    const board=new E.Board().set(4,19);
    const {h}=rig({}, {board});h.keyDown(action,0);h.scheduleSpawn('T',0);h.update(80);
    const expected=R.turn('T',{c:3,r:18,o:0},{cw:1,ccw:-1,rotate180:2}[action],new Set(['4,20']));
    assert.deepEqual(h.active,R.toEngine('T',expected));
    assert.ok(h.active.x!==3||h.active.y!==19);assert.equal(h.inputCount,1);
  }
  const spawn=E.spawnPiece('T'),free=new Set(E.cells(spawn).map(c=>c.join(','))),board=new E.Board();
  for(let y=0;y<40;y++)for(let x=0;x<10;x++)if(!free.has(x+','+y))board.set(x,y);
  const {h}=rig({}, {board});h.keyDown('cw',0);h.scheduleSpawn('T',0);h.update(80);
  assert.deepEqual(h.active,spawn);assert.equal(h.inputCount,1);assert.equal(h.blocked,false);
});

test('held IRS counts anew on every spawn; hard drop is not finesse input',()=>{
  let next=0;
  const {h,locks}=rig({}, {autoNext:true,pieceProvider:()=>['T','L','J'][next++%3]});
  h.spawn('S',0);h.keyDown('cw',1);assert.equal(h.inputCount,1);
  h.keyDown('hardDrop',10);assert.equal(locks[0].used,1);assert.equal(h.active,null);
  h.update(90);assert.equal(h.active.type,'T');assert.equal(h.active.rot,1);assert.equal(h.inputCount,1);
  assert.equal(h.inputs[0].irs,true);
  h.keyUp('hardDrop',91);h.keyDown('hardDrop',92);h.update(172);
  assert.equal(h.inputCount,1);assert.equal(h.active.type,'L');assert.equal(h.active.rot,1);
});

test('ARE fake clock includes buffered movement/IRS, preview and exact deadline',()=>{
  const {h,at}=rig({das:50,arr:0});h.scheduleSpawn('T',0);h.keyDown('left',10);h.keyDown('cw',30);
  at(79);assert.equal(h.active,null);assert.equal(h.pending.at,80);
  at(80);assert.equal(h.active.rot,1);assert.equal(E.bounds(h.active).minX,0);
  assert.equal(h.inputCount,2);assert.deepEqual(h.inputs.map(e=>e.label),['CW','DAS←']);
  assert.equal(h.inputs[1].initial,true);assert.equal(h.inputs[1].slide,true);
  const b=rig({are:80,das:110}).h;b.scheduleSpawn('O',0);b.keyDown('right',70);b.update(80);
  assert.equal(E.bounds(b.active).minX,5);assert.equal(b.inputCount,1);
  b.update(179);assert.equal(E.bounds(b.active).minX,5);b.update(180);assert.equal(E.bounds(b.active).minX,8);
  assert.equal(b.inputCount,1);
});

test('DAS first tap, delay boundary, finite ARR backlog, zero-DAS and instant ARR',()=>{
  const {h}=rig({das:100,arr:20});h.spawn('O',0);h.keyDown('left',0);
  assert.equal(E.bounds(h.active).minX,3);h.update(99);assert.equal(E.bounds(h.active).minX,3);
  h.update(100);assert.equal(E.bounds(h.active).minX,2);h.update(140);assert.equal(E.bounds(h.active).minX,0);
  assert.equal(h.inputCount,1);assert.equal(h.inputs[0].slide,true);h.update(10000);assert.equal(h.inputCount,1);
  const b=rig({das:0,arr:0}).h;b.spawn('I',0);b.keyDown('right',0);
  assert.equal(E.bounds(b.active).maxX,9);assert.equal(b.inputCount,1);
  const c=rig({das:0,arr:25}).h;c.spawn('O',0);c.keyDown('left',0);
  assert.equal(E.bounds(c.active).minX,2); // manual tap plus first charged repeat at t=0
});

test('opposite direction is most-recent-wins; older charge resumes without backlog',()=>{
  const {h}=rig({das:100,arr:30});h.spawn('O',0);
  h.keyDown('left',0);h.keyDown('right',50);
  h.update(149);assert.equal(E.bounds(h.active).minX,4);
  h.update(150);assert.equal(E.bounds(h.active).minX,5);
  h.keyUp('right',160);assert.equal(E.bounds(h.active).minX,4);
  h.update(189);assert.equal(E.bounds(h.active).minX,4);
  h.update(190);assert.equal(E.bounds(h.active).minX,3);
  assert.equal(h.inputCount,2);
  h.keyUp('left',191);h.update(500);assert.equal(E.bounds(h.active).minX,3);
});

test('direction counts one total per piece; wall taps/failed rotations/re-taps still count',()=>{
  const {h}=rig({das:20,arr:0});h.spawn('T',0);h.keyDown('left',1);h.update(30);
  assert.equal(h.inputCount,1);assert.equal(E.bounds(h.active).minX,0);
  h.keyUp('left',31);h.keyDown('left',32);assert.equal(h.inputCount,2);
  h.keyDown('left',33);h.keyDown('left',34,{repeat:true});assert.equal(h.inputCount,2);
  h.scheduleSpawn('T',40,0);assert.equal(h.inputCount,1); // held tap moves the new piece
  h.update(100);assert.equal(h.inputCount,1);
  h.keyDown('softDrop',101);assert.equal(h.inputCount,2);assert.equal(h.flags.softDrop,true);
  h.keyUp('softDrop',102);h.keyDown('softDrop',103);assert.equal(h.inputCount,3);
  const board=new E.Board(),spawn=E.spawnPiece('T'),free=new Set(E.cells(spawn).map(c=>c.join(',')));
  for(let y=0;y<40;y++)for(let x=0;x<10;x++)if(!free.has(x+','+y))board.set(x,y);
  const b=rig({}, {board}).h;b.spawn('T',0);b.keyDown('cw',1);assert.equal(b.active.rot,0);assert.equal(b.inputCount,1);
  const c=rig().h;c.keyDown('left',0);c.spawn('O',1);c.keyUp('left',2);
  c.active=E.slidePiece(c.board,c.active,-1);c.keyDown('left',3);assert.equal(c.inputCount,2);
});

test('multiple physical bindings retain independent held keys and IRS priority',()=>{
  const {h}=rig();h.spawn('T',0);
  h.keyDown('cw',1,{code:'ArrowUp'});h.keyDown('cw',2,{code:'KeyX'});
  assert.equal(h.inputCount,2);assert.equal(h.active.rot,2);
  h.keyUp('cw',3,{code:'KeyX'});h.scheduleSpawn('T',4,0);
  assert.equal(h.active.rot,1);assert.equal(h.inputCount,1);
  h.keyDown('left',5,{code:'ArrowLeft'});h.keyDown('right',6,{code:'KeyD'});
  h.keyUp('right',7,{code:'KeyD'});assert.equal(h.held.has('ArrowLeft'),true);
  assert.equal(h.keyUp('cw',8,{code:'KeyX'}),false);
});

test('DCD gates only auto-shift after spawn/rotation, preserving DAS charge',()=>{
  const {h}=rig({das:20,arr:0,dcd:50});h.keyDown('left',0);h.scheduleSpawn('T',0,80);
  h.update(80);assert.equal(E.bounds(h.active).minX,3);assert.equal(h.inputCount,0);
  h.update(129);assert.equal(E.bounds(h.active).minX,3);h.update(130);
  assert.equal(E.bounds(h.active).minX,0);assert.equal(h.inputCount,1);
  h.keyDown('cw',140);assert.equal(E.bounds(h.active).minX,1);
  h.update(189);assert.equal(E.bounds(h.active).minX,1);
  h.update(190);assert.equal(E.bounds(h.active).minX,0);assert.equal(h.inputCount,2);
  h.keyUp('left',191);h.keyDown('right',192); // manual tap ignores existing DCD
  assert.equal(E.bounds(h.active).minX,1);assert.equal(h.inputCount,3);
});

test('finite SDF works with gravity off; instant soft drop starts lock delay; gravity uses G/60Hz',()=>{
  const {h,locks}=rig({sdf:10});h.spawn('T',0);h.keyDown('softDrop',0);
  assert.equal(E.bounds(h.active).minY,19);h.update(350);assert.equal(E.bounds(h.active).minY,16);
  assert.equal(h.inputCount,1);h.keyUp('softDrop',351);h.update(2000);assert.equal(E.bounds(h.active).minY,16);
  h.setSettings({sdf:41},2001);h.keyDown('softDrop',2002);
  assert.equal(E.bounds(h.active).minY,0);assert.equal(locks.length,0);assert.ok(h.active);
  h.keyDown('cw',2003);assert.equal(E.bounds(h.active).minY,0);assert.equal(locks.length,0);
  h.keyDown('hardDrop',2004);assert.equal(locks.length,1);assert.equal(locks[0].flags.softDrop,true);
  const b=rig({gravity:1,sdf:2,lockDelayOn:false}).h;b.spawn('O',0);b.update(50);assert.equal(E.bounds(b.active).minY,17);
  b.keyDown('softDrop',51);b.update(76);assert.equal(E.bounds(b.active).minY,13);
  b.update(1000);assert.equal(E.bounds(b.active).minY,0);assert.ok(b.active);
});

test('IHS defaults off, works held through ARE, precedes IRS, flags skip without finesse cost',()=>{
  let supplied=0;
  const {h}=rig({ihs:true},{pieceProvider:()=>{supplied++;return 'L';}});
  h.scheduleSpawn('T',0);h.keyDown('hold',5);h.keyDown('ccw',10);h.update(80);
  assert.equal(h.active.type,'L');assert.equal(h.heldPiece,'T');assert.equal(h.active.rot,3);
  assert.equal(h.holdUsed,true);assert.equal(h.flags.ihs,true);assert.equal(h.inputCount,1);assert.equal(supplied,1);
  h.keyUp('hold',81);h.keyDown('hold',82);assert.equal(h.active.type,'L');assert.equal(supplied,1);
  h.keyUp('hold',83);h.keyUp('ccw',84);h.keyDown('hardDrop',85);h.spawn('J',86);
  h.keyDown('hold',87);assert.equal(h.active.type,'T');assert.equal(h.heldPiece,'J');assert.equal(h.inputCount,0);
  const b=rig().h;b.keyDown('hold',0);b.scheduleSpawn('T',0);b.update(80);assert.equal(b.active.type,'T');
  const c=rig({ihs:true},{holdEnabled:false}).h;c.keyDown('hold',0);c.spawn('S',0);
  assert.equal(c.active.type,'S');assert.equal(c.heldPiece,null);
});

test('first manual hold pulls bag, second hold requires lock, swapping resets target-piece accounting',()=>{
  const {h,events}=rig({}, {pieceProvider:()=> 'I'});h.spawn('T',0);
  h.keyDown('right',1);h.keyUp('right',2);h.keyDown('hold',3);
  assert.equal(h.active.type,'I');assert.equal(h.heldPiece,'T');assert.equal(h.inputCount,0);assert.equal(h.holdUsed,true);
  h.keyUp('hold',4);h.keyDown('hold',5);assert.equal(h.active.type,'I');
  h.keyDown('hardDrop',6);h.spawn('O',7);h.keyUp('hold',8);h.keyDown('hold',9);
  assert.equal(h.active.type,'T');assert.equal(h.heldPiece,'O');assert.equal(events.filter(e=>e.kind==='hold').length,2);
});

test('live settings preserve DAS age, revise pending ARE and reschedule finite/instant falling',()=>{
  const {h}=rig({das:200,arr:50,are:500});h.scheduleSpawn('T',0);h.keyDown('left',10);
  h.setSettings({are:80,das:40},60);assert.equal(h.pending.at,80);h.update(80);
  assert.equal(E.bounds(h.active).minX,2); // charged finite ARR: one automatic step
  h.setSettings({arr:0},81);assert.equal(E.bounds(h.active).minX,0);
  h.keyDown('softDrop',82);h.setSettings({sdf:41},83);assert.equal(E.bounds(h.active).minY,0);
});

test('pause freezes ARE/DAS/gravity and injected clock rejects backwards/invalid timestamps',()=>{
  const {h,at,set}=rig({gravity:1,arr:10});h.scheduleSpawn('O',0);h.keyDown('left',5);
  h.pause(30);at(1000);assert.equal(h.active,null);h.resume(1030);at(1079);assert.equal(h.active,null);
  at(1080);assert.ok(h.active);assert.equal(E.bounds(h.active).minX,3);
  h.pause(1090);const state={...h.active};at(2000);assert.deepEqual(h.active,state);
  h.keyUp('left',2001);h.resume(2090);at(2106);assert.equal(E.bounds(h.active).minY,19);
  assert.throws(()=>h.update(1));assert.throws(()=>h.update(Infinity));assert.throws(()=>h.keyDown('wat',2107));
  set(2200);h.update();assert.equal(h.time,2200);
});

// Same timestamped keys and settings with very different rendering cadence.
// Compare every emitted movement/fall/rotation/spawn/lock timestamp AND final
// accounting/board/held state, not just the final x position at the wall.
function replay(step,settings){
  const events=[],locks=[];let nextIndex=0;
  const h=new E.InputHandler({time:0,clock:()=>0,settings,
    autoNext:true,pieceProvider:()=>['I','S','L','J','T','O','Z'][nextIndex++%7],
    onEvent:e=>events.push(structuredClone(e)),onLock:r=>locks.push(structuredClone(r))});
  h.scheduleSpawn('T',0);
  const keys=[
    [7,'down','left'],[19,'down','cw'],[34,'up','cw'],[63,'down','softDrop'],
    [147,'down','right'],[183,'down','ccw'],[194,'up','ccw'],[207,'up','right'],
    [237,'down','hardDrop'],[238,'up','hardDrop'],[251,'down','rotate180'],
    [292,'up','softDrop'],[339,'up','rotate180'],[367,'down','right'],[389,'up','left'],
    [419,'down','cw'],[423,'up','cw'],[471,'down','softDrop'],[537,'down','hardDrop'],
    [538,'up','hardDrop'],[570,'down','hold'],[590,'up','hold'],[603,'up','softDrop'],
    [637,'up','right'],[659,'down','left'],[704,'down','cw'],[718,'up','cw'],
    [790,'settings',{das:63,arr:settings.arr,sdf:settings.sdf}],
    [823,'down','softDrop'],[877,'down','hardDrop'],[878,'up','hardDrop'],
    [921,'up','softDrop'],[993,'up','left'],[1021,'down','right'],[1173,'up','right']
  ];
  const frames=[];for(let t=step;t<=1300;t+=step)frames.push([t,'frame']);
  const timeline=keys.concat(frames).sort((a,b)=>a[0]-b[0]||(a[1]==='frame'?1:-1));
  for(const [t,kind,value] of timeline){
    if(kind==='frame')h.update(t);
    else if(kind==='settings')h.setSettings(value,t);
    else h[kind==='down'?'keyDown':'keyUp'](value,t);
  }
  h.update(1300);
  return {events,locks,active:h.active,inputs:h.inputs,count:h.inputCount,pending:h.pending,
    flags:h.flags,hold:h.heldPiece,board:h.board.rows};
}
for(const arr of [0,1,17,60])for(const sdf of [1,13,40,41]){
  test('frame independence 1ms / 16ms / 100ms: ARR='+arr+' SDF='+sdf,()=>{
    const settings={das:91,arr,sdf,dcd:23,are:80,gravity:0.03,ihs:true};
    const one=replay(1,settings);
    assert.ok(one.locks.length>=3);assert.ok(one.events.some(e=>e.kind==='fall'));
    assert.deepEqual(replay(16,settings),one);assert.deepEqual(replay(100,settings),one);
  });
}

test('single 1000ms update catches up all finite DAS/ARR/fall events',()=>{
  const logs=[];
  for(const step of [1,16,100,1000]){
    const {h,events}=rig({das:100,arr:30,gravity:0.1});h.spawn('T',0);h.keyDown('left',0);
    for(let t=step;t<1000;t+=step)h.update(t);h.update(1000);
    logs.push({events,state:h.active,inputs:h.inputs});
  }
  for(const result of logs.slice(1))assert.deepEqual(result,logs[0]);
});

test('releasing newer direction in pause resumes older charge at resume, without over-shifting deadlines',()=>{
  const {h}=rig({das:50,arr:20});h.spawn('O',0);h.keyDown('left',0);h.keyDown('right',10);
  h.pause(100);const before=h.active.x;h.keyUp('right',500);h.update(1000);
  assert.equal(h.active.x,before);h.resume(1100);
  assert.equal(h.active.x,before-1);h.update(1119);assert.equal(h.active.x,before-1);
  h.update(1120);assert.equal(h.active.x,before-2);
});

test('paused settings and soft-drop releases never move pieces; new fall phase begins on resume',()=>{
  const {h}=rig({gravity:0.1,sdf:2});h.spawn('O',0);h.keyDown('softDrop',0);h.pause(10);
  const before={...h.active};h.setSettings({sdf:41},100);assert.deepEqual(h.active,before);
  h.keyUp('softDrop',500);assert.deepEqual(h.active,before);h.resume(1010);
  assert.deepEqual(h.active,before);h.update(1176);assert.deepEqual(h.active,before);
  h.update(1177);assert.equal(h.active.y,before.y-1);
  const b=rig({sdf:2}).h;b.spawn('T',0);b.keyDown('softDrop',0);b.pause(10);
  b.setSettings({sdf:41},100);assert.equal(E.bounds(b.active).minY,19);
  b.resume(1010);assert.equal(E.bounds(b.active).minY,0);assert.equal(b.inputCount,1);
});

test('atomic release restarts falling only when removing soft drop changes its rate',()=>{
  const {h}=rig({gravity:1/60,sdf:2});h.spawn('O',0);h.keyDown('softDrop',100);
  assert.equal(h.fallAt,600);h.pause(400);
  const before={...h.active};h.releaseAll(1500);
  assert.equal(h.fallAt,1400);assert.deepEqual(h.active,before);assert.equal(h.held.size,0);
  h.releaseAll(2000);assert.equal(h.fallAt,1400);
  h.resume(2400);h.update(3399);assert.deepEqual(h.active,before);
  h.update(3400);assert.equal(h.active.y,before.y-1);
});

test('a callback may pause at spawn during a long update without processing later due events',()=>{
  const {h}=rig({gravity:1},{onSpawn:(_state,handler)=>handler.pause(handler.time)});
  h.scheduleSpawn('T',0);h.update(1000);
  assert.equal(h.paused,true);assert.equal(h.pauseStarted,80);assert.equal(E.bounds(h.active).minY,20);
  h.callbacks.onSpawn=null;h.resume(1080);h.update(1097);assert.equal(E.bounds(h.active).minY,19);
});

test('inherited direction is counted only when it moves, including blocked buffered taps and slides',()=>{
  for(const das of [0,100]){
    const board=new E.Board().set(3,20),{h}=rig({das},{board});
    h.keyDown('left',0);h.spawn('O',1);assert.equal(h.inputCount,0);
    h.update(150);assert.equal(h.inputCount,0);
    h.keyUp('left',151);h.keyDown('left',152);assert.equal(h.inputCount,1);
  }
});

test('spawnDrop follows IRS, blocked spawns report blockout, IRS kicks may rescue an obstructed spawn',()=>{
  for(const type of E.PIECE_TYPES){
    const {h}=rig({spawnDrop:true});h.keyDown('cw',0);h.spawn(type,0);
    const rotated=E.rotatePiece(new E.Board(),E.spawnPiece(type),1);
    assert.deepEqual(h.active,{...rotated,y:rotated.y-1});
  }
  const blocked=new E.Board().set(4,21),a=rig({}, {board:blocked}).h;
  a.spawn('T',0);assert.equal(a.active,null);assert.equal(a.blocked,true);
  const b=rig({}, {board:blocked.clone()}).h;b.keyDown('cw',0);b.spawn('T',0);
  assert.ok(b.active);assert.equal(b.active.rot,1);assert.equal(b.blocked,false);assert.equal(b.inputCount,1);
});

test('zero ARE applies inherited IRS and charged DAS immediately once for the next piece',()=>{
  const {h,locks}=rig({are:0,das:0,arr:0},{autoNext:true,pieceProvider:()=> 'L'});
  h.spawn('T',0);h.keyDown('cw',1);h.keyDown('left',2);h.keyDown('hardDrop',3);
  assert.equal(locks.length,1);assert.equal(locks[0].used,2);
  assert.equal(h.active.type,'L');assert.equal(h.active.rot,1);assert.equal(h.inputCount,2);
  assert.equal(E.bounds(h.active).minX,0);assert.equal(h.inputs[0].irs,true);
  h.update(1000);assert.equal(locks.length,1);assert.equal(h.inputCount,2);
});

test('IHS latches a released ARE tap once, while IRS requires a still-held key',()=>{
  const {h,events}=rig({ihs:true},{pieceProvider:()=> 'L'});h.scheduleSpawn('T',0);
  h.keyDown('hold',20);h.keyUp('hold',21);h.keyDown('cw',30);h.keyUp('cw',31);h.update(80);
  assert.equal(h.active.type,'L');assert.equal(h.heldPiece,'T');assert.equal(h.flags.ihs,true);
  assert.equal(h.active.rot,0);assert.equal(h.inputCount,0);assert.equal(h.holdUsed,true);
  assert.equal(events.filter(e=>e.kind==='hold').length,1);
  h.keyDown('hardDrop',81);h.spawn('S',82);assert.equal(h.active.type,'S');assert.equal(h.flags.ihs,false);
  const b=rig({ihs:false},{pieceProvider:()=> 'L'}).h;b.scheduleSpawn('T',0);
  b.keyDown('hold',20);b.keyUp('hold',21);b.update(80);assert.equal(b.active.type,'T');
});
