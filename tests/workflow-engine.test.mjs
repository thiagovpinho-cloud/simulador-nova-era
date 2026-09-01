import assert from 'node:assert/strict';
import {
  WORKFLOW_VERSION,
  buildCausalLinks,
  computeNextAction,
  computeOrderWorkflow,
  computeWorkQueue
} from '../shared/workflow-engine.js';

assert.equal(WORKFLOW_VERSION,'2026.09.01.1');

const base={
  inventory:{P1:{code:'P1',physical:4,reserved:0,blocked:0}},
  orders:[{
    id:'o1',number:'PED-1',status:'PCP',
    items:[{id:'i1',code:'P1',name:'Produto 1',qty:10,reservedQty:0,cutQty:0}],
    logistics:{}
  }],
  productionRequests:[],
  purchaseRequests:[],
  financialFacts:[]
};

let w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.inventory.status,'INSUFICIENTE');
assert.equal(w.inventory.coverage[0].coverNow,4);
assert.equal(w.inventory.coverage[0].uncoveredAfterFree,6);
assert.equal(w.nextAction.area,'PCP');
assert.equal(w.nextAction.action,'RESERVAR_ESTOQUE');

base.inventory.P1.reserved=4;
base.orders[0].items[0].reservedQty=4;
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.nextAction.action,'GERAR_NECESSIDADE_PRODUCAO');

base.productionRequests.push({
  id:'prod1',orderId:'o1',status:'FINALIZADA',materialStatus:'COMPRAR',
  snapshot:{items:[{product:{code:'P1'},qty:6}],materials:[{code:'MP1',required:10,shortage:10}]}
});
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.production.status,'EM_ANDAMENTO');
assert.ok(w.purchases.blockers.includes('PURCHASE_LINK_MISSING'));
assert.equal(w.nextAction.area,'COMPRAS');
assert.equal(w.nextAction.action,'VINCULAR_OU_CRIAR_COMPRA');

base.purchaseRequests.push({
  id:'buy1',productionRequestId:'prod1',orderId:'o1',status:'PEDIDO_EMITIDO',code:'MP1',qty:10
});
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.purchases.status,'EM_ANDAMENTO');
assert.equal(w.nextAction.action,'ACOMPANHAR_RECEBIMENTO');

base.purchaseRequests[0].status='RECEBIDO';
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.purchases.status,'CONCLUIDO');
assert.equal(w.nextAction.action,'CONCLUIR_PRODUCAO');

base.productionRequests[0].execution={status:'CONCLUIDA'};
base.inventory.P1.physical=10;
base.inventory.P1.reserved=4;
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.nextAction.action,'RESERVAR_ESTOQUE');

base.inventory.P1.reserved=10;
base.orders[0].items[0].reservedQty=10;
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.inventory.status,'COBERTO');
assert.equal(w.nextAction.action,'LIBERAR_PARA_LOGISTICA');

base.orders[0].status='LOGISTICA';
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.expedition.status,'PRONTO_PARA_SEPARAR');
assert.equal(w.nextAction.action,'SEPARAR_E_LIBERAR');

base.orders[0].expedition={stockReleasedAt:1,readyForPickup:true};
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.nextAction.action,'DEFINIR_TRANSPORTADORA');

base.orders[0].logistics={carrierId:'c1',carrier:'Transportadora',deliveryDate:'2026-09-05'};
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.nextAction.action,'ACOMPANHAR_ENTREGA');

base.orders[0].status='ENTREGUE';
base.orders[0].logistics.deliveryConfirmed=true;
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.finance.status,'PENDENTE');
assert.equal(w.nextAction.action,'REGISTRAR_FATO_FINANCEIRO');

base.financialFacts.push({order_id:'o1',invoice_number:'NF1'});
w=computeOrderWorkflow(base,base.orders[0]);
assert.equal(w.finance.status,'REGISTRADO');
assert.equal(w.nextAction.action,'SEM_PENDENCIA_CRITICA');

const links=buildCausalLinks(base,base.orders[0]);
assert.ok(links.some(x=>x.type==='ORDER_TO_PRODUCTION'&&x.productionRequestId==='prod1'));
assert.ok(links.some(x=>x.type==='ORDER_TO_PURCHASE'&&x.purchaseRequestId==='buy1'));

const queueState=structuredClone(base);
queueState.financialFacts=[];
const queue=computeWorkQueue(queueState);
assert.equal(queue.length,1);
assert.equal(queue[0].area,'FINANCEIRO');

console.log('workflow-engine: ok');
