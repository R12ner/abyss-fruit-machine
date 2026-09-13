/** 依次运行 tests/ 下的每个 *.test.mjs，新增测试不需要改 package.json。 */
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';

const files = readdirSync('tests').filter(name => name.endsWith('.test.mjs')).sort();
if (!files.length) {console.error('no test files found'); process.exit(1);}
for (const file of files) execFileSync(process.execPath, [`tests/${file}`], {stdio: 'inherit'});
console.log(`\n${files.length} test files passed`);
