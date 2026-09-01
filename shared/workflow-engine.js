export const WORKFLOW_VERSION='2026.09.01.1';

const n=v=>Math.max(0,Number(v||0));
const keyOf=i=>String(i?.code||i?.productId||i?.name||'');
const available=inv=>Math.max(0,n(inv?.physical)-n(inv?.reserved)-n(inv?.blocked));

function findInventory(state,item){
  const keys=[item?.code,item?.productId,item?.name].map(v=>String(v||'')).filter(Boolean);
  for(const key of keys)if(state?.inventory?.[key])return state.inventory[key];
  return Object.values(state?.inventory||{}).find(x=>String(x?.code||'')===String(item?.code||''))||null;
}

function linkedProduction(state,order){
  const oid=String(order?.id||'');
  return (state?.productionRequests||[]).filter(r=>{
    if(String(r?.orderId||r?.sourceOrderId||'')===oid)return true;
    const ids=r?.orderIds||r?.sourceOrderIds||[];
    if(Array.isArray(ids)&&ids.map(String).includes(oid))return true;
    const links=r?.links||r?.causalLinks||[];
    return Array.isArray(links)&&links.some(l=>String(l?.orderId||'')===oid);
  });
}

function linkedPurchases(state,order,production){
  const oid=String(order?.id||'');
  const prodIds=new Set((production||[]).map(r=>String(r?.id||'')));
  return (state?.purchaseRequests||[]).filter(r=>{
    if(String(r?.orderId||r?.sourceOrderId||'')===oid)return true;
    if(prodIds.has(String(r?.productionRequestId||r?.sourceProductionRequestId||'')))return true;
    const links=r?.links||r?.causalLinks||[];
    return Array.isArray(links)&&links.some(l=>String(l?.orderId||'')===oid||prodIds.has(String(l?.productionRequestId||'')));
  });
}

function itemCoverage(state,item){
  const inv=findInventory(state,item);
  const qty=n(item?.qty),reserved=n(item?.reservedQty),cut=n(item?.cutQty);
  const open=Math.max(0,qty-reserved-cut);
  const free=available(inv);
  const coverNow=Math.min(open,free);
  return {
    key:keyOf(item),qty,reserved,cut,open,free,
    coverNow,
    uncoveredAfterFree:Math.max(0,open-coverNow),
    covered:open===0
  };
}

function status(label,blockers=[],extra={}){
  return {status:label,blockers:[...blockers],...extra};
}

export function computeOrderWorkflow(state,order){
  if(!order)return null;
  const cover=(order.items||[]).map(i=>itemCoverage(state,i));
  const uncovered=cover.filter(x=>x.open>0);
  const missingAfterStock=cover.filter(x=>x.uncoveredAfterFree>0);
  const production=linkedProduction(state,order);
  const purchases=linkedPurchases(state,order,production);
  const activeProduction=production.filter(r=>r?.execution?.status!=='CONCLUIDA'&&!['CANCELADA','CANCELADO'].includes(String(r?.status||'')));
  const completedProduction=production.filter(r=>r?.execution?.status==='CONCLUIDA');
  const openPurchases=purchases.filter(r=>!['RECEBIDO','CANCELADO'].includes(String(r?.status||'')));
  const receivedPurchases=purchases.filter(r=>String(r?.status||'')==='RECEBIDO');
  const financialFact=(state?.financialFacts||[]).find(f=>String(f?.order_id||'')===String(order.id));
  const delivered=order.status==='ENTREGUE'||Boolean(order.logistics?.deliveryConfirmed);
  const dispatched=Boolean(order.expedition?.stockReleasedAt||order.expedition?.readyForPickup);
  const fullyCovered=uncovered.length===0;

  const workflow={
    version:WORKFLOW_VERSION,
    orderId:String(order.id||''),
    macroStatus:String(order.status||''),
    commercial:status(order.status==='COMERCIAL'?'PENDENTE':'CONCLUIDO',order.status==='COMERCIAL'?['COMMERCIAL_NOT_APPROVED']:[]),
    inventory:status(
      fullyCovered?'COBERTO':(missingAfterStock.length?'INSUFICIENTE':'DISPONIVEL_PARA_RESERVA'),
      missingAfterStock.map(x=>'STOCK_SHORTAGE:'+x.key),
      {coverage:cover}
    ),
    production:status(
      missingAfterStock.length===0?'NAO_NECESSARIO':
        activeProduction.length?'EM_ANDAMENTO':
        completedProduction.length?'CONCLUIDO':
        'NECESSARIO',
      missingAfterStock.length&&!activeProduction.length&&!completedProduction.length?['PRODUCTION_REQUEST_MISSING']:[],
      {requestIds:production.map(r=>String(r.id||''))}
    ),
    purchases:status(
      !production.length?'NAO_APLICAVEL':
        openPurchases.length?'EM_ANDAMENTO':
        purchases.length&&receivedPurchases.length===purchases.length?'CONCLUIDO':
        'SEM_DEMANDA_VINCULADA',
      production.some(r=>String(r?.materialStatus||'')==='COMPRAR')&&!purchases.length?['PURCHASE_LINK_MISSING']:[],
      {requestIds:purchases.map(r=>String(r.id||''))}
    ),
    expedition:status(
      delivered||dispatched?'CONCLUIDO':
        fullyCovered&&order.status==='LOGISTICA'?'PRONTO_PARA_SEPARAR':
        'AGUARDANDO',
      fullyCovered?[]:['ORDER_NOT_FULLY_COVERED']
    ),
    logistics:status(
      delivered?'CONCLUIDO':
        order.status==='LOGISTICA'?'EM_ANDAMENTO':
        'AGUARDANDO',
      order.status==='LOGISTICA'&&!order.logistics?.carrierId?['CARRIER_MISSING']:[]
    ),
    finance:status(
      financialFact?'REGISTRADO':
        delivered?'PENDENTE':
        'AGUARDANDO_ENTREGA',
      delivered&&!financialFact?['FINANCIAL_FACT_MISSING']:[]
    )
  };

  workflow.nextAction=computeNextAction(state,order,workflow);
  workflow.causal=buildCausalLinks(state,order,production,purchases);
  return workflow;
}

export function computeNextAction(state,order,workflow=computeOrderWorkflow(state,order)){
  if(!workflow)return null;

  if(order.status==='COMERCIAL'){
    return {area:'COMERCIAL',action:'CONCLUIR_PEDIDO',reason:'Pedido ainda não foi liberado pelo Comercial.',entityId:String(order.id)};
  }

  const reservable=workflow.inventory.coverage?.find(x=>x.open>0&&x.free>0);
  if(reservable){
    return {area:'PCP',action:'RESERVAR_ESTOQUE',reason:'Há saldo físico disponível ainda não reservado para o pedido.',entityId:String(order.id),sku:reservable.key};
  }

  if(workflow.production.status==='NECESSARIO'){
    return {area:'PCP',action:'GERAR_NECESSIDADE_PRODUCAO',reason:'A demanda do pedido não está coberta por estoque livre.',entityId:String(order.id)};
  }

  if(workflow.purchases.blockers.includes('PURCHASE_LINK_MISSING')){
    return {area:'COMPRAS',action:'VINCULAR_OU_CRIAR_COMPRA',reason:'Há produção dependente de compra sem solicitação vinculada ao pedido/OP.',entityId:String(order.id)};
  }

  if(workflow.purchases.status==='EM_ANDAMENTO'){
    return {area:'COMPRAS',action:'ACOMPANHAR_RECEBIMENTO',reason:'O pedido depende de compra ainda não recebida.',entityId:String(order.id)};
  }

  if(workflow.production.status==='EM_ANDAMENTO'){
    return {area:'PRODUCAO',action:'CONCLUIR_PRODUCAO',reason:'Existe produção vinculada ainda não concluída.',entityId:String(order.id)};
  }

  if(workflow.inventory.status==='COBERTO'&&order.status==='PCP'){
    return {area:'PCP',action:'LIBERAR_PARA_LOGISTICA',reason:'Todos os itens estão cobertos e o pedido pode avançar.',entityId:String(order.id)};
  }

  if(workflow.expedition.status==='PRONTO_PARA_SEPARAR'){
    return {area:'EXPEDICAO',action:'SEPARAR_E_LIBERAR',reason:'Pedido coberto e liberado para preparação física.',entityId:String(order.id)};
  }

  if(order.status==='LOGISTICA'&&!order.logistics?.carrierId){
    return {area:'LOGISTICA',action:'DEFINIR_TRANSPORTADORA',reason:'Pedido em Logística ainda sem transportadora.',entityId:String(order.id)};
  }

  if(order.status==='LOGISTICA'&&!order.logistics?.deliveryConfirmed){
    return {area:'LOGISTICA',action:'ACOMPANHAR_ENTREGA',reason:'Pedido em fluxo logístico e entrega ainda não confirmada.',entityId:String(order.id)};
  }

  if(workflow.finance.status==='PENDENTE'){
    return {area:'FINANCEIRO',action:'REGISTRAR_FATO_FINANCEIRO',reason:'Pedido entregue sem fato financeiro vinculado.',entityId:String(order.id)};
  }

  return {area:null,action:'SEM_PENDENCIA_CRITICA',reason:'Nenhuma próxima ação determinística foi identificada.',entityId:String(order.id)};
}

export function buildCausalLinks(state,order,production=linkedProduction(state,order),purchases=linkedPurchases(state,order,production)){
  const orderId=String(order?.id||'');
  const links=[];
  for(const p of production){
    links.push({type:'ORDER_TO_PRODUCTION',orderId,productionRequestId:String(p.id||'')});
  }
  for(const b of purchases){
    links.push({
      type:'ORDER_TO_PURCHASE',
      orderId,
      purchaseRequestId:String(b.id||''),
      productionRequestId:String(b.productionRequestId||b.sourceProductionRequestId||'')
    });
  }
  return links;
}

export function computeWorkQueue(state){
  return (state?.orders||[])
    .map(order=>({order,workflow:computeOrderWorkflow(state,order)}))
    .filter(x=>x.workflow?.nextAction?.action!=='SEM_PENDENCIA_CRITICA')
    .map(x=>({
      orderId:String(x.order.id||''),
      number:String(x.order.number||x.order.id||''),
      macroStatus:String(x.order.status||''),
      ...x.workflow.nextAction
    }));
}
