(function(){
  'use strict';
  if(window.FocadoFreightQuoteUI?.active)return;
  const ds=window.FocadoDataStore;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const state=()=>ds?.readLocal?.()||{};
  const orderByNumber=n=>(state().orders||[]).find(o=>String(o.number)===String(n));
  const api=async(path,payload)=>{
    const base=String(ds?.getConfig?.().apiBaseUrl||'').replace(/\/$/,''),token=ds?.getSessionToken?.()||'';
    if(!base||!token)return {ok:false,error:'API_REQUIRED'};
    try{
      const res=await fetch(base+path,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)return {ok:false,error:body.message||body.error||('HTTP '+res.status),code:body.error};
      if(body?.payload)ds.writeLocal?.(body.payload);
      return {ok:true,...body};
    }catch(err){return {ok:false,error:String(err?.message||err)}}
  };
  function commercial(){
    const root=document.querySelector('.fo-page #foOrderForm');if(!root||document.querySelector('[data-fq-commercial]'))return;
    const number=document.querySelector('.fo-head h1')?.textContent?.trim(),order=orderByNumber(number);if(!order)return;
    const role=window.FocadoAuth?.getRole?.()||'';if(!['ADMIN','COMERCIAL'].includes(role))return;
    const actions=document.querySelector('.fo-head .fo-actions');if(!actions)return;
    const q=order.freightQuote||{},btn=document.createElement('button');btn.className='fo-btn secondary';btn.dataset.fqCommercial='1';
    if(q.status==='SOLICITADA'){btn.textContent='Cotação solicitada';btn.disabled=true}
    else if(q.status==='RESPONDIDA'){
      btn.textContent='Cotação: '+money(q.response?.freightValue||0);
      btn.onclick=()=>alert('Cotação respondida\n\nTransportadora: '+String(q.response?.carrier||'—')+'\nFrete: '+money(q.response?.freightValue||0)+'\nPrazo: '+String(q.response?.deliveryDays||0)+' dia(s)'+(q.response?.notes?'\nObservação: '+q.response.notes:''));
    }else{
      btn.textContent='Solicitar cotação de frete';
      btn.onclick=async()=>{
        const notes=prompt('Observações para a Logística (opcional):','')??null;if(notes===null)return;
        btn.disabled=true;btn.textContent='Solicitando...';
        const key='quote_'+order.id+'_'+String(order.requestedDeliveryDate||'')+'_'+String(order.logisticsBudget||0);
        const res=await api('/api/freight-quote-request',{orderId:order.id,notes,idempotencyKey:key});
        if(!res.ok){btn.disabled=false;btn.textContent='Solicitar cotação de frete';alert('Não foi possível solicitar a cotação. '+(res.error||''));return}
        btn.textContent='Cotação solicitada';
      };
    }
    actions.prepend(btn);
  }
  function quoteSummary(q){
    const m=q.metrics||{};
    return '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0">'+
      '<div><small>Caixas</small><b style="display:block">'+Number(m.boxes||0)+'</b></div>'+ '<div><small>Peso</small><b style="display:block">'+Number(m.weightKg||0).toLocaleString('pt-BR')+' kg</b></div>'+ '<div><small>Cubagem</small><b style="display:block">'+Number(m.cubageM3||0).toLocaleString('pt-BR',{maximumFractionDigits:6})+' m³</b></div>'+ '<div><small>NF estimada</small><b style="display:block">'+money(m.estimatedInvoiceValue||0)+'</b></div></div>';
  }
  function logistics(){
    const page=document.querySelector('.fl-page'),h=document.querySelector('.fl-head h1');if(!page||!h||document.querySelector('[data-fq-logistics]'))return;
    const text=h.textContent||'';if(!text.startsWith('Logística · '))return;
    const order=orderByNumber(text.replace('Logística · ','').trim()),q=order?.freightQuote;if(!order||!q||!['SOLICITADA','RESPONDIDA'].includes(q.status))return;
    const panel=document.createElement('div');panel.className='fl-panel';panel.dataset.fqLogistics='1';panel.style.marginBottom='16px';
    if(q.status==='SOLICITADA'){
      const cs=(state().carriers||[]).filter(c=>c.active!==false);
      panel.innerHTML='<div class="fl-panel-title"><div><span class="fl-eyebrow">COTAÇÃO SOLICITADA</span><h2>Responder ao Comercial</h2></div></div>'+quoteSummary(q)+
        '<div class="fl-form-grid"><label class="fl-field fl-span-2"><span>Transportadora</span><select id="fqCarrier"><option value="">Selecione</option>'+cs.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label>'+ '<label class="fl-field"><span>Valor do frete</span><input id="fqValue" type="number" min="0" step="0.01"></label>'+ '<label class="fl-field"><span>Prazo em dias</span><input id="fqDays" type="number" min="0" step="1"></label>'+ '<label class="fl-field"><span>Coleta prevista</span><input id="fqPickup" type="date"></label>'+ '<label class="fl-field"><span>Entrega prevista</span><input id="fqDelivery" type="date"></label>'+ '<label class="fl-field fl-span-2"><span>Observações</span><textarea id="fqNotes">'+esc(q.notes||'')+'</textarea></label></div>'+ '<div class="fl-actions fl-form-actions"><button class="fl-btn primary" id="fqRespond">Responder cotação</button></div>';
      panel.querySelector('#fqRespond').onclick=async()=>{
        const response={carrierId:panel.querySelector('#fqCarrier').value,freightValue:Number(panel.querySelector('#fqValue').value||0),deliveryDays:Number(panel.querySelector('#fqDays').value||0),pickupDate:panel.querySelector('#fqPickup').value,deliveryDate:panel.querySelector('#fqDelivery').value,notes:panel.querySelector('#fqNotes').value.trim()};
        const btn=panel.querySelector('#fqRespond');btn.disabled=true;
        const res=await api('/api/freight-quote-response',{orderId:order.id,response});
        if(!res.ok){btn.disabled=false;alert('Não foi possível responder a cotação. '+(res.error||''));return}
        panel.remove();scan();
      };
    }else{
      panel.innerHTML='<div class="fl-panel-title"><div><span class="fl-eyebrow">COTAÇÃO RESPONDIDA</span><h2>'+esc(q.response?.carrier||'Transportadora')+' · '+money(q.response?.freightValue||0)+'</h2></div></div>'+quoteSummary(q)+'<div class="fl-actions fl-form-actions"><button class="fl-btn primary" id="fqApply">Aplicar ao planejamento</button></div>';
      panel.querySelector('#fqApply').onclick=()=>{
        const r=q.response||{},set=(id,v)=>{const el=document.getElementById(id);if(el!=null&&v!=null){el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}};
        set('flCarrier',r.carrierId);set('flFreight',r.freightValue);set('flPickup',r.pickupDate);set('flDelivery',r.deliveryDate);if(r.notes)set('flNotes',r.notes);
      };
    }
    const anchor=document.querySelector('.fl-detail-grid');if(anchor)anchor.parentNode.insertBefore(panel,anchor);else page.appendChild(panel);
  }
  function scan(){commercial();logistics()}
  const observer=new MutationObserver(()=>queueMicrotask(scan));observer.observe(document.body,{childList:true,subtree:true});
  scan();window.FocadoFreightQuoteUI={active:true,scan};
})();
