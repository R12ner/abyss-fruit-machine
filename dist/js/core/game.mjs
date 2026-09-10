'use strict';
const root=globalThis;
  const symbols = Object.freeze([
    ['BAR',120,50],['双七',40,3],['星星',30,3],['西瓜',20,3],
    ['铃铛',20,3],['木瓜',15,3],['橙子',10,3],['苹果',5,3]
  ].map(Object.freeze));
  // Retain ordinary positions. Replace BAR25 / bonus cells by apple3 / melon3 / papaya15.
  const route = Object.freeze([
    [4,3],[6,10],[4,20],[7,3],[0,120],[0,50],[7,5],[5,15],
    [3,20],[3,3],[3,3],[6,3],[6,10],[7,5],[4,20],[1,3],
    [1,40],[7,5],[5,3],[5,15],[2,30],[2,3],[5,15],[7,5]
  ].map(Object.freeze));
  const sum = bets => bets.reduce((a,b)=>a+b,0);
  function randomInt(size, provider = root.crypto) {
    if(!Number.isInteger(size)||size<1||size>0x100000000)throw new Error('Invalid random range');
    const limit=Math.floor(0x100000000/size)*size, value=new Uint32Array(1);
    do{provider.getRandomValues(value)}while(value[0]>=limit);
    return value[0]%size;
  }
  const randomIndex=provider=>randomInt(24,provider);
  const triples=Object.freeze({
    bigTriple:Object.freeze([1,2,3].map(symbol=>route.findIndex(([s,m])=>s===symbol&&m===symbols[symbol][1]))),
    smallTriple:Object.freeze([4,5,6].map(symbol=>route.findIndex(([s,m])=>s===symbol&&m===symbols[symbol][1])))
  });
  function drawBonus(draw=randomInt){
    // Keep gift/train at 1/24 each; add triples at 1/60 each and jackpot at 1/120.
    const ticket=draw(120);
    if(ticket>=15)return {type:null,indices:[]};
    if(ticket<5){
      const pool=route.map((_,i)=>i),indices=[];
      for(let n=0;n<3;n++)indices.push(pool.splice(draw(pool.length),1)[0]);
      return {type:'gift',indices};
    }
    if(ticket<10){
      const first=draw(24);
      return {type:'train',indices:Array.from({length:4},(_,i)=>(first+i)%24)};
    }
    if(ticket<12)return {type:'bigTriple',indices:[...triples.bigTriple]};
    if(ticket<14)return {type:'smallTriple',indices:[...triples.smallTriple]};
    return {type:'jackpot',indices:[]};
  }
  function createGame(initial){
    const integer=(value,fallback=0)=>Number.isInteger(value)&&value>=0?value:fallback;
    const restored=initial&&initial.version===2?initial:null;
    const restoredBets=restored&&Array.isArray(restored.bets)&&restored.bets.length===8&&restored.bets.every(v=>Number.isInteger(v)&&v>=0&&v<=99)?[...restored.bets]:Array(8).fill(0);
    let wallet=integer(restored?.wallet,100),credit=integer(restored?.credit),stagedAmount=integer(restored?.stagedAmount),stagedCount=Math.min(20,integer(restored?.stagedCount)),stagedUnit=[1,5,10].includes(restored?.stagedUnit)?restored.stagedUnit:1,stagedDirect=Boolean(restored?.stagedDirect),payout=integer(restored?.payout),bets=sum(restoredBets)<=credit?restoredBets:Array(8).fill(0),previous=restored&&Array.isArray(restored.previous)&&restored.previous.length===8&&restored.previous.every(v=>Number.isInteger(v)&&v>=0&&v<=99)?[...restored.previous]:null,pending=null,win=integer(restored?.win),risk=Math.min(integer(restored?.risk),integer(restored?.win)),guesses=Math.min(5,integer(restored?.guesses)),gamble=null,jackpot=Math.max(1000,integer(restored?.jackpot,1000));
    const busy=()=>pending!==null||gamble!==null;
    const totalFunds=()=>wallet+stagedAmount+credit+payout+win;
    return {
      snapshot:()=>({wallet,credit,stagedCount,stagedUnit,stagedDirect,staged:stagedAmount,payout,bets:[...bets],previous:previous&&[...previous],busy:busy(),win,risk,guesses,jackpot,total:sum(bets),totalFunds:totalFunds()}),
      exportState:()=>({version:2,wallet,credit,stagedAmount,stagedCount,stagedUnit,stagedDirect,payout,bets:[...bets],previous:previous&&[...previous],win,risk,guesses,jackpot}),
      stageCoins(count,unit){
        if(busy()||!Number.isInteger(count)||count<0||count>20||![1,5,10].includes(unit))return false;
        const available=wallet+stagedAmount,amount=count*unit;
        if(amount>available)return false;
        wallet=available-amount;stagedAmount=amount;stagedCount=count;stagedUnit=unit;stagedDirect=false;return true;
      },
      stageAmount(amount){
        if(busy()||!Number.isInteger(amount)||amount<0)return false;
        const available=wallet+stagedAmount;if(amount>available)return false;
        wallet=available-amount;stagedAmount=amount;stagedCount=Math.min(20,amount);stagedUnit=1;stagedDirect=amount>0;return true;
      },
      insertStaged(){
        if(busy()||stagedAmount===0)return 0;
        const amount=stagedAmount;credit+=amount;stagedAmount=0;stagedCount=0;stagedDirect=false;return amount;
      },
      cashOut(){
        if(busy()||credit<=0||sum(bets)>0)return 0;
        const amount=credit;payout+=amount;credit=0;risk=0;return amount;
      },
      collectPayout(){
        if(busy()||payout===0)return 0;
        const amount=payout;wallet+=amount;payout=0;return amount;
      },
      transfer(direction,amount=1){
        if(busy()||!Number.isInteger(amount)||amount<=0)return 0;
        if(direction==='winToCredit'&&win>0){const moved=Math.min(amount,win);win-=moved;credit+=moved;risk=Math.min(risk,win);return moved}
        if(direction==='creditToWin'&&credit>sum(bets)){
          const moved=Math.min(amount,credit-sum(bets));credit-=moved;win+=moved;
          if(risk>0&&sum(bets)===0&&guesses<5)risk+=moved;
          return moved;
        }
        return 0;
      },
      grantSubsidy(){
        if(busy()||totalFunds()!==0)return 0;
        wallet=100;return 100;
      },
      adjust(index,delta){
        if(busy()||!Number.isInteger(index)||index<0||index>7||!Number.isInteger(delta))return false;
        const next=Math.max(0,bets[index]+delta);
        if(next>99||sum(bets)-bets[index]+next>credit)return false;
        bets[index]=next;return true;
      },
      clear(){if(busy())return false;bets.fill(0);return true},
      repeat(){if(busy()||!previous||sum(previous)>credit)return false;bets=[...previous];return true},
      start(choose=randomIndex, bonusChooser=drawBonus){
        if(busy()||sum(bets)===0||sum(bets)>credit)return null;
        const index=choose(), bonus=bonusChooser();
        if(!Number.isInteger(index)||index<0||index>=24)throw new Error('Invalid random result');
        const count=['gift','bigTriple','smallTriple'].includes(bonus?.type)?3:bonus?.type==='train'?4:(bonus?.type===null||bonus?.type==='jackpot')?0:-1;
        if(!Array.isArray(bonus?.indices)||bonus.indices.length!==count||
          !bonus.indices.every(i=>Number.isInteger(i)&&i>=0&&i<24)||
          new Set(bonus.indices).size!==count)throw new Error('Invalid bonus result');
        if(triples[bonus.type]&&!bonus.indices.every((v,i)=>v===triples[bonus.type][i]))throw new Error('Invalid triple');
        previous=[...bets];pending={index,bets:[...bets],bonus:{type:bonus.type,indices:[...bonus.indices]}};
        credit-=sum(bets);jackpot+=Math.floor(sum(bets)/10);risk=0;guesses=0;return index;
      },
      bonusPreview(){return pending?{type:pending.bonus.type,indices:[...pending.bonus.indices]}:null},
      settle(){
        if(!pending)return null;
        const [symbol,multiplier]=route[pending.index];
        const baseWin=pending.bets[symbol]*multiplier;
        const awards=pending.bonus.indices.map(index=>{
          const [s,m]=route[index];return {index,win:pending.bets[s]*m};
        });
        const lightWin=awards.reduce((a,b)=>a+b.win,0);
        const jackpotWin=pending.bonus.type==='jackpot'?jackpot:0;
        if(jackpotWin)jackpot=1000;
        const bonusWin=lightWin+jackpotWin,roundWin=baseWin+bonusWin;win+=roundWin;risk=roundWin;
        const result={index:pending.index,symbol,multiplier,stake:pending.bets[symbol],win:roundWin,baseWin,bonusWin,jackpotWin,bonusType:pending.bonus.type,awards};
        pending=null;bets.fill(0);return result;
      },
      collect(){if(busy()||risk===0)return false;risk=0;return true},
      startGamble(choice,draw=randomInt){
        if(busy()||risk<=0||risk>win||guesses>=5||sum(bets)>0||!['small','big'].includes(choice))return false;
        const number=draw(14)+1;
        if(!Number.isInteger(number)||number<1||number>14)throw new Error('Invalid guess draw');
        gamble={number,choice,stake:risk};win-=risk;risk=0;return true;
      },
      settleGamble(){
        if(!gamble)return null;
        const won=gamble.choice===(gamble.number<=7?'small':'big');
        const gambleWin=won?gamble.stake*2:0;win+=gambleWin;guesses++;
        risk=guesses<5?gambleWin:0;
        const result={...gamble,won,win:gambleWin,collected:guesses===5&&won};gamble=null;return result;
      }
    };
  }
export {symbols,route,randomInt,randomIndex,drawBonus,triples,createGame};
