import assert from 'node:assert/strict';
import {symbols,route,randomIndex,createGame as rawCreateGame} from '../dist/js/games/fruit/rules.mjs';
const createGame=()=>{const g=rawCreateGame();g.stageCoins(10,10);g.insertStaged();const start=g.start;g.start=(choose)=>start(choose,()=>({type:null,indices:[]}));return g};
assert.equal(route.length,24);
assert.deepEqual(symbols.map(s=>s.slice(1)),[[120,50],[40,3],[30,3],[20,3],[20,3],[15,3],[10,3],[5,3]]);
for (const [index,[symbol,multiplier]] of route.entries()) {
  assert.ok(symbols[symbol].slice(1).includes(multiplier));
  const game=createGame();
  // Multiple bets: only the landed symbol pays, every stake is deducted.
  for(let i=0;i<8;i++) assert.equal(game.adjust(i,i+1),true);
  assert.equal(game.start(()=>index),index);
  assert.equal(game.snapshot().credit,64);
  assert.equal(game.adjust(0,1),false);
  assert.equal(game.clear(),false);
  assert.equal(game.repeat(),false);
  assert.equal(game.start(()=>0),null);
  const result=game.settle();
  assert.equal(result.index,index);
  assert.equal(result.win,(symbol+1)*multiplier);
  assert.equal(game.snapshot().credit,64);
  assert.equal(game.snapshot().win,result.win);
  assert.equal(game.snapshot().total,0);
  assert.equal(game.settle(),null); // no double payout
  assert.equal(game.repeat(),true);
  assert.deepEqual(game.snapshot().bets,[1,2,3,4,5,6,7,8]);
  for(let origin=0;origin<24;origin++)assert.equal((origin+72+(index-origin+24)%24)%24,index);
}
const examples=[[7,10,6,50],[3,5,8,100],[2,10,21,30],[0,2,4,240],[7,10,2,0]];
for(const [symbol,stake,index,win] of examples){
  const g=createGame();g.adjust(symbol,stake);g.start(()=>index);
  assert.equal(g.settle().win,win);assert.equal(g.snapshot().credit,100-stake);assert.equal(g.snapshot().win,win);
}
const g=createGame();
assert.equal(g.start(()=>0),null);assert.equal(g.repeat(),false);
assert.equal(g.adjust(0,99),true);assert.equal(g.adjust(0,1),false);
assert.equal(g.adjust(0,-100),true);assert.equal(g.snapshot().total,0);
assert.equal(g.adjust(0,1.5),false);
// Drive balance below a valid prior stake without manufacturing game state.
for(let i=0;i<1;i++){g.adjust(7,90);g.start(()=>4);g.settle()}
assert.equal(g.snapshot().credit,10);assert.equal(g.repeat(),false);
assert.equal(g.adjust(0,11),false);assert.equal(g.adjust(7,10),true);
g.start(()=>4);g.settle();assert.equal(g.snapshot().credit,0);
assert.equal(g.adjust(7,1),false);assert.equal(g.start(()=>0),null);
const safe=createGame();safe.adjust(0,2);
assert.throws(()=>safe.start(()=>{throw new Error('crypto unavailable')}));
assert.equal(safe.snapshot().credit,100);assert.equal(safe.snapshot().busy,false);
let draws=[0xffffffff,0xfffffff0,23],calls=0;
assert.equal(randomIndex({getRandomValues(a){a[0]=draws[calls++];return a}}),23);
assert.equal(calls,3);
for(let i=0;i<24;i++)assert.equal(randomIndex({getRandomValues(a){a[0]=i;return a}}),i);
console.log('Passed: 24-cell settlement, all supplied examples, balance and bet limits, repeat, busy lock, RNG rejection, animation endpoints.');
