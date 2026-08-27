(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const prodQty=o=>(o.items||[]).filter(i=>i.source==='PRODUCAO').reduce((s,i)=>s+(Number(i.qty)||0),0);
  const totalQty=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0);
  function inputAvailable(inv){return Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0))}
  function recipeStatus(o,ops){
    let missing=0;
    (o.items||[]).filter(i=>i.source==='PRODUCAO').forEach(item=>{
      const reqs=item.productionRequirements||[];
      reqs.forEach(r=>{const inv=ops.inputInventory?.[String(r.code)];if(inv&&inputAvailable(inv)+1e-9<Number(r.required||0))missing++});
    });
    if(missing)return ['Falta insumo','block'];
    if((o.items||[]).some(i=>i.source==='PRODUCAO'&&!i.productionConsumed))return ['Aguardando produção','wait'];
    if((o.items||[]).filter(i=>i.source==='PRODUCAO').every(i=>i.productionCompleted))return ['Produção concluída','ready'];
    return ['Programada','ready'];
  }
  function render(state){
    const ops=load(),all=(ops.orders||[]).filter(o=>prodQty(o)>0&&o.status!=='ENTREGUE');
    const f=state||{q:'',base:'TODAS'};
    const rows=all.filter(o=>{const q=f.q.toLowerCase();return (!q||[o.number,o.client,o.city].some(v=>String(v||'').toLowerCase().includes(q)))&&(f.base==='TODAS'||o.pcp?.deliveryBase===f.base)});
    const inProd=all.filter(o=>o.status==='ESTOQUE_PRODUCAO').length;
    const queued=all.filter(o=>o.status==='PCP').length;
    const completed=all.filter(o=>(o.items||[]).filter(i=>i.source==='PRODUCAO').every(i=>i.productionCompleted)).length;
    const volume=all.reduce((s,o)=>s+prodQty(o),0);
    const noDate=all.filter(o=>!o.pcp?.availableDate).length;
    content().innerHTML='<div class="fpr-page">'+
      '<div class="fpr-head"><div><h1>Produção</h1><p>Programação, capacidade e execução das ordens produtivas por base</p></div><div class="fpr-actions"><button class="fpr-btn secondary" id="fprRefresh">Atualizar</button></div></div>'+
      '<div class="fpr-kpis"><div class="fpr-kpi"><span>Fila PCP</span><strong>'+queued+'</strong><small>aguardando liberação</small></div><div class="fpr-kpi"><span>Em produção</span><strong>'+inProd+'</strong><small>ordens abertas</small></div><div class="fpr-kpi"><span>Volume a produzir</span><strong>'+volume+' cx</strong><small>carteira produtiva</small></div><div class="fpr-kpi"><span>Concluídas</span><strong>'+completed+'</strong><small>produto acabado gerado</small></div><div class="fpr-kpi"><span>Sem data</span><strong>'+noDate+'</strong><small>exigem programação</small></div></div>'+
      '<div class="fpr-grid"><div class="fpr-panel"><h2>Capacidade por base</h2>'+capacity(ops,all)+'</div><div class="fpr-panel"><h2>Saúde da produção</h2>'+health(all,ops)+'</div></div>'+
      '<div class="fpr-toolbar"><input class="fpr-search" id="fprSearch" placeholder="Buscar pedido ou cliente" value="'+esc(f.q)+'"><select class="fpr-select" id="fprBase"><option value="TODAS">Todas as bases</option>'+['SENIR','GREENTECH','TOPLAND'].map(b=>'<option value="'+b+'" '+(f.base===b?'selected':'')+'>'+b+'</option>').join('')+'</select><span class="fpr-muted">'+rows.length+' ordem(ns)</span></div>'+
      '<div class="fpr-table-wrap">'+table(rows,ops)+'</div></div>';
    document.getElementById('fprRefresh').onclick=()=>render(f);
    const q=document.getElementById('fprSearch'),base=document.getElementById('fprBase');
    q.oninput=()=>render({q:q.value,base:base.value});base.onchange=()=>render({q:q.value,base:base.value});
    document.querySelectorAll('[data-fpr-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.fprOpen));
  }
  function capacity(ops,orders){
    const bases=ops.productionBases||{};
    return Object.entries(bases).map(([base,cfg])=>{const cap=Number(cfg.capacityPerDay)||0;const committed=orders.filter(o=>o.pcp?.deliveryBase===base).reduce((s,o)=>s+(Number(o.pcp?.scheduledQty)||prodQty(o)),0);const pct=cap?Math.min(100,Math.round(committed/cap*100)):0;return '<div class="fpr-base"><div class="fpr-base-meta"><b>'+esc(base)+'</b><span>'+committed+' / '+cap+' cx · '+pct+'%</span></div><div class="fpr-bar"><i style="width:'+pct+'%"></i></div></div>'}).join('')||'<div class="fpr-empty">Capacidade não configurada.</div>';
  }
  function health(rows,ops){
    const noBase=rows.filter(o=>!o.pcp?.deliveryBase).length,noDate=rows.filter(o=>!o.pcp?.availableDate).length,blocked=rows.filter(o=>recipeStatus(o,ops)[1]==='block').length;
    const a=[];if(noBase)a.push(noBase+' ordem(ns) sem base produtiva.');if(noDate)a.push(noDate+' ordem(ns) sem data disponível.');if(blocked)a.push(blocked+' ordem(ns) com risco de falta de insumo.');
    return a.length?a.map(x=>'<div class="fpr-alert">⚠ '+x+'</div>').join(''):'<div class="fpr-alert good">✓ Nenhum alerta crítico de produção.</div>';
  }
  function table(rows,ops){
    if(!rows.length)return '<div class="fpr-empty">Nenhuma ordem produtiva encontrada.</div>';
    return '<table class="fpr-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Volume</th><th>Base</th><th>Produção</th><th>Disponível</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(o=>{const st=recipeStatus(o,ops);return '<tr><td><div class="fpr-order">'+esc(o.number)+'</div><div class="fpr-muted">'+dbr(o.orderDate)+'</div></td><td><div class="fpr-client">'+esc(o.client)+'</div><div class="fpr-muted">'+esc(o.city||'')+'</div></td><td>'+prodQty(o)+' cx<div class="fpr-muted">'+totalQty(o)+' cx no pedido</div></td><td>'+esc(o.pcp?.deliveryBase||'—')+'</td><td>'+dbr(o.pcp?.productionDate)+'</td><td>'+dbr(o.pcp?.availableDate)+'</td><td><span class="fpr-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fpr-open" data-fpr-open="'+esc(o.id)+'">Abrir ordem</button></td></tr>'}).join('')+'</tbody></table>';
  }
  function openOrder(id){
    const ops=load(),o=(ops.orders||[]).find(x=>String(x.id)===String(id));
    if(!o)return;
    renderDetail(o,ops);
  }
  function renderDetail(o,ops){
    const prodItems=(o.items||[]).filter(i=>i.source==='PRODUCAO');
    const st=recipeStatus(o,ops);
    const base=o.pcp?.deliveryBase||prodItems.map(i=>i.deliveryBase).find(Boolean)||'—';
    content().innerHTML='<div class="fpr-page">'+
      '<div class="fpr-head"><div><button class="fpr-btn secondary" id="fprBack">← Produção</button><h1>Ordem de Produção · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+' · Base '+esc(base)+'</p></div><span class="fpr-chip '+st[1]+'">'+st[0]+'</span></div>'+
      '<div class="fpr-grid"><div class="fpr-panel"><h2>Programação</h2>'+
        '<div class="fpr-alert"><b>Base produtiva:</b> '+esc(base)+'</div>'+
        '<div class="fpr-alert"><b>Data programada:</b> '+dbr(o.pcp?.productionDate)+'</div>'+
        '<div class="fpr-alert"><b>Disponibilidade prevista:</b> '+dbr(o.pcp?.availableDate)+'</div>'+
      '</div><div class="fpr-panel"><h2>Execução</h2>'+
        '<div class="fpr-alert"><b>Volume a produzir:</b> '+prodQty(o)+' cx</div>'+
        '<div class="fpr-alert"><b>Itens produtivos:</b> '+prodItems.length+'</div>'+
        '<div class="fpr-alert"><b>Status:</b> '+esc(st[0])+'</div>'+
      '</div></div>'+
      '<div class="fpr-panel"><h2>Itens da ordem</h2>'+
      (prodItems.length?'<table class="fpr-table"><thead><tr><th>Código</th><th>Produto</th><th>Quantidade</th><th>Base</th><th>Insumos</th><th>Produção</th></tr></thead><tbody>'+
        prodItems.map(i=>'<tr><td>'+esc(i.code||'—')+'</td><td>'+esc(i.name||'—')+'</td><td>'+Number(i.qty||0)+' cx</td><td>'+esc(i.deliveryBase||base)+'</td><td>'+((i.productionRequirements||[]).length)+' requisito(s)</td><td>'+((i.productionCompleted)?'Concluída':(i.productionConsumed?'Em execução':'Pendente'))+'</td></tr>').join('')+
      '</tbody></table>':'<div class="fpr-empty">Nenhum item deste pedido foi marcado para produção.</div>')+
      '</div>'+
      '<div class="fpr-panel"><h2>Função do módulo Produção</h2><div class="fpr-alert">Este módulo é a área operacional para programar e acompanhar produção por base, comparar consumo teórico x real de insumos, registrar perdas, lote produzido, início/fim e conclusão. Ele não deve abrir o simulador comercial.</div></div>'+
      '</div>';
    document.getElementById('fprBack').onclick=()=>render({q:'',base:'TODAS'});
  }
  window.FocadoProduction={render,openOrder};
})();