import assert from 'node:assert/strict';
import {ROULETTE_SEQUENCE,createDealerIntel,dealerIntelMatchesResult,dealerIntelTruthChance,dealerTipChance,describeBet,describeDealerIntel,groupPayoutChips,isRouletteBankrupt,numberColor,restoreDealerIntel,settleBets} from '../dist/js/core/roulette.mjs';

assert.equal(ROULETTE_SEQUENCE.length,37);
assert.equal(new Set(ROULETTE_SEQUENCE).size,37);
assert.equal(numberColor(0),'green');
assert.equal(numberColor(32),'red');
assert.equal(numberColor(15),'black');
assert.deepEqual(describeBet('corner-1').numbers,[1,2,4,5]);
assert.deepEqual(describeBet('sixline-0').numbers,[1,2,3,4,5,6]);
assert.deepEqual(describeBet('trio-023').numbers,[0,2,3]);
assert.equal(describeBet('number-17').payout,35);
assert.equal(describeBet('red').numbers.length,18);
assert.equal(describeBet('column-1').numbers.length,12);

const win=settleBets(new Map([['number-17',5],['black',25],['dozen-2',100]]),17);
assert.equal(win.stake,130);
assert.equal(win.returned,5*36+25*2+100*3);
assert.equal(win.net,400);

const zero=settleBets(new Map([['red',25],['even',25],['low',25],['number-0',1]]),0);
assert.equal(zero.returned,73.5);
assert.equal(zero.net,-2.5);
assert.equal(zero.wins.filter(item=>item.laPartage).length,3);

assert.equal(dealerTipChance(.5),.002);
assert.equal(dealerTipChance(25),.01);
assert.equal(dealerTipChance(1000),.08);
assert.equal(dealerTipChance(10000),.22);
assert.equal(dealerTipChance(0),0);
const sequence=(...values)=>max=>{const value=values.shift();assert.ok(Number.isInteger(value)&&value>=0&&value<max);return value};
assert.equal(createDealerIntel(100,sequence(250)),null);
assert.equal(dealerIntelTruthChance('color'),.88);
assert.equal(dealerIntelTruthChance('exact'),.32);
assert.equal(dealerIntelTruthChance('unknown'),0);
const truthfulIntel=createDealerIntel(100,sequence(249,17,99,0));
assert.deepEqual(truthfulIntel,{result:17,claimResult:17,type:'exact',truthful:true,truthChance:.32,message:'下一局……盯紧 17 号。',lieLineIndex:null,revealMessage:null,tip:100,chance:.025});
const falseIntel=createDealerIntel(100,sequence(249,17,99,9999,0,0));
assert.equal(falseIntel.result,17);assert.equal(falseIntel.claimResult,0);assert.equal(falseIntel.truthful,false);assert.equal(falseIntel.message,'下一局……盯紧 0 号。');assert.equal(falseIntel.revealMessage,'荷官：牢弟，逗逗你的。');assert.equal(dealerIntelMatchesResult(falseIntel),false);
assert.equal(createDealerIntel(10000,sequence(2199,32,0,0)).type,'color');
assert.equal(createDealerIntel(10000,sequence(2199,32,34,0)).type,'range');
assert.equal(createDealerIntel(10000,sequence(2199,32,58,0)).type,'parity');
assert.equal(createDealerIntel(10000,sequence(2199,32,75,0)).type,'dozen');
assert.equal(createDealerIntel(10000,sequence(2199,32,87,0)).type,'column');
assert.equal(createDealerIntel(10000,sequence(2199,32,95,0)).type,'exact');
assert.equal(describeDealerIntel(32,'color'),'下一局的颜色……会是红色。');
assert.equal(describeDealerIntel(8,'range'),'下一局……会落在 1–18。');
assert.equal(describeDealerIntel(0,'parity'),'下一局……既不是单，也不是双。');
assert.equal(describeDealerIntel(29,'dozen'),'下一局……会落在第 3 打。');
assert.equal(describeDealerIntel(17,'column'),'下一局……会落在第 2 列。');
assert.deepEqual(restoreDealerIntel({result:17,type:'exact',tip:100}),truthfulIntel);
assert.deepEqual(restoreDealerIntel(falseIntel),falseIntel);
assert.equal(restoreDealerIntel({result:99,type:'exact',tip:100}),null);
assert.equal(isRouletteBankrupt({walletBalance:0,inventoryTotal:0,betTotal:0,payoutTotal:0,halfCredit:0}),true);
assert.equal(isRouletteBankrupt({walletBalance:0,inventoryTotal:1,betTotal:0,payoutTotal:0,halfCredit:0}),false);
assert.equal(isRouletteBankrupt({walletBalance:10,inventoryTotal:0,betTotal:0,payoutTotal:0,halfCredit:0}),false);
assert.deepEqual(groupPayoutChips([25,1,25,.5,100,1,25]),[
  {value:100,count:1},{value:25,count:3},{value:1,count:2},{value:.5,count:1}
]);
assert.deepEqual(groupPayoutChips([0,-1,NaN]),[]);
console.log('roulette tests passed');
