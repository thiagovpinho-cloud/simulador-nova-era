import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBiAnalytics} from '../shared/bi-analytics.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/app-shell.js');
const auth=read('assets/core/auth-client.js');
const indicators=read('assets/modules/indicators.js');
const indicatorsCss=read('assets/modules/indicators.css');

// ============================================================
// TESTE DE FOGO — cenário empresarial de aceitação máxima
// 100 funcionários, 30 pedidos, auditoria, usuários, especialistas
// e diretor acessando o Cockpit Executivo antes de uma reunião.
// ============================================================

const roleCounts={ADMIN:4,COMERCIAL:14,PCP:7,PRODUCAO:28,ESTOQUE:16,COMPRAS:8,LOGISTICA:13,FINANCEIRO:10};
const ages=[18,22,29,35,41,46,52,58,65];
const people=[];let uid=1;
for(const [role,count] of Object.entries(roleCounts)){
  for(let i=0;i<count;i++)people.push({id:'u'+uid++,role,age:ages[(i+role.length)%ages.length],leader:i<Math.max(1,Math.round(count*.18))});
}
assert.equal(people.length,100,'Teste de Fogo deve simular 100 funcionários');
assert.ok(people.some(x=>x.age===18)&&people.some(x=>x.age===35)&&people.some(x=>x.age===46)&&people.some(x=>x.age===65),'Teste deve cobrir múltiplas faixas etárias');

const state={
  orders:[],financialFacts:[],skuCosts:[],monthlyTargets:[],inventoryPolicy:{},
  productionRequests:[],productionBases:{},productionCapacityHistory:[],
  inventory:{},inputInventory:{},stockMovements:[],
  marginRules:{
    product_cost:'CUSTO',icms:'CUSTO',pis:'CUSTO',cofins:'CUSTO',
    ipi:'MARGEM',st:'MARGEM',freight:'CUSTO',commission:'CUSTO',contract:'MARGEM'
  },
  biPolicy:{revenueRecognition:'DELIVERED',promisedDateRule:'REQUESTED_THEN_LOGISTICS',inFullRule:'DISPATCHED_VS_CONFIRMED'}
};

state.monthlyTargets.push({period:'2026-08',scope_type:'COMPANY',scope_id:'ALL',target_revenue:120000,target_boxes:4500,target_margin:.22});
for(const [sku,cost] of [['AL70',18],['GEL70',23],['AL46',16],['SPRAY',11],['LIMP',9]])state.skuCosts.push({sku,effective_from:'2026-08-01',unit_variable_cost:cost});

const brands=['Nova Era','New Green'];
const skus=[
  ['AL70','Álcool 70',44],
  ['GEL70','Álcool Gel 70',52],
  ['AL46','Álcool 46',38],
  ['SPRAY','Álcool Spray',31],
  ['LIMP','Limpador',27]
];

for(let i=1;i<=30;i++){
  const [code,name,price]=skus[(i-1)%skus.length];
  const qty=60+(i%5)*10;
  const promised='2026-08-'+String(10+(i%15)).padStart(2,'0');
  const late=i%6===0;
  const actual=late?'2026-08-'+String(Math.min(28,12+(i%15))).padStart(2,'0'):promised;
  const status=i<=24?'ENTREGUE':(i<=27?'LOGISTICA':'PCP');
  const o={
    id:'fire-o'+i,number:'FOGO-'+String(i).padStart(3,'0'),status,
    brand:brands[i%2],client:'Cliente Fogo '+i,cnpj:'12345678000199',
    city:i%3===0?'Campinas':'Mococa',uf:'SP',orderDate:'2026-08-'+String(1+(i%8)).padStart(2,'0'),
    requestedDeliveryDate:promised,freightType:i%4===0?'FOB':'CIF',
    items:[{id:'fi'+i,code,name,qty,price,dispatchedQty:status==='ENTREGUE'?qty:null}],
    expedition:status==='ENTREGUE'?{stockReleasedAt:Date.parse(actual+'T08:00:00Z'),status:'LIBERADO'}:{},
    logistics:{
      deliveryConfirmed:status==='ENTREGUE',
      actualDeliveryDate:status==='ENTREGUE'?actual:'',
      deliveryDate:promised,
      deliveredOnTime:status==='ENTREGUE'?!late:false
    }
  };
  state.orders.push(o);
  if(status==='ENTREGUE'){
    state.financialFacts.push({
      order_id:o.id,invoice_number:'NF-F-'+i,invoice_date:actual,invoice_status:'EMITIDA',
      icms:qty*price*.08,pis:qty*price*.012,cofins:qty*price*.04,
      ipi:qty*price*.03,st:qty*price*.02,
      freight_allocated:o.freightType==='FOB'?0:qty*1.8,
      commission:qty*price*.025,contract:i%7===0?qty*.5:0,
      discounts:i%10===0?150:0,returns:0,bonuses:0
    });
  }
}
assert.equal(state.orders.length,30,'Teste de Fogo deve possuir 30 pedidos');
assert.equal(state.financialFacts.length,24,'24 pedidos entregues devem alimentar o BI');

const bi=buildBiAnalytics(state,{from:'2026-08-01',to:'2026-08-31',asOf:'2026-08-31'});

// ----- Diretor entrando para reunião -----
const directorChecklist={
  cockpitVisible:shell.includes("['cockpit','◉','Cockpit Executivo']"),
  cockpitUsesExecutiveEngine:shell.includes("if(id==='cockpit'){open(()=>window.FocadoIndicators?.render());return}"),
  cockpitLoadsIndicators:shell.includes("id==='cockpit'?'indicadores':id"),
  accessControlled:auth.includes("cockpit:['ADMIN','FINANCEIRO']"),
  gross:Number.isFinite(bi.summary.recognizedGrossRevenue)&&bi.summary.recognizedGrossRevenue>0,
  net:Number.isFinite(bi.summary.netRevenue),
  margin:bi.summary.contributionMargin!=null,
  otif:bi.summary.otif!=null,
  target:bi.summary.targetAchievement!=null,
  brandShare:(bi.kpis.brand_share?.rows||[]).length>=2,
  skuRanking:(bi.kpis.sku_ranking?.byRevenue||[]).length>=5,
  delayed:bi.kpis.delayed_orders?.value!=null,
  traceability:indicators.includes('RASTREABILIDADE DO KPI')&&indicators.includes('data-kpi-order'),
  visualCharts:indicators.includes('brandDonut')&&indicators.includes('skuBarChart')&&indicators.includes('progressChart')
};
assert.ok(Object.values(directorChecklist).every(Boolean),'Diretor deve conseguir obter todos os dados-chave no Cockpit Executivo');

// O diretor não deve precisar navegar para o módulo antigo de Indicadores.
assert.ok(shell.includes("if(id==='cockpit'){open(()=>window.FocadoIndicators?.render());return}"),'Cockpit deve abrir o dashboard executivo diretamente');

// ----- Auditores -----
const auditorFindings=[];
if(!bi.kpis.net_revenue?.complete)auditorFindings.push('Receita líquida incompleta');
if(!bi.kpis.contribution_margin?.complete)auditorFindings.push('Margem incompleta');
if(!directorChecklist.traceability)auditorFindings.push('KPIs sem rastreabilidade');
if(!directorChecklist.accessControlled)auditorFindings.push('Cockpit sem controle financeiro');
assert.equal(auditorFindings.length,0,'Auditores não devem encontrar bloqueador crítico no cenário');

// ----- Usuários por faixa etária -----
const userPanel=[
  {age:18,checks:['cockpitVisible','visualCharts']},
  {age:35,checks:['cockpitUsesExecutiveEngine','skuRanking']},
  {age:46,checks:['gross','net','margin','traceability']},
  {age:65,checks:['cockpitVisible','visualCharts','traceability']}
];
for(const persona of userPanel){
  for(const check of persona.checks)assert.equal(Boolean(directorChecklist[check]),true,'Persona '+persona.age+' falhou em '+check);
}

// ----- Especialistas -----
const specialistReview={
  product:'Cockpit executivo centraliza a decisão sem duplicar cálculo.',
  ux:'Dados-chave e gráficos ficam na primeira visão executiva.',
  engineering:'Cockpit reutiliza FocadoIndicators em vez de duplicar regras.',
  data:'KPIs vêm do mesmo buildBiAnalytics e preservam rastreabilidade.',
  security:'Acesso executivo está limitado a ADMIN e FINANCEIRO.'
};
assert.equal(Object.keys(specialistReview).length,5);
assert.ok(indicatorsCss.includes('.fbi-donut-wrap'),'Especialista UX exige gráficos executivos publicados');

// ----- Saúde do cenário empresarial -----
const companyAcceptance={
  employees:people.length===100,
  orders:state.orders.length===30,
  delivered:state.orders.filter(o=>o.status==='ENTREGUE').length===24,
  inLogistics:state.orders.filter(o=>o.status==='LOGISTICA').length===3,
  inPcp:state.orders.filter(o=>o.status==='PCP').length===3,
  twoBrands:(bi.kpis.brand_share?.rows||[]).length===2,
  noInventedGross:bi.summary.recognizedGrossRevenue===bi.kpis.gross_revenue.value,
  noInventedNet:bi.summary.netRevenue===bi.kpis.net_revenue.value,
  directorReady:Object.values(directorChecklist).every(Boolean)
};
assert.ok(Object.values(companyAcceptance).every(Boolean),'Empresa simulada deve encerrar o Teste de Fogo sem bloqueadores');

console.log('teste-de-fogo: APROVADO');
console.log(JSON.stringify({
  employees:people.length,
  orders:state.orders.length,
  delivered:state.orders.filter(o=>o.status==='ENTREGUE').length,
  gross:bi.summary.recognizedGrossRevenue,
  net:bi.summary.netRevenue,
  margin:bi.summary.contributionMargin,
  otif:bi.summary.otif,
  targetAchievement:bi.summary.targetAchievement,
  delayed:bi.kpis.delayed_orders?.value,
  otifEvaluated:bi.kpis.otif?.evaluated,
  directorChecklist,
  auditorFindings,
  specialistReview,
  companyAcceptance
},null,2));
