import {ROULETTE_SEQUENCE,describeBet,numberColor,settleBets} from './js/core/roulette.mjs';

const CHIP_VALUES=[1,5,25,100,500,1000,5000,10000];
const CALL_BETS=Object.freeze({
  voisins:{label:'零旁注 Voisins du Zéro',units:9,bets:[['trio-023',2],['split-4-7',1],['split-12-15',1],['split-18-21',1],['split-19-22',1],['corner-25',2],['split-32-35',1]]},
  jeuZero:{label:'零点游戏 Jeu Zéro',units:4,bets:[['split-0-3',1],['split-12-15',1],['number-26',1],['split-32-35',1]]},
  tiers:{label:'轮盘下角注 Tiers du Cylindre',units:6,bets:[['split-5-8',1],['split-10-11',1],['split-13-16',1],['split-23-24',1],['split-27-30',1],['split-33-36',1]]},
  orphelins:{label:'孤注 Orphelins',units:5,bets:[['number-1',1],['split-6-9',1],['split-14-17',1],['split-17-20',1],['split-31-34',1]]}
});
const STORE_KEY='abyss-roulette-state-v2';
const LEGACY_STORE_KEY='abyss-roulette-state-v1';
const REDUCED_MOTION=window.matchMedia('(prefers-reduced-motion: reduce)');
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const money=value=>Number(value).toLocaleString('zh-CN');

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    const legacy=JSON.parse(localStorage.getItem(LEGACY_STORE_KEY)||'null');
    const inventory=CHIP_VALUES.map((_,index)=>Number.isInteger(saved?.inventory?.[index])&&saved.inventory[index]>=0?saved.inventory[index]:0);
    const payoutTray=Array.isArray(saved?.payoutTray)?saved.payoutTray.filter(value=>CHIP_VALUES.includes(value)||value===.5):[];
    const stacks=new Map(Object.entries(saved?.stacks||{}).filter(([id,stack])=>describeBet(id)&&Array.isArray(stack)).map(([id,stack])=>[id,stack.filter(value=>CHIP_VALUES.includes(value))]));
    const selectedChip=CHIP_VALUES.includes(saved?.selectedChip)?saved.selectedChip:1;
    const previousStacks=new Map(Object.entries(saved?.previousStacks||{}).filter(([id,stack])=>describeBet(id)&&Array.isArray(stack)).map(([id,stack])=>[id,stack.filter(value=>CHIP_VALUES.includes(value))]));
    return {inventory,payoutTray,stacks,previousStacks,selectedChip,dealerChip:CHIP_VALUES.includes(saved?.dealerChip)?saved.dealerChip:null,history:Array.isArray(saved?.history)?saved.history.slice(0,12):Array.isArray(legacy?.history)?legacy.history.slice(0,12):[],tableCollapsed:Boolean(saved?.tableCollapsed),halfCredit:saved?.halfCredit===.5?.5:0};
  }catch{return {inventory:CHIP_VALUES.map(()=>0),payoutTray:[],stacks:new Map(),previousStacks:new Map(),selectedChip:1,dealerChip:null,history:[],tableCollapsed:false,halfCredit:0}}
}

const loaded=loadState(),state={...loaded,bets:new Map([...loaded.stacks].map(([id,stack])=>[id,stack.reduce((sum,value)=>sum+value,0)])),actions:[],busy:false,lastResult:null,wheelRotation:0};
function saveState(){try{localStorage.setItem(STORE_KEY,JSON.stringify({inventory:state.inventory,payoutTray:state.payoutTray,stacks:Object.fromEntries(state.stacks),previousStacks:Object.fromEntries(state.previousStacks),selectedChip:state.selectedChip,dealerChip:state.dealerChip,history:state.history,tableCollapsed:state.tableCollapsed,halfCredit:state.halfCredit}))}catch{}}

function chipArt(value,extra='',extraStyle=''){
  if(value===.5)return `<span class="chip-art half-chip ${extra}" style="${extraStyle}" aria-hidden="true">½</span>`;
  const index=CHIP_VALUES.indexOf(value),x=index%4,y=Math.floor(index/4);
  return `<span class="chip-art ${extra}" style="--chip-x:${x*33.333}%;--chip-y:${y?65:26}%;${extraStyle}" aria-hidden="true"></span>`;
}

const gateway=document.createElement('section');
gateway.id='arcade-gateway';gateway.setAttribute('aria-label','深渊赌场入口');
gateway.innerHTML=`
  <div class="gateway-noise" aria-hidden="true"></div>
  <div class="gateway-screen gateway-welcome">
    <div class="gateway-mark">♣</div>
    <p class="gateway-kicker">BENEATH THE CITY · B1</p>
    <h1>深渊赌场</h1><p class="gateway-title-en">ABYSS CASINO</p>
    <div class="hero-chips">${[25,100,500,1000].map((v,i)=>chipArt(v,`hero-chip hero-chip-${i}`)).join('')}</div>
    <button class="gateway-enter" type="button">进入赌场 <span>ENTER</span></button>
    <p class="gateway-disclaimer">虚拟筹码 · 仅供娱乐 · 不支持充值、提现或兑换</p>
  </div>
  <div class="gateway-screen gateway-games" hidden>
    <button class="gateway-back" type="button" aria-label="返回入口">← 返回</button>
    <button class="gateway-sell" type="button">自助出售筹码</button>
    <div class="game-select-heading"><p>ABYSS CASINO · FLOOR B1</p><h2>选择游戏</h2></div>
    <div class="game-cards">
      <button class="game-card fruit-card" type="button" data-game="fruit">
        <span class="machine-number">NO. 008</span>
        <span class="fruit-card-art" aria-hidden="true"><img src="assets/fruits/apple.png" alt=""><img src="assets/fruits/seven.png" alt=""><img src="assets/fruits/watermelon.png" alt=""></span>
        <strong>深渊水果机</strong><small>FRUIT MACHINE · 24 格跑灯</small><span class="card-enter">进入机台 →</span>
      </button>
      <button class="game-card roulette-card" type="button" data-game="roulette">
        <span class="machine-number">TABLE 01</span>
        <span class="roulette-card-art" aria-hidden="true">${chipArt(100,'card-chip')}${chipArt(500,'card-chip')}</span>
        <strong>欧式轮盘</strong><small>EUROPEAN ROULETTE · 单零 37 格</small><span class="card-enter">前往赌桌 →</span>
      </button>
    </div>
  </div>`;
document.body.prepend(gateway);

const roulette=document.createElement('section');
roulette.id='roulette-game';roulette.hidden=true;
roulette.innerHTML=`
  <header class="roulette-header">
    <button type="button" class="casino-menu-button">♣ <span>赌场菜单</span></button>
    <div class="roulette-brand"><small>TABLE 01 · EUROPEAN</small><strong>深渊轮盘</strong></div>
    <button type="button" class="roulette-shop-button">筹码商店</button>
    <button type="button" class="roulette-settings-button" aria-label="打开游戏设置">⚙ 设置</button>
    <div class="roulette-wallet"><span>可用筹码总值</span><output id="roulette-balance"></output></div>
    <button type="button" class="roulette-rules-button" aria-label="查看轮盘规则">?</button>
  </header>
  <main class="roulette-main">
    <div class="roulette-statusbar"><span>单零欧式轮盘</span><output id="roulette-status" aria-live="polite">请先到筹码商店购买筹码</output><span>LA PARTAGE</span></div>
    <div class="roulette-layout">
      <section class="wheel-panel" aria-label="轮盘">
        <div class="wheel-crown"><div class="roulette-pointer" aria-hidden="true"></div><div class="roulette-wheel" id="roulette-wheel"><div class="wheel-disc" id="wheel-disc"></div><div class="ball-track" id="ball-track"><i class="roulette-ball"></i></div><div class="wheel-hub"><span>ABYSS</span><b id="wheel-result">—</b></div></div></div>
        <section class="roulette-payout" id="roulette-payout" aria-label="待领取中奖筹码"><div><span>荷官赔付</span><button type="button" id="dealer-talk">与荷官对话</button><output id="payout-total">0</output></div><p id="payout-empty">中奖筹码会放在这里</p><div class="payout-chip-pile" id="payout-chip-pile"></div></section>
        <div class="recent-results"><span>最近开奖</span><div id="roulette-history"></div><button type="button" id="roulette-refill" hidden>前往筹码商店</button></div>
      </section>
      <section class="betting-panel" aria-label="轮盘下注桌">
        <div class="table-heading"><div><small>EUROPEAN TABLE</small><h2>下注台</h2></div><p>点数字下注 · 点数字边缘可下分注/角注</p><button type="button" id="table-collapse" aria-expanded="true">折叠下注台</button></div>
        <div class="bet-table-scroll"><div id="roulette-table" class="roulette-table"></div></div>
        <div class="bet-summary" id="bet-summary"><span>尚未下注</span></div>
        <section class="roulette-console" aria-label="轮盘控制台"><div class="chip-rack" id="chip-rack" role="radiogroup" aria-label="选择筹码面额"></div><div class="quick-bet"><select id="quick-bet" aria-label="选择固定玩法"><option value="voisins">零旁注 · 9 枚</option><option value="jeuZero">零点游戏 · 4 枚</option><option value="tiers">轮盘下角注 · 6 枚</option><option value="orphelins">孤注 · 5 枚</option></select><button type="button" id="quick-bet-apply" class="table-action">整套下注</button></div><div class="roulette-actions"><button type="button" id="roulette-repeat" class="table-action">重复上次</button><button type="button" id="roulette-undo" class="table-action secondary">撤销</button><button type="button" id="roulette-clear" class="table-action secondary">清空</button></div><div class="roulette-totals"><span>总押</span><output id="roulette-total">0</output><small>USD</small></div><button type="button" id="roulette-spin" class="spin-button"><span>旋转</span><small>SPIN</small></button></section>
      </section>
    </div>
    <p class="roulette-disclosure">筹码需在商店逐枚兑换 · 所有结果使用浏览器安全随机数 · 不支持真钱交易。</p>
  </main>
  <dialog id="roulette-rules" class="roulette-rules">
    <button type="button" class="close roulette-rules-close" aria-label="关闭规则">×</button><span class="rules-kicker">TABLE MANUAL · 单零欧式轮盘</span><h2>轮盘规则</h2>
    <p>轮盘有 0–36 共 37 个号码；0 为绿色，其余为 18 个红色和 18 个黑色。每次旋转相互独立，球停在哪个号码，就按所有覆盖该号码的下注分别结算。</p>
    <table><thead><tr><th>下注</th><th>覆盖号码</th><th>净赔率</th></tr></thead><tbody><tr><td>单号</td><td>1 个</td><td>35:1</td></tr><tr><td>分注</td><td>相邻 2 个</td><td>17:1</td></tr><tr><td>街注 / 三数</td><td>3 个</td><td>11:1</td></tr><tr><td>角注 / 首四</td><td>4 个</td><td>8:1</td></tr><tr><td>双街</td><td>相邻两排 6 个</td><td>5:1</td></tr><tr><td>十二数区 / 列</td><td>12 个</td><td>2:1</td></tr><tr><td>红黑 / 单双 / 大小</td><td>18 个</td><td>1:1</td></tr></tbody></table>
    <p>操作：只可使用水果机 WALLET 在商店逐枚购买筹码。线上的按钮是分注、街注或双街，四格交点是角注；右键或 Shift + 点击可收回一枚当前面额筹码。</p><p>固定玩法会按当前面额整套铺注：零旁注 9 枚、零点游戏 4 枚、轮盘下角注 6 枚、孤注 5 枚；库存不足时整套取消，不会留下残缺下注。</p><p>采用 La Partage 平分规则：开出 0 时，红/黑、单/双、1–18/19–36 六种 1:1 下注立即退还一半本金，其他下注照常结算。半枚筹码会保留，凑满 1 后自动进入 1 元筹码槽。中奖筹码仍需逐枚领取。</p><button type="button" class="roulette-rules-confirm">明白了</button>
  </dialog>
  <dialog id="roulette-shop" class="roulette-shop">
    <button type="button" class="close roulette-shop-close" aria-label="关闭商店">×</button><span class="rules-kicker">CASINO CHIP DESK</span><h2>筹码商店</h2>
    <div class="shop-tabs" role="tablist"><button type="button" data-shop-mode="buy" role="tab">购买筹码</button><button type="button" data-shop-mode="sell" role="tab">出售筹码</button></div>
    <div class="shop-balance"><span>水果机 WALLET</span><output id="fruit-shop-balance">0 USD</output></div>
    <section class="shop-pane" data-shop-pane="buy"><p>点击一种筹码购买一枚，筹码面额就是消耗的水果机模拟 USD。</p><div class="shop-chips" id="shop-chips"></div></section>
    <section class="shop-pane" data-shop-pane="sell" hidden><p>点击一种筹码投入柜台并出售一枚，或者一次出售筹码槽中的全部筹码。</p><div class="shop-chips" id="sell-chips"></div><button type="button" id="sell-all-chips">一键出售全部筹码</button></section>
    <p id="shop-status" class="shop-status" aria-live="polite"></p>
  </dialog>
  <dialog id="dealer-dialog" class="dealer-dialog"><button type="button" class="close dealer-close" aria-label="关闭">×</button><span class="rules-kicker">DEALER PREFERENCE</span><h2>与荷官对话</h2><p>请优先给我：</p><div id="dealer-chip-options" class="dealer-chip-options"></div><p id="dealer-message">只显示您当前已有的筹码面值。</p><button type="button" class="dealer-done">完成</button></dialog>`;
document.body.append(roulette);

function showGateway(screen='games'){
  saveState();stopRouletteMusic();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.body.classList.add('arcade-menu-open');document.body.classList.remove('mode-roulette');roulette.hidden=true;gateway.hidden=false;$('.gateway-welcome',gateway).hidden=screen!=='welcome';$('.gateway-games',gateway).hidden=screen==='welcome';history.replaceState(null,'',location.pathname+location.search);
}
function showFruit(){
  saveState();stopRouletteMusic();gateway.hidden=true;roulette.hidden=true;document.body.classList.remove('arcade-menu-open','mode-roulette');history.replaceState(null,'',location.pathname+location.search+'#fruit');document.dispatchEvent(new CustomEvent('abyss:show-fruit'));window.scrollTo({top:0,behavior:'auto'});
}
function showRoulette(){
  gateway.hidden=true;roulette.hidden=false;document.body.classList.remove('arcade-menu-open');document.body.classList.add('mode-roulette');startRouletteMusic();history.replaceState(null,'',location.pathname+location.search+'#roulette');render();window.scrollTo({top:0,behavior:'auto'});
}

$('.gateway-enter',gateway).onclick=()=>showGateway('games');$('.gateway-back',gateway).onclick=()=>showGateway('welcome');$$('[data-game]',gateway).forEach(button=>button.onclick=()=>button.dataset.game==='fruit'?showFruit():showRoulette());$('.casino-menu-button',roulette).onclick=()=>showGateway('games');
const fruitMenuButton=document.createElement('button');fruitMenuButton.type='button';fruitMenuButton.className='arcade-button utility casino-switch';fruitMenuButton.setAttribute('aria-label','返回赌场菜单');fruitMenuButton.textContent='♣';fruitMenuButton.onclick=()=>showGateway('games');document.querySelector('.header-right')?.prepend(fruitMenuButton);

const wheelDisc=$('#wheel-disc',roulette),stepAngle=360/ROULETTE_SEQUENCE.length;
const stops=ROULETTE_SEQUENCE.map((number,index)=>{const color=numberColor(number)==='red'?'#9f2828':number===0?'#177047':'#141615',start=index*stepAngle,end=(index+1)*stepAngle;return `${color} ${start}deg ${end}deg`});
wheelDisc.style.background=`repeating-conic-gradient(from ${-stepAngle/2}deg,transparent 0 ${stepAngle-.34}deg,#d8bd6b ${stepAngle-.34}deg ${stepAngle}deg),conic-gradient(from ${-stepAngle/2}deg,${stops.join(',')})`;
ROULETTE_SEQUENCE.forEach((number,index)=>{const label=document.createElement('span');label.className=`wheel-pocket ${numberColor(number)}`;label.textContent=number;label.style.setProperty('--pocket-angle',`${index*stepAngle}deg`);label.style.setProperty('--pocket-inverse',`${-index*stepAngle}deg`);wheelDisc.append(label)});

function makeBetButton(id,label,className=''){
  const button=document.createElement('button');button.type='button';button.dataset.betId=id;button.className=`roulette-bet ${className}`.trim();button.setAttribute('aria-label',describeBet(id)?.label||label);button.innerHTML=`<span>${label}</span><span class="bet-stack" aria-hidden="true"></span><output class="bet-amount"></output>`;return button;
}
function addBetButton(container,id,label,className=''){const button=makeBetButton(id,label,className);container.append(button);return button}
function buildTable(){
  const table=$('#roulette-table',roulette),inside=document.createElement('div');inside.className='inside-board';
  const zeroWrap=document.createElement('div');zeroWrap.className='zero-wrap';zeroWrap.append(makeBetButton('number-0','0','number green'));[['split-0-3','zero-line zero-3'],['split-0-2','zero-line zero-2'],['split-0-1','zero-line zero-1'],['trio-023','zero-point zero-23'],['trio-012','zero-point zero-12'],['basket','zero-point zero-basket']].forEach(([id,className])=>zeroWrap.append(makeBetButton(id,'',className)));inside.append(zeroWrap);
  for(let row=0;row<3;row++)for(let street=0;street<12;street++){
    const number=street*3+(3-row),wrap=document.createElement('div');wrap.className='number-wrap';wrap.style.gridColumn=String(street+2);wrap.style.gridRow=String(row+1);wrap.append(makeBetButton(`number-${number}`,number,`number ${numberColor(number)}`));
    if(street<11)wrap.append(makeBetButton(`split-${number}-${number+3}`,'','hotspot split-right'));
    if(row<2)wrap.append(makeBetButton(`split-${number-1}-${number}`,'','hotspot split-down'));
    if(street<11&&row<2)wrap.append(makeBetButton(`corner-${number-1}`,'','hotspot corner'));
    if(row===2)wrap.append(makeBetButton(`street-${street}`,'','street-line'));
    if(row===2&&street<11)wrap.append(makeBetButton(`sixline-${street}`,'','sixline-point'));
    inside.append(wrap);
  }
  [3,2,1].forEach((column,row)=>{const button=makeBetButton(`column-${column}`,'2 TO 1','column-bet');button.style.gridColumn='14';button.style.gridRow=String(row+1);inside.append(button)});table.append(inside);
  const dozens=document.createElement('div');dozens.className='dozen-row';['1ST 12','2ND 12','3RD 12'].forEach((label,index)=>addBetButton(dozens,`dozen-${index+1}`,label,'outside-bet'));table.append(dozens);
  const outside=document.createElement('div');outside.className='outside-row';[['low','1–18'],['even','双 EVEN'],['red','红 RED'],['black','黑 BLACK'],['odd','单 ODD'],['high','19–36']].forEach(([id,label])=>addBetButton(outside,id,label,`outside-bet ${id}`));table.append(outside);
  table.addEventListener('click',event=>{const button=event.target.closest('[data-bet-id]');if(button)adjustBet(button.dataset.betId,event.shiftKey)});table.addEventListener('contextmenu',event=>{const button=event.target.closest('[data-bet-id]');if(!button)return;event.preventDefault();adjustBet(button.dataset.betId,true)});
}
function buildChipRack(){
  const rack=$('#chip-rack',roulette);CHIP_VALUES.forEach(value=>{const button=document.createElement('button');button.type='button';button.className='chip-choice';button.dataset.value=value;button.setAttribute('role','radio');button.setAttribute('aria-label',`${money(value)} USD 筹码槽`);button.innerHTML=`<span class="rack-stack" aria-hidden="true"></span><span class="rack-value">${money(value)}</span><output class="rack-count"></output>`;button.onclick=()=>{if(state.busy||!state.inventory[CHIP_VALUES.indexOf(value)])return;state.selectedChip=value;saveState();render()};button.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',String(value));event.dataTransfer.effectAllowed='move';button.classList.add('dragging')});button.addEventListener('dragend',()=>button.classList.remove('dragging'));button.addEventListener('dragover',event=>{event.preventDefault();button.classList.add('drag-target')});button.addEventListener('dragleave',()=>button.classList.remove('drag-target'));button.addEventListener('drop',event=>{event.preventDefault();button.classList.remove('drag-target');convertChips(Number(event.dataTransfer.getData('text/plain')),value)});rack.append(button)});
}

function totalBet(){return [...state.bets.values()].reduce((sum,value)=>sum+value,0)}
function inventoryTotal(){return state.inventory.reduce((sum,count,index)=>sum+count*CHIP_VALUES[index],0)}
function convertChips(fromValue,toValue){
  if(state.busy||fromValue===toValue||!CHIP_VALUES.includes(fromValue)||!CHIP_VALUES.includes(toValue))return;const from=CHIP_VALUES.indexOf(fromValue),to=CHIP_VALUES.indexOf(toValue);
  if(fromValue>toValue){const count=fromValue/toValue;if(!Number.isInteger(count)||state.inventory[from]<1)return;state.inventory[from]--;state.inventory[to]+=count;setStatus(`已将 1 枚 ${money(fromValue)} 筹码拆为 ${count} 枚 ${money(toValue)} 筹码`)}
  else{const count=toValue/fromValue;if(!Number.isInteger(count)||state.inventory[from]<count){setStatus(`需要 ${count} 枚 ${money(fromValue)} 筹码才能合成 1 枚 ${money(toValue)} 筹码`);return}state.inventory[from]-=count;state.inventory[to]++;setStatus(`已将 ${count} 枚 ${money(fromValue)} 筹码合为 1 枚 ${money(toValue)} 筹码`)}
  state.selectedChip=toValue;saveState();render();playExchangeSound();
}
function chipsForAmount(amount,preferred=state.dealerChip){const chips=[];if(CHIP_VALUES.includes(preferred))while(amount>=preferred){chips.push(preferred);amount-=preferred}for(let index=CHIP_VALUES.length-1;index>=0;index--)while(amount>=CHIP_VALUES[index]){chips.push(CHIP_VALUES[index]);amount-=CHIP_VALUES[index]}if(amount>=.5)chips.push(.5);return chips}
function setStack(id,stack){if(stack.length)state.stacks.set(id,stack);else state.stacks.delete(id);const total=stack.reduce((sum,value)=>sum+value,0);if(total)state.bets.set(id,total);else state.bets.delete(id)}
function adjustBet(id,remove=false){
  if(state.busy||!describeBet(id))return;const amount=state.selectedChip,stack=[...(state.stacks.get(id)||[])];
  const inventoryIndex=CHIP_VALUES.indexOf(amount);
  if(remove){const position=stack.lastIndexOf(amount);if(position<0)return;stack.splice(position,1);state.inventory[inventoryIndex]++;setStack(id,stack);state.actions.push({id,type:'remove',chip:amount,position});setStatus(`已从「${describeBet(id).label}」收回一枚 ${money(amount)} 筹码`);playChipPickup()}
  else{if(state.inventory[inventoryIndex]<=0){setStatus(`没有 ${money(amount)} 筹码，请先到商店购买`);pulseBalance();return}state.inventory[inventoryIndex]--;stack.push(amount);setStack(id,stack);state.actions.push({id,type:'add',chip:amount,position:stack.length-1});setStatus(`已在「${describeBet(id).label}」放置一枚 ${money(amount)} 筹码`);playChipDrop()}saveState();render();
}
function placeCallBet(key){
  const template=CALL_BETS[key];if(state.busy||!template)return;const chip=state.selectedChip,index=CHIP_VALUES.indexOf(chip);
  if(state.inventory[index]<template.units){setStatus(`${template.label} 需要 ${template.units} 枚 ${money(chip)} 筹码，当前数量不足`);pulseBalance();return}
  for(const [id,count] of template.bets){const stack=[...(state.stacks.get(id)||[])];for(let unit=0;unit<count;unit++){stack.push(chip);state.actions.push({id,type:'add',chip,position:stack.length-1})}setStack(id,stack)}
  state.inventory[index]-=template.units;saveState();render();setStatus(`已按 ${template.label} 铺下 ${template.units} 枚筹码，共 ${money(template.units*chip)}`);playChipDrop();
}
function undo(){if(state.busy)return;const action=state.actions.pop();if(!action)return;const stack=[...(state.stacks.get(action.id)||[])],index=CHIP_VALUES.indexOf(action.chip);if(action.type==='add'){const position=stack.lastIndexOf(action.chip);if(position>=0)stack.splice(position,1);state.inventory[index]++}else{stack.splice(Math.min(action.position,stack.length),0,action.chip);state.inventory[index]--}setStack(action.id,stack);saveState();setStatus('已撤销上一步下注');playChipDrop(.45);render()}
function clearBets(){if(state.busy||!state.bets.size)return;for(const stack of state.stacks.values())for(const chip of stack)state.inventory[CHIP_VALUES.indexOf(chip)]++;state.bets.clear();state.stacks.clear();state.actions=[];saveState();setStatus('已清空桌面下注，筹码已放回筹码槽');render()}
function repeatLast(){if(state.busy||state.bets.size||!state.previousStacks.size)return;const needed=CHIP_VALUES.map(()=>0);for(const stack of state.previousStacks.values())for(const chip of stack)needed[CHIP_VALUES.indexOf(chip)]++;if(needed.some((count,index)=>count>state.inventory[index])){setStatus('筹码不足，无法完整重复上次押注');return}needed.forEach((count,index)=>state.inventory[index]-=count);state.stacks=new Map([...state.previousStacks].map(([id,stack])=>[id,[...stack]]));state.bets=new Map([...state.stacks].map(([id,stack])=>[id,stack.reduce((sum,value)=>sum+value,0)]));state.actions=[];saveState();render();setStatus('已完整恢复上次押注');playChipDrop()}
function setStatus(message){$('#roulette-status',roulette).textContent=message}
function pulseBalance(){const node=$('.roulette-wallet',roulette);node.classList.remove('pulse');requestAnimationFrame(()=>node.classList.add('pulse'))}
function secureNumber(max){const limit=Math.floor(0x100000000/max)*max,buffer=new Uint32Array(1);do{crypto.getRandomValues(buffer)}while(buffer[0]>=limit);return buffer[0]%max}
function sfxLevel(){try{const saved=JSON.parse(localStorage.getItem('abyss-fruit-arcade-audio-v1')||'null');return Number.isFinite(saved?.sfx)?saved.sfx:.68}catch{return .68}}
function musicLevel(){try{const saved=JSON.parse(localStorage.getItem('abyss-fruit-arcade-audio-v1')||'null');return Number.isFinite(saved?.music)?saved.music:.32}catch{return .32}}
function playTone(frequency,duration=.08){try{const level=sfxLevel();if(level<=0)return;const AudioContext=window.AudioContext||window.webkitAudioContext,context=playTone.context??=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.035*level,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+duration)}catch{}}
function soundBurst(frequencies,duration=.1,level=1,type='triangle'){try{const volume=sfxLevel();if(volume<=0)return;const AudioContext=window.AudioContext||window.webkitAudioContext,context=playTone.context??=new AudioContext(),now=context.currentTime;frequencies.forEach((frequency,index)=>{const oscillator=context.createOscillator(),gain=context.createGain(),start=now+index*.018;oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(Math.max(70,frequency*.68),start+duration);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.026*volume*level/(index+1),start+.004);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+duration)})}catch{}}
function playChipDrop(level=1){if(document.activeElement?.dataset?.chipBuy){playExchangeSound();return}soundBurst([185,310,118],.14,level,'sine')}
function playChipPickup(){soundBurst([1640,2480,920],.075,1,'triangle')}
function playExchangeSound(){soundBurst([720,980,1280,1740],.09,.9,'triangle')}
function playCashRegister(){soundBurst([520,780,1040,2080],.18,1,'square')}
let rouletteMusicTimer=0,rouletteMusicStep=0;
function rouletteMusicNote(){try{const volume=musicLevel();if(volume<=0||!document.body.classList.contains('mode-roulette'))return;const notes=[110,138.59,164.81,196,164.81,146.83,123.47,146.83],AudioContext=window.AudioContext||window.webkitAudioContext,context=playTone.context??=new AudioContext(),now=context.currentTime,oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=notes[rouletteMusicStep++%notes.length];gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.026*volume,now+.12);gain.gain.exponentialRampToValueAtTime(.0001,now+1.7);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now);oscillator.stop(now+1.8)}catch{}}
function startRouletteMusic(){if(rouletteMusicTimer)return;rouletteMusicNote();rouletteMusicTimer=setInterval(rouletteMusicNote,900)}
function stopRouletteMusic(){clearInterval(rouletteMusicTimer);rouletteMusicTimer=0}
function spin(){
  if(state.busy)return;const stake=totalBet();if(!stake){setStatus('请先在桌面放置筹码');return}let result;
  try{result=secureNumber(37)}catch{setStatus('安全随机数暂不可用，本轮未扣款');return}
  state.previousStacks=new Map([...state.stacks].map(([id,stack])=>[id,[...stack]]));state.busy=true;state.lastResult=null;render();setStatus('停止下注 · 轮盘旋转中');const index=ROULETTE_SEQUENCE.indexOf(result),base=Math.ceil(state.wheelRotation/360)*360+(REDUCED_MOTION.matches?360:1800);state.wheelRotation=base-index*stepAngle;
  const wheel=$('#roulette-wheel',roulette),ball=$('#ball-track',roulette);wheel.style.setProperty('--wheel-rotation',`${state.wheelRotation}deg`);wheel.style.setProperty('--wheel-counter-rotation',`${-state.wheelRotation}deg`);wheel.classList.add('spinning');ball.classList.remove('orbiting');void ball.offsetWidth;ball.classList.add('orbiting');const duration=REDUCED_MOTION.matches?180:4300;const tickTimer=REDUCED_MOTION.matches?null:setInterval(()=>playTone(260+secureNumber(5)*34,.025),110);
  setTimeout(()=>{if(tickTimer)clearInterval(tickTimer);wheel.classList.remove('spinning');ball.classList.remove('orbiting');const settlement=settleBets(state.bets,result);state.payoutTray.push(...chipsForAmount(settlement.returned));state.history.unshift(result);state.history=state.history.slice(0,12);state.lastResult=result;state.busy=false;state.bets.clear();state.stacks.clear();state.actions=[];saveState();render();if(settlement.returned){const winLabels=settlement.wins.map(win=>win.label).join('、');setStatus(`开出 ${result} · ${winLabels} 命中 · 请逐枚领取 ${money(settlement.returned)} 筹码`);playTone(720,.35)}else{setStatus(`开出 ${result} · 本轮未中奖`);playTone(150,.35)}},duration);
}
function renderHistory(){const history=$('#roulette-history',roulette);history.replaceChildren();if(!state.history.length){history.innerHTML='<span class="history-empty">暂无</span>';return}state.history.forEach(number=>{const item=document.createElement('i');item.className=numberColor(number);item.textContent=number;history.append(item)})}
function renderPayout(){const pile=$('#payout-chip-pile',roulette),total=state.payoutTray.reduce((sum,value)=>sum+value,0);$('#payout-total',roulette).textContent=total?`${money(total)} 筹码`:'0';$('#payout-empty',roulette).hidden=state.payoutTray.length>0;pile.replaceChildren();state.payoutTray.forEach((value,index)=>{const button=document.createElement('button');button.type='button';button.dataset.payoutIndex=index;button.style.setProperty('--payout-lift',`${index%3*-2}px`);button.style.setProperty('--payout-angle',`${(index%5-2)*3}deg`);button.setAttribute('aria-label',`领取一枚 ${money(value)} 筹码`);button.innerHTML=chipArt(value,'payout-chip');pile.append(button)})}
function renderSummary(){const summary=$('#bet-summary',roulette);summary.replaceChildren();if(!state.bets.size){summary.innerHTML='<span>尚未下注</span>';return}[...state.bets].slice(0,7).forEach(([id,amount])=>{const bet=describeBet(id),item=document.createElement('span');item.innerHTML=`${bet.label} <b>${money(amount)}</b>`;summary.append(item)});if(state.bets.size>7){const more=document.createElement('span');more.textContent=`另有 ${state.bets.size-7} 注`;summary.append(more)}}
function render(){
  const total=totalBet();$('#roulette-balance',roulette).textContent=money(inventoryTotal()+state.halfCredit);$('#roulette-total',roulette).textContent=money(total);$('#wheel-result',roulette).textContent=state.lastResult??'—';$('#wheel-result',roulette).className=state.lastResult===null?'':numberColor(state.lastResult);
  $('.roulette-layout',roulette).classList.toggle('table-collapsed',state.tableCollapsed);$('#table-collapse',roulette).setAttribute('aria-expanded',String(!state.tableCollapsed));$('#table-collapse',roulette).textContent=state.tableCollapsed?'展开下注台':'折叠下注台';
  $$('.chip-choice',roulette).forEach(button=>{const value=Number(button.dataset.value),index=CHIP_VALUES.indexOf(value),count=state.inventory[index],selected=value===state.selectedChip&&count>0,stack=$('.rack-stack',button),countNode=$('.rack-count',button);button.draggable=!state.busy&&count>0;button.classList.toggle('selected',selected);button.classList.toggle('empty',count===0);button.setAttribute('aria-checked',String(selected));button.setAttribute('aria-disabled',String(state.busy));button.setAttribute('aria-label',`${money(value)} 筹码，剩余 ${count} 枚，可拖到其他筹码槽兑换`);button.disabled=state.busy;stack.innerHTML=Array.from({length:Math.min(count,8)},(_,layer)=>chipArt(value,'rack-chip',`--rack-layer:${layer}`)).join('');countNode.textContent=count?`×${count}`:''});
  $$('[data-bet-id]',roulette).forEach(button=>{const id=button.dataset.betId,amount=state.bets.get(id)||0,stack=state.stacks.get(id)||[];button.classList.toggle('has-bet',amount>0);const output=$('.bet-amount',button),stackNode=$('.bet-stack',button);if(output)output.textContent=amount?money(amount):'';if(stackNode)stackNode.innerHTML=stack.slice(-5).map((value,index)=>chipArt(value,`table-chip stack-${index}`)).join('');button.disabled=state.busy});
  $('#roulette-undo',roulette).disabled=state.busy||!state.actions.length;$('#roulette-clear',roulette).disabled=state.busy||!state.bets.size;$('#roulette-repeat',roulette).disabled=state.busy||state.bets.size>0||!state.previousStacks.size;$('#quick-bet-apply',roulette).disabled=state.busy;$('#roulette-spin',roulette).disabled=state.busy||!state.bets.size;$('#roulette-refill',roulette).hidden=inventoryTotal()>0||state.bets.size>0||state.payoutTray.length>0||state.busy;renderHistory();renderPayout();renderSummary();
}

function fruitBalance(){const request={balance:0};window.dispatchEvent(new CustomEvent('abyss:fruit-balance-request',{detail:request}));return request.balance}
const shop=$('#roulette-shop',roulette);document.body.append(shop);const dealerDialog=$('#dealer-dialog',roulette);document.body.append(dealerDialog);const shopStatus=$('#shop-status',shop);let shopMode='buy';
function setShopMode(mode){shopMode=mode;$$('[data-shop-mode]',shop).forEach(button=>{const active=button.dataset.shopMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});$$('[data-shop-pane]',shop).forEach(pane=>pane.hidden=pane.dataset.shopPane!==mode)}
function sellChips(value,count){const index=CHIP_VALUES.indexOf(value),quantity=Math.min(count,state.inventory[index]);if(quantity<=0)return false;const amount=value*quantity,request={amount,accepted:false};window.dispatchEvent(new CustomEvent('abyss:sell-roulette-chips',{detail:request}));if(!request.accepted)return false;state.inventory[index]-=quantity;saveState();render();playCashRegister();return amount}
function renderShop(){const balance=fruitBalance();$('#fruit-shop-balance',shop).textContent=`${money(balance)} USD`;$$('[data-chip-buy]',shop).forEach(button=>{const value=Number(button.dataset.chipBuy),count=state.inventory[CHIP_VALUES.indexOf(value)];button.disabled=value>balance;$('.shop-owned',button).textContent=count?`已拥有 ${count} 枚`:'尚未拥有'});$$('[data-chip-sell]',shop).forEach(button=>{const value=Number(button.dataset.chipSell),count=state.inventory[CHIP_VALUES.indexOf(value)];button.disabled=count===0;$('.shop-owned',button).textContent=count?`可出售 ${count} 枚`:'空'});$('#sell-all-chips',shop).disabled=inventoryTotal()===0;setShopMode(shopMode)}
function buildShop(){const buyRack=$('#shop-chips',shop),sellRack=$('#sell-chips',shop);CHIP_VALUES.forEach(value=>{const buy=document.createElement('button');buy.type='button';buy.dataset.chipBuy=value;buy.setAttribute('aria-label',`购买一枚 ${money(value)} 筹码，价格 ${money(value)} USD`);buy.innerHTML=`<span class="shop-chip-stack">${chipArt(value,'shop-chip')}</span><b>${money(value)}</b><span>购买一枚</span><small>${money(value)} USD</small><em class="shop-owned"></em>`;buy.onclick=()=>{const request={cost:value,accepted:false};window.dispatchEvent(new CustomEvent('abyss:buy-roulette-chips',{detail:request}));if(!request.accepted){shopStatus.textContent='水果机 WALLET 余额不足。';renderShop();return}const index=CHIP_VALUES.indexOf(value);state.inventory[index]++;state.selectedChip=value;saveState();render();renderShop();shopStatus.textContent=`已购买一枚 ${money(value)} 筹码。`;playChipDrop()};buyRack.append(buy);const sell=document.createElement('button');sell.type='button';sell.dataset.chipSell=value;sell.setAttribute('aria-label',`出售一枚 ${money(value)} 筹码`);sell.innerHTML=`<span class="shop-chip-stack">${chipArt(value,'shop-chip')}</span><b>${money(value)}</b><span>投入并出售一枚</span><small>换回 ${money(value)} USD</small><em class="shop-owned"></em>`;sell.onclick=()=>{const sold=sellChips(value,1);shopStatus.textContent=sold?`已出售一枚 ${money(value)} 筹码，水果机钱包增加 ${money(sold)} USD。`:'暂时无法出售这枚筹码。';renderShop()};sellRack.append(sell)})}
function openShop(mode='buy'){if(state.busy)return;shopMode=mode;shopStatus.textContent='';renderShop();shop.showModal()}
function openDealerDialog(){const options=$('#dealer-chip-options',dealerDialog);options.replaceChildren();CHIP_VALUES.forEach((value,index)=>{if(state.inventory[index]<=0)return;const button=document.createElement('button');button.type='button';button.dataset.dealerChip=value;button.classList.toggle('selected',state.dealerChip===value);button.setAttribute('aria-pressed',String(state.dealerChip===value));button.setAttribute('aria-label',`优先获得 ${money(value)} 面值筹码`);button.innerHTML=chipArt(value,'dealer-chip')+`<span>${money(value)}</span>`;button.onclick=()=>{state.dealerChip=value;saveState();openDealerDialog();$('#dealer-message',dealerDialog).textContent=`荷官：好的，赔付时优先给您 ${money(value)} 面值的筹码。`};options.append(button)});if(!options.children.length)options.innerHTML='<span class="dealer-empty">当前没有可选择的筹码面值</span>';if(!dealerDialog.open)dealerDialog.showModal()}
buildShop();
buildTable();buildChipRack();$('#roulette-undo',roulette).onclick=undo;$('#roulette-clear',roulette).onclick=clearBets;$('#roulette-repeat',roulette).onclick=repeatLast;$('#quick-bet-apply',roulette).onclick=()=>placeCallBet($('#quick-bet',roulette).value);$('#roulette-spin',roulette).onclick=spin;
$('#payout-chip-pile',roulette).onclick=event=>{const button=event.target.closest('[data-payout-index]');if(!button)return;const index=Number(button.dataset.payoutIndex),value=state.payoutTray[index];if(!CHIP_VALUES.includes(value)&&value!==.5)return;state.payoutTray.splice(index,1);if(value===.5){state.halfCredit+=.5;if(state.halfCredit>=1){state.halfCredit-=1;state.inventory[0]++;state.selectedChip=1}}else{state.inventory[CHIP_VALUES.indexOf(value)]++;state.selectedChip=value}saveState();render();setStatus(value===.5?'已领取半枚筹码；两枚半筹码会自动合为 1':`已领取一枚 ${money(value)} 筹码`);playChipPickup()};
$$('[data-shop-mode]',shop).forEach(button=>button.onclick=()=>{shopMode=button.dataset.shopMode;shopStatus.textContent='';renderShop()});
$('#sell-all-chips',shop).onclick=()=>{const total=inventoryTotal();if(!total)return;const request={amount:total,accepted:false};window.dispatchEvent(new CustomEvent('abyss:sell-roulette-chips',{detail:request}));if(!request.accepted){shopStatus.textContent='当前暂时无法出售筹码。';return}state.inventory.fill(0);saveState();render();renderShop();shopStatus.textContent=`已一键出售全部筹码，水果机钱包增加 ${money(total)} USD。`;playCashRegister()};
$('.roulette-shop-button',roulette).onclick=()=>openShop('buy');$('.roulette-settings-button',roulette).onclick=()=>document.querySelector('#settings')?.click();$('#roulette-refill',roulette).onclick=()=>openShop('buy');$('.gateway-sell',gateway).onclick=()=>openShop('sell');$('.roulette-shop-close',shop).onclick=()=>shop.close();
$('#dealer-talk',roulette).onclick=openDealerDialog;$('.dealer-close',dealerDialog).onclick=()=>dealerDialog.close();$('.dealer-done',dealerDialog).onclick=()=>dealerDialog.close();
$('#table-collapse',roulette).onclick=()=>{state.tableCollapsed=!state.tableCollapsed;saveState();render()};
const rules=$('#roulette-rules',roulette);$('.roulette-rules-button',roulette).onclick=()=>rules.showModal();$('.roulette-rules-close',rules).onclick=()=>rules.close();$('.roulette-rules-confirm',rules).onclick=()=>rules.close();document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!rules.open&&document.body.classList.contains('mode-roulette'))showGateway('games')});render();
showGateway('welcome');
