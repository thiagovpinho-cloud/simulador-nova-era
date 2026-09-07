(function(){
  'use strict';
  const store=window.FocadoDataStore;
  if(!store||store.__commercialFinalizeBridge)return;

  const originalSaveDomain=store.saveDomain.bind(store);
  const originalTransition=store.transitionOrder.bind(store);
  const inFlight=new Map();
  const keyFor=orderId=>'commercial-finalize:'+String(orderId||'');
  const isFinalize=(domain,changes)=>{
    if(String(domain||'').toUpperCase()!=='COMERCIAL')return false;
    if(changes?.createOrder?.commercial?.completedAt)return true;
    return Boolean(changes?.commercial?.completedAt);
  };

  store.saveDomain=async function(domain,changes,orderId){
    if(!isFinalize(domain,changes))return originalSaveDomain(domain,changes,orderId);
    const key=keyFor(orderId);
    if(inFlight.has(key))return inFlight.get(key);
    const request=Promise.resolve(store.finalizeCommercial(orderId,changes,key)).finally(()=>inFlight.delete(key));
    inFlight.set(key,request);
    return request;
  };

  store.transitionOrder=async function(orderId){
    const order=(store.readLocal().orders||[]).find(o=>String(o.id||o.number)===String(orderId));
    if(order?.status==='PCP' && String(order.commercial?.finalizationKey||'')===keyFor(orderId)){
      return {mode:'remote',ok:true,idempotent:true,orderId,from:'COMERCIAL',to:'PCP',payload:store.readLocal()};
    }
    return originalTransition(orderId);
  };

  Object.defineProperty(store,'__commercialFinalizeBridge',{value:true,enumerable:false});
})();
