(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const moneyField=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const dateTime=v=>v?new Date(Number(v)).toLocaleString('pt-BR'):'—';
  const role=()=>String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
  const user=()=>window.FocadoAuth?.getUser?.()?.name||window.FocadoAuth?.roleLabel?.()||'Usuário';
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const requests=()=>Array.isArray(load().freightRequests)?load().freightRequests:[];
  const statusLabel=s=>({SOLICITADA:'Solicitada',EM_COTACAO:'Em cotação',RESPONDIDA:'Respondida'})[s]||s||'—';
  const canCommercial=()=>['COMERCIAL','ADMIN','DIRETOR','GESTOR'].includes(role());
  const canLogistics=()=>['LOGISTICA','ADMIN'].includes(role());
  let requestDraft=null;
  function storedDraft(){
    if(requestDraft)return requestDraft;
    try{requestDraft=JSON.parse(sessionStorage.getItem('focado-freight-draft')||'null')}catch(_){requestDraft=null}
    return requestDraft;
  }
  function logisticsPreview(e){
    if(!e||!Number(e.totalBoxes))return '';
    const cubage=Number(e.volumeM3||0).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' m³';
    const weight=Number(e.weightKg||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg';
    return '<div class="fr-logistics-box"><div class="fr-logistics-title"><span>FICHA LOGÍSTICA AUTOMÁTICA</span><b>Peso, cubagem e valor para cotação</b></div><div class="fr-logistics-grid">'+
      '<div><span>Caixas</span><strong>'+Number(e.totalBoxes||0).toLocaleString('pt-BR')+'</strong></div>'+
      '<div><span>Peso bruto</span><strong>'+weight+'</strong></div>'+
      '<div><span>Cubagem</span><strong>'+cubage+'</strong></div>'+
      '<div><span>Pallets est.</span><strong>'+Number(e.estimatedPallets||0).toLocaleString('pt-BR')+'</strong></div>'+
      '<div><span>Mercadoria / NF est.</span><strong>'+money(e.merchandiseValue||0)+'</strong></div>'+
      '</div>'+((e.missing?.length||e.volumeMissing?.length)?'<p class="fr-logistics-alert">Há item(ns) sem ficha logística completa. A Logística deve validar a cubagem antes de fechar a cotação.</p>':'')+'</div>';
  }

  function cargoReferenceOptions(selected){
    const rows=window.FocadoLogisticsReference?.rows||[];
    return '<option value="">Selecione o produto</option>'+rows.map(r=>'<option value="'+esc(r.key)+'" '+(String(selected||'')===String(r.key)?'selected':'')+'>'+esc(r.name)+'</option>').join('');
  }
  function cargoBuilderRow(item={},index=0){
    return '<div class="fr-cargo-row" data-fr-cargo-row><select data-fr-cargo-product>'+cargoReferenceOptions(item.referenceKey||item.productId)+'</select><input data-fr-cargo-qty type="number" min="0" step="1" value="'+esc(item.qtyBoxes||'')+'" placeholder="Caixas"><div class="fr-cargo-money"><span>R$</span><input data-fr-cargo-value inputmode="decimal" value="'+moneyField(item.unitValue||'')+'" placeholder="Valor/cx"></div><button type="button" data-fr-cargo-remove title="Remover">×</button></div>';
  }
  function cargoBuilderHtml(items=[]){
    const rows=items.length?items:[{}];
    return '<div class="fr-cargo-builder"><div class="fr-cargo-builder-head"><div><span>COMPOSIÇÃO DA CARGA</span><b>Produtos, caixas e valor para seguro</b><small>Peso, cubagem e pallets são calculados pela tabela logística interna.</small></div><button type="button" id="frAddCargo">+ Produto</button></div><div id="frCargoRows">'+rows.map(cargoBuilderRow).join('')+'</div></div>';
  }
  function parseCargoMoney(v){
    const s=String(v??'').trim();if(!s)return 0;
    if(s.includes(','))return Number(s.replace(/[^0-9,-]/g,'').replace(/\./g,'').replace(',','.'))||0;
    return Number(s.replace(/[^0-9.-]/g,''))||0;
  }
  function refreshCargoBuilder(){
    const rows=[...document.querySelectorAll('[data-fr-cargo-row]')];
    const refs=window.FocadoLogisticsReference?.rows||[];
    const items=rows.map(row=>{
      const key=row.querySelector('[data-fr-cargo-product]')?.value||'';
      const ref=refs.find(x=>String(x.key)===String(key));
      return {productId:key,referenceKey:key,name:ref?.name||'',qtyBoxes:Number(row.querySelector('[data-fr-cargo-qty]')?.value)||0,unitValue:parseCargoMoney(row.querySelector('[data-fr-cargo-value]')?.value)};
    }).filter(x=>x.productId&&x.qtyBoxes>0);
    const e=window.FocadoLogisticsReference?.estimate?.(items)||null;
    const preview=document.getElementById('frLogisticsDynamic');if(preview)preview.innerHTML=logisticsPreview(e);
    const cargo=items.map(x=>x.name+' x '+x.qtyBoxes+' cx').join(' | ');
    const cargoInput=$('#frCargo'),quantity=$('#frQuantity');
    if(cargoInput)cargoInput.value=cargo;
    if(quantity)quantity.value=e?.totalBoxes?(e.totalBoxes+' caixas'):'';
    requestDraft={...(requestDraft||{}),source:'COTACAO_AVULSA',cargo,quantity:e?.totalBoxes?(e.totalBoxes+' caixas'):'',items,logisticsEstimate:e};
    return e;
  }
  function bindCargoBuilder(){
    const rows=document.getElementById('frCargoRows');if(!rows)return;
    const bind=()=>{
      rows.querySelectorAll('select,input').forEach(el=>{el.onchange=refreshCargoBuilder;el.oninput=refreshCargoBuilder});
      rows.querySelectorAll('[data-fr-cargo-remove]').forEach(btn=>btn.onclick=()=>{if(rows.children.length>1)btn.closest('[data-fr-cargo-row]').remove();else{const row=btn.closest('[data-fr-cargo-row]');row.querySelectorAll('select,input').forEach(el=>el.value='')}refreshCargoBuilder()});
    };
    const add=document.getElementById('frAddCargo');
    if(add)add.onclick=()=>{rows.insertAdjacentHTML('beforeend',cargoBuilderRow({},rows.children.length));bind()};
    bind();refreshCargoBuilder();
  }

  function ensureOverlay(){
    let el=$('#frOverlay');
    if(el)return el;
    el=document.createElement('div');el.id='frOverlay';el.className='fr-overlay';el.hidden=true;
    document.body.appendChild(el);return el;
  }
  function closeModal(){const el=ensureOverlay();el.hidden=true;el.innerHTML=''}
  function modal(html){const el=ensureOverlay();el.innerHTML='<div class="fr-modal" role="dialog" aria-modal="true">'+html+'</div>';el.hidden=false;el.onclick=e=>{if(e.target===el)closeModal()};return el}
  function content(){return document.getElementById('fxContent')}

  function render(mode){
    const el=content();if(!el)return;
    const logistics=mode==='logistics'||(role()==='LOGISTICA'&&!canCommercial());
    const rows=requests().slice().sort((a,b)=>Number(b.requestedAt||0)-Number(a.requestedAt||0));
    const pending=rows.filter(r=>['SOLICITADA','EM_COTACAO'].includes(r.status)).length;
    const answered=rows.filter(r=>r.status==='RESPONDIDA').length;
    el.innerHTML='<div class="fr-page">'+
      '<div class="fr-head"><div><span class="fr-eyebrow">'+(logistics?'LOGÍSTICA':'COMERCIAL')+'</span><h1>'+(logistics?'Cotações recebidas':'Cotação de frete')+'</h1><p>'+(logistics?'Demandas formais enviadas pelo Comercial.':'Canal formal e independente para solicitar preços à Logística.')+'</p></div>'+
      (!logistics&&canCommercial()?'<button class="fr-btn primary" id="frNew">+ Solicitar cotação</button>':'')+'</div>'+
      '<div class="fr-kpis"><div><span>Pendentes</span><strong>'+pending+'</strong></div><div><span>Respondidas</span><strong>'+answered+'</strong></div><div><span>Histórico</span><strong>'+rows.length+'</strong></div></div>'+
      '<div class="fr-panel"><div class="fr-panel-head"><h2>Histórico de comportamento de frete</h2><span>'+rows.length+' registro(s)</span></div>'+
      (rows.length?'<div class="fr-list">'+rows.map(r=>card(r,logistics)).join('')+'</div>':'<div class="fr-empty">Nenhuma solicitação registrada ainda.</div>')+
      '</div></div>';
    $('#frNew')?.addEventListener('click',openRequestModal);
    el.querySelectorAll('[data-fr-open]').forEach(b=>b.onclick=()=>openDetail(b.dataset.frOpen,logistics));
    if(!logistics&&storedDraft()){
      try{
        if(sessionStorage.getItem('focado-freight-draft-autostart')==='1'){
          sessionStorage.removeItem('focado-freight-draft-autostart');
          setTimeout(openRequestModal,0);
        }
      }catch(_){}
    }
  }

  function bestQuote(r){return (r.quotes||[]).slice().sort((a,b)=>Number(a.value||0)-Number(b.value||0))[0]}
  function card(r,logistics){
    const best=bestQuote(r);
    return '<button class="fr-card" data-fr-open="'+esc(r.id)+'"><div class="fr-card-main"><div class="fr-card-top"><b>'+esc(r.origin||'—')+' → '+esc(r.destination||'—')+'</b><span class="fr-status '+String(r.status||'').toLowerCase()+'">'+esc(statusLabel(r.status))+'</span></div><p>'+esc(r.client||r.reference||r.cargo||'Solicitação de frete')+'</p><small>'+dateTime(r.requestedAt)+' · '+esc(r.requestedBy||'Comercial')+'</small></div><div class="fr-card-value">'+(best?'<span>Melhor cotação</span><strong>'+money(best.value)+'</strong><small>'+esc(best.provider)+'</small>':(logistics?'<span class="fr-respond-cta"><span>Responder cotação</span><i aria-hidden="true">→</i></span>':'<strong>Aguardando</strong>'))+'</div></button>';
  }

  function openRequestModal(){
    const draft=storedDraft()||{};
    const destination=draft.destination||'';
    const origin=draft.origin||'';
    const externalDraft=Boolean(draft.source&&draft.source!=='COTACAO_AVULSA');
    const el=modal('<div class="fr-modal-head"><div><span class="fr-eyebrow">NOVA DEMANDA</span><h2>Solicitar cotação de frete</h2><p>'+(externalDraft?'Carga preparada automaticamente a partir de '+esc(draft.source)+'.':'Monte a carga abaixo e o Focado calcula peso, cubagem, pallets e valor estimado para seguro.')+'</p></div><button class="fr-close" id="frClose">×</button></div>'+
      '<div id="frLogisticsDynamic">'+logisticsPreview(draft.logisticsEstimate)+'</div>'+
      (!externalDraft?cargoBuilderHtml(draft.items||[]):'')+
      '<div class="fr-form">'+
      '<label><span>Cliente / referência <em>opcional</em></span><input id="frClient" value="'+esc(draft.client||'')+'" placeholder="Cliente, oportunidade ou referência"></label>'+
      '<label><span>Nº de referência <em>opcional</em></span><input id="frReference" value="'+esc(draft.reference||draft.sourceOrderNumber||'')+'" placeholder="Pedido, orçamento, proposta..."></label>'+
      '<label><span>Origem *</span><input id="frOrigin" value="'+esc(origin)+'" placeholder="Cidade/UF ou endereço de coleta"></label>'+
      '<label><span>Destino *</span><input id="frDestination" value="'+esc(destination)+'" placeholder="Cidade/UF ou endereço de entrega"></label>'+
      '<label><span>Carga / produto</span><input id="frCargo" value="'+esc(draft.cargo||'')+'" placeholder="Descrição da carga"></label>'+
      '<label><span>Quantidade / volume</span><input id="frQuantity" value="'+esc(draft.quantity||'')+'" placeholder="Ex.: 120 caixas, 2 pallets"></label>'+
      '<label><span>Data desejada</span><input id="frDate" type="date" value="'+esc(draft.requestedDate||'')+'"></label>'+
      '<label class="wide"><span>Mensagem para a Logística</span><textarea id="frNotes" placeholder="Urgência, restrições, veículo, janela de entrega...">'+esc(draft.notes||'')+'</textarea></label>'+
      '</div><div class="fr-modal-actions"><button class="fr-btn secondary" id="frCancel">Cancelar</button><button class="fr-btn primary" id="frSend">Enviar para Logística</button></div>');
    el.querySelector('#frClose').onclick=closeModal;el.querySelector('#frCancel').onclick=closeModal;
    el.querySelector('#frSend').onclick=sendRequest;
    if(!externalDraft)bindCargoBuilder();
  }

  async function sendRequest(){
    const origin=$('#frOrigin').value.trim(),destination=$('#frDestination').value.trim();
    if(!origin||!destination){alert('Informe origem e destino.');return}
    const btn=$('#frSend');btn.disabled=true;btn.textContent='Enviando…';
    try{
      const at=Date.now();
      const result=await window.FocadoDataStore.saveDomain('COTACAO_FRETE_COMERCIAL',{request:{
        id:'frq_'+at+'_'+Math.random().toString(36).slice(2,6),requestedAt:at,requestedBy:user(),
        client:$('#frClient').value.trim(),reference:$('#frReference').value.trim(),
        origin,destination,cargo:$('#frCargo').value.trim(),quantity:$('#frQuantity').value.trim(),
        requestedDate:$('#frDate').value,notes:$('#frNotes').value.trim(),
        source:String(storedDraft()?.source||''),brand:String(storedDraft()?.brand||''),
        sourceOrderId:String(storedDraft()?.sourceOrderId||''),sourceOrderNumber:String(storedDraft()?.sourceOrderNumber||''),
        items:Array.isArray(storedDraft()?.items)?storedDraft().items:[],
        logisticsEstimate:storedDraft()?.logisticsEstimate||null
      }});
      if(!result?.ok)throw new Error(result?.error||'Falha ao registrar');
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      try{sessionStorage.removeItem('focado-freight-draft');sessionStorage.removeItem('focado-freight-draft-autostart')}catch(_){}
      requestDraft=null;
      closeModal();render('commercial');
      alert('Solicitação enviada formalmente para a Logística.');
    }catch(err){alert('Não foi possível enviar a cotação. '+String(err.message||''))}
    finally{btn.disabled=false;btn.textContent='Enviar para Logística'}
  }

  async function openDetail(id,logistics){
    const r=requests().find(x=>String(x.id)===String(id));if(!r)return;
    if(logistics&&canLogistics())return openLogisticsResponse(r);
    const best=bestQuote(r);
    const el=modal('<div class="fr-modal-head"><div><span class="fr-eyebrow">SOLICITAÇÃO FORMAL</span><h2>'+esc(r.origin)+' → '+esc(r.destination)+'</h2><p>'+dateTime(r.requestedAt)+' · '+esc(r.requestedBy)+'</p></div><button class="fr-close" id="frClose">×</button></div>'+
      requestSummary(r)+
      (r.status==='RESPONDIDA'?'<div class="fr-response"><h3>Retorno da Logística</h3><div class="fr-quote-grid">'+(r.quotes||[]).slice().sort((a,b)=>a.value-b.value).map((q,i)=>'<div class="fr-quote '+(i===0?'best':'')+'"><span>'+(i===0?'MENOR VALOR':'OPÇÃO '+(i+1))+'</span><b>'+esc(q.provider)+'</b><strong>'+money(q.value)+'</strong><small>'+(q.transitDays?q.transitDays+' dia(s)':'Prazo não informado')+(q.notes?' · '+esc(q.notes):'')+'</small></div>').join('')+'</div>'+(r.responseNotes?'<p>'+esc(r.responseNotes)+'</p>':'')+'</div>':'<div class="fr-wait">Aguardando retorno da Logística.</div>')+
      historyHtml(r)+
      '<div class="fr-modal-actions"><button class="fr-btn primary" id="frDone">Fechar</button></div>');
    el.querySelector('#frClose').onclick=closeModal;el.querySelector('#frDone').onclick=closeModal;
    if(r.status==='RESPONDIDA'&&!r.commercialViewedAt&&canCommercial()){
      const result=await window.FocadoDataStore.saveDomain('COTACAO_FRETE_COMERCIAL',{requestId:r.id,viewed:{at:Date.now(),by:user()}});
      if(result?.payload)window.FocadoDataStore.writeLocal(result.payload);
    }
  }

  function requestSummary(r){
    return '<div class="fr-summary"><div><span>Cliente / referência</span><b>'+esc(r.client||r.reference||'—')+'</b></div><div><span>Carga</span><b>'+esc(r.cargo||'—')+'</b></div><div><span>Quantidade</span><b>'+esc(r.quantity||'—')+'</b></div><div><span>Data desejada</span><b>'+esc(r.requestedDate||'—')+'</b></div><div class="wide"><span>Mensagem</span><b>'+esc(r.notes||'Sem observação')+'</b></div></div>'+logisticsPreview(r.logisticsEstimate);
  }

  function quoteRow(i){
    return '<div class="fr-quote-row" data-quote-row><div class="fr-row-title"><b>Opção '+(i+1)+'</b><button type="button" data-remove>×</button></div><div class="fr-form"><label><span>Prestador *</span><input data-q="provider" placeholder="Transportadora / prestador"></label><label><span>Valor *</span><input data-q="value" inputmode="decimal" placeholder="R$ 0,00"></label><label><span>Prazo (dias)</span><input data-q="days" type="number" min="0"></label><label><span>Coleta prevista</span><input data-q="pickup" type="date"></label><label class="wide"><span>Observação</span><input data-q="notes" placeholder="Condição, veículo, pedágio..."></label></div></div>';
  }
  function bindRemove(){
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const rows=document.querySelectorAll('[data-quote-row]');if(rows.length>1)b.closest('[data-quote-row]').remove()});
  }
  function bindMoneyFields(root=document){
    root.querySelectorAll('[data-q="value"]').forEach(input=>{
      if(input.dataset.moneyBound==='1')return;
      input.dataset.moneyBound='1';
      input.addEventListener('focus',()=>{
        const n=parseMoney(input.value);
        input.value=n?moneyField(n):'';
        requestAnimationFrame(()=>input.select());
      });
      input.addEventListener('blur',()=>{
        const n=parseMoney(input.value);
        input.value=n?money(n):'';
      });
    });
  }

  async function openLogisticsResponse(r){
    if(!r.logisticsViewedAt){
      const opened=await window.FocadoDataStore.saveDomain('COTACAO_FRETE_LOGISTICA',{requestId:r.id,opened:{at:Date.now(),by:user()}});
      if(opened?.payload)window.FocadoDataStore.writeLocal(opened.payload);
      r=requests().find(x=>String(x.id)===String(r.id))||r;
    }
    const el=modal('<div class="fr-modal-head"><div><span class="fr-eyebrow">DEMANDA DO COMERCIAL</span><h2>'+esc(r.origin)+' → '+esc(r.destination)+'</h2><p>Solicitado por '+esc(r.requestedBy)+' · '+dateTime(r.requestedAt)+'</p></div><button class="fr-close" id="frClose">×</button></div>'+
      requestSummary(r)+
      '<div class="fr-response-form"><h3>Executar cotação</h3><div id="frQuoteRows">'+quoteRow(0)+'</div><button class="fr-btn secondary" id="frAdd">+ Adicionar prestador</button><label class="fr-note"><span>Observação geral da Logística</span><textarea id="frResponseNotes" placeholder="Condições gerais, recomendação, restrições..."></textarea></label></div>'+
      '<div class="fr-modal-actions"><button class="fr-btn secondary" id="frCancel">Cancelar</button><button class="fr-btn primary" id="frRespond">Devolver ao Comercial</button></div>');
    el.querySelector('#frClose').onclick=closeModal;el.querySelector('#frCancel').onclick=closeModal;
    el.querySelector('#frAdd').onclick=()=>{const box=$('#frQuoteRows'),n=box.querySelectorAll('[data-quote-row]').length;if(n>=6)return;box.insertAdjacentHTML('beforeend',quoteRow(n));bindRemove();bindMoneyFields(box)};
    bindRemove();bindMoneyFields(el);el.querySelector('#frRespond').onclick=()=>sendResponse(r.id);
  }

  function parseMoney(v){const s=String(v||'').trim();if(!s)return 0;return s.includes(',')?Number(s.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0:Number(s.replace(/[^0-9.-]/g,''))||0}
  async function sendResponse(id){
    const quotes=[...document.querySelectorAll('[data-quote-row]')].map((row,i)=>({
      id:'frqo_'+Date.now()+'_'+i,provider:row.querySelector('[data-q="provider"]').value.trim(),
      value:parseMoney(row.querySelector('[data-q="value"]').value),transitDays:Number(row.querySelector('[data-q="days"]').value||0),
      pickupEstimate:row.querySelector('[data-q="pickup"]').value,notes:row.querySelector('[data-q="notes"]').value.trim()
    })).filter(x=>x.provider||x.value);
    if(!quotes.length||quotes.some(x=>!x.provider||!(x.value>0))){alert('Preencha prestador e valor em todas as opções.');return}
    const btn=$('#frRespond');btn.disabled=true;btn.textContent='Enviando…';
    try{
      const result=await window.FocadoDataStore.saveDomain('COTACAO_FRETE_LOGISTICA',{requestId:id,response:{quotes,notes:$('#frResponseNotes').value.trim(),respondedAt:Date.now(),respondedBy:user()}});
      if(!result?.ok)throw new Error(result?.error||'Falha ao responder');
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      closeModal();render('logistics');alert('Cotação devolvida formalmente ao Comercial.');
    }catch(err){alert('Não foi possível devolver a cotação. '+String(err.message||''))}
    finally{btn.disabled=false;btn.textContent='Devolver ao Comercial'}
  }

  function historyHtml(r){
    const h=(r.history||[]).slice(0,12);
    return '<div class="fr-history"><h3>Histórico</h3>'+h.map(x=>'<div><span>'+dateTime(x.at)+'</span><b>'+esc(({SOLICITADA:'Solicitada pelo Comercial',EM_COTACAO:'Aberta pela Logística',RESPONDIDA:'Respondida pela Logística',VISUALIZADA_COMERCIAL:'Visualizada pelo Comercial'})[x.type]||x.type)+'</b><small>'+esc(x.by||'')+'</small></div>').join('')+'</div>';
  }

  async function acknowledgeCommercialPopup(r,key){
    if(r.commercialViewedAt)return true;
    try{
      const result=await window.FocadoDataStore.saveDomain('COTACAO_FRETE_COMERCIAL',{requestId:r.id,viewed:{at:Date.now(),by:user()}});
      if(!result?.ok)throw new Error(result?.error||'Falha ao registrar visualização da cotação');
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      return true;
    }catch(err){
      sessionStorage.removeItem(key);
      console.warn('[FocadoFreightRequests] visualização do popup não registrada',err);
      return false;
    }
  }

  function popupFor(r,kind){
    const key='fr-popup-'+kind+'-'+r.id+'-'+r.status;
    if(sessionStorage.getItem(key)==='1'){
      if(kind==='commercial'&&!r.commercialViewedAt)void acknowledgeCommercialPopup(r,key);
      return;
    }
    sessionStorage.setItem(key,'1');
    const route=kind==='logistics'?'cotacoes-frete-logistica':'cotacoes-frete';
    const title=kind==='logistics'?'Nova cotação solicitada':'Cotação de frete respondida';
    const text=kind==='logistics'?(r.origin+' → '+r.destination):(r.origin+' → '+r.destination+' · '+(bestQuote(r)?money(bestQuote(r).value):'retorno disponível'));
    const el=modal('<div class="fr-notice"><span class="fr-notice-icon">⇄</span><div><span class="fr-eyebrow">'+(kind==='logistics'?'NOVA DEMANDA':'RETORNO DA LOGÍSTICA')+'</span><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p></div></div><div class="fr-modal-actions"><button class="fr-btn secondary" id="frLater">Agora não</button><button class="fr-btn primary" id="frGo">'+(kind==='logistics'?'Executar cotação':'Ver retorno')+'</button></div>');
    if(kind==='commercial')void acknowledgeCommercialPopup(r,key);
    el.querySelector('#frLater').onclick=closeModal;
    el.querySelector('#frGo').onclick=()=>{closeModal();window.FocadoNavigate?.(route)};
  }

  function notify(){
    const rows=requests();
    if(canLogistics()){
      const r=rows.find(x=>x.status==='SOLICITADA'&&!x.logisticsViewedAt);if(r){popupFor(r,'logistics');return}
    }
    if(canCommercial()){
      const r=rows.find(x=>x.status==='RESPONDIDA'&&!x.commercialViewedAt);if(r)popupFor(r,'commercial');
    }
  }

  window.FocadoFreightRequests=Object.freeze({render,notify,openRequestModal});
})();