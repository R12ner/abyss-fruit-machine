'use strict';
(function (root) {
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
  function drawBonus(draw=randomInt){
    if(draw(12)!==0)return {type:null,indices:[]};
    if(draw(2)===0){
      const pool=route.map((_,i)=>i), indices=[];
      for(let n=0;n<3;n++)indices.push(pool.splice(draw(pool.length),1)[0]);
      return {type:'gift',indices};
    }
    const first=draw(24);
    return {type:'train',indices:Array.from({length:4},(_,i)=>(first+i)%24)};
  }
  function createGame(){
    let credit=1000,bets=Array(8).fill(0),previous=null,pending=null,win=0,risk=0,guesses=0,gamble=null;
    const busy=()=>pending!==null||gamble!==null;
    return {
      snapshot:()=>({credit,bets:[...bets],previous:previous&&[...previous],busy:busy(),win,risk,guesses,total:sum(bets)}),
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
        const count=bonus?.type==='gift'?3:bonus?.type==='train'?4:bonus?.type===null?0:-1;
        if(!Array.isArray(bonus?.indices)||bonus.indices.length!==count||
          !bonus.indices.every(i=>Number.isInteger(i)&&i>=0&&i<24)||
          new Set(bonus.indices).size!==count)throw new Error('Invalid bonus result');
        previous=[...bets];pending={index,bets:[...bets],bonus:{type:bonus.type,indices:[...bonus.indices]}};
        credit-=sum(bets);win=0;risk=0;guesses=0;return index;
      },
      bonusPreview(){return pending?{type:pending.bonus.type,indices:[...pending.bonus.indices]}:null},
      settle(){
        if(!pending)return null;
        const [symbol,multiplier]=route[pending.index];
        const baseWin=pending.bets[symbol]*multiplier;
        const awards=pending.bonus.indices.map(index=>{
          const [s,m]=route[index];return {index,win:pending.bets[s]*m};
        });
        const bonusWin=awards.reduce((a,b)=>a+b.win,0);win=baseWin+bonusWin;credit+=win;risk=win;
        const result={index:pending.index,symbol,multiplier,stake:pending.bets[symbol],win,baseWin,bonusWin,bonusType:pending.bonus.type,awards};
        pending=null;bets.fill(0);return result;
      },
      collect(){if(busy()||risk===0)return false;risk=0;return true},
      startGamble(choice,draw=randomInt){
        if(busy()||risk<=0||risk>credit||guesses>=5||sum(bets)>0||!['small','big'].includes(choice))return false;
        const number=draw(14)+1;
        if(!Number.isInteger(number)||number<1||number>14)throw new Error('Invalid guess draw');
        gamble={number,choice,stake:risk};credit-=risk;risk=0;win=0;return true;
      },
      settleGamble(){
        if(!gamble)return null;
        const won=gamble.choice===(gamble.number<=7?'small':'big');
        win=won?gamble.stake*2:0;credit+=win;guesses++;
        risk=guesses<5?win:0;
        const result={...gamble,won,win,collected:guesses===5&&won};gamble=null;return result;
      }
    };
  }
  const api={symbols,route,randomInt,randomIndex,drawBonus,createGame};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.FruitGame=api;
})(globalThis);
