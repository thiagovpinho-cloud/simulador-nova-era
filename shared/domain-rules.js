export const RULES_VERSION='2026.08.27.2';

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
  CLIENTES:'commercial.write'
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
  const o=getOrder(state,body.orderId);
  if(!o)throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  Object.assign(o,pick(body.changes,[
    'client','cnpj','city','state','orderDate','suggestedPickupDate','freightType','observation','brand',
    'representative','salesChannel','salesJustification','requestedDeliveryDate','paymentTerms',
    'logisticsBudget','deliveryAddress','email','phone','cep','bairro'
  ]));
  if(Array.isArray(body.changes?.items)){
    const map=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId),i]));
    for(const incoming of body.changes.items){
      const item=map.get(String(incoming.id||incoming.code||incoming.productId||''));
      if(item)Object.assign(item,pick(incoming,['qty','price','ipi','st','finalPrice','name','code','productId']));
    }
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
  if(c.inventory&&typeof c.inventory==='object')state.inventory=c.inventory;
  if(c.inputInventory&&typeof c.inputInventory==='object')state.inputInventory=c.inputInventory;
  if(Array.isArray(c.stockMovements))state.stockMovements=c.stockMovements;
  if(Array.isArray(c.inventoryCounts))state.inventoryCounts=c.inventoryCounts;
}

function applyPurchases(state,body){
  const c=body.changes||{};
  if(c.reorder&&typeof c.reorder==='object')state.purchasePlanning={...(state.purchasePlanning||{}),...c.reorder};
}

function applyFinance(state,body){
  const c=body.changes||{};
  state.finance={...(state.finance||{}),...pick(c,['approvedFreight','paymentStatus','invoiceStatus','creditStatus','notes'])};
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

function applyProductionRequest(state,body){
  const c=body.changes||{};
  state.productionRequests=Array.isArray(state.productionRequests)?state.productionRequests:[];
  if(c.request&&typeof c.request==='object'){
    const incoming=structuredClone(c.request);
    const idx=state.productionRequests.findIndex(r=>String(r.id)===String(incoming.id));
    if(idx>=0)state.productionRequests[idx]=incoming;
    else state.productionRequests.unshift(incoming);
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
  CLIENTES:applyCustomers
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
