import {createFrame, drawCoin, drawFelt, money, readState, writeState, playTone, playClink,
  playFanfare, playThud, secureRandom, createShaker, createFloaters} from '../mechanical/shared.mjs';
import {PUSHER, ZONES, createPusherState, pusherFace, startPusherRound, stepPusher,
  tiltPusher, rechargeTilt, isPusherIdle} from './model.mjs';

export const coinPusherGameDefinition = Object.freeze({
  id: 'coin-pusher', badge: 'MACHINE 02', title: '深渊推币机', subtitle: 'COIN PUSHER · 瞄准 · 摇台 · 收币', cardClass: 'pusher-card',
  art: '<span class="mechanical-card-art" aria-hidden="true"><img src="assets/coin-pusher/machine.svg" alt=""></span>',
  create: createCoinPusherGame,
});

const ZONE_WIDTH = (PUSHER.frontRight - PUSHER.frontLeft) / ZONES.length;
const ZONE_TINT = ['#2c4a33', '#2c4a33', '#7a5a1d', '#2c4a33', '#2c4a33'];

export function createCoinPusherGame({wallet, openLobby}) {
  const key = 'abyss-coin-pusher-state-v2', saved = readState(key), state = createPusherState(saved);
  let aim = Number.isFinite(saved?.aim) ? Math.max(0, Math.min(1, saved.aim)) : .5;
  let active = false, animation = 0, lastTime = 0, accumulator = 0, lastSave = 0, tiltTimer = 0;
  let history = Array.isArray(saved?.history) ? saved.history.filter(n => Number.isSafeInteger(n) && n >= 0).slice(0, 8) : [];
  const particles = [], shaker = createShaker(), floaters = createFloaters();

  const view = createFrame({id: 'coin-pusher', title: '深渊推币机', english: 'THE COIN PUSHER', number: 'MACHINE 02', wallet, openLobby,
    controls: `<div class="mechanical-jackpot"><span>累积彩金 <small>JACKPOT</small></span><output data-jackpot>0</output>
        <p>推落一枚 ✦ 深渊代币 即可全额带走</p></div>
      <div class="mechanical-controls"><label class="mechanical-control-label" for="pusher-aim">投币位置 <output id="pusher-aim-value">正中</output></label>
      <input id="pusher-aim" type="range" min="0" max="100" step="1" value="50" aria-label="选择推币机投币位置"><div class="mechanical-control-ends"><span>左</span><span>右</span></div>
      <button type="button" class="mechanical-launch" id="pusher-insert">投一枚 · 1 USD<small>INSERT COIN</small></button>
      <button type="button" class="mechanical-burst" id="pusher-burst">连续投 5 枚 · 5 USD</button>
      <div class="pusher-tilt"><span class="mechanical-control-label" id="pusher-tilt-label">摇台能量 <output id="pusher-tilt-value">3 / 3</output></span>
        <div class="pusher-tilt-bar" aria-hidden="true"><i data-tilt-fill></i></div>
        <div class="pusher-tilt-row" role="group" aria-labelledby="pusher-tilt-label">
          <button type="button" id="pusher-tilt-left">◀ 左摇</button><button type="button" id="pusher-tilt-right">右摇 ▶</button></div></div>
      <div class="pusher-meters"><div><span>连锁 CHAIN</span><output data-chain>0</output></div>
        <div><span>侧槽回收</span><output data-recycle>0 / 10</output></div>
        <div><span>免费币</span><output data-free>0</output></div></div>
      <p>点击台面或拖动滑杆瞄准。中央倍率区 ×2，落进侧槽会累积回收，满 10 枚返还 5 枚免费币。</p></div>`,
    help: `<p><b>投币</b>：每枚 1 虚拟 USD。拖动滑杆或点击台面选择位置，再按投币按钮；连续投币按当前位置投入 5 枚。有免费币时优先使用免费币，不扣钱包。</p>
      <p><b>倍率区</b>：前沿分成五段，中央 ×2，其余 ×1。从哪一段掉下来就按那一段结算，所以瞄准中路更值钱、也更难推动。</p>
      <p><b>硬币种类</b>：普通币 1 USD，✦ 金币 4 USD，✦ 深渊代币本身不值钱，但推落时可以带走全部累积彩金。每投一枚币，彩金池 +2。</p>
      <p><b>连锁</b>：同一次投币里连续推落硬币会累积连锁数，每满 5 枚额外奖励 5 USD。</p>
      <p><b>摇台</b>：能量满 3 格，约 11 秒回复 1 格。左右摇台会给整堆硬币一个横向冲量，可以把卡在边上的币救回中路——但也可能把它们直接甩进侧槽。</p>
      <p><b>侧槽回收</b>：掉进左右侧槽的币不计奖，但会累积回收进度，每满 10 枚返还 5 枚免费币。</p>
      <p>奖励留在出币槽，按“领取到钱包”收取。切换游戏会暂停推板，返回后继续；刷新会恢复已保存的币堆和进行中的投币。</p>`});

  const {context: ctx, $} = view;
  const slider = $('#pusher-aim'); slider.value = Math.round(aim * 100);
  const persist = () => writeState(key, {...state, settle: 0, aim, history});

  function render() {
    const free = state.free;
    view.update({tray: state.tray, win: state.lastWin, busy: !!state.pending});
    $('#pusher-insert').disabled = !!state.pending || (free < 1 && wallet.balance() < 1) || state.coins.length >= PUSHER.maxCoins;
    $('#pusher-burst').disabled = !!state.pending || (free < 5 && wallet.balance() < 5) || state.coins.length > PUSHER.maxCoins - 5;
    $('#pusher-insert').innerHTML = `投一枚 · ${free >= 1 ? '免费币' : '1 USD'}<small>INSERT COIN</small>`;
    $('#pusher-burst').textContent = `连续投 5 枚 · ${free >= 5 ? '免费币' : '5 USD'}`;
    slider.disabled = !!state.pending;
    $('#pusher-aim-value').textContent = Math.abs(aim - .5) < .04 ? '正中' : `${aim < .5 ? '左' : '右'} ${Math.round(Math.abs(aim - .5) * 200)}%`;
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
    $('#pusher-tilt-left').disabled = $('#pusher-tilt-right').disabled = charges < 1;
  }

  function draw(dt = 0) {
    drawFelt(ctx);
    shaker.begin(ctx, dt);
    const face = pusherFace(state);
    ctx.fillStyle = '#040a07'; ctx.fillRect(65, 88, 590, 426);
    const bed = ctx.createLinearGradient(0, 190, 0, 500); bed.addColorStop(0, '#20432f'); bed.addColorStop(1, '#296148');
    ctx.fillStyle = bed; ctx.fillRect(84, 166, 552, 326);
    // 前沿倍率区：台面上用竖线分区，币堆盖不住的前沿唇口再标一次倍率。
    ctx.save();
    ctx.setLineDash([6, 6]);
    ZONES.forEach((multiplier, index) => {
      const x = PUSHER.frontLeft + index * ZONE_WIDTH;
      ctx.fillStyle = ZONE_TINT[index] + (multiplier > 1 ? 'bb' : '55');
      ctx.fillRect(x, 330, ZONE_WIDTH, 162);
      if (index) {
        ctx.strokeStyle = '#f3dda366'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x, 492); ctx.stroke();
      }
    });
    ctx.restore();
    ctx.strokeStyle = '#c5a45c'; ctx.lineWidth = 3; ctx.strokeRect(83, 85, 554, 426);
    // 侧槽
    ctx.fillStyle = '#060d08';
    ctx.fillRect(85, 350, PUSHER.frontLeft - 85, 144);
    ctx.fillRect(PUSHER.frontRight, 350, 636 - PUSHER.frontRight, 144);
    ctx.strokeStyle = '#3c4a38'; ctx.lineWidth = 1;
    ctx.strokeRect(85.5, 350.5, PUSHER.frontLeft - 86, 143);
    ctx.strokeRect(PUSHER.frontRight + .5, 350.5, 635 - PUSHER.frontRight, 143);
    // 推板
    const plate = ctx.createLinearGradient(0, face - 65, 0, face + 8); plate.addColorStop(0, '#4c5239'); plate.addColorStop(.7, '#979065'); plate.addColorStop(1, '#dec988');
    ctx.fillStyle = plate; ctx.fillRect(87, 93, 546, face - 93);
    ctx.fillStyle = '#e6d396'; ctx.fillRect(87, face - 4, 546, 4);
    ctx.fillStyle = '#342c18'; ctx.fillRect(87, face, 546, 9);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e2d3a9'; ctx.font = '16px Georgia'; ctx.fillText('ABYSS · MECHANICAL COIN SYSTEM', 360, 126);
    ctx.strokeStyle = '#ced4a222'; ctx.lineWidth = 1;
    for (let x = 105; x < 635; x += 22) {ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x, face - 12); ctx.stroke();}
    for (const coin of state.coins) drawCoin(ctx, coin.x, coin.y, PUSHER.radius, view.coins, 1, coin.kind);
    // 瞄准线
    const target = 112 + aim * 496;
    ctx.strokeStyle = '#ffe3a177'; ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(target, 63); ctx.lineTo(target, 243); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#f2d68a'; ctx.beginPath(); ctx.moveTo(target - 10, 62); ctx.lineTo(target + 10, 62); ctx.lineTo(target, 79); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a18c57'; ctx.font = '14px sans-serif'; ctx.fillText('投 币 位 置', 360, 36);
    const rim = ctx.createLinearGradient(0, 489, 0, 520); rim.addColorStop(0, '#e0c177'); rim.addColorStop(.4, '#87703c'); rim.addColorStop(1, '#302615');
    ctx.fillStyle = rim; ctx.fillRect(82, 490, 556, 28);
    // 唇口倍率标尺：始终不会被币堆遮住。
    ZONES.forEach((multiplier, index) => {
      const x = PUSHER.frontLeft + index * ZONE_WIDTH;
      ctx.fillStyle = multiplier > 1 ? '#6d4f14' : '#1d2416';
      ctx.fillRect(x + 1, 493, ZONE_WIDTH - 2, 22);
      ctx.fillStyle = multiplier > 1 ? '#ffe9a6' : '#9fb79f';
      ctx.font = `${multiplier > 1 ? 'bold 17' : '14'}px Georgia`; ctx.textAlign = 'center';
      ctx.fillText(`×${multiplier}`, x + ZONE_WIDTH / 2, 510);
    });
    ctx.fillStyle = '#8ba07f'; ctx.font = '12px sans-serif';
    ctx.fillText('侧槽', 106, 510); ctx.fillText('侧槽', 614, 510);
    ctx.fillStyle = '#030705'; ctx.fillRect(100, 522, 520, 47); ctx.strokeStyle = '#7c683b'; ctx.strokeRect(100, 522, 520, 47);
    for (let i = 0; i < Math.min(state.tray, 28); i++) drawCoin(ctx, 127 + (i % 17) * 28, 556 - Math.floor(i / 17) * 10, 13, view.coins);
    for (const particle of particles) drawCoin(ctx, particle.x, particle.y + particle.age ** 2 * 290, 13, view.coins, Math.max(0, 1 - particle.age / .65), particle.kind);
    floaters.draw(ctx);
    ctx.fillStyle = '#dac181'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`彩金 ${money(state.jackpot)} USD · 连锁 ${state.chain} · 免费币 ${state.free}`, 360, 590);
    shaker.end(ctx);
  }

  function handle(event) {
    if (event.type === 'insert') {
      playClink(event.kind === 'normal' ? .85 + Math.random() * .35 : 1.5);
      if (event.kind !== 'normal') playTone(event.kind === 'token' ? 1180 : 900, .16, {type: 'triangle', level: .09});
      return;
    }
    if (event.type === 'lost') {
      particles.push({...event, age: 0});
      playThud(150 + Math.random() * 30);
      if (event.refund) {
        floaters.push(`回收 +${event.refund} 免费币`, event.x < 360 ? 190 : 530, 420, {color: '#9fe6c0', size: 20});
        playFanfare(1); shaker.kick(4);
      }
      return;
    }
    if (event.type === 'win') {
      particles.push({...event, age: 0});
      if (event.jackpot) {
        floaters.push(`JACKPOT +${money(event.jackpot)}`, event.x, 452, {color: '#8ff0ff', size: 30, life: 1.8, rise: 96});
        playFanfare(5); shaker.kick(17);
      } else {
        const big = event.kind === 'gold' || event.multiplier > 1;
        floaters.push(`+${event.amount}`, event.x, 470, {color: big ? '#ffe07a' : '#dcecd6', size: big ? 26 : 19});
        playTone(event.kind === 'gold' ? 1150 : 850 + event.multiplier * 90, .1, {level: .1});
        shaker.kick(event.kind === 'gold' ? 5 : 1.6);
      }
      if (event.chainBonus) {
        floaters.push(`连锁 ×${event.chain} +${event.chainBonus}`, 360, 415, {color: '#ffc978', size: 24, life: 1.4});
        playFanfare(2); shaker.kick(7);
      }
      return;
    }
    if (event.type === 'complete') {
      history.unshift(state.lastWin); history = history.slice(0, 8);
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
    floaters.step(elapsed);
    if (changed) {persist(); render();}
    else if (state.pending && now - lastSave > 700) {persist(); lastSave = now;}
    draw(elapsed);
    animation = state.pending || particles.length || floaters.length || shaker.active || state.settle > 0
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
    if (!active || !tiltPusher(state, direction)) return;
    shaker.kick(11); playThud(96); playClink(.7, .1);
    floaters.push(direction < 0 ? '◀ 摇台' : '摇台 ▶', 360, 300, {color: '#ffd9a0', size: 26, life: .8, rise: 30});
    view.status('机台晃动 · 币堆正在重新落位');
    persist(); render(); resume();
  }

  $('#pusher-insert').onclick = () => insert(1);
  $('#pusher-burst').onclick = () => insert(5);
  $('#pusher-tilt-left').onclick = () => tilt(-1);
  $('#pusher-tilt-right').onclick = () => tilt(1);
  slider.oninput = () => {aim = Number(slider.value) / 100; render(); draw(); persist();};
  view.canvas.addEventListener('pointerdown', event => {
    if (state.pending) return;
    const rect = view.canvas.getBoundingClientRect();
    aim = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 720 - 112) / 496));
    slider.value = Math.round(aim * 100); render(); draw(); persist();
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
  // 空闲时也让摇台能量缓慢回复。
  setInterval(() => {
    if (!active || document.hidden || animation) return;
    rechargeTilt(state, .5); renderTilt();
  }, 500);
  document.addEventListener('keydown', event => {
    if (!active || document.querySelector('dialog[open]') || event.target !== document.body || event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') {event.preventDefault(); insert(1);}
    if (event.code === 'ArrowLeft') {event.preventDefault(); tilt(-1);}
    if (event.code === 'ArrowRight') {event.preventDefault(); tilt(1);}
    if (event.code === 'Escape') openLobby('games');
  });
  return {
    enter() {active = true; view.enter(); render(); draw(); if (!isPusherIdle(state)) {view.status('继续上次投币 · 推板运行中'); resume();}},
    leave() {active = false; persist(); cancelAnimationFrame(animation); animation = 0; accumulator = 0; view.leave();},
  };
}
