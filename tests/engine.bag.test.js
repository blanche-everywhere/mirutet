'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/engine.js');

test('thousands of aligned seven draws are permutations, preview does not consume',()=>{
  const bag=new E.Bag({seed:123456});
  for(let b=0;b<500;b++){
    const preview=bag.peek(14);
    assert.deepEqual(bag.peek(5),preview.slice(0,5));
    const seven=Array.from({length:7},()=>bag.next());
    assert.deepEqual(seven,preview.slice(0,7));
    assert.deepEqual(seven.slice().sort(),['I','J','L','O','S','T','Z']);
  }
});
test('RNG is seedable, reproducible for numeric/string/zero seeds, and independent',()=>{
  for(const seed of [0,1,0xffffffff,'ミルフィ','training']){
    const a=E.createRNG(seed),b=E.createRNG(seed);
    for(let i=0;i<100;i++){const n=a();assert.equal(n,b());assert.ok(n>=0&&n<1);}
    const ba=new E.Bag({seed}),bb=new E.Bag({seed});
    assert.deepEqual(ba.peek(140),bb.peek(140));
  }
  assert.notDeepEqual(new E.Bag({seed:1}).peek(70),new E.Bag({seed:2}).peek(70));
  // A fixed numeric vector guards seed algorithm stability between releases.
  const rng=E.createRNG(1);
  assert.deepEqual(Array.from({length:3},rng),[0.6270739405881613,0.002735721180215478,0.5274470399599522]);
});
test('injectable RNG Fisher-Yates extremes and filtered practice bags',()=>{
  assert.deepEqual(new E.Bag(()=>0.999999).peek(7),E.PIECE_TYPES);
  const bag=new E.Bag({pieces:['T','I','T','O'],seed:8});
  for(let i=0;i<50;i++)assert.deepEqual(Array.from({length:3},()=>bag.next()).sort(),['I','O','T']);
  assert.deepEqual(new E.Bag({pieces:['S'],seed:0}).peek(20),Array(20).fill('S'));
  const exposed=bag.peek();exposed[0]='Z';assert.notEqual(bag.peek()[0],'Z');
  assert.throws(()=>new E.Bag({pieces:[]}));assert.throws(()=>new E.Bag({pieces:['X']}));
  assert.throws(()=>new E.Bag({rng:()=>1}).next());assert.throws(()=>new E.Bag({rng:()=>-1}).next());
  assert.throws(()=>bag.peek(-1));assert.throws(()=>E.createRNG(NaN));
});
