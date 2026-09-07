import { applyDomain, getOrder, transitionRule, validateTransition, applyTransitionSideEffects } from './domain-rules.js';

export function finalizeCommercialState(state,{orderId,changes={},idempotencyKey,actor='Comercial',now=Date.now()}={}){
  const id=String(orderId||'').trim();
  const key=String(idempotencyKey||'').trim();
  if(!id)throw Object.assign(new Error('ORDER_ID_REQUIRED'),{status:422});
  if(!key)throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'),{status:422});

  let order=getOrder(state,id);
  if(order?.status==='PCP' && String(order.commercial?.finalizationKey||'')===key){
    return {state,order,idempotent:true,from:'COMERCIAL',to:'PCP'};
  }

  if(!order){
    if(!changes.createOrder||typeof changes.createOrder!=='object')throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
    applyDomain('COMERCIAL',state,{changes:{createOrder:changes.createOrder}});
    order=getOrder(state,id);
    if(!order)throw Object.assign(new Error('ORDER_CREATE_FAILED'),{status:422});
  }else{
    if(order.status!=='COMERCIAL')throw Object.assign(new Error('STATUS_CONFLICT'),{status:409,currentStatus:order.status});
    applyDomain('COMERCIAL',state,{orderId:id,changes});
    order=getOrder(state,id);
  }

  const rule=transitionRule(order.status);
  if(!rule||rule.to!=='PCP')throw Object.assign(new Error('INVALID_COMMERCIAL_TRANSITION'),{status:409});
  const problem=validateTransition(order);
  if(problem)throw Object.assign(new Error(problem),{status:422,code:'TRANSITION_BLOCKED'});

  order.commercial={...(order.commercial||{}),completedAt:Number(now),completedBy:String(actor||'Comercial'),finalizationKey:key};
  applyTransitionSideEffects(order,'COMERCIAL');
  order.status='PCP';
  order.events=Array.isArray(order.events)?order.events:[];
  order.events=order.events.filter(e=>String(e?.idempotencyKey||'')!==key);
  order.events.unshift({
    at:Number(now),type:'STATUS_TRANSITION',text:'Comercial finalizado · pedido enviado ao PCP',
    from:'COMERCIAL',to:'PCP',user:String(actor||'Comercial'),idempotencyKey:key
  });
  order.events=order.events.slice(0,100);
  return {state,order,idempotent:false,from:'COMERCIAL',to:'PCP'};
}
