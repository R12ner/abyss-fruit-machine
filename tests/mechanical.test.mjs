import assert from 'node:assert/strict';
import {
  PUSHER, ZONES, TOWER, COIN_VALUE, createPusherState, startPusherRound, stepPusher, tiltPusher, rechargeTilt,
  isPusherIdle, zoneMultiplier, isSideExit, rollCoinKinds, coinFaceValue, findTower, rollTowerHeight,
} from '../dist/js/games/coin-pusher/rules.mjs';
import {
  ROW_OPTIONS, RISK_KEYS, STAKES, PAYTABLES, GOLD_PEGS, ENERGY_GOAL, NUDGE_MAX, CHARGED_MULTIPLIER,
  paytable, slotProbabilities, pegCount, goldBonusTenths, plinkoGeometry, createPlinkoRound,
  restorePlinkoRound, nudgePlinkoRound, plinkoPosition, pathColumns, countGoldHits, baseReturn, longRunReturn,
} from '../dist/js/games/plinko/rules.mjs';

/* ================= 弹珠机 ================= */

// 每种层数 / 档位的赔付表：长度、形状、返还率。
for (const rows of ROW_OPTIONS) {
  const probs = slotProbabilities(rows);
  assert.equal(probs.length, rows + 1);
  assert(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-12, '落点概率之和必须为 1');
  for (const risk of RISK_KEYS) {
    const table = paytable(rows, risk);
    assert.equal(table.length, rows + 1, `${rows}/${risk} 槽位数`);
    assert(table.every(value => Number.isSafeInteger(value) && value >= 0), '赔付必须是非负整数（十分之一倍）');
    for (let i = 0; i <= rows; i++) assert.equal(table[i], table[rows - i], `${rows}/${risk} 赔付表必须左右对称`);
    for (let i = 0; i < rows / 2; i++) assert(table[i] >= table[i + 1], `${rows}/${risk} 必须从边缘向中间单调不增`);
    assert(table[0] > table[rows / 2], `${rows}/${risk} 边槽必须高于中央`);
    const long = longRunReturn(rows, risk);
    assert(baseReturn(rows, risk) > .8 && baseReturn(rows, risk) < .95, `${rows}/${risk} 基础返还率越界`);
    assert(long > .93 && long < 1.06, `${rows}/${risk} 长期返还率 ${long.toFixed(3)} 越界`);
  }
}
// 高倍档必须比低风险档更极端。
for (const rows of ROW_OPTIONS) {
  assert(paytable(rows, 'abyss')[0] > paytable(rows, 'high')[0]);
  assert(paytable(rows, 'high')[0] > paytable(rows, 'classic')[0]);
  assert(paytable(rows, 'classic')[0] > paytable(rows, 'low')[0]);
}

// 12 层 4096 条路径：落点分布、终点坐标与整额结算。
const distribution = Array(13).fill(0);
for (let path = 0; path < 4096; path++) {
  let bit = 0;
  const round = createPlinkoRound({bet: 10, risk: 'classic', rows: 12}, () => (bit < 12 ? (((path >> bit++) & 1) ? .8 : .2) : .5));
  distribution[round.slot]++;
  const point = plinkoPosition(round, 1);
  assert.equal(point.x, 96 + round.slot * 44);
  assert.equal(point.y, 508);
  assert.equal(point.row, 12);
  for (const bet of STAKES) for (const risk of RISK_KEYS) for (const charged of [false, true]) {
    const restored = restorePlinkoRound({...round, bet, risk, charged, payout: 999999});
    const expected = bet * (paytable(12, risk)[round.slot] + restored.goldHits * goldBonusTenths(12)) * (charged ? CHARGED_MULTIPLIER : 1) / 10;
    assert.equal(restored.payout, expected);
    assert(Number.isSafeInteger(restored.payout), '结算必须是整数 USD');
  }
}
assert.deepEqual(distribution, [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1]);

// 8 层与 16 层的全部路径同样必须整额结算并落在正确的槽。
for (const rows of [8, 16]) {
  const total = 2 ** rows, geometry = plinkoGeometry(rows), counts = Array(rows + 1).fill(0);
  for (let path = 0; path < total; path++) {
    let bit = 0;
    const round = createPlinkoRound({bet: 100, risk: 'abyss', rows}, () => (bit < rows ? (((path >> bit++) & 1) ? .8 : .2) : .5));
    counts[round.slot]++;
    assert.equal(plinkoPosition(round, 1).x, geometry.slotCenter(round.slot));
    assert(Number.isSafeInteger(round.payout), `${rows} 层结算必须是整数`);
  }
  assert.equal(counts.reduce((a, b) => a + b, 0), total);
  assert.equal(counts[0], 1);
  assert.equal(counts[rows], 1);
}

// 金钉：数量、坐标合法、命中数与路径一致。
for (const rows of ROW_OPTIONS) {
  const round = createPlinkoRound({bet: 10, risk: 'high', rows});
  assert.equal(round.gold.length, Math.min(GOLD_PEGS, pegCount(rows)));
  for (const [row, col] of round.gold) {
    assert(Number.isInteger(row) && row >= 0 && row < rows);
    assert(Number.isInteger(col) && col >= 0 && col <= row);
  }
  const columns = pathColumns(round.directions);
  assert.equal(columns.length, rows);
  assert.equal(countGoldHits(round.directions, round.gold), round.goldHits);
  assert.equal(round.bonusTenths, round.goldHits * goldBonusTenths(rows));
}
// 金钉正好压在路径上时一定要算加成。
{
  const round = createPlinkoRound({bet: 10, risk: 'low', rows: 12}, () => .2); // 全部左偏
  const plain = restorePlinkoRound({...round, gold: []});
  const lit = restorePlinkoRound({...round, gold: [[0, 0], [3, 0], [7, 0]]});
  assert.equal(plain.goldHits, 0);
  assert.equal(lit.goldHits, 3);
  assert.equal(lit.tenths - plain.tenths, 3 * goldBonusTenths(12));
  assert.equal(lit.payout - plain.payout, 10 * 3 * goldBonusTenths(12) / 10);
}
// 蓄能球正好翻倍。
{
  const base = createPlinkoRound({bet: 20, risk: 'classic', rows: 8}, () => .2);
  const charged = restorePlinkoRound({...base, charged: true});
  assert.equal(charged.payout, base.payout * CHARGED_MULTIPLIER);
  assert.equal(charged.multiplier, base.multiplier * CHARGED_MULTIPLIER);
}

// 推球：改写落点、次数上限、越界拒绝，且结果立刻重算。
{
  const round = createPlinkoRound({bet: 10, risk: 'classic', rows: 12}, () => .2);
  assert.equal(round.slot, 0);
  assert.equal(nudgePlinkoRound(round, 0, 1), true);
  assert.equal(round.slot, 1, '推球后落点必须立即重算');
  assert.equal(round.payout, 10 * (paytable(12, 'classic')[1] + round.goldHits * goldBonusTenths(12)) / 10);
  assert.equal(nudgePlinkoRound(round, 0, 0), false, '同一层不能推两次');
  assert.equal(nudgePlinkoRound(round, 1, 0), true);
  assert.equal(nudgePlinkoRound(round, 2, 1), false, `每颗球最多推 ${NUDGE_MAX} 次`);
  assert.equal(nudgePlinkoRound(round, 99, 1), false);
  assert.equal(nudgePlinkoRound(round, -1, 1), false);
  assert.equal(round.nudged.length, NUDGE_MAX);
  assert.deepEqual(restorePlinkoRound(round).nudged, round.nudged, '推球记录必须能存档还原');
}

// 存档校验：非法层数、档位、方向数组和金钉都要被拒绝或清洗。
assert.equal(restorePlinkoRound({bet: 10, risk: 'bad', rows: 12, directions: Array(12).fill(0)}), null);
assert.equal(restorePlinkoRound({bet: 10, risk: 'classic', rows: 9, directions: Array(9).fill(0)}), null);
assert.equal(restorePlinkoRound({bet: 7, risk: 'classic', rows: 12, directions: Array(12).fill(0)}), null);
assert.equal(restorePlinkoRound({bet: 10, risk: 'classic', rows: 12, directions: Array(11).fill(0)}), null);
assert.equal(restorePlinkoRound({bet: 10, risk: 'classic', rows: 12, directions: Array(12).fill(2)}), null);
assert.equal(restorePlinkoRound({bet: 10, risk: 'classic', rows: 12, directions: Array(12).fill(0),
  gold: [[99, 0], [3, 9], 'x', [2, 1]]}).gold.length, 1, '非法金钉必须被过滤');
assert.throws(() => createPlinkoRound({bet: 1, risk: 'classic', rows: 12}), RangeError);
assert.throws(() => createPlinkoRound({bet: 10, risk: 'classic', rows: 13}), RangeError);
assert.equal(Object.keys(PAYTABLES).length, ROW_OPTIONS.length);
assert(ENERGY_GOAL > 0 && GOLD_PEGS > 0);

// 几何：钉阵和奖励槽都要落在 720×600 画布内且左右居中。
for (const rows of ROW_OPTIONS) {
  const geometry = plinkoGeometry(rows);
  assert(Math.abs(geometry.slotCenter(0) + geometry.slotCenter(rows) - 720) < 1e-9, '奖励槽必须左右居中');
  assert(geometry.slotCenter(0) > 40 && geometry.slotCenter(rows) < 680);
  assert(geometry.pegY(rows - 1) < 470, '最后一层钉不能压到奖励槽');
  for (let row = 0; row < rows; row++) for (let col = 0; col <= row; col++) {
    const x = geometry.pegX(row, col);
    assert(x > 60 && x < 660, `${rows} 层第 ${row} 行钉超出画面`);
  }
}

/* ================= 推币机 ================= */

function finish(state) {
  let steps = 0;
  while (!isPusherIdle(state) && steps++ < 3000) stepPusher(state, 1 / 120);
  assert.equal(state.pending, null);
}

// 前沿倍率区与侧槽判定。
assert.equal(ZONES.length, 5);
assert.deepEqual([...ZONES], [1, 1, 2, 1, 1]);
assert.equal(zoneMultiplier(360), 2, '中央必须是倍率区');
assert.equal(zoneMultiplier(PUSHER.frontLeft + 1), 1);
assert.equal(zoneMultiplier(PUSHER.frontRight - 1), 1);
assert.equal(isSideExit(PUSHER.frontLeft - 1), true);
assert.equal(isSideExit(PUSHER.frontRight + 1), true);
assert.equal(isSideExit(360), false);

// 硬币种类抽取只会产生三种合法值。
{
  let counts = {normal: 0, gold: 0, token: 0};
  for (const kind of rollCoinKinds(600, (() => {let i = 0; return () => (i++ % 600) / 600;})())) counts[kind]++;
  assert.equal(counts.normal + counts.gold + counts.token, 600);
  assert(counts.token > 0 && counts.gold > 0, '低随机值必须能抽到代币和金币');
  assert.equal(rollCoinKinds(3, () => .99).join(), 'normal,normal,normal');
}

// 一整轮：扣费、彩金累积、存档中途恢复必须完全一致。
const state = createPusherState();
assert.equal(state.jackpot, PUSHER.jackpotSeed);
assert.equal(state.coins.length, 221, '220 枚币加一座金塔');
assert(state.coins.some(coin => coin.kind === 'gold'), '开局币堆里要有金币');
assert(state.coins.some(coin => coin.kind === 'token'), '开局币堆里要有深渊代币');
assert.equal(state.coins.filter(coin => coin.kind === 'tower').length, 1, '台面上只能有一座金塔');
assert.equal(startPusherRound(state, 5, .5, () => .99), true);
// 彩金按小数累积，只有整数部分进池，池子永远是整数。
assert.equal(state.jackpot, PUSHER.jackpotSeed);
assert(Math.abs(state.jackpotProgress - 5 * PUSHER.jackpotPerCoin) < 1e-9);
{
  const pool = createPusherState({version: 2, coins: []});
  for (let i = 0; i < 20; i++) {startPusherRound(pool, 5, .5, () => .99); pool.pending = null;}
  assert(Number.isSafeInteger(pool.jackpot), '彩金池必须是整数');
  assert(Math.abs(pool.jackpot + pool.jackpotProgress - (PUSHER.jackpotSeed + 100 * PUSHER.jackpotPerCoin)) < 1e-6,
    '彩金累积不能丢失或凭空产生');
  assert(pool.jackpotProgress >= 0 && pool.jackpotProgress < 1);
}
assert.equal(startPusherRound(state, 1, .5), false, '推板运行中不能再投币');
for (let i = 0; i < 190; i++) stepPusher(state, 1 / 120);
const recovered = createPusherState(JSON.parse(JSON.stringify({...state, settle: 0})));
finish(state); finish(recovered);
assert.deepEqual(recovered.coins, state.coins, '刷新后必须继续同一批已付费的硬币');
assert.equal(recovered.tray, state.tray);
assert.equal(recovered.jackpot, state.jackpot);
assert.equal(state.spent, 5);
assert(state.coins.every(coin => Number.isFinite(coin.x) && Number.isFinite(coin.y) && COIN_VALUE[coin.kind] !== undefined));
// 空闲后再调用不能改变任何状态。
const done = JSON.stringify(state);
assert.deepEqual(stepPusher(state, 1 / 120), []);
assert.equal(JSON.stringify(state), done);

// 结算：中央落币按 ×2、金币按面额、代币带走全部彩金、侧槽只回收不给钱。
{
  const edge = createPusherState({version: 2, tray: 0, jackpot: 500, coins: [
    {x: 340, y: PUSHER.edge + 1, kind: 'normal'},
    {x: 150, y: PUSHER.edge + 1, kind: 'normal'},
    {x: 380, y: PUSHER.edge + 1, kind: 'gold'},
    {x: 90, y: 450, kind: 'gold'},
  ]});
  edge.settle = 1;
  const events = stepPusher(edge, 1 / 120);
  assert.equal(events.filter(event => event.type === 'win').length, 3);
  assert.equal(events.filter(event => event.type === 'lost').length, 1, '侧槽的金币也不计奖');
  assert.equal(edge.tray, 1 * 2 + 1 * 1 + COIN_VALUE.gold * 2);
  assert.equal(edge.recycled, 1);
  assert.equal(edge.jackpot, 500, '普通落币不消耗彩金');
}
{
  const token = createPusherState({version: 2, tray: 0, jackpot: 777,
    coins: [{x: 360, y: PUSHER.edge + 1, kind: 'token'}]});
  token.settle = 1;
  const win = stepPusher(token, 1 / 120).find(event => event.type === 'win');
  assert.equal(win.jackpot, 777);
  assert.equal(token.tray, 777, '代币带走全部彩金');
  assert.equal(token.jackpot, PUSHER.jackpotSeed, '彩金必须重置到底池');
}
// 连锁奖励每满 chainStep 触发一次。
{
  const chain = createPusherState({version: 2, tray: 0, coins:
    Array.from({length: PUSHER.chainStep}, (_, i) => ({x: 140 + i * 30, y: PUSHER.edge + 1, kind: 'normal'}))});
  chain.settle = 1;
  const events = stepPusher(chain, 1 / 120);
  assert.equal(events.filter(event => event.type === 'win').length, PUSHER.chainStep);
  assert.equal(events.filter(event => event.chainBonus).length, 1);
  assert.equal(chain.tray, PUSHER.chainStep + PUSHER.chainBonus);
  assert.equal(chain.bestChain, PUSHER.chainStep);
}
// 侧槽回收满额返还免费币。
{
  const recycle = createPusherState({version: 2, coins: []});
  let refund = null;
  for (let i = 0; i < PUSHER.recycleGoal; i++) {
    recycle.coins.push({x: 90, y: 450, vx: 0, vy: 0, kind: 'normal'});
    recycle.settle = 1;
    refund = stepPusher(recycle, 1 / 120).find(event => event.refund) || refund;
  }
  assert.equal(refund.refund, PUSHER.recycleReward);
  assert.equal(recycle.free, PUSHER.recycleReward);
  assert.equal(recycle.recycled, 0, '回收进度满额后必须清零重新累积');
  assert.equal(recycle.tray, 0, '侧槽落币不计奖');
}

// 摇台：消耗能量、给出横向冲量、能量为空时拒绝，回复有上限。
{
  const shake = createPusherState();
  const before = shake.coins.map(coin => coin.vx);
  assert.equal(shake.tilt, PUSHER.tiltMax);
  assert.equal(tiltPusher(shake, 1), true);
  assert.equal(shake.tilt, PUSHER.tiltMax - 1);
  assert(shake.coins.every((coin, i) => coin.vx > before[i]), '右摇必须让所有硬币获得向右冲量');
  assert(shake.settle > 0 && !isPusherIdle(shake), '摇台后必须继续模拟到静止');
  assert.equal(tiltPusher(shake, 2), false, '方向只能是 ±1');
  shake.tilt = 0;
  assert.equal(tiltPusher(shake, -1), false, '没有能量不能摇台');
  rechargeTilt(shake, PUSHER.tiltRecharge);
  assert(Math.abs(shake.tilt - 1) < 1e-9, '回复速率必须是每 tiltRecharge 秒一格');
  rechargeTilt(shake, PUSHER.tiltRecharge * 99);
  assert.equal(shake.tilt, PUSHER.tiltMax, '能量不能超过上限');
  finish(shake);
  assert(shake.coins.every(coin => coin.x >= 60 && coin.x <= 660), '摇台后硬币不能飞出台面');
}

// 金塔：按层数计价、只存在一座、推落后确定性地重建。
{
  assert.equal(coinFaceValue({kind: 'tower', height: 6}), 6 * TOWER.coinValue);
  assert.equal(coinFaceValue({kind: 'gold'}), COIN_VALUE.gold);
  for (const roll of [0, .5, .999]) {
    const height = rollTowerHeight(() => roll);
    assert(height >= TOWER.minHeight && height <= TOWER.maxHeight, `抽到的塔高 ${height} 超范围`);
  }

  // 从前沿 ×2 区推落：按 层数 × 单层 × 倍率 结算，并立刻进入重建。
  const fall = createPusherState({version: 2, tray: 0, nextTower: 7,
    coins: [{x: 360, y: PUSHER.edge + 1, kind: 'tower', height: 4}]});
  fall.settle = 1;
  const win = stepPusher(fall, 1 / 120).find(event => event.type === 'win');
  assert.equal(win.tower, 4);
  assert.equal(win.amount, 4 * TOWER.coinValue * 2, '中央 ×2 区的塔要按倍率结算');
  assert.equal(fall.tray, win.amount);
  assert.equal(findTower(fall), null, '塔推落后台面上不该还有塔');
  assert.equal(fall.towerRoll.target, 7, '重建高度必须用事先抽好的 nextTower');
  assert.equal(isPusherIdle(fall), false, '重建期间机台不算空闲');

  // 重建：先滚数字，再一层层叠满，最后落位成一座 7 层塔。
  const stacked = [];
  let guard = 0;
  while (fall.towerRoll && guard++ < 4000) {
    for (const event of stepPusher(fall, 1 / 120)) {
      if (event.type === 'tower-stack') stacked.push(event.level);
      if (event.type === 'tower-ready') assert.equal(event.height, 7);
    }
  }
  assert.deepEqual(stacked, [1, 2, 3, 4, 5, 6, 7], '每一层都要单独报一次，供音效逐层响');
  const rebuilt = findTower(fall);
  assert.equal(rebuilt.height, 7);
  assert.equal(rebuilt.x, TOWER.homeX);
  assert.equal(rebuilt.y, TOWER.homeY);
  assert.equal(isPusherIdle(fall), true);

  // 掉进侧槽的塔只回收不给钱，但同样要重建。
  const lost = createPusherState({version: 2, tray: 0, nextTower: 3,
    coins: [{x: PUSHER.frontLeft - 2, y: 400, kind: 'tower', height: 5}]});
  lost.settle = 1;
  const events = stepPusher(lost, 1 / 120);
  assert.equal(events.find(event => event.type === 'win'), undefined, '侧槽不结算');
  assert.equal(events.find(event => event.type === 'lost').tower, 5);
  assert.equal(lost.tray, 0);
  assert.equal(lost.towerRoll.target, 3);

  // 存档里塞两座塔只保留一座；缺塔的存档会自动补建。
  assert.equal(createPusherState({version: 2, coins: [
    {x: 300, y: 300, kind: 'tower', height: 4},
    {x: 400, y: 300, kind: 'tower', height: 6},
  ]}).coins.filter(coin => coin.kind === 'tower').length, 1);
  assert(createPusherState({version: 2, coins: []}).towerRoll, '存档没有塔时要排一次重建');
  assert.equal(createPusherState({version: 2, coins: [{x: 360, y: 300, kind: 'tower', height: 99}]}).coins[0].height,
    TOWER.minHeight, '越界的塔高要被清洗');

  // 重建过程中刷新：进度、目标高度和后续每一层都必须完全一致。
  const live = createPusherState({version: 2, tray: 0, nextTower: 6,
    coins: [{x: 360, y: PUSHER.edge + 1, kind: 'tower', height: 4}]});
  live.settle = 1;
  stepPusher(live, 1 / 120);
  for (let i = 0; i < 80; i++) stepPusher(live, 1 / 120);
  const resumed = createPusherState(JSON.parse(JSON.stringify(live)));
  assert.deepEqual(resumed.towerRoll, live.towerRoll, '重建进度要原样恢复');
  const tail = state => {
    const seen = [];
    let steps = 0;
    while (state.towerRoll && steps++ < 4000) {
      for (const event of stepPusher(state, 1 / 120)) if (event.type.startsWith('tower')) seen.push(event.type + ':' + (event.level ?? event.height ?? event.target));
    }
    return seen;
  };
  assert.deepEqual(tail(resumed), tail(live), '刷新后重建的每一步都要一致');
  assert.equal(findTower(resumed).height, findTower(live).height);
}

// 旧版本存档必须被丢弃并重建币堆，坏数据不会带进新局。
assert.equal(createPusherState({version: 1, coins: [{x: 300, y: 300}], tray: 9}).coins.length, 221);
assert.equal(createPusherState({version: 2, coins: [{x: NaN, y: 200}]}).coins.length, 221);
assert.equal(createPusherState({version: 2, coins: [], jackpot: -5}).jackpot, PUSHER.jackpotSeed);
assert.equal(createPusherState({version: 2, coins: [{x: 300, y: 300, kind: 'hack'}]}).coins[0].kind, 'normal');

console.log('mechanical games: 12 paytables + RTP bounds, 8/12/16-row exhaustive drops, gold pegs, nudges,',
  'charged balls, pusher zones, jackpot tokens, chains, recycling, tilt, gold tower rebuild and save recovery passed');
