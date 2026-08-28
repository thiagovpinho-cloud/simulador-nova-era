export const BI_CONTRACT_VERSION = '2026.08.28.2';

export const BI_DATA_PATHS = Object.freeze({
  orders: 'state.orders',
  orderItems: 'state.orders[].items',
  pcp: 'state.orders[].pcp',
  logistics: 'state.orders[].logistics',
  expedition: 'state.orders[].expedition',
  inventory: 'state.inventory',
  inputInventory: 'state.inputInventory',
  stockMovements: 'state.stockMovements',
  purchaseRequests: 'state.purchaseRequests',
  productionBases: 'state.productionBases',
  monthlyTargets: 'state.monthlyTargets',
  financialFacts: 'state.financialFacts',
  skuCosts: 'state.skuCosts',
  inventoryPolicy: 'state.inventoryPolicy',
  productionCapacityHistory: 'state.productionCapacityHistory',
  biPolicy: 'state.biPolicy'
});

export const KPI_REGISTRY = Object.freeze([
  {
    id:'gross_revenue',
    label:'Faturamento bruto',
    status:'ready',
    domain:'commercial',
    grain:'order',
    valuePaths:['orders[].items[].qty','orders[].items[].price','biPolicy.revenueRecognition'],
    calculation:'SUM(qty * price) for recognized orders',
    missing:[],
    drillDown:['brand','client','order','sku']
  },
  {
    id:'net_revenue',
    label:'Faturamento líquido',
    status:'ready',
    domain:'finance',
    grain:'order',
    valuePaths:['orders[].items[].qty','orders[].items[].price','financialFacts[].taxes','financialFacts[].discounts','financialFacts[].returns','financialFacts[].bonuses'],
    calculation:'gross_revenue - taxes - discounts - returns - bonuses',
    missing:[],
    drillDown:['brand','client','order','sku']
  },
  {
    id:'sold_boxes',
    label:'Volume vendido em caixas',
    status:'ready',
    domain:'commercial',
    grain:'sku',
    valuePaths:['orders[].items[].qty'],
    calculation:'SUM(qty)',
    missing:[],
    drillDown:['brand','client','order','sku']
  },
  {
    id:'contribution_margin',
    label:'Margem de contribuição média',
    status:'ready',
    domain:'finance',
    grain:'sku',
    valuePaths:['orders[].items[].qty','orders[].items[].price','financialFacts[]','skuCosts[]'],
    calculation:'(net_revenue - product_variable_cost - commission - freight_allocated) / net_revenue',
    missing:[],
    drillDown:['brand','client','order','sku']
  },
  {
    id:'otif',
    label:'OTIF — Entregas no prazo e completas',
    status:'ready',
    domain:'logistics',
    grain:'order',
    valuePaths:['orders[].requestedDeliveryDate','orders[].logistics.actualDeliveryDate','orders[].items[].qty','orders[].items[].dispatchedQty'],
    calculation:'orders_on_time_and_in_full / delivered_orders',
    missing:[],
    drillDown:['carrier','client','order','sku']
  },
  {
    id:'brand_share',
    label:'Share de vendas por marca',
    status:'ready',
    domain:'commercial',
    grain:'brand',
    valuePaths:['orders[].brand','orders[].items[].qty','orders[].items[].price'],
    calculation:'brand_gross_revenue / total_gross_revenue',
    missing:[],
    drillDown:['brand','client','order','sku']
  },
  {
    id:'sku_ranking',
    label:'Ranking de SKUs',
    status:'ready',
    domain:'commercial',
    grain:'sku',
    valuePaths:['orders[].items[].code','orders[].items[].name','orders[].items[].qty','orders[].items[].price'],
    calculation:'rank by SUM(qty*price) and SUM(qty)',
    missing:[],
    drillDown:['sku','order','client']
  },
  {
    id:'lead_time',
    label:'Lead time operacional',
    status:'ready',
    domain:'operations',
    grain:'order',
    valuePaths:['orders[].createdAt','orders[].pcp.logisticsAvailabilityDate','orders[].logistics.pickupDate','orders[].logistics.actualDeliveryDate'],
    calculation:'elapsed time between operational milestones',
    missing:[],
    drillDown:['order','pcp','expedition','logistics']
  },
  {
    id:'delayed_orders',
    label:'Pedidos atrasados',
    status:'ready',
    domain:'operations',
    grain:'order',
    valuePaths:['orders[].requestedDeliveryDate','orders[].logistics.actualDeliveryDate','orders[].status'],
    calculation:'open_or_delivered_after_promised_date',
    missing:[],
    drillDown:['order','client','carrier']
  },
  {
    id:'inventory_risk',
    label:'Risco de ruptura de estoque',
    status:'ready',
    domain:'inventory',
    grain:'sku',
    valuePaths:['inventory.*.physical','inventory.*.reserved','inventory.*.blocked','inventoryPolicy.*'],
    calculation:'available = physical - reserved - blocked; compare to policy threshold',
    missing:[],
    drillDown:['sku','stockMovements']
  },
  {
    id:'production_load',
    label:'Carga de produção por base',
    status:'ready',
    domain:'production',
    grain:'base',
    valuePaths:['orders[].items[].deliveryBase','orders[].items[].qty','productionBases.*.capacityPerDay','productionCapacityHistory[]'],
    calculation:'scheduled_qty / available_capacity with capacity history',
    missing:[],
    drillDown:['base','productionDate','order','sku']
  },
  {
    id:'target_vs_actual',
    label:'Meta x realizado',
    status:'ready',
    domain:'management',
    grain:'month',
    valuePaths:['monthlyTargets[]','orders[]'],
    calculation:'recognized actual revenue / target',
    missing:[],
    drillDown:['month','brand','representative']
  }
]);

export const FUTURE_REQUIRED_FIELDS = Object.freeze({
  monthly_targets:['period','scope_type','scope_id','target_revenue','target_boxes','target_margin'],
  financial_facts:['order_id','taxes','discounts','returns','bonuses','commission','freight_allocated'],
  sku_costs:['sku','effective_from','unit_variable_cost'],
  inventory_policy:['sku','minimum_stock','reorder_point','safety_stock']
});

export function getKpiDefinition(id){
  return KPI_REGISTRY.find(k=>k.id===id)||null;
}

export function validateBiContract(){
  const ids=new Set();
  const errors=[];
  for(const kpi of KPI_REGISTRY){
    if(!kpi.id||ids.has(kpi.id)) errors.push('duplicate_or_missing_id:'+String(kpi.id));
    ids.add(kpi.id);
    if(!['ready','partial','missing'].includes(kpi.status)) errors.push('invalid_status:'+kpi.id);
    if(kpi.status==='ready' && kpi.missing.length) errors.push('ready_with_missing:'+kpi.id);
    if(!Array.isArray(kpi.drillDown)||!kpi.drillDown.length) errors.push('missing_drilldown:'+kpi.id);
  }
  return {ok:errors.length===0,errors,total:KPI_REGISTRY.length};
}
