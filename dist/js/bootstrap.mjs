import {createGameRegistry} from './casino/game-registry.mjs';
import {createCasinoShell} from './casino/shell.mjs';
import {casinoWallet} from './casino/wallet.mjs';
import {fruitGameDefinition} from './games/fruit/index.mjs';
import {rouletteGameDefinition} from './games/roulette/index.mjs';

const registry=createGameRegistry();
registry.register(fruitGameDefinition);registry.register(rouletteGameDefinition);
const shell=createCasinoShell(registry);
registry.initialize({wallet:casinoWallet,openLobby:screen=>shell.show(screen),openGame:id=>shell.enter(id)});
shell.render();shell.show('welcome');

export {registry,shell};
