(function(){
  'use strict';
  const PREFILL_KEY='focado-logistics-freight-prefill-v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const money=v=>n(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmt=(v,d=2)=>n(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const parseMoney=v=>{
    let s=String(v??'').trim().replace(/\s/g,'').replace(/^R\$/i,'');
    if(!s)return 0;
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    const x=Number(s.replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:0;
  };
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const engine=()=>window.FocadoLogisticsEngine;
  const catalog=()=>{
    const ops=load();
    try{window.FocadoProducts?.ensureCatalog?.(ops)}catch(_){}
    return window.FocadoProducts?.getCatalog?.(ops)||[];
  };
  const brandIdFromLabel=(label,snap)=>snap?.brands?.find(b=>String(b.label||'').toLowerCase()===String(label||'').toLowerCase())?.id||'';

  function resultShell(raw,context,basis){
    return {
      source:'FOCADO_LOGISTICS_ENGINE_V1',calculatedAt:Date.now(),basis,
      brand:context.brand||'',boxes:n(raw.boxes),grossWeightKg:n(raw.grossWeightKg),volumeM3:n(raw.volumeM3),
      palletEquivalent:n(raw.palletEquivalent),palletsEstimated:n(raw.palletsEstimated),estimatedMerchandiseValue:n(raw.estimatedMerchandiseValue),
      complete:Boolean(raw.complete),missing:Array.isArray(raw.missing)?raw.missing:[],details:Array.isArray(raw.details)?raw.details:[],context
    };
  }

  async function simulatorLoad(){
    const e=engine();if(!e?.calculateLoad)return null;
    const api=window.FocadoLegacySimulator;if(!api)return null;
    let snap=api.snapshot?.();if(!snap)snap=await api.ready?.();if(!snap)return null;
    const brand=snap.brands?.find(b=>b.id===snap.activeBrand)?.label||'Nova Era';
    const items=(snap.products||[]).filter(p=>n(p.pricing?.qtdCaixas)>0).map(p=>({
      brand,simulatorId:p.id,name:p.name,qty:n(p.pricing.qtdCaixas),pricePerBox:n(p.metrics?.precoComImpostosCaixa)
    }));
    const raw=e.calculateLoad(items,catalog());
    return resultShell(raw,{kind:'simulator',brand,client:'',reference:'Simulação '+brand,destination:'',requestedDate:'',items},'PRECO_COM_IPI_ST');
  }

  function formValue(name){return document.querySelector('#foOrderForm [name="'+name+'"]')?.value||''}
  function orderItems(){
    return [...document.querySelectorAll('#foOrderForm [data-item-row]')].map(row=>({
      simulatorId:row.dataset.productId||'',
      code:row.querySelector('[data-k="code"]')?.value||'',
      name:row.querySelector('[data-k="name"]')?.value||'',
      qty:n(row.querySelector('[data-k="qty"]')?.value),
      basePrice:parseMoney(row.querySelector('[data-k="price"]')?.value)
    })).filter(x=>x.qty>0&&(x.simulatorId||x.code||x.name));
  }

  async function orderLoad(){
    const e=engine();if(!e?.calculateLoad||!document.getElementById('foOrderForm'))return null;
    const brand=formValue('brand')||'Nova Era',uf=String(formValue('uf')||'').toUpperCase(),freightType=String(formValue('freightType')||'CIF').toUpperCase();
    const items=orderItems(),ops=load(),priceMap=new Map();let basis='PRECO_BASE_SEM_IMPOSTOS';
    if(items.length&&uf&&window.FocadoLegacySimulator?.ready&&window.FocadoLegacySimulator?.quoteOrder){
      try{
        const sim=await window.FocadoLegacySimulator.ready(),brandId=brandIdFromLabel(brand,sim),boxes=items.reduce((s,i)=>s+i.qty,0);
        const budget=parseMoney(formValue('logisticsBudget')),freightPerBox=boxes>0?budget/boxes:0;
        const quote=window.FocadoLegacySimulator.quoteOrder({brandId,uf,freightType,manualFreight:true,marginRules:ops.marginRules||{},items:items.filter(i=>i.simulatorId&&i.basePrice>0).map(i=>({productId:i.simulatorId,qty:i.qty,basePrice:i.basePrice,freightPerBox}))});
        if(quote?.ok){for(const row of quote.rows||[])priceMap.set(String(row.productId),n(row.finalPrice));basis='PRECO_COM_IPI_ST'}
      }catch(err){console.warn('[FocadoLogisticsFlow] preço fiscal estimado indisponível',err)}
    }
    const requestItems=items.map(i=>({brand,simulatorId:i.simulatorId,code:i.code,name:i.name,qty:i.qty,pricePerBox:priceMap.get(String(i.simulatorId))||i.basePrice}));
    const raw=e.calculateLoad(requestItems,catalog());
    const city=formValue('city'),state=formValue('uf'),address=formValue('deliveryAddress');
    const destination=[address,[city,state].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    return resultShell(raw,{
      kind:'order',brand,client:formValue('client'),reference:formValue('number'),destination,requestedDate:formValue('requestedDeliveryDate'),
      uf,freightType,items:requestItems
    },basis);
  }

  function missingHtml(snapshot){
    if(snapshot.complete)return '<div class="flog-ok">✓ Parametrização logística completa para os itens da carga.</div>';
    const rows=snapshot.missing.map(x=>'<li><b>'+esc(x.name)+'</b>: '+esc((x.missing||[]).join(', '))+'</li>').join('');
    return '<div class="flog-warning"><b>Dados logísticos incompletos</b><ul>'+rows+'</ul><small>Complete o Cadastro de Produtos antes de usar a cubagem como valor definitivo.</small></div>';
  }
  function detailHtml(snapshot){
    if(!snapshot.details.length)return '';
    return '<details class="flog-details"><summary>Ver composição da carga</summary><div class="flog-detail-list">'+snapshot.details.map(d=>
      '<div><span><b>'+esc(d.name)+'</b><small>'+fmt(d.boxes,0)+' cx'+(d.boxesPerPallet>0?' · '+fmt(d.boxesPerPallet,0)+' cx/pallet':'')+'</small></span><span><b>'+fmt(d.grossWeightKg,1)+' kg</b><small>'+fmt(d.volumeM3,3)+' m³</small></span></div>'
    ).join('')+'</div></details>';
  }
  function summaryHtml(snapshot,kind){
    const insurance=snapshot.basis==='PRECO_COM_IPI_ST';
    return '<div class="flog-head"><div><span>INTELIGÊNCIA LOGÍSTICA</span><h2>Resumo logístico '+(kind==='simulator'?'da simulação':'do pedido')+'</h2><p>Calculado automaticamente a partir do Cadastro de Produtos. Peso, cubagem e palletização não precisam ser redigitados.</p></div></div>'+
      '<div class="flog-kpis"><div><span>Caixas</span><strong>'+fmt(snapshot.boxes,0)+'</strong></div><div><span>Peso bruto</span><strong>'+fmt(snapshot.grossWeightKg,1)+' kg</strong></div><div><span>Cubagem</span><strong>'+fmt(snapshot.volumeM3,3)+' m³</strong></div><div><span>Pallets estimados</span><strong>'+fmt(snapshot.palletsEstimated,0)+'</strong></div><div><span>Valor estimado para seguro</span><strong>'+money(snapshot.estimatedMerchandiseValue)+'</strong><small>'+(insurance?'com IPI/ST estimados':'referência base; informe UF para estimativa fiscal')+'</small></div></div>'+
      missingHtml(snapshot)+detailHtml(snapshot)+
      (snapshot.boxes>0?'<div class="flog-actions"><button type="button" class="flog-btn" data-flog-quote>Solicitar cotação com esta carga</button></div>':'<div class="flog-empty">Informe a quantidade de caixas para gerar peso, cubagem, pallets e valor para seguro.</div>');
  }

  function signature(snapshot){
    return JSON.stringify([snapshot.brand,snapshot.boxes,snapshot.grossWeightKg,snapshot.volumeM3,snapshot.palletsEstimated,snapshot.estimatedMerchandiseValue,snapshot.complete,snapshot.basis,snapshot.context?.destination]);
  }
  function attachQuote(el,snapshot){
    const btn=el.querySelector('[data-flog-quote]');if(btn)btn.onclick=()=>prepareFreight(snapshot);
  }
  async function enhanceSimulator(){
    const page=document.querySelector('.fsim-page');if(!page)return;
    const snapshot=await simulatorLoad();if(!snapshot)return;
    let el=page.querySelector('[data-flog-context="simulator"]');
    if(!el){el=document.createElement('section');el.className='flog-card';el.dataset.flogContext='simulator';const anchor=page.querySelector('.fsim-sheet-card');if(anchor)anchor.before(el);else page.appendChild(el)}
    const sig=signature(snapshot);if(el.dataset.signature===sig)return;el.dataset.signature=sig;el.innerHTML=summaryHtml(snapshot,'simulator');attachQuote(el,snapshot);
  }
  async function enhanceOrder(){
    const form=document.getElementById('foOrderForm');if(!form)return;
    const snapshot=await orderLoad();if(!snapshot)return;
    let el=form.querySelector('[data-flog-context="order"]');
    if(!el){el=document.createElement('section');el.className='fo-card flog-card';el.dataset.flogContext='order';const items=document.getElementById('foItems')?.closest('.fo-card');if(items)items.after(el);else form.appendChild(el)}
    const sig=signature(snapshot);if(el.dataset.signature===sig)return;el.dataset.signature=sig;el.innerHTML=summaryHtml(snapshot,'order');attachQuote(el,snapshot);
  }

  function freightText(snapshot){
    const incomplete=snapshot.complete?'':'\nATENÇÃO: há produto(s) com parametrização logística incompleta no Cadastro de Produtos.';
    const fiscal=snapshot.basis==='PRECO_COM_IPI_ST'?'estimado com IPI/ST':'referência pelo preço base; validar valor fiscal antes da contratação';
    return [
      'Carga calculada automaticamente pelo Focado.',
      'Caixas: '+fmt(snapshot.boxes,0),
      'Peso bruto: '+fmt(snapshot.grossWeightKg,1)+' kg',
      'Cubagem: '+fmt(snapshot.volumeM3,3)+' m³',
      'Pallets estimados: '+fmt(snapshot.palletsEstimated,0),
      'Valor estimado da mercadoria para seguro: '+money(snapshot.estimatedMerchandiseValue)+' ('+fiscal+')'
    ].join('\n')+incomplete;
  }
  function cargoText(snapshot){return snapshot.details.map(d=>d.name+' · '+fmt(d.boxes,0)+' cx').join('; ')}
  function quantityText(snapshot){return fmt(snapshot.boxes,0)+' cx · '+fmt(snapshot.grossWeightKg,1)+' kg · '+fmt(snapshot.volumeM3,3)+' m³ · ~'+fmt(snapshot.palletsEstimated,0)+' pallet(s) · seguro '+money(snapshot.estimatedMerchandiseValue)}
  async function prepareFreight(snapshot){
    if(!(snapshot?.boxes>0)){alert('Informe itens e quantidades antes de solicitar a cotação.');return}
    const c=snapshot.context||{};
    const prefill={client:c.client||'',reference:c.reference||'',origin:'',destination:c.destination||'',cargo:cargoText(snapshot),quantity:quantityText(snapshot),requestedDate:c.requestedDate||'',notes:freightText(snapshot),snapshot};
    try{sessionStorage.setItem(PREFILL_KEY,JSON.stringify(prefill))}catch(err){console.warn('[FocadoLogisticsFlow] prefill',err)}
    try{await window.FocadoModules?.ensure?.('freight-requests')}catch(err){console.warn('[FocadoLogisticsFlow] freight module',err)}
    if(window.FocadoNavigate)window.FocadoNavigate('cotacoes-frete');
    else if(window.FocadoShell?.navigate)window.FocadoShell.navigate('cotacoes-frete');
    else window.FocadoFreightRequests?.render?.('commercial');
    schedule(80);
  }

  function field(id,value){const el=document.getElementById(id);if(el&&value!=null&&!String(el.value||'').trim())el.value=String(value)}
  function freightPreview(prefill){
    const s=prefill.snapshot;if(!s)return '';
    return '<div class="flog-freight-preview"><span>CARGA CALCULADA PELO FOCADO</span><div><b>'+fmt(s.boxes,0)+' cx</b><b>'+fmt(s.grossWeightKg,1)+' kg</b><b>'+fmt(s.volumeM3,3)+' m³</b><b>~'+fmt(s.palletsEstimated,0)+' pallet(s)</b><b>'+money(s.estimatedMerchandiseValue)+' seguro</b></div>'+(s.complete?'':'<small>⚠ Existem dados logísticos incompletos no cadastro.</small>')+'</div>';
  }
  function hydrateFreightPrefill(){
    let raw;try{raw=sessionStorage.getItem(PREFILL_KEY)}catch(_){return}if(!raw)return;
    let prefill;try{prefill=JSON.parse(raw)}catch(_){try{sessionStorage.removeItem(PREFILL_KEY)}catch(__){}return}
    const page=document.querySelector('.fr-page');if(!page)return;
    if(!document.getElementById('frClient')){const btn=document.getElementById('frNew');if(btn){btn.click();schedule(40)}return}
    const modal=document.querySelector('.fr-modal');if(!modal||modal.dataset.flogPrefilled==='1')return;
    modal.dataset.flogPrefilled='1';
    field('frClient',prefill.client);field('frReference',prefill.reference);field('frOrigin',prefill.origin);field('frDestination',prefill.destination);field('frCargo',prefill.cargo);field('frQuantity',prefill.quantity);field('frDate',prefill.requestedDate);field('frNotes',prefill.notes);
    const form=modal.querySelector('.fr-form');if(form&&prefill.snapshot)form.insertAdjacentHTML('beforebegin',freightPreview(prefill));
    try{sessionStorage.removeItem(PREFILL_KEY)}catch(_){}
  }

  let runTimer=0,running=false,rerun=false;
  function schedule(delay=70){clearTimeout(runTimer);runTimer=setTimeout(run,delay)}
  async function run(){
    if(running){rerun=true;return}running=true;
    try{await enhanceSimulator();await enhanceOrder();hydrateFreightPrefill()}catch(err){console.warn('[FocadoLogisticsFlow]',err)}finally{running=false;if(rerun){rerun=false;schedule(80)}}
  }
  const observer=new MutationObserver(()=>schedule(90));
  const start=()=>{if(document.body)observer.observe(document.body,{childList:true,subtree:true});schedule(0)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  document.addEventListener('input',e=>{if(e.target?.closest?.('.fsim-page,#foOrderForm'))schedule(90)},true);
  document.addEventListener('change',e=>{if(e.target?.closest?.('.fsim-page,#foOrderForm'))schedule(40)},true);
  window.addEventListener('focado:ops-updated',()=>schedule(80));

  window.FocadoLogisticsFlow=Object.freeze({refresh:()=>schedule(0),simulatorLoad,orderLoad,prepareFreight,prefillKey:PREFILL_KEY});
})();