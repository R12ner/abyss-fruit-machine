import {createFrame, drawFelt, money, readState, writeState, playSound, secureRandom} from '../mechanical/shared.mjs';
import {PAYTABLES, ROWS, STAKES, createPlinkoRound, restorePlinkoRound, plinkoPosition} from './model.mjs';

export const plinkoGameDefinition = Object.freeze({
  id: 'plinko', badge: 'MACHINE 03', title: '深渊弹珠机', subtitle: 'PLINKO · 12 层钉阵 · 倍率落盘', cardClass: 'plinko-card',
  art: '<span class="mechanical-card-art" aria-hidden="true"><img src="assets/plinko/machine.svg" alt=""></span>',
  create: createPlinkoGame,
});

export function createPlinkoGame({wallet, openLobby}) {
  const key = 'abyss-plinko-state-v1', saved = readState(key);
  let bet = STAKES.includes(saved?.bet) ? saved.bet : 10;
  let risk = Object.hasOwn(PAYTABLES, saved?.risk) ? saved.risk : 'classic';
  let tray = Number.isSafeInteger(saved?.tray) && saved.tray >= 0 ? saved.tray : 0;
  let pending = restorePlinkoRound(saved?.pending), progress = pending && Number.isFinite(saved?.progress) ? Math.max(0, Math.min(.999, saved.progress)) : 0;
  let history = Array.isArray(saved?.history) ? saved.history.map(restorePlinkoRound).filter(Boolean).slice(0, 8) : [];
  let last = history[0] || null, active = false, animation = 0, lastTime = 0, lastPin = -1, lastSave = 0;
  if (pending) {bet = pending.bet; risk = pending.risk;}
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1.3 : 4.4;
  const trail = [];
  const view = createFrame({id: 'plinko', title: '深渊弹珠机', english: 'THE PLINKO CLUB', number: 'MACHINE 03', wallet, openLobby,
    controls: `<div class="mechanical-controls"><span class="mechanical-control-label" id="plinko-stake-label">每颗弹珠 <output id="plinko-cost">10 USD</output></span>
      <div class="mechanical-options" role="group" aria-labelledby="plinko-stake-label">${STAKES.map(value => `<button type="button" data-plinko-bet="${value}" aria-pressed="false">${value}</button>`).join('')}</div>
      <span class="mechanical-control-label" id="plinko-risk-label">倍率档位</span><div class="mechanical-risk" role="group" aria-labelledby="plinko-risk-label"><button type="button" data-plinko-risk="classic" aria-pressed="true">经典</button><button type="button" data-plinko-risk="high" aria-pressed="false">高倍</button></div>
      <button type="button" class="mechanical-launch" id="plinko-drop">释放弹珠 · 10 USD<small>DROP THE BALL</small></button>
      <p>穿过 12 层钉阵，按落点倍率得币。倍率包含本金，越靠两侧越难命中。</p></div>`,
    help: `<p>选择弹珠面额和倍率档位，按“释放弹珠”立即扣除一颗弹珠的费用。每层碰钉后有相同机会向左或向右，12 次后落入 13 个奖励槽之一。两侧高倍率更难命中。</p>
      <p>奖励 = 弹珠面额 × 落点倍率，已包含本金。例如投入 10 USD，落到 ×0.5 得 5 USD，落到 ×3 得 30 USD。高倍档的正中槽为 ×0，不返还费用。</p>
      <p>经典档最高 ×10，高倍档最高 ×100。两档都不保证获奖。下方倍率条可横向滑动查看所有槽位，结果加入出币槽，按“领取到钱包”收取。</p>
      <p>落球期间不能改面额、档位或重复扣款。切换游戏会暂停动画；刷新后会继续已扣费的同一颗弹珠，不会重新抽取结果。</p>`});
  const {context: ctx, $} = view;
  const odds = document.createElement('div'); odds.className = 'plinko-odds'; odds.setAttribute('aria-label', '从左到右的十三个落点倍率');
  $('.mechanical-scene').after(odds);
  const persist = () => writeState(key, {bet, risk, tray, pending, progress, history});
  function render() {
    const currentRisk = pending?.risk || risk;
    view.update({tray, win: pending ? 0 : last?.payout || 0, busy: !!pending, minimum: bet});
    $('#plinko-drop').disabled = !!pending || wallet.balance() < bet;
    $('#plinko-drop').innerHTML = `${pending ? '弹珠下落中' : `释放弹珠 · ${bet} USD`}<small>DROP THE BALL</small>`;
    $('#plinko-cost').textContent = `${bet} USD`;
    view.root.querySelectorAll('[data-plinko-bet]').forEach(button => {button.disabled = !!pending; button.setAttribute('aria-pressed', String(Number(button.dataset.plinkoBet) === bet));});
    view.root.querySelectorAll('[data-plinko-risk]').forEach(button => {button.disabled = !!pending; button.setAttribute('aria-pressed', String(button.dataset.plinkoRisk === risk));});
    odds.innerHTML = PAYTABLES[currentRisk].map((value, index) => `<span class="${!pending && last?.risk === currentRisk && last.slot === index ? 'is-hit' : ''}" aria-label="第 ${index + 1} 槽，${value / 10} 倍">×${value / 10}</span>`).join('');
    $('[data-history]').innerHTML = history.length ? history.map(round => `<b class="${round.payout < round.bet ? 'lost' : ''}" title="${round.bet} USD × ${round.multiplier} = ${round.payout} USD">×${round.multiplier}</b>`).join('') : '还没有游戏记录';
  }
  function draw() {
    drawFelt(ctx);
    ctx.fillStyle = '#0c2c1b'; ctx.strokeStyle = '#aa9050'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(342, 69); ctx.quadraticCurveTo(360, 50, 378, 69); ctx.lineTo(657, 501); ctx.quadraticCurveTo(671, 532, 639, 532); ctx.lineTo(81, 532); ctx.quadraticCurveTo(49, 532, 63, 501); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d1b26433'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(360, 83); ctx.lineTo(643, 515); ctx.lineTo(77, 515); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#9fb69b'; ctx.textAlign = 'center'; ctx.font = '15px Georgia'; ctx.fillText('ABYSS · PLINKO', 360, 28);
    const ball = pending ? plinkoPosition(pending, progress) : null;
    let pathX = 360;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col <= row; col++) {
        const x = 360 - row * 22 + col * 44, y = 108 + row * 30;
        const hit = pending && row === ball.row && Math.abs(x - pathX) < 1;
        ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.arc(x + 1, y + 3, 5, 0, Math.PI * 2); ctx.fill();
        if (hit) {ctx.fillStyle = '#e2d78c33'; ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();}
        ctx.fillStyle = hit ? '#fff0b3' : '#c6b273'; ctx.beginPath(); ctx.arc(x, y, hit ? 5.5 : 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f9edb9'; ctx.beginPath(); ctx.arc(x - 1, y - 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      if (pending) pathX += pending.directions[row] ? 22 : -22;
    }
    const currentRisk = pending?.risk || risk;
    PAYTABLES[currentRisk].forEach((value, index) => {
      const x = 76 + index * 44, hit = !pending && last?.risk === currentRisk && last.slot === index;
      ctx.fillStyle = hit ? '#edd391' : index < 2 || index > 10 ? '#87502d' : index < 4 || index > 8 ? '#796038' : '#314c2f';
      ctx.fillRect(x, 492, 40, 38); ctx.strokeStyle = hit ? '#fff1b8' : '#b49c61'; ctx.lineWidth = 1; ctx.strokeRect(x, 492, 40, 38);
      ctx.fillStyle = hit ? '#332713' : '#fff0c2'; ctx.font = `${value >= 1000 ? 16 : 19}px Georgia`; ctx.textAlign = 'center'; ctx.fillText(`${value / 10}×`, x + 20, 517);
      ctx.fillStyle = '#a18b55'; ctx.fillRect(x - 3, 469, 3, 61);
    });
    if (pending) {
      trail.forEach((point, index) => {ctx.globalAlpha = (index + 1) / trail.length * .2; ctx.fillStyle = '#c8e7c6'; ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, Math.PI * 2); ctx.fill();}); ctx.globalAlpha = 1;
      drawBall(ball.x, ball.y);
    } else drawBall(last && last.risk === risk ? 96 + last.slot * 44 : 360, last && last.risk === risk ? 480 : 53);
    ctx.fillStyle = '#d4c190'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${currentRisk === 'high' ? '高倍' : '经典'}档 · 12 层钉阵 · 13 个落点`, 360, 574);
  }
  function drawBall(x, y) {
    ctx.shadowColor = '#f4e8ab'; ctx.shadowBlur = 13;
    const ball = ctx.createRadialGradient(x - 3, y - 4, 0, x, y, 9); ball.addColorStop(0, '#fffef1'); ball.addColorStop(.35, '#e8dab1'); ball.addColorStop(1, '#847047');
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  function tick(now) {
    if (!active || document.hidden || !pending) {animation = 0; return;}
    progress += lastTime ? Math.min(.07, (now - lastTime) / 1000) / duration : 0; lastTime = now;
    const point = plinkoPosition(pending, progress); trail.push(point); if (trail.length > 9) trail.shift();
    if (point.row !== lastPin && point.row >= 0 && point.row < ROWS) {lastPin = point.row; playSound(640 + point.row * 35, .055);}
    if (progress >= 1) {
      last = pending; tray += pending.payout; history.unshift(pending); history = history.slice(0, 8); pending = null; progress = 0; trail.length = 0;
      persist(); render(); draw(); animation = 0;
      view.status(`落入第 ${last.slot + 1} 槽 · ×${last.multiplier} · 得币 ${money(last.payout)} USD`);
      playSound(last.payout >= last.bet ? 1060 : 220, .28); return;
    }
    if (now - lastSave > 700) {persist(); lastSave = now;}
    draw(); animation = requestAnimationFrame(tick);
  }
  function resume() {if (active && pending && !document.hidden && !animation) {lastTime = 0; animation = requestAnimationFrame(tick);}}
  function drop() {
    if (!active || pending) return;
    let round; try {round = createPlinkoRound(bet, risk, secureRandom);} catch {view.status('弹珠暂时无法释放，请重试'); return;}
    if (wallet.spend(bet) !== bet) {view.status('钱包余额不足，或其他机台正在结算'); render(); return;}
    pending = round; progress = 0; lastPin = -1; trail.length = 0; persist(); render();
    view.status('弹珠穿过钉阵 · 等待落盘'); playSound(410, .1); resume();
  }
  $('#plinko-drop').onclick = drop;
  view.root.querySelectorAll('[data-plinko-bet]').forEach(button => {button.onclick = () => {if (pending) return; bet = Number(button.dataset.plinkoBet); persist(); render();};});
  view.root.querySelectorAll('[data-plinko-risk]').forEach(button => {button.onclick = () => {if (pending) return; risk = button.dataset.plinkoRisk; persist(); render(); draw();};});
  $('.mechanical-collect').onclick = () => {
    const amount = tray; if (!amount || pending) return;
    if (wallet.deposit(amount) !== amount) {view.status('其他机台正在结算，请稍后领取'); return;}
    tray = 0; persist(); render(); playSound(1040, .22); view.status(`已领取 ${money(amount)} USD 到钱包`);
  };
  wallet.subscribe(() => render());
  document.addEventListener('visibilitychange', () => {if (document.hidden) {persist(); cancelAnimationFrame(animation); animation = 0;} else resume();});
  window.addEventListener('pagehide', persist);
  document.addEventListener('keydown', event => {
    if (!active || document.querySelector('dialog[open]') || event.target !== document.body || event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') {event.preventDefault(); drop();}
    if (event.code === 'Escape') openLobby('games');
  });
  return {enter() {active = true; view.enter(); render(); draw(); if (pending) {view.status('继续上次弹珠 · 无需再次扣费'); resume();}},
    leave() {active = false; persist(); cancelAnimationFrame(animation); animation = 0; view.leave();}};
}
