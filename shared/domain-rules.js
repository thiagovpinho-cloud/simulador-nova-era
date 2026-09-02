export const RULES_VERSION='2026.09.02.1';

export const DOMAIN_PERMISSION=Object.freeze({
  COMERCIAL:'orders.write',
  PCP:'pcp.write',
  PRODUCAO:'production.write',
  ESTOQUE:'inventory.write',
  LOGISTICA:'logistics.write',
  COMPRAS:'purchases.write',
  FINANCEIRO:'finance.write',
  SOLICITACAO_PRODUCAO:'pcp.write',
  TRANSPORTADORAS:'logistics.write',
  CLIENTES:'commercial.write',
  EXPEDICAO:'inventory.write',
  BASES:'workspace.write',
  COTACAO_FRETE_COMERCIAL:'orders.write',
  COTACAO_FRETE_LOGISTICA:'logistics.write',
  INSUMOS:'inventory.write'
});

export const FLOW=Object.freeze({
  COMERCIAL:Object.freeze({to:'PCP',permission:'orders.write'}),
  PCP:Object.freeze({to:'LOGISTICA',permission:'pcp.write'}),
  LOGISTICA:Object.freeze({to:'ENTREGUE',permission:'logistics.write'})
});

function pick(source,keys){
  const out={};
  for(const k of keys)if(Object.prototype.hasOwnProperty.call(source||{},k))out[k]=source[k];
  return out;
}

export function getOrder(state,id){
  const orders=Array.isArray(state?.orders)?state.orders:[];
  return orders.find(o=>String(o.id)===String(id));
}

function normKey(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
export function finishedInventoryKey(item,brandOverride=''){
  const brand=normKey(brandOverride||item?.brand||'sem-marca');
  const sku=normKey(item?.code||item?.productId||item?.id||item?.name||'sem-sku');
  return brand+'::'+sku;
}
function findFinishedInventory(state,item,brandOverride=''){
  state.inventory=state.inventory||{};
  const brand=String(brandOverride||item?.brand||'').trim();
  const key=finishedInventoryKey(item,brand);
  if(state.inventory[key])return [key,state.inventory[key]];
  const found=Object.entries(state.inventory).find(([,v])=>
    String(v?.code||'')===String(item?.code||'')&&
    String(v?.brand||'').trim().toLowerCase()===brand.toLowerCase()
  );
  if(found)return found;
  const inv={code:item?.code||'',name:item?.name||'',brand,unit:item?.unit||'CX',physical:0,reserved:0,blocked:0,bases:{}};
  state.inventory[key]=inv;
  return [key,inv];
}
function reconcileFinishedCodeByBrand(state,code){
  code=String(code||'');if(!code)return false;
  const entries=Object.entries(state.inventory||{}).filter(([,v])=>String(v?.code||'')===code);
  if(!entries.length)return false;
  const brands=[...new Set((state.stockMovements||[])
    .filter(m=>String(m.kind||'finished')==='finished'&&String(m.code||'')===code&&String(m.brand||'').trim())
    .map(m=>String(m.brand).trim()))];
  if(brands.length<2)return false;
  const sums=new Map(brands.map(b=>[b,{physical:0,reserved:0,blocked:0,name:'',unit:'CX'}]));
  for(const m of state.stockMovements||[]){
    if(String(m.kind||'finished')!=='finished'||String(m.code||'')!==code||!String(m.brand||'').trim())continue;
    const s=sums.get(String(m.brand).trim());if(!s)continue;
    s.physical+=Number((m.deltaPhysical??(Number(m.after?.physical||0)-Number(m.before?.physical||0)))||0);
    s.reserved+=Number((m.deltaReserved??(Number(m.after?.reserved||0)-Number(m.before?.reserved||0)))||0);
    s.blocked+=Number((m.deltaBlocked??(Number(m.after?.blocked||0)-Number(m.before?.blocked||0)))||0);
    s.name=s.name||String(m.name||'');s.unit=s.unit||String(m.unit||'CX');
  }
  const current=entries.reduce((a,[,v])=>({
    physical:a.physical+Number(v.physical||0),reserved:a.reserved+Number(v.reserved||0),blocked:a.blocked+Number(v.blocked||0)
  }),{physical:0,reserved:0,blocked:0});
  const rebuilt=[...sums.values()].reduce((a,v)=>({
    physical:a.physical+v.physical,reserved:a.reserved+v.reserved,blocked:a.blocked+v.blocked
  }),{physical:0,reserved:0,blocked:0});
  const same=(a,b)=>Math.abs(a-b)<1e-9;
  if(!same(current.physical,rebuilt.physical)||!same(current.reserved,rebuilt.reserved)||!same(current.blocked,rebuilt.blocked))return false;
  for(const [k] of entries)delete state.inventory[k];
  for(const [brand,s] of sums){
    const key=finishedInventoryKey({code},brand);
    state.inventory[key]={code,name:s.name||code,brand,unit:s.unit||'CX',physical:s.physical,reserved:s.reserved,blocked:s.blocked,bases:{}};
  }
  return true;
}

function orderInventoryEntry(state,item,brand=''){
  const found=findFinishedInventory(state,item,item?.brand||brand);
  return found?.[1]||null;
}

function referencesOrder(record,id,number){
  if(!record||typeof record!=='object')return false;
  const direct=['orderId','order_id','sourceOrderId','source_order_id','salesOrderId'];
  if(direct.some(k=>String(record[k]||'')===id))return true;
  if(Array.isArray(record.sourceOrderIds)&&record.sourceOrderIds.some(x=>String(x)===id))return true;
  if(Array.isArray(record.orderIds)&&record.orderIds.some(x=>String(x)===id))return true;
  return false;
}

function cascadeDeleteOrder(state,target){
  const id=String(target.id),number=String(target.number||'');

  // Reverte o efeito físico/reservado do pedido antes de remover seus registros.
  for(const item of target.items||[]){
    const inv=orderInventoryEntry(state,item,target.brand);if(!inv)continue;
    if(target.expedition?.stockReleasedAt){
      const shipped=Math.max(0,Number(item.dispatchedQty??item.qty??0));
      inv.physical=Math.max(0,Number(inv.physical||0)+shipped);
    }else{
      const reserved=Math.max(0,Number(item.reservedQty||0));
      inv.reserved=Math.max(0,Number(inv.reserved||0)-reserved);
    }
  }

  const reasonNeedle=('pedido '+number).toLowerCase();
  state.stockMovements=(state.stockMovements||[]).filter(m=>{
    if(referencesOrder(m,id,number))return false;
    return !(number&&String(m.reason||'').toLowerCase().includes(reasonNeedle));
  });
  state.financialFacts=(state.financialFacts||[]).filter(x=>String(x.order_id||'')!==id&&!referencesOrder(x,id,number));
  state.inventoryCounts=(state.inventoryCounts||[]).filter(x=>!referencesOrder(x,id,number));
  state.freightRequests=(state.freightRequests||[]).filter(x=>!referencesOrder(x,id,number));

  // Remove somente artefatos de Produção/Compras explicitamente vinculados ao pedido.
  // Solicitações consolidadas compartilhadas permanecem para não afetar outros pedidos.
  const removedProductionIds=new Set();
  state.productionRequests=(state.productionRequests||[]).filter(x=>{
    const direct=['orderId','order_id','sourceOrderId','source_order_id','salesOrderId']
      .some(k=>String(x?.[k]||'')===id);
    const sourceIds=Array.isArray(x?.sourceOrderIds)?x.sourceOrderIds:null;
    const orderIds=Array.isArray(x?.orderIds)?x.orderIds:null;
    const inSource=sourceIds?.some(v=>String(v)===id);
    const inOrders=orderIds?.some(v=>String(v)===id);
    const exclusive=direct||(inSource&&sourceIds.length===1)||(inOrders&&orderIds.length===1);
    if(exclusive){removedProductionIds.add(String(x.id||''));return false}
    if(inSource)x.sourceOrderIds=sourceIds.filter(v=>String(v)!==id);
    if(inOrders)x.orderIds=orderIds.filter(v=>String(v)!==id);
    return true;
  });
  state.purchaseRequests=(state.purchaseRequests||[]).filter(x=>{
    if(referencesOrder(x,id,number))return false;
    const prodRef=String(x.productionRequestId||x.sourceProductionRequestId||'');
    return !removedProductionIds.has(prodRef);
  });

  if(state.workflowState&&typeof state.workflowState==='object'){
    if(state.workflowState.byOrder)delete state.workflowState.byOrder[id];
    if(Array.isArray(state.workflowState.workQueue))state.workflowState.workQueue=state.workflowState.workQueue.filter(x=>String(x.orderId||'')!==id);
    if(Array.isArray(state.workflowState.reactions))state.workflowState.reactions=state.workflowState.reactions.filter(x=>String(x.orderId||'')!==id);
  }
  if(state.automationState&&Array.isArray(state.automationState.signals)){
    state.automationState.signals=state.automationState.signals.filter(x=>String(x.orderId||'')!==id);
  }

  state.orders=(state.orders||[]).filter(o=>String(o.id)!==id);
}

function applyCommercial(state,body){
  state.orders=Array.isArray(state.orders)?state.orders:[];
  const changes=body.changes||{};

  if(changes.createOrder&&typeof changes.createOrder==='object'){
    const src=structuredClone(changes.createOrder);
    const id=String(src.id||src.number||'').trim();
    if(!id)throw Object.assign(new Error('ORDER_ID_REQUIRED'),{status:422});
    if(state.orders.some(o=>String(o.id)===id))throw Object.assign(new Error('ORDER_ALREADY_EXISTS'),{status:409});
    const number=String(src.number||id).trim();
    if(state.orders.some(o=>String(o.number||'').trim().toUpperCase()===number.toUpperCase())){
      throw Object.assign(new Error('ORDER_NUMBER_ALREADY_EXISTS'),{status:409,number});
    }
    const order={
      id,
      number,
      status:'COMERCIAL',
      createdAt:Number(src.createdAt||Date.now()),
      brand:String(src.brand||'Nova Era'),
      customerId:String(src.customerId||''),client:String(src.client||''),cnpj:String(src.cnpj||''),
      representativeId:String(src.representativeId||''),representative:String(src.representative||''),
      salesChannel:String(src.salesChannel||'REPRESENTANTE'),salesJustification:String(src.salesJustification||''),
      city:String(src.city||''),uf:String(src.uf||src.state||''),cep:String(src.cep||''),bairro:String(src.bairro||''),
      email:String(src.email||''),phone:String(src.phone||''),orderDate:String(src.orderDate||''),
      requestedDeliveryDate:String(src.requestedDeliveryDate||''),suggestedPickup:String(src.suggestedPickup||src.suggestedPickupDate||''),
      freightType:String(src.freightType||'CIF'),paymentTerms:String(src.paymentTerms||''),
      logisticsBudget:Number(src.logisticsBudget||0),deliveryAddress:String(src.deliveryAddress||''),notes:String(src.notes||''),
      commercial:{completedAt:null,completedBy:null},
      pcp:{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false},
      logistics:{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''},
      freightQuote:src.freightQuote&&typeof src.freightQuote==='object'?structuredClone(src.freightQuote):null,
      items:(src.items||[]).map(i=>({
        id:String(i.id||i.code||i.productId||i.name||('item_'+Math.random().toString(36).slice(2,8))),
        productId:String(i.productId||''),code:String(i.code||''),name:String(i.name||''),
        qty:Number(i.qty||0),price:Number(i.price||0),source:String(i.source||''),reservedQty:0,
        productionConsumed:false,productionCompleted:false
      })),
      events:Array.isArray(src.events)?src.events.slice(0,20):[]
    };
    state.orders.unshift(order);
    return;
  }

  if(changes.deleteOrderId||changes.deleteOrderCascadeId){
    const id=String(changes.deleteOrderId||changes.deleteOrderCascadeId);
    const target=state.orders.find(o=>String(o.id)===id);
    if(!target)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
    if(changes.deleteOrderId&&target.status!=='COMERCIAL')throw Object.assign(new Error('ORDER_DELETE_BLOCKED_AFTER_COMMERCIAL'),{status:422});
    if(changes.deleteOrderCascadeId)cascadeDeleteOrder(state,target);
    else state.orders=state.orders.filter(o=>String(o.id)!==id);
    return;
  }

  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  Object.assign(o,pick(changes,[
    'customerId','client','cnpj','city','state','uf','orderDate','suggestedPickupDate','suggestedPickup','freightType','observation','notes','brand',
    'representativeId','representative','salesChannel','salesJustification','requestedDeliveryDate','paymentTerms',
    'logisticsBudget','deliveryAddress','email','phone','cep','bairro'
  ]));
  if(Array.isArray(changes.items)){
    const previous=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId||i.name),i]));
    o.items=changes.items.map((incoming,index)=>{
      const key=String(incoming.id||incoming.code||incoming.productId||incoming.name||index);
      const old=previous.get(key)||{};
      return {...old,...pick(incoming,['id','qty','price','ipi','st','finalPrice','name','code','productId','source'])};
    });
  }
  if(changes.commercial&&typeof changes.commercial==='object'){
    o.commercial={...(o.commercial||{}),...pick(changes.commercial,['completedAt','completedBy'])};
  }
  if(changes.lastCorrection&&typeof changes.lastCorrection==='object')o.lastCorrection=structuredClone(changes.lastCorrection);
  if(changes.freightQuoteRequest&&typeof changes.freightQuoteRequest==='object'){
    const q=changes.freightQuoteRequest;
    const notes=String(q.notes||'').trim();
    o.freightQuote={
      id:String(q.id||o.freightQuote?.id||('fq_'+Date.now())),
      status:'SOLICITADA',
      requestedAt:Number(q.requestedAt||Date.now()),
      requestedBy:String(q.requestedBy||'Comercial'),
      notes,
      commercialViewedAt:null,
      respondedAt:null,
      respondedBy:'',
      quotes:[],
      history:[
        {at:Number(q.requestedAt||Date.now()),type:'SOLICITADA',by:String(q.requestedBy||'Comercial'),notes},
        ...((o.freightQuote?.history||[]).slice(0,49))
      ]
    };
  }
  if(changes.freightQuoteViewed&&o.freightQuote?.status==='RESPONDIDA'){
    o.freightQuote.commercialViewedAt=Number(changes.freightQuoteViewed.at||Date.now());
    o.freightQuote.commercialViewedBy=String(changes.freightQuoteViewed.by||'Comercial');
  }
  if(changes.pcpDeliveryAlertAcknowledged&&o.pcp?.deliveryRescheduleAlert){
    const a=o.pcp.deliveryRescheduleAlert,ack=changes.pcpDeliveryAlertAcknowledged;
    if(!ack.id||String(ack.id)===String(a.id)){
      a.status='LIDO';a.acknowledgedAt=Number(ack.at||Date.now());a.acknowledgedBy=String(ack.by||'Comercial');
      o.events=Array.isArray(o.events)?o.events:[];
      o.events.unshift({at:a.acknowledgedAt,text:'Comercial confirmou ciência do reagendamento de entrega para '+String(a.newAvailabilityDate||''),user:a.acknowledgedBy});
    }
  }
  if(changes.event&&typeof changes.event==='object'){
    o.events=Array.isArray(o.events)?o.events:[];
    o.events.unshift(structuredClone(changes.event));
    o.events=o.events.slice(0,100);
  }
}

function applyPCP(state,body){
  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  o.pcp=o.pcp||{};
  Object.assign(o.pcp,pick(body.changes?.pcp||body.changes,[
    'notes','logisticsPreRelease','logisticsAvailabilityDate','logisticsPreReleaseAt'
  ]));
  state.inventory=state.inventory||{};
  state.stockMovements=Array.isArray(state.stockMovements)?state.stockMovements:[];
  const map=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId),i]));
  const findInventory=item=>{
    reconcileFinishedCodeByBrand(state,item?.code);
    return findFinishedInventory(state,item,item?.brand||o.brand);
  };

  for(const incoming of body.changes?.items||[]){
    const item=map.get(String(incoming.id||incoming.code||incoming.productId||''));
    if(!item)continue;
    const [invKey,inv]=findInventory(item);
    const oldReserved=Math.max(0,Number(item.reservedQty||0));
    const desired=Math.max(0,Number(incoming.reservedQty||0));
    const free=Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0));
    if(desired>oldReserved+free)throw Object.assign(new Error('INSUFFICIENT_STOCK'),{status:422});

    const beforeReserved=Math.max(0,Number(inv.reserved||0));
    inv.reserved=Math.max(0,beforeReserved-oldReserved+desired);
    if(desired!==oldReserved){
      state.stockMovements.unshift({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        at:Date.now(),kind:'finished',key:invKey,code:item.code||'',name:item.name||'',brand:item.brand||o.brand||'',unit:'CX',
        type:desired>oldReserved?'RESERVA':'LIBERACAO_RESERVA',
        qty:Math.abs(desired-oldReserved),reason:'PCP · pedido '+o.number,user:'Sistema',
        before:{physical:Number(inv.physical||0),reserved:beforeReserved,blocked:Number(inv.blocked||0)},
        after:{physical:Number(inv.physical||0),reserved:Number(inv.reserved||0),blocked:Number(inv.blocked||0)}
      });
    }

    Object.assign(item,pick(incoming,['reservedQty','cutQty','pcpAvailabilityDate','deliveryBase','pcpBalanceDecision']));
    item.source='ESTOQUE';
  }

  const bases=[...new Set((o.items||[]).map(i=>i.deliveryBase).filter(Boolean))];
  o.pcp.deliveryBase=bases.length===1?bases[0]:(bases.length?'MÚLTIPLAS':'');
  const lateDates=(o.items||[]).filter(i=>{
    const missing=Math.max(0,Number(i.qty||0)-Number(i.reservedQty||0)-Number(i.cutQty||0));
    return missing>0&&i.pcpBalanceDecision==='AGUARDAR'&&i.pcpAvailabilityDate&&o.requestedDeliveryDate&&i.pcpAvailabilityDate>o.requestedDeliveryDate;
  }).map(i=>i.pcpAvailabilityDate).sort();
  if(lateDates.length){
    const newDate=lateDates[lateDates.length-1],prev=o.pcp.deliveryRescheduleAlert;
    if(!prev||prev.newAvailabilityDate!==newDate||prev.requestedDeliveryDate!==o.requestedDeliveryDate){
      const at=Date.now();
      o.pcp.deliveryRescheduleAlert={id:'pcp_alert_'+o.id+'_'+at,status:'PENDENTE',createdAt:at,createdBy:'PCP',
        requestedDeliveryDate:o.requestedDeliveryDate,newAvailabilityDate:newDate,acknowledgedAt:null,acknowledgedBy:''};
      o.events=Array.isArray(o.events)?o.events:[];
      o.events.unshift({at,text:'PCP identificou indisponibilidade até '+newDate+'; Comercial deve reagendar entrega com o cliente.',user:'PCP'});
    }
  }else if(o.pcp.deliveryRescheduleAlert?.status==='PENDENTE'){
    o.pcp.deliveryRescheduleAlert.status='RESOLVIDO';
    o.pcp.deliveryRescheduleAlert.resolvedAt=Date.now();
  }
  if(body.changes?.pcp?.logisticsPreRelease){
    o.events=Array.isArray(o.events)?o.events:[];
    o.events.unshift({
      at:Date.now(),
      text:'Logística pré-liberada com ressalva de disponibilidade em '+String(o.pcp.logisticsAvailabilityDate||''),
      user:'PCP'
    });
  }
}

function applyProduction(state,body){
  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  if(Array.isArray(body.changes?.items)){
    const map=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId),i]));
    for(const incoming of body.changes.items){
      const item=map.get(String(incoming.id||incoming.code||incoming.productId||''));
      if(item)Object.assign(item,pick(incoming,[
        'productionConsumed','productionCompleted','productionRequirements','productionActualQty','productionLot'
      ]));
    }
  }
}

export function requiredPickupDate(order){
  const dates=(order?.items||[]).map(i=>i?.pcpAvailabilityDate).filter(Boolean);
  if(order?.pcp?.logisticsAvailabilityDate)dates.push(order.pcp.logisticsAvailabilityDate);
  return dates.sort().slice(-1)[0]||'';
}

function applyLogistics(state,body){
  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  o.logistics=o.logistics||{};
  const changes=body.changes?.logistics||body.changes||{};
  const pickupDate=Object.prototype.hasOwnProperty.call(changes,'pickupDate')?changes.pickupDate:o.logistics.pickupDate;
  const deliveryDate=Object.prototype.hasOwnProperty.call(changes,'deliveryDate')?changes.deliveryDate:o.logistics.deliveryDate;
  const minPickup=requiredPickupDate(o);
  if(pickupDate&&minPickup&&pickupDate<minPickup){
    throw Object.assign(new Error('PICKUP_BEFORE_PCP_AVAILABILITY'),{status:422,minPickup});
  }
  if(deliveryDate&&pickupDate&&deliveryDate<pickupDate){
    throw Object.assign(new Error('DELIVERY_BEFORE_PICKUP'),{status:422});
  }
  if(changes.carrierId){
    const carrier=(state.carriers||[]).find(x=>String(x.id)===String(changes.carrierId)&&x.active!==false);
    if(!carrier)throw Object.assign(new Error('INVALID_OR_INACTIVE_CARRIER'),{status:422});
    changes.carrier=carrier.name||changes.carrier||'';
  }
  Object.assign(o.logistics,pick(changes,[
    'freightValue','pickupDate','deliveryDate','carrier','carrierId','trackingCode','vehicle','driver','notes',
    'deliveryConfirmed','deliveredOnTime','actualDeliveryDate','deliveryDelayReason','deliveryConfirmedAt','deliveryConfirmedBy'
  ]));

  if(body.changes?.freightQuoteStart&&o.freightQuote?.status==='SOLICITADA'){
    o.freightQuote.status='EM_COTACAO';
    o.freightQuote.startedAt=Number(body.changes.freightQuoteStart.at||Date.now());
    o.freightQuote.startedBy=String(body.changes.freightQuoteStart.by||'Logística');
    o.freightQuote.history=[
      {at:o.freightQuote.startedAt,type:'EM_COTACAO',by:o.freightQuote.startedBy},
      ...((o.freightQuote.history||[]).slice(0,49))
    ];
  }

  if(body.changes?.freightQuoteResponse&&typeof body.changes.freightQuoteResponse==='object'){
    if(!o.freightQuote||!['SOLICITADA','EM_COTACAO','RESPONDIDA'].includes(o.freightQuote.status)){
      throw Object.assign(new Error('FREIGHT_QUOTE_REQUEST_REQUIRED'),{status:422});
    }
    const response=body.changes.freightQuoteResponse;
    const quotes=(Array.isArray(response.quotes)?response.quotes:[]).map((q,index)=>({
      id:String(q.id||('fqopt_'+Date.now()+'_'+index)),
      provider:String(q.provider||'').trim(),
      value:Number(q.value||0),
      transitDays:Math.max(0,Number(q.transitDays||0)),
      pickupEstimate:String(q.pickupEstimate||''),
      notes:String(q.notes||'').trim()
    })).filter(q=>q.provider&&q.value>0);
    if(!quotes.length)throw Object.assign(new Error('FREIGHT_QUOTE_OPTION_REQUIRED'),{status:422});
    const at=Number(response.respondedAt||Date.now()),by=String(response.respondedBy||'Logística');
    o.freightQuote.status='RESPONDIDA';
    o.freightQuote.respondedAt=at;
    o.freightQuote.respondedBy=by;
    o.freightQuote.commercialViewedAt=null;
    o.freightQuote.quotes=quotes;
    o.freightQuote.responseNotes=String(response.notes||'').trim();
    o.freightQuote.history=[
      {at,type:'RESPONDIDA',by,count:quotes.length},
      ...((o.freightQuote.history||[]).slice(0,49))
    ];
  }
}

function applyInventory(state,body){
  const c=body.changes||{};
  state.inventory=state.inventory||{};
  state.inputInventory=state.inputInventory||{};
  state.stockMovements=Array.isArray(state.stockMovements)?state.stockMovements:[];
  state.inventoryCounts=Array.isArray(state.inventoryCounts)?state.inventoryCounts:[];

  const applyMovement=m0=>{
    const m=structuredClone(m0||{});
    const kind=String(m.kind||'finished').toLowerCase()==='input'?'input':'finished';
    const collection=kind==='input'?state.inputInventory:state.inventory;
    const key=kind==='finished'?finishedInventoryKey(m,m.brand):String(m.key||m.code||'').trim();
    if(!key)throw Object.assign(new Error('INVENTORY_ITEM_REQUIRED'),{status:422});
    let target=collection[key]||(kind==='input'
      ?Object.values(collection).find(x=>String(x?.code||'')===String(m.code||''))||null
      :Object.values(collection).find(x=>String(x?.code||'')===String(m.code||'')&&String(x?.brand||'').trim().toLowerCase()===String(m.brand||'').trim().toLowerCase())||null);
    if(!target){
      target={code:String(m.code||key),name:String(m.name||m.code||key),unit:String(m.unit||''),physical:0,reserved:0,blocked:0};
      collection[key]=target;
    }
    const before={physical:Number(target.physical||0),reserved:Number(target.reserved||0),blocked:Number(target.blocked||0)};
    const deltaPhysical=Number(m.deltaPhysical||0),deltaReserved=Number(m.deltaReserved||0),deltaBlocked=Number(m.deltaBlocked||0);
    const after={physical:before.physical+deltaPhysical,reserved:before.reserved+deltaReserved,blocked:before.blocked+deltaBlocked};
    if(after.physical<0||after.reserved<0||after.blocked<0)throw Object.assign(new Error('INVENTORY_NEGATIVE_BALANCE'),{status:422,before,after});
    if(after.reserved+after.blocked>after.physical)throw Object.assign(new Error('INVENTORY_COMMITMENT_EXCEEDS_PHYSICAL'),{status:422,before,after});
    target.physical=after.physical;target.reserved=after.reserved;target.blocked=after.blocked;
    if(m.unit)target.unit=String(m.unit);
    if(m.brand)target.brand=String(m.brand);
    if(m.base){
      target.bases=target.bases||{};
      target.bases[String(m.base)]=Math.max(0,Number(target.bases[String(m.base)]||0)+deltaPhysical);
    }
    state.stockMovements.unshift({
      id:String(m.id||('mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7))),
      batchId:String(m.batchId||''),at:Number(m.at||Date.now()),kind,key,
      code:String(m.code||target.code||''),name:String(m.name||target.name||''),brand:String(m.brand||target.brand||''),
      unit:String(m.unit||target.unit||''),type:String(m.type||'AJUSTE'),qty:Math.abs(Number(m.qty??(deltaPhysical||deltaReserved||deltaBlocked))),
      base:String(m.base||''),warehouse:String(m.warehouse||m.base||''),lot:String(m.lot||''),condition:String(m.condition||''),
      palletized:Boolean(m.palletized),boxesPerPallet:Number(m.boxesPerPallet||0),pallets:Number(m.pallets||0),chapatex:Boolean(m.chapatex),
      reason:String(m.reason||''),note:String(m.note||''),user:String(m.user||'Sistema'),
      deltaPhysical,deltaReserved,deltaBlocked,before,after
    });
    if(kind==='finished'&&m.brand)reconcileFinishedCodeByBrand(state,m.code);
  };

  const movements=Array.isArray(c.movements)?c.movements:(c.movement?[c.movement]:[]);
  for(const m of movements)applyMovement(m);

  // Compatibilidade temporária para fluxos legados; novos lançamentos devem usar movement/movements.
  if(c.inventory&&typeof c.inventory==='object')state.inventory=c.inventory;
  if(c.inputInventory&&typeof c.inputInventory==='object')state.inputInventory=c.inputInventory;
  if(Array.isArray(c.stockMovements))state.stockMovements=c.stockMovements;
  if(Array.isArray(c.inventoryCounts))state.inventoryCounts=c.inventoryCounts;
  if(c.inventoryCount&&typeof c.inventoryCount==='object')state.inventoryCounts.unshift(structuredClone(c.inventoryCount));
  if(c.inventoryPolicy&&typeof c.inventoryPolicy==='object'){
    const p=structuredClone(c.inventoryPolicy);
    p.sku=String(p.sku||'').trim();
    if(!p.sku)throw Object.assign(new Error('INVENTORY_POLICY_SKU_REQUIRED'),{status:422});
    p.minimum_stock=Math.max(0,Number(p.minimum_stock||0));
    p.reorder_point=Math.max(0,Number(p.reorder_point||0));
    p.safety_stock=Math.max(0,Number(p.safety_stock||0));
    p.updatedAt=Date.now();
    state.inventoryPolicy=state.inventoryPolicy||{};
    state.inventoryPolicy[p.sku]=p;
  }
}

function applyPurchases(state,body){
  const changes=body.changes||{};
  if(changes.reorder&&typeof changes.reorder==='object')state.purchasePlanning={...(state.purchasePlanning||{}),...changes.reorder};
  state.purchaseRequests=Array.isArray(state.purchaseRequests)?state.purchaseRequests:[];
  state.suppliers=Array.isArray(state.suppliers)?state.suppliers:[];
  if(changes.request&&typeof changes.request==='object'){
    const incoming=structuredClone(changes.request);
    const idx=state.purchaseRequests.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx>=0)state.purchaseRequests[idx]=incoming;else state.purchaseRequests.unshift(incoming);
  }
  if(changes.supplier&&typeof changes.supplier==='object'){
    const incoming=structuredClone(changes.supplier);
    const idx=state.suppliers.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx>=0)state.suppliers[idx]=incoming;else state.suppliers.unshift(incoming);
  }
  if(changes.receive&&typeof changes.receive==='object'){
    const rec=changes.receive;
    const req=state.purchaseRequests.find(x=>String(x.id)===String(rec.requestId));
    if(!req)throw Object.assign(new Error('PURCHASE_REQUEST_NOT_FOUND'),{status:404});
    if(req.status==='RECEBIDO')throw Object.assign(new Error('PURCHASE_ALREADY_RECEIVED'),{status:422});
    const qty=Math.max(0,Number(rec.qty||req.qty||0));
    if(!(qty>0))throw Object.assign(new Error('INVALID_RECEIPT_QTY'),{status:422});
    state.inputInventory=state.inputInventory||{};
    const code=String(req.code||'');
    let key=code;
    let inv=state.inputInventory[key];
    if(!inv){
      const found=Object.entries(state.inputInventory).find(([,v])=>String(v?.code||'')===code);
      if(found){key=found[0];inv=found[1]}
    }
    if(!inv){
      inv=state.inputInventory[key]={code,name:req.material||code,unit:req.unit||'',physical:0,reserved:0,blocked:0};
    }
    const before=Number(inv.physical||0);
    inv.physical=before+qty;
    state.stockMovements=Array.isArray(state.stockMovements)?state.stockMovements:[];
    state.stockMovements.unshift({
      id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      at:Date.now(),kind:'input',key,code,name:req.material||code,unit:req.unit||'',
      type:'ENTRADA_COMPRA',qty,reason:'Recebimento de compra '+String(req.number||req.id),
      supplier:req.supplierName||'',user:rec.user||'Compras',
      before:{physical:before},after:{physical:before+qty}
    });
    req.status='RECEBIDO';req.receivedQty=qty;req.receivedAt=rec.receivedAt||Date.now();req.receivedBy=rec.user||'Compras';
  }
}

function applyExpedition(state,body){
  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  o.expedition=o.expedition||{};
  const changes=body.changes?.expedition||body.changes||{};
  Object.assign(o.expedition,pick(changes,[
    'status','separationDate','conferenceDate','releaseDate','releasedBy','conferenceBy',
    'vehiclePlate','sealNumber','romaneio','notes','items','base','readyForPickup'
  ]));
  if(changes.releaseStock===true){
    if(o.expedition.stockReleasedAt)throw Object.assign(new Error('EXPEDITION_STOCK_ALREADY_RELEASED'),{status:422});
    state.inventory=state.inventory||{};
    state.stockMovements=Array.isArray(state.stockMovements)?state.stockMovements:[];
    for(const item of o.items||[]){
      const reserved=Math.max(0,Number(item.reservedQty||0));
      const shipped=Math.max(0,Number(item.qty||0));
      if(shipped===0)continue;
      reconcileFinishedCodeByBrand(state,item.code);
      const found=findFinishedInventory(state,item,item.brand||o.brand);
      if(!found)throw Object.assign(new Error('EXPEDITION_STOCK_NOT_FOUND'),{status:422,item:item.code||item.name});
      const [key,inv]=found;
      const physical=Number(inv.physical||0),invReserved=Number(inv.reserved||0);
      if(physical<shipped)throw Object.assign(new Error('EXPEDITION_INSUFFICIENT_PHYSICAL_STOCK'),{status:422,item:item.code||item.name});
      inv.physical=Math.max(0,physical-shipped);
      inv.reserved=Math.max(0,invReserved-reserved);
      item.reservedQty=0;
      item.dispatchedQty=shipped;
      state.stockMovements.unshift({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        at:Date.now(),kind:'finished',key,code:item.code||'',name:item.name||'',brand:item.brand||o.brand||'',unit:'CX',
        type:'SAIDA_PEDIDO',qty:shipped,reason:'Expedição · pedido '+String(o.number||o.id),
        user:changes.releasedBy||'Expedição',
        before:{physical,reserved:invReserved,blocked:Number(inv.blocked||0)},
        after:{physical:Number(inv.physical||0),reserved:Number(inv.reserved||0),blocked:Number(inv.blocked||0)}
      });
    }
    o.expedition.stockReleasedAt=Date.now();
    o.expedition.status='LIBERADO';
    o.expedition.readyForPickup=true;
  }
}

function upsertBy(list,incoming,keyFn){
  const arr=Array.isArray(list)?list:[];
  const key=keyFn(incoming);
  const idx=arr.findIndex(x=>keyFn(x)===key);
  if(idx>=0)arr[idx]={...arr[idx],...structuredClone(incoming)};
  else arr.unshift(structuredClone(incoming));
  return arr;
}

function applyFinance(state,body){
  const c=body.changes||{};
  state.finance={...(state.finance||{}),...pick(c,['approvedFreight','paymentStatus','invoiceStatus','creditStatus','notes'])};

  if(c.biPolicy&&typeof c.biPolicy==='object'){
    state.biPolicy={
      revenueRecognition:'DELIVERED',
      promisedDateRule:'REQUESTED_THEN_LOGISTICS',
      inFullRule:'DISPATCHED_VS_CONFIRMED',
      ...(state.biPolicy||{}),
      ...pick(c.biPolicy,['revenueRecognition','promisedDateRule','inFullRule'])
    };
  }

  if(c.marginRules&&typeof c.marginRules==='object'){
    const keys=['product_cost','icms','pis','cofins','ipi','st','freight','commission','contract'];
    const previous=state.marginRules||{};
    const next={};
    for(const key of keys){
      const value=String(c.marginRules[key]??previous[key]??'CUSTO').toUpperCase();
      if(!['CUSTO','MARGEM'].includes(value))throw Object.assign(new Error('INVALID_MARGIN_RULE'),{status:422,key});
      next[key]=value;
    }
    next.updatedAt=Date.now();
    state.marginRules=next;
  }

  if(c.monthlyTarget&&typeof c.monthlyTarget==='object'){
    const t=structuredClone(c.monthlyTarget);
    if(!/^\d{4}-\d{2}$/.test(String(t.period||'')))throw Object.assign(new Error('INVALID_TARGET_PERIOD'),{status:422});
    t.scope_type=String(t.scope_type||'COMPANY').toUpperCase();
    t.scope_id=String(t.scope_id||'ALL');
    t.target_revenue=Math.max(0,Number(t.target_revenue||0));
    t.target_boxes=Math.max(0,Number(t.target_boxes||0));
    t.target_margin=t.target_margin===''||t.target_margin==null?null:Number(t.target_margin);
    t.updatedAt=Date.now();
    state.monthlyTargets=upsertBy(state.monthlyTargets,t,x=>[x.period,x.scope_type,x.scope_id].join('|'));
  }

  if(c.financialFact&&typeof c.financialFact==='object'){
    const f=structuredClone(c.financialFact);
    if(!f.order_id)throw Object.assign(new Error('FINANCIAL_FACT_ORDER_REQUIRED'),{status:422});
    if(!getOrder(state,f.order_id))throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
    for(const k of ['taxes','discounts','returns','bonuses','commission','freight_allocated','icms','pis','cofins','ipi','st','contract'])f[k]=Math.max(0,Number(f[k]||0));
    f.invoice_number=String(f.invoice_number||'').trim();
    f.invoice_date=String(f.invoice_date||'').slice(0,10);
    f.invoice_status=String(f.invoice_status||'').trim().toUpperCase();
    f.invoice_key=String(f.invoice_key||'').replace(/\D/g,'').slice(0,44);
    if(f.invoice_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.invoice_date))throw Object.assign(new Error('INVALID_INVOICE_DATE'),{status:422});
    f.updatedAt=Date.now();
    state.financialFacts=upsertBy(state.financialFacts,f,x=>String(x.order_id||''));
  }

  if(c.skuCost&&typeof c.skuCost==='object'){
    const cost=structuredClone(c.skuCost);
    cost.sku=String(cost.sku||'').trim();
    cost.effective_from=String(cost.effective_from||'').slice(0,10);
    if(!cost.sku||!/^\d{4}-\d{2}-\d{2}$/.test(cost.effective_from))throw Object.assign(new Error('INVALID_SKU_COST'),{status:422});
    cost.unit_variable_cost=Math.max(0,Number(cost.unit_variable_cost||0));
    cost.updatedAt=Date.now();
    state.skuCosts=upsertBy(state.skuCosts,cost,x=>[x.sku,x.effective_from].join('|'));
  }
}

function applyCustomers(state,body){
  const c=body.changes||{};
  state.customers=Array.isArray(state.customers)?state.customers:[];
  if(c.customer&&typeof c.customer==='object'){
    const incoming=structuredClone(c.customer);
    const norm=v=>String(v||'').replace(/\D/g,'');
    let idx=state.customers.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx<0&&norm(incoming.cnpj)){
      const matches=state.customers
        .map((x,i)=>({x,i}))
        .filter(({x})=>norm(x.cnpj)===norm(incoming.cnpj))
        .sort((a,b)=>Number(b.x.updatedAt||b.x.createdAt||0)-Number(a.x.updatedAt||a.x.createdAt||0));
      if(matches.length)idx=matches[0].i;
    }
    if(idx>=0){
      incoming.id=state.customers[idx].id||incoming.id;
      state.customers[idx]={...state.customers[idx],...incoming};
    }else state.customers.unshift(incoming);
  }
}

function applyCarriers(state,body){
  const c=body.changes||{};
  state.carriers=Array.isArray(state.carriers)?state.carriers:[];
  if(c.carrier&&typeof c.carrier==='object'){
    const incoming=structuredClone(c.carrier);
    const idx=state.carriers.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx>=0)state.carriers[idx]=incoming;
    else state.carriers.unshift(incoming);
  }
  if(c.deleteId)state.carriers=state.carriers.filter(x=>String(x.id)!==String(c.deleteId));
}

function applyBases(state,body){
  const c=body.changes||{};
  if(!c.base||typeof c.base!=='object')throw Object.assign(new Error('BASE_REQUIRED'),{status:422});
  const incoming=structuredClone(c.base);
  const name=String(incoming.name||'').trim().toUpperCase();
  if(!name)throw Object.assign(new Error('BASE_NAME_REQUIRED'),{status:422});
  const previous=state.productionBases?.[name]||{};
  const capacityPerDay=Math.max(0,Number(incoming.capacityPerDay||0));
  const active=incoming.active!==false;
  state.productionBases=state.productionBases||{};
  state.productionBases[name]={...previous,capacityPerDay,active,updatedAt:Date.now()};
  state.productionCapacityHistory=Array.isArray(state.productionCapacityHistory)?state.productionCapacityHistory:[];
  if(Number(previous.capacityPerDay)!==capacityPerDay || previous.active!==active){
    state.productionCapacityHistory.unshift({
      id:'cap_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      base:name,
      effectiveDate:String(incoming.effectiveDate||new Date().toISOString().slice(0,10)),
      capacityPerDay,
      active,
      previousCapacityPerDay:Number(previous.capacityPerDay||0),
      at:Date.now()
    });
  }
}

function applyProductionRequest(state,body){
  const c=body.changes||{};
  state.productionRequests=Array.isArray(state.productionRequests)?state.productionRequests:[];
  state.inputInventory=state.inputInventory||{};
  state.inventory=state.inventory||{};
  state.stockMovements=Array.isArray(state.stockMovements)?state.stockMovements:[];

  if(c.request&&typeof c.request==='object'){
    const incoming=structuredClone(c.request);
    const idx=state.productionRequests.findIndex(r=>String(r.id)===String(incoming.id));
    if(idx>=0)state.productionRequests[idx]=incoming;
    else state.productionRequests.unshift(incoming);
  }

  if(c.complete&&typeof c.complete==='object'){
    const done=c.complete;
    const req=state.productionRequests.find(r=>String(r.id)===String(done.requestId));
    if(!req)throw Object.assign(new Error('PRODUCTION_REQUEST_NOT_FOUND'),{status:404});
    if(req.execution?.status==='CONCLUIDA')throw Object.assign(new Error('PRODUCTION_ALREADY_COMPLETED'),{status:422});
    const snap=req.snapshot||req;
    const actualItems=Array.isArray(done.items)&&done.items.length?done.items:(snap.items||[]).map(i=>({
      code:i.product?.code||i.code||'',name:i.product?.name||i.name||'',brand:i.product?.brand||i.brand||'',
      qty:Number(i.qty||0),unit:i.product?.unit||i.unit||'CX'
    }));
    const factorBySku=new Map(actualItems.map(i=>[String(i.code||i.name),Number(i.qty||0)]));
    const plannedBySku=new Map((snap.items||[]).map(i=>[String(i.product?.code||i.code||i.name),Number(i.qty||0)]));
    const materials=(snap.materials||[]).map(m=>{
      let ratio=1;
      if((snap.items||[]).length===1){
        const sku=String(snap.items[0].product?.code||snap.items[0].code||snap.items[0].name);
        const planned=plannedBySku.get(sku)||0,actual=factorBySku.get(sku)??planned;
        ratio=planned>0?actual/planned:1;
      }
      return {...m,actualRequired:Number(m.required||0)*ratio};
    });
    for(const m of materials){
      const key=String(m.code||m.name||'');
      const inv=state.inputInventory[key]||Object.values(state.inputInventory).find(x=>String(x?.code||'')===String(m.code||''))||null;
      if(!inv)throw Object.assign(new Error('PRODUCTION_INPUT_NOT_FOUND'),{status:422,item:m.code||m.name});
      const before=Number(inv.physical||0),consumed=Math.max(0,Number(m.actualRequired||0));
      if(before<consumed)throw Object.assign(new Error('PRODUCTION_INPUT_INSUFFICIENT'),{status:422,item:m.code||m.name,required:consumed,available:before});
      inv.physical=before-consumed;
      state.stockMovements.unshift({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),at:Number(done.at||Date.now()),kind:'input',key,
        code:m.code||'',name:m.name||'',unit:m.unit||'',type:'CONSUMO_PRODUCAO',qty:consumed,lot:String(done.lot||''),
        reason:'Produção '+String(req.number||req.id),user:String(done.user||'Produção'),
        before:{physical:before},after:{physical:Number(inv.physical||0)}
      });
    }
    for(const item of actualItems){
      const qty=Math.max(0,Number(item.qty||0)); if(!(qty>0))continue;
      const [key,inv]=findFinishedInventory(state,item,item.brand||snap.brand||req.brand||'');
      const before=Number(inv.physical||0); inv.physical=before+qty;
      state.stockMovements.unshift({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),at:Number(done.at||Date.now()),kind:'finished',key,
        code:item.code||'',name:item.name||'',brand:item.brand||'',unit:item.unit||'CX',type:'ENTRADA_PRODUCAO',qty,lot:String(done.lot||''),
        reason:'Produção '+String(req.number||req.id),user:String(done.user||'Produção'),
        before:{physical:before},after:{physical:Number(inv.physical||0)}
      });
    }
    for(const loss of Array.isArray(done.losses)?done.losses:[]){
      const kind=String(loss.kind||'input').toLowerCase()==='finished'?'finished':'input';
      const key=String(loss.code||loss.name||''),qty=Math.max(0,Number(loss.qty||0)); if(!(qty>0))continue;
      const collection=kind==='finished'?state.inventory:state.inputInventory;
      const inv=collection[key]||Object.values(collection).find(x=>String(x?.code||'')===String(loss.code||''))||null;
      if(!inv)throw Object.assign(new Error('PRODUCTION_LOSS_ITEM_NOT_FOUND'),{status:422,item:loss.code||loss.name});
      const before=Number(inv.physical||0);
      if(before<qty)throw Object.assign(new Error('PRODUCTION_LOSS_EXCEEDS_STOCK'),{status:422,item:loss.code||loss.name,available:before,loss:qty});
      inv.physical=before-qty;
      state.stockMovements.unshift({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),at:Number(done.at||Date.now()),kind,
        key,code:loss.code||'',name:loss.name||'',unit:loss.unit||'',type:'PERDA_PRODUCAO',qty,lot:String(done.lot||''),
        reason:String(loss.reason||('Perda na produção '+String(req.number||req.id))),user:String(done.user||'Produção'),
        before:{physical:before},after:{physical:Number(inv.physical||0)}
      });
    }
    req.execution={
      status:'CONCLUIDA',completedAt:Number(done.at||Date.now()),completedBy:String(done.user||'Produção'),
      lot:String(done.lot||''),items:structuredClone(actualItems),materials:structuredClone(materials),
      losses:structuredClone(Array.isArray(done.losses)?done.losses:[]),notes:String(done.notes||'')
    };
  }
}


function freightRequest(state,id){
  state.freightRequests=Array.isArray(state.freightRequests)?state.freightRequests:[];
  return state.freightRequests.find(x=>String(x.id)===String(id));
}

function applyFreightCommercial(state,body){
  state.freightRequests=Array.isArray(state.freightRequests)?state.freightRequests:[];
  const c=body.changes||{};
  if(c.request&&typeof c.request==='object'){
    const src=structuredClone(c.request);
    const id=String(src.id||('frq_'+Date.now())).trim();
    if(state.freightRequests.some(x=>String(x.id)===id))throw Object.assign(new Error('FREIGHT_REQUEST_ALREADY_EXISTS'),{status:409});
    const at=Number(src.requestedAt||Date.now()),by=String(src.requestedBy||'Comercial');
    const request={
      id,status:'SOLICITADA',requestedAt:at,requestedBy:by,
      client:String(src.client||'').trim(),reference:String(src.reference||'').trim(),
      origin:String(src.origin||'').trim(),destination:String(src.destination||'').trim(),
      cargo:String(src.cargo||'').trim(),quantity:String(src.quantity||'').trim(),
      requestedDate:String(src.requestedDate||'').slice(0,10),notes:String(src.notes||'').trim(),
      logisticsViewedAt:null,respondedAt:null,respondedBy:'',commercialViewedAt:null,quotes:[],
      history:[{at,type:'SOLICITADA',by,notes:String(src.notes||'').trim()}]
    };
    if(!request.origin||!request.destination)throw Object.assign(new Error('FREIGHT_ROUTE_REQUIRED'),{status:422});
    state.freightRequests.unshift(request);
    return;
  }
  const r=freightRequest(state,body.requestId||c.requestId);
  if(!r)throw Object.assign(new Error('FREIGHT_REQUEST_NOT_FOUND'),{status:404});
  if(c.viewed&&r.status==='RESPONDIDA'&&!r.commercialViewedAt){
    r.commercialViewedAt=Number(c.viewed.at||Date.now());
    r.commercialViewedBy=String(c.viewed.by||'Comercial');
    r.history.unshift({at:r.commercialViewedAt,type:'VISUALIZADA_COMERCIAL',by:r.commercialViewedBy});
  }
}

function applyFreightLogistics(state,body){
  const c=body.changes||{},r=freightRequest(state,body.requestId||c.requestId);
  if(!r)throw Object.assign(new Error('FREIGHT_REQUEST_NOT_FOUND'),{status:404});
  if(c.opened&&!r.logisticsViewedAt){
    r.logisticsViewedAt=Number(c.opened.at||Date.now());
    r.logisticsViewedBy=String(c.opened.by||'Logística');
    if(r.status==='SOLICITADA')r.status='EM_COTACAO';
    r.history.unshift({at:r.logisticsViewedAt,type:'EM_COTACAO',by:r.logisticsViewedBy});
  }
  if(c.response&&typeof c.response==='object'){
    const q=(Array.isArray(c.response.quotes)?c.response.quotes:[]).map((x,i)=>({
      id:String(x.id||('frqo_'+Date.now()+'_'+i)),
      provider:String(x.provider||'').trim(),value:Math.max(0,Number(x.value||0)),
      transitDays:Math.max(0,Number(x.transitDays||0)),pickupEstimate:String(x.pickupEstimate||'').slice(0,10),
      notes:String(x.notes||'').trim()
    })).filter(x=>x.provider&&x.value>0);
    if(!q.length)throw Object.assign(new Error('FREIGHT_QUOTE_OPTION_REQUIRED'),{status:422});
    const at=Number(c.response.respondedAt||Date.now()),by=String(c.response.respondedBy||'Logística');
    r.status='RESPONDIDA';r.respondedAt=at;r.respondedBy=by;r.commercialViewedAt=null;
    r.quotes=q;r.responseNotes=String(c.response.notes||'').trim();
    r.history.unshift({at,type:'RESPONDIDA',by,count:q.length});
  }
}

function applyInputs(state,body){
  const c=body.changes||{};
  state.inputCatalog=Array.isArray(state.inputCatalog)?state.inputCatalog:[];
  const keyOf=x=>String(x.brand||'GERAL').trim().toUpperCase()+'::'+String(x.code||'').trim().toUpperCase();
  if(Array.isArray(c.seed)){
    for(const raw of c.seed){
      const incoming=structuredClone(raw),key=keyOf(incoming);
      if(!incoming.code)continue;
      if(!state.inputCatalog.some(x=>keyOf(x)===key)){
        state.inputCatalog.push({
          id:String(incoming.id||('inp_'+normKey(incoming.brand)+'_'+normKey(incoming.code))),
          code:String(incoming.code),name:String(incoming.name||incoming.desc||incoming.code),unit:String(incoming.unit||''),
          group:String(incoming.group||'Outros'),brand:String(incoming.brand||'Geral'),price:Math.max(0,Number(incoming.price??incoming.preco??0)),
          source:String(incoming.source||'SIMULADOR_MAE'),active:incoming.active!==false,createdAt:Date.now(),updatedAt:Date.now()
        });
      }
    }
  }
  if(c.item&&typeof c.item==='object'){
    const incoming=structuredClone(c.item);
    incoming.code=String(incoming.code||'').trim();incoming.brand=String(incoming.brand||'Geral').trim();
    if(!incoming.code||!String(incoming.name||incoming.desc||'').trim())throw Object.assign(new Error('INPUT_FIELDS_REQUIRED'),{status:422});
    incoming.name=String(incoming.name||incoming.desc).trim();incoming.unit=String(incoming.unit||'').trim().toUpperCase();
    incoming.group=String(incoming.group||'Outros').trim();incoming.price=Math.max(0,Number(incoming.price||0));
    incoming.updatedAt=Date.now();incoming.active=incoming.active!==false;
    const key=keyOf(incoming),idx=state.inputCatalog.findIndex(x=>keyOf(x)===key);
    if(idx>=0)state.inputCatalog[idx]={...state.inputCatalog[idx],...incoming};
    else state.inputCatalog.unshift({id:String(incoming.id||('inp_'+Date.now())),source:'FOCADO',createdAt:Date.now(),...incoming});
  }
  if(c.deleteId){
    const idx=state.inputCatalog.findIndex(x=>String(x.id)===String(c.deleteId));
    if(idx>=0)state.inputCatalog[idx]={...state.inputCatalog[idx],active:false,updatedAt:Date.now()};
  }
}

const DOMAIN_APPLIERS=Object.freeze({
  COMERCIAL:applyCommercial,
  PCP:applyPCP,
  PRODUCAO:applyProduction,
  ESTOQUE:applyInventory,
  LOGISTICA:applyLogistics,
  COMPRAS:applyPurchases,
  FINANCEIRO:applyFinance,
  SOLICITACAO_PRODUCAO:applyProductionRequest,
  TRANSPORTADORAS:applyCarriers,
  CLIENTES:applyCustomers,
  EXPEDICAO:applyExpedition,
  BASES:applyBases,
  COTACAO_FRETE_COMERCIAL:applyFreightCommercial,
  COTACAO_FRETE_LOGISTICA:applyFreightLogistics,
  INSUMOS:applyInputs
});

export function applyDomain(domain,state,body){
  const key=String(domain||'').toUpperCase();
  const apply=DOMAIN_APPLIERS[key];
  if(!apply)throw Object.assign(new Error('INVALID_DOMAIN'),{status:400});
  apply(state,body);
  return state;
}

export function validateTransition(order){
  switch(order?.status){
    case 'COMERCIAL':
      if(!order.client||!(order.items||[]).length)return 'Pedido incompleto para finalizar Comercial.';
      if(!String(order.email||'').trim())return 'Informe o e-mail do cliente.';
      if(!order.requestedDeliveryDate)return 'Informe a data de entrega solicitada pelo cliente.';
      if(!order.paymentTerms)return 'Informe a condição de pagamento.';
      if(!(Number(order.logisticsBudget)>0))return 'Informe o orçamento de logística.';
      if((order.salesChannel||'REPRESENTANTE')==='REPRESENTANTE'&&!order.representative)return 'Informe o representante.';
      if(['VENDAS_INTERNAS','BONIFICACAO'].includes(order.salesChannel)&&!String(order.salesJustification||'').trim())return 'Informe a justificativa da venda.';
      return null;
    case 'PCP':
      for(const item of order.items||[]){
        if(!item.deliveryBase)return 'Defina a base de retirada de todos os itens.';
        const qty=Math.max(0,Number(item.qty||0));
        const reserved=Math.max(0,Number(item.reservedQty||0));
        const cut=Math.max(0,Number(item.cutQty||0));
        const missing=Math.max(0,qty-reserved-cut);
        if(missing>0){
          if(item.pcpBalanceDecision==='AGUARDAR'&&!item.pcpAvailabilityDate)return 'Há item sem previsão de estoque disponível.';
          return 'Há item ainda não atendido. Reserve o saldo ou libere com corte.';
        }
      }
      return null;
    case 'LOGISTICA':
      if(!order.logistics?.deliveryDate)return 'Registre a data de entrega prevista.';
      if(!order.logistics?.deliveryConfirmed)return 'Confirme a entrega antes de concluir o pedido.';
      if(!order.logistics?.actualDeliveryDate)return 'Registre a data real da entrega.';
      if(order.logistics?.deliveredOnTime===false&&!String(order.logistics?.deliveryDelayReason||'').trim())return 'Informe o motivo do não cumprimento do prazo.';
      return null;
    default:
      return 'Etapa não possui transição automática.';
  }
}

export function transitionRule(status){
  return FLOW[String(status||'')]||null;
}

export function applyTransitionSideEffects(order,from){
  if(from==='PCP'){
    for(const item of order.items||[]){
      const cut=Math.max(0,Number(item.cutQty||0));
      if(cut>0){
        if(item.originalRequestedQty==null)item.originalRequestedQty=Number(item.qty||0);
        item.qty=Math.max(0,Number(item.qty||0)-cut);
      }
    }
  }
  return order;
}
