import assert from 'node:assert/strict';
import { refreshWorkflowState, workflowForOrder, WORKFLOW_STATE_VERSION } from '../shared/workflow-state.js';

assert.equal(WORKFLOW_STATE_VERSION,'2026.09.01.1');

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
assert.equal(snap.version,'2026.09.01.1');
assert.equal(snap.updatedAt,123);
assert.ok(snap.byOrder.o1);
assert.ok(snap.byOrder.o2);
assert.equal(snap.byOrder.o1.nextAction.action,'RESERVAR_ESTOQUE');
assert.equal(snap.byOrder.o2.nextAction.action,'REGISTRAR_FATO_FINANCEIRO');
assert.equal(snap.workQueue.length,2);
assert.equal(workflowForOrder(state,'o1').orderId,'o1');
assert.equal(workflowForOrder(state,'missing'),null);

state.financialFacts.push({order_id:'o2',invoice_number:'NF-2'});
refreshWorkflowState(state,{at:456});
assert.equal(state.workflowState.byOrder.o2.finance.status,'REGISTRADO');
assert.equal(state.workflowState.byOrder.o2.nextAction.action,'SEM_PENDENCIA_CRITICA');
assert.equal(state.workflowState.workQueue.length,1);

console.log('workflow-state: ok');
