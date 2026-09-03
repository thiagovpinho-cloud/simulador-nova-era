(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let lastDraft=null,lastEstimate=null;

function render(opts={}){
  const box=document.getElementById(opts.boxId||'foLogisticsSummary');
  const engine=window.FocadoLogisticsReference;
  if(!box||!engine?.estimate)return null;
  const quoteRows=new Map((opts.quote?.rows||[]).map(x=>[String(x.productId),x]));
  const payload=(opts.items||[]).filter(x=>Number(x.qty)>0).map(x=>({
    productId:x.productId,name:x.name,qtyBoxes:Number(x.qty)||0,
    unitValue:Number(quoteRows.get(String(x.productId))?.finalPrice||0)
  }));
  const e=engine.estimate(payload);
  lastEstimate=e;
  lastDraft={
    source:'PEDIDO',sourceOrderId:String(opts.orderId||''),sourceOrderNumber:String(opts.orderNumber||''),
    client:String(opts.client||''),brand:String(opts.brand||''),destination:String(opts.destination||''),
    requestedDate:String(opts.requestedDate||''),cargo:payload.map(x=>x.name+' x '+x.qtyBoxes+' cx').join(' | '),
    quantity:e.totalBoxes+' caixas',items:payload,logisticsEstimate:e
  };
  if(!e.totalBoxes){
    box.className='fo-logistics-summary';
    box.innerHTML='<span>FICHA LOGÍSTICA</span><b>Informe os produtos e quantidades para calcular peso e cubagem.</b>';
    return e;
  }
  const alerts=[];
  if(e.missing?.length)alerts.push(e.missing.length+' item(ns) sem ficha logística');
  if(e.volumeMissing?.length)alerts.push('cubagem incompleta');
  box.className='fo-logistics-summary ready';
  box.innerHTML='<div class="fo-logistics-title"><span>FICHA LOGÍSTICA AUTOMÁTICA</span><b>'+e.totalBoxes+' cx · '+Number(e.weightKg).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg · '+Number(e.volumeM3).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' m³</b><small>'+e.estimatedPallets+' pallet(s) estimado(s) · Mercadoria/NF est. '+money(e.merchandiseValue)+(alerts.length?' · '+esc(alerts.join(' / ')):'')+'</small></div><button type="button" id="foPrepareFreight">Preparar cotação de frete →</button>';
  const btn=document.getElementById('foPrepareFreight');
  if(btn)btn.onclick=prepare;
  return e;
}
function prepare(){
  if(!lastDraft?.logisticsEstimate?.totalBoxes)return;
  try{
    sessionStorage.setItem('focado-freight-draft',JSON.stringify(lastDraft));
    sessionStorage.setItem('focado-freight-draft-autostart','1');
  }catch(_){}
  window.FocadoNavigate?.('cotacoes-frete');
}
function last(){return lastEstimate}
window.FocadoOrderLogistics=Object.freeze({render,prepare,lastEstimate:last});
})();