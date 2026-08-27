import assert from 'node:assert/strict';
import {
  applyDomain,
  applyTransitionSideEffects,
  transitionRule,
  validateTransition
} from '../shared/domain-rules.js';

function transition(order){
  const rule=transitionRule(order.status);
  assert.ok(rule,'Regra de transição ausente para '+order.status);
  const problem=validateTransition(order);
  assert.equal(problem,null,'Transição bloqueada em '+order.status+': '+problem);
  const from=order.status;
  applyTransitionSideEffects(order,from);
  order.status=rule.to;
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.unshift({type:'STATUS_TRANSITION',from,to:rule.to});
}

// Fluxo 1: pedido com estoque suficiente.
const state={
  carriers:[{id:'t1',name:'Transportadora 1',active:true}],
  inventory:{P1:{code:'P1',name:'Produto 1',physical:20,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[],
  orders:[{
    id:'o1',number:'PED-001',status:'COMERCIAL',
    client:'Cliente 1',email:'cliente1@teste.com',
    requestedDeliveryDate:'2026-09-05',paymentTerms:'28 ddl',logisticsBudget:500,
    salesChannel:'VENDAS_INTERNAS',salesJustification:'Venda direta',
    items:[{id:'i1',code:'P1',name:'Produto 1',qty:10,price:25,reservedQty:0,cutQty:0}]
  }]
};
const order=state.orders[0];
transition(order);
assert.equal(order.status,'PCP');

applyDomain('PCP',state,{orderId:'o1',changes:{
  items:[{id:'i1',reservedQty:10,cutQty:0,deliveryBase:'SENIR',pcpBalanceDecision:'RESERVAR'}]
}});
transition(order);
assert.equal(order.status,'LOGISTICA');
assert.equal(state.inventory.P1.reserved,10);

applyDomain('LOGISTICA',state,{orderId:'o1',changes:{logistics:{
  carrierId:'t1',freightValue:450,pickupDate:'2026-09-02',deliveryDate:'2026-09-05',
  deliveryConfirmed:true,deliveredOnTime:true,actualDeliveryDate:'2026-09-05'
}}});
transition(order);
assert.equal(order.status,'ENTREGUE');
assert.equal(order.logistics.carrier,'Transportadora 1');
assert.equal(order.events.filter(e=>e.type==='STATUS_TRANSITION').length,3);

// Fluxo 2: pedido com corte parcial.
const state2={
  inventory:{P2:{code:'P2',name:'Produto 2',physical:4,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[],
  orders:[{
    id:'o2',number:'PED-002',status:'PCP',
    items:[{id:'i2',code:'P2',name:'Produto 2',qty:10,reservedQty:0,cutQty:0}]
  }]
};
const o2=state2.orders[0];
applyDomain('PCP',state2,{orderId:'o2',changes:{items:[{
  id:'i2',reservedQty:4,cutQty:6,deliveryBase:'TOPLAND',pcpBalanceDecision:'CORTE'
}]}});
transition(o2);
assert.equal(o2.status,'LOGISTICA');
assert.equal(o2.items[0].originalRequestedQty,10);
assert.equal(o2.items[0].qty,4);

// Fluxo 3: pedido sem estoque, logística trabalha em paralelo mas PCP não conclui.
const state3={
  carriers:[{id:'t3',name:'Trans 3',active:true}],
  inventory:{P3:{code:'P3',name:'Produto 3',physical:0,reserved:0,blocked:0,unit:'CX'}},
  stockMovements:[],
  orders:[{
    id:'o3',number:'PED-003',status:'PCP',logisticsBudget:800,
    items:[{id:'i3',code:'P3',name:'Produto 3',qty:10,reservedQty:0,cutQty:0}]
  }]
};
const o3=state3.orders[0];
applyDomain('PCP',state3,{orderId:'o3',changes:{
  pcp:{logisticsPreRelease:true,logisticsAvailabilityDate:'2026-09-20',logisticsPreReleaseAt:1},
  items:[{id:'i3',reservedQty:0,cutQty:0,deliveryBase:'GREENTECH',pcpAvailabilityDate:'2026-09-20',pcpBalanceDecision:'AGUARDAR'}]
}});
assert.match(validateTransition(o3),/ainda não atendido/i);
applyDomain('LOGISTICA',state3,{orderId:'o3',changes:{logistics:{
  carrierId:'t3',freightValue:750,pickupDate:'2026-09-20',deliveryDate:'2026-09-22'
}}});
assert.equal(o3.status,'PCP');
assert.equal(o3.logistics.carrier,'Trans 3');
assert.equal(o3.logistics.pickupDate,'2026-09-20');

// Fluxo 4: após chegada do estoque, PCP reserva e libera o mesmo pedido.
state3.inventory.P3.physical=10;
applyDomain('PCP',state3,{orderId:'o3',changes:{items:[{
  id:'i3',reservedQty:10,cutQty:0,deliveryBase:'GREENTECH',pcpAvailabilityDate:'2026-09-20',pcpBalanceDecision:'RESERVAR'
}]}});
transition(o3);
assert.equal(o3.status,'LOGISTICA');

// Fluxo 5: atraso exige justificativa antes do encerramento.
applyDomain('LOGISTICA',state3,{orderId:'o3',changes:{logistics:{
  deliveryConfirmed:true,deliveredOnTime:false,actualDeliveryDate:'2026-09-23',deliveryDelayReason:''
}}});
assert.match(validateTransition(o3),/motivo/i);
applyDomain('LOGISTICA',state3,{orderId:'o3',changes:{logistics:{deliveryDelayReason:'Pane no veículo'}}});
transition(o3);
assert.equal(o3.status,'ENTREGUE');

console.log('critical-flows: ok');
