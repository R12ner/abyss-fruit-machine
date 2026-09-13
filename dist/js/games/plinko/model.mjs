/* 深渊弹珠机规则模块：钉阵几何、赔付表生成、金钉、蓄能球与推球。
   所有赔付都用「十分之一倍」（tenths）存储，投注额是 10 的倍数，因此结算永远是整数 USD。 */

export const ROW_OPTIONS = Object.freeze([8, 12, 16]);
export const STAKES = Object.freeze([10, 20, 50, 100]);

export const RISKS = Object.freeze({
  low:     Object.freeze({label: '低风险', english: 'STEADY', peak: 3,    gamma: 1.6}),
  classic: Object.freeze({label: '经典',   english: 'CLASSIC', peak: 10,  gamma: 1.9}),
  high:    Object.freeze({label: '高倍',   english: 'HIGH',    peak: 100, gamma: 2.4}),
  abyss:   Object.freeze({label: '深渊',   english: 'ABYSS',   peak: 1000, gamma: 3.0}),
});
export const RISK_KEYS = Object.freeze(Object.keys(RISKS));

/** 基础赔付表的目标返还率；金钉与蓄能球会在此之上补足。 */
export const BASE_RTP = .74;
export const GOLD_PEGS = 3;
export const ENERGY_GOAL = 16;
export const ENERGY_PER_DROP = 1;
export const ENERGY_PER_GOLD = 2;
export const CHARGED_MULTIPLIER = 2;
export const NUDGE_MAX = 2;
export const NUDGE_RECHARGE = 15;

export function pegCount(rows) {return rows * (rows + 1) / 2;}

/** 每命中一枚金钉追加的倍率（十分之一倍），按钉数缩放，使各层数的加成期望一致。 */
export function goldBonusTenths(rows) {
  return Math.max(1, Math.round(1.4 * pegCount(rows) / (GOLD_PEGS * rows)));
}

export function slotProbabilities(rows) {
  const probs = [1];
  for (let row = 0; row < rows; row++) {
    const next = Array(probs.length + 1).fill(0);
    for (let i = 0; i < probs.length; i++) {next[i] += probs[i] / 2; next[i + 1] += probs[i] / 2;}
    probs.length = 0; probs.push(...next);
  }
  return probs;
}

function buildTable(rows, {peak, gamma}) {
  const probs = slotProbabilities(rows), half = rows / 2;
  const shape = probs.map((_, i) => peak ** ((Math.abs(i - half) / half) ** gamma));
  const raw = shape.reduce((sum, value, i) => sum + value * probs[i], 0);
  const tenths = shape.map(value => Math.max(0, Math.round(value / raw * BASE_RTP * 10)));
  const ev = () => tenths.reduce((sum, value, i) => sum + value * probs[i], 0) / 10;
  const set = (ring, value) => {tenths[half - ring] = value; tenths[half + ring] = value;};
  // 量化后先压成「越靠中间越低」的单调形状，再逐环补偿回目标返还率。
  for (let ring = half - 1; ring >= 0; ring--) set(ring, Math.min(tenths[half - ring], tenths[half - ring - 1]));
  for (let guard = 0; guard < 4000; guard++) {
    const error = BASE_RTP - ev();
    if (Math.abs(error) < .003) break;
    let ring = -1;
    for (let candidate = 0; candidate <= half; candidate++) {
      const value = tenths[half - candidate];
      const outer = candidate === half ? Infinity : tenths[half - candidate - 1];
      const inner = candidate === 0 ? 0 : tenths[half - candidate + 1];
      if (error > 0 ? value + 1 <= outer : value - 1 >= inner && value > 0) {ring = candidate; break;}
    }
    if (ring < 0) break;
    set(ring, tenths[half - ring] + (error > 0 ? 1 : -1));
  }
  return Object.freeze(tenths);
}

/** PAYTABLES[rows][risk] -> 十分之一倍的数组，长度 rows + 1。 */
export const PAYTABLES = Object.freeze(Object.fromEntries(ROW_OPTIONS.map(rows =>
  [rows, Object.freeze(Object.fromEntries(RISK_KEYS.map(risk => [risk, buildTable(rows, RISKS[risk])])))])));

export function paytable(rows, risk) {
  return PAYTABLES[rows]?.[risk] || null;
}

/* ---------- 几何 ---------- */
const BOARD_WIDTH = 528;
export function plinkoGeometry(rows) {
  const spacing = BOARD_WIDTH / rows;
  return {
    rows, spacing, half: spacing / 2,
    gap: Math.min(36, 372 / rows),
    pegTop: 108,
    slotTop: 492,
    slotCenter: index => 360 - rows * spacing / 2 + index * spacing,
    pegX: (row, col) => 360 - row * spacing / 2 + col * spacing,
    pegY: row => 108 + row * Math.min(36, 372 / rows),
  };
}

/* ---------- 回合 ---------- */
const isRow = value => ROW_OPTIONS.includes(value);
const isStake = value => STAKES.includes(value);
const isRisk = value => Object.hasOwn(RISKS, value);

function pickGoldPegs(rows, random) {
  const chosen = new Map();
  for (let guard = 0; chosen.size < Math.min(GOLD_PEGS, pegCount(rows)) && guard < 200; guard++) {
    const row = Math.min(rows - 1, Math.floor(random() * rows));
    const col = Math.min(row, Math.floor(random() * (row + 1)));
    chosen.set(`${row},${col}`, [row, col]);
  }
  return [...chosen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** 球经过的钉：第 r 层落在第 (前 r 次右移次数) 列。 */
export function pathColumns(directions) {
  const columns = [];
  let col = 0;
  for (let row = 0; row < directions.length; row++) {columns.push(col); col += directions[row];}
  return columns;
}

export function countGoldHits(directions, gold) {
  const columns = pathColumns(directions);
  return gold.reduce((sum, [row, col]) => sum + (columns[row] === col ? 1 : 0), 0);
}

function derive(round) {
  const table = paytable(round.rows, round.risk);
  round.slot = round.directions.reduce((sum, direction) => sum + direction, 0);
  round.goldHits = countGoldHits(round.directions, round.gold);
  round.baseTenths = table[round.slot];
  round.bonusTenths = round.goldHits * goldBonusTenths(round.rows);
  const tenths = (round.baseTenths + round.bonusTenths) * (round.charged ? CHARGED_MULTIPLIER : 1);
  round.tenths = tenths;
  round.multiplier = tenths / 10;
  round.payout = round.bet * tenths / 10;
  return round;
}

export function createPlinkoRound({bet, risk, rows, charged = false}, random = Math.random) {
  if (!isStake(bet) || !isRisk(risk) || !isRow(rows)) throw new RangeError('Invalid drop');
  return derive({
    bet, risk, rows, charged: !!charged,
    directions: Array.from({length: rows}, () => (random() < .5 ? 0 : 1)),
    gold: pickGoldPegs(rows, random),
    nudged: [],
  });
}

export function restorePlinkoRound(raw) {
  if (!raw || !isStake(raw.bet) || !isRisk(raw.risk) || !isRow(raw.rows)) return null;
  if (!Array.isArray(raw.directions) || raw.directions.length !== raw.rows ||
      raw.directions.some(value => value !== 0 && value !== 1)) return null;
  const gold = Array.isArray(raw.gold) ? raw.gold.filter(pair => Array.isArray(pair) && pair.length === 2 &&
    Number.isInteger(pair[0]) && Number.isInteger(pair[1]) &&
    pair[0] >= 0 && pair[0] < raw.rows && pair[1] >= 0 && pair[1] <= pair[0]).slice(0, GOLD_PEGS) : [];
  const nudged = Array.isArray(raw.nudged)
    ? [...new Set(raw.nudged.filter(row => Number.isInteger(row) && row >= 0 && row < raw.rows))].slice(0, NUDGE_MAX)
    : [];
  return derive({
    bet: raw.bet, risk: raw.risk, rows: raw.rows, charged: !!raw.charged,
    directions: [...raw.directions], gold: gold.map(pair => [pair[0], pair[1]]), nudged,
  });
}

/** 推球：把还没落到的某一层强制拨向一侧，落点与金钉命中会立即重算。 */
export function nudgePlinkoRound(round, row, direction) {
  if (!round || !Number.isInteger(row) || row < 0 || row >= round.rows) return false;
  if (direction !== 0 && direction !== 1) return false;
  if (round.nudged.length >= NUDGE_MAX || round.nudged.includes(row)) return false;
  if (round.directions[row] === direction) {
    round.nudged.push(row);
    return true;
  }
  round.directions[row] = direction;
  round.nudged.push(row);
  derive(round);
  return true;
}

/** 归一化进度 -> 画面坐标。row = -1 表示还在入口管道，row = rows 表示已经落进奖励槽。 */
export function plinkoPosition(round, progress) {
  const geometry = plinkoGeometry(round.rows);
  const t = Math.max(0, Math.min(1, progress));
  if (t < .08) return {x: 360, y: 52 + (t / .08) ** 2 * (geometry.pegTop - 60), row: -1, col: -1};
  if (t > .92) return {x: geometry.slotCenter(round.slot), y: 460 + (t - .92) / .08 * 48, row: round.rows, col: round.slot};
  const travelled = Math.min(round.rows, (t - .08) / .84 * round.rows);
  const row = Math.min(round.rows - 1, Math.floor(travelled));
  const fraction = Math.min(1, travelled - row);
  const columns = pathColumns(round.directions);
  const x = geometry.pegX(row, columns[row]) + (round.directions[row] ? geometry.half : -geometry.half) * fraction;
  const y = geometry.pegY(row) + geometry.gap * fraction - Math.sin(fraction * Math.PI) * 12;
  return {x, y, row, col: columns[row]};
}

/** 单次投球的理论返还率（含金钉加成，不含蓄能球与推球）。 */
export function baseReturn(rows, risk) {
  const probs = slotProbabilities(rows), table = paytable(rows, risk);
  const slots = probs.reduce((sum, p, i) => sum + p * table[i], 0) / 10;
  const goldEv = GOLD_PEGS * rows / pegCount(rows) * goldBonusTenths(rows) / 10;
  return slots + goldEv;
}

/** 计入蓄能球循环后的长期返还率。 */
export function longRunReturn(rows, risk) {
  const goldPerDrop = GOLD_PEGS * rows / pegCount(rows);
  const energyPerDrop = ENERGY_PER_DROP + ENERGY_PER_GOLD * goldPerDrop;
  const chargedShare = energyPerDrop / ENERGY_GOAL;
  return baseReturn(rows, risk) * (1 + chargedShare * (CHARGED_MULTIPLIER - 1));
}
