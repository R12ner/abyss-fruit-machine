const assert=require('node:assert/strict');
const {createGame}=require('../dist/game.js');
const none=()=>({type:null,indices:[]});
const wealth=g=>{const s=g.snapshot();return s.wallet+s.staged+s.credit+s.payout};
const g=createGame();
assert.equal(g.snapshot().wallet,100);assert.equal(g.snapshot().credit,0);assert.equal(wealth(g),100);
assert.equal(g.adjust(7,1),false);assert.equal(g.insertStaged(),0);
for(const [n,unit] of [[-1,1],[21,1],[2.5,1],[NaN,1],[1,2],[1,100]])assert.equal(g.stageCoins(n,unit),false);
assert.equal(g.stageCoins(6,5),true);assert.equal(g.snapshot().wallet,70);assert.equal(g.snapshot().staged,30);assert.equal(g.snapshot().credit,0);
assert.equal(g.stageCoins(2,5),true);assert.equal(g.snapshot().wallet,90);assert.equal(wealth(g),100);
assert.equal(g.stageCoins(20,10),false);assert.equal(g.snapshot().staged,10);
assert.equal(g.stageCoins(0,1),true);assert.equal(g.snapshot().wallet,100);
g.stageCoins(3,10);assert.equal(g.insertStaged(),30);assert.equal(g.snapshot().credit,30);assert.equal(g.snapshot().staged,0);assert.equal(g.insertStaged(),0);assert.equal(wealth(g),100);
g.adjust(7,10);assert.equal(g.cashOut(),0);g.start(()=>6,none);
assert.equal(g.stageCoins(1,1),false);assert.equal(g.insertStaged(),0);assert.equal(g.cashOut(),0);assert.equal(g.collectPayout(),0);
g.settle();assert.equal(g.snapshot().credit,70);assert.equal(wealth(g),140);
assert.equal(g.cashOut(),70);assert.equal(g.snapshot().wallet,70);assert.equal(g.snapshot().payout,70);assert.equal(wealth(g),140);assert.equal(g.cashOut(),0);
assert.equal(g.stageCoins(8,10),false); // unclaimed payout cannot be staged
assert.equal(g.collectPayout(),70);assert.equal(g.snapshot().wallet,140);assert.equal(g.snapshot().payout,0);assert.equal(g.collectPayout(),0);assert.equal(wealth(g),140);
// A new payout adds to unclaimed coins without crediting the wallet early.
g.stageCoins(2,10);g.insertStaged();g.cashOut();g.stageCoins(1,10);g.insertStaged();g.cashOut();
assert.equal(g.snapshot().payout,30);assert.equal(g.snapshot().wallet,110);assert.equal(wealth(g),140);
assert.equal(g.collectPayout(),30);assert.equal(wealth(g),140);
// One click can fill any supported position and every transfer is exact.
for(const unit of [1,5,10])for(let n=0;n<=20;n++){
 const h=createGame(),ok=n*unit<=100;
 assert.equal(h.stageCoins(n,unit),ok);assert.equal(wealth(h),100);
 if(ok){assert.equal(h.snapshot().stagedCount,n);assert.equal(h.insertStaged(),n*unit);assert.equal(wealth(h),100);h.cashOut();assert.equal(wealth(h),100);h.collectPayout();assert.equal(wealth(h),100)}
}
// Staged coins and unclaimed payout are unaffected by a losing gamble.
const h=createGame();h.stageCoins(2,10);h.insertStaged();h.cashOut();
h.stageCoins(2,10);h.insertStaged();h.stageCoins(2,5);
h.adjust(7,10);h.start(()=>6,none);h.settle();h.startGamble('small',()=>13);
assert.equal(h.collectPayout(),0);assert.equal(h.stageCoins(0,1),false);h.settleGamble();
assert.equal(h.snapshot().payout,20);assert.equal(h.snapshot().staged,10);assert.equal(h.snapshot().wallet,50);assert.equal(h.snapshot().credit,10);
console.log('Passed: staged quantities, all denomination/position combinations, atomic all-coin insertion, payout collection, no double credit, and four-account conservation.');
