(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const avail=inv=>Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0));
  const reorder=inv=>{const r=inv.reorder||{};return Math.max(0,(Number(r.avgDaily)||0)*(Number(r.leadTimeDays)||0)+(Number(r.safetyStock)||0))};
  const fmt=(v,d=3)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  function status(inv,type){
    const a=avail(inv),b=Number(inv.blocked||0),rp=type==='input'?reorder(inv):0;
    if(b>0)return ['Bloqueado','block'];
    if(type==='input'&&rp>0&&a<=rp)return ['Reposição','reorder'];
    return ['Normal','ok'];
  }
  function render(state){
    const ops=load(),s=state||{tab:'inputs',q:'',filter:'TODOS'};
    const inputs=Object.entries(ops.inputInventory||{}),finished=Object.entries(ops.inventory||{});
    const all=s.tab==='inputs'?inputs:finished;
    const rows=all.filter(([,inv])=>{
      const q=s.q.toLowerCase();
      const mq=!q||[inv.name,inv.code,(inv.erpIds||[]).join(' '),inv.warehouse].some(v=>String(v||'').toLowerCase().includes(q));
      const st=status(inv,s.tab==='inputs'?'input':'finished')[0];
      const mf=s.filter==='TODOS'||st===s.filter;
      return mq&&mf;
    });
    const totalPhysical=all.reduce((x,[,i])=>x+Number(i.physical||0),0);
    const totalReserved=all.reduce((x,[,i])=>x+Number(i.reserved||0),0);
    const totalBlocked=all.reduce((x,[,i])=>x+Number(i.blocked||0),0);
    const totalAvailable=all.reduce((x,[,i])=>x+avail(i),0);
    const critical=inputs.filter(([,i])=>{const rp=reorder(i);return rp>0&&avail(i)<=rp}).length;
    const blockedCount=all.filter(([,i])=>Number(i.blocked||0)>0).length;
    content().innerHTML='<div class="fi-page">'+
      '<div class="fi-head"><div><h1>Estoque</h1><p>Controle físico, reservado, bloqueado e disponível</p></div><div class="fi-actions"><button class="fi-btn secondary" id="fiMov">Movimentações</button><button class="fi-btn secondary" id="fiInv">Inventário</button><button class="fi-btn primary" id="fiRepos">Reposição</button></div></div>'+
      '<div class="fi-kpis"><div class="fi-kpi"><span>Físico</span><strong>'+fmt(totalPhysical)+'</strong><small>saldo total da visão</small></div><div class="fi-kpi"><span>Reservado</span><strong>'+fmt(totalReserved)+'</strong><small>comprometido</small></div><div class="fi-kpi"><span>Bloqueado</span><strong>'+fmt(totalBlocked)+'</strong><small>não disponível</small></div><div class="fi-kpi"><span>Disponível</span><strong>'+fmt(totalAvailable)+'</strong><small>saldo livre</small></div><div class="fi-kpi"><span>Reposição crítica</span><strong>'+critical+'</strong><small>insumos abaixo do ponto</small></div><div class="fi-kpi"><span>Itens bloqueados</span><strong>'+blockedCount+'</strong><small>exigem atenção</small></div></div>'+
      '<div class="fi-tabs"><button class="fi-tab '+(s.tab==='inputs'?'active':'')+'" data-fi-tab="inputs">Insumos</button><button class="fi-tab '+(s.tab==='finished'?'active':'')+'" data-fi-tab="finished">Produtos Acabados</button></div>'+
      '<div class="fi-grid"><div class="fi-panel"><h2>Alertas do estoque</h2>'+alerts(ops,s.tab)+'</div><div class="fi-panel"><h2>Resumo da operação</h2>'+summary(ops)+'</div></div>'+
      '<div class="fi-toolbar"><input class="fi-search" id="fiSearch" placeholder="Buscar item, código, ERP ou depósito" value="'+esc(s.q)+'"><select class="fi-select" id="fiFilter"><option value="TODOS">Todos os status</option><option value="Normal" '+(s.filter==='Normal'?'selected':'')+'>Normal</option><option value="Bloqueado" '+(s.filter==='Bloqueado'?'selected':'')+'>Bloqueado</option><option value="Reposição" '+(s.filter==='Reposição'?'selected':'')+'>Reposição</option></select><span class="fi-muted">'+rows.length+' item(ns)</span></div>'+
      '<div class="fi-table-wrap">'+table(rows,s.tab)+'</div></div>';
    document.querySelectorAll('[data-fi-tab]').forEach(b=>b.onclick=()=>render({tab:b.dataset.fiTab,q:s.q,filter:s.filter}));
    const q=document.getElementById('fiSearch'),fl=document.getElementById('fiFilter');
    q.oninput=()=>render({tab:s.tab,q:q.value,filter:fl.value});fl.onchange=()=>render({tab:s.tab,q:q.value,filter:fl.value});
    document.querySelectorAll('[data-fi-open]').forEach(b=>b.onclick=()=>openItem(s.tab,b.dataset.fiOpen));
    document.getElementById('fiMov').onclick=()=>renderMovements();
    document.getElementById('fiInv').onclick=()=>renderInventoryCounts(s.tab);
    document.getElementById('fiRepos').onclick=()=>renderReplenishment();
  }
  function alerts(ops,tab){
    const list=tab==='inputs'?Object.values(ops.inputInventory||{}):Object.values(ops.inventory||{});
    const a=[];
    const blocked=list.filter(i=>Number(i.blocked||0)>0).length;if(blocked)a.push(['!',blocked+' item(ns) com saldo bloqueado','Não entram no saldo disponível']);
    if(tab==='inputs'){const critical=list.filter(i=>{const rp=reorder(i);return rp>0&&avail(i)<=rp}).length;if(critical)a.push(['↻',critical+' insumo(s) em ponto de reposição','Revisar necessidade de compra'])}
    const reserved=list.filter(i=>Number(i.reserved||0)>0).length;if(reserved)a.push(['▣',reserved+' item(ns) com saldo reservado','Comprometidos com pedidos']);
    if(!a.length)return '<div class="fi-alert"><div class="fi-alert-icon">✓</div><div><b>Nenhum alerta crítico</b><small>Estoque sem exceções registradas</small></div></div>';
    return a.map(x=>'<div class="fi-alert"><div class="fi-alert-icon">'+x[0]+'</div><div><b>'+x[1]+'</b><small>'+x[2]+'</small></div></div>').join('');
  }
  function summary(ops){
    const mov=(ops.stockMovements||[]).length,counts=(ops.inventoryCounts||[]).length,lots=Object.values(ops.inputInventory||{}).reduce((s,i)=>s+(i.lots||[]).length,0);
    return '<div class="fi-alert"><div class="fi-alert-icon">↕</div><div><b>'+mov+' movimentações registradas</b><small>Histórico auditável do estoque</small></div></div><div class="fi-alert"><div class="fi-alert-icon">✓</div><div><b>'+counts+' contagens físicas</b><small>Inventários registrados</small></div></div><div class="fi-alert"><div class="fi-alert-icon">◇</div><div><b>'+lots+' lotes cadastrados</b><small>Rastreabilidade dos insumos</small></div></div>';
  }
  function table(rows,tab){
    if(!rows.length)return '<div class="fi-empty">Nenhum item encontrado para os filtros atuais.</div>';
    return '<table class="fi-table"><thead><tr><th>Item</th><th>Unidade</th><th>Físico</th><th>Reservado</th><th>Bloqueado</th><th>Disponível</th>'+(tab==='inputs'?'<th>Ponto reposição</th><th>Lotes</th>':'')+'<th>Status</th><th></th></tr></thead><tbody>'+rows.map(([key,inv])=>{const st=status(inv,tab==='inputs'?'input':'finished');const a=avail(inv),rp=tab==='inputs'?reorder(inv):0;const cls=st[1]==='block'?'bad':st[1]==='reorder'?'warn':'good';return '<tr><td><div class="fi-item">'+esc(inv.name||key)+'</div><div class="fi-muted">'+esc(inv.code||key)+(inv.erpIds?.length?' · ERP '+esc(inv.erpIds.join(', ')):'')+(inv.warehouse?' · '+esc(inv.warehouse):'')+'</div></td><td>'+esc(inv.unit||'UNID')+'</td><td>'+fmt(inv.physical)+'</td><td>'+fmt(inv.reserved)+'</td><td>'+fmt(inv.blocked)+'</td><td><span class="fi-stock '+cls+'">'+fmt(a)+'</span></td>'+(tab==='inputs'?'<td>'+fmt(rp)+'</td><td>'+((inv.lots||[]).length)+'</td>':'')+'<td><span class="fi-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fi-open" data-fi-open="'+esc(key)+'">Abrir</button></td></tr>'}).join('')+'</tbody></table>';
  }
  function backButton(label='Estoque'){return '<button class="fi-btn secondary" id="fiBack">← '+label+'</button>'}
  function bindBack(tab='inputs'){const b=document.getElementById('fiBack');if(b)b.onclick=()=>render({tab,q:'',filter:'TODOS'})}

  function openItem(tab,key){
    const ops=load(),bucket=tab==='inputs'?(ops.inputInventory||{}):(ops.inventory||{}),inv=bucket[key];
    if(!inv){alert('Item não encontrado.');return}
    const st=status(inv,tab==='inputs'?'input':'finished'),a=avail(inv);
    content().innerHTML='<div class="fi-page">'+
      '<div class="fi-head"><div>'+backButton('Estoque')+'<h1 style="margin-top:10px">'+esc(inv.name||key)+'</h1><p>'+esc(inv.code||key)+(inv.warehouse?' · '+esc(inv.warehouse):'')+'</p></div></div>'+
      '<div class="fi-kpis"><div class="fi-kpi"><span>Físico</span><strong>'+fmt(inv.physical)+'</strong><small>'+esc(inv.unit||'UNID')+'</small></div><div class="fi-kpi"><span>Reservado</span><strong>'+fmt(inv.reserved)+'</strong><small>comprometido</small></div><div class="fi-kpi"><span>Bloqueado</span><strong>'+fmt(inv.blocked)+'</strong><small>não disponível</small></div><div class="fi-kpi"><span>Disponível</span><strong>'+fmt(a)+'</strong><small>saldo livre</small></div></div>'+
      '<div class="fi-grid"><div class="fi-panel"><h2>Dados do item</h2><div class="fi-alert"><div class="fi-alert-icon">#</div><div><b>Código '+esc(inv.code||key)+'</b><small>ERP '+esc((inv.erpIds||[]).join(', ')||'—')+'</small></div></div><div class="fi-alert"><div class="fi-alert-icon">◇</div><div><b>Status: '+st[0]+'</b><small>Unidade '+esc(inv.unit||'UNID')+'</small></div></div></div>'+
      '<div class="fi-panel"><h2>Rastreabilidade</h2><div class="fi-alert"><div class="fi-alert-icon">↕</div><div><b>'+((ops.stockMovements||[]).filter(m=>String(m.key)===String(key)||String(m.code)===String(inv.code)).length)+' movimentações</b><small>histórico deste item</small></div></div><div class="fi-alert"><div class="fi-alert-icon">✓</div><div><b>'+((ops.inventoryCounts||[]).filter(m=>String(m.key)===String(key)||String(m.code)===String(inv.code)).length)+' contagens</b><small>inventários físicos</small></div></div></div></div>'+
      (tab==='inputs'?'<div class="fi-panel"><h2>Lotes</h2>'+((inv.lots||[]).length?'<div class="fi-table-wrap"><table class="fi-table"><thead><tr><th>Origem</th><th>ERP</th><th>Qtd.</th><th>Bloqueado</th><th>Depósito</th><th>Observação</th></tr></thead><tbody>'+(inv.lots||[]).map(l=>'<tr><td>'+esc(l.source||'—')+'</td><td>'+esc(l.erpId||'—')+'</td><td>'+fmt(l.qty)+'</td><td>'+fmt(l.blocked)+'</td><td>'+esc(l.warehouse||'—')+'</td><td>'+esc(l.note||'—')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="fi-empty">Nenhum lote cadastrado.</div>')+'</div>':'')+
      '</div>';
    bindBack(tab);
  }

  function renderMovements(){
    const ops=load(),rows=(ops.stockMovements||[]).slice().sort((a,b)=>(b.at||0)-(a.at||0));
    content().innerHTML='<div class="fi-page"><div class="fi-head"><div>'+backButton('Estoque')+'<h1 style="margin-top:10px">Movimentações</h1><p>Histórico auditável de entradas, saídas, reservas, liberações e ajustes</p></div></div>'+
      '<div class="fi-table-wrap">'+(rows.length?'<table class="fi-table"><thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th>Quantidade</th><th>Motivo</th><th>Usuário</th><th>Depósito</th></tr></thead><tbody>'+rows.map(m=>'<tr><td>'+new Date(m.at||0).toLocaleString('pt-BR')+'</td><td><span class="fi-chip '+(String(m.type).includes('SAIDA')?'block':'ok')+'">'+esc(m.type||'—')+'</span></td><td><b>'+esc(m.name||m.code||m.key||'—')+'</b><div class="fi-muted">'+esc(m.code||'')+'</div></td><td>'+fmt(m.qty) +' '+esc(m.unit||'')+'</td><td>'+esc(m.reason||'—')+'</td><td>'+esc(m.user||'—')+'</td><td>'+esc(m.warehouse||'—')+'</td></tr>').join('')+'</tbody></table>':'<div class="fi-empty">Nenhuma movimentação registrada.</div>')+'</div></div>';
    bindBack('inputs');
  }

  function renderInventoryCounts(tab='inputs'){
    const ops=load(),rows=(ops.inventoryCounts||[]).slice().sort((a,b)=>(b.at||0)-(a.at||0));
    content().innerHTML='<div class="fi-page"><div class="fi-head"><div>'+backButton('Estoque')+'<h1 style="margin-top:10px">Inventário</h1><p>Contagens físicas e ajustes registrados</p></div></div>'+
      '<div class="fi-table-wrap">'+(rows.length?'<table class="fi-table"><thead><tr><th>Data</th><th>Item</th><th>Sistema</th><th>Contado</th><th>Diferença</th><th>Motivo</th><th>Usuário</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+new Date(r.at||0).toLocaleString('pt-BR')+'</td><td><b>'+esc(r.name||r.code||r.key||'—')+'</b><div class="fi-muted">'+esc(r.code||'')+'</div></td><td>'+fmt(r.system)+'</td><td>'+fmt(r.counted)+'</td><td><span class="fi-stock '+(Number(r.diff||0)===0?'good':'warn')+'">'+fmt(r.diff)+'</span></td><td>'+esc(r.reason||'—')+'</td><td>'+esc(r.user||'—')+'</td></tr>').join('')+'</tbody></table>':'<div class="fi-empty">Nenhuma contagem física registrada.</div>')+'</div></div>';
    bindBack(tab);
  }

  function renderReplenishment(){
    const ops=load(),rows=Object.entries(ops.inputInventory||{}).map(([key,inv])=>({key,inv,rp:reorder(inv),av:avail(inv)})).filter(x=>x.rp>0).sort((a,b)=>(a.av-a.rp)-(b.av-b.rp));
    content().innerHTML='<div class="fi-page"><div class="fi-head"><div>'+backButton('Estoque')+'<h1 style="margin-top:10px">Reposição</h1><p>Ponto de reposição e necessidade sugerida de compra</p></div></div>'+
      '<div class="fi-table-wrap">'+(rows.length?'<table class="fi-table"><thead><tr><th>Insumo</th><th>Disponível</th><th>Ponto reposição</th><th>Sugestão compra</th><th>Status</th></tr></thead><tbody>'+rows.map(x=>{const sug=Math.max(0,x.rp-x.av),crit=x.av<=x.rp;return '<tr><td><b>'+esc(x.inv.name||x.key)+'</b><div class="fi-muted">'+esc(x.inv.code||x.key)+'</div></td><td>'+fmt(x.av)+' '+esc(x.inv.unit||'')+'</td><td>'+fmt(x.rp)+' '+esc(x.inv.unit||'')+'</td><td>'+fmt(sug)+' '+esc(x.inv.unit||'')+'</td><td><span class="fi-chip '+(crit?'reorder':'ok')+'">'+(crit?'COMPRAR':'NORMAL')+'</span></td></tr>'}).join('')+'</tbody></table>':'<div class="fi-empty">Nenhum insumo possui ponto de reposição configurado.</div>')+'</div></div>';
    bindBack('inputs');
  }

  window.FocadoInventory={render,openItem,renderMovements,renderInventoryCounts,renderReplenishment};
})();