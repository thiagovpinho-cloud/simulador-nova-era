function productFor(state,item){
  return (state.productCatalog||[]).find(p=>String(p.id||'')===String(item.productId||'')||String(p.code||'')===String(item.code||''))||null;
}
function metrics(state,order){
  let boxes=0,weightKg=0,cubageM3=0,estimatedInvoiceValue=0;
  for(const item of order.items||[]){
    const qty=Math.max(0,Number(item.qty||0));boxes+=qty;estimatedInvoiceValue+=qty*Math.max(0,Number(item.price||0));
    const p=productFor(state,item),l=p?.logistics||{};
    weightKg+=qty*Math.max(0,Number(l.grossWeightKg||0));
    cubageM3+=qty*Math.max(0,Number(l.cubageM3||0));
  }
  return {boxes,weightKg:Number(weightKg.toFixed(3)),cubageM3:Number(cubageM3.toFixed(6)),estimatedInvoiceValue:Number(estimatedInvoiceValue.toFixed(2))};
}
function orderOf(state,orderId){
  const order=(state.orders||[]).find(o=>String(o.id)===String(orderId));
  if(!order)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404,code:'ORDER_NOT_FOUND'});
  return order;
}
export function requestFreightQuoteState(state,{orderId,notes,user,idempotencyKey}){
  const order=orderOf(state,orderId),key=String(idempotencyKey||'').trim();
  const existing=order.freightQuote||{};
  if(existing.status==='SOLICITADA'&&key&&existing.requestKey===key)return {order,idempotent:true,quote:existing};
  if(!['COMERCIAL','PCP','LOGISTICA'].includes(order.status))throw Object.assign(new Error('QUOTE_NOT_ALLOWED_FOR_STATUS'),{status:422,code:'QUOTE_NOT_ALLOWED_FOR_STATUS'});
  const now=Date.now();
  order.freightQuote={
    ...existing,status:'SOLICITADA',requestKey:key,requestedAt:now,requestedBy:user||'Comercial',notes:String(notes||''),
    destination:{city:String(order.city||''),uf:String(order.uf||''),address:String(order.deliveryAddress||'')},
    freightType:String(order.freightType||''),requestedDeliveryDate:String(order.requestedDeliveryDate||''),
    metrics:metrics(state,order),response:null,
    history:[{at:now,type:'SOLICITADA',user:user||'Comercial'},...(existing.history||[])].slice(0,30)
  };
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.unshift({at:now,type:'FREIGHT_QUOTE_REQUEST',text:'Cotação de frete solicitada à Logística',user:user||'Comercial'});
  return {order,idempotent:false,quote:order.freightQuote};
}
export function respondFreightQuoteState(state,{orderId,response,user}){
  const order=orderOf(state,orderId),quote=order.freightQuote||{};
  if(quote.status!=='SOLICITADA')throw Object.assign(new Error('QUOTE_NOT_PENDING'),{status:409,code:'QUOTE_NOT_PENDING'});
  const carrierId=String(response?.carrierId||'');
  const carrier=(state.carriers||[]).find(c=>String(c.id)===carrierId&&c.active!==false);
  if(!carrier)throw Object.assign(new Error('INVALID_OR_INACTIVE_CARRIER'),{status:422,code:'INVALID_OR_INACTIVE_CARRIER'});
  const freightValue=Math.max(0,Number(response?.freightValue||0));
  if(!(freightValue>0))throw Object.assign(new Error('FREIGHT_VALUE_REQUIRED'),{status:422,code:'FREIGHT_VALUE_REQUIRED'});
  const now=Date.now();
  quote.status='RESPONDIDA';
  quote.respondedAt=now;quote.respondedBy=user||'Logística';
  quote.response={carrierId,carrier:String(carrier.name||''),freightValue,deliveryDays:Math.max(0,Number(response?.deliveryDays||0)),pickupDate:String(response?.pickupDate||''),deliveryDate:String(response?.deliveryDate||''),notes:String(response?.notes||'')};
  quote.history=[{at:now,type:'RESPONDIDA',user:user||'Logística',carrier:quote.response.carrier,freightValue},...(quote.history||[])].slice(0,30);
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.unshift({at:now,type:'FREIGHT_QUOTE_RESPONSE',text:'Cotação de frete respondida por '+quote.response.carrier,user:user||'Logística'});
  return {order,quote};
}
