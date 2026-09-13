import {DEALER_INTEL_TRUTH_CHANCES,DEALER_SAYINGS,dealerLieReveal} from './dealer-dialogue.mjs';

export {DEALER_INTEL_TRUTH_CHANCES,DEALER_SAYINGS,dealerLieReveal};

export const ROULETTE_SEQUENCE=Object.freeze([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);

export const RED_NUMBERS=Object.freeze([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const redSet=new Set(RED_NUMBERS);

export function numberColor(number){
  if(number===0)return 'green';
  return redSet.has(number)?'red':'black';
}

const DEALER_INTEL_TYPES=Object.freeze(['color','range','parity','dozen','column','exact']);

export function dealerIntelTruthChance(type){
  return DEALER_INTEL_TYPES.includes(type)?DEALER_INTEL_TRUTH_CHANCES[type]:0;
}

export function dealerTipChance(value){
  if(!Number.isFinite(value)||value<=0)return 0;
  if(value>=10000)return .22;
  if(value>=5000)return .15;
  if(value>=1000)return .08;
  if(value>=500)return .05;
  if(value>=100)return .025;
  if(value>=25)return .01;
  if(value>=5)return .005;
  return .002;
}

export function describeDealerIntel(result,type){
  if(!Number.isInteger(result)||result<0||result>36||!DEALER_INTEL_TYPES.includes(type))return null;
  if(type==='color')return result===0?'下一局的颜色……会是绿色。':`下一局的颜色……会是${numberColor(result)==='red'?'红色':'黑色'}。`;
  if(type==='range')return result===0?'下一局……不会落在 1–36。':`下一局……会落在 ${result<=18?'1–18':'19–36'}。`;
  if(type==='parity')return result===0?'下一局……既不是单，也不是双。':`下一局……会是${result%2?'单数':'双数'}。`;
  if(type==='dozen')return result===0?'下一局……不在任何十二数区里。':`下一局……会落在第 ${Math.ceil(result/12)} 打。`;
  if(type==='column')return result===0?'下一局……不在三列之中。':`下一局……会落在第 ${(result-1)%3+1} 列。`;
  return `下一局……盯紧 ${result} 号。`;
}

function dealerIntelMeaning(result,type){
  if(type==='color')return numberColor(result);
  if(type==='range')return result===0?'zero':result<=18?'low':'high';
  if(type==='parity')return result===0?'zero':result%2?'odd':'even';
  if(type==='dozen')return result===0?'zero':Math.ceil(result/12);
  if(type==='column')return result===0?'zero':(result-1)%3+1;
  return result;
}

export function dealerIntelMatchesResult(intel,result=intel?.result){
  if(!intel||!DEALER_INTEL_TYPES.includes(intel.type)||!Number.isInteger(intel.claimResult)||!Number.isInteger(result))return false;
  return dealerIntelMeaning(intel.claimResult,intel.type)===dealerIntelMeaning(result,intel.type);
}

export function createDealerIntel(tip,draw){
  const chance=dealerTipChance(tip);
  if(!chance||draw(10000)>=Math.round(chance*10000))return null;
  const result=draw(37),ticket=draw(100);
  const type=ticket<34?'color':ticket<58?'range':ticket<75?'parity':ticket<87?'dozen':ticket<95?'column':'exact';
  const truthChance=dealerIntelTruthChance(type),truthful=draw(10000)<Math.round(truthChance*10000);
  let claimResult=result,lieLineIndex=null;
  if(!truthful){
    const alternatives=Array.from({length:37},(_,number)=>number).filter(number=>dealerIntelMeaning(number,type)!==dealerIntelMeaning(result,type));
    claimResult=alternatives[draw(alternatives.length)];
    lieLineIndex=draw(DEALER_SAYINGS.falseIntel.length);
  }
  return {result,claimResult,type,truthful,truthChance,message:describeDealerIntel(claimResult,type),lieLineIndex,revealMessage:truthful?null:dealerLieReveal(lieLineIndex),tip,chance};
}

export function restoreDealerIntel(value){
  if(!value||!Number.isFinite(value.tip)||value.tip<=0)return null;
  const truthful=value.truthful!==false,claimResult=Number.isInteger(value.claimResult)?value.claimResult:value.result;
  const message=describeDealerIntel(claimResult,value.type),candidate={claimResult,type:value.type};
  if(!message||!Number.isInteger(value.result)||value.result<0||value.result>36||dealerIntelMatchesResult(candidate,value.result)!==truthful)return null;
  const lieLineIndex=truthful?null:Number.isInteger(value.lieLineIndex)?value.lieLineIndex:0;
  return {result:value.result,claimResult,type:value.type,truthful,truthChance:dealerIntelTruthChance(value.type),message,lieLineIndex,revealMessage:truthful?null:dealerLieReveal(lieLineIndex),tip:value.tip,chance:dealerTipChance(value.tip)};
}

export function isRouletteBankrupt({walletBalance,inventoryTotal,betTotal,payoutTotal,halfCredit,busy=false}={}){
  return !busy&&[walletBalance,inventoryTotal,betTotal,payoutTotal,halfCredit].every(value=>Number.isFinite(value)&&value===0);
}

export function groupPayoutChips(values){
  const counts=new Map();
  for(const value of values)if(Number.isFinite(value)&&value>0)counts.set(value,(counts.get(value)||0)+1);
  return [...counts].sort((a,b)=>b[0]-a[0]).map(([value,count])=>({value,count}));
}

const range=(start,end)=>Array.from({length:end-start+1},(_,index)=>start+index);
const sorted=(...numbers)=>numbers.flat().map(Number).sort((a,b)=>a-b);

export function describeBet(id){
  let match;
  if((match=id.match(/^number-(\d+)$/))){
    const number=Number(match[1]);
    if(number>=0&&number<=36)return {id,label:`单号 ${number}`,numbers:[number],payout:35,type:'单号'};
  }
  if((match=id.match(/^split-(\d+)-(\d+)$/))){
    const numbers=sorted(match[1],match[2]);
    if(numbers.length===2&&numbers.every(n=>n>=0&&n<=36))return {id,label:`分注 ${numbers.join('·')}`,numbers,payout:17,type:'分注'};
  }
  if((match=id.match(/^street-(\d+)$/))){
    const street=Number(match[1]);
    if(street>=0&&street<12){const first=street*3+1;return {id,label:`街注 ${first}–${first+2}`,numbers:range(first,first+2),payout:11,type:'街注'}}
  }
  if(id==='trio-012')return {id,label:'三数 0·1·2',numbers:[0,1,2],payout:11,type:'三数'};
  if(id==='trio-023')return {id,label:'三数 0·2·3',numbers:[0,2,3],payout:11,type:'三数'};
  if((match=id.match(/^corner-(\d+)$/))){
    const first=Number(match[1]);
    if(first>=1&&first<=32&&first%3!==0)return {id,label:`角注 ${[first,first+1,first+3,first+4].join('·')}`,numbers:[first,first+1,first+3,first+4],payout:8,type:'角注'};
  }
  if(id==='basket')return {id,label:'首四 0·1·2·3',numbers:[0,1,2,3],payout:8,type:'首四'};
  if((match=id.match(/^sixline-(\d+)$/))){
    const street=Number(match[1]);
    if(street>=0&&street<11){const first=street*3+1;return {id,label:`双街 ${first}–${first+5}`,numbers:range(first,first+5),payout:5,type:'双街'}}
  }
  if((match=id.match(/^dozen-([123])$/))){
    const dozen=Number(match[1]),start=(dozen-1)*12+1;
    return {id,label:`第 ${dozen} 打`,numbers:range(start,start+11),payout:2,type:'十二数区'};
  }
  if((match=id.match(/^column-([123])$/))){
    const column=Number(match[1]);
    return {id,label:`第 ${column} 列`,numbers:range(1,36).filter(n=>(n-1)%3===column-1),payout:2,type:'列注'};
  }
  if(id==='red'||id==='black')return {id,label:id==='red'?'红':'黑',numbers:range(1,36).filter(n=>numberColor(n)===id),payout:1,type:'颜色'};
  if(id==='odd'||id==='even')return {id,label:id==='odd'?'单':'双',numbers:range(1,36).filter(n=>n%2===(id==='odd'?1:0)),payout:1,type:'单双'};
  if(id==='low'||id==='high')return {id,label:id==='low'?'1–18':'19–36',numbers:id==='low'?range(1,18):range(19,36),payout:1,type:'大小'};
  return null;
}

export function settleBets(entries,result){
  if(!Number.isInteger(result)||result<0||result>36)throw new RangeError('Invalid roulette result');
  let stake=0,returned=0;
  const wins=[];
  for(const [id,rawAmount] of entries){
    const amount=Number(rawAmount),bet=describeBet(id);
    if(!bet||!Number.isFinite(amount)||amount<=0)continue;
    stake+=amount;
    if(result===0&&['red','black','odd','even','low','high'].includes(id)){
      const value=amount/2;returned+=value;wins.push({...bet,label:`${bet.label} · 平分`,amount,returned:value,profit:-value,laPartage:true});
    }else if(bet.numbers.includes(result)){
      const value=amount*(bet.payout+1);
      returned+=value;wins.push({...bet,amount,returned:value,profit:amount*bet.payout});
    }
  }
  return {result,stake,returned,net:returned-stake,wins};
}
