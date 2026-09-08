import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const shell=read('assets/app-shell.js');
const loader=read('assets/core/module-loader.js');
const orders=read('assets/modules/orders.js');
const pcp=read('assets/modules/pcp.js');
const production=read('assets/modules/production.js');
const inventory=read('assets/modules/inventory.js');
const logistics=read('assets/modules/logistics.js');
const purchases=read('assets/modules/purchases.js');
const expedition=read('assets/modules/expedition.js');
const customers=read('assets/modules/customers.js');
const products=read('assets/modules/products.js');
const representatives=read('assets/modules/representatives.js');
const health=read('assets/modules/system-health.js');
const intelligence=read('assets/modules/intelligence.js');
const kanban=read('assets/modules/kanban.js');

assert.ok(index.includes('assets/core/module-loader.js'),'Loader de módulos deve estar no index');
assert.ok(index.includes('assets/app-shell.js'),'App shell deve estar no index');
assert.ok(shell.includes('window.FocadoShell'),'App shell deve exportar API pública');
assert.ok(loader.includes('window.FocadoModules'),'Loader deve exportar API pública');

for(const source of [orders,pcp,production,inventory,logistics,purchases,expedition,customers,products,representatives,health,kanban]){
  assert.ok(!source.includes('window.location.reload'),'Módulo operacional não pode forçar reload');
}

for(const route of ['pedidos','pcp','production','inventory','inputs','purchases','expedicao','logistica','entregas','transportadoras','kanban','system-health','cockpit','corpo-auditor']){
  assert.ok(loader.includes(route+':')||loader.includes("'"+route+"':"),'Rota ausente no lazy loader: '+route);
}

assert.ok(shell.includes("if(id==='produtos')"),'Produtos deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='pedidos')"),'Pedidos deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='pcp')"),'PCP deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='production')"),'Produção deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='inventory')"),'Estoque deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='inputs')"),'Insumos deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='purchases')"),'Compras deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='expedicao')"),'Expedição deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='logistica')"),'Logística deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='entregas')"),'Entregas deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='transportadoras')"),'Transportadoras deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='kanban')"),'Kanban deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='system-health')"),'Saúde do Sistema deve ter rota operacional própria');
assert.ok(shell.includes("if(id==='cockpit')"),'Cockpit deve ter rota própria');
assert.ok(shell.includes("if(id==='corpo-auditor')"),'Corpo Auditor deve ter rota própria');

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
assert.match(loader,/el\.onerror=err=>\{el\.remove\?\.\(\);reject/,'Falha de CSS deve limpar o link inválido');
assert.ok(loader.includes("if(existing&&existing()){\n        if(def.css)await css(def.css);"),'Módulo JS já carregado ainda deve garantir o CSS correspondente');

assert.ok(index.includes('assets/modules/indicators.css?v='),'Indicadores executivos devem ser pré-carregados com CSS');
assert.ok(index.includes('assets/modules/indicators.js?v='),'Indicadores executivos devem ser pré-carregados com JavaScript');