'use strict';
const {symbols,route,createGame}=FruitGame;
const bonusNames={gift:'幸运送灯',train:'火车连奖',bigTriple:'大三元',smallTriple:'小三元',jackpot:'累积彩金'};
const game=createGame(), $=id=>document.getElementById(id);
const positions=[];
for(let x=1;x<=9;x++)positions.push([x,1]);
for(let y=2;y<=5;y++)positions.push([9,y]);
for(let x=8;x>=1;x--)positions.push([x,5]);
for(let y=4;y>=2;y--)positions.push([1,y]);
const sprite=i=>`<span aria-hidden="true" class="sprite" style="background-position:${(i%4)*100/3}% ${i<4?22:74}%;--delay:-${i*.3}s"></span>`;
route.forEach(([i,m],n)=>{
  const tile=document.createElement('div');tile.className=`tile${m===symbols[i][2]?' small-symbol':''}`;
  tile.style.gridColumn=positions[n][0];tile.style.gridRow=positions[n][1];
  tile.setAttribute('aria-label',`${n+1}号格，${symbols[i][0]} ×${m}`);
  tile.innerHTML=sprite(i)+`<small>×${m}</small>`;$('track').append(tile);
});
let step=1,subtract=false,sound=false,audio,current=0;
const status=$('status'),start=$('start'),bets=$('bets'),dialog=$('rules-dialog');
function tone(freq,duration){
  if(!sound)return;
  try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();
    const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.value=freq;
    g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
    o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);
  }catch{}
}
function adjust(i,remove){
  if(game.snapshot().busy)return;
  if(!game.adjust(i,remove?-step:step)){status.textContent='无法加注：单门最多 99 分，总押不得超过余额';return}
  status.textContent=remove?'已减注 · 确认押注后开始':'已加注 · 确认押注后开始';update();tone(350+i*55,.045);
}
symbols.forEach(([name,payout],i)=>{
  const button=document.createElement('button');button.className='bet';
  button.innerHTML=`<span class="payout">×${payout}</span>${sprite(i)}<span class="bet-name">${name}</span><span class="bet-count">00</span>`;
  button.onclick=e=>adjust(i,subtract||e.shiftKey);
  button.oncontextmenu=e=>{e.preventDefault();adjust(i,true)};bets.append(button);
});
function update(){
  const state=game.snapshot();
  [...bets.children].forEach((button,i)=>{
    button.classList.toggle('chosen',state.bets[i]>0);
    button.querySelector('.bet-count').textContent=String(state.bets[i]).padStart(2,'0');
    button.setAttribute('aria-label',`${symbols[i][0]}，已押 ${state.bets[i]} 分，${subtract?'减':'加'}注 ${step} 分`);
    button.disabled=state.busy;
  });
  $('total').textContent=String(state.total).padStart(3,'0');
  $('credit').textContent=String(state.credit).padStart(6,'0');
  $('jackpot').textContent=state.jackpot.toLocaleString('zh-CN');
  $('win').textContent=String(state.win).padStart(3,'0');
  document.querySelectorAll('[data-step]').forEach(button=>button.disabled=state.busy);
  $('clear').disabled=state.busy||state.total===0;$('subtract').disabled=state.busy;
  $('repeat').disabled=state.busy||!state.previous||state.previous.reduce((a,b)=>a+b,0)>state.credit;
  $('repeat').title=!state.previous?'完成一局后可重复押注':state.previous.reduce((a,b)=>a+b,0)>state.credit?'积分不足，无法恢复上一局押注':'';
  const canGuess=!state.busy&&state.risk>0&&state.total===0&&state.guesses<5;
  $('guess-small').disabled=!canGuess;$('guess-big').disabled=!canGuess;
  $('collect').disabled=state.busy||state.risk===0;
  $('risk').textContent=state.risk.toLocaleString('zh-CN');
  $('guess-count').textContent=`${state.guesses} / 5`;
  $('gamble-hint').textContent=state.busy?'本轮进行中…':state.risk>0?(state.total>0?'清除新押注后可比倍，或直接开始下一局。':'得分已到账；可收分结束比倍，或拿本轮得分猜大小。'):'中奖后可比倍：小 1–7，大 8–14，猜错仅损失本轮比倍分。';
  start.disabled=state.busy||state.total===0||state.total>state.credit;
  start.innerHTML=state.busy?'跑灯中…':'开 始 <span>↵</span>';
}
document.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>{
  if(game.snapshot().busy)return;step=Number(button.dataset.step);
  document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('selected',b===button));
  $('step-label').textContent=step;update();
});
$('subtract').onclick=()=>{
  if(game.snapshot().busy)return;subtract=!subtract;
  $('subtract').setAttribute('aria-pressed',String(subtract));$('subtract').textContent=subtract?'减注模式：开':'减注模式：关';
  $('direction-label').textContent=subtract?'−':'+';update();
};
$('clear').onclick=()=>{if(game.clear()){update();status.textContent='已清除押注 · 请选择水果'}};
$('repeat').onclick=()=>{if(game.repeat()){update();status.textContent='已恢复上一局押注 · 按开始扣分'}};
$('sound').onclick=e=>{sound=!sound;e.currentTarget.textContent=`声音：${sound?'开':'关'}`;e.currentTarget.setAttribute('aria-pressed',String(sound));tone(400,.1)};
$('paytable').innerHTML='<tr><th>图案</th><th>大图</th><th>小图</th></tr>'+symbols.map(([name,large,small])=>`<tr><td>${name}</td><td>×${large}</td><td>×${small}</td></tr>`).join('');
$('route-list').textContent=route.map(([i,m],n)=>`${n+1}. ${symbols[i][0]} ×${m}`).join(' → ');
['rules','rules-bottom'].forEach(id=>$(id).onclick=()=>dialog.showModal());
['close','confirm'].forEach(id=>$(id).onclick=()=>dialog.close());
const tiles=[...document.querySelectorAll('.tile')];
function animate(){
  if(game.snapshot().busy||dialog.open)return;
  let target;
  try{target=game.start()}catch{status.textContent='无法取得安全随机数，未扣分，请重试';return}
  if(target===null)return;
  tiles.forEach(t=>t.classList.remove('bonus-hit','train-head'));$('jackpot-display').classList.remove('jackpot-won');$('lucky-lamp').classList.remove('lit');$('lucky-lamp').textContent='LUCKY LIGHT / 幸运灯';$('round-detail').textContent='';$('guess-number').textContent='—';
  const total=game.snapshot().total;update();status.textContent=`已扣 ${total} 分 · 跑灯中`;
  const distance=72+(target-current+24)%24;let tick=0;
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
  status.textContent=`${bonusNames[result.bonusType]||symbols[result.symbol][0]+' ×'+result.multiplier} · ${result.win?'得 '+result.win+' 分':'未中奖'}`;
  if(game.snapshot().credit===0)status.textContent+=' · 积分已用完';
  const extras=result.awards.map(a=>{const [i,m]=route[a.index];return `${a.index+1}号 ${symbols[i][0]} ×${m}：${a.win} 分`}).join('；');
  $('round-detail').textContent=`主灯 ${result.baseWin} 分${extras?'；'+bonusNames[result.bonusType]+' '+result.bonusWin+' 分（'+extras+'）':''}${result.jackpotWin?'；累积彩金 '+result.jackpotWin+' 分，彩金池重置为 1000 分':''}。${result.win?'得分已加入余额。':''}`;
  if(result.win)tone(700,.25);
}
function showBonus(){
  const bonus=game.bonusPreview();
  if(!bonus?.type){finishRound();return}
  const train=bonus.type==='train',triple=['bigTriple','smallTriple'].includes(bonus.type);
  $('lucky-lamp').classList.add('lit');$('lucky-lamp').textContent='♣ '+bonusNames[bonus.type];
  if(bonus.type==='jackpot'){
    const amount=game.snapshot().jackpot;
    $('jackpot-display').classList.add('jackpot-won');
    status.textContent=`累积彩金 · ${amount} 分`;
    tone(880,.4);setTimeout(finishRound,1600);return;
  }
  if(triple){
    status.textContent=bonus.type==='bigTriple'?'大三元 · 双七 / 星星 / 西瓜':'小三元 · 铃铛 / 木瓜 / 橙子';
    bonus.indices.forEach(i=>tiles[i].classList.add('bonus-hit'));
    tone(740,.4);setTimeout(finishRound,1600);return;
  }
  status.textContent=train?'火车进站 · 免费点亮四格':'幸运灯亮起 · 免费赠送三格';
  tone(train?220:660,.2);
  let n=0;
  function reveal(){
    tiles.forEach(t=>t.classList.remove('train-head'));
    const tile=tiles[bonus.indices[n]];tile.classList.add('bonus-hit');
    if(train)tile.classList.add('train-head');
    tone(train?260+n*70:500+n*100,.15);n++;
    if(n<bonus.indices.length)setTimeout(reveal,train?350:600);
    else setTimeout(()=>{tiles.forEach(t=>t.classList.remove('train-head'));finishRound()},500);
  }
  setTimeout(reveal,500);
}
function guess(choice){
  if(dialog.open)return;
  try{if(!game.startGamble(choice))return}catch{status.textContent='随机数不可用，未扣比倍分';return}
  update();status.textContent=choice==='small'?'猜小 · 开奖中':'猜大 · 开奖中';
  $('guess-number').textContent='…';tone(400,.12);
  setTimeout(()=>{
    const result=game.settleGamble();if(!result)return;
    $('guess-number').textContent=result.number;
    update();status.textContent=`开出 ${result.number} · ${result.won?'猜中，得 '+result.win+' 分':'猜错，比倍分归零'}`;
    $('round-detail').textContent=`本次比倍投入 ${result.stake} 分，${result.won?'赢得 '+result.win+' 分':'得 0 分'}。${result.collected?'已达到 5 次上限，自动收分。':''}`;
    tone(result.won?800:130,.25);
  },900);
}
$('guess-small').onclick=()=>guess('small');$('guess-big').onclick=()=>guess('big');
$('collect').onclick=()=>{if(game.collect()){update();status.textContent='已收分 · 积分留在余额，可开始新一局'}};
start.onclick=animate;
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.repeat&&e.target===document.body){e.preventDefault();animate()}});
update();
