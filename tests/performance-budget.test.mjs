import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const loader=read('assets/core/module-loader.js');
const modules=['orders','pcp','production','inventory','logistics','purchases','expedition','customers','products','representatives','system-health','technical-sheets','bases','intelligence-core','intelligence','kanban'];

assert.ok(index.includes('assets/core/module-loader.js'),'Loader de módulos deve estar no index');
for(const m of modules){
  const preloaded=['orders','pcp','production','inventory','logistics','purchases','expedition','customers','products','representatives','system-health','intelligence-core','intelligence','kanban'].includes(m);
  if(preloaded){
    const expected=['inventory','orders','production'].includes(m)?'assets/modules/'+m+'.js?v=':'assets/modules/'+m+'.js?v=20260827-static-v1';
    assert.ok(index.includes(expected),'Módulo ativo deve ser pré-carregado: '+m);
  }
}
for(const route of ['pedidos','pcp','production','inventory','inputs','purchases','expedicao','logistica','entregas','transportadoras','kanban','system-health','cockpit','corpo-auditor']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Rota ausente no lazy loader: '+route);
}
assert.ok(loader.includes('insertBefore(el,ds)'),'CSS lazy deve ser inserido antes do Design System');

// Regra de estabilidade: inteligência pesada nunca participa da abertura operacional.
assert.ok(loader.includes("pcp:{css:'pcp.css',js:'pcp.js',deps:['produtos','production']}"),'PCP deve carregar sem Cockpit');
assert.ok(loader.includes("purchases:{css:'purchases.css',js:'purchases.js'}"),'Compras deve carregar sem Cockpit');
assert.ok(loader.includes("logistica:{css:'logistics.css',js:'logistics.js'}"),'Logística deve carregar sem Cockpit');
assert.ok(!loader.includes("deps:['produtos','production','cockpit']"),'Cockpit não pode voltar ao boot do PCP');
assert.ok(!loader.includes("purchases:{css:'purchases.css',js:'purchases.js',deps:['cockpit']}"),'Cockpit não pode voltar ao boot de Compras');
assert.ok(!loader.includes("logistica:{css:'logistics.css',js:'logistics.js',deps:['cockpit']}"),'Cockpit não pode voltar ao boot de Logística');
assert.ok(loader.includes("fpMRP:'renderMRP'"),'MRP deve continuar disponível sob demanda');
assert.ok(loader.includes("fpurScore:'renderSuppliers'"),'Performance de fornecedores deve continuar sob demanda');
assert.ok(loader.includes("flScore:'renderCarriers'"),'Performance de transportadoras deve continuar sob demanda');
assert.ok(loader.includes("await ensure('cockpit')"),'Inteligência deve ser carregada somente após ação explícita');

const sizes={};
for(const file of fs.readdirSync(new URL('../assets/modules/',import.meta.url))){
  if(!file.endsWith('.js'))continue;
  sizes[file]=fs.statSync(new URL('../assets/modules/'+file,import.meta.url)).size;
}
for(const [file,size] of Object.entries(sizes))assert.ok(size<=50000,file+' excedeu orçamento inicial de 50 KB');
assert.ok(Buffer.byteLength(index,'utf8')<=365000,'index.html excedeu orçamento transitório de 365 KB');

console.log('performance-budget: ok');

