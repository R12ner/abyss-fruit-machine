export const PUSHER = Object.freeze({left: 84, right: 636, back: 164, stroke: 78, edge: 490, radius: 13, duration: 4.2});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const whole = value => Number.isSafeInteger(value) && value >= 0;

export function createPusherState(raw) {
  const valid = raw?.version === 1 && Array.isArray(raw.coins) && raw.coins.length <= 260 &&
    raw.coins.every(coin => finite(coin.x) && finite(coin.y) && coin.x >= 60 && coin.x <= 660 && coin.y >= 100 && coin.y <= 520);
  const state = {version: 1, coins: [], tray: valid && whole(raw.tray) ? raw.tray : 0,
    spent: valid && whole(raw.spent) ? raw.spent : 0, won: valid && whole(raw.won) ? raw.won : 0,
    lastWin: valid && whole(raw.lastWin) ? raw.lastWin : 0, pending: null};
  if (valid) state.coins = raw.coins.map(coin => ({x: coin.x, y: coin.y, vx: finite(coin.vx) ? coin.vx : 0, vy: finite(coin.vy) ? coin.vy : 0}));
  else for (let row = 0; row < 11; row++) for (let col = 0; col < 20; col++) {
    state.coins.push({x: 108 + col * 26 + (row % 2) * 13, y: 261 + row * Math.sqrt(507), vx: 0, vy: 0});
  }
  const pending = raw?.pending;
  if (valid && pending && [1, 5].includes(pending.count) && finite(pending.aim) &&
    pending.aim >= 0 && pending.aim <= 1 && finite(pending.time) && pending.time >= 0 && pending.time < PUSHER.duration &&
    Number.isInteger(pending.inserted) && pending.inserted >= 0 && pending.inserted <= pending.count) {
    state.pending = {count: pending.count, aim: pending.aim, time: pending.time, inserted: pending.inserted};
  }
  return state;
}

export function startPusherRound(state, count, aim) {
  if (state.pending || ![1, 5].includes(count) || !finite(aim) || aim < 0 || aim > 1 || state.coins.length + count > 260) return false;
  state.pending = {count, aim, time: 0, inserted: 0};
  state.spent += count;
  state.lastWin = 0;
  return true;
}

export function pusherFace(state) {
  if (!state.pending) return PUSHER.back;
  return PUSHER.back + PUSHER.stroke * Math.sin(Math.PI * Math.min(1, state.pending.time / PUSHER.duration)) ** 2;
}

export function stepPusher(state, dt) {
  if (!state.pending) return [];
  const events = [], pending = state.pending, r = PUSHER.radius;
  pending.time += Math.min(1 / 60, Math.max(0, dt));
  while (pending.inserted < pending.count && pending.time >= pending.inserted * .22) {
    const offset = pending.count === 1 ? 0 : (pending.inserted - 2) * 15;
    state.coins.push({x: Math.max(112, Math.min(608, 112 + pending.aim * 496 + offset)), y: 180, vx: 0, vy: 95});
    pending.inserted++;
    events.push({type: 'insert'});
  }
  const face = pusherFace(state);
  for (const coin of state.coins) {
    coin.x += coin.vx * dt; coin.y += coin.vy * dt;
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
    const side = coin.y >= 350 && (coin.x < 99 || coin.x > 621);
    if (side || coin.y > PUSHER.edge) {
      events.push({type: side ? 'lost' : 'win', x: coin.x, y: coin.y});
      if (!side) {state.tray++; state.won++; state.lastWin++;}
      return false;
    }
    return true;
  });
  if (pending.time >= PUSHER.duration) {
    state.pending = null;
    events.push({type: 'complete'});
  }
  return events;
}
