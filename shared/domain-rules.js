export const RULES_VERSION='2026.08.28.4';

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
  BASES:'workspace.write'
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

function applyCommercial(state,body){
  state.orders=Array.isArray(state.orders)?state.orders:[];
  const changes=body.changes||{};

  if(changes.createOrder&&typeof changes.createOrder==='object'){
    const src=structuredClone(changes.createOrder);
    const id=String(src.id||src.number||'').trim();
    if(!id)throw Object.assign(new Error('ORDER_ID_REQUIRED'),{status:422});
    if(state.orders.some(o=>String(o.id||o.number)===id))throw Object.assign(new Error('ORDER_ALREADY_EXISTS'),{status:409});
    const order={
      id,
      number:String(src.number||id),
      status:'COMERCIAL',
      createdAt:Number(src.createdAt||Date.now()),
      brand:String(src.brand||'Nova Era'),
      client:String(src.client||''),cnpj:String(src.cnpj||''),representative:String(src.representative||''),
      salesChannel:String(src.salesChannel||'REPRESENTANTE'),salesJustification:String(src.salesJustification||''),
      city:String(src.city||''),uf:String(src.uf||src.state||''),cep:String(src.cep||''),bairro:String(src.bairro||''),
      email:String(src.email||''),phone:String(src.phone||''),orderDate:String(src.orderDate||''),
      requestedDeliveryDate:String(src.requestedDeliveryDate||''),suggestedPickup:String(src.suggestedPickup||src.suggestedPickupDate||''),
      freightType:String(src.freightType||'CIF'),paymentTerms:String(src.paymentTerms||''),
      logisticsBudget:Number(src.logisticsBudget||0),deliveryAddress:String(src.deliveryAddress||''),notes:String(src.notes||''),
      commercial:{completedAt:null,completedBy:null},
      pcp:{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false},
      logistics:{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''},
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

  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  Object.assign(o,pick(changes,[
    'client','cnpj','city','state','uf','orderDate','suggestedPickupDate','suggestedPickup','freightType','observation','notes','brand',
    'representative','salesChannel','salesJustification','requestedDeliveryDate','paymentTerms',
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
    const keys=[item.code,item.productId,item.name].map(v=>String(v||'')).filter(Boolean);
    for(const key of keys)if(state.inventory[key])return [key,state.inventory[key]];
    const found=Object.entries(state.inventory).find(([,v])=>String(v?.code||'')===String(item.code||''));
    if(found)return found;
    const key=String(item.code||item.productId||item.name||'');
    const inv={code:item.code||'',name:item.name||'',unit:'CX',physical:0,reserved:0,blocked:0};
    state.inventory[key]=inv;
    return [key,inv];
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
        at:Date.now(),kind:'finished',key:invKey,code:item.code||'',name:item.name||'',unit:'CX',
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
    const key=String(m.key||m.code||'').trim();
    if(!key)throw Object.assign(new Error('INVENTORY_ITEM_REQUIRED'),{status:422});
    let target=collection[key]||Object.values(collection).find(x=>String(x?.code||'')===String(m.code||''))||null;
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
      reason:String(m.reason||''),note:String(m.note||''),user:String(m.user||'Sistema'),before,after
    });
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
      const keys=[item.code,item.productId,item.name].map(v=>String(v||'')).filter(Boolean);
      let found=null;
      for(const key of keys)if(state.inventory[key]){found=[key,state.inventory[key]];break}
      if(!found)found=Object.entries(state.inventory).find(([,v])=>String(v?.code||'')===String(item.code||''));
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
        at:Date.now(),kind:'finished',key,code:item.code||'',name:item.name||'',unit:'CX',
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
    const idx=state.customers.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx>=0)state.customers[idx]=incoming;
    else state.customers.unshift(incoming);
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
      const key=String(item.code||item.name||'');
      const inv=state.inventory[key]||{code:item.code||'',name:item.name||'',brand:item.brand||'',unit:item.unit||'CX',physical:0,reserved:0,blocked:0};
      if(!state.inventory[key])state.inventory[key]=inv;
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
  BASES:applyBases
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
