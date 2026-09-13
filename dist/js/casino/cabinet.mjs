/**
 * 机台外壳：推币机和弹珠机共用的机柜、顶灯、控制台与说明书。
 * 视觉语言与轮盘桌统一——木纹外框、金色双线包边、黄铜螺丝、衬线标题。
 * 每个游戏只提供 controls / help 两段内容，其余由这里生成。
 */
import {money} from './storage.mjs';
import {playSound, soundEnabled, setSoundEnabled} from './audio.mjs';

const LAMP_COUNT = 13;
const lampStrip = () => `<span class="mechanical-lamps" aria-hidden="true">${
  Array.from({length: LAMP_COUNT}, (_, i) => `<i style="--lamp:${i}"></i>`).join('')}</span>`;

export function createCabinet({id, title, english, number, controls, help, wallet, openLobby}) {
  const root = document.createElement('section');
  root.id = `${id}-game`;
  root.className = `mechanical-game ${id}-game`;
  root.hidden = true;
  root.setAttribute('aria-label', title);
  root.innerHTML = `<header class="mechanical-header">
    <button class="mechanical-back" type="button">← <span>游戏大厅</span></button>
    <div class="mechanical-brand"><small>ABYSS CASINO · ${number}</small><strong>${title}</strong></div>
    <div class="mechanical-wallet"><span>钱包 · USD</span><output data-wallet>0</output></div>
    <button class="mechanical-sound" type="button" aria-label="开启游戏音效" aria-pressed="false">♪</button>
    <button class="mechanical-help" type="button" aria-label="打开${title}玩法">?</button>
  </header>
  <main class="mechanical-main">
    <div class="mechanical-topline"><span>${english}</span><span class="mechanical-lamp">机台就绪</span></div>
    <div class="mechanical-layout">
      <div class="mechanical-cabinet">
        <div class="mechanical-marquee">${lampStrip()}<b>${english}</b>${lampStrip()}</div>
        <div class="mechanical-scene">
          <canvas width="720" height="600" role="img" aria-label="${title}实时游戏画面；操作按钮和结果在下方"></canvas>
          <span class="mechanical-screw screw-tl" aria-hidden="true"></span><span class="mechanical-screw screw-tr" aria-hidden="true"></span>
          <span class="mechanical-screw screw-bl" aria-hidden="true"></span><span class="mechanical-screw screw-br" aria-hidden="true"></span>
        </div>
        <div class="mechanical-status" role="status" aria-live="polite">选择设置，开始游戏</div>
        <div class="mechanical-plate" aria-hidden="true"><span>ABYSS ARCADE</span><span>${number}</span><span>VIRTUAL COINS ONLY</span></div>
      </div>
      <aside class="mechanical-console" aria-label="${title}控制台">
        <div class="mechanical-meter"><span>本局得币 <small>WIN / USD</small></span><output data-win>000</output></div>
        ${controls}
        <div class="mechanical-tray">
          <div><span>出币槽 <small>COIN OUT</small></span><output data-tray>0 USD</output></div>
          <div class="mechanical-tray-coins" aria-hidden="true"></div>
          <button class="mechanical-collect" type="button" disabled>领取到钱包</button>
        </div>
        <div class="mechanical-history"><span>机台记录</span><div data-history>还没有游戏记录</div></div>
        <p class="mechanical-wallet-hint" hidden>钱包余额不足。可领取出币槽奖励，或返回大厅兑换已有筹码。</p>
      </aside>
    </div>
    <p class="mechanical-disclosure">虚拟 USD · 仅供娱乐 · 不支持充值、提现或兑换</p>
  </main>
  <dialog class="mechanical-manual">
    <button type="button" class="mechanical-close" aria-label="关闭玩法">×</button>
    <small>${english}</small><h2>${title}玩法</h2>${help}
    <button type="button" class="mechanical-understood">开始玩</button>
  </dialog>`;
  document.body.append(root);

  const $ = selector => root.querySelector(selector);
  const canvas = $('canvas'), context = canvas.getContext('2d');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 720 * ratio; canvas.height = 600 * ratio; context.scale(ratio, ratio);

  $('.mechanical-back').onclick = () => openLobby('games');
  const manual = $('.mechanical-manual');
  $('.mechanical-help').onclick = () => manual.showModal();
  $('.mechanical-close').onclick = $('.mechanical-understood').onclick = () => manual.close();

  const sound = $('.mechanical-sound');
  function syncSound() {
    const enabled = soundEnabled();
    sound.setAttribute('aria-pressed', String(enabled));
    sound.setAttribute('aria-label', enabled ? '关闭游戏音效' : '开启游戏音效');
  }
  sound.onclick = () => {setSoundEnabled(sound.getAttribute('aria-pressed') !== 'true'); syncSound(); playSound();};

  wallet.subscribe(balance => {$('[data-wallet]').textContent = money(balance);});
  const coins = new Image(); coins.src = 'assets/coins/arcade.png';

  let trayValue = -1;
  function update({tray, win, busy, minimum = 1}) {
    $('[data-wallet]').textContent = money(wallet.balance());
    $('[data-win]').textContent = String(win).padStart(3, '0');
    $('[data-tray]').textContent = `${money(tray)} USD`;
    $('.mechanical-collect').disabled = busy || tray <= 0;
    $('.mechanical-lamp').textContent = busy ? '游戏进行中' : '机台就绪';
    $('.mechanical-lamp').classList.toggle('is-busy', busy);
    root.classList.toggle('is-busy', !!busy);
    $('.mechanical-wallet-hint').hidden = busy || wallet.balance() >= minimum;
    if (trayValue !== tray) {
      trayValue = tray;
      $('.mechanical-tray-coins').innerHTML = tray
        ? Array.from({length: Math.min(tray, 26)}, (_, i) =>
            `<img src="assets/coins/arcade.png" alt="" style="--col:${i % 8};--row:${Math.floor(i / 8)};--turn:${i * 47 % 45 - 22}deg">`).join('')
        : '<span>等待硬币落入</span>';
    }
  }

  return {
    root, $, canvas, context, coins, update,
    status: text => {$('.mechanical-status').textContent = text;},
    enter() {root.hidden = false; document.body.classList.add('mode-mechanical', `mode-${id}`); syncSound();},
    leave() {if (manual.open) manual.close(); root.hidden = true; document.body.classList.remove('mode-mechanical', `mode-${id}`);},
  };
}
