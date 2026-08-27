import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const loader=read('assets/core/module-loader.js');
const modules=['orders','pcp','production','inventory','logistics','purchases','expedition','customers','products','representatives','kanban','system-health','intelligence-core','intelligence'];

assert.ok(index.includes('assets/core/module-loader.js'),'Loader de módulos deve estar no index');
for(const m of modules){
  assert.ok(!new RegExp('assets/modules/'+m+'\\.(js|css)').test(index),'Módulo '+m+' não deve ser pré-carregado no index');
}
for(const route of ['pedidos','pcp','production','inventory','inputs','purchases','expedicao','logistica','entregas','transportadoras','kanban','system-health','cockpit','corpo-auditor']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Rota ausente no lazy loader: '+route);
}
assert.ok(loader.includes('insertBefore(el,ds)'),'CSS lazy deve ser inserido antes do Design System');

const sizes={};
for(const file of fs.readdirSync(new URL('../assets/modules/',import.meta.url))){
  if(!file.endsWith('.js'))continue;
  sizes[file]=fs.statSync(new URL('../assets/modules/'+file,import.meta.url)).size;
}
for(const [file,size] of Object.entries(sizes))assert.ok(size<=50000,file+' excedeu orçamento inicial de 50 KB');
assert.ok(Buffer.byteLength(index,'utf8')<=360000,'index.html excedeu orçamento transitório de 360 KB');

console.log('performance-budget: ok');
