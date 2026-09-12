import {createRouletteGame} from './game.mjs';

const chip=value=>`<span class="chip-art card-chip" style="background-image:url('assets/chips/individual/chip-${value}.png')" aria-hidden="true"></span>`;
export const rouletteGameDefinition=Object.freeze({
  id:'roulette',badge:'TABLE 01',title:'欧式轮盘',subtitle:'EUROPEAN ROULETTE · 单零 37 格',enterLabel:'前往赌桌 →',cardClass:'roulette-card',
  art:`<span class="roulette-card-art" aria-hidden="true">${chip(100)}${chip(500)}</span>`,
  create:createRouletteGame
});
