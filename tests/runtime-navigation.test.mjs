import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const shell=read('assets/app-shell.js');
const loader=read('assets/core/module-loader.js');
const kanban=read('assets/modules/kanban.js');
const orders=read('assets/modules/orders.js');
const intelligence=read('assets/modules/intelligence.js');

const loaderPos=index.indexOf('assets/core/module-loader.js?v=');
const shellPos=index.indexOf('assets/app-shell.js?v=');
assert.ok(loaderPos>=0,'Index deve carregar module-loader versionado');
assert.ok(shellPos>loaderPos,'Module loader deve carregar antes do app shell');

const activeRoutes=[
  ['kanban',"window.FocadoKanban?.render"],
  ['cockpit',"window.FocadoIntelligenceUI?.renderCockpit"],
  ['clientes',"window.FocadoCustomers?.render"],
  ['representantes',"window.FocadoRepresentatives?.render"],
  ['pedidos',"window.FocadoOrders?.render"],
  ['fichas',"window.FocadoTechnicalSheets?.render"],
  ['produtos',"window.FocadoProducts?.render"],
  ['pcp',"window.FocadoPCP?.render"],
  ['production',"window.FocadoProduction?.render"],
  ['bases',"window.FocadoBases?.render"],
  ['inventory',"window.FocadoInventory?.render"],
  ['inputs',"window.FocadoInventory?.render"],
  ['purchases',"window.FocadoPurchases?.render"],
  ['expedicao',"window.FocadoExpedition?.render"],
  ['logistica',"window.FocadoLogistics?.render"],
  ['entregas',"window.FocadoLogistics?.renderDeliveries"],
  ['transportadoras',"window.FocadoLogistics?.renderCarriers"],
  ['corpo-auditor',"window.FocadoIntelligenceUI?.renderAuditor"],
  ['system-health',"window.FocadoSystemHealth?.render"],
  ['config',"window.FocadoSettings?.render"],
  ['usuarios',"window.FocadoUsers?.render"],
  ['financeiro',"window.FocadoFinance?.render"]
];

for(const [route,renderer] of activeRoutes){
  assert.ok(shell.includes("id==='"+route+"'"),'Shell deve possuir rota ativa '+route);
  assert.ok(shell.includes(renderer),'Rota '+route+' deve chamar renderizador real');
}

const staticModules=[
  'products','representatives','customers','orders','production','pcp','inventory','purchases',
  'expedition','logistics','technical-sheets','bases','system-health','intelligence-core','intelligence','kanban'
];
for(const m of staticModules){
  const expected=(m==='bases'||m==='inventory')?'assets/modules/'+m+'.js?v=':'assets/modules/'+m+'.js?v=20260827-static-v1';
  assert.ok(index.includes(expected),'Módulo ativo deve ser pré-carregado: '+m);
}

assert.ok(loader.includes("kanban:()=>typeof window.FocadoKanban?.render==='function'"),'Kanban deve ter contrato');
assert.ok(loader.includes("cockpit:()=>typeof window.FocadoIntelligenceUI?.renderCockpit==='function'"),'Cockpit deve ter contrato');
assert.ok(loader.includes("fichas:()=>typeof window.FocadoTechnicalSheets?.render==='function'"),'Fichas deve ter contrato');
assert.ok(loader.includes("bases:()=>typeof window.FocadoBases?.render==='function'"),'Bases deve ter contrato');
assert.ok(loader.includes("usuarios:()=>typeof window.FocadoUsers?.render==='function'"),'Usuários deve ter contrato');
assert.ok(loader.includes("config:()=>typeof window.FocadoSettings?.render==='function'"),'Configurações deve ter contrato');
assert.ok(index.includes('assets/modules/users.js?v='),'Usuários deve ser pré-carregado para navegação imediata');
assert.ok(index.includes('assets/modules/settings.js?v='),'Configurações deve ser pré-carregada para navegação imediata');
assert.ok(index.includes('assets/modules/settings.css?v='),'Configurações deve carregar estilo próprio');
assert.ok(index.includes('assets/modules/users.css?v='),'Usuários deve carregar estilo próprio sem corrida lazy');

assert.ok(orders.includes('window.FocadoOrders={render,openOrder:openForm'),'Pedidos deve expor abertura nativa');
assert.ok(kanban.includes('window.FocadoOrders.openOrder(id)'),'Kanban deve abrir pedido nativamente');
assert.ok(!kanban.includes('hubGoOperacoes'),'Kanban não pode usar rota legada');
assert.ok(!shell.includes("if(id==='fichas')return clickLegacy"),'Fichas não pode usar legado');
assert.ok(!shell.includes("if(id==='bases')return openOps"),'Bases não pode usar legado');

assert.ok(intelligence.includes('window.FocadoIntelligenceUI={renderCockpit'),'Cockpit deve exportar renderCockpit');
assert.ok(intelligence.includes('renderAuditor'),'Corpo Auditor deve exportar renderAuditor');
assert.ok(shell.includes("route:'pedidos'"),'Dashboard deve usar rota Pedidos real');
assert.ok(!shell.includes("route:'orders'"),'Rota inexistente orders não pode voltar');

console.log('runtime-navigation: ok');

assert.ok(shell.includes("refreshInBackground('customers'"),'Clientes deve atualizar em segundo plano');
assert.ok(shell.includes("refreshInBackground('orders'"),'Pedidos deve atualizar em segundo plano');
assert.ok(!shell.includes("if(id==='clientes')await window.FocadoDataStore?.refreshDomainV2?.('customers')"),'Clientes não pode bloquear navegação esperando API');
assert.ok(!shell.includes("if(id==='pedidos')await window.FocadoDataStore?.refreshDomainV2?.('orders')"),'Pedidos não pode bloquear navegação esperando API');
