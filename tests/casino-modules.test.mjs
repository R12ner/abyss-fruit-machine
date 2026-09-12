import assert from 'node:assert/strict';
import {createGameRegistry} from '../dist/js/casino/game-registry.mjs';
import {casinoWallet} from '../dist/js/casino/wallet.mjs';

const calls=[],registry=createGameRegistry();
const definition=id=>({id,title:id,subtitle:`${id} game`,badge:id.toUpperCase(),create:context=>({enter:()=>calls.push(`enter:${id}:${context.floor}`),leave:()=>calls.push(`leave:${id}`)})});
registry.register(definition('fruit'));registry.register(definition('roulette'));
assert.throws(()=>registry.register(definition('fruit')),/Duplicate game/);
registry.initialize({floor:'B1'});
assert.deepEqual(registry.list().map(game=>game.id),['fruit','roulette']);
registry.enter('fruit');registry.enter('roulette');registry.leave();
assert.deepEqual(calls,['enter:fruit:B1','leave:fruit','enter:roulette:B1','leave:roulette']);
assert.equal(registry.active(),null);
assert.throws(()=>registry.enter('missing'),/Unknown game/);

let balance=100;const observed=[];
casinoWallet.connect({balance:()=>balance,spend:amount=>amount<=balance?(balance-=amount,amount):0,deposit:amount=>(balance+=amount,amount)});
const unsubscribe=casinoWallet.subscribe(value=>observed.push(value));
assert.equal(casinoWallet.spend(25),25);assert.equal(casinoWallet.balance(),75);
assert.equal(casinoWallet.spend(100),0);assert.equal(casinoWallet.deposit(10),10);assert.equal(casinoWallet.balance(),85);
unsubscribe();assert.deepEqual(observed,[100,75,85]);
assert.throws(()=>casinoWallet.connect({}),/Invalid casino wallet adapter/);
console.log('casino registry and shared wallet tests passed');
