(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const parseMoney=v=>{const s=String(v??'').trim();if(!s)return 0;if(s.includes(','))return Number(s.replace(/[^0-9,-]/g,'').replace(/\./g,'').replace(',','.'))||0;return Number(s.replace(/[^0-9.-]/g,''))||0};
let lastDraft=null,lastEstimate=null,timer=0,currentOrderId='';

function value(name){return document.querySelector('[name="'+name+'"]')?.value||''}
function itemsFromDom(){
  return [...document.querySelectorAll('[data-item-row]')].map(r=>({
    productId:r.dataset.productId||'',
    name:r.querySelector('[data-k="name"]')?.value||'',
    qty:Number(r.querySelector('[data-k="qty"]')?.value)||0,
    basePrice:parseMoney(r.querySelector('[data-k="price"]')?.value||0)
  }));
}
function brandId(label,snap){return snap?.brands?.find(b=>String(b.label||'').toLowerCase()===String(label||'').toLowerCase())?.id||''}
function ensureBox(){
  let box=document.getElementById('foLogisticsSummary');
  if(box)return box;
  const profit=document.querySelector('.fo-order-profit');
  if(!profit)return null;
  profit.insertAdjacentHTML('afterend','<div id="foLogisticsSummary" class="fo-logistics-summary"><span>FICHA LOGÍSTICA</span><b>Informe os produtos e quantidades para calcular peso e cubagem.</b></div>');
  return document.getElementById('foLogisticsSummary');
}
function buildDraft(payload,e){
  lastDraft={
    source:'PEDIDO',sourceOrderId:String(currentOrderId||''),sourceOrderNumber:String(value('number')||''),
    client:String(value('client')||''),brand:String(value('brand')||''),
    destination:String(value('deliveryAddress')||[value('city'),value('uf')].filter(Boolean).join('/')||''),
    requestedDate:String(value('requestedDeliveryDate')||''),
    cargo:payload.map(x=>x.name+' x '+x.qtyBoxes+' cx').join(' | '),quantity:e.totalBoxes+' caixas',
    items:payload,logisticsEstimate:e
  };
}
function paint(payload,e){
  const box=ensureBox();if(!box)return;
  lastEstimate=e;buildDraft(payload,e);
  if(!e.totalBoxes){
    box.className='fo-logistics-summary';
    box.innerHTML='<span>FICHA LOGÍSTICA</span><b>Informe os produtos e quantidades para calcular peso e cubagem.</b>';
    return;
  }
  const alerts=[];
  if(e.missing?.length)alerts.push(e.missing.length+' item(ns) sem ficha logística');
  if(e.volumeMissing?.length)alerts.push('cubagem incompleta');
  box.className='fo-logistics-summary ready';
  box.innerHTML='<div class="fo-logistics-title"><span>FICHA LOGÍSTICA AUTOMÁTICA</span><b>'+e.totalBoxes+' cx · '+Number(e.weightKg).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg · '+Number(e.volumeM3).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' m³</b><small>'+e.estimatedPallets+' pallet(s) estimado(s) · Mercadoria/NF est. '+money(e.merchandiseValue)+(alerts.length?' · '+esc(alerts.join(' / ')):'')+'</small></div><button type="button" id="foPrepareFreight">Preparar cotação de frete →</button>';
  const btn=document.getElementById('foPrepareFreight');if(btn)btn.onclick=prepare;
}
async function compute(){
  const engine=window.FocadoLogisticsReference,items=itemsFromDom();
  if(!engine?.estimate)return null;
  let payload=items.filter(x=>x.qty>0).map(x=>({productId:x.productId,name:x.name,qtyBoxes:x.qty,unitValue:0}));
  let e=engine.estimate(payload);paint(payload,e);
  const uf=String(value('uf')||'').toUpperCase(),label=value('brand');
  const valid=items.filter(x=>x.productId&&x.qty>0&&x.basePrice>0);
  if(!window.FocadoLegacySimulator||!uf||!valid.length)return e;
  try{
    const snap=await window.FocadoLegacySimulator.ready(),bid=brandId(label,snap),ft=String(value('freightType')||'CIF').toUpperCase();
    const budget=parseMoney(value('logisticsBudget')),total=valid.reduce((a,x)=>a+x.qty,0),freightPerBox=total?budget/total:0;
    const quote=window.FocadoLegacySimulator.quoteOrder({brandId:bid,uf,freightType:ft,manualFreight:true,items:valid.map(x=>({productId:x.productId,qty:x.qty,basePrice:x.basePrice,freightPerBox}))});
    if(!quote?.ok)return e;
    const qmap=new Map((quote.rows||[]).map(x=>[String(x.productId),x]));
    payload=items.filter(x=>x.qty>0).map(x=>({productId:x.productId,name:x.name,qtyBoxes:x.qty,unitValue:Number(qmap.get(String(x.productId))?.finalPrice||0)}));
    e=engine.estimate(payload);paint(payload,e);return e;
  }catch(err){console.warn('[OrderLogistics]',err);return e}
}
function schedule(){clearTimeout(timer);timer=setTimeout(compute,100)}
function attach(orderId=''){
  currentOrderId=orderId;
  const form=document.getElementById('foOrderForm');if(!form)return;
  ensureBox();
  if(form.dataset.logisticsBound!=='1'){
    form.dataset.logisticsBound='1';
    form.addEventListener('input',schedule);
    form.addEventListener('change',schedule);
  }
  schedule();
}
function prepare(){
  if(!lastDraft?.logisticsEstimate?.totalBoxes)return;
  try{sessionStorage.setItem('focado-freight-draft',JSON.stringify(lastDraft));sessionStorage.setItem('focado-freight-draft-autostart','1')}catch(_){}
  window.FocadoNavigate?.('cotacoes-frete');
}
function last(){return lastEstimate}
window.FocadoOrderLogistics=Object.freeze({attach,compute,prepare,lastEstimate:last});
})();