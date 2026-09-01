(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const routeForArea=area=>({
    COMERCIAL:'pedidos',PCP:'pcp',COMPRAS:'purchases',PRODUCAO:'production',
    EXPEDICAO:'expedicao',LOGISTICA:'logistica',FINANCEIRO:'financeiro'
  })[String(area||'').toUpperCase()]||'cockpit';
  const areaLabel=area=>({
    COMERCIAL:'Comercial',PCP:'PCP',COMPRAS:'Compras',PRODUCAO:'Produção',
    EXPEDICAO:'Expedição',LOGISTICA:'Logística',FINANCEIRO:'Financeiro'
  })[String(area||'').toUpperCase()]||String(area||'Sem área');
  const actionLabel=action=>String(action||'').toLowerCase().replace(/_/g,' ').replace(/(^|\s)\S/g,m=>m.toUpperCase());
  const localOps=()=>window.FocadoDataStore?.readLocal?.()||{};
  let lastWorkflow=null;

  async function loadWorkflow(){
    const res=await fetch('/api/workflow',{credentials:'include',cache:'no-store'});
    if(!res.ok)throw new Error('WORKFLOW_HTTP_'+res.status);
    return res.json();
  }

  function orderMap(){
    return new Map((localOps().orders||[]).map(o=>[String(o.id||o.number||''),o]));
  }

  function dueDate(order){
    return order?.requestedDeliveryDate||order?.logistics?.deliveryDate||order?.pcp?.logisticsAvailabilityDate||'';
  }

  function daysTo(date){
    if(!date)return null;
    const t=Date.parse(String(date).slice(0,10)+'T12:00:00');
    if(!Number.isFinite(t))return null;
    return Math.ceil((t-Date.now())/86400000);
  }

  function priorityFor(row,orders){
    const order=orders.get(String(row.orderId))||{};
    const days=daysTo(dueDate(order));
    const action=String(row.action||'');
    let score=0;
    if(row.area==='FINANCEIRO')score+=20;
    if(['GERAR_NECESSIDADE_PRODUCAO','VINCULAR_OU_CRIAR_COMPRA','ACOMPANHAR_RECEBIMENTO','CONCLUIR_PRODUCAO'].includes(action))score+=24;
    if(['SEPARAR_E_LIBERAR','DEFINIR_TRANSPORTADORA','ACOMPANHAR_ENTREGA'].includes(action))score+=18;
    if(days!=null&&days<0)score+=50;
    else if(days!=null&&days<=1)score+=36;
    else if(days!=null&&days<=3)score+=24;
    else if(days!=null&&days<=7)score+=12;
    if(String(row.macroStatus||'')==='PCP')score+=5;
    const level=score>=55?'CRITICA':score>=32?'ALTA':score>=16?'MEDIA':'NORMAL';
    return {score,level,days,due:dueDate(order)};
  }

  function enrich(rows){
    const orders=orderMap();
    return (rows||[]).map(r=>({...r,priority:priorityFor(r,orders)}))
      .sort((a,b)=>b.priority.score-a.priority.score||String(a.number||'').localeCompare(String(b.number||'')));
  }

  function groupQueue(rows){
    const groups=new Map();
    for(const row of rows||[]){
      const key=String(row.area||'OUTROS').toUpperCase();
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    }
    return [...groups.entries()];
  }

  function summary(rows){
    const total=(rows||[]).length;
    const areas=new Set((rows||[]).map(x=>x.area).filter(Boolean)).size;
    const critical=(rows||[]).filter(x=>x.priority?.level==='CRITICA').length;
    const high=(rows||[]).filter(x=>x.priority?.level==='ALTA').length;
    return '<div class="fp-kpis">'+
      kpi('Pendências ativas',total,'ações determinísticas')+
      kpi('Críticas',critical,'risco imediato ao fluxo')+
      kpi('Alta prioridade',high,'atenção nas próximas ações')+
      kpi('Áreas acionadas',areas,'responsáveis no fluxo')+
      '</div>';
  }

  function kpi(label,value,sub){
    return '<div class="fp-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>';
  }

  function priorityBadge(p){
    const level=String(p?.level||'NORMAL').toLowerCase();
    const label={critica:'Crítica',alta:'Alta',media:'Média',normal:'Normal'}[level]||'Normal';
    const due=p?.days==null?'':(p.days<0?' · '+Math.abs(p.days)+'d atrasado':p.days===0?' · vence hoje':' · '+p.days+'d');
    return '<span class="fp-priority '+esc(level)+'">'+label+esc(due)+'</span>';
  }

  function groupCard(area,rows){
    const critical=rows.filter(x=>x.priority?.level==='CRITICA').length;
    return '<section class="fp-group"><div class="fp-group-head"><div><span>'+esc(areaLabel(area))+'</span><h2>'+rows.length+' pendência(s)'+(critical?' · '+critical+' crítica(s)':'')+'</h2></div><button data-fp-area="'+esc(routeForArea(area))+'">Abrir área</button></div>'+
      '<div class="fp-list">'+rows.map(itemRow).join('')+'</div></section>';
  }

  function itemRow(x){
    const route=routeForArea(x.area);
    return '<article class="fp-item '+esc(String(x.priority?.level||'normal').toLowerCase())+'">'+
      '<div class="fp-order">'+priorityBadge(x.priority)+'<span>'+esc(x.macroStatus||'—')+'</span><strong>'+esc(x.number||x.orderId)+'</strong></div>'+
      '<div class="fp-body"><b>'+esc(actionLabel(x.action))+'</b><p>'+esc(x.reason||'')+'</p>'+
      (x.sku?'<small>SKU: '+esc(x.sku)+'</small>':'')+'</div>'+
      '<div class="fp-actions"><button class="fp-view" data-fp-view="'+esc(x.orderId)+'">Ver 360°</button><button class="fp-go" data-fp-route="'+esc(route)+'">Resolver →</button></div>'+
      '</article>';
  }

  function bind(){
    document.querySelectorAll('[data-fp-route]').forEach(b=>b.onclick=()=>window.FocadoShell?.navigate?.(b.dataset.fpRoute));
    document.querySelectorAll('[data-fp-area]').forEach(b=>b.onclick=()=>window.FocadoShell?.navigate?.(b.dataset.fpArea));
    document.querySelectorAll('[data-fp-view]').forEach(b=>b.onclick=()=>renderOrder360(b.dataset.fpView));
    const refresh=document.getElementById('fpRefresh');
    if(refresh)refresh.onclick=render;
  }

  async function render(){
    const el=content();
    if(!el)return;
    el.innerHTML='<div class="fp-page"><div class="fp-loading">Atualizando a operação…</div></div>';
    try{
      const data=await loadWorkflow();
      lastWorkflow=data;
      const rows=enrich(data.workQueue||[]);
      const groups=groupQueue(rows);
      el.innerHTML='<div class="fp-page">'+
        '<div class="fp-head"><div><span class="fp-eyebrow">FOCADO POR EXCEÇÃO</span><h1>Central de Pendências</h1><p>Prioriza o que ameaça prazo, fluxo e fechamento — e mostra exatamente quem precisa agir.</p></div><button id="fpRefresh" class="fp-refresh">Atualizar</button></div>'+
        summary(rows)+
        (groups.length?groups.map(([area,list])=>groupCard(area,list)).join(''):'<div class="fp-empty"><strong>Nenhuma pendência crítica.</strong><span>O fluxo não possui próxima ação determinística em aberto.</span></div>')+
        '<div class="fp-foot">Workflow '+esc(data.version||'—')+' · revisão '+esc(data.revision??'—')+' · '+esc((data.reactions||[]).length)+' reação(ões) rastreada(s)</div>'+
        '</div>';
      bind();
    }catch(err){
      console.error('[Pendencias]',err);
      el.innerHTML='<div class="fp-page"><div class="fp-error"><strong>Não foi possível carregar a Central de Pendências.</strong><span>'+esc(err.message)+'</span><button id="fpRefresh">Tentar novamente</button></div></div>';
      bind();
    }
  }

  function statusTone(v){
    const s=String(v||'').toUpperCase();
    if(['CONCLUIDO','COBERTO','REGISTRADO','NAO_NECESSARIO'].includes(s))return 'ok';
    if(['INSUFICIENTE','PENDENTE','NECESSARIO'].includes(s))return 'danger';
    if(['EM_ANDAMENTO','PRONTO_PARA_SEPARAR','DISPONIVEL_PARA_RESERVA'].includes(s))return 'warn';
    return 'neutral';
  }

  function workflowStep(label,data){
    const st=String(data?.status||'—');
    const blockers=(data?.blockers||[]);
    return '<div class="fp360-step '+statusTone(st)+'"><span>'+esc(label)+'</span><strong>'+esc(st.replace(/_/g,' '))+'</strong>'+
      (blockers.length?'<small>'+esc(blockers.join(' · '))+'</small>':'<small>Sem bloqueio registrado</small>')+'</div>';
  }

  function orderValue(order){
    return (order?.items||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.price||0),0);
  }

  function money(v){
    return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function fmtAt(v){
    if(!v)return '—';
    const d=new Date(Number(v)||v);
    return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR');
  }

  function reactionTimeline(orderId){
    const rows=(lastWorkflow?.reactions||[]).filter(r=>String(r.orderId)===String(orderId)).slice(0,12);
    if(!rows.length)return '<div class="fp360-muted">Ainda não há reação automática registrada para este pedido.</div>';
    return '<div class="fp360-timeline">'+rows.map(r=>
      '<div class="fp360-event"><i></i><div><span>'+esc(fmtAt(r.at))+' · '+esc(areaLabel(r.area))+'</span><b>'+esc(actionLabel(r.action))+'</b><small>'+esc(r.reason||'')+'</small></div></div>'
    ).join('')+'</div>';
  }

  function causalTimeline(wf,orderId){
    const causal=wf.causal||[];
    if(!causal.length)return '<div class="fp360-muted">Sem vínculo causal adicional neste momento.</div>';
    return causal.map(x=>
      '<div class="fp360-row"><span>'+esc(x.type)+'</span><b>'+esc(x.productionRequestId||x.purchaseRequestId||'—')+'</b><small>Pedido '+esc(x.orderId||orderId)+'</small></div>'
    ).join('');
  }

  function renderOrder360(orderId){
    const ops=localOps();
    const order=(ops.orders||[]).find(o=>String(o.id||o.number)===String(orderId));
    const wf=lastWorkflow?.byOrder?.[String(orderId)];
    if(!wf)return;

    const steps=[
      ['Comercial',wf.commercial],['Estoque',wf.inventory],['Produção',wf.production],
      ['Compras',wf.purchases],['Expedição',wf.expedition],['Logística',wf.logistics],['Financeiro',wf.finance]
    ];
    const next=wf.nextAction||{};
    const causal=wf.causal||[];
    const items=(order?.items||[]);
    const p=priorityFor({...next,orderId,macroStatus:wf.macroStatus},new Map([[String(orderId),order||{}]]));

    document.body.insertAdjacentHTML('beforeend','<div class="fp360-backdrop" id="fp360Backdrop">'+
      '<section class="fp360-panel" role="dialog" aria-modal="true" aria-label="Cockpit 360 do pedido">'+
      '<div class="fp360-head"><div><span>COCKPIT 360º DO PEDIDO</span><h2>'+esc(order?.number||orderId)+'</h2><p>'+esc(order?.client||'Cliente não informado')+' · '+esc(order?.status||wf.macroStatus||'—')+'</p></div><button id="fp360Close">×</button></div>'+
      '<div class="fp360-next"><div class="fp360-next-top"><span>PRÓXIMA AÇÃO</span>'+priorityBadge(p)+'</div><strong>'+esc(areaLabel(next.area))+' · '+esc(actionLabel(next.action))+'</strong><p>'+esc(next.reason||'Sem pendência crítica identificada.')+'</p><button data-fp-route="'+esc(routeForArea(next.area))+'">Resolver na área responsável →</button></div>'+
      '<div class="fp360-stats"><div><span>Valor do pedido</span><b>'+money(orderValue(order))+'</b></div><div><span>Itens</span><b>'+items.length+'</b></div><div><span>Dependências rastreadas</span><b>'+causal.length+'</b></div></div>'+
      '<div class="fp360-flow">'+steps.map(([label,data])=>workflowStep(label,data)).join('')+'</div>'+
      '<div class="fp360-grid"><div class="fp360-card"><h3>Itens e cobertura</h3>'+
        (wf.inventory?.coverage||[]).map(x=>'<div class="fp360-row"><span>'+esc(x.key||'SKU')+'</span><b>'+esc(x.reserved)+' / '+esc(x.qty)+' reserv.</b><small>'+esc(x.free)+' livre · '+esc(x.uncoveredAfterFree)+' descoberto</small></div>').join('')+
      '</div><div class="fp360-card"><h3>Rastreabilidade causal</h3>'+causalTimeline(wf,orderId)+'</div></div>'+
      '<div class="fp360-card fp360-history"><div class="fp360-card-head"><div><h3>Timeline operacional</h3><p>Eventos que mudaram a responsabilidade entre áreas.</p></div></div>'+reactionTimeline(orderId)+'</div>'+
      '</section></div>');

    const close=()=>document.getElementById('fp360Backdrop')?.remove();
    document.getElementById('fp360Close').onclick=close;
    document.getElementById('fp360Backdrop').onclick=e=>{if(e.target.id==='fp360Backdrop')close()};
    document.querySelectorAll('#fp360Backdrop [data-fp-route]').forEach(b=>b.onclick=()=>{close();window.FocadoShell?.navigate?.(b.dataset.fpRoute)});
  }

  window.FocadoPendencias=Object.freeze({render,renderOrder360,priorityFor});
})();