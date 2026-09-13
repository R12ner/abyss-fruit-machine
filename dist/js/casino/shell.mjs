import {openSettings} from './settings-dialog.mjs';

const $=(selector,root=document)=>root.querySelector(selector);

function gameCard(definition){
  return `<button class="game-card ${definition.cardClass||''}" type="button" data-game="${definition.id}">
    <span class="machine-number">${definition.badge}</span>
    ${definition.art||''}
    <strong>${definition.title}</strong><small>${definition.subtitle}</small><span class="card-enter">${definition.enterLabel||'进入游戏 →'}</span>
  </button>`;
}

export function createCasinoShell(registry){
  const gateway=document.createElement('section');gateway.id='arcade-gateway';gateway.setAttribute('aria-label','深渊赌场入口');
  gateway.innerHTML=`<div class="gateway-noise" aria-hidden="true"></div>
    <div class="gateway-screen gateway-welcome"><div class="gateway-mark">♣</div><p class="gateway-kicker">BENEATH THE CITY · B1</p><h1>深渊赌场</h1><p class="gateway-title-en">ABYSS CASINO</p><div class="hero-chips">${[25,100,500,1000].map((value,index)=>`<span class="chip-art hero-chip hero-chip-${index}" style="background-image:url('assets/chips/individual/chip-${value}.png')" aria-hidden="true"></span>`).join('')}</div><button class="gateway-enter" type="button">进入赌场 <span>ENTER</span></button><p class="gateway-disclaimer">虚拟筹码 · 仅供娱乐 · 不支持充值、提现或兑换</p></div>
    <div class="gateway-screen gateway-games" hidden><button class="gateway-back" type="button" aria-label="返回入口">← 返回</button><div class="gateway-actions"><button class="gateway-action gateway-settings" type="button">⚙ 设置</button></div><div class="game-select-heading"><p>ABYSS CASINO · FLOOR B1</p><h2>选择游戏</h2></div><div class="game-cards"></div></div>`;
  document.body.prepend(gateway);

  function render(){
    const games=registry.list();$('.game-cards',gateway).innerHTML=games.map(gameCard).join('');
    const actions=$('.gateway-actions',gateway);
    const settingsButton=$('.gateway-settings',gateway);
    actions.replaceChildren(settingsButton);
    for(const game of games)for(const action of game.instance?.lobbyActions||[]){const button=document.createElement('button');button.type='button';button.className=`gateway-action ${action.className||''}`;button.textContent=action.label;button.onclick=action.run;actions.append(button)}
  }
  function show(screen='games'){
    registry.leave();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.body.classList.add('arcade-menu-open');document.body.classList.remove('mode-roulette','mode-fruit','mode-mechanical','mode-coin-pusher','mode-plinko');gateway.hidden=false;$('.gateway-welcome',gateway).hidden=screen!=='welcome';$('.gateway-games',gateway).hidden=screen==='welcome';history.replaceState(null,'',location.pathname+location.search);render();
  }
  function enter(id){gateway.hidden=true;document.body.classList.remove('arcade-menu-open');registry.enter(id);history.replaceState(null,'',`${location.pathname}${location.search}#${id}`);window.scrollTo({top:0,behavior:'auto'})}
  gateway.addEventListener('click',event=>{const card=event.target.closest('[data-game]');if(card)enter(card.dataset.game)});
  $('.gateway-enter',gateway).onclick=()=>show('games');$('.gateway-back',gateway).onclick=()=>show('welcome');
  $('.gateway-settings',gateway).onclick=()=>openSettings();
  return Object.freeze({show,enter,render,gateway});
}
