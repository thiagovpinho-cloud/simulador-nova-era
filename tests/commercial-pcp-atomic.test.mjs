import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridgeSource=fs.readFileSync(new URL('../assets/modules/commercial-finalize-bridge.js',import.meta.url),'utf8');
const endpointSource=fs.readFileSync(new URL('../api/commercial-finalize.js',import.meta.url),'utf8');
const loaderSource=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');

let state={orders:[{id:'op_1',status:'COMERCIAL',commercial:{},events:[]}]};
let finalizeCalls=0,transitionCalls=0,draftCalls=0;
let releaseFinalize;
const finalizeGate=new Promise(resolve=>{releaseFinalize=resolve});

const store={
  readLocal(){return state},
  async saveDomain(){draftCalls++;return {ok:true,mode:'remote'}},
  async transitionOrder(){transitionCalls++;return {ok:true,mode:'remote'}},
  async finalizeCommercial(orderId,changes,key){
    finalizeCalls++;
    await finalizeGate;
    state={orders:[{id:orderId,status:'PCP',commercial:{completedAt:Date.now(),finalizationKey:key},events:[{type:'STATUS_TRANSITION',from:'COMERCIAL',to:'PCP',idempotencyKey:key}]}]};
    return {ok:true,mode:'remote',payload:state};
  }
};
const context=vm.createContext({window:{FocadoDataStore:store},Promise,Object,String,Boolean,Map});
vm.runInContext(bridgeSource,context);

const changes={commercial:{completedAt:123},items:[{id:'i1',qty:10}]};
const first=store.saveDomain('COMERCIAL',changes,'op_1');
const second=store.saveDomain('COMERCIAL',changes,'op_1');
await Promise.resolve();
assert.equal(finalizeCalls,1,'cliques simultâneos devem compartilhar uma única chamada de finalização');
releaseFinalize();
const [a,b]=await Promise.all([first,second]);
assert.equal(a.ok,true);assert.equal(b.ok,true);
assert.equal(finalizeCalls,1,'não pode duplicar finalização remota');

const transition=await store.transitionOrder('op_1');
assert.equal(transition.ok,true);
assert.equal(transition.idempotent,true,'transição posterior do orders.js deve virar confirmação idempotente');
assert.equal(transitionCalls,0,'não deve existir segunda chamada remota de transição após finalização atômica');

await store.saveDomain('COMERCIAL',{notes:'rascunho'},'op_1');
assert.equal(draftCalls,1,'rascunhos continuam usando o caminho original');

assert.match(endpointSource,/order\?\.status==='PCP'.*finalizationKey/s,'endpoint deve reconhecer retry concluído');
assert.match(endpointSource,/changes\.createOrder/,'pedido novo deve ser criado dentro da operação atômica');
assert.equal((endpointSource.match(/writeWorkspace\(/g)||[]).length,1,'endpoint deve ter uma única gravação de workspace');
assert.match(endpointSource,/validateTransition\(order\)/,'deve reutilizar validação canônica de transição');
assert.match(endpointSource,/order\.status='PCP'/,'status PCP deve ser gravado antes da única persistência');
assert.match(loaderSource,/pedidos:\{css:'orders\.css',js:'orders\.js',deps:\['produtos','commercial-finalize-bridge'\]\}/,'ponte deve carregar somente com Pedidos');
assert.doesNotMatch(loaderSource,/pcp:\{[^\n]*commercial-finalize-bridge/,'PCP não deve carregar a ponte do Comercial');

console.log('commercial-pcp-atomic: ok');
