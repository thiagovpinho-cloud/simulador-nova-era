export const BI_ANALYTICS_VERSION='2026.08.28.1';

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

export function buildBiAnalytics(state,filters={}){
  const f=normalizeFilters(filters);
  const sold=soldBoxes(state,f);
  const share=brandShare(state,f);
  const ranking=skuRanking(state,f);
  const lead=leadTime(state,f);
  const delayed=delayedOrders(state,f);
  return {
    ok:true,
    version:BI_ANALYTICS_VERSION,
    generatedAt:new Date().toISOString(),
    filters:f,
    summary:{
      soldBoxes:sold.value,
      delayedOrders:delayed.value,
      averageLeadTimeDays:lead.averagesDays.total,
      grossRevenueForShare:share.totalRevenue
    },
    kpis:{
      sold_boxes:sold,
      brand_share:share,
      sku_ranking:ranking,
      lead_time:lead,
      delayed_orders:delayed
    }
  };
}
