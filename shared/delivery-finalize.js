import {applyTransitionSideEffects,validateTransition} from './domain-rules.js';

export function finalizeDeliveryState(state,{orderId,logistics,idempotencyKey,user}){
  const order=(state.orders||[]).find(o=>String(o.id)===String(orderId));
  if(!order)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404,code:'ORDER_NOT_FOUND'});
  order.logistics=order.logistics||{};
  const key=String(idempotencyKey||'').trim();
  if(order.status==='ENTREGUE'&&key&&order.logistics.deliveryFinalizationKey===key){
    return {order,idempotent:true};
  }
  if(order.status!=='LOGISTICA')throw Object.assign(new Error('INVALID_CURRENT_STATUS'),{status:409,code:'INVALID_CURRENT_STATUS',currentStatus:order.status});

  const incoming=logistics||{};
  order.logistics={...order.logistics,
    deliveryConfirmed:true,
    deliveredOnTime:Boolean(incoming.deliveredOnTime),
    actualDeliveryDate:String(incoming.actualDeliveryDate||''),
    deliveryDelayReason:String(incoming.deliveryDelayReason||''),
    deliveryConfirmedAt:Number(incoming.deliveryConfirmedAt||Date.now()),
    deliveryConfirmedBy:String(incoming.deliveryConfirmedBy||user||'Logística'),
    deliveryFinalizationKey:key
  };

  const problem=validateTransition(order);
  if(problem)throw Object.assign(new Error(problem),{status:422,code:'TRANSITION_BLOCKED'});
  applyTransitionSideEffects(order,'LOGISTICA');
  order.status='ENTREGUE';
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.unshift({at:Date.now(),type:'STATUS_TRANSITION',text:'Entrega confirmada · pedido concluído',from:'LOGISTICA',to:'ENTREGUE',user:user||'Logística',idempotencyKey:key});
  return {order,idempotent:false};
}
