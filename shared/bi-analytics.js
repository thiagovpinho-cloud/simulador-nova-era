export const BI_ANALYTICS_VERSION='2026.08.28.2';

const DAY_MS=86400000;

function num(v){
  const n=Number(v);
  return Number.isFinite(n)?n:0;
}

function text(v){ return String(v??'').trim(); }

function dateOnlyMs(value){
  if(value==null||value==='')return null;
  if(typeof value==='number'&&Number.isFinite(value)){
    const d=new Date(value);
    return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  }
  const raw=String(value).slice(0,10);
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]));
}

function daysBetween(start,end){
  const a=dateOnlyMs(start),b=dateOnlyMs(end);
  if(a==null||b==null)return null;
  return Math.max(0,(b-a)/DAY_MS);
}

function orderValue(order){
  return (order?.items||[]).reduce((sum,item)=>sum+num(item.qty)*num(item.price),0);
}

function orderBoxes(order){
  return (order?.items||[]).reduce((sum,item)=>sum+num(item.qty),0);
}

function recognized(order,state){
  const rule=String(state?.biPolicy?.revenueRecognition||'DELIVERED').toUpperCase();
  if(rule==='DELIVERED')return String(order?.status||'').toUpperCase()==='ENTREGUE' || Boolean(order?.logistics?.deliveryConfirmed);
  if(rule==='EXPEDITION_RELEASED')return Boolean(order?.expedition?.stockReleasedAt);
  if(rule==='INVOICED'){
    const f=financialFactFor(state,order?.id);
    return Boolean(f?.invoice_number && f?.invoice_date && String(f?.invoice_status||'').toUpperCase()!=='CANCELADA');
  }
  return true;
}

function financialFactFor(state,orderId){
  return (Array.isArray(state?.financialFacts)?state.financialFacts:[]).find(x=>String(x.order_id)===String(orderId))||null;
}

function effectiveSkuCost(state,sku,date){
  const rows=(Array.isArray(state?.skuCosts)?state.skuCosts:[])
    .filter(x=>String(x.sku||'')===String(sku||'') && String(x.effective_from||'')<=String(date||'9999-12-31'))
    .sort((x,y)=>String(y.effective_from||'').localeCompare(String(x.effective_from||'')));
  return rows[0]||null;
}

function promisedDate(order,state){
  const rule=String(state?.biPolicy?.promisedDateRule||'REQUESTED_THEN_LOGISTICS').toUpperCase();
  if(rule==='REQUESTED_ONLY')return order?.requestedDeliveryDate||'';
  return order?.requestedDeliveryDate||order?.logistics?.deliveryDate||'';
}

function confirmedRequestedQty(item){
  return num(item?.originalRequestedQty!=null?item.originalRequestedQty:item?.qty);
}

function hasDispatchEvidence(order){
  return (order?.items||[]).every(i=>i.dispatchedQty!=null || order?.expedition?.stockReleasedAt);
}

function dispatchedQty(item){
  return item?.dispatchedQty!=null?num(item.dispatchedQty):num(item.qty);
}

function normalizeFilters(filters={}){
  return {
    from:text(filters.from),
    to:text(filters.to),
    brand:text(filters.brand).toLowerCase(),
    client:text(filters.client).toLowerCase(),
    sku:text(filters.sku).toLowerCase(),
    status:text(filters.status).toUpperCase(),
    asOf:text(filters.asOf)||new Date().toISOString().slice(0,10)
  };
}

function orderDate(order){
  if(order?.orderDate)return String(order.orderDate).slice(0,10);
  if(order?.createdAt){
    const d=new Date(order.createdAt);
    if(!Number.isNaN(d.getTime()))return d.toISOString().slice(0,10);
  }
  return '';
}

function matchesOrder(order,filters){
  const d=orderDate(order);
  if(filters.from&&d&&d<filters.from)return false;
  if(filters.to&&d&&d>filters.to)return false;
  if(filters.brand&&text(order.brand).toLowerCase()!==filters.brand)return false;
  if(filters.client&&!text(order.client).toLowerCase().includes(filters.client))return false;
  if(filters.status&&text(order.status).toUpperCase()!==filters.status)return false;
  if(filters.sku){
    const found=(order.items||[]).some(i=>{
      const hay=[i.code,i.productId,i.name].map(text).join(' ').toLowerCase();
      return hay.includes(filters.sku);
    });
    if(!found)return false;
  }
  return true;
}

function filteredOrders(state,filters={}){
  const f=normalizeFilters(filters);
  return {filters:f,orders:(Array.isArray(state?.orders)?state.orders:[]).filter(o=>matchesOrder(o,f))};
}

function orderRef(order){
  return {
    orderId:order.id??null,
    orderNumber:order.number??null,
    client:order.client||'',
    brand:order.brand||'',
    status:order.status||'',
    orderDate:orderDate(order)
  };
}

export function soldBoxes(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const rows=[];
  for(const order of orders){
    for(const item of order.items||[]){
      rows.push({
        ...orderRef(order),
        sku:item.code||item.productId||item.name||'',
        name:item.name||'',
        boxes:num(item.qty)
      });
    }
  }
  return {
    id:'sold_boxes',
    value:rows.reduce((s,r)=>s+r.boxes,0),
    unit:'CX',
    rows
  };
}

export function brandShare(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const map=new Map();
  let total=0;
  for(const order of orders){
    const value=orderValue(order);
    total+=value;
    const brand=text(order.brand)||'SEM MARCA';
    const cur=map.get(brand)||{brand,revenue:0,boxes:0,orders:0,orderIds:[]};
    cur.revenue+=value;
    cur.boxes+=orderBoxes(order);
    cur.orders+=1;
    cur.orderIds.push(order.id);
    map.set(brand,cur);
  }
  const rows=[...map.values()]
    .map(r=>({...r,share:total>0?r.revenue/total:0}))
    .sort((a,b)=>b.revenue-a.revenue||a.brand.localeCompare(b.brand,'pt-BR'));
  return {id:'brand_share',totalRevenue:total,rows};
}

export function skuRanking(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const map=new Map();
  for(const order of orders){
    for(const item of order.items||[]){
      const sku=text(item.code||item.productId||item.name)||'SEM SKU';
      const cur=map.get(sku)||{sku,name:item.name||'',revenue:0,boxes:0,orders:0,orderIds:new Set()};
      cur.revenue+=num(item.qty)*num(item.price);
      cur.boxes+=num(item.qty);
      cur.orderIds.add(order.id);
      map.set(sku,cur);
    }
  }
  const base=[...map.values()].map(r=>({...r,orders:r.orderIds.size,orderIds:[...r.orderIds]}));
  const byRevenue=[...base].sort((a,b)=>b.revenue-a.revenue||b.boxes-a.boxes||a.sku.localeCompare(b.sku)).map((r,i)=>({...r,rank:i+1}));
  const byVolume=[...base].sort((a,b)=>b.boxes-a.boxes||b.revenue-a.revenue||a.sku.localeCompare(b.sku)).map((r,i)=>({...r,rank:i+1}));
  return {id:'sku_ranking',byRevenue,byVolume};
}

export function leadTime(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const rows=orders.map(order=>{
    const created=order.orderDate||order.createdAt||null;
    const pcpAvailable=order.pcp?.logisticsAvailabilityDate||
      [...(order.items||[])].map(i=>i.pcpAvailabilityDate).filter(Boolean).sort().slice(-1)[0]||null;
    const pickup=order.logistics?.pickupDate||null;
    const delivered=order.logistics?.actualDeliveryDate||null;
    return {
      ...orderRef(order),
      milestones:{created,pcpAvailable,pickup,delivered},
      days:{
        commercialToPcp:daysBetween(created,pcpAvailable),
        pcpToPickup:daysBetween(pcpAvailable,pickup),
        pickupToDelivery:daysBetween(pickup,delivered),
        total:daysBetween(created,delivered)
      }
    };
  });
  const avg=key=>{
    const vals=rows.map(r=>r.days[key]).filter(v=>v!=null);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  };
  return {
    id:'lead_time',
    averagesDays:{
      commercialToPcp:avg('commercialToPcp'),
      pcpToPickup:avg('pcpToPickup'),
      pickupToDelivery:avg('pickupToDelivery'),
      total:avg('total')
    },
    rows
  };
}

export function delayedOrders(state,filters={}){
  const {orders,filters:f}=filteredOrders(state,filters);
  const asOf=f.asOf;
  const rows=[];
  for(const order of orders){
    const promised=order.requestedDeliveryDate||'';
    if(!promised)continue;
    const actual=order.logistics?.actualDeliveryDate||'';
    const delivered=Boolean(actual)||String(order.status||'').toUpperCase()==='ENTREGUE';
    const comparison=actual||asOf;
    const delayDays=daysBetween(promised,comparison);
    if(comparison>promised){
      rows.push({
        ...orderRef(order),
        promisedDate:promised,
        actualDeliveryDate:actual||null,
        asOf:actual?null:asOf,
        delivered,
        delayDays:delayDays??0,
        carrier:order.logistics?.carrier||''
      });
    }
  }
  rows.sort((a,b)=>b.delayDays-a.delayDays||String(a.orderNumber).localeCompare(String(b.orderNumber)));
  return {id:'delayed_orders',value:rows.length,unit:'pedidos',rows};
}


export function grossRevenue(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const rows=orders.filter(o=>recognized(o,state)).map(order=>({...orderRef(order),revenue:orderValue(order)}));
  return {id:'gross_revenue',value:rows.reduce((s,r)=>s+r.revenue,0),unit:'BRL',rows};
}

export function netRevenue(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const rows=orders.filter(o=>recognized(o,state)).map(order=>{
    const gross=orderValue(order);
    const f=financialFactFor(state,order.id)||{};
    const deductions=['taxes','discounts','returns','bonuses'].reduce((s,k)=>s+num(f[k]),0);
    return {...orderRef(order),gross,deductions,net:gross-deductions,financialFactFound:Boolean(financialFactFor(state,order.id))};
  });
  const complete=rows.every(r=>r.financialFactFound);
  return {id:'net_revenue',value:rows.reduce((s,r)=>s+r.net,0),unit:'BRL',complete,rows};
}

export function contributionMargin(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const rows=[];
  let complete=true;
  for(const order of orders.filter(o=>recognized(o,state))){
    const f=financialFactFor(state,order.id);
    if(!f)complete=false;
    const gross=orderValue(order);
    const deductions=['taxes','discounts','returns','bonuses'].reduce((s,k)=>s+num(f?.[k]),0);
    const net=gross-deductions;
    let productCost=0;
    const missingCosts=[];
    for(const item of order.items||[]){
      const sku=item.code||item.productId||item.name||'';
      const c=effectiveSkuCost(state,sku,orderDate(order));
      if(!c){complete=false;missingCosts.push(sku);continue}
      productCost+=num(c.unit_variable_cost)*num(item.qty);
    }
    const variableCosts=productCost+num(f?.commission)+num(f?.freight_allocated);
    const contribution=net-variableCosts;
    rows.push({...orderRef(order),net,variableCosts,contribution,margin:net>0?contribution/net:null,financialFactFound:Boolean(f),missingCosts});
  }
  const netTotal=rows.reduce((s,r)=>s+r.net,0), contributionTotal=rows.reduce((s,r)=>s+r.contribution,0);
  return {id:'contribution_margin',value:netTotal>0?contributionTotal/netTotal:null,complete,netRevenue:netTotal,contribution:contributionTotal,rows};
}

export function otif(state,filters={}){
  const {orders}=filteredOrders(state,filters);
  const delivered=orders.filter(o=>String(o.status||'').toUpperCase()==='ENTREGUE'||o.logistics?.deliveryConfirmed);
  const rows=[]; let excluded=0;
  for(const order of delivered){
    const promised=promisedDate(order,state);
    const actual=order.logistics?.actualDeliveryDate||'';
    if(!promised||!actual||!hasDispatchEvidence(order)){excluded++;continue}
    const onTime=actual<=promised;
    const inFull=(order.items||[]).every(i=>dispatchedQty(i)>=confirmedRequestedQty(i));
    rows.push({...orderRef(order),promisedDate:promised,actualDeliveryDate:actual,onTime,inFull,otif:onTime&&inFull});
  }
  const pass=rows.filter(r=>r.otif).length;
  return {id:'otif',value:rows.length?pass/rows.length:null,evaluated:rows.length,passed:pass,excluded,complete:excluded===0,rows};
}

function capacityForDate(state,base,date){
  const history=(Array.isArray(state?.productionCapacityHistory)?state.productionCapacityHistory:[])
    .filter(x=>String(x.base||'')===String(base||'')&&String(x.effectiveDate||'')<=String(date||'9999-12-31'))
    .sort((a,b)=>String(b.effectiveDate||'').localeCompare(String(a.effectiveDate||'')));
  if(history.length)return num(history[0].capacityPerDay);
  return num(state?.productionBases?.[base]?.capacityPerDay);
}

export function productionLoad(state,filters={}){
  const f=normalizeFilters(filters);
  const requests=(Array.isArray(state?.productionRequests)?state.productionRequests:[])
    .filter(r=>String(r.status||'').toUpperCase()==='FINALIZADA');
  const map=new Map();
  for(const r of requests){
    const s=r.snapshot||r;
    const date=String(s.needByDate||s.requestDate||r.needByDate||r.requestDate||'').slice(0,10);
    if(f.from&&date&&date<f.from)continue;
    if(f.to&&date&&date>f.to)continue;
    const base=String(s.base||r.base||'SEM BASE');
    const qty=(s.items||r.items||[]).reduce((sum,i)=>sum+num(i.qty),0);
    const key=base+'|'+date;
    const cur=map.get(key)||{base,date,scheduledQty:0,requests:0,requestIds:[]};
    cur.scheduledQty+=qty;cur.requests++;cur.requestIds.push(r.id);map.set(key,cur);
  }
  const rows=[...map.values()].map(r=>{
    const capacity=capacityForDate(state,r.base,r.date);
    return {...r,capacityPerDay:capacity,load:capacity>0?r.scheduledQty/capacity:null,overCapacity:capacity>0?r.scheduledQty>capacity:null};
  }).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.base).localeCompare(String(b.base)));
  return {id:'production_load',complete:rows.every(r=>r.capacityPerDay>0),rows};
}

export function targetVsActual(state,filters={}){
  const f=normalizeFilters(filters);
  const targets=Array.isArray(state?.monthlyTargets)?state.monthlyTargets:[];
  const gross=grossRevenue(state,filters);
  const period=(f.from&&f.from.slice(0,7)===f.to?.slice(0,7))?f.from.slice(0,7):(f.from?f.from.slice(0,7):new Date().toISOString().slice(0,7));
  const scopeType=f.brand?'BRAND':'COMPANY',scopeId=f.brand||'ALL';
  const target=targets.find(t=>String(t.period)===period&&String(t.scope_type||'COMPANY').toUpperCase()===scopeType&&String(t.scope_id||'ALL').toLowerCase()===String(scopeId).toLowerCase())||
    targets.find(t=>String(t.period)===period&&String(t.scope_type||'COMPANY').toUpperCase()==='COMPANY'&&String(t.scope_id||'ALL')==='ALL')||null;
  const revenueTarget=num(target?.target_revenue);
  return {id:'target_vs_actual',period,scopeType,scopeId,target:target||null,actualRevenue:gross.value,achievement:revenueTarget>0?gross.value/revenueTarget:null,complete:Boolean(target)};
}

export function inventoryRisk(state){
  const inventory=state?.inventory||{};
  const policies=state?.inventoryPolicy||{};
  const rows=Object.entries(inventory).map(([key,inv])=>{
    const sku=String(inv?.code||key);
    const p=policies[sku]||policies[key]||null;
    const available=Math.max(0,num(inv?.physical)-num(inv?.reserved)-num(inv?.blocked));
    const threshold=p?Math.max(num(p.reorder_point),num(p.minimum_stock)):null;
    return {key,sku,name:inv?.name||'',available,threshold,atRisk:threshold!=null?available<=threshold:null,policyFound:Boolean(p),policy:p};
  });
  return {id:'inventory_risk',value:rows.filter(r=>r.atRisk===true).length,complete:rows.every(r=>r.policyFound),rows};
}

export function buildBiAnalytics(state,filters={}){
  const f=normalizeFilters(filters);
  const sold=soldBoxes(state,f);
  const share=brandShare(state,f);
  const ranking=skuRanking(state,f);
  const lead=leadTime(state,f);
  const delayed=delayedOrders(state,f);
  const gross=grossRevenue(state,f);
  const net=netRevenue(state,f);
  const margin=contributionMargin(state,f);
  const otifKpi=otif(state,f);
  const targets=targetVsActual(state,f);
  const inventory=inventoryRisk(state);
  const production=productionLoad(state,f);
  return {
    ok:true,
    version:BI_ANALYTICS_VERSION,
    generatedAt:new Date().toISOString(),
    filters:f,
    summary:{
      soldBoxes:sold.value,
      delayedOrders:delayed.value,
      averageLeadTimeDays:lead.averagesDays.total,
      grossRevenueForShare:share.totalRevenue,
      recognizedGrossRevenue:gross.value,
      netRevenue:net.complete?net.value:null,
      contributionMargin:margin.complete?margin.value:null,
      otif:otifKpi.value,
      targetAchievement:targets.achievement
    },
    kpis:{
      sold_boxes:sold,
      gross_revenue:gross,
      net_revenue:net,
      contribution_margin:margin,
      otif:otifKpi,
      target_vs_actual:targets,
      inventory_risk:inventory,
      production_load:production,
      brand_share:share,
      sku_ranking:ranking,
      lead_time:lead,
      delayed_orders:delayed
    }
  };
}
