import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const shell=read('assets/app-shell.js');
const loader=read('assets/core/module-loader.js');
const kanban=read('assets/modules/kanban.js');
const orders=read('assets/modules/orders.js');
const intelligence=read('assets/modules/intelligence.js');

const loaderPos=index.indexOf('assets/core/module-loader.js?v=20260827-lazy-v2');
const shellPos=index.indexOf('assets/app-shell.js?v=20260827-shell-v8');
assert.ok(loaderPos>=0,'Index deve carregar module-loader v2');
assert.ok(shellPos>loaderPos,'Module loader deve carregar antes do app shell');

for(const route of ['kanban','cockpit']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Loader deve conhecer '+route);
  assert.ok(shell.includes("id==='"+route+"'"),'Shell deve possuir rota '+route);
}
assert.ok(loader.includes("kanban:()=>typeof window.FocadoKanban?.render==='function'"),'Kanban deve ter contrato de runtime');
assert.ok(loader.includes("cockpit:()=>typeof window.FocadoIntelligenceUI?.renderCockpit==='function'"),'Cockpit deve ter contrato de runtime');
assert.ok(loader.includes('MODULE_CONTRACT_FAILED'),'Loader não pode falhar silenciosamente');
assert.ok(shell.includes('MODULE_LOADER_UNAVAILABLE'),'Shell deve detectar ausência do loader');

assert.ok(orders.includes('window.FocadoOrders={render,openOrder:openForm'),'Pedidos deve expor abertura nativa');
assert.ok(kanban.includes('window.FocadoOrders?.openOrder'),'Kanban deve abrir pedido no módulo nativo');
assert.ok(!kanban.includes('hubGoOperacoes'),'Kanban não pode voltar à operação legada');
assert.ok(!kanban.includes("classList.add('hidden')"),'Kanban não pode esconder o Focado ao abrir pedido');

assert.ok(intelligence.includes('window.FocadoIntelligenceUI={renderCockpit'),'Cockpit deve exportar renderCockpit');
assert.ok(intelligence.includes('renderAuditor'),'Intelligence UI deve carregar completamente');
assert.ok(shell.includes("route:'pedidos'"),'Dashboard deve usar id real da rota Pedidos');
assert.ok(!shell.includes("route:'orders'"),'Rota inexistente orders não pode voltar');

console.log('runtime-navigation: ok');
