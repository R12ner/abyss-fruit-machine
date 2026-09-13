/** 机台音效：单一 AudioContext，所有声音由振荡器和噪声实时合成。 */
import {settings} from './settings.mjs';

let audioContext;

export const soundEnabled = () => settings.get().sound;

export function setSoundEnabled(enabled) {
  settings.update({sound: !!enabled});
  return !!enabled;
}

/** 设置里的音量作为总增益，乘在每个声音的电平上。 */
const gainScale = () => settings.get().volume;

/** 取得可用的 AudioContext；声音关闭或页面隐藏时返回 null，调用方直接跳过。 */
function audioReady() {
  try {
    if (!soundEnabled() || document.hidden) return null;
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
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level * gainScale()), now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(now); oscillator.stop(now + duration + .02);
  } catch {}
}

/** 界面反馈音，用于开关音效这类不属于游戏内的动作。 */
export const playSound = (frequency = 540, duration = .07) => playTone(frequency, duration, {level: .13});

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
    const gain = ctx.createGain(); gain.gain.setValueAtTime(Math.max(.0002, level * gainScale()), now);
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
