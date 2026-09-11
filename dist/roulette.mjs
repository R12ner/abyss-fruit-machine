import {ROULETTE_SEQUENCE,describeBet,numberColor,settleBets} from './js/core/roulette.mjs';

const CHIP_VALUES=[1,5,25,100,500,1000,5000,10000];
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
    const stacks=new Map(Object.entries(saved?.stacks||{}).filter(([id,stack])=>describeBet(id)&&Array.isArray(stack)).map(([id,stack])=>[id,stack.filter(value=>CHIP_VALUES.includes(value))]));
    const selectedChip=CHIP_VALUES.includes(saved?.selectedChip)?saved.selectedChip:1;
    return {inventory,stacks,selectedChip,history:Array.isArray(saved?.history)?saved.history.slice(0,12):Array.isArray(legacy?.history)?legacy.history.slice(0,12):[],tableCollapsed:Boolean(saved?.tableCollapsed)};
  }catch{return {inventory:CHIP_VALUES.map(()=>0),stacks:new Map(),selectedChip:1,history:[],tableCollapsed:false}}
}

const loaded=loadState(),state={...loaded,bets:new Map([...loaded.stacks].map(([id,stack])=>[id,stack.reduce((sum,value)=>sum+value,0)])),actions:[],busy:false,lastResult:null,wheelRotation:0};
function saveState(){try{localStorage.setItem(STORE_KEY,JSON.stringify({inventory:state.inventory,stacks:Object.fromEntries(state.stacks),selectedChip:state.selectedChip,history:state.history,tableCollapsed:state.tableCollapsed}))}catch{}}

function chipArt(value,extra='',extraStyle=''){
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
    <div class="roulette-wallet"><span>可用筹码总值</span><output id="roulette-balance"></output></div>
    <button type="button" class="roulette-rules-button" aria-label="查看轮盘规则">?</button>
  </header>
  <main class="roulette-main">
    <div class="roulette-statusbar"><span>单零欧式轮盘</span><output id="roulette-status" aria-live="polite">请先到筹码商店购买筹码</output><span>RTP 97.30%</span></div>
    <div class="roulette-layout">
      <section class="wheel-panel" aria-label="轮盘">
        <div class="wheel-crown"><div class="roulette-pointer" aria-hidden="true"></div><div class="roulette-wheel" id="roulette-wheel"><div class="wheel-disc" id="wheel-disc"></div><div class="ball-track" id="ball-track"><i class="roulette-ball"></i></div><div class="wheel-hub"><span>ABYSS</span><b id="wheel-result">—</b></div></div></div>
        <div class="recent-results"><span>最近开奖</span><div id="roulette-history"></div><button type="button" id="roulette-refill" hidden>前往筹码商店</button></div>
      </section>
      <section class="betting-panel" aria-label="轮盘下注桌">
        <div class="table-heading"><div><small>EUROPEAN TABLE</small><h2>下注台</h2></div><p>点数字下注 · 点数字边缘可下分注/角注</p><button type="button" id="table-collapse" aria-expanded="true">折叠下注台</button></div>
        <div class="bet-table-scroll"><div id="roulette-table" class="roulette-table"></div></div>
        <div class="bet-summary" id="bet-summary"><span>尚未下注</span></div>
      </section>
    </div>
    <section class="roulette-console" aria-label="轮盘控制台"><div class="chip-rack" id="chip-rack" role="radiogroup" aria-label="选择筹码面额"></div><div class="roulette-totals"><span>总押</span><output id="roulette-total">0</output><small>USD</small></div><button type="button" id="roulette-undo" class="table-action secondary">撤销</button><button type="button" id="roulette-clear" class="table-action secondary">清空</button><button type="button" id="roulette-spin" class="spin-button"><span>旋转</span><small>SPIN</small></button></section>
    <p class="roulette-disclosure">筹码需在商店逐枚兑换 · 所有结果使用浏览器安全随机数 · 不支持真钱交易。</p>
  </main>
  <dialog id="roulette-rules" class="roulette-rules">
    <button type="button" class="close roulette-rules-close" aria-label="关闭规则">×</button><span class="rules-kicker">TABLE MANUAL · 单零欧式轮盘</span><h2>轮盘规则</h2>
    <p>轮盘有 0–36 共 37 个号码；0 为绿色，其余为 18 个红色和 18 个黑色。每次旋转相互独立，球停在哪个号码，就按所有覆盖该号码的下注分别结算。</p>
    <table><thead><tr><th>下注</th><th>覆盖号码</th><th>净赔率</th></tr></thead><tbody><tr><td>单号</td><td>1 个</td><td>35:1</td></tr><tr><td>分注</td><td>相邻 2 个</td><td>17:1</td></tr><tr><td>街注 / 三数</td><td>3 个</td><td>11:1</td></tr><tr><td>角注 / 首四</td><td>4 个</td><td>8:1</td></tr><tr><td>双街</td><td>相邻两排 6 个</td><td>5:1</td></tr><tr><td>十二数区 / 列</td><td>12 个</td><td>2:1</td></tr><tr><td>红黑 / 单双 / 大小</td><td>18 个</td><td>1:1</td></tr></tbody></table>
    <p>操作：先在商店逐枚购买筹码，再从下方筹码槽选择面额并点击号码或外部下注区。号码之间的细长触点是分注，四格交点是角注；“街”覆盖一排三个号码，街与街之间的小菱形是双街。右键或 Shift + 点击可收回该位置的一枚当前面额筹码。</p><p>赔率是净赢金额；中奖时系统还会返还该注本金，并自动换成可用筹码放回下方筹码槽。0 不属于红黑、单双、大小、十二数区或列，因此开出 0 时这些外部下注均输。离开轮盘时，筹码库存和桌面押注会保存在当前浏览器。</p><button type="button" class="roulette-rules-confirm">明白了</button>
  </dialog>
  <dialog id="roulette-shop" class="roulette-shop">
    <button type="button" class="close roulette-shop-close" aria-label="关闭商店">×</button><span class="rules-kicker">CASINO CHIP DESK</span><h2>筹码商店</h2>
    <p>点击一种筹码购买一枚，筹码面额就是消耗的水果机模拟 USD。买几枚，筹码槽就叠几层。</p><div class="shop-balance"><span>水果机可用资金</span><output id="fruit-shop-balance">0 USD</output></div>
    <div class="shop-chips" id="shop-chips"></div>
    <p id="shop-status" class="shop-status" aria-live="polite"></p>
  </dialog>`;
document.body.append(roulette);

function showGateway(screen='games'){
  saveState();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.body.classList.add('arcade-menu-open');document.body.classList.remove('mode-roulette');roulette.hidden=true;gateway.hidden=false;$('.gateway-welcome',gateway).hidden=screen!=='welcome';$('.gateway-games',gateway).hidden=screen==='welcome';history.replaceState(null,'',location.pathname+location.search);
}
function showFruit(){
  saveState();gateway.hidden=true;roulette.hidden=true;document.body.classList.remove('arcade-menu-open','mode-roulette');history.replaceState(null,'',location.pathname+location.search+'#fruit');document.dispatchEvent(new CustomEvent('abyss:show-fruit'));window.scrollTo({top:0,behavior:'auto'});
}
function showRoulette(){
  gateway.hidden=true;roulette.hidden=false;document.body.classList.remove('arcade-menu-open');document.body.classList.add('mode-roulette');history.replaceState(null,'',location.pathname+location.search+'#roulette');render();window.scrollTo({top:0,behavior:'auto'});
}

$('.gateway-enter',gateway).onclick=()=>showGateway('games');$('.gateway-back',gateway).onclick=()=>showGateway('welcome');$$('[data-game]',gateway).forEach(button=>button.onclick=()=>button.dataset.game==='fruit'?showFruit():showRoulette());$('.casino-menu-button',roulette).onclick=()=>showGateway('games');
const fruitMenuButton=document.createElement('button');fruitMenuButton.type='button';fruitMenuButton.className='arcade-button utility casino-switch';fruitMenuButton.setAttribute('aria-label','返回赌场菜单');fruitMenuButton.textContent='♣';fruitMenuButton.onclick=()=>showGateway('games');document.querySelector('.header-right')?.prepend(fruitMenuButton);

const wheelDisc=$('#wheel-disc',roulette),stepAngle=360/ROULETTE_SEQUENCE.length;
const stops=ROULETTE_SEQUENCE.map((number,index)=>{const color=numberColor(number)==='red'?'#9f2828':number===0?'#177047':'#141615',start=index*stepAngle-stepAngle/2,end=(index+1)*stepAngle-stepAngle/2;return `${color} ${start}deg ${end}deg`});
wheelDisc.style.background=`conic-gradient(from 0deg,${stops.join(',')})`;
ROULETTE_SEQUENCE.forEach((number,index)=>{const label=document.createElement('span');label.className=`wheel-pocket ${numberColor(number)}`;label.textContent=number;label.style.setProperty('--pocket-angle',`${index*stepAngle}deg`);label.style.setProperty('--pocket-inverse',`${-index*stepAngle}deg`);wheelDisc.append(label)});

function makeBetButton(id,label,className=''){
  const button=document.createElement('button');button.type='button';button.dataset.betId=id;button.className=`roulette-bet ${className}`.trim();button.innerHTML=`<span>${label}</span><span class="bet-stack" aria-hidden="true"></span><output class="bet-amount"></output>`;return button;
}
function addBetButton(container,id,label,className=''){const button=makeBetButton(id,label,className);container.append(button);return button}
function buildTable(){
  const table=$('#roulette-table',roulette),inside=document.createElement('div');inside.className='inside-board';
  const zeroWrap=document.createElement('div');zeroWrap.className='zero-wrap';zeroWrap.append(makeBetButton('number-0','0','number green'));zeroWrap.append(makeBetButton('basket','首四','basket-hotspot'));inside.append(zeroWrap);
  for(let row=0;row<3;row++)for(let street=0;street<12;street++){
    const number=street*3+(3-row),wrap=document.createElement('div');wrap.className='number-wrap';wrap.style.gridColumn=String(street+2);wrap.style.gridRow=String(row+1);wrap.append(makeBetButton(`number-${number}`,number,`number ${numberColor(number)}`));
    if(street<11)wrap.append(makeBetButton(`split-${number}-${number+3}`,'','hotspot split-right'));
    if(row<2)wrap.append(makeBetButton(`split-${number-1}-${number}`,'','hotspot split-down'));
    if(street<11&&row<2)wrap.append(makeBetButton(`corner-${number-1}`,'','hotspot corner'));
    inside.append(wrap);
  }
  [3,2,1].forEach((column,row)=>{const button=makeBetButton(`column-${column}`,'2 TO 1','column-bet');button.style.gridColumn='14';button.style.gridRow=String(row+1);inside.append(button)});table.append(inside);
  const streetRow=document.createElement('div');streetRow.className='street-row';
  for(let street=0;street<12;street++){const wrap=document.createElement('div');wrap.className='street-wrap';const first=street*3+1;wrap.append(makeBetButton(`street-${street}`,`${first}–${first+2}`,'street-bet'));if(street<11)wrap.append(makeBetButton(`sixline-${street}`,'◆','sixline-hotspot'));streetRow.append(wrap)}table.append(streetRow);
  const zeroSpecials=document.createElement('div');zeroSpecials.className='zero-special-row';[['split-0-1','0·1'],['split-0-2','0·2'],['split-0-3','0·3'],['trio-012','0·1·2'],['trio-023','0·2·3']].forEach(([id,label])=>addBetButton(zeroSpecials,id,label,'zero-special'));table.append(zeroSpecials);
  const dozens=document.createElement('div');dozens.className='dozen-row';['1ST 12','2ND 12','3RD 12'].forEach((label,index)=>addBetButton(dozens,`dozen-${index+1}`,label,'outside-bet'));table.append(dozens);
  const outside=document.createElement('div');outside.className='outside-row';[['low','1–18'],['even','双 EVEN'],['red','红 RED'],['black','黑 BLACK'],['odd','单 ODD'],['high','19–36']].forEach(([id,label])=>addBetButton(outside,id,label,`outside-bet ${id}`));table.append(outside);
  table.addEventListener('click',event=>{const button=event.target.closest('[data-bet-id]');if(button)adjustBet(button.dataset.betId,event.shiftKey)});table.addEventListener('contextmenu',event=>{const button=event.target.closest('[data-bet-id]');if(!button)return;event.preventDefault();adjustBet(button.dataset.betId,true)});
}
function buildChipRack(){
  const rack=$('#chip-rack',roulette);CHIP_VALUES.forEach(value=>{const button=document.createElement('button');button.type='button';button.className='chip-choice';button.dataset.value=value;button.setAttribute('role','radio');button.setAttribute('aria-label',`${money(value)} USD 筹码槽`);button.innerHTML=`<span class="rack-stack" aria-hidden="true"></span><span class="rack-value">${money(value)}</span><output class="rack-count"></output>`;button.onclick=()=>{if(state.busy||!state.inventory[CHIP_VALUES.indexOf(value)])return;state.selectedChip=value;saveState();render()};rack.append(button)});
}

function totalBet(){return [...state.bets.values()].reduce((sum,value)=>sum+value,0)}
function inventoryTotal(){return state.inventory.reduce((sum,count,index)=>sum+count*CHIP_VALUES[index],0)}
function addWinnings(amount){for(let index=CHIP_VALUES.length-1;index>=0;index--)while(amount>=CHIP_VALUES[index]){state.inventory[index]++;amount-=CHIP_VALUES[index]}}
function setStack(id,stack){if(stack.length)state.stacks.set(id,stack);else state.stacks.delete(id);const total=stack.reduce((sum,value)=>sum+value,0);if(total)state.bets.set(id,total);else state.bets.delete(id)}
function adjustBet(id,remove=false){
  if(state.busy||!describeBet(id))return;const amount=state.selectedChip,stack=[...(state.stacks.get(id)||[])];
  const inventoryIndex=CHIP_VALUES.indexOf(amount);
  if(remove){const position=stack.lastIndexOf(amount);if(position<0)return;stack.splice(position,1);state.inventory[inventoryIndex]++;setStack(id,stack);state.actions.push({id,type:'remove',chip:amount,position});setStatus(`已从「${describeBet(id).label}」收回一枚 ${money(amount)} 筹码`);playChipDrop(.55)}
  else{if(state.inventory[inventoryIndex]<=0){setStatus(`没有 ${money(amount)} 筹码，请先到商店购买`);pulseBalance();return}state.inventory[inventoryIndex]--;stack.push(amount);setStack(id,stack);state.actions.push({id,type:'add',chip:amount,position:stack.length-1});setStatus(`已在「${describeBet(id).label}」放置一枚 ${money(amount)} 筹码`);playChipDrop()}saveState();render();
}
function undo(){if(state.busy)return;const action=state.actions.pop();if(!action)return;const stack=[...(state.stacks.get(action.id)||[])],index=CHIP_VALUES.indexOf(action.chip);if(action.type==='add'){const position=stack.lastIndexOf(action.chip);if(position>=0)stack.splice(position,1);state.inventory[index]++}else{stack.splice(Math.min(action.position,stack.length),0,action.chip);state.inventory[index]--}setStack(action.id,stack);saveState();setStatus('已撤销上一步下注');playChipDrop(.45);render()}
function clearBets(){if(state.busy||!state.bets.size)return;for(const stack of state.stacks.values())for(const chip of stack)state.inventory[CHIP_VALUES.indexOf(chip)]++;state.bets.clear();state.stacks.clear();state.actions=[];saveState();setStatus('已清空桌面下注，筹码已放回筹码槽');render()}
function setStatus(message){$('#roulette-status',roulette).textContent=message}
function pulseBalance(){const node=$('.roulette-wallet',roulette);node.classList.remove('pulse');requestAnimationFrame(()=>node.classList.add('pulse'))}
function secureNumber(max){const limit=Math.floor(0x100000000/max)*max,buffer=new Uint32Array(1);do{crypto.getRandomValues(buffer)}while(buffer[0]>=limit);return buffer[0]%max}
function sfxLevel(){try{const saved=JSON.parse(localStorage.getItem('abyss-fruit-arcade-audio-v1')||'null');return Number.isFinite(saved?.sfx)?saved.sfx:.68}catch{return .68}}
function playTone(frequency,duration=.08){try{const level=sfxLevel();if(level<=0)return;const AudioContext=window.AudioContext||window.webkitAudioContext,context=playTone.context??=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.035*level,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+duration)}catch{}}
function playChipDrop(level=1){try{const volume=sfxLevel();if(volume<=0)return;const AudioContext=window.AudioContext||window.webkitAudioContext,context=playTone.context??=new AudioContext(),now=context.currentTime;[1480,2460].forEach((frequency,index)=>{const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type=index?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,now);oscillator.frequency.exponentialRampToValueAtTime(frequency*.62,now+.055+index*.018);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.028*volume*level/(index+1),now+.003+index*.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.08+index*.025);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now);oscillator.stop(now+.11)})}catch{}}
function spin(){
  if(state.busy)return;const stake=totalBet();if(!stake){setStatus('请先在桌面放置筹码');return}let result;
  try{result=secureNumber(37)}catch{setStatus('安全随机数暂不可用，本轮未扣款');return}
  state.busy=true;state.lastResult=null;render();setStatus('停止下注 · 轮盘旋转中');const index=ROULETTE_SEQUENCE.indexOf(result),base=Math.ceil(state.wheelRotation/360)*360+(REDUCED_MOTION.matches?360:1800);state.wheelRotation=base-index*stepAngle;
  const wheel=$('#roulette-wheel',roulette),ball=$('#ball-track',roulette);wheel.style.setProperty('--wheel-rotation',`${state.wheelRotation}deg`);wheel.style.setProperty('--wheel-counter-rotation',`${-state.wheelRotation}deg`);wheel.classList.add('spinning');ball.classList.remove('orbiting');void ball.offsetWidth;ball.classList.add('orbiting');const duration=REDUCED_MOTION.matches?180:4300;const tickTimer=REDUCED_MOTION.matches?null:setInterval(()=>playTone(260+secureNumber(5)*34,.025),110);
  setTimeout(()=>{if(tickTimer)clearInterval(tickTimer);wheel.classList.remove('spinning');ball.classList.remove('orbiting');const settlement=settleBets(state.bets,result);addWinnings(settlement.returned);state.history.unshift(result);state.history=state.history.slice(0,12);state.lastResult=result;state.busy=false;state.bets.clear();state.stacks.clear();state.actions=[];saveState();render();if(settlement.returned){const winLabels=settlement.wins.map(win=>win.label).join('、');setStatus(`开出 ${result} · ${winLabels} 命中 · 获得 ${money(settlement.returned)} 筹码`);playTone(720,.35)}else{setStatus(`开出 ${result} · 本轮未中奖`);playTone(150,.35)}},duration);
}
function renderHistory(){const history=$('#roulette-history',roulette);history.replaceChildren();if(!state.history.length){history.innerHTML='<span class="history-empty">暂无</span>';return}state.history.forEach(number=>{const item=document.createElement('i');item.className=numberColor(number);item.textContent=number;history.append(item)})}
function renderSummary(){const summary=$('#bet-summary',roulette);summary.replaceChildren();if(!state.bets.size){summary.innerHTML='<span>尚未下注</span>';return}[...state.bets].slice(0,7).forEach(([id,amount])=>{const bet=describeBet(id),item=document.createElement('span');item.innerHTML=`${bet.label} <b>${money(amount)}</b>`;summary.append(item)});if(state.bets.size>7){const more=document.createElement('span');more.textContent=`另有 ${state.bets.size-7} 注`;summary.append(more)}}
function render(){
  const total=totalBet();$('#roulette-balance',roulette).textContent=money(inventoryTotal());$('#roulette-total',roulette).textContent=money(total);$('#wheel-result',roulette).textContent=state.lastResult??'—';$('#wheel-result',roulette).className=state.lastResult===null?'':numberColor(state.lastResult);
  $('.roulette-layout',roulette).classList.toggle('table-collapsed',state.tableCollapsed);$('#table-collapse',roulette).setAttribute('aria-expanded',String(!state.tableCollapsed));$('#table-collapse',roulette).textContent=state.tableCollapsed?'展开下注台':'折叠下注台';
  $$('.chip-choice',roulette).forEach(button=>{const value=Number(button.dataset.value),index=CHIP_VALUES.indexOf(value),count=state.inventory[index],selected=value===state.selectedChip&&count>0,stack=$('.rack-stack',button),countNode=$('.rack-count',button);button.classList.toggle('selected',selected);button.classList.toggle('empty',count===0);button.setAttribute('aria-checked',String(selected));button.setAttribute('aria-label',`${money(value)} 筹码，剩余 ${count} 枚`);button.disabled=state.busy||count===0;stack.innerHTML=Array.from({length:Math.min(count,8)},(_,layer)=>chipArt(value,'rack-chip',`--rack-layer:${layer}`)).join('');countNode.textContent=count?`×${count}`:''});
  $$('[data-bet-id]',roulette).forEach(button=>{const id=button.dataset.betId,amount=state.bets.get(id)||0,stack=state.stacks.get(id)||[];button.classList.toggle('has-bet',amount>0);const output=$('.bet-amount',button),stackNode=$('.bet-stack',button);if(output)output.textContent=amount?money(amount):'';if(stackNode)stackNode.innerHTML=stack.slice(-5).map((value,index)=>chipArt(value,`table-chip stack-${index}`)).join('');button.disabled=state.busy});
  $('#roulette-undo',roulette).disabled=state.busy||!state.actions.length;$('#roulette-clear',roulette).disabled=state.busy||!state.bets.size;$('#roulette-spin',roulette).disabled=state.busy||!state.bets.size;$('#roulette-refill',roulette).hidden=inventoryTotal()>0||state.bets.size>0||state.busy;renderHistory();renderSummary();
}

function fruitBalance(){const request={balance:0};window.dispatchEvent(new CustomEvent('abyss:fruit-balance-request',{detail:request}));return request.balance}
const shop=$('#roulette-shop',roulette),shopStatus=$('#shop-status',shop);
function renderShop(){const balance=fruitBalance();$('#fruit-shop-balance',shop).textContent=`${money(balance)} USD`;$$('[data-chip-buy]',shop).forEach(button=>{const value=Number(button.dataset.chipBuy),count=state.inventory[CHIP_VALUES.indexOf(value)];button.disabled=value>balance;$('.shop-owned',button).textContent=count?`已拥有 ${count} 枚`:'尚未拥有'})}
function buildShop(){const rack=$('#shop-chips',shop);CHIP_VALUES.forEach(value=>{const button=document.createElement('button');button.type='button';button.dataset.chipBuy=value;button.setAttribute('aria-label',`购买一枚 ${money(value)} 筹码，价格 ${money(value)} USD`);button.innerHTML=`<span class="shop-chip-stack">${chipArt(value,'shop-chip')}</span><b>${money(value)}</b><span>购买一枚</span><small>${money(value)} USD</small><em class="shop-owned"></em>`;button.onclick=()=>{const request={cost:value,accepted:false};window.dispatchEvent(new CustomEvent('abyss:buy-roulette-chips',{detail:request}));if(!request.accepted){shopStatus.textContent='水果机可用资金不足，或当前仍有锁定中的游戏金额。';renderShop();return}const index=CHIP_VALUES.indexOf(value);state.inventory[index]++;state.selectedChip=value;saveState();render();renderShop();shopStatus.textContent=`已购买一枚 ${money(value)} 筹码。`;playChipDrop()};rack.append(button)})}
function openShop(){if(state.busy)return;shopStatus.textContent='';renderShop();shop.showModal()}
buildShop();
buildTable();buildChipRack();$('#roulette-undo',roulette).onclick=undo;$('#roulette-clear',roulette).onclick=clearBets;$('#roulette-spin',roulette).onclick=spin;
$('.roulette-shop-button',roulette).onclick=openShop;$('#roulette-refill',roulette).onclick=openShop;$('.roulette-shop-close',shop).onclick=()=>shop.close();
$('#table-collapse',roulette).onclick=()=>{state.tableCollapsed=!state.tableCollapsed;saveState();render()};
const rules=$('#roulette-rules',roulette);$('.roulette-rules-button',roulette).onclick=()=>rules.showModal();$('.roulette-rules-close',rules).onclick=()=>rules.close();$('.roulette-rules-confirm',rules).onclick=()=>rules.close();document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!rules.open&&document.body.classList.contains('mode-roulette'))showGateway('games')});render();
showGateway('welcome');
