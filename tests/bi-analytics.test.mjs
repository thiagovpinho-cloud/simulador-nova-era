import assert from 'node:assert/strict';
import {
  soldBoxes,brandShare,skuRanking,leadTime,delayedOrders,buildBiAnalytics
} from '../shared/bi-analytics.js';

const state={
  orders:[
    {
      id:'o1',number:'PED-001',status:'ENTREGUE',brand:'Nova Era',client:'Cliente A',
      orderDate:'2026-08-01',requestedDeliveryDate:'2026-08-10',
      items:[
        {code:'SKU-A',name:'Produto A',qty:10,price:20},
        {code:'SKU-B',name:'Produto B',qty:5,price:30}
      ],
      pcp:{logisticsAvailabilityDate:'2026-08-04'},
      logistics:{pickupDate:'2026-08-05',actualDeliveryDate:'2026-08-09',carrier:'Trans A'}
    },
    {
      id:'o2',number:'PED-002',status:'ENTREGUE',brand:'New Green',client:'Cliente B',
      orderDate:'2026-08-02',requestedDeliveryDate:'2026-08-08',
      items:[{code:'SKU-A',name:'Produto A',qty:8,price:25}],
      pcp:{logisticsAvailabilityDate:'2026-08-05'},
      logistics:{pickupDate:'2026-08-06',actualDeliveryDate:'2026-08-11',carrier:'Trans B'}
    },
    {
      id:'o3',number:'PED-003',status:'LOGISTICA',brand:'Nova Era',client:'Cliente C',
      orderDate:'2026-08-03',requestedDeliveryDate:'2026-08-15',
      items:[{code:'SKU-C',name:'Produto C',qty:12,price:10}],
      pcp:{logisticsAvailabilityDate:'2026-08-06'},
      logistics:{pickupDate:'2026-08-07',carrier:'Trans A'}
    }
  ]
};

const boxes=soldBoxes(state,{});
assert.equal(boxes.value,35);
assert.equal(boxes.rows.length,4);

const share=brandShare(state,{});
assert.equal(share.totalRevenue,670);
assert.equal(share.rows[0].brand,'Nova Era');
assert.equal(share.rows.find(x=>x.brand==='New Green').revenue,200);

const ranking=skuRanking(state,{});
assert.equal(ranking.byRevenue[0].sku,'SKU-A');
assert.equal(ranking.byRevenue[0].revenue,400);
assert.equal(ranking.byVolume[0].boxes,18);

const lead=leadTime(state,{});
assert.equal(lead.rows.length,3);
assert.equal(lead.rows.find(x=>x.orderId==='o1').days.total,8);
assert.equal(lead.rows.find(x=>x.orderId==='o2').days.pickupToDelivery,5);

const delayed=delayedOrders(state,{asOf:'2026-08-18'});
assert.equal(delayed.value,2);
assert.equal(delayed.rows.find(x=>x.orderId==='o2').delayDays,3);
assert.equal(delayed.rows.find(x=>x.orderId==='o3').delayDays,3);

const filtered=buildBiAnalytics(state,{brand:'Nova Era',asOf:'2026-08-18'});
assert.equal(filtered.summary.soldBoxes,27);
assert.equal(filtered.kpis.brand_share.rows.length,1);
assert.equal(filtered.kpis.sku_ranking.byRevenue.length,3);
assert.equal(filtered.kpis.delayed_orders.value,1);

const bySku=buildBiAnalytics(state,{sku:'SKU-A',asOf:'2026-08-18'});
assert.equal(bySku.summary.soldBoxes,23);
assert.equal(bySku.kpis.brand_share.rows.length,2);

console.log('BI Phase 2 analytics OK');


const marginRulesState={
  orders:[{
    id:'mr1',number:'MR-001',status:'ENTREGUE',brand:'Nova Era',client:'Cliente Margem',orderDate:'2026-08-10',
    items:[{code:'SKU-M',name:'Produto Margem',qty:10,price:100}],
    logistics:{deliveryConfirmed:true,actualDeliveryDate:'2026-08-10'}
  }],
  skuCosts:[{sku:'SKU-M',effective_from:'2026-08-01',unit_variable_cost:30}],
  financialFacts:[{
    order_id:'mr1',invoice_number:'NF-M1',invoice_date:'2026-08-10',invoice_status:'EMITIDA',
    icms:100,pis:20,cofins:40,ipi:50,st:30,freight_allocated:40,commission:20,contract:10,
    discounts:0,returns:0,bonuses:0
  }],
  marginRules:{
    product_cost:'CUSTO',icms:'CUSTO',pis:'CUSTO',cofins:'CUSTO',
    ipi:'MARGEM',st:'MARGEM',freight:'CUSTO',commission:'MARGEM',contract:'MARGEM'
  }
};
const marginAnalytics=buildBiAnalytics(marginRulesState,{});
assert.equal(marginAnalytics.summary.recognizedGrossRevenue,1080,'Bruto deve incluir IPI e ST');
assert.equal(marginAnalytics.summary.netRevenue,580,'Líquido deve abater somente componentes classificados como CUSTO');
assert.ok(Math.abs(marginAnalytics.summary.contributionMargin-(580/1080))<1e-12);
assert.equal(marginAnalytics.kpis.net_revenue.rules.ipi,'MARGEM');
assert.equal(marginAnalytics.kpis.net_revenue.rules.icms,'CUSTO');

marginRulesState.marginRules.ipi='CUSTO';
const changedRule=buildBiAnalytics(marginRulesState,{});
assert.equal(changedRule.summary.netRevenue,530,'Trocar IPI para CUSTO deve reduzir o líquido exatamente pelo IPI');
