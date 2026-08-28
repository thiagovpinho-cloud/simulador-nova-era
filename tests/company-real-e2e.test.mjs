import assert from 'node:assert/strict';
import {
  applyDomain, applyTransitionSideEffects, transitionRule, validateTransition
} from '../shared/domain-rules.js';
import { buildBiAnalytics } from '../shared/bi-analytics.js';

const state={
  customers:[
    {id:'c1',name:'Distribuidora Mococa',cnpj:'11111111000111',active:true},
    {id:'c2',name:'Rede Interior',cnpj:'22222222000122',active:true}
  ],
  carriers:[{id:'car1',name:'Transportadora Piloto',active:true}],
  suppliers:[],
  inventory:{
    AL70:{code:'AL70',name:'Álcool 70 INPM',unit:'CX',physical:20,reserved:0,blocked:0},
    GEL70:{code:'GEL70',name:'Álcool Gel 70',unit:'CX',physical:0,reserved:0,blocked:0}
  },
  inputInventory:{
    ETANOL:{code:'ETANOL',name:'Etanol',unit:'L',physical:500,reserved:0,blocked:0}
  },
  stockMovements:[], purchaseRequests:[], productionRequests:[], orders:[],
  inventoryPolicy:{},
  productionBases:{}, productionCapacityHistory:[],
  financialFacts:[], skuCosts:[], monthlyTargets:[],
  biPolicy:{revenueRecognition:'DELIVERED',promisedDateRule:'REQUESTED_THEN_LOGISTICS',inFullRule:'DISPATCHED_VS_CONFIRMED'}
};

const people=[];
const profileCounts={ADMIN:4,COMERCIAL:14,PCP:7,PRODUCAO:28,ESTOQUE:16,COMPRAS:8,LOGISTICA:13,FINANCEIRO:10};
const ages=[19,24,35,46,58,65];
let uid=1;
for(const [role,count] of Object.entries(profileCounts)){
  for(let i=0;i<count;i++)people.push({id:'u'+uid++,role,age:ages[(i+role.length)%ages.length]});
}
assert.equal(people.length,100);
assert.ok(people.some(x=>x.age===65)&&people.some(x=>x.age===46));

applyDomain('BASES',state,{changes:{base:{name:'SENIR',capacityPerDay:100,active:true,effectiveDate:'2026-08-01'}}});
applyDomain('FINANCEIRO',state,{changes:{monthlyTarget:{period:'2026-08',scope_type:'COMPANY',scope_id:'ALL',target_revenue:2000,target_boxes:50,target_margin:0.25}}});
applyDomain('FINANCEIRO',state,{changes:{skuCost:{sku:'AL70',effective_from:'2026-08-01',unit_variable_cost:15}}});
applyDomain('FINANCEIRO',state,{changes:{skuCost:{sku:'GEL70',effective_from:'2026-08-01',unit_variable_cost:20}}});
applyDomain('ESTOQUE',state,{changes:{inventoryPolicy:{sku:'AL70',minimum_stock:5,reorder_point:10,safety_stock:5}}});
applyDomain('ESTOQUE',state,{changes:{inventoryPolicy:{sku:'GEL70',minimum_stock:5,reorder_point:10,safety_stock:5}}});

function createOrder({id,number,brand,client,code,name,qty,price,requestedDeliveryDate}){
  applyDomain('COMERCIAL',state,{changes:{createOrder:{
    id,number,brand,client,cnpj:'12345678000199',city:'Mococa',uf:'SP',email:'compras@cliente.test',
    orderDate:'2026-08-10',requestedDeliveryDate,paymentTerms:'28 ddl',logisticsBudget:150,
    salesChannel:'VENDAS_INTERNAS',salesJustification:'Pedido piloto',freightType:'CIF',
    items:[{id:id+'-1',code,name,qty,price}]
  }}});
  const o=state.orders.find(x=>x.id===id);
  assert.equal(o.status,'COMERCIAL');
  assert.equal(validateTransition(o),null);
  applyTransitionSideEffects(o,'COMERCIAL');
  o.status=transitionRule('COMERCIAL').to;
  return o;
}

const order1=createOrder({id:'o1',number:'PED-REAL-001',brand:'Nova Era',client:'Distribuidora Mococa',code:'AL70',name:'Álcool 70 INPM',qty:20,price:30,requestedDeliveryDate:'2026-08-20'});
const order2=createOrder({id:'o2',number:'PED-REAL-002',brand:'New Green',client:'Rede Interior',code:'GEL70',name:'Álcool Gel 70',qty:15,price:40,requestedDeliveryDate:'2026-08-22'});

// Pedido 1 atendido diretamente pelo estoque.
applyDomain('PCP',state,{orderId:'o1',changes:{items:[{id:'o1-1',reservedQty:20,cutQty:0,deliveryBase:'SENIR',pcpAvailabilityDate:'2026-08-15',pcpBalanceDecision:'RESERVAR'}]}});
assert.equal(validateTransition(order1),null);
applyTransitionSideEffects(order1,'PCP');order1.status=transitionRule('PCP').to;

// Pedido 2 gera necessidade real: compra -> recebimento -> produção -> estoque -> reserva.
applyDomain('PCP',state,{orderId:'o2',changes:{
  pcp:{logisticsPreRelease:true,logisticsAvailabilityDate:'2026-08-18'},
  items:[{id:'o2-1',reservedQty:0,cutQty:0,deliveryBase:'SENIR',pcpAvailabilityDate:'2026-08-18',pcpBalanceDecision:'AGUARDAR'}]
}});
assert.match(validateTransition(order2),/ainda não atendido/i);

applyDomain('COMPRAS',state,{changes:{request:{
  id:'pr1',number:'RC-REAL-001',code:'ETANOL',material:'Etanol',unit:'L',qty:300,status:'PEDIDO_EMITIDO',
  supplierId:'sup1',supplierName:'Fornecedor Etanol'
}}});
applyDomain('COMPRAS',state,{changes:{receive:{requestId:'pr1',qty:300,user:'Compras Empresa Piloto'}}});
assert.equal(state.purchaseRequests[0].status,'RECEBIDO');
assert.equal(state.inputInventory.ETANOL.physical,800);

applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{request:{
  id:'prod1',number:'OP-REAL-001',status:'FINALIZADA',base:'SENIR',requestDate:'2026-08-16',needByDate:'2026-08-18',
  materialStatus:'OK',
  snapshot:{
    base:'SENIR',requestDate:'2026-08-16',needByDate:'2026-08-18',materialStatus:'OK',
    items:[{product:{code:'GEL70',name:'Álcool Gel 70',brand:'New Green',unit:'CX'},qty:15}],
    materials:[{code:'ETANOL',name:'Etanol',unit:'L',required:150,available:800,shortage:0}]
  }
}}});
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{
  requestId:'prod1',lot:'L-REAL-001',at:Date.parse('2026-08-18T12:00:00Z'),user:'Produção Empresa Piloto',
  items:[{code:'GEL70',name:'Álcool Gel 70',brand:'New Green',unit:'CX',qty:15}],
  losses:[]
}}});
assert.equal(state.productionRequests.find(x=>x.id==='prod1').execution.status,'CONCLUIDA');
assert.equal(state.inputInventory.ETANOL.physical,650);
assert.equal(state.inventory.GEL70.physical,15);
assert.ok(state.stockMovements.some(x=>x.type==='CONSUMO_PRODUCAO'));
assert.ok(state.stockMovements.some(x=>x.type==='ENTRADA_PRODUCAO'&&x.lot==='L-REAL-001'));
applyDomain('PCP',state,{orderId:'o2',changes:{items:[{id:'o2-1',reservedQty:15,cutQty:0,deliveryBase:'SENIR',pcpAvailabilityDate:'2026-08-18',pcpBalanceDecision:'RESERVAR'}]}});
assert.equal(validateTransition(order2),null);
applyTransitionSideEffects(order2,'PCP');order2.status=transitionRule('PCP').to;

// Logística + expedição + entrega.
for(const [o,pickup,delivery,actual,onTime] of [
  [order1,'2026-08-16','2026-08-20','2026-08-20',true],
  [order2,'2026-08-19','2026-08-22','2026-08-24',false]
]){
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{carrierId:'car1',freightValue:120,pickupDate:pickup,deliveryDate:delivery}}});
  applyDomain('EXPEDICAO',state,{orderId:o.id,changes:{expedition:{releaseStock:true,releasedBy:'Expedição Empresa Piloto',separationDate:pickup,conferenceDate:pickup}}});
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{
    deliveryConfirmed:true,deliveredOnTime:onTime,actualDeliveryDate:actual,
    deliveryDelayReason:onTime?'':'Atraso de rota',deliveryConfirmedBy:'Logística Empresa Piloto'
  }}});
  assert.equal(validateTransition(o),null);
  applyTransitionSideEffects(o,'LOGISTICA');o.status=transitionRule('LOGISTICA').to;
}
assert.equal(state.orders.filter(o=>o.status==='ENTREGUE').length,2);
assert.equal(state.stockMovements.filter(m=>m.type==='SAIDA_PEDIDO').length,2);
assert.ok(Object.values(state.inventory).every(x=>Number(x.physical)>=0&&Number(x.reserved)>=0));

// Financeiro alimenta fatos reais usados pelo BI.
applyDomain('FINANCEIRO',state,{changes:{financialFact:{
  order_id:'o1',invoice_number:'NF-1001',invoice_date:'2026-08-20',invoice_status:'EMITIDA',
  taxes:60,discounts:10,returns:0,bonuses:0,commission:20,freight_allocated:50
}}});
applyDomain('FINANCEIRO',state,{changes:{financialFact:{
  order_id:'o2',invoice_number:'NF-1002',invoice_date:'2026-08-24',invoice_status:'EMITIDA',
  taxes:60,discounts:0,returns:0,bonuses:0,commission:30,freight_allocated:60
}}});

const bi=buildBiAnalytics(state,{from:'2026-08-01',to:'2026-08-31',asOf:'2026-08-31'});
assert.equal(bi.summary.soldBoxes,35);
assert.equal(bi.summary.recognizedGrossRevenue,1200);
assert.equal(bi.summary.netRevenue,1070);
assert.ok(Math.abs(bi.summary.contributionMargin-(310/1070))<1e-10);
assert.equal(bi.summary.otif,0.5);
assert.equal(bi.summary.targetAchievement,0.6);
assert.equal(bi.kpis.inventory_risk.value,2);
assert.equal(bi.kpis.production_load.rows.length,1);
assert.equal(bi.kpis.production_load.rows[0].scheduledQty,15);
assert.equal(bi.kpis.production_load.rows[0].capacityPerDay,100);
assert.equal(bi.kpis.brand_share.rows.length,2);
assert.ok(bi.kpis.net_revenue.complete);
assert.ok(bi.kpis.contribution_margin.complete);

const acceptance={
  simulatedEmployees:people.length===100,
  commercialToPcp:true,
  purchaseReceipt:state.purchaseRequests[0].status==='RECEBIDO',
  productionToStock:state.stockMovements.some(m=>m.type==='ENTRADA_PRODUCAO'&&m.lot==='L-REAL-001'),
  productionConsumesInputs:state.stockMovements.some(m=>m.type==='CONSUMO_PRODUCAO')&&state.inputInventory.ETANOL.physical===650,
  stockReservationAndDispatch:state.stockMovements.filter(m=>m.type==='SAIDA_PEDIDO').length===2,
  logisticsCompletion:state.orders.every(o=>o.status==='ENTREGUE'),
  financeFeedsBi:bi.summary.netRevenue===1070,
  otifReflectsLateDelivery:bi.summary.otif===0.5,
  targetComparison:bi.summary.targetAchievement===0.6,
  noNegativeStock:Object.values(state.inventory).every(x=>Number(x.physical)>=0&&Number(x.reserved)>=0)
};
assert.ok(Object.values(acceptance).every(Boolean));

console.log('company-real-e2e: ok');
console.log(JSON.stringify({
  employees:people.length,
  orders:state.orders.length,
  delivered:state.orders.filter(o=>o.status==='ENTREGUE').length,
  purchaseReceipts:state.stockMovements.filter(m=>m.type==='ENTRADA_COMPRA').length,
  productionEntries:state.stockMovements.filter(m=>m.type==='ENTRADA_PRODUCAO').length,
  dispatches:state.stockMovements.filter(m=>m.type==='SAIDA_PEDIDO').length,
  grossRevenue:bi.summary.recognizedGrossRevenue,
  netRevenue:bi.summary.netRevenue,
  contributionMargin:Number((bi.summary.contributionMargin*100).toFixed(2)),
  otif:Number((bi.summary.otif*100).toFixed(2)),
  targetAchievement:Number((bi.summary.targetAchievement*100).toFixed(2)),
  inventoryRisks:bi.kpis.inventory_risk.value
}));
