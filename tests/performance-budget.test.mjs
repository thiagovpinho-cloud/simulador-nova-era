import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const loader=read('assets/core/module-loader.js');
const bases=read('assets/modules/bases.js');
const dataStore=read('assets/core/data-store.js');
const modules=['orders','pcp','production','inventory','logistics','purchases','expedition','customers','products','representatives','system-health','technical-sheets','bases','intelligence-core','intelligence','kanban'];

assert.ok(index.includes('assets/core/module-loader.js'),'Loader de módulos deve estar no index');

// Boot deve carregar somente o núcleo. Áreas operacionais entram sob demanda.
for(const m of modules){
  assert.ok(!index.includes('assets/modules/'+m+'.js?v='),'Módulo não deve ser carregado antes do login: '+m);
  if(!['intelligence-core'].includes(m)){
    assert.ok(!index.includes('assets/modules/'+m+'.css?v='),'CSS de módulo não deve ser carregado antes da navegação: '+m);
  }
}
for(const route of ['simulador','pedidos','pcp','production','inventory','inputs','purchases','expedicao','logistica','entregas','transportadoras','kanban','system-health','cockpit','corpo-auditor']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Rota ausente no lazy loader: '+route);
}
assert.ok(loader.includes('insertBefore(el,ds)'),'CSS lazy deve ser inserido antes do Design System');
assert.ok(index.includes('https://focado-api.thiagovpinho.workers.dev'),'Boot deve antecipar conexão com a API');
assert.ok(index.includes("DOMContentLoaded"),'Login deve poder aparecer assim que o DOM estiver pronto');
assert.ok(!index.includes("setTimeout(()=>document.documentElement.classList.remove('focado-booting'),8000)"),'Splash legado de 8s não pode voltar');

// Guardas estruturais de performance: evitam regressão para padrões já removidos.
assert.ok(loader.includes("await Promise.all((def.deps||[]).map(dep=>ensure(dep)))"),'Dependências independentes devem carregar em paralelo');
assert.ok(!loader.includes("for(const dep of def.deps||[])await ensure(dep)"),'Loader não pode voltar a serializar dependências independentes');
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
