'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../src/engine.js');
const R=require('./engine.reference.js');

const expectedCounts={O:9,I:17,S:17,Z:17,T:34,J:34,L:34};
const reports=['Moe Tet finesse table — empty 10×40 board; y up; target x = occupied left column.',
  'Hard drop costs 0. Tap / DAS / rotation cost 1. IRS costs 1.',
  'Strict Guideline SRS 90°; TETR.IO SRS+ 180 extension (separate I table).',
  'Each cost independently checked by top-down matrix iterative-deepening search.',
  'The rows include all four rotation names; duplicate landing shapes share a cost.',''];

for(const allow180 of [true,false])for(const type of E.PIECE_TYPES){
  test('independent exhaustive reference: '+type+' EVERY rotation × column, 180='+allow180,()=>{
    const independent=R.bruteForce(type,allow180);
    const targets=R.legalTargets(type);
    const actual=E.allPlacements(type,{allow180});
    assert.equal(actual.length,expectedCounts[type]);
    assert.equal(new Set(actual.map(p=>p.key)).size,expectedCounts[type]);
    assert.equal(independent.size,expectedCounts[type]);
    let maximum=0;
    reports.push(type+' — 180 '+(allow180?'ON':'OFF')+' — '+actual.length+' distinct placements');
    for(let rot=0;rot<4;rot++){
      const entries=[];
      for(const target of targets.filter(t=>t.o===rot)){
        const solved=E.finesseFor(type,{rot,x:target.x},{allow180});
        assert.ok(solved,type+' '+rot+' '+target.x);
        assert.equal(solved.count,independent.get(target.key),type+' '+rot+' x='+target.x);
        assert.equal(solved.count,solved.actions.length);
        assert.equal(solved.sequence.length,solved.count);
        // Replay optimal sequence using ONLY the independent simulator.
        let state={c:3,r:18,o:0};
        for(const action of solved.actions){
          if(action==='cw'||action==='ccw'||action==='rotate180'){
            assert.ok(allow180||action!=='rotate180');
            state=R.turn(type,state,{cw:1,ccw:-1,rotate180:2}[action]);
          }else{
            const d=action==='left'||action==='dasLeft'?-1:1;
            if(action.startsWith('das')){while(R.valid(type,{...state,c:state.c+d}))state={...state,c:state.c+d};}
            else state={...state,c:state.c+d};
          }
          assert.ok(state&&R.valid(type,state));
        }
        assert.equal(R.key(type,R.drop(type,state)),target.key,JSON.stringify(solved));
        assert.equal(E.finesseFor(type,solved.cells,{allow180}).count,solved.count);
        maximum=Math.max(maximum,solved.count);
        entries.push('x='+target.x+': '+solved.count+' ['+solved.sequence.join(' ')+']');
      }
      for(let x=-1;x<=10;x++)if(!targets.some(t=>t.o===rot&&t.x===x)){
        assert.equal(E.finesseFor(type,{rot,x},{allow180}),null,type+' invalid column '+x);
      }
      reports.push('  '+E.ROTATIONS[rot]+'  '+entries.join(' | '));
    }
    // The modern two-step table is <=3 for all pieces with 180; without 180
    // a T/J/L half turn can require an additional press (<=4).
    assert.ok(maximum<=(allow180?3:4),type+' max='+maximum);
    reports.push('  MAX '+maximum,'');
  });
}

test('well-known cells and symmetric states use minimal counts, with canonical rotation-first ties',()=>{
  assert.equal(E.finesseFor('O',{rot:0,x:0}).count,1);
  assert.equal(E.finesseFor('O',{rot:0,x:1}).count,2); // DAS-left, then right
  assert.equal(E.finesseFor('O',{rot:0,x:4}).count,0);
  assert.deepEqual(E.finesseFor('T',{rot:0,x:0}).sequence,['DAS←']);
  assert.deepEqual(E.finesseFor('T',{rot:2,x:0}).sequence,['180','DAS←']);
  assert.equal(E.finesseFor('T',{rot:2,x:0},{allow180:false}).count,3);
  assert.equal(E.finesseFor('I',{rot:1,x:0}).count,2);
  for(const type of ['I','S','Z'])for(let x=0;x<7;x++){
    assert.equal(E.finesseFor(type,{rot:0,x}).count,E.finesseFor(type,{rot:2,x}).count);
    assert.equal(E.finesseFor(type,{rot:1,x}).count,E.finesseFor(type,{rot:3,x}).count);
  }
  for(let rot=0;rot<4;rot++)assert.equal(E.finesseFor('O',{rot,x:4}).count,0);
  assert.equal(E.finesseFor('T',{rot:0,x:-1}),null);
  assert.equal(E.finesseFor('I',{rot:0,x:7}),null);
  assert.equal(E.finesseFor('T',[[0,0],[1,0],[2,0],[9,9]]),null);
});

test('nonempty-board solver uses actual collision/kicks and y in search state',()=>{
  const board=new E.Board();
  for(const [x,y] of [[0,0],[1,0],[2,0],[4,19],[6,20],[8,2]])board.set(x,y);
  const blocked=new Set();for(let y=0;y<40;y++)for(let x=0;x<10;x++)if(board.get(x,y))blocked.add(x+','+(39-y));
  const independent=R.bruteForce('T',true,blocked,undefined,true);
  const placements=E.allPlacements('T',{board});
  for(const p of placements){
    const oracleKey=R.key('T',R.fromEngine(p.state));
    // Oracle depth cap 6 is ample for these fixtures.
    assert.equal(p.count,independent.get(oracleKey),p.key);
    let state=E.spawnPiece('T');for(const a of p.actions)state=E.applyAction(board,state,a);
    assert.equal(E.cellsKey(E.cells(E.hardDrop(board,state))),p.key);
  }
  assert.ok(placements.some(p=>p.actions[0]==='cw'&&p.state.x!==3));
  assert.equal(board.get(4,19),'#');
  const impossible=new E.Board();E.cells(E.spawnPiece('O')).forEach(([x,y])=>impossible.set(x,y));
  assert.deepEqual(E.allPlacements('O',{board:impossible}),[]);
});

test('solver cache is collision-sensitive and insulated from returned object mutation',()=>{
  const a=E.allPlacements('I');a[0].cells[0][0]=999;a[0].sequence.push('bad');a[0].state.x=999;
  const b=E.allPlacements('I');assert.ok(b.every(p=>p.cells.every(c=>c[0]<10)&&p.state.x<10&&!p.sequence.includes('bad')));
  const board=new E.Board(),before=E.finesseFor('O',{rot:0,x:4},{board});board.set(4,0);
  assert.notEqual(E.finesseFor('O',{rot:0,x:4},{board}).key,before.key);
  assert.throws(()=>E.allPlacements('O',{start:E.spawnPiece('T')}));
  for(const type of E.PIECE_TYPES)for(const p of E.allPlacements(type,{spawnDrop:true})){
    assert.equal(p.count,E.finesseFor(type,p.cells).count);
  }
});

test('write complete independently validated finesse table artifact',()=>{
  const report=reports.join('\n')+'\n';
  fs.writeFileSync(path.join(__dirname,'finesse-table.txt'),report);
  assert.equal((report.match(/distinct placements/g)||[]).length,14);
  console.log('Full finesse tables: tests/finesse-table.txt (both 180 settings, all rotations/columns).');
});
