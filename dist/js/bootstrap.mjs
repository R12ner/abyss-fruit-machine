import {createGameRegistry} from './casino/game-registry.mjs';
import {createCasinoShell} from './casino/shell.mjs';
import {casinoWallet} from './casino/wallet.mjs';
import {fruitGameDefinition} from './games/fruit/index.mjs';
import {rouletteGameDefinition} from './games/roulette/index.mjs';
import {coinPusherGameDefinition} from './games/coin-pusher/index.mjs';
import {plinkoGameDefinition} from './games/plinko/index.mjs';

const registry=createGameRegistry();
registry.register(fruitGameDefinition);registry.register(rouletteGameDefinition);
registry.register(coinPusherGameDefinition);registry.register(plinkoGameDefinition);
const shell=createCasinoShell(registry);
registry.initialize({wallet:casinoWallet,openLobby:screen=>shell.show(screen),openGame:id=>shell.enter(id)});
const requestedGame=location.hash.slice(1);
shell.render();
if(registry.list().some(game=>game.id===requestedGame))shell.enter(requestedGame);
else shell.show('welcome');

export {registry,shell};
