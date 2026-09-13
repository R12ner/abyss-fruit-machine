/**
 * 机台纪录墙：每台机器各自记录几项个人最佳，大厅卡片和机台顶部都会显示。
 * 只存数字，不存局面，所以和各游戏的存档互不干扰。
 */
const KEY = 'abyss-records-v1';
const listeners = new Set();

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {return {};}
}

let store = readAll();

export const records = Object.freeze({
  /** 取某台机器的全部纪录，返回普通对象。 */
  of(gameId) {return {...(store[gameId] || {})};},
  /** 只有比原纪录更好才写入；返回真正被刷新的字段。 */
  submit(gameId, values) {
    const before = store[gameId] || {};
    const beaten = {};
    for (const [name, value] of Object.entries(values)) {
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!(Number.isFinite(before[name]) && before[name] >= value)) beaten[name] = value;
    }
    if (!Object.keys(beaten).length) return beaten;
    store = {...store, [gameId]: {...before, ...beaten}};
    try {localStorage.setItem(KEY, JSON.stringify(store));} catch {}
    for (const listener of listeners) listener(gameId, {...store[gameId]});
    return beaten;
  },
  subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
});
