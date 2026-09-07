import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { finalizeCommercialState } from '../shared/commercial-finalize.js';

const bridgeSource=fs.readFileSync(new URL('../assets/modules/commercial-finalize-bridge.js',import.meta.url),'utf8');
const endpointSource=fs.readFileSync(new URL('../api/commercial-finalize.js',import.meta.url),'utf8');
const loaderSource=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');

function validOrder(id='op_1'){
  return {
    id,number:'PED-00001',status:'COMERCIAL',createdAt:1,brand:'Nova Era',client:'Cliente Teste',cnpj:'12345678000195',
    representative:'Representante Teste',salesChannel:'REPRESENTANTE',salesJustification:'',city:'Mococa',uf:'SP',cep:'13730000',
    email:'cliente@teste.com',phone:'19999999999',orderDate:'2026-09-07',requestedDeliveryDate:'2026-09-15',
    freightType:'CIF',paymentTerms:'28 dias',logisticsBudget:100,deliveryAddress:'Rua Teste, 1',notes:'',
    commercial:{completedAt:null,completedBy:null},pcp:{},logistics:{},
    items:[{id:'i1',productId:'p1',code:'001',name:'Produto',qty:10,price:20,source:'',reservedQty:0}],events:[]
  };
}

// Regra real: pedido existente deve atualizar e avançar em uma única mutação de estado.
{
  const state={orders:[validOrder()]};
  const r=finalizeCommercialState(state,{orderId:'op_1',changes:{notes:'finalizado'},idempotencyKey:'commercial-finalize:op_1',actor:'Admin',now:1000});
  assert.equal(r.idempotent,false);
  assert.equal(r.order.status,'PCP');
  assert.equal(r.order.notes,'finalizado');
  assert.equal(r.order.commercial.completedAt,1000);
  assert.equal(r.order.commercial.completedBy,'Admin');
  assert.equal(r.order.commercial.finalizationKey,'commercial-finalize:op_1');
  assert.equal(r.order.events.filter(e=>e.type==='STATUS_TRANSITION'&&e.from==='COMERCIAL'&&e.to==='PCP').length,1);
  const retry=finalizeCommercialState(state,{orderId:'op_1',changes:{notes:'não deve reaplicar'},idempotencyKey:'commercial-finalize:op_1',actor:'Admin',now:2000});
  assert.equal(retry.idempotent,true);
  assert.equal(retry.order.notes,'finalizado','retry idempotente não deve reaplicar dados');
  assert.equal(retry.order.events.filter(e=>e.type==='STATUS_TRANSITION').length,1,'retry não pode duplicar evento');
}

// Regra real: pedido ainda não salvo deve nascer e chegar ao PCP na mesma operação.
{
  const fresh=validOrder('op_new');
  const state={orders:[]};
  const r=finalizeCommercialState(state,{orderId:'op_new',changes:{createOrder:fresh},idempotencyKey:'commercial-finalize:op_new',actor:'Admin',now:3000});
  assert.equal(state.orders.length,1);
  assert.equal(r.order.status,'PCP');
  assert.equal(r.order.commercial.completedAt,3000);
  assert.equal(r.order.events.filter(e=>e.type==='STATUS_TRANSITION').length,1);
}

// Validação deve bloquear antes de qualquer estado PCP.
{
  const invalid=validOrder('op_bad');invalid.client='';
  const state={orders:[invalid]};
  assert.throws(()=>finalizeCommercialState(state,{orderId:'op_bad',changes:{},idempotencyKey:'commercial-finalize:op_bad'}),/Pedido incompleto/);
  assert.equal(state.orders[0].status,'COMERCIAL');
  assert.equal(state.orders[0].events.length,0);
}

// Ponte do browser: cliques simultâneos compartilham uma única chamada remota.
{
  let state={orders:[{id:'op_bridge',status:'COMERCIAL',commercial:{},events:[]}]};
  let finalizeCalls=0,transitionCalls=0,draftCalls=0;
  let releaseFinalize;
  const finalizeGate=new Promise(resolve=>{releaseFinalize=resolve});
  const store={
    readLocal(){return state},
    async saveDomain(){draftCalls++;return {ok:true,mode:'remote'}},
    async transitionOrder(){transitionCalls++;return {ok:true,mode:'remote'}},
    async finalizeCommercial(orderId,changes,key){
      finalizeCalls++;await finalizeGate;
      state={orders:[{id:orderId,status:'PCP',commercial:{completedAt:Date.now(),finalizationKey:key},events:[{type:'STATUS_TRANSITION',from:'COMERCIAL',to:'PCP',idempotencyKey:key}]}]};
      return {ok:true,mode:'remote',payload:state};
    }
  };
  const context=vm.createContext({window:{FocadoDataStore:store},Promise,Object,String,Boolean,Map});
  vm.runInContext(bridgeSource,context);
  const changes={commercial:{completedAt:123},items:[{id:'i1',qty:10}]};
  const first=store.saveDomain('COMERCIAL',changes,'op_bridge');
  const second=store.saveDomain('COMERCIAL',changes,'op_bridge');
  await Promise.resolve();
  assert.equal(finalizeCalls,1);
  releaseFinalize();
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(finalizeCalls,1);
  const transition=await store.transitionOrder('op_bridge');
  assert.equal(transition.idempotent,true);
  assert.equal(transitionCalls,0,'não deve existir segunda transição remota após finalização atômica');
  await store.saveDomain('COMERCIAL',{notes:'rascunho'},'op_bridge');
  assert.equal(draftCalls,1,'rascunhos continuam usando o caminho original');
}

assert.equal((endpointSource.match(/writeWorkspace\(/g)||[]).length,1,'endpoint deve ter uma única gravação de workspace');
assert.match(endpointSource,/finalizeCommercialState/,'endpoint deve usar a regra compartilhada testada');
assert.match(loaderSource,/pedidos:\{css:'orders\.css',js:'orders\.js',deps:\['produtos','commercial-finalize-bridge'\]\}/);
assert.doesNotMatch(loaderSource,/pcp:\{[^\n]*commercial-finalize-bridge/);

console.log('commercial-pcp-atomic: ok');
