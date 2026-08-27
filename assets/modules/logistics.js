(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const value=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  function days(a,b){if(!a||!b)return null;const x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00');if(isNaN(x)||isNaN(y))return null;return Math.round((y-x)/86400000)}
  function status(o){
    const today=new Date().toISOString().slice(0,10);
    if(o.status==='ENTREGUE')return ['Entregue','ready'];
    if(o.status==='PCP'&&o.pcp?.logisticsPreRelease)return ['Aguardando mercadoria até '+dbr(o.pcp?.logisticsAvailabilityDate),'warn'];
    if(o.logistics?.deliveryDate&&o.logistics.deliveryDate<today)return ['Atrasado','bad'];
    if(o.status==='LOGISTICA'&&!o.logistics?.carrier)return ['Sem transportadora','warn'];
    if(o.status==='LOGISTICA'&&!o.logistics?.pickupDate)return ['Aguardando coleta','wait'];
    if(o.status==='LOGISTICA'&&o.logistics?.pickupDate&&!o.logistics?.deliveryDate)return ['Em trânsito','wait'];
    return ['Pronto','ready'];
  }
  function render(state){
    const ops=load(),all=(ops.orders||[]).filter(o=>o.status==='LOGISTICA'||o.status==='ENTREGUE'||(o.status==='PCP'&&o.pcp?.logisticsPreRelease));
    const s=state||{q:'',status:'TODOS'};
    const rows=all.filter(o=>{
      const q=s.q.toLowerCase();
      const mq=!q||[o.number,o.client,o.city,o.logistics?.carrier,(o.items||[]).map(i=>i.deliveryBase+' '+i.code+' '+i.name).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const st=status(o)[0];
      const ms=s.status==='TODOS'||st===s.status;
      return mq&&ms;
    });
    const inLog=all.filter(o=>o.status==='LOGISTICA').length;
    const preReleased=all.filter(o=>o.status==='PCP'&&o.pcp?.logisticsPreRelease).length;
    const delivered=all.filter(o=>o.status==='ENTREGUE').length;
    const awaitingCarrier=all.filter(o=>o.status==='LOGISTICA'&&!o.logistics?.carrier).length;
    const awaitingPickup=all.filter(o=>o.status==='LOGISTICA'&&!o.logistics?.pickupDate).length;
    const late=all.filter(o=>status(o)[1]==='bad').length;
    const freight=all.reduce((s,o)=>s+(Number(o.logistics?.freightValue)||0),0);
    const budget=all.reduce((s,o)=>s+(Number(o.logisticsBudget)||0),0);
    content().innerHTML='<div class="fl-page">'+
      '<div class="fl-head"><div><h1>Logística</h1><p>Coleta, transporte, entrega e acompanhamento de lead time</p></div><div class="fl-actions"><button class="fl-btn secondary" id="flRefresh">Atualizar</button><button class="fl-btn primary" id="flLegacy">Abrir operação detalhada</button></div></div>'+
      '<div class="fl-kpis"><div class="fl-kpi"><span>Pré-liberados</span><strong>'+preReleased+'</strong><small>frete pode ser adiantado</small></div><div class="fl-kpi"><span>Na logística</span><strong>'+inLog+'</strong><small>pedidos em andamento</small></div><div class="fl-kpi"><span>Entregues</span><strong>'+delivered+'</strong><small>histórico concluído</small></div><div class="fl-kpi"><span>Sem transportadora</span><strong>'+awaitingCarrier+'</strong><small>exigem definição</small></div><div class="fl-kpi"><span>Aguardando coleta</span><strong>'+awaitingPickup+'</strong><small>pendentes de saída</small></div><div class="fl-kpi"><span>Atrasados</span><strong>'+late+'</strong><small>atenção imediata</small></div><div class="fl-kpi"><span>Frete registrado</span><strong>'+money(freight)+'</strong><small>valor acumulado</small></div><div class="fl-kpi"><span>Orçamento disponível</span><strong>'+money(budget)+'</strong><small>definido pelo Comercial</small></div></div>'+
      '<div class="fl-grid"><div class="fl-panel"><h2>Pontos de atenção</h2>'+alerts(all)+'</div><div class="fl-panel"><h2>Indicadores de lead time</h2>'+leadSummary(all)+'</div></div>'+
      '<div class="fl-toolbar"><input class="fl-search" id="flSearch" placeholder="Buscar pedido, cliente, cidade ou transportadora" value="'+esc(s.q)+'"><select class="fl-select" id="flStatus"><option value="TODOS">Todos os status</option>'+['Pronto','Sem transportadora','Aguardando coleta','Em trânsito','Atrasado','Entregue'].map(x=>'<option value="'+x+'" '+(s.status===x?'selected':'')+'>'+x+'</option>').join('')+'</select><span class="fl-muted">'+rows.length+' pedido(s)</span></div>'+
      '<div class="fl-table-wrap">'+table(rows)+'</div></div>';
    document.getElementById('flRefresh').onclick=()=>render(s);
    document.getElementById('flLegacy').onclick=()=>openLegacy();
    const q=document.getElementById('flSearch'),st=document.getElementById('flStatus');
    q.oninput=()=>render({q:q.value,status:st.value});st.onchange=()=>render({q:q.value,status:st.value});
    document.querySelectorAll('[data-fl-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.flOpen));
  }
  function alerts(rows){
    const list=[];
    const noCarrier=rows.filter(o=>(o.status==='LOGISTICA'||o.pcp?.logisticsPreRelease)&&!o.logistics?.carrier).length;
    const noPickup=rows.filter(o=>o.status==='LOGISTICA'&&!o.logistics?.pickupDate).length;
    const waitingGoods=rows.filter(o=>o.status==='PCP'&&o.pcp?.logisticsPreRelease).length;
    const late=rows.filter(o=>status(o)[1]==='bad').length;
    if(waitingGoods)list.push(['◷',waitingGoods+' pedido(s) aguardando mercadoria','Frete pode ser contratado antecipadamente']);
    if(noCarrier)list.push(['▰',noCarrier+' pedido(s) sem transportadora','Definir parceiro logístico']);
    if(noPickup)list.push(['↗',noPickup+' pedido(s) aguardando coleta','Revisar programação de retirada']);
    if(late)list.push(['!',late+' pedido(s) atrasado(s)','Prioridade de acompanhamento']);
    if(!list.length)return '<div class="fl-alert"><div class="fl-alert-icon">✓</div><div><b>Nenhuma pendência crítica</b><small>Fluxo logístico sem exceções registradas</small></div></div>';
    return list.map(a=>'<div class="fl-alert"><div class="fl-alert-icon">'+a[0]+'</div><div><b>'+a[1]+'</b><small>'+a[2]+'</small></div></div>').join('');
  }
  function leadSummary(rows){
    const done=rows.filter(o=>o.logistics?.pickupDate&&o.logistics?.deliveryDate).map(o=>days(o.logistics.pickupDate,o.logistics.deliveryDate)).filter(v=>v!=null);
    const total=rows.filter(o=>o.orderDate&&o.logistics?.deliveryDate).map(o=>days(o.orderDate,o.logistics.deliveryDate)).filter(v=>v!=null);
    const avg=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'—';
    return '<div class="fl-alert"><div class="fl-alert-icon">↗</div><div><b>'+avg(done)+' dia(s)</b><small>média coleta → entrega</small></div></div><div class="fl-alert"><div class="fl-alert-icon">◷</div><div><b>'+avg(total)+' dia(s)</b><small>média pedido → entrega</small></div></div><div class="fl-alert"><div class="fl-alert-icon">▰</div><div><b>'+done.length+' entrega(s) mensuradas</b><small>base atual de cálculo</small></div></div>';
  }
  function table(rows){
    if(!rows.length)return '<div class="fl-empty">Nenhum pedido logístico encontrado.</div>';
    return '<table class="fl-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Disponibilidade</th><th>Retirada por item</th><th>Transportadora</th><th>Orçamento</th><th>Frete</th><th>Coleta</th><th>Entrega</th><th>Lead time</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(o=>{const st=status(o),lt=days(o.logistics?.pickupDate,o.logistics?.deliveryDate);const pickups=(o.items||[]).map(i=>'<div><b>'+esc(i.code||'')+'</b> · '+esc(i.name||'')+'<div class="fl-muted">'+esc(i.deliveryBase||o.pcp?.deliveryBase||'Base não definida')+' · '+Number(i.qty||0)+' cx</div></div>').join('');return '<tr><td><div class="fl-order">'+esc(o.number)+'</div><div class="fl-muted">'+dbr(o.orderDate)+'</div></td><td><div class="fl-client">'+esc(o.client)+'</div><div class="fl-muted">'+esc(o.city||'')+'</div></td><td>'+(o.status==='PCP'&&o.pcp?.logisticsPreRelease?'<span class="fl-chip warn">Ressalva</span><div class="fl-muted">Disponível em '+dbr(o.pcp?.logisticsAvailabilityDate)+'</div>':'Liberado')+'</td><td>'+pickups+'</td><td>'+esc(o.logistics?.carrier||'—')+'</td><td>'+money(o.logisticsBudget)+'</td><td>'+money(o.logistics?.freightValue)+'</td><td>'+dbr(o.logistics?.pickupDate)+'</td><td>'+dbr(o.logistics?.deliveryDate)+'</td><td>'+(lt==null?'—':lt+' dia(s)')+'</td><td><span class="fl-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fl-open" data-fl-open="'+esc(o.id)+'">Abrir</button></td></tr>'}).join('')+'</tbody></table>';
  }
  function openOrder(id){
    const ops=load(),o=(ops.orders||[]).find(x=>String(x.id)===String(id));
    if(!o)return;
    renderDetail(o);
  }
  function renderDetail(o){
    const pre=o.status==='PCP'&&o.pcp?.logisticsPreRelease;
    const pickups=(o.items||[]).map(i=>'<div class="fl-alert"><div class="fl-alert-icon">▰</div><div><b>'+esc(i.code||'')+' · '+esc(i.name||'')+'</b><small>'+Number(i.qty||0)+' cx · retirada em '+esc(i.deliveryBase||o.pcp?.deliveryBase||'Base não definida')+(i.pcpAvailabilityDate?' · saldo previsto '+dbr(i.pcpAvailabilityDate):'')+'</small></div></div>').join('');
    content().innerHTML='<div class="fl-page">'+
      '<div class="fl-head"><div><button class="fl-btn secondary" id="flBack">← Logística</button><h1>Logística · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+'</p></div><div>'+(pre?'<span class="fl-chip warn">Pré-liberado com ressalva</span>':'<span class="fl-chip ready">'+esc(status(o)[0])+'</span>')+'</div></div>'+
      (pre?'<div class="fl-alert"><div class="fl-alert-icon">!</div><div><b>Mercadoria ainda não liberada fisicamente</b><small>PCP prevê disponibilidade completa em '+dbr(o.pcp?.logisticsAvailabilityDate)+'. A contratação do frete pode ser adiantada, mas a coleta deve respeitar essa data.</small></div></div>':'')+
      '<div class="fl-grid"><div class="fl-panel"><h2>Retirada por item</h2>'+pickups+'</div><div class="fl-panel"><h2>Planejamento do frete</h2>'+
      '<label class="fl-field"><span>Transportadora</span><input id="flCarrier" value="'+esc(o.logistics?.carrier||'')+'" placeholder="Transportadora"></label>'+
      '<label class="fl-field"><span>Valor do frete</span><input id="flFreight" type="number" min="0" step="0.01" value="'+esc(o.logistics?.freightValue||'')+'"></label>'+
      '<label class="fl-field"><span>Coleta prevista</span><input id="flPickup" type="date" value="'+esc(o.logistics?.pickupDate||'')+'"></label>'+
      '<label class="fl-field"><span>Veículo</span><input id="flVehicle" value="'+esc(o.logistics?.vehicle||'')+'"></label>'+
      '<label class="fl-field"><span>Motorista</span><input id="flDriver" value="'+esc(o.logistics?.driver||'')+'"></label>'+
      '<label class="fl-field"><span>Observações</span><textarea id="flNotes">'+esc(o.logistics?.notes||'')+'</textarea></label>'+
      '<div class="fl-actions" style="margin-top:12px"><button class="fl-btn primary" id="flSavePlan">Salvar planejamento de frete</button></div></div></div></div>';
    document.getElementById('flBack').onclick=()=>render({q:'',status:'TODOS'});
    document.getElementById('flSavePlan').onclick=()=>saveFreightPlan(o);
  }
  async function saveFreightPlan(o){
    const logistics={
      carrier:document.getElementById('flCarrier').value.trim(),
      freightValue:Number(document.getElementById('flFreight').value)||0,
      pickupDate:document.getElementById('flPickup').value,
      vehicle:document.getElementById('flVehicle').value.trim(),
      driver:document.getElementById('flDriver').value.trim(),
      notes:document.getElementById('flNotes').value.trim()
    };
    if(o.status==='PCP'&&o.pcp?.logisticsAvailabilityDate&&logistics.pickupDate&&logistics.pickupDate<o.pcp.logisticsAvailabilityDate){
      if(!confirm('A coleta prevista está antes da disponibilidade informada pelo PCP ('+dbr(o.pcp.logisticsAvailabilityDate)+'). Deseja salvar mesmo assim como planejamento?'))return;
    }
    if(window.FocadoDataStore?.isRemoteReady?.()){
      const result=await window.FocadoDataStore.saveDomain('LOGISTICA',{logistics},o.id);
      if(!result?.ok){alert('Não foi possível salvar o planejamento logístico. '+(result?.error||''));return}
      await window.FocadoDataStore.load();
    }else{
      const ops=load(),current=(ops.orders||[]).find(x=>String(x.id)===String(o.id));if(!current)return;
      current.logistics={...(current.logistics||{}),...logistics};
      current.events=current.events||[];
      current.events.unshift({at:Date.now(),text:'Planejamento logístico salvo'+(current.status==='PCP'?' durante pré-liberação com ressalva':''),user:window.FocadoAuth?.getUser?.()?.name||'Logística'});
      await window.FocadoDataStore?.save?.(ops);
    }
    alert('Planejamento de frete salvo.');
    const fresh=load(),updated=(fresh.orders||[]).find(x=>String(x.id)===String(o.id));if(updated)renderDetail(updated);
  }
  function openLegacy(){document.getElementById('focadoShell')?.classList.add('hidden');const btn=document.getElementById('hubGoOperacoes');if(btn)btn.click()}
  window.FocadoLogistics={render,openOrder,openLegacy};
})();