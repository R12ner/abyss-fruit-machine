/** 画面震动与漂浮文字：两个机台共用的即时反馈特效。强度受全局设置的动画档位影响。 */
import {settings} from './settings.mjs';

export function createShaker() {
  let power = 0, seed = 0;
  return {
    kick(amount) {power = Math.min(18, power + amount * settings.motion().shake);},
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
        ctx.font = `700 ${item.size}px Georgia, "Noto Serif SC", serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = '#05100a'; ctx.strokeText(item.text, 0, 0);
        ctx.fillStyle = item.color; ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }
    },
  };
}
