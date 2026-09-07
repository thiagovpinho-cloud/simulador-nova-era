import {applyDomain,getOrder,transitionRule,validateTransition,applyTransitionSideEffects} from './domain-rules.js';

export function finalizePcpState(state,{orderId,changes,idempotencyKey,user,now=Date.now()}){
  const id=String(orderId||'').trim();
  const key=String(idempotencyKey||'').trim();
  if(!id)throw Object.assign(new Error('ORDER_ID_REQUIRED'),{status:422});
  if(!key)throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'),{status:422});

  let order=getOrder(state,id);
  if(!order)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});

  if(order.status==='LOGISTICA'&&String(order.pcp?.finalizationKey||'')===key){
    return {idempotent:true,order};
  }
  if(order.status!=='PCP'){
    throw Object.assign(new Error('STATUS_CONFLICT'),{status:409,currentStatus:order.status});
  }

  applyDomain('PCP',state,{orderId:id,changes:changes||{}});
  order=getOrder(state,id);
  const rule=transitionRule(order.status);
  if(!rule||rule.to!=='LOGISTICA')throw Object.assign(new Error('INVALID_PCP_TRANSITION'),{status:409});

  const problem=validateTransition(order);
  if(problem)throw Object.assign(new Error(problem),{status:422,code:'TRANSITION_BLOCKED'});

  order.pcp={...(order.pcp||{}),completedAt:now,completedBy:String(user||'PCP'),finalizationKey:key};
  applyTransitionSideEffects(order,'PCP');
  order.status='LOGISTICA';
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.unshift({
    at:now,
    type:'STATUS_TRANSITION',
    text:'PCP liberado com reservas confirmadas',
    from:'PCP',to:'LOGISTICA',
    user:String(user||'PCP'),
    idempotencyKey:key
  });
  order.events=order.events.slice(0,100);
  return {idempotent:false,order};
}
