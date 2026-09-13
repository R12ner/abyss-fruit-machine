export const ROWS = 12;
// Multipliers in tenths; stakes are multiples of 10 so wallet amounts stay whole.
export const PAYTABLES = Object.freeze({
  classic: Object.freeze([100, 50, 30, 20, 10, 5, 2, 5, 10, 20, 30, 50, 100]),
  high: Object.freeze([1000, 250, 80, 30, 10, 2, 0, 2, 10, 30, 80, 250, 1000]),
});
export const STAKES = Object.freeze([10, 20, 50, 100]);

export function createPlinkoRound(bet, risk, random = Math.random) {
  if (!STAKES.includes(bet) || !Object.hasOwn(PAYTABLES, risk)) throw new RangeError('Invalid drop');
  const directions = Array.from({length: ROWS}, () => random() < .5 ? 0 : 1);
  return restorePlinkoRound({bet, risk, directions});
}

export function restorePlinkoRound(raw) {
  if (!raw || !STAKES.includes(raw.bet) || !Object.hasOwn(PAYTABLES, raw.risk) ||
      !Array.isArray(raw.directions) || raw.directions.length !== ROWS ||
      raw.directions.some(value => value !== 0 && value !== 1)) return null;
  const slot = raw.directions.reduce((sum, direction) => sum + direction, 0);
  const multiplier = PAYTABLES[raw.risk][slot] / 10;
  return {bet: raw.bet, risk: raw.risk, directions: [...raw.directions], slot, multiplier,
    payout: raw.bet * PAYTABLES[raw.risk][slot] / 10};
}

export function plinkoPosition(round, progress) {
  const t = Math.max(0, Math.min(1, progress));
  if (t < .08) return {x: 360, y: 52 + (t / .08) ** 2 * 48, row: -1};
  const travelled = Math.min(ROWS, (t - .08) / .84 * ROWS);
  const row = Math.min(ROWS - 1, Math.floor(travelled));
  let x = 360;
  for (let i = 0; i < row; i++) x += round.directions[i] ? 22 : -22;
  const fraction = travelled - row;
  x += (round.directions[row] ? 22 : -22) * Math.min(1, fraction);
  const y = 100 + row * 30 + 30 * Math.min(1, fraction) - Math.sin(Math.min(1, fraction) * Math.PI) * 12;
  if (t > .92) return {x: 96 + round.slot * 44, y: 460 + (t - .92) / .08 * 48, row: ROWS};
  return {x, y, row};
}
