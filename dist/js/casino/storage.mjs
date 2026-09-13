/** 机台通用的数值格式化、本地存档与安全随机数。 */

export const money = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 1});

export const readState = key => {try {return JSON.parse(localStorage.getItem(key) || 'null');} catch {return null;}};

export const writeState = (key, state) => {try {localStorage.setItem(key, JSON.stringify(state)); return true;} catch {return false;}};

export const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
