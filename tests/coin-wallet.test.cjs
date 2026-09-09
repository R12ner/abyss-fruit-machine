const assert=require('node:assert/strict');
const {createGame}=require('../dist/game.js');
const none=()=>({type:null,indices:[]}),g=createGame();
assert.equal(g.snapshot().wallet,100);assert.equal(g.snapshot().credit,0);
assert.equal(g.adjust(7,1),false);assert.equal(g.start(),null);
for(const invalid of [-1,0,2,100,NaN,1.5])assert.equal(g.insertCoin(invalid),false);
for(const amount of [1,5,10]){assert.equal(g.insertCoin(amount),true);assert.equal(g.snapshot().wallet+g.snapshot().credit,100)}
assert.equal(g.snapshot().wallet,84);assert.equal(g.snapshot().credit,16);
g.adjust(7,10);assert.equal(g.cashOut(),0);
g.start(()=>6,none);assert.equal(g.insertCoin(1),false);assert.equal(g.cashOut(),0);
g.settle();assert.equal(g.snapshot().credit,56);assert.equal(g.snapshot().wallet,84);
assert.equal(g.cashOut(),56);assert.equal(g.snapshot().wallet,140);assert.equal(g.snapshot().credit,0);assert.equal(g.snapshot().risk,0);assert.equal(g.cashOut(),0);
g.insertCoin(10);g.adjust(7,10);g.start(()=>6,none);g.settle();
g.startGamble('small',()=>13);assert.equal(g.cashOut(),0);assert.equal(g.insertCoin(1),false);g.settleGamble();
assert.equal(g.snapshot().wallet,130);assert.equal(g.snapshot().credit,0);
const h=createGame();for(let i=0;i<10;i++)assert.equal(h.insertCoin(10),true);
assert.equal(h.snapshot().wallet,0);assert.equal(h.insertCoin(1),false);
assert.equal(h.cashOut(),100);assert.equal(h.snapshot().wallet,100);
console.log('Passed: 100 USD initial wallet, deposit requirements, conservation, payouts, repeat cashout and busy locks.');
