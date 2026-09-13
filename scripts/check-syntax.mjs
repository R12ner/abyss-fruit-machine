/** 对 dist/js 与 tests 下的每个模块做一次语法检查，新增文件自动纳入。 */
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';

const walk = dir => readdirSync(dir, {withFileTypes: true})
  .flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : entry.name.endsWith('.mjs') ? [`${dir}/${entry.name}`] : []);

const files = [...walk('dist/js'), ...walk('scripts'), ...walk('tests')].sort();
for (const file of files) execFileSync(process.execPath, ['--check', file], {stdio: 'inherit'});
console.log(`syntax ok: ${files.length} modules`);
