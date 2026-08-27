(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const prodQty=o=>(o.items||[]).filter(i=>i.source==='PRODUCAO').reduce((s,i)=>s+(Number(i.qty)||0),0);
  const stockQty=o=>(o.items||[]).filter(i=>i.source==='ESTOQUE').reduce((s,i)=>s+(Number(i.qty)||0),0);
  const totalQty=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0);

  function planningStatus(o){
    if(o.status==='PCP' && !(o.pcp?.deliveryBase)) return ['Aguardando base','pending'];
    if(o.status==='PCP' && (o.items||[]).some(i=>!i.source)) return ['Definir origem','attention'];
    if(prodQty(o)>0 && !o.pcp?.availableDate) return ['Sem data disponível','attention'];
    if(o.pcp?.deliveryBase && (o.pcp?.availableDate || prodQty(o)===0)) return ['Planejado','planned'];
    return ['Em análise','pending'];
  }
  function sourceHtml(o){
    const p=prodQty(o),s=stockQty(o),parts=[];
    if(s)parts.push('<span class="fp-chip stock">Estoque '+s+' cx</span>');
    if(p)parts.push('<span class="fp-chip prod">Produção '+p+' cx</span>');
    if(!parts.length)parts.push('<span class="fp-chip none">Não definido</span>');
    return parts.join('');
  }
  function capacityRows(ops){
    const bases=ops.productionBases||{};
    const orders=ops.orders||[];
    return Object.entries(bases).map(([base,cfg])=>{
      const cap=Number(cfg.capacityPerDay)||0;
      const committed=orders.filter(o=>o.status!=='ENTREGUE'&&o.pcp?.deliveryBase===base&&prodQty(o)>0).reduce((s,o)=>s+(Number(o.pcp?.scheduledQty)||prodQty(o)),0);
      const pct=cap?Math.min(100,Math.round(committed/cap*100)):0;
      return '<div class="fp-base"><div class="fp-base-meta"><b>'+esc(base)+'</b><span>'+committed+' / '+cap+' cx · '+pct+'%</span></div><div class="fp-bar"><i style="width:'+pct+'%"></i></div></div>';
    }).join('')||'<div class="fp-empty">Capacidades ainda não configuradas.</div>';
  }
  function render(state){
    const ops=load(),all=(ops.orders||[]).filter(o=>o.status==='PCP'||o.status==='ESTOQUE_PRODUCAO');
    const f=state||{q:'',base:'TODAS'};
    const rows=all.filter(o=>{
      const q=f.q.toLowerCase();
      const mq=!q||[o.number,o.client,o.cnpj,o.city].some(v=>String(v||'').toLowerCase().includes(q));
      const mb=f.base==='TODAS'||o.pcp?.deliveryBase===f.base;
      return mq&&mb;
    });
    const awaiting=all.filter(o=>o.status==='PCP').length;
    const planned=all.filter(o=>planningStatus(o)[1]==='planned').length;
    const prod=all.reduce((s,o)=>s+prodQty(o),0);
    const stock=all.reduce((s,o)=>s+stockQty(o),0);
    const noDate=all.filter(o=>prodQty(o)>0&&!o.pcp?.availableDate).length;

    content().innerHTML='<div class="fp-page">'+
      '<div class="fp-head"><div><h1>PCP</h1><p>Planejamento e controle da carteira operacional</p></div><div class="fp-actions"><button class="fp-btn secondary" id="fpRefresh">Atualizar</button><button class="fp-btn primary" id="fpCapacity">Capacidade produtiva</button></div></div>'+
      '<div class="fp-kpis">'+
        '<div class="fp-kpi"><span>Aguardando PCP</span><strong>'+awaiting+'</strong><small>pedidos em análise</small></div>'+
        '<div class="fp-kpi"><span>Planejados</span><strong>'+planned+'</strong><small>com base/data definidas</small></div>'+
        '<div class="fp-kpi"><span>Produção necessária</span><strong>'+prod+' cx</strong><small>volume em carteira</small></div>'+
        '<div class="fp-kpi"><span>Atendimento por estoque</span><strong>'+stock+' cx</strong><small>volume direcionado</small></div>'+
        '<div class="fp-kpi"><span>Sem data disponível</span><strong>'+noDate+'</strong><small>exigem atenção</small></div>'+
      '</div>'+
      '<div class="fp-grid"><div class="fp-panel"><h2>Capacidade por base</h2>'+capacityRows(ops)+'</div><div class="fp-panel"><h2>Pontos de atenção</h2>'+attention(all)+'</div></div>'+
      '<div class="fp-toolbar"><input class="fp-search" id="fpSearch" placeholder="Buscar pedido, cliente, CNPJ ou cidade" value="'+esc(f.q)+'"><select class="fp-select" id="fpBase"><option value="TODAS">Todas as bases</option>'+['SENIR','GREENTECH','TOPLAND'].map(b=>'<option value="'+b+'" '+(f.base===b?'selected':'')+'>'+b+'</option>').join('')+'</select><span class="fp-muted">'+rows.length+' pedido(s)</span></div>'+
      '<div class="fp-table-wrap">'+table(rows)+'</div></div>';

    document.getElementById('fpRefresh').onclick=()=>render(f);
    document.getElementById('fpCapacity').onclick=()=>window.FocadoPCP.openProduction();
    const q=document.getElementById('fpSearch'),base=document.getElementById('fpBase');
    q.oninput=()=>render({q:q.value,base:base.value}); base.onchange=()=>render({q:q.value,base:base.value});
    document.querySelectorAll('[data-fp-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.fpOpen));
  }
  function attention(rows){
    const notes=[];
    const undefinedSource=rows.filter(o=>(o.items||[]).some(i=>!i.source)).length;
    const undefinedBase=rows.filter(o=>!o.pcp?.deliveryBase).length;
    const undefinedDate=rows.filter(o=>prodQty(o)>0&&!o.pcp?.availableDate).length;
    if(undefinedSource)notes.push(undefinedSource+' pedido(s) sem definição Estoque/Produção.');
    if(undefinedBase)notes.push(undefinedBase+' pedido(s) sem base produtiva definida.');
    if(undefinedDate)notes.push(undefinedDate+' pedido(s) de produção sem data disponível.');
    if(!notes.length)return '<div class="fp-alert" style="background:#eaf6ee;color:#177347">✓ Nenhuma pendência crítica de planejamento.</div>';
    return notes.map(n=>'<div class="fp-alert">⚠ '+n+'</div>').join('');
  }
  function table(rows){
    if(!rows.length)return '<div class="fp-empty">Nenhum pedido encontrado para os filtros atuais.</div>';
    return '<table class="fp-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Origem</th><th>Base</th><th>Produção</th><th>Disponível</th><th>Status PCP</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const st=planningStatus(o);
      return '<tr><td><div class="fp-order">'+esc(o.number)+'</div><div class="fp-muted">'+dbr(o.orderDate)+'</div></td><td><div class="fp-client">'+esc(o.client)+'</div><div class="fp-muted">'+esc(o.city||'')+'</div></td><td>'+((o.items||[]).length)+'<div class="fp-muted">'+totalQty(o)+' cx</div></td><td><div class="fp-source">'+sourceHtml(o)+'</div></td><td>'+esc(o.pcp?.deliveryBase||'—')+'</td><td>'+dbr(o.pcp?.productionDate)+'</td><td>'+dbr(o.pcp?.availableDate)+'</td><td><span class="fp-status '+st[1]+'">'+st[0]+'</span></td><td><button class="fp-open" data-fp-open="'+esc(o.id)+'">Planejar</button></td></tr>';
    }).join('')+'</tbody></table>';
  }
  function openOrder(id){
    document.getElementById('focadoShell')?.classList.add('hidden');
    const btn=document.getElementById('hubGoOperacoes'); if(!btn)return; btn.click();
    setTimeout(()=>{const row=document.querySelector('[data-open-order="'+CSS.escape(id)+'"]');if(row)row.click()},20);
  }
  function openProduction(){
    document.getElementById('focadoShell')?.classList.add('hidden');
    const btn=document.getElementById('hubGoOperacoes'); if(!btn)return; btn.click();
    setTimeout(()=>document.querySelector('#opsBody [data-view="production"]')?.click(),20);
  }
  window.FocadoPCP={render,openOrder,openProduction};
})();