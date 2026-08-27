import { applyCors } from './_lib/http.js';
import { requireSession } from './_lib/auth.js';
import { readWorkspace, writeWorkspace } from './_lib/store.js';
import { db } from './_lib/db.js';

const WORKSPACE='default';

const DOMAIN_PERMISSION={
  COMERCIAL:'orders.write',
  PCP:'pcp.write',
  PRODUCAO:'production.write',
  ESTOQUE:'inventory.write',
  LOGISTICA:'logistics.write',
  COMPRAS:'purchases.write',
  FINANCEIRO:'finance.write',
  SOLICITACAO_PRODUCAO:'pcp.write'
};

function pick(source,keys){
  const out={};
  for(const k of keys) if(Object.prototype.hasOwnProperty.call(source||{},k)) out[k]=source[k];
  return out;
}

function getOrder(state,id){
  const orders=Array.isArray(state.orders)?state.orders:[];
  return orders.find(o=>String(o.id)===String(id));
}

function applyCommercial(state,body){
  const o=getOrder(state,body.orderId);
  if(!o) throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  Object.assign(o,pick(body.changes,['client','cnpj','city','state','orderDate','suggestedPickupDate','freightType','observation','brand']));
  if(Array.isArray(body.changes?.items)){
    const byId=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId),i]));
    for(const incoming of body.changes.items){
      const key=String(incoming.id||incoming.code||incoming.productId||'');
      const item=byId.get(key);
      if(item) Object.assign(item,pick(incoming,['qty','price','ipi','st','finalPrice','name','code','productId']));
    }
  }
}

function applyPCP(state,body){
  const o=getOrder(state,body.orderId);
  if(!o) throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  o.pcp=o.pcp||{};
  Object.assign(o.pcp,pick(body.changes?.pcp||body.changes,['notes','logisticsPreRelease','logisticsAvailabilityDate','logisticsPreReleaseAt']));
  state.inventory=state.inventory||{};
  state.stockMovements=Array.isArray(state.stockMovements)?state.stockMovements:[];
  const byId=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId),i]));
  const findInventory=item=>{
    const keys=[item.code,item.productId,item.name].map(v=>String(v||'')).filter(Boolean);
    for(const k of keys) if(state.inventory[k]) return [k,state.inventory[k]];
    const found=Object.entries(state.inventory).find(([,v])=>String(v?.code||'')===String(item.code||''));
    if(found)return found;
    const key=String(item.code||item.productId||item.name||'');
    const inv={code:item.code||'',name:item.name||'',unit:'CX',physical:0,reserved:0,blocked:0};
    state.inventory[key]=inv;return [key,inv];
  };
  for(const incoming of body.changes?.items||[]){
    const key=String(incoming.id||incoming.code||incoming.productId||'');
    const item=byId.get(key);if(!item)continue;
    const [invKey,inv]=findInventory(item);
    const oldReserved=Math.max(0,Number(item.reservedQty||0));
    const desired=Math.max(0,Number(incoming.reservedQty||0));
    const free=Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0));
    if(desired>oldReserved+free){
      throw Object.assign(new Error('INSUFFICIENT_STOCK'),{status:422});
    }
    const beforeReserved=Math.max(0,Number(inv.reserved||0));
    inv.reserved=Math.max(0,beforeReserved-oldReserved+desired);
    if(desired!==oldReserved){
      state.stockMovements.unshift({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),at:Date.now(),kind:'finished',key:invKey,
        code:item.code||'',name:item.name||'',unit:'CX',type:desired>oldReserved?'RESERVA':'LIBERACAO_RESERVA',
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
    o.events.unshift({at:Date.now(),text:'Logística pré-liberada com ressalva de disponibilidade em '+String(o.pcp.logisticsAvailabilityDate||''),user:'PCP'});
  }
}

function applyProduction(state,body){
  const o=getOrder(state,body.orderId);
  if(!o) throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  if(Array.isArray(body.changes?.items)){
    const byId=new Map((o.items||[]).map(i=>[String(i.id||i.code||i.productId),i]));
    for(const incoming of body.changes.items){
      const key=String(incoming.id||incoming.code||incoming.productId||'');
      const item=byId.get(key);
      if(item) Object.assign(item,pick(incoming,['productionConsumed','productionCompleted','productionRequirements','productionActualQty','productionLot']));
    }
  }
}

function applyLogistics(state,body){
  const o=getOrder(state,body.orderId);
  if(!o) throw Object.assign(new Error('ORDER_NOT_FOUND'),{status:404});
  o.logistics=o.logistics||{};
  Object.assign(o.logistics,pick(body.changes?.logistics||body.changes,['freightValue','pickupDate','deliveryDate','carrier','trackingCode','vehicle','driver','notes']));
}

function applyInventory(state,body){
  const c=body.changes||{};
  if(c.inventory && typeof c.inventory==='object') state.inventory=c.inventory;
  if(c.inputInventory && typeof c.inputInventory==='object') state.inputInventory=c.inputInventory;
  if(Array.isArray(c.stockMovements)) state.stockMovements=c.stockMovements;
  if(Array.isArray(c.inventoryCounts)) state.inventoryCounts=c.inventoryCounts;
}

function applyPurchases(state,body){
  const c=body.changes||{};
  if(c.reorder && typeof c.reorder==='object'){
    state.purchasePlanning={...(state.purchasePlanning||{}),...c.reorder};
  }
}

function applyProductionRequest(state,body){
  const c=body.changes||{};
  if(Array.isArray(c.productionRequests)) state.productionRequests=c.productionRequests;
}

function applyFinance(state,body){
  const c=body.changes||{};
  state.finance={...(state.finance||{}),...pick(c,['approvedFreight','paymentStatus','invoiceStatus','creditStatus','notes'])};
}

const APPLY={
  COMERCIAL:applyCommercial,
  PCP:applyPCP,
  PRODUCAO:applyProduction,
  ESTOQUE:applyInventory,
  LOGISTICA:applyLogistics,
  COMPRAS:applyPurchases,
  FINANCEIRO:applyFinance,
  SOLICITACAO_PRODUCAO:applyProductionRequest
};

export default async function handler(req,res){
  if(applyCors(req,res))return;
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='PUT')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const domain=String(body.domain||'').toUpperCase();
    const permission=DOMAIN_PERMISSION[domain];
    if(!permission)return res.status(400).json({error:'INVALID_DOMAIN'});

    const session=await requireSession(req,res,permission);if(!session)return;
    const row=await readWorkspace(WORKSPACE);
    const state=structuredClone(row?.payload||{});
    const revision=row?.revision||0;

    if(body.revision!=null && Number(body.revision)!==Number(revision)){
      return res.status(409).json({error:'REVISION_CONFLICT',currentRevision:revision});
    }

    APPLY[domain](state,body);
    const saved=await writeWorkspace(WORKSPACE,state,revision);

    const sql=db();
    await sql`
      insert into public.focado_audit_events(user_id,action,entity_type,entity_id,metadata)
      values(
        ${session.userId},
        'DOMAIN_WRITE',
        ${domain.toLowerCase()},
        ${String(body.orderId||WORKSPACE)},
        ${JSON.stringify({domain,revision:saved.revision})}::jsonb
      )
    `;

    res.setHeader('ETag','"'+saved.revision+'"');
    return res.status(200).json({ok:true,revision:saved.revision,payload:saved.payload});
  }catch(err){
    if(err.code==='REVISION_CONFLICT')return res.status(409).json({error:err.code,currentRevision:err.currentRevision});
    if(err.status)return res.status(err.status).json({error:String(err.message)});
    console.error('[domain-write]',err);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  }
}
