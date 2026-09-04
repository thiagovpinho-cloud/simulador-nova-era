import assert from 'node:assert/strict';
import { refreshWorkflowState, workflowForOrder, WORKFLOW_STATE_VERSION } from '../shared/workflow-state.js';

assert.equal(WORKFLOW_STATE_VERSION,'2026.09.01.2');

const state={
  inventory:{P1:{code:'P1',physical:5,reserved:0,blocked:0}},
  orders:[
    {id:'o1',number:'PED-1',status:'PCP',items:[{id:'i1',code:'P1',qty:10,reservedQty:0,cutQty:0}],logistics:{}},
    {id:'o2',number:'PED-2',status:'ENTREGUE',items:[{id:'i2',code:'P2',qty:2,reservedQty:0,cutQty:0}],logistics:{deliveryConfirmed:true}}
  ],
  productionRequests:[],
  purchaseRequests:[],
  financialFacts:[]
};

const snap=refreshWorkflowState(state,{at:123});
assert.equal(snap.version,'2026.09.01.2');
assert.equal(snap.updatedAt,123);
assert.ok(snap.byOrder.o1);
assert.ok(snap.byOrder.o2);
assert.equal(snap.byOrder.o1.nextAction.action,'RESERVAR_ESTOQUE');
assert.equal(snap.byOrder.o2.nextAction.action,'REGISTRAR_FATO_FINANCEIRO');
assert.equal(snap.workQueue.length,2);
assert.equal(workflowForOrder(state,'o1').orderId,'o1');
assert.equal(workflowForOrder(state,'missing'),null);
assert.deepEqual(state.workflowReactions,[]);

state.financialFacts.push({order_id:'o2',invoice_number:'NF-2'});
refreshWorkflowState(state,{at:456});
assert.equal(state.workflowState.byOrder.o2.finance.status,'REGISTRADO');
assert.equal(state.workflowState.byOrder.o2.nextAction.action,'SEM_PENDENCIA_CRITICA');
assert.equal(state.workflowState.workQueue.length,1);
assert.ok(Array.isArray(state.workflowEvents));

// Mudança de responsabilidade deve gerar evento operacional auditável.
const beforeEvents=state.workflowEvents.length;
state.orders[0].items[0].reservedQty=5;
state.inventory.P1.reserved=5;
refreshWorkflowState(state,{at:789});
assert.ok(state.workflowEvents.length>=beforeEvents);
const latest=state.workflowEvents[0];
assert.equal(latest.type,'NEXT_ACTION_CHANGED');
assert.equal(latest.orderId,'o1');
assert.equal(latest.from.action,'RESERVAR_ESTOQUE');
assert.equal(latest.to.action,'GERAR_NECESSIDADE_PRODUCAO');

// Compra recebida deve reagir sinalizando a Produção, sem executar produção automaticamente.
state.productionRequests.push({
  id:'prod1',orderId:'o1',status:'FINALIZADA',materialStatus:'OK',
  snapshot:{items:[{product:{code:'P1'},qty:5}],materials:[]}
});
state.purchaseRequests.push({
  id:'buy1',orderId:'o1',productionRequestId:'prod1',status:'PEDIDO_EMITIDO',code:'MP1',qty:1
});
refreshWorkflowState(state,{at:800});
assert.equal(state.workflowState.byOrder.o1.nextAction.action,'ACOMPANHAR_RECEBIMENTO');
state.purchaseRequests[0].status='RECEBIDO';
refreshWorkflowState(state,{at:801});
assert.equal(state.workflowState.byOrder.o1.nextAction.action,'CONCLUIR_PRODUCAO');
assert.equal(state.workflowReactions[0].type,'PURCHASE_RECEIVED_PRODUCTION_RECHECK');
assert.equal(state.workflowReactions[0].area,'PRODUCAO');

// Produção concluída e novo saldo devem sinalizar o PCP para reavaliar/reservar.
state.productionRequests[0].execution={status:'CONCLUIDA'};
state.inventory.P1.physical=10;
refreshWorkflowState(state,{at:802});
assert.equal(state.workflowState.byOrder.o1.nextAction.action,'RESERVAR_ESTOQUE');
assert.equal(state.workflowReactions[0].type,'PRODUCTION_COMPLETED_PCP_RECHECK');
assert.equal(state.workflowReactions[0].area,'PCP');

// Cobertura completa gera sinal seguro para avanço; nenhuma expedição automática ocorre.
state.orders[0].items[0].reservedQty=10;
state.inventory.P1.reserved=10;
refreshWorkflowState(state,{at:803});
assert.equal(state.workflowState.byOrder.o1.inventory.status,'COBERTO');
assert.equal(state.workflowReactions[0].type,'ORDER_FULLY_COVERED');
assert.equal(state.workflowReactions[0].action,'LIBERAR_PARA_LOGISTICA');
assert.equal(state.orders[0].status,'PCP');

state.orders[0].status='LOGISTICA';
refreshWorkflowState(state,{at:804});
assert.equal(state.workflowState.byOrder.o1.nextAction.action,'SEPARAR_E_LIBERAR');

state.orders[0].expedition={stockReleasedAt:804,readyForPickup:true};
refreshWorkflowState(state,{at:805});
assert.equal(state.workflowReactions[0].type,'EXPEDITION_RELEASED_LOGISTICS_SIGNAL');
assert.equal(state.workflowReactions[0].area,'LOGISTICA');

state.orders[0].logistics={carrierId:'c1',deliveryConfirmed:true};
state.orders[0].status='ENTREGUE';
refreshWorkflowState(state,{at:806});
assert.equal(state.workflowReactions[0].type,'ORDER_DELIVERED_FINANCE_SIGNAL');
assert.equal(state.workflowReactions[0].area,'FINANCEIRO');
assert.equal(state.workflowState.byOrder.o1.nextAction.action,'REGISTRAR_FATO_FINANCEIRO');

const reactionCount=state.workflowReactions.length;
refreshWorkflowState(state,{at:807});
assert.equal(state.workflowReactions.length,reactionCount);

console.log('workflow-state: ok');
