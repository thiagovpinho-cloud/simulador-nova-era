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
  ['cockpit',"window.FocadoIndicators?.render"],
  ['clientes',"window.FocadoCustomers?.render"],
  ['representantes',"window.FocadoRepresentatives?.render"],
  ['pedidos',"window.FocadoOrders?.render"],
  ['simulador',"window.FocadoSimulator?.render"],
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
  ['regras-margem',"window.FocadoMarginRules?.render"],
  ['config',"window.FocadoSettings?.render"],
  ['usuarios',"window.FocadoUsers?.render"],
  ['financeiro',"window.FocadoFinance?.render"],
  ['indicadores',"window.FocadoIndicators?.render"]
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
  const expected=['bases','inventory','orders','production','customers','representatives'].includes(m)?'assets/modules/'+m+'.js?v=':'assets/modules/'+m+'.js?v=20260827-static-v1';
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

assert.ok(shell.includes("refreshInBackground('inventory'"),'Estoque deve atualizar da V2 sem bloquear navegação');
assert.ok(shell.includes("refreshInBackground('production'"),'Produção deve atualizar da V2 em segundo plano');
assert.ok(shell.includes("refreshInBackground('purchases'"),'Compras deve atualizar da V2 em segundo plano');
assert.ok(shell.includes("refreshInBackground('carriers'"),'Transportadoras devem atualizar da V2 em segundo plano');

assert.ok(loader.includes("existing.dataset.loaded==='1'||existing.sheet"),'Loader deve reconhecer CSS lazy carregado');
assert.ok(loader.includes("existing.remove()"),'Loader deve remover CSS lazy quebrado antes de tentar novamente');
assert.ok(loader.includes("el.onerror=err=>{el.remove();reject"),'Falha de CSS deve limpar o link inválido');
assert.ok(loader.includes("if(existing&&existing()){\n        if(def.css)await css(def.css);"),'Módulo JS já carregado ainda deve garantir o CSS correspondente');

assert.ok(index.includes('assets/modules/indicators.css?v='),'Indicadores executivos devem ser pré-carregados com CSS');
assert.ok(index.includes('assets/modules/indicators.js?v='),'Indicadores executivos devem ser pré-carregados com JavaScript');

assert.ok(loader.includes("simulador:{css:'simulator.css',js:'simulator.js'}"),'Simulador deve estar registrado no loader');
assert.ok(loader.includes("simulador:()=>typeof window.FocadoSimulator?.render==='function'"),'Simulador moderno deve ter contrato');
assert.ok(shell.includes("['simulador','∑','Simulador']"),'Simulador deve aparecer na barra lateral');

assert.ok(index.includes('assets/modules/simulator.css?v=20260828-simulator-v4'),'Simulador deve ser pré-carregado com CSS');
assert.ok(index.includes('assets/modules/simulator.js?v=20260828-simulator-v5'),'Simulador deve ser pré-carregado com JavaScript');
const publishedHead=index.split('</head>',1)[0];
assert.ok(!publishedHead.includes('\\n'),'Head não pode conter \\n literal visível no primeiro paint');

assert.ok(loader.includes("'regras-margem':{css:'margin-rules.css',js:'margin-rules.js'}"),'Regras de Margem deve estar registrada no loader');
assert.ok(loader.includes("'regras-margem':()=>typeof window.FocadoMarginRules?.render==='function'"),'Regras de Margem deve possuir contrato');
assert.ok(shell.includes("['regras-margem','%','Regras de Margem']"),'Regras de Margem deve aparecer em Configurações');
assert.ok(index.includes('assets/modules/margin-rules.css?v=20260828-margin-rules-v1'),'Regras de Margem deve ser pré-carregada com CSS');
assert.ok(index.includes('assets/modules/margin-rules.js?v=20260828-margin-rules-v1'),'Regras de Margem deve ser pré-carregada com JavaScript');

assert.ok(shell.includes("id==='cockpit'?'indicadores':id"),'Cockpit deve carregar o módulo de Indicadores');
assert.ok(shell.includes("if(id==='cockpit'){open(()=>window.FocadoIndicators?.render());return}"),'Cockpit deve renderizar o mesmo dashboard executivo');

assert.ok(/assets\/modules\/customers\.js\?v=20260828-edit-actions-v\d+/.test(index),'Clientes deve publicar revisão atual com consulta de CNPJ e edição privilegiada');
assert.ok(index.includes('assets/modules/customers.css'),'Clientes deve publicar CSS da consulta de CNPJ');
assert.ok(index.includes('assets/modules/representatives.js?v=20260828-fantasy-v1'),'Representantes deve publicar revisão com Nome Fantasia');

assert.ok(/assets\/modules\/orders\.js\?v=20260828-(?:edit-actions-v\d+|payment-sync-v\d+|delete-order-v\d+|margin-logistics-v\d+)/.test(index),'Pedidos deve publicar revisão atual que consome cadastro mestre, edição e exclusão privilegiada');
assert.ok(/assets\/modules\/customers\.js\?v=20260828-edit-actions-v\d+/.test(index),'Clientes deve publicar Condição de Pagamento mestre');

assert.ok(/assets\/app-shell\.js\?v=20260828-edit-actions-v\d+/.test(index),'Shell deve publicar proteção contra rerender de formulário');
assert.ok(/assets\/modules\/orders\.js\?v=20260828-(?:edit-actions-v\d+|payment-sync-v\d+|delete-order-v\d+|margin-logistics-v\d+)/.test(index),'Pedidos deve publicar proteção de formulário ativo');
