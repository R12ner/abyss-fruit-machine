import {createCabinet} from '../../casino/cabinet.mjs';
import {money, readState, writeState, secureRandom} from '../../casino/storage.mjs';
import {playTone, playClink, playFanfare, playThud} from '../../casino/audio.mjs';
import {createShaker, createFloaters} from '../../casino/effects.mjs';
import {drawFelt, drawGlass, strokeGoldBezel} from '../../casino/canvas.mjs';
import {ROW_OPTIONS, RISKS, RISK_KEYS, STAKES, ENERGY_GOAL, ENERGY_PER_DROP, ENERGY_PER_GOLD,
  CHARGED_MULTIPLIER, NUDGE_MAX, NUDGE_RECHARGE, GOLD_PEGS, MAX_BALLS, goldBonusTenths, paytable,
  plinkoGeometry, boardOutline, createPlinkoRound, restorePlinkoRound, nudgePlinkoRound,
  plinkoPosition, pathColumns} from './rules.mjs';

export const plinkoGameDefinition = Object.freeze({
  id: 'plinko', badge: 'MACHINE 03', title: '深渊弹珠机', subtitle: 'PLINKO · 金钉 · 蓄能 · 推球', cardClass: 'plinko-card',
  art: `<span class="plinko-card-art" aria-hidden="true">${pegFieldArt()}` +
    `<span class="card-coin" style="background-image:url('assets/coins/usdc.png')"></span></span>`,
  create: createPlinkoGame,
});

/** 卡片封面上的钉阵：五层金钉加底部奖励槽，和机台里的钉子同一套造型。 */
function pegFieldArt() {
  const rows = 5, spacing = 36, pegs = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= row; col++) {
      pegs.push(`<circle cx="${150 + (col - row / 2) * spacing} " cy="${20 + row * 25}" r="7"/>`);
    }
  }
  const left = 150 - rows / 2 * spacing, width = rows * spacing;
  const slots = Array.from({length: 6}, (_, i) =>
    `<rect x="${(left + i * width / 6).toFixed(1)}" y="140" width="${(width / 6 - 5).toFixed(1)}" height="9" rx="2"/>`);
  return `<svg class="plinko-card-pegs" viewBox="0 0 300 152" preserveAspectRatio="xMidYMid meet">
    <defs><radialGradient id="plinko-peg" cx=".34" cy=".3">
      <stop offset="0" stop-color="#fff3cd"/><stop offset=".55" stop-color="#dcbd71"/><stop offset="1" stop-color="#6f5522"/>
    </radialGradient></defs>
    <g fill="url(#plinko-peg)">${pegs.join('')}</g>
    <g fill="#9d7f3c">${slots.join('')}</g>
  </svg>`;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 奖励槽的三条深度基准线：槽口、正面上沿、正面下沿。 */
const SLOT = Object.freeze({mouth: 486, top: 494, bottom: 532});

/**
 * 顶部摆板：机台自己来回晃，玩家不能控制。
 * 球放在板上，按下释放时从板子当前所在的位置滑下去，
 * 所以每一颗入场的位置都不一样。赔付路径仍由规则层决定，摆板只管把球送进钉阵。
 */
const PLATE = Object.freeze({pivotY: 40, halfWidth: 104, swing: 2.1, apexY: 78});
const plateOffset = seconds => Math.sin(seconds * PLATE.swing) * PLATE.halfWidth;

export function createPlinkoGame({wallet, openLobby}) {
  const key = 'abyss-plinko-state-v3', saved = readState(key);
  let bet = STAKES.includes(saved?.bet) ? saved.bet : 10;
  let risk = Object.hasOwn(RISKS, saved?.risk) ? saved.risk : 'classic';
  let rows = ROW_OPTIONS.includes(saved?.rows) ? saved.rows : 12;
  let tray = Number.isSafeInteger(saved?.tray) && saved.tray >= 0 ? saved.tray : 0;
  let energy = Number.isSafeInteger(saved?.energy) && saved.energy >= 0 ? Math.min(ENERGY_GOAL, saved.energy) : 0;
  let nudge = Number.isFinite(saved?.nudge) ? clamp(saved.nudge, 0, NUDGE_MAX) : NUDGE_MAX;
  let history = Array.isArray(saved?.history) ? saved.history.map(restorePlinkoRound).filter(Boolean).slice(0, 8) : [];
  let last = history[0] || null, active = false, animation = 0, lastTime = 0, lastSave = 0, nudgeTimer = 0;
  let clock = 0;

  /**
   * 同屏多球：投球不排队也不等待，按一次就多一颗，各自带自己的回合、进度、
   * 轨迹和入场点（摆板当时晃到哪就从哪滑下去），因此连按出来的球彼此都不一样。
   */
  const balls = (Array.isArray(saved?.balls) ? saved.balls : []).slice(0, MAX_BALLS).map(raw => {
    const round = restorePlinkoRound(raw);
    if (!round) return null;
    return {
      round,
      progress: Number.isFinite(raw.progress) ? clamp(raw.progress, 0, .999) : 0,
      releaseX: Number.isFinite(raw.releaseX) ? clamp(raw.releaseX, 60, 660) : 360,
      lastPin: -1, trail: [],
    };
  }).filter(Boolean);
  if (balls.length) {bet = balls[0].round.bet; risk = balls[0].round.risk; rows = balls[0].round.rows;}
  const busy = () => balls.length > 0;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flashes = [], shaker = createShaker(), floaters = createFloaters();
  const durationFor = count => (reduced ? 1.3 : 2.6 + count * .11);

  const view = createCabinet({id: 'plinko', title: '深渊弹珠机', english: 'THE PLINKO CLUB', number: 'MACHINE 03', wallet, openLobby,
    recordFields: [
      {key: 'bestPayout', label: '单颗最高', format: value => `${money(value)} USD`},
      {key: 'bestMultiplier', label: '最大倍率', format: value => `×${value / 10}`},
      {key: 'bestGold', label: '单颗金钉', format: value => `${value} 枚`},
    ],
    controls: `<div class="mechanical-energy"><span>深渊能量 <small>CHARGE</small></span>
        <div class="mechanical-energy-bar" aria-hidden="true"><i data-energy-fill></i></div>
        <output data-energy>0 / ${ENERGY_GOAL}</output><p data-energy-hint>投球 +${ENERGY_PER_DROP}，命中金钉 +${ENERGY_PER_GOLD}。充满后下一颗是 ×${CHARGED_MULTIPLIER} 深渊之球。</p></div>
      <div class="mechanical-controls">
      <span class="mechanical-control-label" id="plinko-stake-label">每颗弹珠 <output id="plinko-cost">10 USD</output></span>
      <div class="mechanical-options" role="group" aria-labelledby="plinko-stake-label">${STAKES.map(value => `<button type="button" data-plinko-bet="${value}" aria-pressed="false">${value}</button>`).join('')}</div>
      <span class="mechanical-control-label" id="plinko-rows-label">钉阵层数 <output id="plinko-rows-value">12 层</output></span>
      <div class="mechanical-rows" role="group" aria-labelledby="plinko-rows-label">${ROW_OPTIONS.map(value => `<button type="button" data-plinko-rows="${value}" aria-pressed="false">${value} 层</button>`).join('')}</div>
      <span class="mechanical-control-label" id="plinko-risk-label">倍率档位 <output id="plinko-risk-value">经典</output></span>
      <div class="mechanical-risk mechanical-risk-4" role="group" aria-labelledby="plinko-risk-label">${RISK_KEYS.map(name => `<button type="button" data-plinko-risk="${name}" aria-pressed="false">${RISKS[name].label}</button>`).join('')}</div>
      <button type="button" class="mechanical-fire" id="plinko-drop">
        <b>投 球</b><em data-fire-cost>10 USD</em><small>连按可同时放多颗 · 空格 / 回车</small>
        <i class="mechanical-fire-count" data-fire-count hidden>0</i></button>
      <div class="mechanical-gauge"><span class="mechanical-control-label" id="plinko-nudge-label">推球 <output id="plinko-nudge-value">2 / ${NUDGE_MAX}</output></span>
        <div class="mechanical-gauge-bar" aria-hidden="true"><i data-nudge-fill></i></div>
        <div class="mechanical-gauge-row" role="group" aria-labelledby="plinko-nudge-label">
          <button type="button" class="arcade-plate" id="plinko-nudge-left">◀ 左推</button><button type="button" class="arcade-plate" id="plinko-nudge-right">右推 ▶</button></div></div>
      <p>穿过钉阵按落点倍率得币。倍率包含本金，越靠两侧越难命中。</p></div>`,
    help: `<p><b>基本玩法</b>：选择面额、层数和档位，按红色大按钮（或空格 / 回车）立即扣费放一颗球。<b>不用等球落地</b>，可以继续连按，最多 ${MAX_BALLS} 颗球同时在盘面上跑，各自独立结算。每层碰钉后左右机会相同，落入 层数+1 个奖励槽之一。奖励 = 面额 × 落点倍率，已包含本金。</p>
      <p><b>层数</b>：8 层节奏最快、落点少；12 层是标准盘；16 层最长，两侧倍率也最高。层数变化时整张赔付表会重算。</p>
      <p><b>档位</b>：低风险 / 经典 / 高倍 / 深渊。越往上中央越薄、边缘越夸张，16 层深渊档边槽可达数百倍。</p>
      <p><b>金钉</b>：每颗球开局随机点亮 ${GOLD_PEGS} 枚金钉。球撞到一枚金钉，最终倍率额外 +${goldBonusTenths(12) / 10}（随层数缩放），同时能量 +${ENERGY_PER_GOLD}。</p>
      <p><b>深渊能量</b>：每投一球 +${ENERGY_PER_DROP}，命中金钉再 +${ENERGY_PER_GOLD}。攒满 ${ENERGY_GOAL} 点后，下一颗自动变成 ×${CHARGED_MULTIPLIER} 深渊之球，赔付整体翻倍。</p>
      <p><b>顶部摆板</b>：机台顶上那块托盘一直自己左右晃，不受玩家控制。按下投球时球从托盘当时所在的位置滑进钉阵，所以连按出来的每颗球入场点都不一样。摆板只负责把球送进去，落点仍由钉阵逐层决定。</p>
      <p><b>推球</b>：落球途中按左右方向键（或按钮）可以把<b>最接近底部</b>那颗球下一层的碰钉结果拨向指定一侧，每颗球最多用 ${NUDGE_MAX} 次，能量约每 ${NUDGE_RECHARGE} 秒回复 1 次。落点和金钉命中会立刻重算；盘上多于一颗球时，会用光圈标出当前会被拨动的那颗。</p>
      <p>盘上还有球时不能改面额、层数或档位。切换游戏会暂停动画；刷新后所有已扣费的球都会继续跑完，不会重新抽取结果。结果进入出币槽，按“领取到钱包”收取。</p>`});

  const {context: ctx, $} = view;
  /**
   * 背板轮廓：由 boardOutline(rows) 从钉阵推导，顶点沿钉锥张开到最后一层，
   * 再外扩到奖励槽宽度，因此 8 / 12 / 16 层都不会出现钉子穿出边框。
   */
  const boardPath = () => {
    const frame = boardOutline(rows);
    ctx.beginPath();
    ctx.moveTo(360 - 16, frame.apexY + 16);
    ctx.quadraticCurveTo(360, frame.apexY - 6, 360 + 16, frame.apexY + 16);
    ctx.lineTo(360 + frame.coneHalf, frame.coneY);
    ctx.lineTo(360 + frame.slotHalf, frame.slotTop);
    ctx.quadraticCurveTo(360 + frame.slotHalf + 10, frame.floorY, 360 + frame.slotHalf - 18, frame.floorY);
    ctx.lineTo(360 - frame.slotHalf + 18, frame.floorY);
    ctx.quadraticCurveTo(360 - frame.slotHalf - 10, frame.floorY, 360 - frame.slotHalf, frame.slotTop);
    ctx.lineTo(360 - frame.coneHalf, frame.coneY);
    ctx.closePath();
  };
  const odds = document.createElement('div'); odds.className = 'plinko-odds'; odds.setAttribute('aria-label', '从左到右的落点倍率');
  $('.mechanical-scene').after(odds);
  const persist = () => writeState(key, {bet, risk, rows, tray, energy, nudge, history,
    balls: balls.map(ball => ({...ball.round, progress: ball.progress, releaseX: ball.releaseX}))});

  /** 当前会被推球拨动的球：最接近底部、还有推球次数、且还没到最后一层的那颗。 */
  function nudgeTarget() {
    let best = null;
    for (const ball of balls) {
      if (ball.round.nudged.length >= NUDGE_MAX) continue;
      if (plinkoPosition(ball.round, ball.progress).row + 1 >= ball.round.rows) continue;
      if (!best || ball.progress > best.progress) best = ball;
    }
    return best;
  }

  function render() {
    const table = paytable(rows, risk), locked = busy();
    view.update({tray, win: last?.payout || 0, busy: locked, minimum: bet});
    const charged = energy >= ENERGY_GOAL;
    $('#plinko-drop').disabled = wallet.balance() < bet || balls.length >= MAX_BALLS;
    $('#plinko-drop').classList.toggle('is-charged', charged);
    $('#plinko-drop').querySelector('b').textContent = charged ? '深渊之球' : '投 球';
    $('[data-fire-cost]').textContent = `${bet} USD${charged ? ` · ×${CHARGED_MULTIPLIER}` : ''}`;
    const counter = $('[data-fire-count]');
    counter.hidden = !balls.length;
    counter.textContent = String(balls.length);
    $('#plinko-cost').textContent = `${bet} USD`;
    $('#plinko-rows-value').textContent = `${rows} 层`;
    $('#plinko-risk-value').textContent = RISKS[risk].label;
    view.root.querySelectorAll('[data-plinko-bet]').forEach(button => {button.disabled = locked; button.setAttribute('aria-pressed', String(Number(button.dataset.plinkoBet) === bet));});
    view.root.querySelectorAll('[data-plinko-rows]').forEach(button => {button.disabled = locked; button.setAttribute('aria-pressed', String(Number(button.dataset.plinkoRows) === rows));});
    view.root.querySelectorAll('[data-plinko-risk]').forEach(button => {button.disabled = locked; button.setAttribute('aria-pressed', String(button.dataset.plinkoRisk === risk));});
    $('[data-energy]').textContent = `${Math.min(energy, ENERGY_GOAL)} / ${ENERGY_GOAL}`;
    $('[data-energy-fill]').style.width = `${Math.min(1, energy / ENERGY_GOAL) * 100}%`;
    $('.mechanical-energy').classList.toggle('is-full', charged);
    odds.style.setProperty('--slots', String(table.length));
    odds.innerHTML = table.map((value, index) => `<span class="${!locked && last?.risk === risk && last?.rows === rows && last.slot === index ? 'is-hit' : ''}" aria-label="第 ${index + 1} 槽，${value / 10} 倍">×${value / 10}</span>`).join('');
    $('[data-history]').innerHTML = history.length
      ? history.map(round => `<b class="${round.payout < round.bet ? 'lost' : ''}${round.charged ? ' charged' : ''}" title="${round.bet} USD × ${round.multiplier} = ${round.payout} USD（${round.rows} 层 ${RISKS[round.risk].label}${round.goldHits ? ` · 金钉 ${round.goldHits}` : ''}）">×${round.multiplier}</b>`).join('')
      : '还没有游戏记录';
    renderNudge();
  }
  function renderNudge() {
    const charges = Math.floor(nudge);
    $('#plinko-nudge-value').textContent = `${charges} / ${NUDGE_MAX}`;
    $('[data-nudge-fill]').style.width = `${nudge / NUDGE_MAX * 100}%`;
    const usable = charges >= 1 && !!nudgeTarget();
    $('#plinko-nudge-left').disabled = $('#plinko-nudge-right').disabled = !usable;
  }

  function draw(dt = 0) {
    const count = rows, geometry = plinkoGeometry(count), table = paytable(count, risk);
    drawFelt(ctx);
    shaker.begin(ctx, dt);
    boardPath();
    const board = ctx.createLinearGradient(0, 60, 0, 532);
    board.addColorStop(0, '#0a2417'); board.addColorStop(.55, '#12402b'); board.addColorStop(1, '#071a11');
    ctx.fillStyle = board; ctx.fill();
    // 内侧压暗：让钉阵看起来是嵌在一块凹进去的背板里
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#00000088'; ctx.lineWidth = 22;
    boardPath(); ctx.stroke();
    ctx.restore();
    boardPath();
    strokeGoldBezel(ctx, {width: 3});
    ctx.strokeStyle = '#d1b26433'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(360, 86); ctx.lineTo(641, 512); ctx.lineTo(79, 512); ctx.closePath(); ctx.stroke();

    // 多球：把所有球当前碰到的钉和全部金钉先汇总一次，钉阵只画一遍。
    const points = balls.map(ball => plinkoPosition(ball.round, ball.progress));
    const litPegs = new Set();
    points.forEach(point => {if (point.row >= 0 && point.row < count) litPegs.add(`${point.row},${point.col}`);});
    const golden = new Set();
    for (const ball of balls) for (const pair of ball.round.gold) golden.add(`${pair[0]},${pair[1]}`);
    const radius = Math.max(2.6, Math.min(6, geometry.spacing / 8));
    for (let row = 0; row < count; row++) for (let col = 0; col <= row; col++) {
      const x = geometry.pegX(row, col), y = geometry.pegY(row);
      const gold = golden.has(`${row},${col}`);
      const hit = litPegs.has(`${row},${col}`);
      ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.arc(x + 1, y + 3, radius + 1, 0, Math.PI * 2); ctx.fill();
      if (gold) {ctx.shadowColor = '#ffd15c'; ctx.shadowBlur = 12;}
      if (hit) {ctx.fillStyle = gold ? '#ffd97a44' : '#e2d78c33'; ctx.beginPath(); ctx.arc(x, y, radius * 3, 0, Math.PI * 2); ctx.fill();}
      ctx.fillStyle = gold ? '#ffce62' : hit ? '#fff0b3' : '#c6b273';
      ctx.beginPath(); ctx.arc(x, y, hit ? radius * 1.35 : radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#f9edb9'; ctx.beginPath(); ctx.arc(x - radius * .25, y - radius * .35, Math.max(1, radius * .35), 0, Math.PI * 2); ctx.fill();
    }
    for (const flash of flashes) {
      const t = flash.age / .42;
      ctx.strokeStyle = flash.gold ? `rgba(255,214,110,${1 - t})` : `rgba(210,238,206,${(1 - t) * .6})`;
      ctx.lineWidth = 2.5 * (1 - t) + .5;
      ctx.beginPath(); ctx.arc(flash.x, flash.y, 4 + t * (flash.gold ? 26 : 15), 0, Math.PI * 2); ctx.stroke();
    }

    // 奖励槽画成一排有深度的斗：上沿是槽口的暗面，正面才写倍率。
    const slotWidth = Math.max(20, geometry.spacing - 4);
    table.forEach((value, index) => {
      const center = geometry.slotCenter(index), x = center - slotWidth / 2;
      const hit = !busy() && last?.risk === risk && last?.rows === count && last.slot === index;
      const edge = Math.abs(index - count / 2) / (count / 2);
      const tone = hit ? ['#ffeeb4', '#d8ae54'] : edge > .74 ? ['#c8713a', '#5c2f16']
        : edge > .42 ? ['#a88448', '#4a381c'] : ['#47714318', '#1c3520'].map((c, i) => i ? '#1c3520' : '#477143');
      ctx.fillStyle = '#05100a';
      ctx.fillRect(x, SLOT.mouth, slotWidth, SLOT.top - SLOT.mouth);
      const face = ctx.createLinearGradient(0, SLOT.top, 0, SLOT.bottom);
      face.addColorStop(0, tone[0]); face.addColorStop(1, tone[1]);
      ctx.fillStyle = face;
      ctx.fillRect(x, SLOT.top, slotWidth, SLOT.bottom - SLOT.top);
      if (hit) {
        ctx.save(); ctx.shadowColor = '#ffdd82'; ctx.shadowBlur = 18;
        ctx.strokeStyle = '#fff1b8'; ctx.lineWidth = 2; ctx.strokeRect(x, SLOT.top, slotWidth, SLOT.bottom - SLOT.top);
        ctx.restore();
      }
      const shown = value >= 1000 ? Math.round(value / 10) : value / 10;
      const text = `${shown}×`;
      ctx.fillStyle = hit ? '#2b2109' : '#fff3cd';
      ctx.font = `${slotWidth < 30 ? (text.length > 4 ? 10 : 12) : text.length > 4 ? 13 : 17}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillText(text, center, SLOT.top + 25);
      // 隔板：带高光的金色立边
      const wall = ctx.createLinearGradient(x - 4, 0, x, 0);
      wall.addColorStop(0, '#6b5729'); wall.addColorStop(1, '#e3c87e');
      ctx.fillStyle = wall; ctx.fillRect(x - 3, SLOT.mouth - 7, 3, SLOT.bottom - SLOT.mouth + 7);
      if (index === table.length - 1) {
        ctx.fillStyle = wall; ctx.fillRect(x + slotWidth, SLOT.mouth - 7, 3, SLOT.bottom - SLOT.mouth + 7);
      }
    });

    drawPlate();
    const focus = nudgeTarget();
    balls.forEach((ball, index) => {
      const point = points[index];
      ball.trail.forEach((step, i) => {
        ctx.globalAlpha = (i + 1) / ball.trail.length * (ball.round.charged ? .34 : .2);
        ctx.fillStyle = ball.round.charged ? '#9de8ff' : '#c8e7c6';
        ctx.beginPath(); ctx.arc(step.x, step.y, 5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      // 前 12% 的行程是「从摆板滑进钉阵」，之后交给规则层给出的路径。
      const entry = Math.min(1, ball.progress / .12);
      const x = entry < 1 ? ball.releaseX + (point.x - ball.releaseX) * entry : point.x;
      const y = entry < 1 ? PLATE.pivotY - 12 + (point.y - (PLATE.pivotY - 12)) * entry : point.y;
      if (ball === focus && balls.length > 1) {
        ctx.strokeStyle = '#a8e6ff88'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke();
      }
      drawBall(x, y, ball.round.charged);
    });
    if (!balls.length) {
      const resting = last && last.risk === risk && last.rows === rows;
      // 没有落球时，球停在摆板上跟着一起晃。
      if (resting) drawBall(geometry.slotCenter(last.slot), 480, false);
      drawBall(360 + plateOffset(clock), PLATE.pivotY - 12, energy >= ENERGY_GOAL);
    }
    drawGlass(ctx);
    floaters.draw(ctx);
    ctx.fillStyle = '#d4c190'; ctx.font = '14px "Courier New", monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${RISKS[risk].label}档 · ${count} 层钉阵 · ${count + 1} 个落点${balls.length ? ` · 盘上 ${balls.length} 颗` : ''}`, 360, 574);
    shaker.end(ctx);
  }
  /** 顶部摆板：一块带金属边的托盘，绕中心左右晃动，末端是球的出口。 */
  function drawPlate() {
    const offset = plateOffset(clock);
    const tilt = Math.cos(clock * PLATE.swing) * .13;
    ctx.save();
    ctx.translate(360 + offset, PLATE.pivotY);
    ctx.rotate(tilt);
    const body = ctx.createLinearGradient(0, -9, 0, 11);
    body.addColorStop(0, '#e6d8a4'); body.addColorStop(.45, '#8d8459'); body.addColorStop(1, '#2c2718');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-44, -8, 88, 18, 6); ctx.fill();
    ctx.strokeStyle = '#5a4d2b'; ctx.lineWidth = 1; ctx.stroke();
    // 托盘中间的凹槽，球就卡在这里
    ctx.fillStyle = '#0d120c';
    ctx.beginPath(); ctx.roundRect(-13, -6, 26, 9, 4); ctx.fill();
    ctx.restore();
    // 导轨与支架
    ctx.strokeStyle = '#8a7440'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(360 - PLATE.halfWidth - 52, PLATE.pivotY + 14);
    ctx.lineTo(360 + PLATE.halfWidth + 52, PLATE.pivotY + 14); ctx.stroke();
    ctx.strokeStyle = '#d7bd7a33'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(360 + offset, PLATE.pivotY + 14); ctx.lineTo(360, PLATE.apexY); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBall(x, y, charged) {
    ctx.shadowColor = charged ? '#8fe6ff' : '#f4e8ab'; ctx.shadowBlur = charged ? 22 : 13;
    const ball = ctx.createRadialGradient(x - 3, y - 4, 0, x, y, 9);
    if (charged) {ball.addColorStop(0, '#ffffff'); ball.addColorStop(.35, '#a8ecff'); ball.addColorStop(1, '#1d6f8c');}
    else {ball.addColorStop(0, '#fffef1'); ball.addColorStop(.35, '#e8dab1'); ball.addColorStop(1, '#847047');}
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(x, y, charged ? 9 : 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }

  function settle(ball) {
    const round = ball.round;
    last = round; tray += round.payout;
    history.unshift(round); history = history.slice(0, 8);
    energy = Math.min(ENERGY_GOAL, energy + ENERGY_PER_DROP + ENERGY_PER_GOLD * round.goldHits);
    const geometry = plinkoGeometry(round.rows);
    const ratio = round.payout / round.bet;
    floaters.push(`×${round.multiplier}`, geometry.slotCenter(round.slot), 486,
      {color: ratio >= 2 ? '#ffe07a' : ratio >= 1 ? '#d7f0cf' : '#a9b3a2', size: ratio >= 5 ? 40 : ratio >= 2 ? 30 : 22, life: 1.5, rise: 74});
    if (round.payout) floaters.push(`+${money(round.payout)} USD`, 360, 445, {color: '#ffe9a8', size: 22, life: 1.4});
    shaker.kick(clamp(ratio * 2.4, 1, 18));
    playFanfare(ratio >= 10 ? 5 : ratio >= 3 ? 4 : ratio >= 1 ? 2 : 0);
    if (ratio < 1) playThud(190);
    view.status(`${round.charged ? '深渊之球 · ' : ''}落入第 ${round.slot + 1} 槽 · ×${round.multiplier}` +
      `${round.goldHits ? `（金钉 ${round.goldHits} 枚 +${round.bonusTenths / 10}）` : ''} · 得币 ${money(round.payout)} USD` +
      `${energy >= ENERGY_GOAL ? ' · 能量已满，下一颗是深渊之球' : ''}`);
    view.submitRecords({bestPayout: round.payout, bestMultiplier: Math.round(round.multiplier * 10), bestGold: round.goldHits});
  }

  function tick(now) {
    if (!active || document.hidden) {animation = 0; return;}
    const elapsed = lastTime ? Math.min(.07, (now - lastTime) / 1000) : 0; lastTime = now;
    clock += elapsed;
    nudgeTimer += elapsed;
    if (nudge < NUDGE_MAX) {nudge = Math.min(NUDGE_MAX, nudge + elapsed / NUDGE_RECHARGE); if (nudgeTimer > .25) {nudgeTimer = 0; renderNudge();}}
    for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].age += elapsed) > .42) flashes.splice(i, 1);
    floaters.step(elapsed);
    let landed = false;
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      ball.progress += elapsed / durationFor(ball.round.rows);
      const point = plinkoPosition(ball.round, ball.progress);
      ball.trail.push(point); if (ball.trail.length > 9) ball.trail.shift();
      if (point.row !== ball.lastPin && point.row >= 0 && point.row < ball.round.rows) {
        ball.lastPin = point.row;
        const geometry = plinkoGeometry(ball.round.rows);
        const gold = ball.round.gold.some(pair => pair[0] === point.row && pair[1] === point.col);
        flashes.push({x: geometry.pegX(point.row, point.col), y: geometry.pegY(point.row), age: 0, gold});
        playClink(.85 + point.row / ball.round.rows * .9, gold ? .11 : .05);
        if (gold) {
          playTone(1250, .16, {type: 'triangle', level: .1, sweep: 1.4});
          floaters.push(`金钉 +${goldBonusTenths(ball.round.rows) / 10}`, geometry.pegX(point.row, point.col), geometry.pegY(point.row) + 26,
            {color: '#ffd979', size: 16, life: .8, rise: 26});
          shaker.kick(4);
        }
      }
      if (ball.progress >= 1) {settle(ball); balls.splice(i, 1); landed = true;}
    }
    if (landed) {persist(); render();}
    else if (balls.length && now - lastSave > 700) {persist(); lastSave = now;}
    draw(elapsed);
    // 摆板一直在晃，所以空闲时也要继续出帧。
    animation = active && !document.hidden ? requestAnimationFrame(tick) : 0;
  }
  function resume() {if (active && !document.hidden && !animation) {lastTime = 0; animation = requestAnimationFrame(tick);}}

  function drop() {
    if (!active || balls.length >= MAX_BALLS) return;
    const charged = energy >= ENERGY_GOAL;
    let round;
    try {round = createPlinkoRound({bet, risk, rows, charged}, secureRandom);}
    catch {view.status('弹珠暂时无法释放，请重试'); return;}
    if (wallet.spend(bet) !== bet) {view.status('钱包余额不足，或其他机台正在结算'); render(); return;}
    if (charged) energy = 0;
    // 摆板当时晃到哪，这颗球就从哪滑进去——连按出来的球入场点各不相同。
    balls.push({round, progress: 0, releaseX: 360 + plateOffset(clock), lastPin: -1, trail: []});
    persist(); render();
    view.status(`${charged ? '深渊之球释放 · 赔付 ×' + CHARGED_MULTIPLIER : '弹珠穿过钉阵'} · 盘上 ${balls.length} 颗`);
    playTone(charged ? 620 : 410, .12, {type: charged ? 'square' : 'sine', level: .09});
    if (charged) shaker.kick(6);
    resume();
  }
  function pushBall(direction) {
    if (!active || nudge < 1) return;
    const ball = nudgeTarget();
    if (!ball) {view.status('现在没有可以推的球'); return;}
    const target = Math.max(0, plinkoPosition(ball.round, ball.progress).row + 1);
    if (!nudgePlinkoRound(ball.round, target, direction)) {view.status(`这颗球的推球次数已用完（每颗 ${NUDGE_MAX} 次）`); renderNudge(); return;}
    nudge -= 1;
    const geometry = plinkoGeometry(ball.round.rows);
    floaters.push(direction ? '推 ▶' : '◀ 推', geometry.pegX(target, pathColumns(ball.round.directions)[target]), geometry.pegY(target) + 26,
      {color: '#a8e6ff', size: 18, life: .8, rise: 26});
    shaker.kick(5); playTone(direction ? 720 : 540, .1, {type: 'square', level: .08});
    persist(); render(); resume();
  }

  $('#plinko-drop').onclick = drop;
  $('#plinko-nudge-left').onclick = () => pushBall(0);
  $('#plinko-nudge-right').onclick = () => pushBall(1);
  view.root.querySelectorAll('[data-plinko-bet]').forEach(button => {button.onclick = () => {if (busy()) return; bet = Number(button.dataset.plinkoBet); persist(); render();};});
  view.root.querySelectorAll('[data-plinko-rows]').forEach(button => {button.onclick = () => {if (busy()) return; rows = Number(button.dataset.plinkoRows); persist(); render(); draw();};});
  view.root.querySelectorAll('[data-plinko-risk]').forEach(button => {button.onclick = () => {if (busy()) return; risk = button.dataset.plinkoRisk; persist(); render(); draw();};});
  $('.mechanical-collect').onclick = () => {
    const amount = tray; if (!amount) return;
    if (wallet.deposit(amount) !== amount) {view.status('其他机台正在结算，请稍后领取'); return;}
    tray = 0; persist(); render(); playFanfare(2); view.status(`已领取 ${money(amount)} USD 到钱包`);
  };
  wallet.subscribe(() => render());
  view.onRedraw(() => {if (active) draw();});
  document.addEventListener('visibilitychange', () => {if (document.hidden) {persist(); cancelAnimationFrame(animation); animation = 0;} else resume();});
  window.addEventListener('pagehide', persist);
  setInterval(() => {
    if (!active || document.hidden || animation || nudge >= NUDGE_MAX) return;
    nudge = Math.min(NUDGE_MAX, nudge + .5 / NUDGE_RECHARGE); renderNudge();
  }, 500);
  document.addEventListener('keydown', event => {
    if (!active || document.querySelector('dialog[open]') || event.target !== document.body) return;
    if (event.code === 'Space' || event.code === 'Enter') {event.preventDefault(); drop();}
    if (event.repeat) return;
    if (event.code === 'ArrowLeft') {event.preventDefault(); pushBall(0);}
    if (event.code === 'ArrowRight') {event.preventDefault(); pushBall(1);}
    if (event.code === 'Escape') openLobby('games');
  });
  return {
    enter() {active = true; view.enter(); render(); draw(); resume(); if (balls.length) view.status(`继续上次的 ${balls.length} 颗弹珠 · 无需再次扣费`);},
    leave() {active = false; persist(); cancelAnimationFrame(animation); animation = 0; view.leave();},
  };
}
