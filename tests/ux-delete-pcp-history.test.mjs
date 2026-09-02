import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyDomain} from '../shared/domain-rules.js';

const state={
  orders:[{
    id:'o1',number:'PED-1',status:'LOGISTICA',commercial:{completedAt:1},
    items:[{id:'i1',code:'SKU1',name:'Produto',qty:5,reservedQty:5}],
    expedition:{},events:[]
  },{
    id:'o2',number:'PED-2',status:'ENTREGUE',commercial:{completedAt:2},
    items:[{id:'i2',code:'SKU2',name:'Produto 2',qty:3,reservedQty:0,dispatchedQty:3}],
    expedition:{stockReleasedAt:10},events:[]
  }],
  inventory:{
    SKU1:{code:'SKU1',physical:10,reserved:5,blocked:0},
    SKU2:{code:'SKU2',physical:7,reserved:0,blocked:0}
  },
  stockMovements:[
    {id:'m1',reason:'PCP · pedido PED-1'},
    {id:'m2',reason:'Expedição · pedido PED-2'},
    {id:'keep',reason:'Ajuste geral'}
  ],
  financialFacts:[{order_id:'o1'},{order_id:'other'}],
  productionRequests:[
    {id:'p1',sourceOrderId:'o1'},
    {id:'p2',sourceOrderIds:['o1','other']},
    {id:'p3',sourceOrderId:'other'}
  ],
  purchaseRequests:[
    {id:'c1',sourceProductionRequestId:'p1'},
    {id:'c2',sourceProductionRequestId:'p3'}
  ],
  workflowState:{byOrder:{o1:{},other:{}},workQueue:[{orderId:'o1'},{orderId:'other'}],reactions:[{orderId:'o1'},{orderId:'other'}]},
  automationState:{signals:[{orderId:'o1'},{orderId:'other'}]}
};

applyDomain('COMERCIAL',state,{changes:{deleteOrderCascadeId:'o1'}});
assert.equal(state.orders.some(o=>o.id==='o1'),false);
assert.equal(state.inventory.SKU1.reserved,0,'Reserva deve ser liberada');
assert.equal(state.stockMovements.some(x=>x.id==='m1'),false);
assert.equal(state.stockMovements.some(x=>x.id==='keep'),true);
assert.equal(state.financialFacts.some(x=>x.order_id==='o1'),false);
assert.equal(state.productionRequests.some(x=>x.id==='p1'),false);
assert.deepEqual(state.productionRequests.find(x=>x.id==='p2').sourceOrderIds,['other'],'Artefato compartilhado deve ser preservado');
assert.equal(state.purchaseRequests.some(x=>x.id==='c1'),false);
assert.equal(state.workflowState.byOrder.o1,undefined);
assert.equal(state.workflowState.workQueue.some(x=>x.orderId==='o1'),false);
assert.equal(state.automationState.signals.some(x=>x.orderId==='o1'),false);

applyDomain('COMERCIAL',state,{changes:{deleteOrderCascadeId:'o2'}});
assert.equal(state.inventory.SKU2.physical,10,'Saída física deve ser revertida ao excluir pedido expedido');
assert.equal(state.stockMovements.some(x=>x.id==='m2'),false);

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/app-shell.js');
const shellCss=read('assets/app-shell.css');
const freight=read('assets/modules/freight-requests.js');
const freightCss=read('assets/modules/freight-requests.css');
const orders=read('assets/modules/orders.js');
const pcp=read('assets/modules/pcp.js');
const pcpCss=read('assets/modules/pcp.css');

assert.match(shell,/let operationalContextSeq=0/);
assert.match(shell,/querySelectorAll\('\.fx-journey-context'\)/);
assert.match(shell,/focado-context-hidden:/);
assert.match(shell,/fx-journey-close/);
assert.match(shellCss,/\.fx-journey-close/);

assert.match(freight,/fr-card-action/);
assert.match(freightCss,/\.fr-card-action/);
assert.match(freightCss,/background:#08785b/);

assert.match(orders,/const canDelete=allowEdit;/);
assert.match(orders,/deleteOrderCascadeId/);
assert.match(orders,/Apenas Admin, Diretor ou Gestor/);

assert.match(pcp,/Últimos 10 pedidos processados/);
assert.match(pcp,/slice\(0,10\)/);
assert.match(pcp,/function historyTable/);
assert.match(pcp,/Consultar/);
assert.match(pcpCss,/\.fpcp-recent-history/);

console.log('ux-delete-pcp-history: ok');
