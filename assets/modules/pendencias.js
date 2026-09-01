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

  async function loadWorkflow(){
    const res=await fetch('/api/workflow',{credentials:'include',cache:'no-store'});
    if(!res.ok)throw new Error('WORKFLOW_HTTP_'+res.status);
    return res.json();
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
    const finance=(rows||[]).filter(x=>x.area==='FINANCEIRO').length;
    const pcp=(rows||[]).filter(x=>x.area==='PCP').length;
    return '<div class="fp-kpis">'+
      kpi('Pendências ativas',total,'ações determinísticas')+
      kpi('Áreas acionadas',areas,'responsáveis no fluxo')+
      kpi('PCP',pcp,'pedidos exigindo decisão')+
      kpi('Financeiro',finance,'ciclos aguardando registro')+
      '</div>';
  }

  function kpi(label,value,sub){
    return '<div class="fp-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>';
  }

  function groupCard(area,rows){
    return '<section class="fp-group"><div class="fp-group-head"><div><span>'+esc(areaLabel(area))+'</span><h2>'+rows.length+' pendência(s)</h2></div><button data-fp-area="'+esc(routeForArea(area))+'">Abrir área</button></div>'+
      '<div class="fp-list">'+rows.map(itemRow).join('')+'</div></section>';
  }

  function itemRow(x){
    const route=routeForArea(x.area);
    return '<article class="fp-item">'+
      '<div class="fp-order"><span>'+esc(x.macroStatus||'—')+'</span><strong>'+esc(x.number||x.orderId)+'</strong></div>'+
      '<div class="fp-body"><b>'+esc(actionLabel(x.action))+'</b><p>'+esc(x.reason||'')+'</p>'+
      (x.sku?'<small>SKU: '+esc(x.sku)+'</small>':'')+'</div>'+
      '<button class="fp-go" data-fp-route="'+esc(route)+'">Tratar →</button>'+
      '</article>';
  }

  function bind(){
    document.querySelectorAll('[data-fp-route]').forEach(b=>b.onclick=()=>window.FocadoShell?.navigate?.(b.dataset.fpRoute));
    document.querySelectorAll('[data-fp-area]').forEach(b=>b.onclick=()=>window.FocadoShell?.navigate?.(b.dataset.fpArea));
    const refresh=document.getElementById('fpRefresh');
    if(refresh)refresh.onclick=render;
  }

  async function render(){
    const el=content();
    if(!el)return;
    el.innerHTML='<div class="fp-page"><div class="fp-loading">Atualizando a operação…</div></div>';
    try{
      const data=await loadWorkflow();
      const rows=data.workQueue||[];
      const groups=groupQueue(rows);
      el.innerHTML='<div class="fp-page">'+
        '<div class="fp-head"><div><span class="fp-eyebrow">FOCADO POR EXCEÇÃO</span><h1>Central de Pendências</h1><p>O sistema mostra quem precisa agir, em qual pedido e por quê.</p></div><button id="fpRefresh" class="fp-refresh">Atualizar</button></div>'+
        summary(rows)+
        (groups.length?groups.map(([area,list])=>groupCard(area,list)).join(''):'<div class="fp-empty"><strong>Nenhuma pendência crítica.</strong><span>O fluxo não possui próxima ação determinística em aberto.</span></div>')+
        '<div class="fp-foot">Workflow '+esc(data.version||'—')+' · revisão '+esc(data.revision??'—')+'</div>'+
        '</div>';
      bind();
    }catch(err){
      console.error('[Pendencias]',err);
      el.innerHTML='<div class="fp-page"><div class="fp-error"><strong>Não foi possível carregar a Central de Pendências.</strong><span>'+esc(err.message)+'</span><button id="fpRefresh">Tentar novamente</button></div></div>';
      bind();
    }
  }

  window.FocadoPendencias=Object.freeze({render});
})();