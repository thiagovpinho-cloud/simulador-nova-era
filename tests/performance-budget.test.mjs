import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const loader=read('assets/core/module-loader.js');
const bases=read('assets/modules/bases.js');
const dataStore=read('assets/core/data-store.js');
const auth=read('assets/core/auth-client.js');
const deferredIntelligence=read('assets/core/deferred-intelligence.js');
const modules=['orders','pcp','production','inventory','logistics','purchases','expedition','customers','products','representatives','technical-sheets','bases','intelligence-core','intelligence','kanban'];

assert.ok(index.includes('assets/core/module-loader.js'),'Loader de módulos deve estar no index');

// Boot deve carregar somente o núcleo. Áreas operacionais entram sob demanda.
for(const m of modules){
  assert.ok(!index.includes('assets/modules/'+m+'.js?v='),'Módulo não deve ser carregado antes do login: '+m);
  if(!['intelligence-core'].includes(m)){
    assert.ok(!index.includes('assets/modules/'+m+'.css?v='),'CSS de módulo não deve ser carregado antes da navegação: '+m);
  }
}
for(const route of ['simulador','pedidos','pcp','production','inventory','inputs','purchases','expedicao','logistica','entregas','transportadoras','kanban','cockpit']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Rota ausente no lazy loader: '+route);
}
assert.ok(!loader.includes("'corpo-auditor':"),'Corpo Auditor aposentado não deve voltar ao loader');
assert.ok(!loader.includes("'system-health':"),'Saúde & Auditoria aposentada não deve voltar ao loader');
assert.ok(auth.includes("RETIRED_ROUTES=new Set(['corpo-auditor','system-health'])"),'Rotas aposentadas devem permanecer bloqueadas na navegação');
assert.ok(loader.includes('insertBefore(el,ds)'),'CSS lazy deve ser inserido antes do Design System');
assert.ok(index.includes('https://focado-api.thiagovpinho.workers.dev'),'Boot deve antecipar conexão com a API');
assert.ok(index.includes("DOMContentLoaded"),'Login deve poder aparecer assim que o DOM estiver pronto');
assert.ok(!index.includes("setTimeout(()=>document.documentElement.classList.remove('focado-booting'),8000)"),'Splash legado de 8s não pode voltar');

// Guardas estruturais de performance: evitam regressão para padrões já removidos.
assert.ok(loader.includes('if(deps.length)await Promise.all(deps.map(ensure))'),'Dependências independentes devem carregar em paralelo');
assert.ok(!loader.includes("for(const dep of def.deps||[])await ensure(dep)"),'Loader não pode voltar a serializar dependências independentes');
assert.ok(loader.includes("pcp:{css:'pcp.css',js:'pcp.js',deps:['produtos','production','deferred-intelligence']}"),'PCP não deve carregar Cockpit automaticamente');
assert.ok(loader.includes("purchases:{css:'purchases.css',js:'purchases.js',deps:['deferred-intelligence']}"),'Compras não deve carregar Cockpit automaticamente');
assert.ok(loader.includes("logistica:{css:'logistics.css',js:'logistics.js',deps:['deferred-intelligence']}"),'Logística não deve carregar Cockpit automaticamente');
assert.ok(!loader.includes("pcp:{css:'pcp.css',js:'pcp.js',deps:['produtos','production','cockpit']}"),'PCP não pode regredir para dependência eager de Cockpit');
assert.ok(!loader.includes("purchases:{css:'purchases.css',js:'purchases.js',deps:['cockpit']}"),'Compras não pode regredir para dependência eager de Cockpit');
assert.ok(!loader.includes("logistica:{css:'logistics.css',js:'logistics.js',deps:['cockpit']}"),'Logística não pode regredir para dependência eager de Cockpit');
assert.ok(deferredIntelligence.includes("fpMRP:'renderMRP'"),'MRP deve carregar Inteligência apenas no clique');
assert.ok(deferredIntelligence.includes("fpurScore:'renderSuppliers'"),'Performance de fornecedores deve carregar Inteligência apenas no clique');
assert.ok(deferredIntelligence.includes("flScore:'renderCarriers'"),'Performance de transportadoras deve carregar Inteligência apenas no clique');
assert.ok(bases.includes('const changed=[]'),'Bases deve detectar alterações antes de persistir');
assert.ok(bases.includes('for(const n of changed)'),'Bases deve persistir somente registros modificados');
assert.ok(bases.includes("if(!changed.length)"),'Bases deve bloquear gravação quando nada mudou');
assert.ok(!dataStore.includes('async function hydrateLocalCache(){const state=await load();writeLocal(state);return state}'),'Hidratação não pode voltar a serializar o mesmo estado duas vezes');

const sizes={};
for(const file of fs.readdirSync(new URL('../assets/modules/',import.meta.url))){
  if(!file.endsWith('.js'))continue;
  sizes[file]=fs.statSync(new URL('../assets/modules/'+file,import.meta.url)).size;
}
for(const [file,size] of Object.entries(sizes))assert.ok(size<=50000,file+' excedeu orçamento inicial de 50 KB');
assert.ok(Buffer.byteLength(index,'utf8')<=365000,'index.html excedeu orçamento transitório de 365 KB');

console.log('performance-budget: ok');
