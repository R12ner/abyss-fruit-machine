export const PUSHER = Object.freeze({
  left: 84, right: 636, back: 164, stroke: 78, edge: 490, radius: 13, duration: 4.2,
  // 前沿有效区间；区间之外（更靠边）的落币掉进侧槽。
  frontLeft: 128, frontRight: 592,
  maxCoins: 260,
  tiltMax: 3, tiltRecharge: 11, tiltImpulse: 168, tiltSettle: .95,
  jackpotSeed: 60, jackpotPerCoin: .12,
  chainStep: 6, chainBonus: 2,
  recycleGoal: 10, recycleReward: 2,
  goldChance: .05, tokenChance: .002,
});

// 前沿五个倍率区，中间最难命中也最值钱。
export const ZONES = Object.freeze([1, 1, 2, 1, 1]);
const ZONE_WIDTH = (PUSHER.frontRight - PUSHER.frontLeft) / ZONES.length;

export const COIN_VALUE = Object.freeze({normal: 1, gold: 3, token: 0});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const whole = value => Number.isSafeInteger(value) && value >= 0;
const kindOf = value => (value === 'gold' || value === 'token' ? value : 'normal');

export function zoneAt(x) {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor((x - PUSHER.frontLeft) / ZONE_WIDTH)));
}

export function zoneMultiplier(x) {
  return ZONES[zoneAt(x)];
}

export function isSideExit(x) {
  return x < PUSHER.frontLeft || x > PUSHER.frontRight;
}

/** 开局币堆：确定性摆放，方便测试，也保证每台机器起手都有金币和代币。 */
function seedPile() {
  const coins = [];
  let index = 0;
  for (let row = 0; row < 11; row++) for (let col = 0; col < 20; col++, index++) {
    const kind = index % 107 === 7 ? 'token' : index % 17 === 3 ? 'gold' : 'normal';
    coins.push({x: 108 + col * 26 + (row % 2) * 13, y: 261 + row * Math.sqrt(507), vx: 0, vy: 0, kind});
  }
  return coins;
}

export function createPusherState(raw) {
  const valid = raw?.version === 2 && Array.isArray(raw.coins) && raw.coins.length <= PUSHER.maxCoins &&
    raw.coins.every(coin => finite(coin.x) && finite(coin.y) && coin.x >= 60 && coin.x <= 660 && coin.y >= 100 && coin.y <= 520);
  const state = {
    version: 2, coins: [],
    tray: valid && whole(raw.tray) ? raw.tray : 0,
    spent: valid && whole(raw.spent) ? raw.spent : 0,
    won: valid && whole(raw.won) ? raw.won : 0,
    lastWin: valid && whole(raw.lastWin) ? raw.lastWin : 0,
    chain: valid && whole(raw.chain) ? raw.chain : 0,
    bestChain: valid && whole(raw.bestChain) ? raw.bestChain : 0,
    recycled: valid && whole(raw.recycled) ? raw.recycled % PUSHER.recycleGoal : 0,
    free: valid && whole(raw.free) ? Math.min(99, raw.free) : 0,
    jackpot: valid && whole(raw.jackpot) && raw.jackpot >= PUSHER.jackpotSeed ? raw.jackpot : PUSHER.jackpotSeed,
    jackpotProgress: valid && finite(raw.jackpotProgress) && raw.jackpotProgress >= 0 && raw.jackpotProgress < 1 ? raw.jackpotProgress : 0,
    tilt: valid && finite(raw.tilt) ? Math.max(0, Math.min(PUSHER.tiltMax, raw.tilt)) : PUSHER.tiltMax,
    settle: 0, pending: null,
  };
  state.coins = valid
    ? raw.coins.map(coin => ({x: coin.x, y: coin.y, vx: finite(coin.vx) ? coin.vx : 0, vy: finite(coin.vy) ? coin.vy : 0, kind: kindOf(coin.kind)}))
    : seedPile();
  const pending = raw?.pending;
  if (valid && pending && [1, 5].includes(pending.count) && finite(pending.aim) &&
    pending.aim >= 0 && pending.aim <= 1 && finite(pending.time) && pending.time >= 0 && pending.time < PUSHER.duration &&
    Number.isInteger(pending.inserted) && pending.inserted >= 0 && pending.inserted <= pending.count &&
    Array.isArray(pending.kinds) && pending.kinds.length === pending.count) {
    state.pending = {count: pending.count, aim: pending.aim, time: pending.time, inserted: pending.inserted, kinds: pending.kinds.map(kindOf)};
  }
  return state;
}

export function rollCoinKinds(count, random = Math.random) {
  return Array.from({length: count}, () => {
    const roll = random();
    if (roll < PUSHER.tokenChance) return 'token';
    if (roll < PUSHER.tokenChance + PUSHER.goldChance) return 'gold';
    return 'normal';
  });
}

export function startPusherRound(state, count, aim, random = Math.random) {
  if (state.pending || ![1, 5].includes(count) || !finite(aim) || aim < 0 || aim > 1 ||
      state.coins.length + count > PUSHER.maxCoins) return false;
  state.pending = {count, aim, time: 0, inserted: 0, kinds: rollCoinKinds(count, random)};
  state.spent += count;
  state.lastWin = 0;
  state.chain = 0;
  // 彩金按小数累积，只有整数部分进池，保证结算永远是整数 USD。
  state.jackpotProgress += count * PUSHER.jackpotPerCoin;
  const gain = Math.floor(state.jackpotProgress);
  state.jackpotProgress -= gain;
  state.jackpot += gain;
  return true;
}

/** 摇台：消耗一格能量，给整堆硬币一个横向冲量。越靠前的币被推得越远。 */
export function tiltPusher(state, direction) {
  if (state.tilt < 1 || Math.abs(direction) !== 1) return false;
  state.tilt -= 1;
  state.settle = Math.max(state.settle, PUSHER.tiltSettle);
  for (const coin of state.coins) {
    const reach = .55 + Math.max(0, coin.y - PUSHER.back) / 480;
    coin.vx += direction * PUSHER.tiltImpulse * reach;
    coin.vy += 26 * reach;
  }
  return true;
}

export function rechargeTilt(state, dt) {
  if (!finite(dt) || dt <= 0) return state.tilt;
  state.tilt = Math.min(PUSHER.tiltMax, state.tilt + dt / PUSHER.tiltRecharge);
  return state.tilt;
}

export function pusherFace(state) {
  if (!state.pending) return PUSHER.back;
  return PUSHER.back + PUSHER.stroke * Math.sin(Math.PI * Math.min(1, state.pending.time / PUSHER.duration)) ** 2;
}

export function isPusherIdle(state) {
  return !state.pending && state.settle <= 0;
}

export function stepPusher(state, dt) {
  const events = [];
  if (isPusherIdle(state)) return events;
  const step = Math.min(1 / 60, Math.max(0, dt));
  const pending = state.pending, r = PUSHER.radius;
  if (state.settle > 0) state.settle = Math.max(0, state.settle - step);
  if (pending) {
    pending.time += step;
    while (pending.inserted < pending.count && pending.time >= pending.inserted * .22) {
      const offset = pending.count === 1 ? 0 : (pending.inserted - 2) * 15;
      state.coins.push({
        x: Math.max(112, Math.min(608, 112 + pending.aim * 496 + offset)), y: 180,
        vx: 0, vy: 95, kind: pending.kinds[pending.inserted],
      });
      pending.inserted++;
      events.push({type: 'insert', kind: state.coins.at(-1).kind});
    }
  }
  const face = pusherFace(state);
  for (const coin of state.coins) {
    coin.x += coin.vx * step; coin.y += coin.vy * step;
    coin.vx *= .94; coin.vy *= .94;
  }
  // Position constraints transfer the plate's movement through the actual coin pile.
  // Alternating pair order avoids a persistent left/right solver bias.
  for (let pass = 0; pass < 5; pass++) {
    for (const coin of state.coins) {
      coin.y = Math.max(face + r, coin.y);
      if (coin.y < 350) coin.x = Math.max(PUSHER.left + r, Math.min(PUSHER.right - r, coin.x));
    }
    const grid = new Map();
    for (let i = 0; i < state.coins.length; i++) {
      const a = state.coins[pass % 2 ? state.coins.length - 1 - i : i];
      const gx = Math.floor(a.x / 26), gy = Math.floor(a.y / 26);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const b of grid.get(`${gx + ox},${gy + oy}`) || []) {
      let dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) >= r * 2 || Math.abs(dy) >= r * 2) continue;
      let distance = Math.hypot(dx, dy);
      if (distance >= r * 2) continue;
      if (distance < .001) {dx = .01; dy = .01; distance = Math.hypot(dx, dy);}
      const overlap = (r * 2 - distance) * .5;
      a.x -= dx / distance * overlap; a.y -= dy / distance * overlap;
      b.x += dx / distance * overlap; b.y += dy / distance * overlap;
      }
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(a);
    }
  }
  state.coins = state.coins.filter(coin => {
    const side = coin.y >= 350 && isSideExit(coin.x);
    if (!side && coin.y <= PUSHER.edge) return true;
    if (side) {
      state.recycled++;
      const event = {type: 'lost', x: coin.x, y: coin.y, kind: coin.kind, recycled: state.recycled};
      if (state.recycled >= PUSHER.recycleGoal) {
        state.recycled -= PUSHER.recycleGoal;
        state.free += PUSHER.recycleReward;
        event.refund = PUSHER.recycleReward;
      }
      events.push(event);
      return false;
    }
    const multiplier = zoneMultiplier(coin.x);
    const event = {type: 'win', x: coin.x, y: coin.y, kind: coin.kind, zone: zoneAt(coin.x), multiplier, amount: 0};
    if (coin.kind === 'token') {
      event.amount = state.jackpot;
      event.jackpot = state.jackpot;
      state.jackpot = PUSHER.jackpotSeed;
      state.jackpotProgress = 0;
    } else {
      event.amount = COIN_VALUE[coin.kind] * multiplier;
    }
    state.chain++;
    state.bestChain = Math.max(state.bestChain, state.chain);
    if (state.chain % PUSHER.chainStep === 0) {
      event.chain = state.chain;
      event.chainBonus = PUSHER.chainBonus;
      event.amount += PUSHER.chainBonus;
    }
    state.tray += event.amount;
    state.won += event.amount;
    state.lastWin += event.amount;
    events.push(event);
    return false;
  });
  if (pending && pending.time >= PUSHER.duration) {
    state.pending = null;
    state.settle = Math.max(state.settle, .35);
    events.push({type: 'complete', win: state.lastWin, chain: state.chain});
  }
  return events;
}
