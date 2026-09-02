import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/app-shell.js');
const index=read('index.html');

assert.match(shell,/refreshWorkflowCommand/);
assert.match(shell,/\/api\/workflow/);
assert.match(shell,/SEU TRABALHO AGORA/);
assert.match(shell,/Resolver na Central/);
assert.match(shell,/workflowAreasForRole/);
assert.match(shell,/ESTOQUE:\['ESTOQUE','EXPEDICAO'\]/);

assert.match(index,/DOMContentLoaded/);
assert.match(index,/focado-api\.thiagovpinho\.workers\.dev/);
assert.ok(!index.includes("setTimeout(()=>document.documentElement.classList.remove('focado-booting'),8000)"));

for(const name of ['orders','pcp','production','inventory','purchases','logistics','indicators']){
  assert.ok(!index.includes('assets/modules/'+name+'.js?v='),'boot não deve carregar '+name);
  assert.ok(!index.includes('assets/modules/'+name+'.css?v='),'boot não deve carregar CSS '+name);
}

console.log('phase5-performance-ux: ok');
