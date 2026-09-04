import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const shell=read('assets/app-shell.js');
const shellCss=read('assets/app-shell.css');
const css={
  orders:read('assets/modules/orders.css'),
  customers:read('assets/modules/customers.css'),
  pcp:read('assets/modules/pcp.css'),
  production:read('assets/modules/production.css'),
  inventory:read('assets/modules/inventory.css'),
  logistics:read('assets/modules/logistics.css'),
  cockpit:read('assets/modules/indicators.css'),
  purchases:read('assets/modules/purchases.css'),
  finance:read('assets/modules/finance.css'),
  kanban:read('assets/modules/kanban.css'),
  simulator:read('assets/modules/simulator.css')
};

// TESTE DE FOGO MOBILE — fluxo completo em telefone.
// Cenário-alvo: 390px de largura, uso por toque, leitura sem desktop espremido.
const checks={
  viewport:index.includes('viewport-fit=cover')&&!index.includes('maximum-scale=1'),
  dynamicViewport:shellCss.includes('height:100dvh'),
  mobileDrawer:shell.includes('fxMobileBackdrop')&&shellCss.includes('.fx-mobile-backdrop'),
  drawerClosesOnOutsideTap:shell.includes("$('#fxMobileBackdrop').onclick=closeMobileNav"),
  drawerClosesOnEscape:shell.includes("if(e.key==='Escape')closeMobileNav()"),
  touchTargets:shellCss.includes('width:44px;height:44px')&&shellCss.includes('min-height:46px'),
  readableMobileInputs:shellCss.includes('font-size:16px!important'),

  customerCards:css.customers.includes('.fc-table thead{display:none}'),
  customerSingleColumn:css.customers.includes('.fc-grid{grid-template-columns:1fr!important'),
  orderCards:css.orders.includes('.fo-table thead{display:none}'),
  orderActionsTouch:css.orders.includes('min-height:42px'),
  orderSingleColumn:css.orders.includes('.fo-fields{grid-template-columns:1fr!important'),

  pcpCards:css.pcp.includes('.fpcp-table thead{display:none}'),
  pcpFieldsTouch:css.pcp.includes('min-height:44px;font-size:16px'),
  productionCards:css.production.includes('.fpr-table thead{display:none}'),
  inventoryCards:css.inventory.includes('.fi-table thead{display:none}'),
  logisticsCards:css.logistics.includes('.fl-table thead{display:none}'),
  logisticsStickyAction:css.logistics.includes('position:sticky;bottom:8px'),

  cockpitResponsive:css.cockpit.includes('Cockpit / Indicadores — Mobile UX v2'),
  cockpitFiltersTouch:css.cockpit.includes('min-height:44px;font-size:16px'),
  cockpitBottomSheet:css.cockpit.includes('.fbi-modal{align-items:end'),

  purchasesCards:css.purchases.includes('.fpur-table-wrap thead{display:none}'),
  financeTouch:css.finance.includes('Financeiro — Mobile UX v3'),
  kanbanSnap:css.kanban.includes('scroll-snap-type:x mandatory'),
  simulatorTouch:css.simulator.includes('Simulador — mobile-first presentation')
};

const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
assert.deepEqual(failed,[],'Teste de Fogo Mobile encontrou bloqueadores: '+failed.join(', '));

// Fluxo crítico deve continuar roteável no mesmo shell.
for(const route of ['clientes','pedidos','pcp','production','inventory','logistica','cockpit']){
  assert.ok(shell.includes("id==='"+route+"'"),'Fluxo mobile perdeu rota: '+route);
}

// Nenhuma das áreas críticas deve depender só de tabela desktop no mobile.
for(const [name,content] of Object.entries({
  clientes:css.customers,pedidos:css.orders,pcp:css.pcp,producao:css.production,estoque:css.inventory,logistica:css.logistics
})){
  assert.ok(content.includes('display:none}'),name+' precisa ocultar cabeçalho de tabela desktop no mobile');
}

console.log('teste-de-fogo-mobile: APROVADO');
console.log(JSON.stringify({checks,failed,criticalFlow:['clientes','pedidos','pcp','production','inventory','logistica','cockpit']},null,2));
