const listeners=new Set();
let adapter=null;

function requireAdapter(){
  if(!adapter)throw new Error('Casino wallet is not connected');
  return adapter;
}

function notify(){
  const balance=casinoWallet.balance();
  for(const listener of listeners)listener(balance);
}

export const casinoWallet=Object.freeze({
  connect(nextAdapter){
    if(!nextAdapter||typeof nextAdapter.balance!=='function'||typeof nextAdapter.spend!=='function'||typeof nextAdapter.deposit!=='function')throw new TypeError('Invalid casino wallet adapter');
    adapter=nextAdapter;notify();
  },
  balance(){return adapter?adapter.balance():0},
  spend(amount){const spent=requireAdapter().spend(amount);if(spent)notify();return spent},
  deposit(amount){const deposited=requireAdapter().deposit(amount);if(deposited)notify();return deposited},
  subscribe(listener){listeners.add(listener);listener(casinoWallet.balance());return ()=>listeners.delete(listener)}
});
