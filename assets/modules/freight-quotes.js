(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const moneyInput=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const parseMoney=v=>{
    const s=String(v??'').trim();
    if(!s)return 0;
    if(s.includes(','))return Number(s.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;
    return Number(s.replace(/[^0-9.-]/g,''))||0;
  };
  const canCommercialRequest=role=>['COMERCIAL','ADMIN','DIRETOR','GESTOR'].includes(String(role||'').toUpperCase());
  const quoteStatusLabel=s=>({SOLICITADA:'Solicitada à Logística',EM_COTACAO:'Em cotação',RESPONDIDA:'Cotação respondida'})[String(s||'')]||'Não solicitada';

  function commercialCard(o,ctx={}){
    const q=o.freightQuote||null;
    const canRequest=canCommercialRequest(ctx.currentRole)&&Boolean(ctx.editingId);
    const quotes=(q?.quotes||[]).slice().sort((a,b)=>Number(a.value||0)-Number(b.value||0));
    const options=quotes.length?'<div class="fo-freight-options">'+quotes.map((x,i)=>
      '<div class="fo-freight-option '+(i===0?'best':'')+'"><div><span>'+(i===0?'MENOR COTAÇÃO':'OPÇÃO '+(i+1))+'</span><b>'+esc(x.provider)+'</b></div><strong>'+money(x.value)+'</strong><small>'+(Number(x.transitDays||0)>0?Number(x.transitDays)+' dia(s) de trânsito':'Prazo não informado')+(x.pickupEstimate?' · coleta '+dbr(x.pickupEstimate):'')+(x.notes?' · '+esc(x.notes):'')+'</small></div>'
    ).join('')+'</div>':'';
    const status=q?'<span class="fo-freight-chip '+String(q.status||'').toLowerCase()+'">'+esc(quoteStatusLabel(q.status))+'</span>':'<span class="fo-freight-chip">Ainda não solicitada</span>';
    const response=q?.status==='RESPONDIDA'
      ? '<div class="fo-freight-response"><b>Retorno da Logística</b><span>'+esc(q.responseNotes||'Valores disponíveis para análise comercial.')+'</span>'+options+'</div>'
      : '';
    const requestArea=canRequest
      ? '<label class="fo-field wide"><span>Informações para a cotação</span><textarea id="foFreightQuoteNotes" placeholder="Ex.: urgência, janela de entrega, necessidade de veículo específico...">'+esc(q?.status==='RESPONDIDA'?'':q?.notes||'')+'</textarea></label><div class="fo-actions"><button type="button" class="fo-btn primary" id="foRequestFreightQuote">'+(q?'Solicitar nova cotação':'Solicitar cotação à Logística')+'</button></div>'
      : (!ctx.editingId?'<div class="fo-cnpj-status warn">Salve o rascunho do pedido antes de solicitar a cotação.</div>':'');
    return '<div class="fo-card fo-freight-card"><div class="fo-card-head"><div><h2>Cotação de frete</h2><p>Canal direto entre Comercial e Logística. O retorno fica registrado neste pedido.</p></div>'+status+'</div>'+
      (q?'<div class="fo-freight-meta"><span>Solicitado por <b>'+esc(q.requestedBy||'Comercial')+'</b></span><span>'+new Date(Number(q.requestedAt||Date.now())).toLocaleString('pt-BR')+'</span></div>':'')+
      response+requestArea+'</div>';
  }

  async function bindCommercial(o,ctx={}){
    const request=document.getElementById('foRequestFreightQuote');
    if(request)request.onclick=async()=>{
      if(!ctx.editingId)return;
      if(document.getElementById('foOrderForm')&&ctx.formEditable&&typeof ctx.persist==='function'){
        const saved=await ctx.persist(false,true);
        if(saved===false)return;
      }
      const notes=String(document.getElementById('foFreightQuoteNotes')?.value||'').trim();
      const by=window.FocadoAuth?.getUser?.()?.name||window.FocadoAuth?.roleLabel?.()||'Comercial';
      const at=Date.now();
      const result=await window.FocadoDataStore.saveDomain('COMERCIAL',{
        freightQuoteRequest:{id:o.freightQuote?.id||('fq_'+at),notes,requestedAt:at,requestedBy:by},
        event:{at,text:'Cotação de frete solicitada à Logística',user:by}
      },ctx.editingId);
      if(!result?.ok){alert('Não foi possível enviar a solicitação de frete. Atualize e tente novamente.');return}
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      const fresh=(result.payload?.orders||[]).find(x=>String(x.id)===String(ctx.editingId));
      if(fresh&&typeof ctx.onUpdated==='function')ctx.onUpdated(fresh,result.payload);
    };

    if(String(ctx.currentRole||'').toUpperCase()==='COMERCIAL'&&o.freightQuote?.status==='RESPONDIDA'&&!o.freightQuote?.commercialViewedAt){
      try{
        const result=await window.FocadoDataStore.saveDomain('COMERCIAL',{
          freightQuoteViewed:{at:Date.now(),by:window.FocadoAuth?.getUser?.()?.name||'Comercial'}
        },o.id);
        if(result?.payload)window.FocadoDataStore.writeLocal(result.payload);
      }catch(err){console.warn('[FocadoFreightQuotes] visualização não registrada',err)}
    }
  }

  const carrierList=ops=>(ops?.carriers||[]).filter(c=>c.active!==false).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));

  function logisticsPanel(o,ops){
    const q=o.freightQuote;
    if(!q)return '';
    const existing=q.quotes||[];
    const rows=(existing.length?existing:[{}]).map((x,i)=>quoteRow(x,i)).join('');
    return '<div class="fl-panel fl-quote-panel"><div class="fl-panel-title"><div><span class="fl-eyebrow">SOLICITAÇÃO DO COMERCIAL</span><h2>Cotação de frete</h2></div><span class="fl-chip '+(q.status==='RESPONDIDA'?'ready':q.status==='EM_COTACAO'?'wait':'warn')+'">'+esc(q.status==='RESPONDIDA'?'Respondida':q.status==='EM_COTACAO'?'Em cotação':'Nova solicitação')+'</span></div>'+
      '<div class="fl-quote-request"><div><span>Solicitado por</span><b>'+esc(q.requestedBy||'Comercial')+'</b></div><div><span>Destino</span><b>'+esc([o.city,o.uf].filter(Boolean).join('/')||'Não informado')+'</b></div><div><span>Entrega solicitada</span><b>'+dbr(o.requestedDeliveryDate)+'</b></div><div><span>Observação</span><b>'+esc(q.notes||'Sem observação adicional')+'</b></div></div>'+
      '<datalist id="flQuoteProviders">'+carrierList(ops).map(x=>'<option value="'+esc(x.name)+'"></option>').join('')+'</datalist>'+
      '<div class="fl-quote-options" id="flQuoteOptions">'+rows+'</div>'+
      '<button type="button" class="fl-btn secondary" id="flAddQuoteOption">+ Adicionar opção</button>'+
      '<label class="fl-field fl-span-2 fl-quote-note"><span>Observação da Logística</span><textarea id="flQuoteResponseNotes" placeholder="Condições, restrições, negociação...">'+esc(q.responseNotes||'')+'</textarea></label>'+
      '<div class="fl-actions fl-form-actions"><button class="fl-btn primary" id="flSendQuoteResponse">Enviar cotações ao Comercial</button></div></div>';
  }

  function quoteRow(x,i){
    return '<div class="fl-quote-row" data-fl-quote-row><div class="fl-quote-row-head"><b>Opção '+(i+1)+'</b><button type="button" data-remove-quote aria-label="Remover opção">×</button></div><div class="fl-form-grid">'+
      '<label class="fl-field"><span>Prestador / transportadora</span><input data-q="provider" list="flQuoteProviders" value="'+esc(x.provider||'')+'" placeholder="Nome do prestador"></label>'+
      '<label class="fl-field"><span>Valor</span><input data-q="value" inputmode="decimal" value="'+esc(x.value?moneyInput(x.value):'')+'" placeholder="R$ 0,00"></label>'+
      '<label class="fl-field"><span>Prazo de trânsito (dias)</span><input data-q="days" type="number" min="0" step="1" value="'+esc(x.transitDays||'')+'"></label>'+
      '<label class="fl-field"><span>Previsão de coleta</span><input data-q="pickup" type="date" value="'+esc(x.pickupEstimate||'')+'"></label>'+
      '<label class="fl-field fl-span-2"><span>Observação da opção</span><input data-q="notes" value="'+esc(x.notes||'')+'" placeholder="Pedágio incluso, veículo, condição..."></label>'+
      '</div></div>';
  }

  function bindQuoteRemove(container){
    container?.querySelectorAll('[data-remove-quote]').forEach(b=>b.onclick=()=>{
      const rows=container.querySelectorAll('[data-fl-quote-row]');
      if(rows.length<=1){rows[0].querySelectorAll('input').forEach(i=>i.value='');return}
      b.closest('[data-fl-quote-row]').remove();
    });
  }

  async function bindLogistics(o,ops,ctx={}){
    if(!o.freightQuote)return;
    const container=document.getElementById('flQuoteOptions');
    const add=document.getElementById('flAddQuoteOption');
    if(add)add.onclick=()=>{
      const count=container.querySelectorAll('[data-fl-quote-row]').length;
      if(count>=6){alert('Limite de 6 opções por cotação.');return}
      container.insertAdjacentHTML('beforeend',quoteRow({},count));
      bindQuoteRemove(container);
    };
    bindQuoteRemove(container);

    const send=document.getElementById('flSendQuoteResponse');
    if(send)send.onclick=async()=>{
      const rows=[...document.querySelectorAll('[data-fl-quote-row]')].map((r,i)=>({
        id:'fqopt_'+Date.now()+'_'+i,
        provider:r.querySelector('[data-q="provider"]').value.trim(),
        value:parseMoney(r.querySelector('[data-q="value"]').value),
        transitDays:Number(r.querySelector('[data-q="days"]').value||0),
        pickupEstimate:r.querySelector('[data-q="pickup"]').value,
        notes:r.querySelector('[data-q="notes"]').value.trim()
      })).filter(x=>x.provider||x.value);
      if(!rows.length||rows.some(x=>!x.provider||!(x.value>0))){alert('Informe prestador e valor em todas as opções preenchidas.');return}
      const by=window.FocadoAuth?.getUser?.()?.name||'Logística',at=Date.now();
      const result=await window.FocadoDataStore.saveDomain('LOGISTICA',{
        freightQuoteResponse:{quotes:rows,notes:document.getElementById('flQuoteResponseNotes').value.trim(),respondedAt:at,respondedBy:by}
      },o.id);
      if(!result?.ok){alert('Não foi possível enviar as cotações ao Comercial.');return}
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      if(typeof ctx.onUpdated==='function')ctx.onUpdated(result.payload);
    };

    if(o.freightQuote.status==='SOLICITADA'){
      const by=window.FocadoAuth?.getUser?.()?.name||'Logística';
      try{
        const result=await window.FocadoDataStore.saveDomain('LOGISTICA',{freightQuoteStart:{at:Date.now(),by}},o.id);
        if(result?.payload)window.FocadoDataStore.writeLocal(result.payload);
      }catch(err){console.warn('[FocadoFreightQuotes] início da cotação não registrado',err)}
    }
  }

  window.FocadoFreightQuotes=Object.freeze({commercialCard,bindCommercial,logisticsPanel,bindLogistics});
})();