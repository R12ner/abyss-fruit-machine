export const money = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 1});
export const readState = key => {try {return JSON.parse(localStorage.getItem(key) || 'null');} catch {return null;}};
export const writeState = (key, state) => {try {localStorage.setItem(key, JSON.stringify(state)); return true;} catch {return false;}};
export const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

let audioContext;
export function playSound(frequency = 540, duration = .07) {
  try {
    if (localStorage.getItem('abyss-mechanical-sound-v1') !== 'on' || document.hidden) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const now = audioContext.currentTime, oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .65, now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.13, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + duration + .01);
  } catch {}
}

export function createFrame({id, title, english, number, controls, help, wallet, openLobby}) {
  const root = document.createElement('section');
  root.id = `${id}-game`; root.className = `mechanical-game ${id}-game`; root.hidden = true;
  root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="mechanical-header">
    <button class="mechanical-back" type="button">← 游戏大厅</button>
    <div class="mechanical-brand"><small>ABYSS CASINO · ${number}</small><h1>${title}</h1></div>
    <div class="mechanical-wallet"><span>钱包 · USD</span><output data-wallet>0</output></div>
    <button class="mechanical-sound" type="button" aria-label="开启游戏音效" aria-pressed="false">♪</button>
    <button class="mechanical-help" type="button" aria-label="打开${title}玩法">?</button>
  </div>
  <div class="mechanical-main"><div class="mechanical-topline"><span>${english}</span><span class="mechanical-lamp">机台就绪</span></div>
    <div class="mechanical-layout"><div class="mechanical-cabinet">
      <div class="mechanical-marquee"><span>✦</span><b>${english}</b><span>✦</span></div>
      <div class="mechanical-scene"><canvas width="720" height="600" role="img" aria-label="${title}实时游戏画面；操作按钮和结果在下方"></canvas></div>
      <div class="mechanical-status" role="status" aria-live="polite">选择设置，开始游戏</div>
    </div><aside class="mechanical-console" aria-label="${title}控制台">
      <div class="mechanical-meter"><span>本局得币 <small>WIN / USD</small></span><output data-win>000</output></div>
      ${controls}
      <div class="mechanical-tray"><div><span>出币槽 <small>COIN OUT</small></span><output data-tray>0 USD</output></div>
      <div class="mechanical-tray-coins" aria-hidden="true"></div><button class="mechanical-collect" type="button" disabled>领取到钱包</button></div>
      <div class="mechanical-history"><span>机台记录</span><div data-history>还没有游戏记录</div></div>
      <p class="mechanical-wallet-hint" hidden>钱包余额不足。可领取出币槽奖励，或返回大厅兑换已有筹码。</p>
    </aside></div><p class="mechanical-disclosure">虚拟 USD · 仅供娱乐 · 不支持充值、提现或兑换</p>
  </div><dialog class="mechanical-manual"><button type="button" class="mechanical-close" aria-label="关闭玩法">×</button><small>${english}</small><h2>${title}玩法</h2>${help}<button type="button" class="mechanical-understood">开始玩</button></dialog>`;
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
    let enabled = false; try {enabled = localStorage.getItem('abyss-mechanical-sound-v1') === 'on';} catch {}
    sound.setAttribute('aria-pressed', String(enabled)); sound.setAttribute('aria-label', enabled ? '关闭游戏音效' : '开启游戏音效');
  }
  sound.onclick = () => {try {localStorage.setItem('abyss-mechanical-sound-v1', sound.getAttribute('aria-pressed') === 'true' ? 'off' : 'on');} catch {} syncSound(); playSound();};
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
    $('.mechanical-wallet-hint').hidden = busy || wallet.balance() >= minimum;
    if (trayValue !== tray) {
      trayValue = tray;
      $('.mechanical-tray-coins').innerHTML = tray ? Array.from({length: Math.min(tray, 26)}, (_, i) => `<img src="assets/coins/arcade.png" alt="" style="--col:${i % 8};--row:${Math.floor(i / 8)};--turn:${i * 47 % 45 - 22}deg">`).join('') : '<span>等待硬币落入</span>';
    }
  }
  return {root, $, canvas, context, coins, update,
    status: text => {$('.mechanical-status').textContent = text;},
    enter() {root.hidden = false; document.body.classList.add('mode-mechanical', `mode-${id}`); syncSound();},
    leave() {if (manual.open) manual.close(); root.hidden = true; document.body.classList.remove('mode-mechanical', `mode-${id}`);},
  };
}

export const COIN_KINDS = Object.freeze({
  normal: Object.freeze({value: 1, label: '', inner: '#ffe9a0', mid: '#c5a54a', outer: '#755020', glow: null}),
  gold:   Object.freeze({value: 3, label: '3', inner: '#fff6cf', mid: '#f0c14b', outer: '#8a5c15', glow: '#ffd977'}),
  token:  Object.freeze({value: 0, label: '\u2726', inner: '#d9f7ff', mid: '#4ec9c4', outer: '#134a63', glow: '#7fe9ff'}),
});

export function drawCoin(ctx, x, y, radius = 13, image, alpha = 1, kind = 'normal') {
  const skin = COIN_KINDS[kind] || COIN_KINDS.normal;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.ellipse(x + 1, y + 5, radius + 1, radius * .78, 0, 0, Math.PI * 2); ctx.fill();
  if (skin.glow) {ctx.shadowColor = skin.glow; ctx.shadowBlur = radius * 1.15;}
  const gradient = ctx.createRadialGradient(x - radius * .3, y - radius * .4, 0, x, y, radius);
  gradient.addColorStop(0, skin.inner); gradient.addColorStop(.7, skin.mid); gradient.addColorStop(1, skin.outer);
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (kind === 'normal' && image?.complete && image.naturalWidth) {
    ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.strokeStyle = skin.inner; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, radius * .76, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = skin.outer; ctx.font = `bold ${radius}px Georgia`; ctx.textAlign = 'center';
    ctx.fillText(skin.label || '$', x, y + radius * .35);
  }
  ctx.restore();
}

export function drawFelt(ctx) {
  ctx.clearRect(0, 0, 720, 600);
  const gradient = ctx.createRadialGradient(360, 240, 10, 360, 270, 410);
  gradient.addColorStop(0, '#174a36'); gradient.addColorStop(1, '#061a12');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 720, 600);
  ctx.fillStyle = '#ffffff05';
  for (let y = 0; y < 600; y += 5) for (let x = y % 10; x < 720; x += 9) ctx.fillRect(x, y, 1, 1);
}

/* ---------- 音频扩展 ---------- */
function audioReady() {
  try {
    if (localStorage.getItem('abyss-mechanical-sound-v1') !== 'on' || document.hidden) return null;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  } catch {return null;}
}

export function playTone(frequency = 540, duration = .07, {type = 'sine', level = .13, sweep = .65, delay = 0} = {}) {
  const ctx = audioReady();
  if (!ctx) return;
  try {
    const now = ctx.currentTime + delay, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * sweep), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(now); oscillator.stop(now + duration + .02);
  } catch {}
}

/** 金属撞击：噪声 + 高频衰减，用于硬币互撞和碰钉。 */
export function playClink(pitch = 1, level = .07) {
  const ctx = audioReady();
  if (!ctx) return;
  try {
    const now = ctx.currentTime, length = Math.floor(ctx.sampleRate * .05);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2100 * pitch, now); filter.Q.value = 6;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .06);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.start(now); source.stop(now + .07);
  } catch {}
}

/** 上行琶音：中奖等级越高音符越多。 */
export function playFanfare(tier = 1) {
  const base = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
  const notes = Math.max(2, Math.min(base.length, 2 + tier));
  for (let i = 0; i < notes; i++) playTone(base[i], .22, {type: 'triangle', level: .1, sweep: 1, delay: i * .065});
}

export function playThud(frequency = 130) {
  playTone(frequency, .18, {type: 'sawtooth', level: .09, sweep: .35});
}

/* ---------- 画面震动 ---------- */
export function createShaker() {
  let power = 0, seed = 0;
  return {
    kick(amount) {power = Math.min(18, power + amount);},
    get active() {return power > .05;},
    begin(ctx, dt) {
      if (power <= .05) {power = 0; return;}
      seed += dt * 61;
      ctx.save();
      ctx.translate(Math.sin(seed * 3.1) * power, Math.cos(seed * 4.3) * power * .7);
      power *= Math.max(0, 1 - dt * 7.5);
    },
    end(ctx) {if (power > 0) ctx.restore();},
  };
}

/* ---------- 漂浮文字 ---------- */
export function createFloaters() {
  const items = [];
  return {
    push(text, x, y, {color = '#ffe9a8', size = 22, life = 1.05, rise = 62} = {}) {
      if (items.length > 24) items.shift();
      items.push({text, x, y, color, size, life, age: 0, rise});
    },
    get length() {return items.length;},
    step(dt) {for (let i = items.length - 1; i >= 0; i--) if ((items[i].age += dt) > items[i].life) items.splice(i, 1);},
    draw(ctx) {
      for (const item of items) {
        const t = item.age / item.life, pop = t < .18 ? .7 + t / .18 * .45 : 1.15 - (t - .18) * .18;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t ** 2.2);
        ctx.translate(item.x, item.y - item.rise * t ** .65);
        ctx.scale(pop, pop);
        ctx.textAlign = 'center';
        ctx.font = `700 ${item.size}px Georgia, serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = '#05100a'; ctx.strokeText(item.text, 0, 0);
        ctx.fillStyle = item.color; ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }
    },
  };
}
