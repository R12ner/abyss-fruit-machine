/**
 * 全站设置：硬币皮肤、音效、动画强度。
 * 所有机台读同一份设置，改动通过订阅广播出去，不需要刷新。
 */
const KEY = 'abyss-settings-v1';

export const COIN_SKINS = Object.freeze([
  {id: 'arcade', label: '街机币', file: 'assets/coins/arcade.png'},
  {id: 'bitcoin', label: '比特币', file: 'assets/coins/bitcoin.png'},
  {id: 'usdt', label: 'USDT', file: 'assets/coins/usdt.png'},
  {id: 'usdc', label: 'USDC', file: 'assets/coins/usdc.png'},
]);

export const MOTION_LEVELS = Object.freeze([
  {id: 'full', label: '完整', shake: 1, flourish: 1},
  {id: 'calm', label: '克制', shake: .45, flourish: .7},
  {id: 'off', label: '关闭', shake: 0, flourish: 0},
]);

const DEFAULTS = Object.freeze({coinSkin: 'arcade', sound: false, volume: .7, motion: 'full'});
const listeners = new Set();
let current = load();

function load() {
  let saved = null;
  try {saved = JSON.parse(localStorage.getItem(KEY) || 'null');} catch {}
  return {
    coinSkin: COIN_SKINS.some(skin => skin.id === saved?.coinSkin) ? saved.coinSkin : DEFAULTS.coinSkin,
    sound: typeof saved?.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
    volume: Number.isFinite(saved?.volume) ? Math.max(0, Math.min(1, saved.volume)) : DEFAULTS.volume,
    motion: MOTION_LEVELS.some(level => level.id === saved?.motion) ? saved.motion : DEFAULTS.motion,
  };
}

export const settings = Object.freeze({
  get() {return {...current};},
  /** 当前硬币皮肤的图片路径。 */
  coinFile() {return (COIN_SKINS.find(skin => skin.id === current.coinSkin) || COIN_SKINS[0]).file;},
  /** 动画强度系数，0 表示关闭震动与夸张特效。 */
  motion() {return MOTION_LEVELS.find(level => level.id === current.motion) || MOTION_LEVELS[0];},
  update(patch) {
    const next = {...current, ...patch};
    current = {
      coinSkin: COIN_SKINS.some(skin => skin.id === next.coinSkin) ? next.coinSkin : DEFAULTS.coinSkin,
      sound: !!next.sound,
      volume: Math.max(0, Math.min(1, Number(next.volume) || 0)),
      motion: MOTION_LEVELS.some(level => level.id === next.motion) ? next.motion : DEFAULTS.motion,
    };
    try {localStorage.setItem(KEY, JSON.stringify(current));} catch {}
    for (const listener of listeners) listener({...current});
    return {...current};
  },
  subscribe(listener) {listeners.add(listener); listener({...current}); return () => listeners.delete(listener);},
});
