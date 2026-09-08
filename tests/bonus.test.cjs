const assert=require('node:assert/strict');
const {createGame,drawBonus,route}=require('../dist/game.js');
const none=()=>({type:null,indices:[]});
function sequence(values){let i=0;return max=>{const value=values[i++];assert.ok(value>=0&&value<max);return value}}
assert.deepEqual(drawBonus(sequence([15])),{type:null,indices:[]});
assert.deepEqual(drawBonus(sequence([0,0,0,0])),{type:'gift',indices:[0,1,2]});
assert.deepEqual(drawBonus(sequence([5,23])),{type:'train',indices:[23,0,1,2]});
for(const type of ['gift','train']){
 const g=createGame();for(let i=0;i<8;i++)g.adjust(i,10);
 const indices=type==='gift'?[4,6,8]:[23,0,1,2];
 g.start(()=>4,()=>({type,indices}));
 assert.equal(g.snapshot().credit,920);
 const preview=g.bonusPreview();preview.indices[0]=12;
 assert.equal(g.bonusPreview().indices[0],indices[0]);
 assert.equal(g.startGamble('small'),false);
 const r=g.settle(),expected=indices.reduce((v,i)=>v+route[i][1]*10,0);
 assert.equal(r.baseWin,1200);assert.equal(r.bonusWin,expected);
 assert.equal(g.snapshot().credit,920+1200+expected);
 assert.equal(g.snapshot().risk,r.win);assert.equal(g.settle(),null);
}
const g=createGame();g.adjust(7,10);g.start(()=>6,none);g.settle();
assert.equal(g.snapshot().credit,1040);
g.adjust(7,1);assert.equal(g.startGamble('small'),false);g.clear();
assert.throws(()=>g.startGamble('small',()=>{throw Error('rng')}));
assert.equal(g.snapshot().credit,1040);assert.equal(g.snapshot().risk,50);
assert.equal(g.startGamble('small',()=>6),true); // 7: small wins
assert.equal(g.snapshot().credit,990);assert.equal(g.adjust(0,1),false);
assert.equal(g.repeat(),false);assert.equal(g.collect(),false);
assert.equal(g.startGamble('big'),false);assert.equal(g.start(()=>0,none),null);
assert.equal(g.settleGamble().win,100);assert.equal(g.snapshot().credit,1090);
assert.equal(g.settleGamble(),null);
assert.equal(g.startGamble('small',()=>7),true); // 8: small loses
assert.equal(g.settleGamble().won,false);assert.equal(g.snapshot().credit,990);
assert.equal(g.snapshot().risk,0);assert.equal(g.startGamble('big'),false);
for(const [choice,number,won] of [['small',1,true],['small',7,true],['small',8,false],['big',7,false],['big',8,true],['big',14,true]]){
 const x=createGame();x.adjust(7,10);x.start(()=>6,none);x.settle();
 x.startGamble(choice,()=>number-1);assert.equal(x.settleGamble().won,won);
}
const x=createGame();x.adjust(7,10);x.start(()=>6,none);x.settle();
for(let i=0;i<5;i++){assert.equal(x.startGamble('big',()=>13),true);const r=x.settleGamble();assert.equal(r.win,50*2**(i+1));assert.equal(r.collected,i===4)}
assert.equal(x.snapshot().credit,990+1600);assert.equal(x.snapshot().risk,0);
assert.equal(x.startGamble('big'),false);
const y=createGame();y.adjust(7,10);y.start(()=>6,none);y.settle();assert.equal(y.collect(),true);
assert.equal(y.snapshot().credit,1040);assert.equal(y.collect(),false);assert.equal(y.startGamble('small'),false);
const z=createGame();z.adjust(7,10);
assert.throws(()=>z.start(()=>6,()=>{throw Error('bonus rng')}));assert.equal(z.snapshot().credit,1000);
z.start(()=>6,none);z.settle();z.repeat();z.start(()=>4,none);assert.equal(z.snapshot().risk,0);
console.log('Passed: gift/train rewards, wrapping, main overlap, draw failures, gamble boundaries, locks, loss isolation, collection and five-round limit.');
