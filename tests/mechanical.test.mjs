import assert from 'node:assert/strict';
import {createPusherState, startPusherRound, stepPusher, PUSHER} from '../dist/js/games/coin-pusher/model.mjs';
import {createPlinkoRound, restorePlinkoRound, plinkoPosition, PAYTABLES, STAKES} from '../dist/js/games/plinko/model.mjs';

// Every one of the 4096 pin paths must land in its matching slot and pay whole USD.
const slots = Array(13).fill(0);
for (let path = 0; path < 4096; path++) {
  let bit = 0;
  const round = createPlinkoRound(10, 'classic', () => ((path >> bit++) & 1) ? .8 : .2);
  slots[round.slot]++;
  const point = plinkoPosition(round, 1);
  assert.equal(point.x, 96 + round.slot * 44);
  assert.equal(point.y, 508);
  for (const bet of STAKES) for (const risk of Object.keys(PAYTABLES)) {
    const restored = restorePlinkoRound({...round, bet, risk, payout: 999999});
    assert.equal(restored.payout, bet * PAYTABLES[risk][round.slot] / 10);
    assert(Number.isSafeInteger(restored.payout));
  }
}
assert.deepEqual(slots, [1,12,66,220,495,792,924,792,495,220,66,12,1]);
assert.equal(createPlinkoRound(10, 'high', () => 0).payout, 1000);
assert.equal(restorePlinkoRound({bet: 10, risk: 'bad', directions: Array(12).fill(0)}), null);
assert.throws(() => createPlinkoRound(1, 'classic'), RangeError);

function finish(state) {let steps = 0; while (state.pending && steps++ < 600) stepPusher(state, 1 / 120); assert.equal(state.pending, null);}
const state = createPusherState();
assert.equal(startPusherRound(state, 5, .5), true);
assert.equal(startPusherRound(state, 1, .5), false);
for (let i = 0; i < 190; i++) stepPusher(state, 1 / 120);
const recovered = createPusherState(JSON.parse(JSON.stringify(state)));
finish(state); finish(recovered);
assert.deepEqual(recovered, state, 'refresh resumes the same paid coins without adding another round');
assert.equal(state.spent, 5);
assert(state.coins.every(coin => Number.isFinite(coin.x) && Number.isFinite(coin.y)));
const done = JSON.stringify(state); stepPusher(state, 1 / 120); assert.equal(JSON.stringify(state), done);

const edge = createPusherState({version: 1, coins: [{x: 350, y: PUSHER.edge + 1}, {x: 92, y: 450}], tray: 0});
startPusherRound(edge, 1, .5);
const events = stepPusher(edge, 1 / 120);
assert.equal(events.filter(event => event.type === 'win').length, 1);
assert.equal(events.filter(event => event.type === 'lost').length, 1);
assert.equal(edge.tray, 1, 'only front-edge coins become claimable');
assert.equal(createPusherState({version: 1, coins: [{x: NaN, y: 200}]}).coins.length, 220);
console.log('mechanical games: 4096 drop paths, whole-USD payouts, physical exits and refresh recovery passed');
