(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const parseMoney=v=>{
    const s=String(v??'').trim();
    if(!s)return 0;
    if(s.includes(','))return Number(s.replace(/[^0-9,-]/g,'').replace(/./g,'').replace(',','.'))||0;
    return Number(s.replace(/[^0-9.-]/g,''))||0;
  };
  const moneyInput=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const value=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const days=(a,b)=>{if(!a||!b)return null;const x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00');if(isNaN(x)||isNaN(y))return null;return Math.round((y-x)/86400000)};
  let listState={q:'',status:'TODOS'};

  function carriers(ops){return (ops.carriers||[]).filter(c=>c.active!==false).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))}
  function requiredAvailability(o){
    const dates=(o.items||[]).filter(i=>{
      const qty=Math.max(0,Number(i.qty||0)),reserved=Math.max(0,Number(i.reservedQty||0)),cut=Math.max(0,Number(i.cutQty||0));
      return qty-reserved-cut>0 && i.pcpAvailabilityDate;
    }).map(i=>i.pcpAvailabilityDate);
    if(o.pcp?.logisticsAvailabilityDate)dates.push(o.pcp.logisticsAvailabilityDate);
    return dates.filter(Boolean).sort().slice(-1)[0]||'';
  }
  function status(o){
    const today=new Date().toISOString().slice(0,10);
    if(o.freightQuote?.status==='SOLICITADA')return ['Cotação solicitada','warn'];
    if(o.freightQuote?.status==='EM_COTACAO')return ['Cotação em andamento','wait'];
    if(o.freightQuote?.status==='RESPONDIDA'&&!o.freightQuote?.commercialViewedAt)return ['Cotação respondida · Comercial não visualizou','ready'];
    if(o.status==='ENTREGUE')return ['Entregue','ready'];
    if(o.status==='PCP'&&o.pcp?.logisticsPreRelease)return ['Pré-liberação logística','warn'];
    if(o.status==='PCP')return ['Em PCP · frete pode ser adiantado','warn'];
    if(o.logistics?.deliveryDate&&o.logistics.deliveryDate<today&&!o.logistics?.deliveryConfirmed)return ['Prazo vencido','bad'];
    if(o.status==='LOGISTICA'&&!o.logistics?.carrierId)return ['Sem transportadora','warn'];
    if(o.status==='LOGISTICA'&&!o.logistics?.pickupDate)return ['Aguardando coleta','wait'];
    return ['Em planejamento','ready'];
  }

  function render(state){
    listState=state||listState;
    const ops=load(),all=(ops.orders||[]).filter(o=>['PCP','LOGISTICA','ENTREGUE','ESTOQUE_PRODUCAO'].includes(o.status)||['SOLICITADA','EM_COTACAO','RESPONDIDA'].includes(o.freightQuote?.status));
    const rows=all.filter(o=>{
      const q=String(listState.q||'').toLowerCase(),st=status(o)[0];
      return (!q||[o.number,o.client,o.city,o.logistics?.carrier,(o.items||[]).map(i=>i.code+' '+i.name).join(' ')].some(v=>String(v||'').toLowerCase().includes(q)))&&(listState.status==='TODOS'||st===listState.status);
    });
    const pcp=all.filter(o=>o.status==='PCP').length,log=all.filter(o=>o.status==='LOGISTICA').length,del=all.filter(o=>o.status==='ENTREGUE').length;
    const quotePending=all.filter(o=>['SOLICITADA','EM_COTACAO'].includes(o.freightQuote?.status)).length;
    const noCarrier=all.filter(o=>['PCP','LOGISTICA'].includes(o.status)&&!o.logistics?.carrierId).length;
    const overdue=all.filter(o=>status(o)[1]==='bad').length;
    const freight=all.reduce((s,o)=>s+Number(o.logistics?.freightValue||0),0),budget=all.reduce((s,o)=>s+Number(o.logisticsBudget||0),0);
    content().innerHTML='<div class="fl-page">'+
      '<div class="fl-head"><div><h1>Logística</h1><p>Cotação, contratação, coleta, transporte e prazo de entrega</p></div><div class="fl-actions"><button class="fl-btn primary" id="flScore">Performance transportadoras</button><button class="fl-btn primary" id="flRefresh">Atualizar</button></div></div>'+
      '<div class="fl-kpis">'+kpi('Cotações pendentes',quotePending,'solicitações do Comercial')+kpi('Pedidos ainda no PCP',pcp,'frete pode ser adiantado')+kpi('Na logística',log,'pedidos liberados')+kpi('Entregues',del,'histórico concluído')+kpi('Sem transportadora',noCarrier,'precisam de contratação')+kpi('Prazo vencido',overdue,'entrega prevista vencida')+kpi('Frete contratado',money(freight),'valor acumulado')+'</div>'+
      '<div class="fl-grid"><div class="fl-panel"><h2>Pontos de atenção</h2>'+alerts(all)+'</div><div class="fl-panel"><h2>Indicadores</h2>'+leadSummary(all)+'</div></div>'+
      '<div class="fl-toolbar"><input class="fl-search" id="flSearch" placeholder="Buscar pedido, cliente, cidade ou transportadora" value="'+esc(listState.q)+'"><select class="fl-select" id="flStatus"><option value="TODOS">Todos os status</option>'+['Cotação solicitada','Cotação em andamento','Cotação respondida · Comercial não visualizou','Em PCP · frete pode ser adiantado','Pré-liberação logística','Sem transportadora','Aguardando coleta','Em planejamento','Prazo vencido','Entregue'].map(x=>'<option '+(listState.status===x?'selected':'')+'>'+x+'</option>').join('')+'</select><span class="fl-muted">'+rows.length+' pedido(s)</span></div>'+
      '<div class="fl-table-wrap">'+table(rows)+'</div></div>';
    document.getElementById('flScore').onclick=()=>window.FocadoIntelligenceUI?.renderCarriers();
    document.getElementById('flRefresh').onclick=()=>render(listState);
    const q=document.getElementById('flSearch'),s=document.getElementById('flStatus');
    q.oninput=()=>render({q:q.value,status:s.value});s.onchange=()=>render({q:q.value,status:s.value});
    document.querySelectorAll('[data-fl-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.flOpen));
  }
  function kpi(a,b,c){return '<div class="fl-kpi"><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></div>'}
  function alerts(rows){
    const out=[];
    const pcp=rows.filter(o=>o.status==='PCP').length,noCarrier=rows.filter(o=>['PCP','LOGISTICA'].includes(o.status)&&!o.logistics?.carrierId).length;
    const overBudget=rows.filter(o=>Number(o.logistics?.freightValue||0)>Number(o.logisticsBudget||0)&&Number(o.logisticsBudget||0)>0).length;
    const late=rows.filter(o=>status(o)[1]==='bad').length;
    if(pcp)out.push(['◷',pcp+' pedido(s) ainda no PCP','A Logística já pode captar frete']);
    if(noCarrier)out.push(['▰',noCarrier+' pedido(s) sem transportadora','Selecione uma transportadora cadastrada']);
    if(overBudget)out.push(['R$',overBudget+' frete(s) acima do orçamento','Revisar com o Comercial']);
    if(late)out.push(['!',late+' entrega(s) com prazo vencido','Confirmar situação em Entregas']);
    if(!out.length)out.push(['✓','Nenhuma pendência crítica','Fluxo logístico sem exceções']);
    return out.map(a=>'<div class="fl-alert"><div class="fl-alert-icon">'+a[0]+'</div><div><b>'+a[1]+'</b><small>'+a[2]+'</small></div></div>').join('');
  }
  function leadSummary(rows){
    const done=rows.filter(o=>o.logistics?.pickupDate&&o.logistics?.actualDeliveryDate).map(o=>days(o.logistics.pickupDate,o.logistics.actualDeliveryDate)).filter(v=>v!=null);
    const planned=rows.filter(o=>o.orderDate&&o.logistics?.deliveryDate).map(o=>days(o.orderDate,o.logistics.deliveryDate)).filter(v=>v!=null);
    const avg=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'—';
    return '<div class="fl-alert"><div class="fl-alert-icon">↗</div><div><b>'+avg(done)+' dia(s)</b><small>média coleta → entrega real</small></div></div><div class="fl-alert"><div class="fl-alert-icon">◷</div><div><b>'+avg(planned)+' dia(s)</b><small>média pedido → prazo previsto</small></div></div>';
  }
  function table(rows){
    if(!rows.length)return '<div class="fl-empty">Nenhum pedido logístico encontrado.</div>';
    return '<table class="fl-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Disponibilidade</th><th>Retirada</th><th>Transportadora</th><th>Orçamento</th><th>Frete</th><th>Coleta</th><th>Entrega prevista</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const st=status(o),availability=requiredAvailability(o);
      return '<tr><td><div class="fl-order">'+esc(o.number)+'</div><div class="fl-muted">'+dbr(o.orderDate)+'</div></td><td><div class="fl-client">'+esc(o.client)+'</div><div class="fl-muted">'+esc(o.city||'')+'</div></td><td>'+(availability?dbr(availability):(o.status==='PCP'?'Em definição':'Disponível'))+'</td><td>'+esc((o.items||[]).map(i=>i.deliveryBase).filter(Boolean).join(', ')||o.pcp?.deliveryBase||'—')+'</td><td>'+esc(o.logistics?.carrier||'—')+'</td><td>'+money(o.logisticsBudget)+'</td><td>'+money(o.logistics?.freightValue)+'</td><td>'+dbr(o.logistics?.pickupDate)+'</td><td>'+dbr(o.logistics?.deliveryDate)+'</td><td><span class="fl-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fl-open" data-fl-open="'+esc(o.id)+'">Abrir</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function openOrder(id){
    const ops=load(),o=(ops.orders||[]).find(x=>String(x.id)===String(id));if(o)renderDetail(o,ops);
  }

  function freightQuotePanel(o,ops){
    const q=o.freightQuote;
    if(!q)return '';
    const existing=(q.quotes||[]);
    const rows=(existing.length?existing:[{}]).map((x,i)=>quoteRow(x,i)).join('');
    return '<div class="fl-panel fl-quote-panel"><div class="fl-panel-title"><div><span class="fl-eyebrow">SOLICITAÇÃO DO COMERCIAL</span><h2>Cotação de frete</h2></div><span class="fl-chip '+(q.status==='RESPONDIDA'?'ready':q.status==='EM_COTACAO'?'wait':'warn')+'">'+esc(q.status==='RESPONDIDA'?'Respondida':q.status==='EM_COTACAO'?'Em cotação':'Nova solicitação')+'</span></div>'+
      '<div class="fl-quote-request"><div><span>Solicitado por</span><b>'+esc(q.requestedBy||'Comercial')+'</b></div><div><span>Destino</span><b>'+esc([o.city,o.uf].filter(Boolean).join('/')||'Não informado')+'</b></div><div><span>Entrega solicitada</span><b>'+dbr(o.requestedDeliveryDate)+'</b></div><div><span>Observação</span><b>'+esc(q.notes||'Sem observação adicional')+'</b></div></div>'+
      '<datalist id="flQuoteProviders">'+carriers(ops).map(x=>'<option value="'+esc(x.name)+'"></option>').join('')+'</datalist>'+
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

  function bindFreightQuote(o,ops){
    if(!o.freightQuote)return;
    const container=document.getElementById('flQuoteOptions');
    const add=document.getElementById('flAddQuoteOption');
    if(add)add.onclick=()=>{
      const count=container.querySelectorAll('[data-fl-quote-row]').length;
      if(count>=6){alert('Limite de 6 opções por cotação.');return}
      container.insertAdjacentHTML('beforeend',quoteRow({},count));bindQuoteRemove(container);
    };
    bindQuoteRemove(container);
    const send=document.getElementById('flSendQuoteResponse');
    if(send)send.onclick=()=>sendFreightQuoteResponse(o,ops);
    if(o.freightQuote.status==='SOLICITADA')startFreightQuote(o);
  }

  function bindQuoteRemove(container){
    container?.querySelectorAll('[data-remove-quote]').forEach(b=>b.onclick=()=>{
      const rows=container.querySelectorAll('[data-fl-quote-row]');
      if(rows.length<=1){rows[0].querySelectorAll('input').forEach(i=>i.value='');return}
      b.closest('[data-fl-quote-row]').remove();
    });
  }

  async function startFreightQuote(o){
    const by=window.FocadoAuth?.getUser?.()?.name||'Logística';
    try{
      const result=await window.FocadoDataStore.saveDomain('LOGISTICA',{freightQuoteStart:{at:Date.now(),by}},o.id);
      if(result?.payload)window.FocadoDataStore.writeLocal(result.payload);
    }catch(err){console.warn('[FocadoLogistics] não foi possível marcar cotação em andamento',err)}
  }

  async function sendFreightQuoteResponse(o,ops){
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
    render(listState);
  }
  function renderDetail(o,ops){
    const pre=o.status==='PCP',availableDate=requiredAvailability(o),cs=carriers(ops),budget=Number(o.logisticsBudget||0),freight=Number(o.logistics?.freightValue||0);
    const macroLabel=o.status==='COMERCIAL'?'Status macro: Comercial':pre?'Status macro: PCP':o.status==='ENTREGUE'?'Status macro: Entregue':'Status macro: Logística';
    const pickups=(o.items||[]).map(i=>'<div class="fl-pickup-card"><b>'+esc(i.code||'')+' · '+esc(i.name||'')+'</b><small>'+Number(i.qty||0)+' cx · Base '+esc(i.deliveryBase||o.pcp?.deliveryBase||'não definida')+(i.pcpAvailabilityDate?' · disponível '+dbr(i.pcpAvailabilityDate):'')+'</small></div>').join('');
    const carrierOptions='<option value="">Selecione uma transportadora</option>'+cs.map(c=>'<option value="'+esc(c.id)+'" '+(String(c.id)===String(o.logistics?.carrierId||'')?'selected':'')+'>'+esc(c.name)+(c.city?' · '+esc(c.city):'')+'</option>').join('');
    content().innerHTML='<div class="fl-page">'+
      '<div class="fl-head"><div><button class="fl-btn primary" id="flBack">← Logística</button><h1>Logística · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+'</p></div><span class="fl-chip '+(pre||o.status==='COMERCIAL'?'warn':'ready')+'">'+macroLabel+'</span></div>'+
      freightQuotePanel(o,ops)+
      (pre?'<div class="fl-callout warn"><b>Planejamento antecipado</b><span>A Logística pode contratar o frete agora. A coleta somente poderá ocorrer após a disponibilidade definida pelo PCP.</span></div>':'')+
      '<div class="fl-budget-row"><div><span>Orçamento previsto pelo Comercial</span><strong>'+money(budget)+'</strong></div><div><span>Frete planejado</span><strong id="flFreightSummary">'+money(freight)+'</strong></div><div id="flBudgetStatus" class="fl-budget-status"></div></div>'+
      '<div class="fl-detail-grid"><div class="fl-panel"><div class="fl-panel-title"><div><span class="fl-eyebrow">RETIRADA</span><h2>Itens e bases</h2></div></div><div class="fl-pickup-list">'+pickups+'</div>'+(availableDate?'<div class="fl-callout info"><b>Disponibilidade mínima para coleta</b><span>'+dbr(availableDate)+'</span></div>':'')+'</div>'+
      '<div class="fl-panel"><div class="fl-panel-title"><div><span class="fl-eyebrow">PLANEJAMENTO</span><h2>Frete e entrega prevista</h2></div></div><div class="fl-form-grid">'+
        '<label class="fl-field fl-span-2"><span>Transportadora</span><select id="flCarrier">'+carrierOptions+'</select><small class="fl-help">'+(cs.length?'Somente transportadoras cadastradas e ativas.':'Nenhuma transportadora cadastrada. Cadastre no menu Transportadoras.')+'</small></label>'+
        '<label class="fl-field"><span>Valor do frete</span><input id="flFreight" type="text" inputmode="decimal" value="'+esc(moneyInput(freight))+'"></label>'+
        '<label class="fl-field"><span>Coleta prevista</span><input id="flPickup" type="date" '+(availableDate?'min="'+esc(availableDate)+'"':'')+' value="'+esc(o.logistics?.pickupDate||'')+'"><small class="fl-help">'+(availableDate?'Não pode ser anterior a '+dbr(availableDate):'Sem restrição de disponibilidade registrada pelo PCP')+'</small></label>'+
        '<label class="fl-field"><span>Entrega prevista</span><input id="flDelivery" type="date" value="'+esc(o.logistics?.deliveryDate||'')+'"><small class="fl-help">Ao informar esta data, o pedido passa a aparecer em Entregas.</small></label>'+
        '<label class="fl-field"><span>Veículo</span><input id="flVehicle" value="'+esc(o.logistics?.vehicle||'')+'" placeholder="Placa / tipo"></label>'+
        '<label class="fl-field"><span>Motorista</span><input id="flDriver" value="'+esc(o.logistics?.driver||'')+'" placeholder="Nome do motorista"></label>'+
        '<label class="fl-field fl-span-2"><span>Observações</span><textarea id="flNotes" placeholder="Negociação, janela de coleta, restrições...">'+esc(o.logistics?.notes||'')+'</textarea></label>'+
      '</div><div class="fl-actions fl-form-actions"><button class="fl-btn primary" id="flSavePlan">Salvar planejamento de frete</button></div></div></div></div>';
    document.getElementById('flBack').onclick=()=>render(listState);
    bindFreightQuote(o,ops);
    const fre=document.getElementById('flFreight');
    const updateBudget=()=>{
      const v=parseMoney(fre.value),status=document.getElementById('flBudgetStatus');
      document.getElementById('flFreightSummary').textContent=money(v);
      if(budget>0&&v>budget){status.className='fl-budget-status over';status.innerHTML='<b>Acima do orçamento</b><span>Excede em '+money(v-budget)+'</span>'}
      else if(budget>0){status.className='fl-budget-status ok';status.innerHTML='<b>Dentro do orçamento</b><span>Saldo '+money(budget-v)+'</span>'}
      else {status.className='fl-budget-status neutral';status.innerHTML='<b>Sem orçamento</b><span>Comercial não informou limite</span>'}
    };
    fre.onfocus=()=>{fre.value=String(parseMoney(fre.value)||'')};fre.onblur=()=>{fre.value=moneyInput(parseMoney(fre.value));updateBudget()};fre.oninput=updateBudget;updateBudget();
    document.getElementById('flSavePlan').onclick=()=>saveFreightPlan(o,ops,availableDate,budget);
  }

  async function saveFreightPlan(o,ops,minPickup,budget){
    const carrierId=document.getElementById('flCarrier').value,carrierObj=carriers(ops).find(c=>String(c.id)===String(carrierId));
    const logistics={
      carrierId,carrier:carrierObj?.name||'',freightValue:parseMoney(document.getElementById('flFreight').value),
      pickupDate:document.getElementById('flPickup').value,deliveryDate:document.getElementById('flDelivery').value,
      vehicle:document.getElementById('flVehicle').value.trim(),driver:document.getElementById('flDriver').value.trim(),notes:document.getElementById('flNotes').value.trim()
    };
    if(logistics.pickupDate&&minPickup&&logistics.pickupDate<minPickup){alert('A coleta não pode ser anterior à disponibilidade informada pelo PCP ('+dbr(minPickup)+').');return}
    if(logistics.deliveryDate&&logistics.pickupDate&&logistics.deliveryDate<logistics.pickupDate){alert('A entrega prevista não pode ser anterior à coleta.');return}
    if(budget>0&&logistics.freightValue>budget&&!confirm('O frete está '+money(logistics.freightValue-budget)+' acima do orçamento aprovado pelo Comercial. Deseja salvar mesmo assim?'))return;
    const result=await window.FocadoDataStore.saveDomain('LOGISTICA',{logistics},o.id);
    if(!result?.ok){alert('Não foi possível salvar o planejamento logístico. '+(result?.error||''));return}
    await window.FocadoDataStore.load();
    render(listState);
  }

  function renderDeliveries(){
    const ops=load(),rows=(ops.orders||[]).filter(o=>o.logistics?.deliveryDate).sort((a,b)=>String(a.logistics.deliveryDate).localeCompare(String(b.logistics.deliveryDate)));
    const pending=rows.filter(o=>!o.logistics?.deliveryConfirmed).length,onTime=rows.filter(o=>o.logistics?.deliveryConfirmed&&o.logistics?.deliveredOnTime).length,late=rows.filter(o=>o.logistics?.deliveryConfirmed&&o.logistics?.deliveredOnTime===false).length;
    content().innerHTML='<div class="fl-page"><div class="fl-head"><div><h1>Entregas</h1><p>Confirmação do cumprimento do prazo definido pela Logística</p></div></div>'+
      '<div class="fl-kpis">'+kpi('A confirmar',pending,'entregas previstas')+kpi('No prazo',onTime,'entregas confirmadas')+kpi('Fora do prazo',late,'com justificativa')+'</div>'+
      '<div class="fl-table-wrap">'+(rows.length?'<table class="fl-table fl-delivery-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Transportadora</th><th>Entrega prevista</th><th>Entrega real</th><th>Situação</th><th></th></tr></thead><tbody>'+rows.map(o=>'<tr><td><b>'+esc(o.number)+'</b></td><td>'+esc(o.client||'')+'</td><td>'+esc(o.logistics?.carrier||'—')+'</td><td>'+dbr(o.logistics.deliveryDate)+'</td><td>'+dbr(o.logistics.actualDeliveryDate)+'</td><td>'+deliveryStatus(o)+'</td><td><button class="fl-open" data-delivery="'+esc(o.id)+'">'+(o.logistics?.deliveryConfirmed?'Visualizar':'Confirmar')+'</button></td></tr>').join('')+'</tbody></table>':'<div class="fl-empty">Nenhuma entrega prevista cadastrada na Logística.</div>')+'</div></div>';
    document.querySelectorAll('[data-delivery]').forEach(b=>b.onclick=()=>openDelivery(b.dataset.delivery));
  }
  function deliveryStatus(o){
    if(!o.logistics?.deliveryConfirmed)return '<span class="fl-chip wait">A confirmar</span>';
    return o.logistics.deliveredOnTime?'<span class="fl-chip ready">Entregue no prazo</span>':'<span class="fl-chip bad">Entregue fora do prazo</span>';
  }
  function openDelivery(id){
    const ops=load(),o=(ops.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;
    const confirmed=Boolean(o.logistics?.deliveryConfirmed);
    content().innerHTML='<div class="fl-page"><div class="fl-head"><div><button class="fl-btn primary" id="fdBack">← Entregas</button><h1>Entrega · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+'</p></div>'+deliveryStatus(o)+'</div>'+
      '<div class="fl-detail-grid"><div class="fl-panel"><h2>Planejamento</h2><div class="fl-info-row"><span>Entrega prevista</span><b>'+dbr(o.logistics?.deliveryDate)+'</b></div><div class="fl-info-row"><span>Transportadora</span><b>'+esc(o.logistics?.carrier||'—')+'</b></div><div class="fl-info-row"><span>Coleta</span><b>'+dbr(o.logistics?.pickupDate)+'</b></div></div>'+
      '<div class="fl-panel"><h2>Confirmação da entrega</h2><div class="fl-form-grid">'+
        '<label class="fl-field fl-span-2"><span>A mercadoria foi entregue na data prevista?</span><select id="fdOnTime" '+(confirmed?'disabled':'')+'><option value="">Selecione</option><option value="SIM" '+(o.logistics?.deliveredOnTime===true?'selected':'')+'>Sim</option><option value="NAO" '+(o.logistics?.deliveredOnTime===false?'selected':'')+'>Não</option></select></label>'+
        '<label class="fl-field" id="fdActualWrap"><span>Data real da entrega</span><input id="fdActual" type="date" '+(confirmed?'disabled':'')+' value="'+esc(o.logistics?.actualDeliveryDate||'')+'"></label>'+
        '<label class="fl-field fl-span-2" id="fdReasonWrap"><span>Motivo do não cumprimento do prazo</span><textarea id="fdReason" '+(confirmed?'disabled':'')+'>'+esc(o.logistics?.deliveryDelayReason||'')+'</textarea></label>'+
      '</div>'+(!confirmed?'<div class="fl-actions fl-form-actions"><button class="fl-btn primary" id="fdSave">Confirmar entrega</button></div>':'')+'</div></div></div>';
    document.getElementById('fdBack').onclick=renderDeliveries;
    const sel=document.getElementById('fdOnTime'),actual=document.getElementById('fdActual'),reason=document.getElementById('fdReason'),rw=document.getElementById('fdReasonWrap');
    const sync=()=>{const yes=sel.value==='SIM';rw.style.display=yes?'none':'flex';if(yes){actual.value=o.logistics.deliveryDate;reason.value=''}};
    if(!confirmed){sel.onchange=sync;sync();document.getElementById('fdSave').onclick=()=>confirmDelivery(o)}
  }
  async function confirmDelivery(o){
    const on=document.getElementById('fdOnTime').value,actual=document.getElementById('fdActual').value,reason=document.getElementById('fdReason').value.trim();
    if(!on){alert('Informe se a entrega ocorreu na data prevista.');return}
    if(!actual){alert('Informe a data real da entrega.');return}
    if(on==='NAO'&&!reason){alert('Informe o motivo do não cumprimento do prazo.');return}
    const logistics={deliveryConfirmed:true,deliveredOnTime:on==='SIM',actualDeliveryDate:actual,deliveryDelayReason:on==='NAO'?reason:'',deliveryConfirmedAt:Date.now(),deliveryConfirmedBy:window.FocadoAuth?.getUser?.()?.name||'Logística'};
    const saved=await window.FocadoDataStore.saveDomain('LOGISTICA',{logistics},o.id);
    if(!saved?.ok){alert('Não foi possível confirmar a entrega.');return}
    await window.FocadoDataStore.load();
    const fresh=load(),updated=(fresh.orders||[]).find(x=>String(x.id)===String(o.id));
    if(updated?.status==='LOGISTICA'){const tr=await window.FocadoDataStore.transitionOrder(o.id);if(tr?.ok)await window.FocadoDataStore.load()}
    renderDeliveries();
  }

  function renderCarriers(){
    const ops=load(),rows=(ops.carriers||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    content().innerHTML='<div class="fl-page"><div class="fl-head"><div><h1>Transportadoras</h1><p>Cadastro mestre utilizado na contratação de fretes</p></div><button class="fl-btn primary" id="fcNew">+ Nova transportadora</button></div>'+
      '<div class="fl-table-wrap">'+(rows.length?'<table class="fl-table"><thead><tr><th>Transportadora</th><th>CNPJ</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(c=>'<tr><td><b>'+esc(c.name)+'</b><div class="fl-muted">'+esc([c.city,c.state].filter(Boolean).join('/'))+'</div></td><td>'+esc(c.cnpj||'—')+'</td><td>'+esc(c.contact||'—')+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc(c.email||'—')+'</td><td><span class="fl-chip '+(c.active!==false?'ready':'bad')+'">'+(c.active!==false?'Ativa':'Inativa')+'</span></td><td><button class="fl-open" data-carrier="'+esc(c.id)+'">Editar</button></td></tr>').join('')+'</tbody></table>':'<div class="fl-empty">Nenhuma transportadora cadastrada.</div>')+'</div></div>';
    document.getElementById('fcNew').onclick=()=>openCarrier();
    document.querySelectorAll('[data-carrier]').forEach(b=>b.onclick=()=>openCarrier(b.dataset.carrier));
  }
  function openCarrier(id){
    const ops=load(),existing=(ops.carriers||[]).find(x=>String(x.id)===String(id)),c=existing||{id:'car_'+Date.now(),active:true};
    content().innerHTML='<div class="fl-page"><div class="fl-head"><div><button class="fl-btn primary" id="fcBack">← Transportadoras</button><h1>'+(existing?'Editar':'Nova')+' transportadora</h1></div></div>'+
      '<div class="fl-panel"><div class="fl-form-grid"><label class="fl-field fl-span-2"><span>Razão social / Nome</span><input id="fcName" value="'+esc(c.name||'')+'"></label><label class="fl-field"><span>CNPJ</span><input id="fcCnpj" value="'+esc(c.cnpj||'')+'"></label><label class="fl-field"><span>Contato</span><input id="fcContact" value="'+esc(c.contact||'')+'"></label><label class="fl-field"><span>Telefone</span><input id="fcPhone" value="'+esc(c.phone||'')+'"></label><label class="fl-field"><span>E-mail</span><input id="fcEmail" type="email" value="'+esc(c.email||'')+'"></label><label class="fl-field"><span>Cidade</span><input id="fcCity" value="'+esc(c.city||'')+'"></label><label class="fl-field"><span>UF</span><input id="fcState" maxlength="2" value="'+esc(c.state||'')+'"></label><label class="fl-field"><span>Status</span><select id="fcActive"><option value="SIM" '+(c.active!==false?'selected':'')+'>Ativa</option><option value="NAO" '+(c.active===false?'selected':'')+'>Inativa</option></select></label><label class="fl-field fl-span-2"><span>Observações</span><textarea id="fcNotes">'+esc(c.notes||'')+'</textarea></label></div><div class="fl-actions fl-form-actions"><button class="fl-btn primary" id="fcSave">Salvar transportadora</button></div></div></div>';
    document.getElementById('fcBack').onclick=renderCarriers;
    document.getElementById('fcSave').onclick=async()=>{
      const carrier={id:c.id,name:document.getElementById('fcName').value.trim(),cnpj:document.getElementById('fcCnpj').value.trim(),contact:document.getElementById('fcContact').value.trim(),phone:document.getElementById('fcPhone').value.trim(),email:document.getElementById('fcEmail').value.trim(),city:document.getElementById('fcCity').value.trim(),state:document.getElementById('fcState').value.trim().toUpperCase(),active:document.getElementById('fcActive').value==='SIM',notes:document.getElementById('fcNotes').value.trim(),updatedAt:Date.now()};
      if(!carrier.name){alert('Informe o nome da transportadora.');return}
      const res=await window.FocadoDataStore.saveDomain('TRANSPORTADORAS',{carrier},null);
      if(!res?.ok){alert('Não foi possível salvar a transportadora.');return}
      await window.FocadoDataStore.load();renderCarriers();
    };
  }

  window.FocadoLogistics={render,openOrder,renderDeliveries,renderCarriers};
})();