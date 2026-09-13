import {createFrame, drawCoin, drawFelt, money, readState, writeState, playSound} from '../mechanical/shared.mjs';
import {PUSHER, createPusherState, pusherFace, startPusherRound, stepPusher} from './model.mjs';

export const coinPusherGameDefinition = Object.freeze({
  id: 'coin-pusher', badge: 'MACHINE 02', title: '深渊推币机', subtitle: 'COIN PUSHER · 瞄准 · 推落 · 收币', cardClass: 'pusher-card',
  art: '<span class="mechanical-card-art" aria-hidden="true"><img src="assets/coin-pusher/machine.svg" alt=""></span>',
  create: createCoinPusherGame,
});

export function createCoinPusherGame({wallet, openLobby}) {
  const key = 'abyss-coin-pusher-state-v1', saved = readState(key), state = createPusherState(saved);
  let aim = Number.isFinite(saved?.aim) ? Math.max(0, Math.min(1, saved.aim)) : .5;
  let active = false, animation = 0, lastTime = 0, accumulator = 0, lastSave = 0;
  let history = Array.isArray(saved?.history) ? saved.history.filter(n => Number.isSafeInteger(n) && n >= 0).slice(0, 8) : [];
  const particles = [];
  const view = createFrame({id: 'coin-pusher', title: '深渊推币机', english: 'THE COIN PUSHER', number: 'MACHINE 02', wallet, openLobby,
    controls: `<div class="mechanical-controls"><label class="mechanical-control-label" for="pusher-aim">投币位置 <output id="pusher-aim-value">正中</output></label>
      <input id="pusher-aim" type="range" min="0" max="100" step="1" value="50" aria-label="选择推币机投币位置"><div class="mechanical-control-ends"><span>左</span><span>右</span></div>
      <button type="button" class="mechanical-launch" id="pusher-insert">投一枚 · 1 USD<small>INSERT COIN</small></button>
      <button type="button" class="mechanical-burst" id="pusher-burst">连续投 5 枚 · 5 USD</button>
      <p>点击台面或拖动滑杆瞄准。前沿落币归你，两侧落币不计奖。</p></div>`,
    help: `<p>每枚硬币花费 1 虚拟 USD，直接从赌场钱包扣除。拖动滑杆，或点击台面选择投币位置，再按投币按钮。连续投币会按当前位置投入 5 枚。</p>
      <p>投币后推板完成一次往返，硬币会相互碰撞和挤压。每枚从正前方落下的币奖励 1 USD，落入左右侧槽的币不计奖。台面原有硬币也可以推下来。</p>
      <p>每次投币不保证得币，位置和当前币堆都会影响结果。奖励留在出币槽，按“领取到钱包”收取。切换游戏会暂停推板，返回后继续；刷新会恢复已保存的币堆和进行中的投币。</p>`});
  const {context: ctx, $} = view;
  const slider = $('#pusher-aim'); slider.value = Math.round(aim * 100);
  const persist = () => writeState(key, {...state, aim, history});
  function render() {
    view.update({tray: state.tray, win: state.lastWin, busy: !!state.pending});
    $('#pusher-insert').disabled = !!state.pending || wallet.balance() < 1 || state.coins.length >= 260;
    $('#pusher-burst').disabled = !!state.pending || wallet.balance() < 5 || state.coins.length > 255;
    slider.disabled = !!state.pending;
    $('#pusher-aim-value').textContent = Math.abs(aim - .5) < .04 ? '正中' : `${aim < .5 ? '左' : '右'} ${Math.round(Math.abs(aim - .5) * 200)}%`;
    $('[data-history]').innerHTML = history.length ? history.map(win => `<b class="${win ? '' : 'lost'}">+${win}</b>`).join('') : '还没有游戏记录';
  }
  function draw() {
    drawFelt(ctx);
    const face = pusherFace(state);
    ctx.fillStyle = '#040a07'; ctx.fillRect(65, 88, 590, 426);
    const bed = ctx.createLinearGradient(0, 190, 0, 500); bed.addColorStop(0, '#20432f'); bed.addColorStop(1, '#296148');
    ctx.fillStyle = bed; ctx.fillRect(84, 166, 552, 326);
    ctx.strokeStyle = '#c5a45c'; ctx.lineWidth = 3; ctx.strokeRect(83, 85, 554, 426);
    ctx.fillStyle = '#060d08'; ctx.fillRect(85, 350, 22, 144); ctx.fillRect(614, 350, 22, 144);
    ctx.fillStyle = '#b09759'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(57, 421); ctx.rotate(-Math.PI / 2); ctx.fillText('侧 槽', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(665, 421); ctx.rotate(Math.PI / 2); ctx.fillText('侧 槽', 0, 0); ctx.restore();
    const plate = ctx.createLinearGradient(0, face - 65, 0, face + 8); plate.addColorStop(0, '#4c5239'); plate.addColorStop(.7, '#979065'); plate.addColorStop(1, '#dec988');
    ctx.fillStyle = plate; ctx.fillRect(87, 93, 546, face - 93);
    ctx.fillStyle = '#e6d396'; ctx.fillRect(87, face - 4, 546, 4);
    ctx.fillStyle = '#342c18'; ctx.fillRect(87, face, 546, 9);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e2d3a9'; ctx.font = '16px Georgia'; ctx.fillText('ABYSS · MECHANICAL COIN SYSTEM', 360, 126);
    ctx.strokeStyle = '#ced4a222'; ctx.lineWidth = 1;
    for (let x = 105; x < 635; x += 22) {ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x, face - 12); ctx.stroke();}
    for (const coin of state.coins) drawCoin(ctx, coin.x, coin.y, PUSHER.radius, view.coins);
    const target = 112 + aim * 496;
    ctx.strokeStyle = '#ffe3a177'; ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(target, 63); ctx.lineTo(target, 243); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#f2d68a'; ctx.beginPath(); ctx.moveTo(target - 10, 62); ctx.lineTo(target + 10, 62); ctx.lineTo(target, 79); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a18c57'; ctx.font = '14px sans-serif'; ctx.fillText('投 币 位 置', 360, 36);
    const rim = ctx.createLinearGradient(0, 489, 0, 507); rim.addColorStop(0, '#e0c177'); rim.addColorStop(.4, '#87703c'); rim.addColorStop(1, '#302615');
    ctx.fillStyle = rim; ctx.fillRect(82, 490, 556, 12);
    ctx.fillStyle = '#030705'; ctx.fillRect(100, 511, 520, 58); ctx.strokeStyle = '#7c683b'; ctx.strokeRect(100, 511, 520, 58);
    for (let i = 0; i < Math.min(state.tray, 28); i++) drawCoin(ctx, 127 + (i % 17) * 28, 551 - Math.floor(i / 17) * 11, 13, view.coins);
    for (const particle of particles) drawCoin(ctx, particle.x, particle.y + particle.age ** 2 * 290, 13, view.coins, Math.max(0, 1 - particle.age / .65));
    ctx.fillStyle = '#dac181'; ctx.font = '15px sans-serif'; ctx.fillText('正前方落币 · 每枚 1 USD', 360, 590);
  }
  function tick(now) {
    if (!active || document.hidden) {animation = 0; return;}
    const elapsed = lastTime ? Math.min(.06, (now - lastTime) / 1000) : 0; lastTime = now; accumulator += elapsed;
    let changed = false;
    while (accumulator >= 1 / 120) {
      for (const event of stepPusher(state, 1 / 120)) {
        changed = true;
        if (event.type === 'insert') playSound(430, .08);
        if (event.type === 'win') {particles.push({...event, age: 0}); playSound(850, .09);}
        if (event.type === 'complete') {
          history.unshift(state.lastWin); history = history.slice(0, 8);
          view.status(state.lastWin ? `推落 ${state.lastWin} 枚 · ${state.tray} USD 等待领取` : '推板已归位 · 调整位置，继续推进币堆');
        }
      }
      accumulator -= 1 / 120;
    }
    for (let i = particles.length - 1; i >= 0; i--) {particles[i].age += elapsed; if (particles[i].age > .65) particles.splice(i, 1);}
    if (changed) {persist(); render();}
    else if (state.pending && now - lastSave > 700) {persist(); lastSave = now;}
    draw();
    animation = state.pending || particles.length ? requestAnimationFrame(tick) : 0;
  }
  function resume() {if (active && !document.hidden && !animation) {lastTime = 0; animation = requestAnimationFrame(tick);}}
  function insert(count) {
    if (!active || state.pending || state.coins.length + count > 260) return;
    if (wallet.spend(count) !== count) {view.status('钱包余额不足，或其他机台正在结算'); render(); return;}
    startPusherRound(state, count, aim); persist(); render();
    view.status(count === 1 ? '硬币落下 · 推板正在前进' : '连续投入 5 枚 · 推板正在前进'); resume();
  }
  $('#pusher-insert').onclick = () => insert(1); $('#pusher-burst').onclick = () => insert(5);
  slider.oninput = () => {aim = Number(slider.value) / 100; render(); draw(); persist();};
  view.canvas.addEventListener('pointerdown', event => {
    if (state.pending) return;
    const rect = view.canvas.getBoundingClientRect(); aim = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 720 - 112) / 496));
    slider.value = Math.round(aim * 100); render(); draw(); persist();
  });
  $('.mechanical-collect').onclick = () => {
    const amount = state.tray; if (!amount || state.pending) return;
    if (wallet.deposit(amount) !== amount) {view.status('其他机台正在结算，请稍后领取'); return;}
    state.tray = 0; persist(); render(); draw(); playSound(1040, .22); view.status(`已领取 ${money(amount)} USD 到钱包`);
  };
  wallet.subscribe(() => render());
  document.addEventListener('visibilitychange', () => {if (document.hidden) {persist(); cancelAnimationFrame(animation); animation = 0;} else resume();});
  window.addEventListener('pagehide', persist);
  view.coins.onload = () => {if (active) draw();};
  document.addEventListener('keydown', event => {
    if (!active || document.querySelector('dialog[open]') || event.target !== document.body || event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') {event.preventDefault(); insert(1);}
    if (event.code === 'Escape') openLobby('games');
  });
  return {enter() {active = true; view.enter(); render(); draw(); if (state.pending) {view.status('继续上次投币 · 推板运行中'); resume();}},
    leave() {active = false; persist(); cancelAnimationFrame(animation); animation = 0; accumulator = 0; view.leave();}};
}
