import assert from 'node:assert/strict';
import {ROULETTE_SEQUENCE,describeBet,numberColor,settleBets} from '../dist/js/core/roulette.mjs';

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
console.log('roulette tests passed');
