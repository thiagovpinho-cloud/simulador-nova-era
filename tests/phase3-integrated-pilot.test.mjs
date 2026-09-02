import assert from 'node:assert/strict';
import {
  applyDomain, validateTransition, transitionRule, applyTransitionSideEffects
} from '../shared/domain-rules.js';
import { refreshWorkflowState } from '../shared/workflow-state.js';

const state={
  settings:{workflowAutomation:{enabled:true}},
  carriers:[{id:'car1',name:'Transportadora Piloto F3',active:true}],
  inventory:{
    SKU_A:{code:'SKU_A',name:'Produto A',unit:'CX',physical:20,reserved:0,blocked:0},
    SKU_B:{code:'SKU_B',name:'Produto B',unit:'CX',physical:0,reserved:0,blocked:0}
  },
  inputInventory:{
    MP_B:{code:'MP_B',name:'Matéria-prima B',unit:'KG',physical:0,reserved:0,blocked:0}
  },
  stockMovements:[],purchaseRequests:[],productionRequests:[],orders:[],
  financialFacts:[]
};

function addOrder(id,sku,qty,date){
  applyDomain('COMERCIAL',state,{changes:{createOrder:{
    id,number:'PED-F3-'+id,brand:'Nova Era',client:'Cliente '+id,cnpj:'12345678000199',
    city:'Mococa',uf:'SP',email:id.toLowerCase()+'@teste.com',orderDate:'2026-09-01',
    requestedDeliveryDate:date,paymentTerms:'28 ddl',logisticsBudget:200,
    salesChannel:'VENDAS_INTERNAS',salesJustification:'Piloto Fase 3',freightType:'CIF',
    items:[{id:id+'-1',code:sku,name:sku==='SKU_A'?'Produto A':'Produto B',qty,price:30}]
  }}});
  const o=state.orders.find(x=>x.id===id);
  assert.equal(validateTransition(o),null);
  o.status=transitionRule('COMERCIAL').to;
  return o;
}

const a1=addOrder('A1','SKU_A',12,'2026-09-03');
const a2=addOrder('A2','SKU_A',12,'2026-09-04');
const b1=addOrder('B1','SKU_B',10,'2026-09-05');
assert.equal(state.orders.length,3);

// Disputa real de estoque: primeiro pedido reserva 12, segundo só consegue 8.
applyDomain('PCP',state,{orderId:'A1',changes:{items:[{
  id:'A1-1',reservedQty:12,cutQty:0,deliveryBase:'SENIR',pcpBalanceDecision:'RESERVAR'
}]}});

applyDomain('PCP',state,{orderId:'A2',changes:{items:[{
  id:'A2-1',reservedQty:8,cutQty:0,deliveryBase:'SENIR',
  pcpAvailabilityDate:'2026-09-04',pcpBalanceDecision:'AGUARDAR'
}]}});

assert.equal(state.inventory.SKU_A.reserved,20);
assert.equal(a1.items[0].reservedQty,12);
assert.equal(a2.items[0].reservedQty,8);
assert.match(validateTransition(a2),/ainda não atendido/i);

// Pedido B sem estoque: precisa de produção e compra.
applyDomain('PCP',state,{orderId:'B1',changes:{
  items:[{id:'B1-1',reservedQty:0,cutQty:0,deliveryBase:'GREENTECH',
    pcpAvailabilityDate:'2026-09-04',pcpBalanceDecision:'AGUARDAR'}],
  pcp:{logisticsPreRelease:true,logisticsAvailabilityDate:'2026-09-04'}
}});

applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{request:{
  id:'PROD-B1',number:'OP-F3-B1',orderId:'B1',status:'FINALIZADA',base:'GREENTECH',materialStatus:'FALTA',
  snapshot:{
    items:[{product:{code:'SKU_B',name:'Produto B',unit:'CX'},qty:10}],
    materials:[{code:'MP_B',name:'Matéria-prima B',unit:'KG',required:10,available:0,shortage:10}]
  }
}}});

applyDomain('COMPRAS',state,{changes:{request:{
  id:'COMP-B1',number:'RC-F3-B1',orderId:'B1',productionRequestId:'PROD-B1',
  code:'MP_B',material:'Matéria-prima B',unit:'KG',qty:10,status:'PEDIDO_EMITIDO',
  supplierId:'SUP1',supplierName:'Fornecedor F3'
}}});

let snap=refreshWorkflowState(state,{at:1000});
assert.equal(snap.byOrder.B1.nextAction.action,'ACOMPANHAR_RECEBIMENTO');
const initialQueue=snap.workQueue.length;
assert.ok(initialQueue>=2);

// Recebimento deve destravar produção e gerar reação/automação técnica.
applyDomain('COMPRAS',state,{changes:{receive:{requestId:'COMP-B1',qty:10,user:'Compras F3'}}});
const prod=state.productionRequests.find(x=>x.id==='PROD-B1');
prod.materialStatus='OK';
prod.snapshot.materialStatus='OK';
snap=refreshWorkflowState(state,{at:1100});
assert.equal(snap.byOrder.B1.nextAction.action,'CONCLUIR_PRODUCAO');
assert.ok(state.workflowReactions.some(x=>x.orderId==='B1'&&x.type==='PURCHASE_RECEIVED_PRODUCTION_RECHECK'));
assert.ok(state.workflowAutomationSignals.some(x=>x.orderId==='B1'&&x.type==='PRODUCTION_READY_FOR_REVIEW'));

// Produção conclui e disponibiliza estoque.
applyDomain('SOLICITACAO_PRODUCAO',state,{changes:{complete:{
  requestId:'PROD-B1',lot:'LOT-F3-B1',at:1200,user:'Produção F3',
  items:[{code:'SKU_B',name:'Produto B',unit:'CX',qty:10}]
}}});
snap=refreshWorkflowState(state,{at:1200});
assert.equal(snap.byOrder.B1.nextAction.action,'RESERVAR_ESTOQUE');
assert.ok(state.workflowAutomationSignals.some(x=>x.orderId==='B1'&&x.type==='PCP_RECHECK_AVAILABLE_STOCK'));

applyDomain('PCP',state,{orderId:'B1',changes:{items:[{
  id:'B1-1',reservedQty:10,cutQty:0,deliveryBase:'GREENTECH',pcpBalanceDecision:'RESERVAR'
}]}});

// Para A2, negócio decide corte das 4 caixas faltantes: transição passa sem estoque negativo.
applyDomain('PCP',state,{orderId:'A2',changes:{items:[{
  id:'A2-1',reservedQty:8,cutQty:4,deliveryBase:'SENIR',pcpBalanceDecision:'CORTE'
}]}});

for(const o of [a1,a2,b1]){
  assert.equal(validateTransition(o),null);
  applyTransitionSideEffects(o,'PCP');
  o.status=transitionRule('PCP').to;
}
assert.equal(a2.items[0].qty,8);
assert.equal(a2.items[0].originalRequestedQty,12);

// Regra crítica: Logística não pode coletar antes da disponibilidade informada pelo PCP.
assert.throws(
  ()=>applyDomain('LOGISTICA',state,{orderId:'A2',changes:{logistics:{
    carrierId:'car1',pickupDate:'2026-09-03',deliveryDate:'2026-09-04',freightValue:150
  }}}),
  /PICKUP_BEFORE_PCP_AVAILABILITY/
);

// Logística + expedição: A1 no prazo, A2 atrasado após coleta válida, B1 no prazo.
for(const cfg of [
  [a1,'2026-09-02','2026-09-03','2026-09-03',true],
  [a2,'2026-09-04','2026-09-05','2026-09-06',false],
  [b1,'2026-09-04','2026-09-05','2026-09-05',true]
]){
  const [o,pickup,delivery,actual,onTime]=cfg;
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{
    carrierId:'car1',pickupDate:pickup,deliveryDate:delivery,freightValue:150
  }}});
  applyDomain('EXPEDICAO',state,{orderId:o.id,changes:{expedition:{
    releaseStock:true,releasedBy:'Expedição F3',separationDate:pickup,conferenceDate:pickup
  }}});
  applyDomain('LOGISTICA',state,{orderId:o.id,changes:{logistics:{
    deliveryConfirmed:true,deliveredOnTime:onTime,actualDeliveryDate:actual,
    deliveryDelayReason:onTime?'':'Atraso de rota no piloto',deliveryConfirmedBy:'Logística F3'
  }}});
  assert.equal(validateTransition(o),null);
  o.status=transitionRule('LOGISTICA').to;
  refreshWorkflowState(state,{at:1300+(o.id.charCodeAt(0))});
}

// Financeiro deve aparecer como pendência, sem criação automática de fato.
for(const o of [a1,a2,b1]){
  const wf=state.workflowState.byOrder[o.id];
  assert.equal(wf.finance.status,'PENDENTE');
  assert.equal(wf.nextAction.action,'REGISTRAR_FATO_FINANCEIRO');
  assert.ok(state.workflowAutomationSignals.some(x=>x.orderId===o.id&&x.type==='FINANCE_READY'));
}
assert.equal(state.financialFacts.length,0);

// Idempotência: novo refresh não duplica log de automação.
const logBefore=state.workflowAutomationLog.length;
refreshWorkflowState(state,{at:2000});
assert.equal(state.workflowAutomationLog.length,logBefore);

// Integridade final.
assert.equal(state.orders.filter(o=>o.status==='ENTREGUE').length,3);
assert.ok(Object.values(state.inventory).every(x=>Number(x.physical)>=0&&Number(x.reserved)>=0&&Number(x.blocked)>=0));
assert.ok(Object.values(state.inputInventory).every(x=>Number(x.physical)>=0));
assert.equal(state.inventory.SKU_A.physical,0);
assert.equal(state.inventory.SKU_A.reserved,0);
assert.equal(state.inventory.SKU_B.physical,0);
assert.equal(state.inventory.SKU_B.reserved,0);
assert.ok(state.stockMovements.some(x=>x.type==='ENTRADA_COMPRA'));
assert.ok(state.stockMovements.some(x=>x.type==='ENTRADA_PRODUCAO'));
assert.equal(state.stockMovements.filter(x=>x.type==='SAIDA_PEDIDO').length,3);

const result={
  orders:3,
  delivered:3,
  stockConflictResolved:true,
  productionDependencyResolved:true,
  cutHandled:true,
  prematurePickupBlocked:true,
  lateDeliveryHandled:true,
  financeStillHumanControlled:true,
  automationIdempotent:true,
  negativeBalance:false,
  workflowReactions:state.workflowReactions.length,
  automationSignals:state.workflowAutomationSignals.length
};
assert.ok(Object.values(result).every(v=>typeof v==='number'||v===true));

console.log('phase3-integrated-pilot: ok');
console.log(JSON.stringify(result));
