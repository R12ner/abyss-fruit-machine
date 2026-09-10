import assert from 'node:assert/strict';
import {createGame} from '../dist/js/core/game.mjs';
const none=()=>({type:null,indices:[]});
const wealth=g=>{const s=g.snapshot();return s.wallet+s.staged+s.credit+s.payout+s.win};
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
g.settle();assert.equal(g.snapshot().credit,20);assert.equal(g.snapshot().win,50);assert.equal(wealth(g),140);
assert.equal(g.cashOut(),20);assert.equal(g.snapshot().wallet,70);assert.equal(g.snapshot().payout,20);assert.equal(g.snapshot().win,50);assert.equal(wealth(g),140);assert.equal(g.cashOut(),0);
assert.equal(g.stageCoins(8,10),false); // unclaimed payout cannot be staged
assert.equal(g.collectPayout(),20);assert.equal(g.snapshot().wallet,90);assert.equal(g.snapshot().payout,0);assert.equal(g.collectPayout(),0);assert.equal(wealth(g),140);
assert.equal(g.transfer('winToCredit',50),50);assert.equal(g.snapshot().win,0);assert.equal(g.cashOut(),50);assert.equal(g.collectPayout(),50);assert.equal(g.snapshot().wallet,140);assert.equal(wealth(g),140);
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
// Direct amount entry, manual WIN/CREDIT transfers, persisted restore and zero-balance subsidy.
const direct=createGame();assert.equal(direct.stageAmount(73),true);
assert.equal(direct.snapshot().wallet,27);assert.equal(direct.snapshot().staged,73);assert.equal(direct.snapshot().stagedDirect,true);assert.equal(direct.snapshot().stagedCount,20);
direct.insertStaged();assert.equal(direct.transfer('creditToWin',2),2);assert.equal(direct.snapshot().credit,71);assert.equal(direct.snapshot().win,2);
assert.equal(direct.transfer('winToCredit',1),1);assert.equal(direct.snapshot().credit,72);assert.equal(direct.snapshot().win,1);
assert.equal(direct.transfer('winToCredit',500),1);assert.equal(direct.snapshot().credit,73);assert.equal(direct.snapshot().win,0);
direct.adjust(7,10);const restored=createGame(direct.exportState());assert.deepEqual(restored.exportState(),direct.exportState());assert.equal(restored.snapshot().totalFunds,100);
// CREDIT moved into WIN after a prize also increases the live high/low stake.
const funded=createGame();funded.stageCoins(10,10);funded.insertStaged();funded.adjust(7,10);funded.start(()=>6,none);funded.settle();
assert.equal(funded.snapshot().risk,50);assert.equal(funded.transfer('creditToWin',10),10);
assert.equal(funded.snapshot().win,60);assert.equal(funded.snapshot().risk,60);
assert.equal(funded.startGamble('small',()=>6),true);assert.equal(funded.settleGamble().win,120);
const empty=createGame({version:2,wallet:0,credit:0,stagedAmount:0,stagedCount:0,stagedUnit:1,stagedDirect:false,payout:0,bets:Array(8).fill(0),previous:null,win:0,risk:0,guesses:0,jackpot:1000});
assert.equal(empty.snapshot().totalFunds,0);assert.equal(empty.grantSubsidy(),100);assert.equal(empty.snapshot().wallet,100);assert.equal(empty.grantSubsidy(),0);
console.log('Passed: staged quantities and direct entry, manual transfers, persistence restore, subsidy, payout collection, and five-account conservation.');
