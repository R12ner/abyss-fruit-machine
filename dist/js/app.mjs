import {createAudioEngine} from './audio/audio-engine.mjs';
import {createGame,route,symbols} from './core/game.mjs';
import {$,bindAcceleratingHold,ringPositions,setLed,sprite} from './ui/helpers.mjs';

const bonusNames={gift:'幸运送灯',train:'火车连奖',bigTriple:'大三元',smallTriple:'小三元',jackpot:'累积彩金'};
const STORAGE_KEY='abyss-fruit-arcade-state-v2';
const COIN_STYLE_KEY='abyss-fruit-arcade-coin-style-v1';
const COIN_STYLES=Object.freeze({arcade:'街机币',bitcoin:'BTC',usdt:'USDT',usdc:'USDC'});
let coinStyle=(()=>{try{const saved=localStorage.getItem(COIN_STYLE_KEY);return COIN_STYLES[saved]?saved:'arcade'}catch{return 'arcade'}})();
const coinAsset=()=>`assets/coins/${coinStyle}.png`;
function createCoinImage(){const coin=document.createElement('img');coin.src=coinAsset();coin.alt='';coin.dataset.coin='';return coin}
function applyCoinStyle(style){
  if(!COIN_STYLES[style])return;
  coinStyle=style;try{localStorage.setItem(COIN_STYLE_KEY,style)}catch{}
  document.querySelectorAll('img[data-coin]').forEach(coin=>coin.src=coinAsset());
  const preview=document.querySelector('#coin-style-preview');if(preview)preview.src=coinAsset();
}
function loadGameState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
const game=createGame(loadGameState()),positions=ringPositions();
route.forEach(([i,m],n)=>{
  const tile=document.createElement('div');tile.className=`tile${m===symbols[i][2]?' small-symbol':''}`;
  tile.style.gridColumn=positions[n][0];tile.style.gridRow=positions[n][1];
  tile.setAttribute('aria-label',`${n+1}号格，${symbols[i][0]} ×${m}`);
  tile.innerHTML=sprite(i)+`<small>×${m}</small>`;$('track').append(tile);
});
let step=1,subtract=false,current=0;
const status=$('status'),start=$('start'),bets=$('bets'),dialog=$('rules-dialog');
const {playCoinSound,playPrizeCue,tone}=createAudioEngine({settingsButton:$('sound')});
const settingsDialog=document.querySelector('.settings-dialog'),audioNote=settingsDialog.querySelector('.audio-note');
const coinSetting=document.createElement('div');coinSetting.className='coin-style-setting';
coinSetting.innerHTML='<label for="coin-style"><span>硬币样式</span><small>投币、落币与出币槽</small></label><div class="coin-style-control"><img id="coin-style-preview" alt="" aria-hidden="true"><select id="coin-style" aria-label="选择硬币样式"></select></div>';
audioNote.before(coinSetting);
const coinSelect=coinSetting.querySelector('select');
for(const [value,label] of Object.entries(COIN_STYLES)){const option=document.createElement('option');option.value=value;option.textContent=label;coinSelect.append(option)}
coinSelect.value=coinStyle;coinSelect.onchange=()=>applyCoinStyle(coinSelect.value);applyCoinStyle(coinStyle);
$('coin-chute').querySelector('.engraving')?.remove();
const transferControls=document.createElement('div');
transferControls.className='transfer-controls';
transferControls.innerHTML='<button id="win-to-credit" type="button" data-short="→" aria-label="从本次得币转一枚到机内余额">WIN → CREDIT</button><button id="credit-to-win" type="button" data-short="←" aria-label="从机内余额转一枚到本次得币">CREDIT → WIN</button>';
$('jackpot-display').append(transferControls);
const stageEntry=document.createElement('div');
stageEntry.className='coin-amount-entry';
stageEntry.innerHTML='<span>投币金额</span><input id="stage-amount" type="number" min="1" step="1" inputmode="numeric" placeholder="USD" aria-label="输入后点击下方投币口">';
document.querySelector('.slot-assembly').prepend(stageEntry);
const subsidyDialog=document.createElement('dialog');
subsidyDialog.className='subsidy-dialog';
subsidyDialog.innerHTML='<span class="eyebrow">HOUSE SUPPORT</span><h2>补贴待领取</h2><p>总金额已归零。领取后，游戏厅会把 100 USD 补贴立即存入钱包。</p><button type="button" class="subsidy-confirm">领取 100 USD</button>';
document.body.append(subsidyDialog);
subsidyDialog.addEventListener('cancel',event=>event.preventDefault());
subsidyDialog.querySelector('button').onclick=()=>{
  if(!game.grantSubsidy())return;
  saveGameState();subsidyDialog.close();update();status.textContent='已领取破产补贴 100 USD';
};
const tutorialParagraphs=[...dialog.querySelectorAll('p')];
const stagingHelp=tutorialParagraphs.find(p=>p.textContent.includes('放币时金额暂存'));
if(stagingHelp)stagingHelp.textContent='放币时金额暂存槽内，不会进入机台。可点击槽内位置选择数量，也可在投币口上方直接输入金额，再点击投币口一次投入；× 可全部拿回钱包。';
const payoutHelp=tutorialParagraphs.find(p=>p.textContent.includes('清空押注后'));
if(payoutHelp)payoutHelp.textContent='清空押注后拉下退币拉杆，CREDIT 会逐枚掉入中央出币槽；再次退币会接着落下，已有硬币不会消失。点击出币槽才会领取全部金额。设置中可切换街机币、BTC、USDT 或 USDC 外观。中奖与比倍所得先留在 WIN；按下启动时，WIN 会全部转入 CREDIT，再扣除本轮押注。';
const cashOutControl=$('cash-out');
cashOutControl.className='cashout-lever';
cashOutControl.setAttribute('aria-label','拉下退币拉杆');
cashOutControl.innerHTML='<span class="lever-rail" aria-hidden="true"></span><span class="lever-handle" aria-hidden="true"></span>';
const MAX_VISIBLE_COINS=96;
let coinTimer,payoutAnimating=false,coinAnimationEnd=0;
function positionPayoutCoin(coin,index,{settled=false,delay=0}={}){
  const columns=12,row=Math.floor(index/columns),column=index%columns;
  coin.style.setProperty('--coin-left',`${5+column*(90/(columns-1))+(row%2?1.2:-1.2)}%`);
  coin.style.setProperty('--coin-bottom',`${Math.min(72,row*10.5+(column%3)*1.2)}%`);
  coin.style.setProperty('--coin-angle',`${(index*47)%96-48}deg`);
  coin.style.setProperty('--coin-delay',`${delay}ms`);
  coin.style.zIndex=String(2+row);
  if(settled)coin.classList.add('coin-settled');
  else coin.addEventListener('animationend',()=>coin.classList.add('coin-settled'),{once:true});
}
function ejectCoins(amount){
  const stream=$('coin-stream'),existing=stream.children.length;
  $('coin-chute').classList.add('has-coins','dispensing');
  $('payout-label').textContent=`$${game.snapshot().payout.toLocaleString('zh-CN')} USD`;
  const fillingCount=Math.max(0,Math.min(MAX_VISIBLE_COINS,game.snapshot().payout)-existing);
  const count=fillingCount||Math.min(amount,12);
  const now=performance.now(),queuedDelay=Math.max(0,coinAnimationEnd-now),interval=count>60?24:count>24?38:70;
  for(let i=0;i<count;i++){
    const coin=createCoinImage();positionPayoutCoin(coin,existing+i,{delay:queuedDelay+i*interval});
    stream.append(coin);
  }
  if(count){
    payoutAnimating=true;clearTimeout(coinTimer);
    coinAnimationEnd=now+queuedDelay+(count-1)*interval+1050;
    coinTimer=setTimeout(()=>{payoutAnimating=false;$('coin-chute').classList.remove('dispensing');update()},Math.max(0,coinAnimationEnd-performance.now()));
  }else $('coin-chute').classList.remove('dispensing');
  update();playCoinSound('out',Math.min(count||amount,24));
}
for(let i=1;i<=20;i++){
  const position=document.createElement('button');position.className='tray-position';position.dataset.count=i;
  position.append(createCoinImage());
  position.onclick=()=>{
    if(game.stageCoins(i,step)){$('stage-amount').value='';update();status.textContent=`放币槽：${i} 枚 × ${step} USD`;tone(430+i*8,.05)}
  };
  $('staging-tray').append(position);
}
$('clear-tray').onclick=()=>{if(game.stageCoins(0,step)){$('stage-amount').value='';update();status.textContent='放币槽已清空，币已退回钱包'}};
$('coin-chute').onclick=()=>{
  if(payoutAnimating)return;
  const amount=game.collectPayout();if(!amount)return;
  $('coin-stream').replaceChildren();$('coin-chute').classList.remove('has-coins','restored');
  $('payout-label').textContent='';update();status.textContent=`领取 ${amount} USD`;tone(620,.15);
};
const engravings={subtract:'减注',repeat:'重押',clear:'清空',start:'启动', 'guess-small':'小 1–7','guess-big':'大 8–14',collect:'收分'};
for(const [id,label] of Object.entries(engravings)){
  const button=$(id),mark=document.createElement('span');mark.className='button-engraving';mark.textContent=label;button.append(mark);
}
document.querySelectorAll('[data-step]').forEach(button=>{const mark=document.createElement('span');mark.className='button-engraving';mark.textContent=`×${button.dataset.step}`;button.append(mark)});
$('insert-coin').onclick=()=>{
  const input=$('stage-amount'),raw=input.value.trim();
  if(raw){
    const directAmount=Number(raw);
    if(!Number.isInteger(directAmount)||directAmount<=0){status.textContent='请输入大于 0 的整数金额';return}
    if(!game.stageAmount(directAmount)){status.textContent='投币金额不能超过钱包和放币槽的可用金额';return}
    input.value='';
  }
  const state=game.snapshot(),amount=game.insertStaged();if(!amount)return;
  const feed=$('feeding-coins');feed.replaceChildren();
  for(let i=0;i<state.stagedCount;i++){
    const coin=createCoinImage();
    coin.style.setProperty('--feed-delay',`${i*.04}s`);feed.append(coin);
  }
  update();status.textContent=`已投入槽内全部 ${amount} USD`;playCoinSound('in',state.stagedCount);
};
let leverDrag=null,leverY=0,leverReturnTimer;
function setLeverPosition(y){
  const travel=Math.max(40,cashOutControl.clientHeight-38);
  leverY=Math.max(0,Math.min(travel,y));
  cashOutControl.style.setProperty('--lever-y',`${leverY}px`);
  return travel;
}
function returnLever(delay=0){
  clearTimeout(leverReturnTimer);
  leverReturnTimer=setTimeout(()=>{cashOutControl.classList.remove('dragging');setLeverPosition(0)},delay);
}
function performCashOut(){
  const amount=game.cashOut();if(!amount)return false;
  clearAward();ejectCoins(amount);status.textContent=`已退币 ${amount} USD，落定后点击出币槽领取`;return true;
}
cashOutControl.addEventListener('pointerdown',e=>{
  if(cashOutControl.disabled)return;
  e.preventDefault();clearTimeout(leverReturnTimer);
  cashOutControl.setPointerCapture(e.pointerId);
  leverDrag={pointerId:e.pointerId,startY:e.clientY,startLeverY:leverY};
  cashOutControl.classList.add('dragging');
});
cashOutControl.addEventListener('pointermove',e=>{
  if(!leverDrag||e.pointerId!==leverDrag.pointerId)return;
  setLeverPosition(leverDrag.startLeverY+e.clientY-leverDrag.startY);
});
function finishLever(e){
  if(!leverDrag||e.pointerId!==leverDrag.pointerId)return;
  const travel=setLeverPosition(leverY),fullyPulled=leverY>=travel*.82;
  leverDrag=null;
  if(fullyPulled){setLeverPosition(travel);performCashOut();returnLever(180)}else returnLever();
}
cashOutControl.addEventListener('pointerup',finishLever);
cashOutControl.addEventListener('pointercancel',e=>{
  if(!leverDrag||e.pointerId!==leverDrag.pointerId)return;
  leverDrag=null;returnLever();
});
cashOutControl.addEventListener('keydown',e=>{
  if(cashOutControl.disabled||!['ArrowDown','Enter',' '].includes(e.key))return;
  e.preventDefault();const travel=setLeverPosition(cashOutControl.clientHeight);
  setLeverPosition(travel);performCashOut();returnLever(180);
});
cashOutControl.onclick=e=>e.preventDefault();
function adjust(i,remove){
  if(game.snapshot().busy)return false;
  if(!game.adjust(i,remove?-step:step)){status.textContent='无法加注：单门最多 99 USD，总押不得超过余额';return false}
  status.textContent=remove?'−':'+';update();tone(350+i*55,.045);return true;
}
symbols.forEach(([name,payout],i)=>{
  const station=document.createElement('div');station.className='bet-station';
  station.innerHTML=`<span class="payout" aria-hidden="true">×${payout}</span>`;
  const button=document.createElement('button');button.className='bet arcade-button fruit-button';
  button.innerHTML=sprite(i);
  bindAcceleratingHold(button,e=>adjust(i,subtract||e.shiftKey));
  button.oncontextmenu=e=>{e.preventDefault();adjust(i,true)};station.append(button);const counter=document.createElement('output');counter.className='bet-count';counter.textContent='00';counter.setAttribute('aria-label',name+'押分');station.append(counter);bets.append(station);
});
function transferAmount(direction,amount){
  const moved=game.transfer(direction,amount);if(!moved)return false;
  update();const state=game.snapshot();status.textContent=direction==='winToCredit'?`WIN → CREDIT：${moved} USD`:`CREDIT → WIN：${moved} USD${state.risk>0?' · 比倍筹码已增至 '+state.risk+' USD':''}`;tone(direction==='winToCredit'?560:430,.035);return true;
}
bindAcceleratingHold($('win-to-credit'),(e,amount)=>transferAmount('winToCredit',amount),{bulk:true});
bindAcceleratingHold($('credit-to-win'),(e,amount)=>transferAmount('creditToWin',amount),{bulk:true});
function refreshInsertAvailability(){
  const state=game.snapshot(),input=$('stage-amount'),raw=input.value.trim(),amount=Number(raw),valid=raw!==''&&Number.isInteger(amount)&&amount>0&&amount<=state.wallet+state.staged;
  input.setAttribute('aria-invalid',String(raw!==''&&!valid));
  $('insert-coin').disabled=state.busy||(state.staged===0&&!valid);
  $('insert-coin').setAttribute('aria-label',`投入 ${valid?amount:state.staged} USD`);
  $('insert-value').textContent=`$${valid?amount:state.staged}`;
}
$('stage-amount').addEventListener('input',refreshInsertAvailability);
$('stage-amount').addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('insert-coin').disabled){e.preventDefault();$('insert-coin').click()}});
function saveGameState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(game.exportState()))}catch{}}
function update(){
  const state=game.snapshot();
  if(!state.busy&&state.totalFunds===0&&!subsidyDialog.open)subsidyDialog.showModal();
  $('wallet').textContent=state.wallet.toLocaleString('zh-CN');
  const directInput=$('stage-amount'),rawDirectAmount=directInput.value.trim(),directAmount=Number(rawDirectAmount),validDirectAmount=rawDirectAmount!==''&&Number.isInteger(directAmount)&&directAmount>0&&directAmount<=state.wallet+state.staged;
  $('insert-value').textContent=`$${validDirectAmount?directAmount:state.staged}`;
  $('insert-coin').disabled=state.busy||(state.staged===0&&!validDirectAmount);
  $('insert-coin').setAttribute('aria-label',`投入 ${validDirectAmount?directAmount:state.staged} USD`);
  directInput.setAttribute('aria-invalid',String(rawDirectAmount!==''&&!validDirectAmount));
  $('staged-label').textContent=state.staged?state.stagedDirect?`直接输入 $${state.staged}`:`${state.stagedCount} × $${state.stagedUnit} = $${state.staged}`:'0 USD';
  $('clear-tray').disabled=state.busy||state.staged===0;
  $('stage-amount').disabled=state.busy;
  $('stage-amount').max=state.wallet+state.staged;
  [...$('staging-tray').children].forEach((position,i)=>{
    const count=i+1;
    position.classList.toggle('filled',count<=state.stagedCount);
    position.classList.toggle('end-position',count===state.stagedCount);
    position.disabled=state.busy||count*step>state.wallet+state.staged;
    position.setAttribute('aria-label',`放入 ${count} 枚，每枚 ${step} USD，共 ${count*step} USD`);
    position.setAttribute('aria-pressed',String(count===state.stagedCount));
  });
  const payoutStream=$('coin-stream'),coinChute=$('coin-chute');
  if(state.payout>0&&!payoutAnimating&&!payoutStream.children.length){
    coinChute.classList.add('has-coins');
    for(let i=0;i<Math.min(MAX_VISIBLE_COINS,state.payout);i++){
      const coin=createCoinImage();positionPayoutCoin(coin,i,{settled:true});payoutStream.append(coin);
    }
  }
  if(state.payout===0)coinChute.classList.remove('has-coins','restored');
  $('payout-label').textContent=state.payout?`$${state.payout.toLocaleString('zh-CN')} USD`:'';
  $('coin-chute').disabled=state.busy||payoutAnimating||state.payout===0;
  $('coin-chute').setAttribute('aria-label',payoutAnimating?'正在出币':`领取出币槽内 ${state.payout} USD`);
  $('cash-out').disabled=state.busy||state.credit===0||state.total>0;
  $('win-to-credit').disabled=state.busy||state.win===0;
  $('credit-to-win').disabled=state.busy||state.credit<=state.total;
  setLed('result-led',state.win);
  [...bets.querySelectorAll('.bet')].forEach((button,i)=>{
    button.classList.toggle('chosen',state.bets[i]>0);
    button.parentElement.querySelector('.bet-count').textContent=String(state.bets[i]).padStart(2,'0');
    button.setAttribute('aria-label',`${symbols[i][0]}，已押 ${state.bets[i]} USD，${subtract?'减':'加'}注 ${step} USD`);
    button.disabled=state.busy;
  });
  $('total').textContent=String(state.total).padStart(3,'0');
  $('credit').textContent=String(state.credit).padStart(6,'0');
  $('jackpot').textContent=state.jackpot.toLocaleString('zh-CN');
  $('win').textContent=String(state.win).padStart(3,'0');
  document.querySelectorAll('[data-step]').forEach(button=>button.disabled=state.busy);
  $('clear').disabled=state.busy||state.total===0;$('subtract').disabled=state.busy;
  $('repeat').disabled=state.busy||!state.previous||state.previous.reduce((a,b)=>a+b,0)>state.credit;

  const canGuess=!state.busy&&state.risk>0&&state.total===0&&state.guesses<5;
  $('guess-small').disabled=!canGuess;$('guess-big').disabled=!canGuess;
  $('collect').disabled=state.busy||state.risk===0;
  $('risk').textContent=state.risk.toLocaleString('zh-CN');
  $('guess-count').textContent=`${state.guesses} / 5`;
  $('gamble-hint').textContent=state.busy?'本轮进行中…':state.risk>0?(state.total>0?'清除新押注后可比倍，或直接开始下一局。':'可用 CREDIT → WIN 追加本轮比倍筹码，也可直接猜大小或收分。'):'中奖后得币先留在 WIN；可用箭头按钮转入 CREDIT。';
  start.disabled=state.busy||state.total===0||state.total>state.credit;
  start.setAttribute('aria-label',state.busy?'本轮进行中':'开始游戏');
  if(!state.busy)saveGameState();
}
document.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>{
  if(game.snapshot().busy)return;step=Number(button.dataset.step);
  document.querySelectorAll('[data-step]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button))});
  $('step-label').textContent=step;update();
});
$('subtract').onclick=()=>{
  if(game.snapshot().busy)return;subtract=!subtract;
  $('subtract').setAttribute('aria-pressed',String(subtract));$('subtract').setAttribute('aria-label',subtract?'关闭减注模式':'开启减注模式');
  $('direction-label').textContent=subtract?'−':'+';update();
};
$('clear').onclick=()=>{if(game.clear()){update();status.textContent='押注已清空'}};
$('repeat').onclick=()=>{if(game.repeat()){update();status.textContent='上局押注已恢复'}};
$('paytable').innerHTML='<tr><th>图案</th><th>大图</th><th>小图</th></tr>'+symbols.map(([name,large,small])=>`<tr><td>${name}</td><td>×${large}</td><td>×${small}</td></tr>`).join('');
$('route-list').textContent=route.map(([i,m],n)=>`${n+1}. ${symbols[i][0]} ×${m}`).join(' → ');
['rules','rules-bottom'].forEach(id=>$(id).onclick=()=>dialog.showModal());
['close','confirm'].forEach(id=>$(id).onclick=()=>dialog.close());
const awardProfiles={
  gift:['幸运送灯','#92dc80','#b98ce3','scatter'],
  train:['火车连奖','#efaa59','#77cdd6','chase'],
  bigTriple:['大三元','#e77a6c','#ead17c','triad'],
  smallTriple:['小三元','#74d1d4','#ae90d5','ripple'],
  jackpot:['累积彩金','#f2da87','#d996c7','rainbow'],
  bar:['BAR','#eed286','#faf0c1','sweep'],
  seven:['双七','#db8888','#ddb2ea','alternate'],
  star:['星星','#e8d98d','#a1c5ed','scatter'],
  melon:['西瓜','#87c59a','#db9290','ripple'],
  bell:['铃铛','#e3c278','#ecdeac','sweep'],
  papaya:['木瓜','#dcc67d','#a0c885','ripple'],
  orange:['橙子','#e9b071','#dec491','chase'],
  apple:['苹果','#d68780','#b3cd8c','alternate'],
  double:['比倍成功','#a49ae5','#88d3cf','split']
};
const lampPositions=[];
for(let x=1;x<=9;x++)lampPositions.push([x,1]);
for(let y=2;y<=5;y++)lampPositions.push([9,y]);
for(let x=8;x>=1;x--)lampPositions.push([x,5]);
for(let y=4;y>=2;y--)lampPositions.push([1,y]);
lampPositions.forEach(([x,y],i)=>{
  const lamp=document.createElement('i');lamp.className='award-led';
  lamp.style.gridColumn=x;lamp.style.gridRow=y;
  lamp.style.setProperty('--lamp-phase',`${-i*.13}s`);
  lamp.style.setProperty('--lamp-hue',String(i*15));
  lamp.dataset.group=i%3;
  $('award-lights').append(lamp);
});
function clearAward(){
  const center=$('machine-center');center.classList.remove('has-award');
  delete center.dataset.award;delete center.dataset.pattern;
  $('award-title').textContent='';$('award-amount').textContent='';
}
function showAward(kind,amount){
  const profile=awardProfiles[kind];if(!profile)return;
  const center=$('machine-center');
  center.dataset.award=kind;center.dataset.pattern=profile[3];
  center.style.setProperty('--award-primary',profile[1]);center.style.setProperty('--award-secondary',profile[2]);
  $('award-title').textContent=profile[0];if(amount===null)$('award-amount').textContent='◆';else setLed('award-amount',amount);
  center.classList.add('has-award');
}
const tiles=[...document.querySelectorAll('.tile')];
function animate(){
  if(game.snapshot().busy||dialog.open)return;
  let target;
  try{target=game.start()}catch{status.textContent='无法取得安全随机数，未扣分，请重试';return}
  if(target===null)return;
  clearAward();setLed('multiplier-led',0,3);$('result-symbol').replaceChildren();
  tiles.forEach(t=>t.classList.remove('bonus-hit','train-head','train-moving'));$('jackpot-display').classList.remove('jackpot-won');$('lucky-lamp').classList.remove('lit');$('lucky-lamp').textContent='LUCKY LIGHT / 幸运灯';$('round-detail').textContent='';$('guess-number').textContent='—';
  const total=game.snapshot().total;update();status.textContent=`已扣 ${total} USD · 跑灯中`;
  const bonus=game.bonusPreview(),laps=bonus?.type?5:3;
  const distance=laps*24+(target-current+24)%24;let tick=0;
  function frame(){
    tiles[current].classList.remove('active');current=(current+1)%24;
    tiles[current].classList.add('active');tone(180+(current%12)*25,.025);tick++;
    if(tick===distance){
      showBonus();return;
    }
    const remaining=distance-tick;setTimeout(frame,remaining>16?35:50+(16-remaining)**2*1.5);
  }
  frame();
}
function finishRound(){
  const result=game.settle();if(!result)return;
  update();
  status.textContent=`${bonusNames[result.bonusType]||symbols[result.symbol][0]+' ×'+result.multiplier} · ${result.win?'得 '+result.win+' USD':'未中奖'}`;
  if(game.snapshot().credit===0)status.textContent+=' · USD已用完';
  setLed('multiplier-led',result.multiplier,3);$('result-symbol').innerHTML=sprite(result.symbol);
  const extras=result.awards.map(a=>{const [i,m]=route[a.index];return `${a.index+1}号 ${symbols[i][0]} ×${m}：${a.win} USD`}).join('；');
  $('round-detail').textContent=`主灯 ${result.baseWin} USD${extras?'；'+bonusNames[result.bonusType]+' '+result.bonusWin+' USD（'+extras+'）':''}${result.jackpotWin?'；累积彩金 '+result.jackpotWin+' USD，彩金池重置为 1000 USD':''}。${result.win?'得币已保留在 WIN，可转入 CREDIT。':''}`;
  const prizeKind=result.bonusType||['bar','seven','star','melon','bell','papaya','orange','apple'][result.symbol];
  if(result.win){showAward(prizeKind,result.win);playPrizeCue(prizeKind)}else{clearAward();playPrizeCue(result.bonusType||'failure')}
}
function spinBonusLight(target,laps,done){
  const distance=laps*24+(target-current+24)%24;let tick=0;
  function frame(){
    tiles[current].classList.remove('active');current=(current+1)%24;
    tiles[current].classList.add('active');tone(280+(current%8)*45,.022);tick++;
    if(tick===distance){done();return}
    const remaining=distance-tick;
    setTimeout(frame,remaining>9?28:45+(9-remaining)*18);
  }
  frame();
}
function showTrainGroup(head,className){
  tiles.forEach(tile=>tile.classList.remove('train-moving','train-head'));
  for(let offset=0;offset<4;offset++){
    const tile=tiles[(head+offset)%24];tile.classList.add(className);
    if(offset===0)tile.classList.add('train-head');
  }
}
function spinTrainLights(target,laps,done){
  let head=target,tick=0;const distance=laps*24;
  showTrainGroup(head,'train-moving');
  function frame(){
    head=(head+1)%24;showTrainGroup(head,'train-moving');tone(250+(head%8)*38,.028);tick++;
    if(tick===distance){current=target;done();return}
    const remaining=distance-tick;
    setTimeout(frame,remaining>12?34:52+(12-remaining)*15);
  }
  setTimeout(frame,180);
}
function showBonus(){
  const bonus=game.bonusPreview();
  if(!bonus?.type){finishRound();return}
  showAward(bonus.type,null);
  const train=bonus.type==='train';
  $('lucky-lamp').classList.add('lit');$('lucky-lamp').textContent='♣ '+bonusNames[bonus.type];
  if(bonus.type==='jackpot'){
    status.textContent='累积彩金 · 彩池灯巡回中';
    spinBonusLight(current,3,()=>{
      const amount=game.snapshot().jackpot;
      $('jackpot-display').classList.add('jackpot-won');status.textContent=`累积彩金 · ${amount} USD`;
      tone(880,.4);setTimeout(finishRound,900);
    });
    return;
  }
  if(train){
    const head=bonus.indices[0];
    tiles[current].classList.remove('active');
    tiles.forEach(tile=>tile.classList.remove('train-moving','train-head'));
    tiles[head].classList.add('train-head');status.textContent=`火车头已选中 · ${head+1} 号灯`;
    setTimeout(()=>{
      showTrainGroup(head,'train-moving');status.textContent='火车车身灯已点亮 · 整列准备出发';tone(430,.18);
      setTimeout(()=>{
        status.textContent='火车连奖 · 4 盏灯一起跑动中';
        spinTrainLights(head,3,()=>{
          tiles.forEach(tile=>tile.classList.remove('train-moving','train-head'));
          bonus.indices.forEach((index,offset)=>{tiles[index].classList.add('bonus-hit');if(offset===0)tiles[index].classList.add('train-head')});
          tone(720,.28);status.textContent='火车连奖 · 4 盏灯已同时停下';setTimeout(finishRound,900);
        });
      },520);
    },420);
    return;
  }
  const eventLabel=bonus.type==='bigTriple'?'大三元':bonus.type==='smallTriple'?'小三元':train?'火车进站':'幸运送灯';
  let n=0;
  function revealNext(){
    tiles.forEach(t=>t.classList.remove('train-head'));
    const target=bonus.indices[n];status.textContent=`${eventLabel} · 第 ${n+1} / ${bonus.indices.length} 灯跑动中`;
    spinBonusLight(target,1,()=>{
      const tile=tiles[target];tile.classList.add('bonus-hit');
      tone(560+n*90,.15);n++;
      if(n<bonus.indices.length)setTimeout(revealNext,320);
      else setTimeout(()=>{tiles.forEach(t=>t.classList.remove('train-head'));finishRound()},700);
    });
  }
  setTimeout(revealNext,450);
}
function guess(choice){
  if(dialog.open)return;
  try{if(!game.startGamble(choice))return}catch{status.textContent='随机数不可用，未扣比倍分';return}
  clearAward();
  update();status.textContent=choice==='small'?'猜小 · 开奖中':'猜大 · 开奖中';
  const guessDisplay=$('guess-number'),reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  guessDisplay.setAttribute('aria-live','off');guessDisplay.textContent='…';tone(400,.12);
  let rollingNumber=0;
  const rollTimer=reducedMotion?null:setInterval(()=>{
    rollingNumber=rollingNumber%14+1;
    setLed('guess-number',rollingNumber,2);
    if(rollingNumber%2===0)tone(330+(rollingNumber%7)*34,.018);
  },55);
  setTimeout(()=>{
    if(rollTimer)clearInterval(rollTimer);
    guessDisplay.setAttribute('aria-live','polite');
    const result=game.settleGamble();if(!result)return;
    setLed('guess-number',result.number,2);
    update();status.textContent=`开出 ${result.number} · ${result.won?'猜中，得 '+result.win+' USD':'猜错，比倍分归零'}`;
    $('round-detail').textContent=`本次比倍投入 ${result.stake} USD，${result.won?'赢得 '+result.win+' USD':'得 0 USD'}。${result.collected?'已达到 5 次上限，自动收分。':''}`;
    if(result.won){showAward('double',result.win);playPrizeCue('double')}else{clearAward();playPrizeCue('failure')}
  },reducedMotion?350:1250);
}
$('guess-small').onclick=()=>guess('small');$('guess-big').onclick=()=>guess('big');
$('collect').onclick=()=>{if(game.collect()){update();status.textContent='已收分'}};
start.onclick=animate;
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.repeat&&e.target===document.body){e.preventDefault();animate()}});
update();

setLed('multiplier-led',0,3);
