function itemKey(item){
  const p=item?.product||item||{};
  return String(p.code||p.id||p.productId||p.name||'').trim();
}

function orderItemKey(item){
  return String(item?.code||item?.productId||item?.name||'').trim();
}

function unique(values){return [...new Set(values.filter(Boolean).map(String))]}

export function enrichPcpProductionRequest(state,request){
  const incoming=structuredClone(request||{});
  if(String(incoming.source||'')!=='PCP_CONSOLIDADO')return incoming;

  const productKeys=new Set((incoming.items||[]).map(itemKey).filter(Boolean));
  const sourceOrders=(state.orders||[]).filter(order=>
    order.status==='PCP'&&(order.items||[]).some(item=>productKeys.has(orderItemKey(item)))
  );

  incoming.sourceType='PCP_CONSOLIDADO';
  incoming.sourceOrderIds=unique(sourceOrders.map(o=>o.id));
  incoming.sourceOrderNumbers=unique(sourceOrders.map(o=>o.number));
  incoming.sourceProducts=unique([...productKeys]);

  const itemSignature=(incoming.items||[]).map(item=>{
    const p=item.product||item||{};
    return [itemKey(item),Number(item.qty||0)].join(':');
  }).sort().join(',');
  incoming.sourceFingerprint=[
    'PCP',
    incoming.sourceOrderIds.slice().sort().join(','),
    String(incoming.base||''),
    itemSignature
  ].join('|');
  incoming.traceabilityAt=Number(incoming.traceabilityAt||Date.now());
  return incoming;
}

export function assertNoDuplicatePcpProductionRequest(state,incoming){
  if(!incoming?.sourceFingerprint)return null;
  const duplicate=(state.productionRequests||[]).find(r=>
    String(r.id)!==String(incoming.id)&&
    String(r.sourceFingerprint||'')===String(incoming.sourceFingerprint)
  );
  if(duplicate){
    throw Object.assign(new Error('PRODUCTION_REQUEST_ALREADY_EXISTS'),{
      status:409,
      existingId:duplicate.id,
      existingNumber:duplicate.number
    });
  }
  return null;
}
