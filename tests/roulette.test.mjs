import assert from 'node:assert/strict';
import {ROULETTE_SEQUENCE,createDealerIntel,dealerTipChance,describeBet,describeDealerIntel,groupPayoutChips,numberColor,restoreDealerIntel,settleBets} from '../dist/js/core/roulette.mjs';

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
assert.deepEqual(createDealerIntel(100,sequence(249,17,99)),{result:17,type:'exact',message:'下一局……盯紧 17 号。',tip:100,chance:.025});
assert.equal(createDealerIntel(10000,sequence(2199,32,0)).type,'color');
assert.equal(createDealerIntel(10000,sequence(2199,32,34)).type,'range');
assert.equal(createDealerIntel(10000,sequence(2199,32,58)).type,'parity');
assert.equal(createDealerIntel(10000,sequence(2199,32,75)).type,'dozen');
assert.equal(createDealerIntel(10000,sequence(2199,32,87)).type,'column');
assert.equal(createDealerIntel(10000,sequence(2199,32,95)).type,'exact');
assert.equal(describeDealerIntel(32,'color'),'下一局的颜色……会是红色。');
assert.equal(describeDealerIntel(8,'range'),'下一局……会落在 1–18。');
assert.equal(describeDealerIntel(0,'parity'),'下一局……既不是单，也不是双。');
assert.equal(describeDealerIntel(29,'dozen'),'下一局……会落在第 3 打。');
assert.equal(describeDealerIntel(17,'column'),'下一局……会落在第 2 列。');
assert.deepEqual(restoreDealerIntel({result:17,type:'exact',tip:100}),{result:17,type:'exact',message:'下一局……盯紧 17 号。',tip:100,chance:.025});
assert.equal(restoreDealerIntel({result:99,type:'exact',tip:100}),null);
assert.deepEqual(groupPayoutChips([25,1,25,.5,100,1,25]),[
  {value:100,count:1},{value:25,count:3},{value:1,count:2},{value:.5,count:1}
]);
assert.deepEqual(groupPayoutChips([0,-1,NaN]),[]);
console.log('roulette tests passed');
