'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../src/engine.js');
const R=require('./engine.reference.js');

test('classic script and CommonJS work without DOM or imports',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/engine.js'),'utf8'),context);
  assert.equal(typeof context.MiruTet.InputHandler,'function');
  assert.equal(context.MiruTet.allPlacements('O').length,9);
  assert.equal(Object.isFrozen(E.SHAPES.T[0][0]),true);
  assert.equal(Object.isFrozen(E.KICKS_I['0>R']),true);
});

test('exact Guideline spawn cells, colors, dimensions and default spawnDrop OFF',()=>{
  const expected={
    I:[[3,20],[4,20],[5,20],[6,20]],O:[[4,20],[5,20],[4,21],[5,21]],
    T:[[3,20],[4,20],[5,20],[4,21]],S:[[3,20],[4,20],[4,21],[5,21]],
    Z:[[4,20],[5,20],[3,21],[4,21]],J:[[3,20],[4,20],[5,20],[3,21]],
    L:[[3,20],[4,20],[5,20],[5,21]]
  };
  assert.deepEqual(E.COLORS,{I:'#00F0F0',O:'#F0F000',T:'#A000F0',S:'#00F000',Z:'#F00000',J:'#0000F0',L:'#F0A000'});
  const board=new E.Board();
  assert.deepEqual([board.width,board.height,E.VISIBLE_HEIGHT],[10,40,20]);
  for(const type of E.PIECE_TYPES){
    const spawn=E.spawnPiece(type);
    assert.equal(spawn.rot,0);
    assert.equal(E.cellsKey(E.cells(spawn)),E.cellsKey(expected[type]),type);
    assert.deepEqual(E.spawnPiece(type,{board,spawnDrop:true}),{...spawn,y:spawn.y-1});
    const blocked=board.clone();
    const bottom=E.cells(spawn).sort((a,b)=>a[1]-b[1])[0];
    blocked.set(bottom[0],bottom[1]-1);
    assert.deepEqual(E.spawnPiece(type,{board:blocked,spawnDrop:true}),spawn);
  }
  assert.equal(E.DEFAULT_SETTINGS.spawnDrop,false);
});

test('every orientation agrees with independently drawn matrices',()=>{
  for(const type of E.PIECE_TYPES) for(let rot=0;rot<4;rot++){
    const state={...E.spawnPiece(type),rot};
    const independent=R.points(type,R.fromEngine(state)).map(([c,r])=>[c,39-r]);
    assert.equal(E.cellsKey(E.cells(state)),E.cellsKey(independent),type+' '+rot);
  }
});

test('all eight JLSTZ and separate I standard SRS tables match literal reference',()=>{
  for(const type of E.PIECE_TYPES) for(let from=0;from<4;from++) for(const amount of [-1,1]){
    const to=(from+amount+4)%4;
    assert.deepEqual(E.kickTests(type,from,to),R.tests(type,from,to),type+' '+from+'>'+to);
  }
  assert.deepEqual(Object.keys(E.KICKS_JLSTZ).sort(),['0>L','0>R','2>L','2>R','L>0','L>2','R>0','R>2']);
  assert.notDeepEqual(E.kickTests('I',0,1),E.kickTests('T',0,1));
});

test('180 SRS+ extension matches all literal JLSTZ/I tables; O never kicks',()=>{
  for(const type of E.PIECE_TYPES) for(let from=0;from<4;from++){
    assert.deepEqual(E.kickTests(type,from,(from+2)%4),R.tests(type,from,(from+2)%4),type+' '+from);
    const state={...E.spawnPiece(type),rot:from};
    const half=E.rotatePiece(new E.Board(),state,2);
    assert.deepEqual(half,E.rotatePiece(new E.Board(),E.rotatePiece(new E.Board(),state,1),1));
    assert.equal(E.rotatePiece(new E.Board(),state,2,{allow180:false}),null);
    if(type==='O') assert.equal(E.cellsKey(E.cells(state)),E.cellsKey(E.cells(half)));
  }
});

test('quarter and half turns at every legal wall/floor/ceiling origin match independent simulator',()=>{
  const board=new E.Board();
  let cases=0;
  for(const type of E.PIECE_TYPES) for(let rot=0;rot<4;rot++) for(let x=-3;x<=9;x++){
    for(const y of [-3,-2,-1,0,1,2,18,19,20,36,37,38,39]){
      const state={type,x,y,rot}; if(!board.fits(state)) continue;
      for(const amount of [-1,1,2]){
        const expected=R.turn(type,R.fromEngine(state),amount);
        const actual=E.rotatePiece(board,state,amount);
        assert.deepEqual(actual,expected&&R.toEngine(type,expected),JSON.stringify({state,amount}));
        if(actual) assert.equal(board.fits(actual),true);
        // Every valid empty-board 180 near walls/floor has a legal result.
        if(amount===2 && y<25) assert.ok(actual,JSON.stringify(state));
        cases++;
      }
    }
  }
  assert.ok(cases>4000);
});

test('forced obstruction fixtures exercise every SRS kick index in priority order',()=>{
  const exercised={quarter:new Set(),half:new Set(),iQuarter:new Set(),iHalf:new Set()};
  for(const type of ['T','J','L','S','Z','I']) for(let from=0;from<4;from++) for(const amount of [-1,1,2]){
    const to=(from+amount+4)%4, kicks=R.tests(type,from,to);
    for(let index=0;index<kicks.length;index++){
      // Protect both the source and requested destination. Place blockers in
      // every earlier candidate, where possible, to make this test first fit.
      let found=false;
      for(let x=-2;x<9&&!found;x++) for(let y=-2;y<6&&!found;y++){
        const board=new E.Board(),state={type,x,y,rot:from};
        const [dx,dy]=kicks[index],wanted={type,x:x+dx,y:y+dy,rot:to};
        if(!board.fits(state)||!board.fits(wanted)) continue;
        const protectedCells=new Set(E.cells(state).concat(E.cells(wanted)).map(c=>c.join(',')));
        let possible=true;
        for(let earlier=0;earlier<index;earlier++){
          const [px,py]=kicks[earlier],candidate={type,x:x+px,y:y+py,rot:to};
          if(!board.fits(candidate)) continue;
          const blocker=R.points(type,R.fromEngine(candidate)).map(([c,r])=>[c,39-r])
            .find(c=>board.inside(...c)&&!protectedCells.has(c.join(',')));
          if(!blocker){possible=false;break;}
          board.set(...blocker);
        }
        if(!possible) continue;
        assert.deepEqual(E.rotatePiece(board,state,amount),wanted,JSON.stringify({type,from,to,index}));
        exercised[type==='I'?(amount===2?'iHalf':'iQuarter'):(amount===2?'half':'quarter')].add(index);
        found=true;
      }
    }
  }
  assert.deepEqual([...exercised.quarter].sort(),[0,1,2,3,4]);
  assert.deepEqual([...exercised.iQuarter].sort(),[0,1,2,3,4]);
  assert.deepEqual([...exercised.half].sort(),[0,1,2,3,4,5]);
  assert.deepEqual([...exercised.iHalf].sort(),[0,1]);
});

test('all kicks obstructed fail atomically and never mutate input state',()=>{
  const state=E.spawnPiece('T'), board=new E.Board();
  const free=new Set(E.cells(state).map(c=>c.join(',')));
  for(let y=0;y<40;y++)for(let x=0;x<10;x++)if(!free.has(x+','+y))board.set(x,y);
  const before={...state};
  for(const turn of [-1,1,2]) assert.equal(E.rotatePiece(board,state,turn),null);
  assert.deepEqual(state,before);
});

test('board collision, hard/soft displacement, atomic lock, cloning, and optional line clears',()=>{
  const board=new E.Board(), spawn=E.spawnPiece('O');
  const dropped=E.hardDrop(board,spawn);
  assert.equal(E.bounds(dropped).minY,0);
  assert.equal(E.movePiece(board,dropped,0,-1),null);
  assert.equal(E.bounds(E.slidePiece(board,spawn,-1)).minX,0);
  assert.equal(E.bounds(E.slidePiece(board,spawn,1)).maxX,9);
  board.set(4,5,'#');
  assert.equal(E.bounds(E.hardDrop(board,spawn)).minY,6);
  const copy=board.clone();copy.clear();assert.equal(board.get(4,5),'#');
  board.lock(dropped);const locked=JSON.stringify(board.rows);
  assert.throws(()=>board.lock(dropped));assert.equal(JSON.stringify(board.rows),locked);
  assert.equal(E.hardDrop(board,dropped),null);
  assert.equal(board.fits({...spawn,y:39}),false);
  assert.equal(board.fits({...spawn,x:0.5}),false);
  for(let x=0;x<10;x++)copy.set(x,0);
  copy.set(2,1,'J');assert.equal(copy.clearLines(),1);assert.equal(copy.get(2,0),'J');
  assert.equal(copy.rows.length,40);assert.equal(copy.rows[39].every(c=>c===null),true);
  assert.throws(()=>board.set(10,0));assert.throws(()=>new E.Board(3,40));
  assert.throws(()=>new E.Board({rows:[[1]]}));assert.throws(()=>E.spawnPiece('X'));
});
