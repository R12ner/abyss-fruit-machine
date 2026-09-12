import {createFruitGame} from './game.mjs';

export const fruitGameDefinition=Object.freeze({
  id:'fruit',badge:'NO. 008',title:'深渊水果机',subtitle:'FRUIT MACHINE · 24 格跑灯',enterLabel:'进入机台 →',cardClass:'fruit-card',
  art:'<span class="fruit-card-art" aria-hidden="true"><img src="assets/fruits/apple.png" alt=""><img src="assets/fruits/seven.png" alt=""><img src="assets/fruits/watermelon.png" alt=""></span>',
  create:createFruitGame
});
