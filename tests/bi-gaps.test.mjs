import fs from 'node:fs';
import assert from 'node:assert/strict';
import {applyDomain} from '../shared/domain-rules.js';
import {
  buildBiAnalytics,grossRevenue,netRevenue,contributionMargin,otif,targetVsActual,inventoryRisk,productionLoad
} from '../shared/bi-analytics.js';

const state={
  orders:[{
    id:'o1',number:'P-001',status:'ENTREGUE',brand:'Nova Era',client:'Cliente A',
    orderDate:'2026-08-01',requestedDeliveryDate:'2026-08-10',
    items:[{id:'i1',code:'SKU-A',name:'Produto A',qty:10,price:20,dispatchedQty:10}],
    expedition:{stockReleasedAt:1},
    logistics:{deliveryConfirmed:true,actualDeliveryDate:'2026-08-09'}
  }],
  inventory:{'SKU-A':{code:'SKU-A',name:'Produto A',physical:50,reserved:10,blocked:0}},
  productionBases:{SENIR:{capacityPerDay:100,active:true}},
  productionRequests:[{
    id:'pr1',number:'SP-00001',status:'FINALIZADA',base:'SENIR',requestDate:'2026-08-03',needByDate:'2026-08-12',
    items:[{product:{code:'SKU-A',name:'Produto A'},qty:60}]
  }]
};

applyDomain('FINANCEIRO',state,{changes:{biPolicy:{
  revenueRecognition:'DELIVERED',
  promisedDateRule:'REQUESTED_THEN_LOGISTICS',
  inFullRule:'DISPATCHED_VS_CONFIRMED'
}}});
applyDomain('FINANCEIRO',state,{changes:{monthlyTarget:{
  period:'2026-08',scope_type:'COMPANY',scope_id:'ALL',target_revenue:400,target_boxes:20,target_margin:.25
}}});
applyDomain('FINANCEIRO',state,{changes:{financialFact:{
  order_id:'o1',invoice_number:'12345',invoice_date:'2026-08-08',invoice_status:'AUTORIZADA',
  invoice_key:'12345678901234567890123456789012345678901234',
  taxes:0,icms:0,pis:0,cofins:0,ipi:0,st:0,contract:0,
  discounts:5,returns:0,bonuses:0,commission:10,freight_allocated:15
}}});
applyDomain('FINANCEIRO',state,{changes:{skuCost:{
  sku:'SKU-A',effective_from:'2026-01-01',unit_variable_cost:8
}}});
applyDomain('ESTOQUE',state,{changes:{inventoryPolicy:{
  sku:'SKU-A',minimum_stock:20,reorder_point:45,safety_stock:10
}}});
applyDomain('BASES',state,{changes:{base:{
  name:'SENIR',capacityPerDay:120,active:true,effectiveDate:'2026-08-01'
}}});

assert.equal(state.monthlyTargets.length,1);
assert.equal(state.financialFacts.length,1);
assert.equal(state.financialFacts[0].invoice_number,'12345');
assert.equal(state.financialFacts[0].invoice_key.length,44);
assert.equal(state.skuCosts.length,1);
assert.equal(state.inventoryPolicy['SKU-A'].reorder_point,45);
assert.equal(state.productionBases.SENIR.capacityPerDay,120);
assert.equal(state.productionCapacityHistory.length,1);

const gross=grossRevenue(state,{from:'2026-08-01',to:'2026-08-31'});
assert.equal(gross.value,200);

const net=netRevenue(state,{from:'2026-08-01',to:'2026-08-31'});
assert.equal(net.complete,true);
assert.equal(net.value,90);

const margin=contributionMargin(state,{from:'2026-08-01',to:'2026-08-31'});
assert.equal(margin.complete,true);
assert.equal(margin.contribution,90);
assert.equal(Number(margin.value.toFixed(4)),0.45);

const service=otif(state,{from:'2026-08-01',to:'2026-08-31'});
assert.equal(service.complete,true);
assert.equal(service.value,1);

const target=targetVsActual(state,{from:'2026-08-01',to:'2026-08-31'});
assert.equal(target.complete,true);
assert.equal(target.achievement,.5);

const risk=inventoryRisk(state);
assert.equal(risk.complete,true);
assert.equal(risk.value,1);

const load=productionLoad(state,{from:'2026-08-01',to:'2026-08-31'});
assert.equal(load.complete,true);
assert.equal(load.rows.length,1);
assert.equal(load.rows[0].scheduledQty,60);
assert.equal(load.rows[0].capacityPerDay,120);
assert.equal(load.rows[0].load,.5);

const before=JSON.stringify(state);
const all=buildBiAnalytics(state,{from:'2026-08-01',to:'2026-08-31',asOf:'2026-08-28'});
assert.equal(all.kpis.net_revenue.complete,true);
assert.equal(all.kpis.contribution_margin.complete,true);
assert.equal(all.kpis.otif.value,1);
assert.equal(all.kpis.target_vs_actual.achievement,.5);
assert.equal(JSON.stringify(state),before,'Analytics must remain read-only');

console.log('BI gaps closed: OK');


const worker=fs.readFileSync(new URL('../worker/src/index.js',import.meta.url),'utf8');
const platform=fs.readFileSync(new URL('../worker/src/platform-v2.js',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../assets/app-shell.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');
const configUi=fs.readFileSync(new URL('../assets/modules/bi-config.js',import.meta.url),'utf8');

assert.ok(worker.includes('buildBiAnalytics'),'Worker de produção deve usar a camada analítica oficial');
assert.ok(worker.includes('path==="/bi-analytics"'),'Worker deve expor /api/bi-analytics');
assert.ok(platform.includes("if(d==='BASES')"),'Auditoria deve cobrir capacidade produtiva');
assert.ok(platform.includes('monthlyTargets'),'Auditoria financeira deve cobrir metas');
assert.ok(shell.includes("['bi-config','⚙','Parâmetros BI']"),'Menu deve expor governança BI');
assert.ok(loader.includes("'bi-config':{css:'bi-config.css',js:'bi-config.js'}"),'Loader deve registrar governança BI');
assert.ok(configUi.includes("saveDomain('FINANCEIRO'"),'Dados financeiros devem usar domínio auditável');
assert.ok(configUi.includes("saveDomain('ESTOQUE'"),'Política de estoque deve usar domínio auditável');

const nativeFinance=fs.readFileSync(new URL('../assets/modules/finance.js',import.meta.url),'utf8');
const inventoryUi=fs.readFileSync(new URL('../assets/modules/inventory.js',import.meta.url),'utf8');
assert.ok(nativeFinance.includes('Número da NF'),'Financeiro deve capturar número da NF');
assert.ok(nativeFinance.includes('Data de emissão'),'Financeiro deve capturar data da NF');
assert.ok(nativeFinance.includes('Chave NF-e'),'Financeiro deve capturar chave NF-e');
for(const field of ['ICMS','PIS','COFINS','IPI','ST','Contrato','Descontos','Devoluções','Bonificações','Comissão','Frete alocado'])assert.ok(nativeFinance.includes(field),'Campo financeiro ausente: '+field);
assert.ok(nativeFinance.includes('Metas mensais'),'Financeiro deve possuir metas mensais');
assert.ok(nativeFinance.includes('Custos variáveis por SKU'),'Financeiro deve possuir custos históricos por SKU');
for(const field of ['Estoque mínimo','Ponto de reposição','Estoque de segurança'])assert.ok(inventoryUi.includes(field),'Campo de estoque ausente: '+field);

const invoiceState=structuredClone(state);
invoiceState.biPolicy.revenueRecognition='INVOICED';
assert.equal(grossRevenue(invoiceState,{from:'2026-08-01',to:'2026-08-31'}).value,200);
invoiceState.financialFacts[0].invoice_status='CANCELADA';
assert.equal(grossRevenue(invoiceState,{from:'2026-08-01',to:'2026-08-31'}).value,0);
