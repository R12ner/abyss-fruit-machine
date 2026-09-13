import {createCabinet} from '../../casino/cabinet.mjs';
import {money, readState, writeState, secureRandom} from '../../casino/storage.mjs';
import {playTone, playClink, playFanfare, playThud} from '../../casino/audio.mjs';
import {createShaker, createFloaters} from '../../casino/effects.mjs';
import {createPerspective, drawCoin, drawGlass} from '../../casino/canvas.mjs';
import {createLever, createShakeStick} from '../../casino/controls.mjs';
import {PUSHER, ZONES, TOWER, createPusherState, pusherFace, startPusherRound, stepPusher,
  tiltPusher, rechargeTilt, isPusherIdle, findTower} from './rules.mjs';

export const coinPusherGameDefinition = Object.freeze({
  id: 'coin-pusher', badge: 'MACHINE 02', title: '深渊推币机', subtitle: 'COIN PUSHER · 瞄准 · 摇台 · 收币', cardClass: 'pusher-card',
  art: `<span class="pusher-card-art" aria-hidden="true">${
    ['arcade', 'bitcoin', 'usdt'].map((coin, index) =>
      `<span class="card-coin coin-${index}" style="background-image:url('assets/coins/${coin}.png')"></span>`).join('')}</span>`,
  create: createCoinPusherGame,
});

const ZONE_WIDTH = (PUSHER.frontRight - PUSHER.frontLeft) / ZONES.length;

/** 画面分层的深度基准，全部是画布坐标。 */
const VIEW = Object.freeze({
  farY: 74,          // 机箱最里面
  deckTop: 138,      // 后墙与台面的交界
  zoneTop: 330,      // 倍率分区开始的深度
  channelTop: 350,   // 侧槽井口
  dropY: PUSHER.dropY,
  nearY: PUSHER.edge, // 前沿唇口，也是离玩家最近的一条线
  trayTop: 528, trayHeight: 48,
  plateDepth: 13,    // 推板正面的厚度
  wallFlare: 1.24,   // 机箱开口比台面宽出的比例，决定内墙的可见宽度
  // 投币摆臂：支点在画面上方之外，末端扫过 dropLeft~dropLeft+dropSpan 这一段。
  armPivotY: 44, armLength: 196,
});

/** 摆臂末端要落在目标 x 时的倾角。 */
function armAngle(targetX) {
  return Math.asin(Math.max(-1, Math.min(1, (targetX - 360) / VIEW.armLength)));
}

const perspective = createPerspective({centerX: 360, farY: VIEW.farY, nearY: VIEW.nearY, farScale: .72});
const scaleAt = y => perspective.scale(y);
/** 台面上的模型 x 投影到画布。 */
const px = (x, y) => perspective.at(x, y);
/** 机箱开口（台面之外那一圈）上的模型 x 投影到画布。 */
const wx = (x, y) => 360 + (x - 360) * perspective.scale(y) * VIEW.wallFlare;

export function createCoinPusherGame({wallet, openLobby}) {
  const key = 'abyss-coin-pusher-state-v2', saved = readState(key), state = createPusherState(saved);
  let aim = Number.isFinite(saved?.aim) ? Math.max(0, Math.min(1, saved.aim)) : .5;
  let active = false, animation = 0, lastTime = 0, accumulator = 0, lastSave = 0, tiltTimer = 0;
  let history = Array.isArray(saved?.history) ? saved.history.filter(n => Number.isSafeInteger(n) && n >= 0).slice(0, 8) : [];
  const particles = [], shaker = createShaker(), floaters = createFloaters();
  /**
   * 一次摇台可能同时推落十几枚币，一枚一条 "+1" 会把画面糊满。
   * 普通落币先攒进 burst，短暂间隔后合并成一条汇总；金币、金塔、代币和连锁仍单独弹字。
   */
  const burst = {amount: 0, sum: 0, count: 0, age: 0};
  function flushBurst() {
    if (!burst.count) return;
    floaters.push(`+${money(burst.amount)}`, burst.sum / burst.count, 468,
      {color: burst.count > 1 ? '#ffe07a' : '#dcecd6', size: burst.count > 1 ? 28 : 19, life: burst.count > 1 ? 1.3 : 1.05});
    burst.amount = 0; burst.sum = 0; burst.count = 0; burst.age = 0;
  }
  let towerBest = Number.isSafeInteger(saved?.towerBest) ? saved.towerBest : 0;

  const view = createCabinet({id: 'coin-pusher', title: '深渊推币机', english: 'THE COIN PUSHER', number: 'MACHINE 02', wallet, openLobby,
    recordFields: [
      {key: 'bestWin', label: '单局最高', format: value => `${money(value)} USD`},
      {key: 'bestChain', label: '最长连锁', format: value => `${value} 连`},
      {key: 'bestTower', label: '推落最高塔', format: value => `${value} 层`},
    ],
    controls: `<div class="mechanical-jackpot"><span>累积彩金 <small>JACKPOT</small></span><output data-jackpot>0</output>
        <p>推落一枚 ✦ 深渊代币 即可全额带走</p></div>
      <div class="mechanical-controls">
      <span class="mechanical-control-label">导板角度 <output id="pusher-aim-value">正中</output></span>
      <div id="pusher-lever-slot"></div>
      <button type="button" class="mechanical-launch" id="pusher-insert">投一枚 · 1 USD<small>INSERT COIN</small></button>
      <button type="button" class="mechanical-burst arcade-plate" id="pusher-burst">连续投 5 枚 · 5 USD</button>
      <div class="mechanical-gauge"><span class="mechanical-control-label" id="pusher-tilt-label">摇台能量 <output id="pusher-tilt-value">3 / 3</output></span>
        <div class="mechanical-gauge-bar" aria-hidden="true"><i data-tilt-fill></i></div>
        <div id="pusher-stick-slot"></div>
        <p class="mechanical-hint">按住摇杆往左右推到底触发摇台，松手自动回中；键盘 A / D 等效。</p></div>
      <div class="pusher-meters"><div><span>连锁 CHAIN</span><output data-chain>0</output></div>
        <div><span>侧槽回收</span><output data-recycle>0 / 10</output></div>
        <div><span>免费币</span><output data-free>0</output></div></div>
      <p>按住摇柄两侧扳动机内导板，硬币从导板末端滑出。中央倍率区 ×2，前沿立着金塔。</p></div>`,
    help: `<p><b>投币</b>：每枚 1 虚拟 USD。拖动滑杆或点击台面选择位置，再按投币按钮；连续投币按当前位置投入 5 枚。有免费币时优先使用免费币，不扣钱包。</p>
      <p><b>倍率区</b>：前沿分成五段，中央 ×2，其余 ×1。从哪一段掉下来就按那一段结算，所以瞄准中路更值钱、也更难推动。</p>
      <p><b>硬币种类</b>：普通币 1 USD，✦ 金币 4 USD，✦ 深渊代币本身不值钱，但推落时可以带走全部累积彩金。每投一枚币，彩金池 +2。</p>
      <p><b>连锁</b>：同一次投币里连续推落硬币会累积连锁数，每满 5 枚额外奖励 5 USD。</p>
      <p><b>摇台摇杆</b>：按住摇杆往左右推到底就会摇台一次，松手自动回中（键盘 A / D 等效）。能量满 3 格，约 11 秒回复 1 格。摇台给整堆硬币一个横向冲量，可以把卡在边上的币救回中路——但也可能把它们直接甩进侧槽。</p>
      <p><b>侧槽回收</b>：掉进左右侧槽的币不计奖，但会累积回收进度，每满 10 枚返还 5 枚免费币。</p>
      <p>奖励留在出币槽，按“领取到钱包”收取。切换游戏会暂停推板，返回后继续；刷新会恢复已保存的币堆和进行中的投币。</p>`});

  const {context: ctx, $} = view;
  const aimLabel = value => (Math.abs(value - .5) < .04 ? '正中' : `${value < .5 ? '左' : '右'} ${Math.round(Math.abs(value - .5) * 200)}%`);
  const lever = createLever({
    label: '投币导板角度', value: aim, speed: .7,
    onChange: next => {aim = next; $('#pusher-aim-value').textContent = aimLabel(next); draw(); persist();},
  });
  lever.format(aimLabel);
  $('#pusher-lever-slot').append(lever.element);
  // 摇台是"点动"操作，所以用带回中弹簧的摇杆，而不是像导板那样停在扳过去的角度。
  const stick = createShakeStick({label: '摇台摇杆', onShake: direction => tilt(direction)});
  $('#pusher-stick-slot').append(stick.element);
  const persist = () => writeState(key, {...state, settle: 0, aim, history, towerBest});

  function render() {
    const free = state.free;
    view.update({tray: state.tray, win: state.lastWin, busy: !!state.pending});
    $('#pusher-insert').disabled = !!state.pending || (free < 1 && wallet.balance() < 1) || state.coins.length >= PUSHER.maxCoins;
    $('#pusher-burst').disabled = !!state.pending || (free < 5 && wallet.balance() < 5) || state.coins.length > PUSHER.maxCoins - 5;
    $('#pusher-insert').innerHTML = `投一枚 · ${free >= 1 ? '免费币' : '1 USD'}<small>INSERT COIN</small>`;
    $('#pusher-burst').textContent = `连续投 5 枚 · ${free >= 5 ? '免费币' : '5 USD'}`;
    lever.disable(!!state.pending);
    $('#pusher-aim-value').textContent = aimLabel(aim);
    $('[data-jackpot]').textContent = money(state.jackpot);
    $('[data-chain]').textContent = String(state.chain);
    $('[data-recycle]').textContent = `${state.recycled} / ${PUSHER.recycleGoal}`;
    $('[data-free]').textContent = String(free);
    $('[data-history]').innerHTML = history.length ? history.map(win => `<b class="${win ? '' : 'lost'}">+${win}</b>`).join('') : '还没有游戏记录';
    renderTilt();
  }
  function renderTilt() {
    const charges = Math.floor(state.tilt);
    $('#pusher-tilt-value').textContent = `${charges} / ${PUSHER.tiltMax}`;
    $('[data-tilt-fill]').style.width = `${state.tilt / PUSHER.tiltMax * 100}%`;
    stick.disable(charges < 1);
  }

  /* ---------- 画面 ----------
   * 台面用单点透视绘制：越靠近画面下方（离玩家越近）越宽，硬币也按深度缩放，
   * 再加上左右内墙、后墙凹槽和前沿唇口的落差，看起来才像在往机箱"里面"看。
   * 物理模型仍使用未投影的坐标，这里只做绘制变换。
   */
  function draw(dt = 0) {
    shaker.begin(ctx, dt);
    const face = pusherFace(state);
    drawShell();
    drawBackWall(face);
    drawSideWalls();
    drawDeck();
    drawSideChannels();
    drawPlate(face);
    drawPile();
    drawDeflector();
    drawTowerPanel();
    drawFrontLip();
    drawTray();
    for (const particle of particles) {
      drawCoin(ctx, px(particle.x, particle.y), particle.y + particle.age ** 2 * 290,
        PUSHER.radius * scaleAt(particle.y), view.coins, Math.max(0, 1 - particle.age / .65), particle.kind);
    }
    drawGlass(ctx);
    floaters.draw(ctx);
    drawReadout();
    shaker.end(ctx);
  }

  /** 机箱内壁的底色与顶部压暗。外面的木框由 .mechanical-cabinet 提供，这里不再重复。 */
  function drawShell() {
    ctx.fillStyle = '#030a07';
    ctx.fillRect(0, 0, 720, 600);
    const ceiling = ctx.createLinearGradient(0, 0, 0, VIEW.deckTop);
    ceiling.addColorStop(0, '#000000cc'); ceiling.addColorStop(1, '#00000000');
    ctx.fillStyle = ceiling; ctx.fillRect(0, 0, 720, VIEW.deckTop);
  }

  /** 后墙：推板从这里伸出来，上方留一道压暗的顶盖。 */
  function drawBackWall(face) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(wx(PUSHER.left, VIEW.farY), VIEW.farY);
    ctx.lineTo(wx(PUSHER.right, VIEW.farY), VIEW.farY);
    ctx.lineTo(px(PUSHER.right, VIEW.deckTop), VIEW.deckTop);
    ctx.lineTo(px(PUSHER.left, VIEW.deckTop), VIEW.deckTop);
    ctx.closePath();
    const wall = ctx.createLinearGradient(0, VIEW.farY, 0, VIEW.deckTop);
    wall.addColorStop(0, '#020604'); wall.addColorStop(.55, '#10251a'); wall.addColorStop(1, '#1b3c2a');
    ctx.fillStyle = wall; ctx.fill();
    // 推板出口：一道比后墙更深的横槽
    ctx.beginPath();
    ctx.moveTo(px(PUSHER.left + 4, VIEW.deckTop - 17), VIEW.deckTop - 17);
    ctx.lineTo(px(PUSHER.right - 4, VIEW.deckTop - 17), VIEW.deckTop - 17);
    ctx.lineTo(px(PUSHER.right - 4, VIEW.deckTop), VIEW.deckTop);
    ctx.lineTo(px(PUSHER.left + 4, VIEW.deckTop), VIEW.deckTop);
    ctx.closePath();
    ctx.fillStyle = '#010402'; ctx.fill();
    ctx.restore();
  }

  /** 左右内墙：台面边缘与机箱开口之间的那层斜面，纵深感主要来自这里。 */
  function drawSideWalls() {
    for (const side of [-1, 1]) {
      const edge = side < 0 ? PUSHER.left : PUSHER.right;
      ctx.beginPath();
      ctx.moveTo(wx(edge, VIEW.deckTop), VIEW.deckTop);
      ctx.lineTo(px(edge, VIEW.deckTop), VIEW.deckTop);
      ctx.lineTo(px(edge, VIEW.nearY), VIEW.nearY);
      ctx.lineTo(wx(edge, VIEW.nearY), VIEW.nearY);
      ctx.closePath();
      const near = px(edge, VIEW.nearY), far = wx(edge, VIEW.nearY);
      const shade = ctx.createLinearGradient(Math.min(near, far), 0, Math.max(near, far), 0);
      const bright = side < 0 ? ['#0b1a12', '#2d5540'] : ['#2d5540', '#0b1a12'];
      shade.addColorStop(0, bright[0]); shade.addColorStop(1, bright[1]);
      ctx.fillStyle = shade; ctx.fill();
      ctx.strokeStyle = '#d7bd7a55'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  /** 绿绒台面与前沿的五个倍率分区。 */
  function drawDeck() {
    perspective.trapezoid(ctx, PUSHER.left, PUSHER.right, VIEW.deckTop, VIEW.nearY);
    const bed = ctx.createLinearGradient(0, VIEW.deckTop, 0, VIEW.nearY);
    bed.addColorStop(0, '#143628'); bed.addColorStop(.55, '#1f5540'); bed.addColorStop(1, '#2b6b50');
    ctx.fillStyle = bed; ctx.fill();
    ctx.save();
    ctx.clip();
    ZONES.forEach((multiplier, index) => {
      const left = PUSHER.frontLeft + index * ZONE_WIDTH;
      perspective.trapezoid(ctx, left, left + ZONE_WIDTH, VIEW.zoneTop, VIEW.nearY);
      const tint = ctx.createLinearGradient(0, VIEW.zoneTop, 0, VIEW.nearY);
      if (multiplier > 1) {tint.addColorStop(0, '#6b511c55'); tint.addColorStop(1, '#a87f24aa');}
      else {tint.addColorStop(0, '#1e3f2c44'); tint.addColorStop(1, '#2a5a3f66');}
      ctx.fillStyle = tint; ctx.fill();
      if (index) {
        ctx.strokeStyle = '#f3dda355'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px(left, VIEW.zoneTop), VIEW.zoneTop);
        ctx.lineTo(px(left, VIEW.nearY), VIEW.nearY);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  /** 侧槽：台面两侧向下塌陷的深井，币掉进去只计回收。 */
  function drawSideChannels() {
    for (const [outer, inner] of [[PUSHER.left, PUSHER.frontLeft], [PUSHER.right, PUSHER.frontRight]]) {
      perspective.trapezoid(ctx, Math.min(outer, inner), Math.max(outer, inner), VIEW.channelTop, VIEW.nearY + 4);
      const well = ctx.createLinearGradient(0, VIEW.channelTop, 0, VIEW.nearY);
      well.addColorStop(0, '#132a1e'); well.addColorStop(.22, '#040b07'); well.addColorStop(1, '#020604');
      ctx.fillStyle = well; ctx.fill();
      ctx.strokeStyle = '#bda66388'; ctx.lineWidth = 1.4; ctx.stroke();
      // 井口内壁的一道高光，强调这里是往下掉的
      ctx.beginPath();
      ctx.moveTo(px(inner, VIEW.channelTop), VIEW.channelTop);
      ctx.lineTo(px(inner, VIEW.nearY), VIEW.nearY);
      ctx.strokeStyle = '#8fc4a355'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }

  /** 推板：顶面加正面两块，正面的厚度让它像一块真的在推的铁板。 */
  function drawPlate(face) {
    const top = VIEW.deckTop - 8;
    perspective.trapezoid(ctx, PUSHER.left + 3, PUSHER.right - 3, top, face);
    const deck = ctx.createLinearGradient(0, top, 0, face);
    deck.addColorStop(0, '#20271c'); deck.addColorStop(.6, '#444a33'); deck.addColorStop(1, '#6d6d4c');
    ctx.fillStyle = deck; ctx.fill();
    // 拉丝纹理
    ctx.save(); ctx.clip();
    ctx.strokeStyle = '#ced4a218'; ctx.lineWidth = 1;
    for (let x = PUSHER.left; x < PUSHER.right; x += 22) {
      ctx.beginPath(); ctx.moveTo(px(x, top), top); ctx.lineTo(px(x, face), face); ctx.stroke();
    }
    ctx.restore();
    // 正面立边
    const lip = face + VIEW.plateDepth;
    ctx.beginPath();
    ctx.moveTo(px(PUSHER.left + 3, face), face);
    ctx.lineTo(px(PUSHER.right - 3, face), face);
    ctx.lineTo(px(PUSHER.right - 3, lip), lip);
    ctx.lineTo(px(PUSHER.left + 3, lip), lip);
    ctx.closePath();
    const front = ctx.createLinearGradient(0, face, 0, lip);
    front.addColorStop(0, '#f4e4ab'); front.addColorStop(.35, '#8e814f'); front.addColorStop(1, '#191409');
    ctx.fillStyle = front; ctx.fill();
    ctx.strokeStyle = '#00000088'; ctx.lineWidth = 1; ctx.stroke();
  }

  /** 币堆：先按深度排序再画，近处的币才会压住远处的币。 */
  function drawPile() {
    const sorted = [...state.coins].sort((a, b) => a.y - b.y);
    let tower = null;
    for (const coin of sorted) {
      if (coin.kind === 'tower') {tower = coin; continue;}
      const scale = scaleAt(coin.y);
      drawCoin(ctx, px(coin.x, coin.y), coin.y, PUSHER.radius * scale, view.coins, 1, coin.kind, PUSHER.radius * .45 * scale);
    }
    // 塔是台面上最高的东西，最后画，永远不会被周围的币盖住。
    if (tower) drawTower(px(tower.x, tower.y), tower.y, tower.height, scaleAt(tower.y));
  }

  /** 金塔：一摞立着的金币，自下而上画，顶上加一圈光。 */
  function drawTower(screenX, y, height, scale, alpha = 1) {
    const radius = PUSHER.radius * scale, layer = radius * .66;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 塔底的金色光圈：即使塔被推走，也看得出这一格是塔位
    ctx.strokeStyle = '#ffd97788'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(screenX, y + radius * .5, radius * 1.5, radius * .6, 0, 0, Math.PI * 2); ctx.stroke();
    // 光柱
    const column = ctx.createLinearGradient(0, y - height * layer - 26, 0, y + radius);
    column.addColorStop(0, '#ffd97700'); column.addColorStop(.55, '#ffd97726'); column.addColorStop(1, '#ffd97700');
    ctx.fillStyle = column;
    ctx.fillRect(screenX - radius * 1.5, y - height * layer - 26, radius * 3, height * layer + 26 + radius);
    ctx.fillStyle = '#00000055';
    ctx.beginPath(); ctx.ellipse(screenX + radius * .2, y + layer + radius * .34, radius * 1.15, radius * .46, 0, 0, Math.PI * 2); ctx.fill();
    for (let level = 0; level < height; level++) {
      drawCoin(ctx, screenX, y - level * layer, radius, view.coins, 1, 'gold', layer);
    }
    const crown = y - (height - 1) * layer;
    ctx.shadowColor = '#ffd977'; ctx.shadowBlur = 16 * scale;
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(screenX, crown, radius * .82, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(15 * scale)}px Georgia, serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = '#0c1409';
    ctx.strokeText(`${height} 层`, screenX, crown - radius * 1.5);
    ctx.fillStyle = '#fff3c8';
    ctx.fillText(`${height} 层`, screenX, crown - radius * 1.5);
    ctx.restore();
  }

  /**
   * 金塔显示器：塔被推走后先滚数字，滚定后一层层把新塔叠回原位。
   * 叠的过程直接画在塔位上，所以能看见它一层层长出来。
   */
  function drawTowerPanel() {
    const roll = state.towerRoll;
    if (!roll) return;
    const homeX = px(TOWER.homeX, TOWER.homeY), scale = scaleAt(TOWER.homeY);
    if (roll.phase === 'stacking' && roll.placed > 0) drawTower(homeX, TOWER.homeY, roll.placed, scale, .92);
    const panelY = 268;
    ctx.save();
    ctx.fillStyle = '#05100a';
    ctx.beginPath(); ctx.roundRect(292, panelY, 136, 62, 9); ctx.fill();
    ctx.strokeStyle = '#c8a95d'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9a8a5c'; ctx.font = '10px "Courier New", monospace';
    ctx.fillText('NEXT TOWER', 360, panelY + 16);
    const shown = roll.phase === 'rolling'
      ? TOWER.minHeight + Math.floor(Math.random() * (TOWER.maxHeight - TOWER.minHeight + 1))
      : roll.target;
    ctx.shadowColor = '#ffd977'; ctx.shadowBlur = 14;
    ctx.fillStyle = roll.phase === 'rolling' ? '#ffe9a8' : '#8ff0ff';
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.fillText(String(shown), 360, panelY + 50);
    ctx.shadowBlur = 0;
    if (roll.phase === 'stacking') {
      ctx.fillStyle = '#7f9b84'; ctx.font = '11px "Courier New", monospace';
      ctx.fillText(`${roll.placed} / ${roll.target}`, 360, panelY + 76);
    }
    ctx.restore();
  }

  /**
   * 投币导板：支点在画面上方之外的一条摆臂，末端带一段出币口。
   * 摇柄扳到哪，末端就指到哪，硬币正是从末端那个口滑下去的。
   */
  function drawDeflector() {
    const targetX = PUSHER.dropLeft + aim * PUSHER.dropSpan;
    const angle = armAngle(targetX);
    const tipX = 360 + VIEW.armLength * Math.sin(angle);
    const tipY = VIEW.armPivotY + VIEW.armLength * Math.cos(angle);
    ctx.save();
    // 顶部机壳，摆臂从里面伸出来
    const housing = ctx.createLinearGradient(0, 0, 0, 52);
    housing.addColorStop(0, '#131a12'); housing.addColorStop(1, '#05090600');
    ctx.fillStyle = housing; ctx.fillRect(0, 0, 720, 52);
    // 摆臂扫过的弧线刻度
    ctx.strokeStyle = '#d7bd7a2e'; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.arc(360, VIEW.armPivotY, VIEW.armLength,
      armAngle(PUSHER.dropLeft) - Math.PI / 2, armAngle(PUSHER.dropLeft + PUSHER.dropSpan) - Math.PI / 2);
    ctx.stroke(); ctx.setLineDash([]);
    // 摆臂本体
    ctx.translate(360, VIEW.armPivotY);
    ctx.rotate(angle);
    const arm = ctx.createLinearGradient(-18, 0, 18, 0);
    arm.addColorStop(0, '#2b3122'); arm.addColorStop(.4, '#8d8459'); arm.addColorStop(.58, '#e6d8a4'); arm.addColorStop(1, '#343023');
    ctx.fillStyle = arm;
    ctx.beginPath(); ctx.roundRect(-17, 14, 34, VIEW.armLength - 22, 9); ctx.fill();
    ctx.strokeStyle = '#00000077'; ctx.lineWidth = 1; ctx.stroke();
    // 末端出币斗
    ctx.fillStyle = '#0a0f09';
    ctx.beginPath(); ctx.roundRect(-22, VIEW.armLength - 26, 44, 32, 8); ctx.fill();
    ctx.strokeStyle = '#e3c478'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#e3c47844';
    ctx.beginPath(); ctx.ellipse(0, VIEW.armLength - 9, 14, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 支点：看得见的黄铜轴，摆臂绕它转
    ctx.fillStyle = '#1b2018';
    ctx.beginPath(); ctx.arc(360, VIEW.armPivotY, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b79a56'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#d9c98f';
    ctx.beginPath(); ctx.arc(360, VIEW.armPivotY, 9, 0, Math.PI * 2); ctx.fill();
    // 出币斗到台面的落点提示
    ctx.strokeStyle = '#ffe3a166'; ctx.lineWidth = 1; ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.moveTo(tipX, tipY + 10); ctx.lineTo(px(targetX, VIEW.nearY), VIEW.nearY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9d8a5c'; ctx.font = '12px "Courier New", monospace'; ctx.textAlign = 'left';
    ctx.fillText('投 币 导 板', 22, 28);
    ctx.textAlign = 'center';
  }

  /** 前沿：金色唇口加倍率标尺，永远不会被币堆遮住。 */
  function drawFrontLip() {
    const top = VIEW.nearY, bottom = VIEW.nearY + 30;
    ctx.beginPath();
    ctx.moveTo(px(PUSHER.left, top), top);
    ctx.lineTo(px(PUSHER.right, top), top);
    ctx.lineTo(wx(PUSHER.right, bottom), bottom);
    ctx.lineTo(wx(PUSHER.left, bottom), bottom);
    ctx.closePath();
    const rim = ctx.createLinearGradient(0, top, 0, bottom);
    rim.addColorStop(0, '#f0d590'); rim.addColorStop(.35, '#9a7f46'); rim.addColorStop(1, '#2b2213');
    ctx.fillStyle = rim; ctx.fill();
    ZONES.forEach((multiplier, index) => {
      const left = PUSHER.frontLeft + index * ZONE_WIDTH, right = left + ZONE_WIDTH;
      const y = top + 4, height = 21;
      ctx.beginPath();
      ctx.moveTo(px(left + 1, y), y); ctx.lineTo(px(right - 1, y), y);
      ctx.lineTo(px(right - 1, y + height), y + height); ctx.lineTo(px(left + 1, y + height), y + height);
      ctx.closePath();
      ctx.fillStyle = multiplier > 1 ? '#6d4f14' : '#1d2416'; ctx.fill();
      ctx.fillStyle = multiplier > 1 ? '#ffe9a6' : '#9fb79f';
      ctx.font = `${multiplier > 1 ? 'bold 17' : '14'}px Georgia, serif`; ctx.textAlign = 'center';
      ctx.fillText(`×${multiplier}`, px((left + right) / 2, y + height), y + height - 4);
    });
    ctx.fillStyle = '#8ba07f'; ctx.font = '11px "Courier New", monospace';
    ctx.fillText('侧槽', px((PUSHER.left + PUSHER.frontLeft) / 2, top + 18), top + 20);
    ctx.fillText('侧槽', px((PUSHER.right + PUSHER.frontRight) / 2, top + 18), top + 20);
  }

  /** 出币槽：机箱下方的独立溜槽，不参与台面透视。 */
  function drawTray() {
    const {trayTop: top, trayHeight: height} = VIEW;
    const chute = ctx.createLinearGradient(0, top - 8, 0, top + height);
    chute.addColorStop(0, '#2b2213'); chute.addColorStop(.18, '#0a0f0a'); chute.addColorStop(1, '#020604');
    ctx.fillStyle = chute; ctx.fillRect(96, top - 8, 528, height + 8);
    ctx.strokeStyle = '#8a7440'; ctx.lineWidth = 2; ctx.strokeRect(96, top - 8, 528, height + 8);
    ctx.strokeStyle = '#e0c17744'; ctx.lineWidth = 1; ctx.strokeRect(99, top - 5, 522, height + 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(97, top - 7, 526, height + 6); ctx.clip();
    if (state.tray) {
      for (let i = 0; i < Math.min(state.tray, 28); i++) {
        drawCoin(ctx, 127 + (i % 17) * 28, top + 34 - Math.floor(i / 17) * 10, 13, view.coins, 1, 'normal', 5);
      }
    } else {
      ctx.fillStyle = '#3f4a3a'; ctx.font = '13px "Courier New", monospace'; ctx.textAlign = 'center';
      ctx.fillText('C O I N   O U T', 360, top + height / 2 + 4);
    }
    ctx.restore();
  }

  function drawReadout() {
    ctx.fillStyle = '#dac181';
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`彩金 ${money(state.jackpot)} USD · 连锁 ${state.chain} · 免费币 ${state.free}`, 360, 592);
  }

  function handle(event) {
    if (event.type === 'insert') {
      playClink(event.kind === 'normal' ? .85 + Math.random() * .35 : 1.5);
      if (event.kind !== 'normal') playTone(event.kind === 'token' ? 1180 : 900, .16, {type: 'triangle', level: .09});
      return;
    }
    if (event.type === 'tower-roll') {
      playTone(980, .12, {type: 'square', level: .1});
      view.status(`显示器滚出 ${event.target} —— 正在重新叠塔`);
      return;
    }
    if (event.type === 'tower-stack') {
      // 一层一响，越叠越高音调越高。
      playTone(560 + event.level * 70, .07, {type: 'square', level: .09, sweep: 1});
      return;
    }
    if (event.type === 'tower-ready') {
      playFanfare(2); shaker.kick(4);
      floaters.push(`新塔 ×${event.height}`, px(TOWER.homeX, TOWER.homeY), TOWER.homeY - 40,
        {color: '#ffe07a', size: 24, life: 1.2});
      view.status(`新的 ${event.height} 层金塔已就位`);
      return;
    }
    if (event.type === 'lost') {
      particles.push({...event, age: 0});
      playThud(150 + Math.random() * 30);
      if (event.tower) {
        floaters.push(`金塔滑进侧槽`, event.x < 360 ? 190 : 530, 400, {color: '#c9b78a', size: 22});
        shaker.kick(8);
      }
      if (event.refund) {
        floaters.push(`回收 +${event.refund} 免费币`, event.x < 360 ? 200 : 520, 436, {color: '#9fe6c0', size: 20});
        playFanfare(1); shaker.kick(4);
      }
      return;
    }
    if (event.type === 'win') {
      particles.push({...event, age: 0});
      if (event.jackpot) {
        floaters.push(`JACKPOT +${money(event.jackpot)}`, event.x, 452, {color: '#8ff0ff', size: 30, life: 1.8, rise: 96});
        playFanfare(5); shaker.kick(17);
      } else if (event.tower) {
        floaters.push(`金塔 ×${event.tower} +${money(event.amount)}`, event.x, 448,
          {color: '#ffe07a', size: 32, life: 1.7, rise: 88});
        playFanfare(4); shaker.kick(14);
        towerBest = Math.max(towerBest, event.tower);
      } else if (event.kind === 'gold') {
        floaters.push(`金币 +${event.amount}`, event.x, 416, {color: '#ffe07a', size: 24});
        playTone(1150, .1, {level: .1});
        shaker.kick(5);
      } else {
        burst.amount += event.amount; burst.sum += event.x; burst.count++; burst.age = 0;
        playTone(850 + event.multiplier * 90, .1, {level: .1});
        shaker.kick(1.6);
      }
      if (event.chainBonus) {
        floaters.push(`连锁 ×${event.chain} +${event.chainBonus}`, 360, 396, {color: '#ffc978', size: 24, life: 1.4});
        playFanfare(2); shaker.kick(7);
      }
      return;
    }
    if (event.type === 'complete') {
      flushBurst();
      history.unshift(state.lastWin); history = history.slice(0, 8);
      view.submitRecords({bestWin: state.lastWin, bestChain: state.bestChain, bestTower: towerBest});
      view.status(state.lastWin
        ? `推落 ${money(state.lastWin)} USD · 最长连锁 ${event.chain} · 出币槽 ${money(state.tray)} USD`
        : '推板已归位 · 试试摇台或换个位置继续推进币堆');
    }
  }

  function tick(now) {
    if (!active || document.hidden) {animation = 0; return;}
    const elapsed = lastTime ? Math.min(.06, (now - lastTime) / 1000) : 0; lastTime = now;
    accumulator += elapsed; tiltTimer += elapsed;
    let changed = false;
    while (accumulator >= 1 / 120) {
      for (const event of stepPusher(state, 1 / 120)) {changed = true; handle(event);}
      accumulator -= 1 / 120;
    }
    if (rechargeTilt(state, elapsed) && tiltTimer > .25) {tiltTimer = 0; renderTilt();}
    for (let i = particles.length - 1; i >= 0; i--) if ((particles[i].age += elapsed) > .65) particles.splice(i, 1);
    if (burst.count && (burst.age += elapsed) > .16) flushBurst();
    floaters.step(elapsed);
    if (changed) {persist(); render();}
    else if (state.pending && now - lastSave > 700) {persist(); lastSave = now;}
    draw(elapsed);
    animation = state.pending || particles.length || floaters.length || burst.count || shaker.active || state.settle > 0
      ? requestAnimationFrame(tick) : 0;
  }
  function resume() {if (active && !document.hidden && !animation) {lastTime = 0; animation = requestAnimationFrame(tick);}}

  function insert(count) {
    if (!active || state.pending || state.coins.length + count > PUSHER.maxCoins) return;
    const usingFree = state.free >= count;
    if (usingFree) state.free -= count;
    else if (wallet.spend(count) !== count) {view.status('钱包余额不足，或其他机台正在结算'); render(); return;}
    startPusherRound(state, count, aim, secureRandom); persist(); render();
    view.status(`${usingFree ? '使用免费币 · ' : ''}${count === 1 ? '硬币落下' : '连续投入 5 枚'} · 推板正在前进`);
    resume();
  }
  function tilt(direction) {
    if (!active || !tiltPusher(state, direction)) return false;
    shaker.kick(11); playThud(96); playClink(.7, .1);
    floaters.push(direction < 0 ? '◀ 摇台' : '摇台 ▶', 360, 300, {color: '#ffd9a0', size: 26, life: .8, rise: 30});
    view.status('机台晃动 · 币堆正在重新落位');
    persist(); render(); resume();
    return true;
  }

  $('#pusher-insert').onclick = () => insert(1);
  $('#pusher-burst').onclick = () => insert(5);
  view.canvas.addEventListener('pointerdown', event => {
    if (state.pending) return;
    const rect = view.canvas.getBoundingClientRect();
    const modelX = perspective.unproject((event.clientX - rect.left) / rect.width * 720, VIEW.dropY);
    lever.set(Math.max(0, Math.min(1, (modelX - PUSHER.dropLeft) / PUSHER.dropSpan)));
    render();
  });
  $('.mechanical-collect').onclick = () => {
    const amount = state.tray; if (!amount || state.pending) return;
    if (wallet.deposit(amount) !== amount) {view.status('其他机台正在结算，请稍后领取'); return;}
    state.tray = 0; persist(); render(); draw(); playFanfare(2); view.status(`已领取 ${money(amount)} USD 到钱包`);
  };
  wallet.subscribe(() => render());
  document.addEventListener('visibilitychange', () => {if (document.hidden) {persist(); cancelAnimationFrame(animation); animation = 0;} else resume();});
  window.addEventListener('pagehide', persist);
  view.coins.onload = () => {if (active) draw();};
  view.onRedraw(() => {if (active) draw();});
  // 空闲时也让摇台能量缓慢回复。
  setInterval(() => {
    if (!active || document.hidden || animation) return;
    rechargeTilt(state, .5); renderTilt();
  }, 500);
  document.addEventListener('keydown', event => {
    if (!active || document.querySelector('dialog[open]') || event.target !== document.body || event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') {event.preventDefault(); insert(1);}
    if (event.code === 'ArrowLeft') {event.preventDefault(); lever.hold(-1);}
    if (event.code === 'ArrowRight') {event.preventDefault(); lever.hold(1);}
    if (event.code === 'KeyA') {event.preventDefault(); stick.pulse(-1);}
    if (event.code === 'KeyD') {event.preventDefault(); stick.pulse(1);}
    if (event.code === 'KeyA') {event.preventDefault(); tilt(-1);}
    if (event.code === 'KeyD') {event.preventDefault(); tilt(1);}
    if (event.code === 'Escape') openLobby('games');
  });
  document.addEventListener('keyup', event => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') lever.release();
  });
  return {
    enter() {active = true; view.enter(); render(); draw(); if (!isPusherIdle(state)) {view.status('继续上次投币 · 推板运行中'); resume();}},
    leave() {active = false; persist(); cancelAnimationFrame(animation); animation = 0; accumulator = 0; view.leave();},
  };
}
