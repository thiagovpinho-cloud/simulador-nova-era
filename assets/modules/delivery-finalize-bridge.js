(function(){
  'use strict';
  const ds=window.FocadoDataStore;if(!ds)return;
  if(ds.__deliveryFinalizeBridge){window.FocadoDeliveryFinalizeBridge={active:true};return}
  const originalSaveDomain=ds.saveDomain.bind(ds),pending=new Map();
  const makeKey=orderId=>'delivery:'+String(orderId||'');
  async function atomicDelivery(changes,orderId){
    const key=makeKey(orderId);
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      try{
        const base=String(ds.getConfig?.().apiBaseUrl||'').replace(/\/$/,'');
        const token=ds.getSessionToken?.()||'';
        if(!base||!token)return {ok:false,mode:'blocked',error:'API_REQUIRED'};
        const idempotencyKey='delivery_'+String(orderId||'')+'_'+String(changes?.logistics?.actualDeliveryDate||'')+'_'+String(changes?.logistics?.deliveredOnTime);
        const res=await fetch(base+'/api/delivery-finalize',{
          method:'POST',cache:'no-store',
          headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({orderId,logistics:changes?.logistics||{},idempotencyKey})
        });
        const body=await res.json().catch(()=>({}));
        if(!res.ok)return {ok:false,mode:'remote',error:body.message||body.error||('HTTP '+res.status),code:body.error,status:res.status};
        if(body?.payload)ds.writeLocal?.(body.payload);
        return {ok:true,mode:'remote',...body,payload:body?.payload};
      }catch(err){
        return {ok:false,mode:'remote',error:String(err?.message||err)};
      }finally{pending.delete(key)}
    })();
    pending.set(key,task);return task;
  }
  ds.saveDomain=function(domain,changes,orderId){
    const logistics=changes?.logistics;
    if(String(domain||'').toUpperCase()==='LOGISTICA'&&logistics?.deliveryConfirmed===true){
      return atomicDelivery(changes,orderId);
    }
    return originalSaveDomain(domain,changes,orderId);
  };
  ds.__deliveryFinalizeBridge=true;
  window.FocadoDeliveryFinalizeBridge={active:true};
})();
