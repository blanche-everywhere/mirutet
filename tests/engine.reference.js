'use strict';

// Independent oracle. These are handwritten TOP-DOWN matrices, not rotations
// generated from engine shapes. Simulator uses rows DOWN and never imports engine.
const MATRICES = {
  I: [ ['....','IIII','....','....'], ['..I.','..I.','..I.','..I.'],
    ['....','....','IIII','....'], ['.I..','.I..','.I..','.I..'] ],
  O: Array.from({length:4}, () => ['.OO','.OO','...']),
  T: [ ['.T.','TTT','...'], ['.T.','.TT','.T.'], ['...','TTT','.T.'], ['.T.','TT.','.T.'] ],
  S: [ ['.SS','SS.','...'], ['.S.','.SS','..S'], ['...','.SS','SS.'], ['S..','SS.','.S.'] ],
  Z: [ ['ZZ.','.ZZ','...'], ['..Z','.ZZ','.Z.'], ['...','ZZ.','.ZZ'], ['.Z.','ZZ.','Z..'] ],
  J: [ ['J..','JJJ','...'], ['.JJ','.J.','.J.'], ['...','JJJ','..J'], ['.J.','.J.','JJ.'] ],
  L: [ ['..L','LLL','...'], ['.L.','.L.','.LL'], ['...','LLL','L..'], ['LL.','.L.','.L.'] ]
};

// Literal standard SRS values, positive y UP. Independently transcribed from
// published wall-kick tables. Do not replace these with engine imports/derivations.
// https://github.com/26F-Studio/Techmino/blob/main/parts/RSlist.lua (SRS)
const JLSTZ = {
  '01': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '10': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '12': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '21': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '23': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '32': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '30': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '03': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
const I = {
  '01': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '10': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '12': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '21': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '23': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '32': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '30': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '03': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};
// 180 is an explicit extension, not a Guideline quarter-turn rule.
// https://gist.github.com/torchlight/1832786cf053daa51bf188110b764090
const HALF = {
  '02': [[0,0],[0,1],[1,1],[-1,1],[1,0],[-1,0]],
  '13': [[0,0],[1,0],[1,2],[1,1],[0,2],[0,1]],
  '20': [[0,0],[0,-1],[-1,-1],[1,-1],[-1,0],[1,0]],
  '31': [[0,0],[-1,0],[-1,2],[-1,1],[0,2],[0,1]]
};
const I_HALF = {
  '02': [[0,0],[0,1]], '13': [[0,0],[1,0]],
  '20': [[0,0],[0,-1]], '31': [[0,0],[-1,0]]
};
function tests(type, from, to) {
  if (type === 'O') return [[0,0]];
  return (Math.abs(from-to) === 2 ? (type === 'I' ? I_HALF : HALF) : (type === 'I' ? I : JLSTZ))[''+from+to];
}
function points(type, state) {
  const result = [];
  MATRICES[type][state.o].forEach((row, dr) => [...row].forEach((cell, dc) => {
    if (cell !== '.') result.push([state.c+dc,state.r+dr]);
  }));
  return result;
}
function valid(type, state, blocked = new Set(), width=10, height=40) {
  return points(type,state).every(([c,r]) => c>=0 && c<width && r>=0 && r<height && !blocked.has(c+','+r));
}
function turn(type, state, amount, blocked=new Set()) {
  const o = (state.o+amount+4)%4;
  for (const [dc,dy] of tests(type,state.o,o)) {
    const target = { c:state.c+dc, r:state.r-dy, o };
    if (valid(type,target,blocked)) return target;
  }
  return null;
}
function drop(type,state,blocked=new Set()) {
  if (!valid(type,state,blocked)) return null;
  let current={...state};
  while (valid(type,{...current,r:current.r+1},blocked)) current.r++;
  return current;
}
function key(type,state) { return points(type,state).map(([c,r]) => c+','+(39-r)).sort().join('|'); }
function fromEngine(state) { return { c:state.x, r:40-MATRICES[state.type][0].length-state.y, o:state.rot }; }
function toEngine(type,state) { return { type, x:state.c, y:40-MATRICES[type][0].length-state.r, rot:state.o }; }
function legalTargets(type,blocked=new Set()) {
  const targets=[];
  for (let o=0;o<4;o++) {
    const local = points(type,{c:0,r:0,o});
    const min=Math.min(...local.map(c=>c[0])),max=Math.max(...local.map(c=>c[0]));
    for(let x=0;x<10-(max-min);x++) {
      const lock=drop(type,{c:x-min,r:18,o},blocked);
      if(lock) targets.push({o,x,key:key(type,lock),lock});
    }
  }
  return targets;
}

// Exhaustive iterative deepening, deliberately different from engine BFS.
// Independent simulator, tables, shapes, collision, slide, and cell encoding.
// Pruning only identical states reached with >= input count in this iteration.
function bruteForce(type,allow180=true,blocked=new Set(),start={c:3,r:18,o:0},fullDepth=false) {
  const result=new Map(), required=new Set(legalTargets(type,blocked).map(t=>t.key));
  if(!valid(type,start,blocked)) return result;
  function successors(s) {
    const out=[];
    for(const direction of [-1,1]) {
      let edge={...s};
      while(valid(type,{...edge,c:edge.c+direction},blocked)) edge.c+=direction;
      out.push(edge);
      const tap={...s,c:s.c+direction};
      if(valid(type,tap,blocked)) out.push(tap);
    }
    for(const amount of [-1,1,...(allow180?[2]:[])]) {
      const next=turn(type,s,amount,blocked); if(next) out.push(next);
    }
    return out;
  }
  for(let limit=0;limit<=6;limit++) {
    const visited=new Map();
    function visit(s,used) {
      const id=[s.c,s.r,s.o].join('/');
      if(visited.has(id) && visited.get(id)<=used) return;
      visited.set(id,used);
      const landing=drop(type,s,blocked), idLock=key(type,landing);
      if(!result.has(idLock)||result.get(idLock)>used) result.set(idLock,used);
      if(used<limit) for(const next of successors(s)) visit(next,used+1);
    }
    visit(start,0);
    if(!fullDepth && [...required].every(k=>result.has(k))) return result;
  }
  return result;
}
module.exports={MATRICES,JLSTZ,I,HALF,I_HALF,tests,points,valid,turn,drop,key,fromEngine,toEngine,legalTargets,bruteForce};
