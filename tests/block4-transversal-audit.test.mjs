import assert from 'node:assert/strict';
import {finalizeCommercialState} from '../shared/commercial-finalize.js';
import {finalizePcpState} from '../shared/pcp-finalize.js';
import {finalizeDeliveryState} from '../shared/delivery-finalize.js';
import {applyDomain} from '../shared/domain-rules.js';

const clone=v=>structuredClone(v);
const findings=[];

function makeOrder(){return {
  id:'b4o1',number:'PED-B4-001',status:'COMERCIAL',brand:'Nova Era',client:'Cliente 360',cnpj:'12345678000195',
  representative:'Representante 360',salesChannel:'REPRESENTANTE',city:'Mococa',uf:'SP',email:'cliente@teste.local',
  orderDate:'2026-09-09',requestedDeliveryDate:'2026-09-15',paymentTerms:'28 dias',logisticsBudget:350,freightType:'CIF',
  deliveryAddress:'Rua Teste, 1',commercial:{},pcp:{},logistics:{},expedition:{},events:[],
  items:[{id:'i1',code:'PA001',name:'Produto 360',qty:10,price:100,reservedQty:0,cutQty:0,pcpBalanceDecision:'AGUARDAR',pcpAvailabilityDate:'',deliveryBase:''}]
}}

// Dados incompletos: finalização Comercial não pode contaminar estado.
{
  const s={orders:[makeOrder()]}; s.orders[0].client=''; const before=clone(s);
  assert.throws(()=>finalizeCommercialState(s,{orderId:'b4o1',changes:{},idempotencyKey:'b4-bad'}),/Pedido incompleto/);
  assert.deepEqual(s,before);
}

// Estoque insuficiente: PCP não pode reservar acima do saldo e não pode deixar efeito parcial.
{
  const o=makeOrder(); o.status='PCP';
  const s={orders:[o],inventory:{PA001:{code:'PA001',physical:3,reserved:0,blocked:0}},stockMovements:[]};
  const before=clone(s);
  assert.throws(()=>finalizePcpState(s,{orderId:'b4o1',idempotencyKey:'b4-pcp-bad',user:'PCP',changes:{items:[{id:'i1',reservedQty:10,deliveryBase:'SENIR'}]}}),e=>e.status===422);
  assert.deepEqual(s,before);
}

// Entrega deve ser idempotente e histórico não pode duplicar transição.
let deliveredState;
{
  const o=makeOrder(); o.status='LOGISTICA'; o.logistics={deliveryDate:'2026-09-14'};
  const s={orders:[o],carriers:[{id:'c1',name:'Transportadora 360',active:true}]};
  const r=finalizeDeliveryState(s,{orderId:'b4o1',idempotencyKey:'delivery-finalize:b4o1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14',deliveryConfirmedAt:100,deliveryConfirmedBy:'Logística'}});
  assert.equal(r.idempotent,false); assert.equal(s.orders[0].status,'ENTREGUE');
  const before=clone(s);
  const retry=finalizeDeliveryState(s,{orderId:'b4o1',idempotencyKey:'delivery-finalize:b4o1',user:'Logística',logistics:{deliveredOnTime:true,actualDeliveryDate:'2026-09-14'}});
  assert.equal(retry.idempotent,true); assert.deepEqual(s,before);
  assert.equal(s.orders[0].events.filter(e=>e.from==='LOGISTICA'&&e.to==='ENTREGUE').length,1);
  deliveredState=s;
}

// Auditoria crítica: após ENTREGUE, a regra de domínio ainda aceita edição logística direta.
{
  const before=clone(deliveredState.orders[0]);
  applyDomain('LOGISTICA',deliveredState,{orderId:'b4o1',changes:{logistics:{freightValue:999}}});
  if(Number(deliveredState.orders[0].logistics.freightValue)===999){
    findings.push({severity:'P1',code:'DELIVERED_ORDER_MUTABLE',detail:'Pedido ENTREGUE ainda aceita alteração direta no domínio LOGISTICA; deve haver bloqueio ou trilha formal de correção.'});
  }else{
    assert.deepEqual(deliveredState.orders[0],before);
  }
}

// Saldo negativo deve ser recusado atomicamente.
{
  const s={inventory:{PA001:{code:'PA001',physical:2,reserved:0,blocked:0}},inputInventory:{},stockMovements:[]};
  const before=clone(s);
  assert.throws(()=>applyDomain('ESTOQUE',s,{changes:{movement:{kind:'finished',key:'PA001',code:'PA001',deltaPhysical:-3,qty:3,type:'SAIDA_TESTE'}}}),e=>e.status===422&&e.message==='INVENTORY_NEGATIVE_BALANCE');
  assert.deepEqual(s,before);
}

console.log(JSON.stringify({event:'block4-transversal-audit',ok:true,findings},null,2));
