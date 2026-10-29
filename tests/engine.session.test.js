'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/engine.js');

function makeSession(options={}){
  let now=0;const events=[];
  const session=new E.DrillSession({clock:()=>now,time:0,seed:'session',
    onEvent:e=>events.push(structuredClone(e)),...options});
  return {s:session,events,set:t=>{now=t;},at:t=>{now=t;session.update();}};
}
function ready(session){
  if(session.handler.pending)session.update(session.handler.pending.at);
  assert.ok(session.handler.active);return session.handler.time;
}
function tap(session,action,t){session.keyDown(action,t);session.keyUp(action,t+1);return t+2;}
function optimalLock(session,waste=false){
  let t=ready(session)+1;
  if(waste){t=tap(session,'cw',t);t=tap(session,'ccw',t);}
  for(const action of session.round.target.actions){
    const direction={dasLeft:'left',dasRight:'right'}[action];
    if(direction){
      session.keyDown(direction,t);t+=session.settings.das+session.settings.dcd+1;session.update(t);
      session.keyUp(direction,t);t+=2;
    }else t=tap(session,action,t);
  }
  session.keyDown('hardDrop',t);session.keyUp('hardDrop',t+1);
  return {t,result:session.lastResult};
}

test('drill and sprint with lock delay OFF require hard drop across repeated ledge recontacts',()=>{
  for(const sprintLength of [0,40]){
    const board=new E.Board().set(5,0,'J');
    const {s}=makeSession({pieces:['O'],board,sprintLength,settings:{are:0,sdf:41,lockDelayOn:false}});
    s.start(0);let t=tap(s,'softDrop',1);
    for(let i=0;i<20;i++){
      t=tap(s,'cw',t);t=tap(s,'left',t);t=tap(s,'right',t);
    }
    assert.equal(s.settings.lockDelayOn,false);assert.equal(s.handler.lockAt,Infinity);
    s.update(10000);assert.ok(s.handler.active);assert.equal(s.stats.attempts,0);
    tap(s,'hardDrop',10001);assert.equal(s.stats.attempts,1);assert.equal(s.running,true);
  }
});

test('stats separate perfect/fault/miss, aggregate by piece/target and round-trip snapshots',()=>{
  const stats=new E.Stats();
  stats.record({type:'T',targetKey:'test',status:'perfect',used:1,optimal:1});
  stats.record({type:'T',targetKey:'test',status:'fault',used:3,optimal:1,flags:{softDrop:true}});
  stats.record({type:'I',targetKey:'other',status:'miss',used:2,optimal:1});
  const snapshot=stats.snapshot();
  assert.deepEqual([snapshot.attempts,snapshot.placements,snapshot.perfect,snapshot.faults,snapshot.misses],[3,2,1,1,1]);
  assert.equal(snapshot.accuracy,100/3);assert.equal(snapshot.averageInputs,2);assert.equal(snapshot.averageOptimal,1);
  assert.equal(snapshot.streak,0);assert.equal(snapshot.bestStreak,1);assert.equal(snapshot.softDropAttempts,1);
  assert.equal(snapshot.byPiece.T.attempts,2);assert.equal(snapshot.byPiece.I.misses,1);
  assert.equal(snapshot.byTarget['T:test'].faults,1);
  stats.record({type:'O',targetKey:'x',status:'perfect',used:0,optimal:0});
  stats.record({type:'O',targetKey:'x',status:'perfect',used:0,optimal:0});
  assert.equal(stats.streak,2);assert.equal(stats.bestStreak,2);
  const saved=JSON.parse(JSON.stringify(stats));assert.deepEqual(new E.Stats(saved).toJSON(),saved);
  snapshot.byPiece.T.faults=500;assert.equal(stats.byPiece.T.faults,1);
  stats.reset();assert.equal(stats.attempts,0);assert.equal(stats.bestStreak,0);assert.deepEqual(Object.keys(stats.byTarget),[]);
  assert.throws(()=>stats.record({type:'T',status:'foo',used:0,optimal:0}));
  assert.throws(()=>stats.record({type:'T',status:'fault',used:-1,optimal:0}));
  const loaded=new E.Stats({attempts:-1,perfect:NaN,bestTimes:{40:1234,'__bad':2,100:-1}});
  assert.equal(loaded.attempts,0);assert.equal(loaded.perfect,0);assert.deepEqual({...loaded.bestTimes},{40:1234});
});

test('target and five-piece next preview exist throughout ARE; retry preserves piece/target',()=>{
  const {s,at}=makeSession({settings:{are:80}});s.start(0);
  const round=structuredClone(s.round),next=s.nextQueue();
  assert.equal(s.handler.active,null);assert.equal(next.length,5);assert.equal(next[0],round.type);
  at(79);assert.deepEqual(s.round,round);assert.deepEqual(s.nextQueue(),next);at(80);
  assert.equal(s.handler.active.type,round.type);assert.equal(s.nextQueue().length,5);
  assert.deepEqual(s.nextQueue(),s.bag.peek(5));
  s.keyDown('right',81);s.keyUp('right',82);s.retry(90);
  assert.equal(s.handler.active,null);assert.equal(s.round.type,round.type);assert.equal(s.round.target.key,round.target.key);
  s.update(170);assert.deepEqual(s.handler.active,E.spawnPiece(round.type));assert.equal(s.handler.inputCount,0);
  assert.equal(s.stats.retries,1);assert.equal(s.stats.attempts,0);assert.equal(s.totalStats.retries,1);
});

test('perfect/fault feedback, actual and optimal sequences, empty board after every drill lock',()=>{
  const {s}=makeSession({pieces:['T'],settings:{are:80}});s.start(0);
  const first=optimalLock(s).result;
  assert.equal(first.status,'perfect');assert.equal(first.used,first.optimal);assert.equal(first.advanced,true);
  assert.deepEqual(first.optimalSequence,first.inputs.map(e=>e.label));
  assert.equal(s.stats.streak,1);assert.equal(s.stats.perfect,1);assert.equal(s.completed,1);assert.ok(s.handler.board.isEmpty());
  const second=optimalLock(s,true).result;
  assert.equal(second.status,'fault');assert.equal(second.used,second.optimal+2);assert.equal(second.extra,2);
  assert.equal(s.stats.streak,0);assert.equal(s.stats.bestStreak,1);assert.equal(s.stats.faults,1);assert.equal(s.completed,2);
  assert.equal(s.totalStats.attempts,2);assert.equal(s.handler.board.isEmpty(),true);
  assert.equal(s.snapshot(second.t).accuracy,50);assert.equal(s.stats.byPiece.T.attempts,2);
});

test('miss is separate from finesse fault and repeats the same target by default',()=>{
  const {s}=makeSession({pieces:['O'],settings:{das:0,are:40}});s.start(0);let t=ready(s)+1;
  const target=s.round.target;
  const direction=target.x===0?'right':'left';
  s.keyDown(direction,t);s.keyUp(direction,t+1);s.keyDown('hardDrop',t+2);s.keyUp('hardDrop',t+3);
  assert.equal(s.lastResult.status,'miss');assert.equal(s.lastResult.advanced,false);
  assert.equal(s.stats.misses,1);assert.equal(s.stats.faults,0);assert.equal(s.completed,0);
  assert.equal(s.round.target.key,target.key);assert.equal(s.stats.placements,0);
  assert.equal(s.stats.byPiece.O.misses,1);
});

test('zero-fault resets same target and does not advance sprint; repeat-on-fault also repeats',()=>{
  for(const option of [{zeroFault:true},{repeatOnFault:true}]){
    const {s}=makeSession({pieces:['J'],sprintLength:2,...option});s.start(0);
    const target=s.round.target.key;const fault=optimalLock(s,true).result;
    assert.equal(fault.status,'fault');assert.equal(s.round.target.key,target);
    assert.equal(s.completed,option.zeroFault?0:1);assert.equal(s.stats.placements,1);
    optimalLock(s);assert.equal(s.stats.perfect,1);assert.equal(s.completed,option.zeroFault?1:2);
    if(option.zeroFault){assert.equal(s.running,true);optimalLock(s);}
    assert.equal(s.running,false);assert.equal(s.snapshot().finished,true);
  }
});

test('all legal placements complete perfectly through real InputHandler accounting, both 180 settings',()=>{
  // A one-piece bag consumes no RNG during shuffling: sweep the exact centers
  // of all uniform target intervals to exercise each distinct target once.
  for(const allow180 of [true,false])for(const type of E.PIECE_TYPES){
    const placements=E.allPlacements(type,{allow180}),n=placements.length;
    let fraction=0.5/n;
    const {s}=makeSession({pieces:[type],rng:()=>fraction,settings:{allow180,are:0}});s.start(0);
    const visited=new Set();
    for(let i=0;i<n;i++){
      if(i>0){fraction=(i+0.5)/n;s.skip(s.handler.time+1);}
      const key=s.round.target.key;assert.equal(visited.has(key),false);visited.add(key);
      // The post-lock target draw is irrelevant; the next skip selects explicitly.
      const {result}=optimalLock(s);
      assert.equal(result.status,'perfect',type+' '+allow180+' '+key+' '+JSON.stringify(result));
      assert.equal(result.used,result.optimal);assert.ok(s.handler.board.isEmpty());
    }
    assert.equal(visited.size,n);assert.equal(s.stats.perfect,n);assert.equal(s.stats.faults,0);
  }
});

test('piece filter uses bags, singleton disables hold, skip/retry have no placement stats',()=>{
  const {s}=makeSession({pieces:['I','O','L'],settings:{are:0}});s.start(0);
  const drawn=[];
  for(let i=0;i<30;i++){drawn.push(s.round.type);s.skip(s.handler.time+1);}
  for(let i=0;i<drawn.length;i+=3)assert.deepEqual(drawn.slice(i,i+3).sort(),['I','L','O']);
  assert.equal(s.stats.skips,30);assert.equal(s.stats.attempts,0);
  const single=makeSession({pieces:['T'],settings:{ihs:true,are:80}}).s;
  single.start(0);single.keyDown('hold',10);single.update(80);
  assert.equal(single.handler.active.type,'T');assert.equal(single.handler.holdEnabled,false);
  assert.equal(single.stats.skips,0);assert.equal(single.handler.heldPiece,null);
  single.keyUp('hold',81);single.keyDown('hold',82);assert.equal(single.stats.skips,0);
});

test('manual hold and IHS generate fresh target, count as skips and enforce single hold until lock',()=>{
  const {s}=makeSession({pieces:['I','O','T'],settings:{are:80,ihs:true}});s.start(0);
  const original=s.round.type,next=s.bag.peek(1)[0];
  s.keyDown('hold',10);s.keyDown('cw',20);s.update(80);
  assert.equal(s.handler.heldPiece,original);assert.equal(s.round.type,next);assert.equal(s.handler.active.type,next);
  assert.equal(s.handler.flags.ihs,true);assert.equal(s.handler.holdUsed,true);assert.equal(s.stats.skips,1);
  assert.equal(s.stats.attempts,0);assert.equal(s.handler.inputCount,1);assert.equal(s.handler.active.rot,1);
  s.keyUp('hold',81);s.keyDown('hold',82);assert.equal(s.stats.skips,1);
  s.keyUp('hold',83);s.keyUp('cw',84);s.keyDown('hardDrop',85);s.keyUp('hardDrop',86);
  ready(s);const replacing=s.round.type,serial=s.round.serial;
  s.keyDown('hold',s.handler.time+1);
  assert.equal(s.round.type,original);assert.equal(s.handler.active.type,original);assert.equal(s.handler.heldPiece,replacing);
  assert.ok(s.round.serial>serial);assert.equal(s.stats.skips,2);assert.equal(s.handler.inputCount,0);
});

test('area/custom column filters are inclusive occupied-left columns and reject empty target sets',()=>{
  for(const [area,min,max] of [['left',0,2],['center',3,5],['right',6,9]]){
    const {s}=makeSession({area,settings:{are:0}});s.start(0);
    for(let i=0;i<60;i++){
      assert.ok(s.round.target.x>=min&&s.round.target.x<=max);
      s.skip(s.handler.time+1);
    }
  }
  const {s}=makeSession({columnRange:[2,2],settings:{are:0}});s.start(0);
  for(let i=0;i<14;i++){assert.equal(s.round.target.x,2);s.skip(s.handler.time+1);}
  assert.throws(()=>makeSession({pieces:[]}));assert.throws(()=>makeSession({columnRange:[4,1]}));
  assert.throws(()=>makeSession({pieces:['O'],columnRange:[9,9]}));assert.throws(()=>makeSession({area:'outside'}));
  assert.throws(()=>makeSession({sprintLength:-1}));
});

test('uniform target selection covers every interval equally; weak-spot mode raises faulty-target weight',()=>{
  const placements=E.allPlacements('O'),weak=placements[0];
  const totalStats=new E.Stats();
  for(let i=0;i<50;i++)totalStats.record({type:'O',targetKey:weak.key,status:'fault',used:3,optimal:1});
  const choose=weakSpot=>makeSession({pieces:['O'],rng:()=>0.2,totalStats:new E.Stats(totalStats.toJSON()),
    weakSpot,settings:{are:0}}).s;
  const uniform=choose(false),weighted=choose(true);uniform.start(0);weighted.start(0);
  assert.notEqual(uniform.round.target.key,weak.key);assert.equal(weighted.round.target.key,weak.key);
});

test('sprint 40/100/custom finish at N correct placements, save best duration and stop accepting input',()=>{
  for(const length of [3,40,100]){
    const {s}=makeSession({pieces:['O'],sprintLength:length,rng:()=>4.5/9,settings:{are:10}});s.start(0);
    assert.equal(s.startedAt,null);assert.equal(s.elapsed(100),0);
    let last;
    for(let i=0;i<length;i++){last=optimalLock(s);assert.equal(last.result.status,'perfect');}
    const summary=s.snapshot(last.t+500);
    assert.equal(summary.finished,true);assert.equal(summary.completed,length);assert.equal(summary.perfect,length);
    assert.equal(summary.faults,0);assert.equal(summary.accuracy,100);
    assert.equal(summary.elapsed,last.t-s.startedAt);assert.equal(summary.pps,summary.elapsed?length*1000/summary.elapsed:0);
    assert.equal(s.totalStats.bestTimes[length],summary.elapsed);assert.equal(s.handler.active,null);assert.equal(s.handler.pending,null);
    assert.equal(s.keyDown('left',last.t+1000),false);assert.equal(s.retry(last.t+1000),false);assert.equal(s.skip(last.t+1000),false);
    assert.throws(()=>s.start(last.t+1001));
  }
});

test('sprint timer includes first IRS, excludes pauses/initial ARE, and retains better best time',()=>{
  const total=new E.Stats({bestTimes:{2:1}});
  const {s}=makeSession({pieces:['T'],sprintLength:2,totalStats:total,settings:{are:80}});s.start(0);
  s.keyDown('cw',20);assert.equal(s.startedAt,null);s.update(80);assert.equal(s.startedAt,80);
  s.keyUp('cw',81);s.pause(90);s.update(1090);assert.equal(s.elapsed(1090),10);
  s.resume(1090);assert.equal(s.elapsed(1100),20);
  // Restart the attempt so the scripted optimal sequence begins in orientation 0.
  s.retry(1101);optimalLock(s);const {t}=optimalLock(s);
  assert.equal(s.elapsed(t),t-80-1000);assert.equal(s.totalStats.bestTimes[2],1);
});

test('settings recalculate optimal counts and ARE live, command inputs route retry/skip/pause',()=>{
  const {s}=makeSession({pieces:['T'],settings:{are:80}});s.start(0);
  const key=s.round.target.key;s.setSettings({allow180:false,are:40},10);
  assert.equal(s.round.target.key,key);assert.equal(s.handler.pending.at,40);
  assert.equal(s.round.optimal,E.finesseFor('T',s.round.target.cells,{allow180:false}).count);
  s.update(40);s.keyDown('retry',41);s.keyUp('retry',42);assert.equal(s.stats.retries,1);
  s.keyDown('skip',43);s.keyUp('skip',44);assert.equal(s.stats.skips,1);
  s.keyDown('pause',45);s.keyUp('pause',46);assert.equal(s.handler.paused,true);assert.equal(s.pausedAt,45);
  s.keyDown('pause',145);s.keyUp('pause',146);assert.equal(s.handler.paused,false);assert.equal(s.pausedAt,null);
});

test('a hold tap released during ARE still performs IHS and records a skip on spawn',()=>{
  const {s}=makeSession({pieces:['I','O'],settings:{ihs:true}});s.start(0);
  const incoming=s.bag.peek(1)[0];s.keyDown('hold',10);s.keyUp('hold',11);s.update(80);
  assert.equal(s.handler.active.type,incoming);assert.equal(s.round.type,incoming);
  assert.equal(s.handler.flags.ihs,true);assert.equal(s.stats.skips,1);assert.equal(s.stats.attempts,0);
  assert.equal(s.handler.inputCount,0);
});
