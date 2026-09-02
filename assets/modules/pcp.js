(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const totalQty=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0);
  const orderValue=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  let filters={q:'',base:'TODAS',stage:'TODOS'};

  function ensureOrderIds(ops){
    let changed=false;
    const used=new Set((ops.orders||[]).map(o=>String(o.id||'')).filter(Boolean));
    (ops.orders||[]).forEach((o,index)=>{
      if(!o.id){
        const base=String(o.number||('pedido-'+(index+1))).replace(/[^a-zA-Z0-9_-]/g,'_');
        let candidate='op_'+base,n=2;while(used.has(candidate)){candidate='op_'+base+'_'+n;n++}
        o.id=candidate;used.add(candidate);changed=true;
      }
      o.pcp=o.pcp||{};
      (o.items||[]).forEach(i=>{
        if(i.reservedQty==null)i.reservedQty=0;
        if(i.cutQty==null)i.cutQty=0;
        if(i.pcpAvailabilityDate==null)i.pcpAvailabilityDate='';
        if(i.deliveryBase==null)i.deliveryBase=o.pcp.deliveryBase||'';
        if(i.pcpBalanceDecision==null)i.pcpBalanceDecision='AGUARDAR';
      });
    });
    if(changed){window.FocadoDataStore?.writeLocal?.(ops);window.FocadoDataStore?.save?.(ops)}
    return ops;
  }

  function inventoryEntry(ops,item){
    const inv=ops.inventory||{};
    const keys=[item.code,item.productId,item.name].map(v=>String(v||'')).filter(Boolean);
    for(const k of keys){if(inv[k])return {key:k,inv:inv[k]}}
    const byCode=Object.entries(inv).find(([,v])=>String(v?.code||'')===String(item.code||''));
    return byCode?{key:byCode[0],inv:byCode[1]}:null;
  }
  function stockView(ops,item){
    const found=inventoryEntry(ops,item);
    if(!found)return {physical:0,reserved:0,blocked:0,available:0,key:String(item.code||item.productId||item.name||'')};
    const x=found.inv,physical=Number(x.physical||0),reserved=Number(x.reserved||0),blocked=Number(x.blocked||0);
    return {physical,reserved,blocked,available:Math.max(0,physical-reserved-blocked),key:found.key};
  }
  function remaining(i){return Math.max(0,Number(i.qty||0)-Number(i.reservedQty||0)-Number(i.cutQty||0))}
  function planningStatus(o){
    if(o.status==='LOGISTICA')return ['PCP concluído','done'];
    const items=o.items||[];
    if(items.some(i=>!i.deliveryBase))return ['Definir base por item','attention'];
    if(items.some(i=>remaining(i)>0 && i.pcpBalanceDecision==='AGUARDAR' && !i.pcpAvailabilityDate))return ['Informar previsão de saldo','attention'];
    const waiting=items.filter(i=>remaining(i)>0 && i.pcpBalanceDecision==='AGUARDAR' && i.pcpAvailabilityDate);
    if(waiting.length){
      const latest=waiting.map(i=>i.pcpAvailabilityDate).sort().slice(-1)[0];
      return ['Aguardando estoque até '+dbr(latest),'attention'];
    }
    if(items.some(i=>remaining(i)>0))return ['Aguardando decisão','attention'];
    return ['Pronto para liberar','ready'];
  }
  function pcpStage(o){
    if(o.status!=='PCP')return 'CONCLUIDO';
    const items=o.items||[];
    const untouched=items.every(i=>
      !i.deliveryBase &&
      Number(i.reservedQty||0)===0 &&
      Number(i.cutQty||0)===0 &&
      !i.pcpAvailabilityDate
    ) && !String(o.pcp?.notes||'').trim() && !o.pcp?.logisticsPreRelease;
    if(untouched)return 'AGUARDANDO';
    if(planningStatus(o)[1]==='ready')return 'PRONTO';
    return 'PLANEJAMENTO';
  }
  function basesOf(o){return [...new Set((o.items||[]).map(i=>i.deliveryBase).filter(Boolean))]}

  function productIdentity(i){return String(i.code||i.productId||i.name||'')}
  function productionRequestedByProduct(ops){
    const map={};
    for(const r of ops.productionRequests||[]){
      if(!['RASCUNHO','FINALIZADA'].includes(r.status))continue;
      const snap=r.snapshot||r;
      for(const it of snap.items||[]){
        const p=it.product||{},key=String(p.code||p.id||p.name||'');
        if(!key)continue;
        map[key]=map[key]||{qty:0,bases:new Set(),requests:[]};
        map[key].qty+=Number(it.qty||0);
        if(snap.base)map[key].bases.add(snap.base);
        map[key].requests.push(r.number||r.id);
      }
    }
    return map;
  }
  function consolidatedRows(ops){
    const prodReq=productionRequestedByProduct(ops),agg={};
    const active=(ops.orders||[]).filter(o=>o.status==='PCP');
    for(const o of active){
      for(const i of o.items||[]){
        const key=productIdentity(i);if(!key)continue;
        const sv=stockView(ops,i);
        if(!agg[key])agg[key]={
          key,code:i.code||'',name:i.name||'',productId:i.productId||'',
          demand:0,reserved:0,cut:0,orders:new Set(),bases:new Set(),dates:[],
          stockPhysical:sv.physical,stockReserved:sv.reserved,stockBlocked:sv.blocked,stockAvailable:sv.available
        };
        const a=agg[key];
        a.demand+=Number(i.qty||0);
        a.reserved+=Number(i.reservedQty||0);
        a.cut+=Number(i.cutQty||0);
        a.orders.add(o.number||o.id);
        if(i.deliveryBase)a.bases.add(i.deliveryBase);
        if(i.pcpAvailabilityDate)a.dates.push(i.pcpAvailabilityDate);
        if(o.requestedDeliveryDate)a.dates.push(o.requestedDeliveryDate);
      }
    }
    return Object.values(agg).map(a=>{
      const remainingAfterReserveCut=Math.max(0,a.demand-a.reserved-a.cut);
      const stockCanCover=Math.min(a.stockAvailable,remainingAfterReserveCut);
      const productionNeed=Math.max(0,remainingAfterReserveCut-stockCanCover);
      const pr=prodReq[a.code]||prodReq[a.productId]||prodReq[a.key]||{qty:0,bases:new Set(),requests:[]};
      const requestedProduction=Number(pr.qty||0);
      const toRequest=Math.max(0,productionNeed-requestedProduction);
      return {...a,
        orderCount:a.orders.size,bases:[...a.bases],criticalDate:a.dates.filter(Boolean).sort()[0]||'',
        productionNeed,requestedProduction,toRequest,productionBases:[...(pr.bases||[])],productionRequests:pr.requests||[]
      };
    }).sort((a,b)=>b.toRequest-a.toRequest||b.productionNeed-a.productionNeed||String(a.name).localeCompare(String(b.name)));
  }
  function consolidatedTotals(rows){
    return rows.reduce((t,r)=>({
      demand:t.demand+r.demand,reserved:t.reserved+r.reserved,cut:t.cut+r.cut,
      productionNeed:t.productionNeed+r.productionNeed,requested:t.requested+r.requestedProduction,toRequest:t.toRequest+r.toRequest
    }),{demand:0,reserved:0,cut:0,productionNeed:0,requested:0,toRequest:0});
  }

  function render(state){
    filters=state||filters;
    const ops=ensureOrderIds(load());
    const all=(ops.orders||[]).filter(o=>o.status==='PCP');
    const historyRows=(ops.orders||[])
      .filter(o=>o.status!=='PCP'&&o.status!=='COMERCIAL'&&o.commercial?.completedAt)
      .sort((a,b)=>pcpHistoryAt(b)-pcpHistoryAt(a))
      .slice(0,10);
    const knownBases=['SENIR','GREENTECH','TOPLAND'];
    const rows=all.filter(o=>{
      const q=filters.q.toLowerCase();
      const match=!q||[o.number,o.client,o.cnpj,o.city,o.representative,(o.items||[]).map(i=>i.name+' '+i.code).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const byBase=filters.base==='TODAS'||basesOf(o).includes(filters.base);
      const byStage=filters.stage==='TODOS'||pcpStage(o)===filters.stage;
      return match&&byBase&&byStage;
    });
    const awaiting=all.filter(o=>pcpStage(o)==='AGUARDANDO').length;
    const planning=all.filter(o=>pcpStage(o)==='PLANEJAMENTO').length;
    const ready=all.filter(o=>pcpStage(o)==='PRONTO').length;
    const done=(ops.orders||[]).filter(o=>['LOGISTICA','ENTREGUE'].includes(o.status)).length;
    const reserved=all.reduce((s,o)=>s+(o.items||[]).reduce((a,i)=>a+Number(i.reservedQty||0),0),0);
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><h1>PCP</h1><p>Estoque real por código · reserva · disponibilidade · base de retirada</p></div><div class="fpcp-actions"><button class="fpcp-btn primary" id="fpMRP">MRP / Capacidade</button><button class="fpcp-btn primary" id="fpConsolidated">Planejamento consolidado</button></div></div>'+
      '<div class="fpcp-kpis">'+
        kpiFilter('Aguardando análise',awaiting,'pedidos ainda não trabalhados','AGUARDANDO')+
        kpiFilter('Em planejamento',planning,'PCP já iniciou o atendimento','PLANEJAMENTO')+
        kpiFilter('Prontos para liberar',ready,'itens totalmente resolvidos','PRONTO')+
        kpi('PCP concluído',done,'enviados para Logística')+
        kpi('Reservado',reserved+' cx','estoque comprometido com pedidos')+
      '</div>'+
      '<div class="fpcp-guide"><b>Como operar:</b><span>1. Abra o pedido</span><span>2. Confira o saldo atual</span><span>3. Reserve total ou parcialmente</span><span>4. Informe previsão do saldo ou corte</span><span>5. Defina a base por item e libere</span></div>'+
      '<div class="fpcp-toolbar"><input class="fpcp-search" id="fpSearch" placeholder="Buscar pedido, cliente, CNPJ, representante ou produto" value="'+esc(filters.q)+'"><select class="fpcp-select" id="fpBase"><option value="TODAS">Todas as bases</option>'+knownBases.map(b=>'<option value="'+b+'" '+(filters.base===b?'selected':'')+'>'+b+'</option>').join('')+'</select><span class="fpcp-muted">'+rows.length+' pedido(s)</span></div>'+
      '<div class="fpcp-table-wrap">'+table(rows)+'</div>'+
      '<section class="fpcp-recent-history"><div class="fpcp-history-head"><div><span>HISTÓRICO PCP</span><h2>Últimos 10 pedidos processados</h2><p>Pedidos que já saíram da fila ativa continuam disponíveis para consulta.</p></div><strong>'+historyRows.length+'</strong></div>'+
      '<div class="fpcp-table-wrap">'+historyTable(historyRows)+'</div></section></div>';
    document.getElementById('fpMRP').onclick=()=>window.FocadoIntelligenceUI?.renderMRP();
    document.getElementById('fpConsolidated').onclick=()=>renderConsolidated();
    const q=document.getElementById('fpSearch'),base=document.getElementById('fpBase');let t;
    q.oninput=()=>{clearTimeout(t);t=setTimeout(()=>render({q:q.value,base:base.value,stage:filters.stage}),180)};
    base.onchange=()=>render({q:q.value,base:base.value,stage:filters.stage});
    document.querySelectorAll('[data-pcp-stage]').forEach(card=>card.onclick=()=>{
      const stage=card.dataset.pcpStage;
      render({q:filters.q,base:filters.base,stage:filters.stage===stage?'TODOS':stage});
    });
    document.querySelectorAll('[data-fpcp-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.fpcpOpen||b.dataset.fpcpNumber));
  }
  function pcpHistoryAt(o){
    const event=(o.events||[]).find(e=>/pcp liberado|pcp conclu|logística pré-liberada/i.test(String(e.text||e.type||'')));
    return Number(event?.at||o.expedition?.releaseDate&&Date.parse(o.expedition.releaseDate)||o.logistics?.deliveryConfirmedAt||o.commercial?.completedAt||o.createdAt||0);
  }
  function kpi(a,b,c){return '<div class="fpcp-kpi"><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></div>'}
  function kpiFilter(a,b,c,stage){return '<button class="fpcp-kpi fpcp-kpi-filter '+(filters.stage===stage?'selected':'')+'" data-pcp-stage="'+stage+'"><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></button>'}
  function table(rows){
    if(!rows.length)return '<div class="fpcp-empty">Nenhum pedido aguardando PCP para os filtros atuais.</div>';
    return '<table class="fpcp-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Valor</th><th>Base(s)</th><th>Status PCP</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const st=planningStatus(o);
      return '<tr><td><div class="fpcp-order">'+esc(o.number)+'</div></td><td><div class="fpcp-client">'+esc(o.client||'—')+'</div><div class="fpcp-muted">'+esc([o.city,o.uf].filter(Boolean).join('/'))+'</div></td><td>'+dbr(o.orderDate)+'</td><td>'+((o.items||[]).length)+'<div class="fpcp-muted">'+totalQty(o)+' cx</div></td><td>'+money(orderValue(o))+'</td><td>'+esc(basesOf(o).join(', ')||'—')+'</td><td><span class="fpcp-status '+st[1]+'">'+st[0]+'</span></td><td><button class="fpcp-open" data-fpcp-open="'+esc(o.id||o.number)+'" data-fpcp-number="'+esc(o.number||'')+'">'+(o.status==='PCP'?'Planejar':'Consultar')+'</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function historyTable(rows){
    if(!rows.length)return '<div class="fpcp-empty small">Nenhum pedido processado pelo PCP ainda.</div>';
    return '<table class="fpcp-table fpcp-history-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data pedido</th><th>Itens</th><th>Valor</th><th>Base(s)</th><th>Status atual</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const current=({ESTOQUE_PRODUCAO:'Operação em andamento',LOGISTICA:'Logística',ENTREGUE:'Concluído'})[o.status]||o.status||'—';
      return '<tr><td><div class="fpcp-order">'+esc(o.number||'')+'</div></td><td><div class="fpcp-client">'+esc(o.client||'—')+'</div></td><td>'+dbr(o.orderDate)+'</td><td>'+((o.items||[]).length)+'<div class="fpcp-muted">'+totalQty(o)+' cx</div></td><td>'+money(orderValue(o))+'</td><td>'+esc(basesOf(o).join(', ')||'—')+'</td><td><span class="fpcp-status done">'+esc(current)+'</span></td><td><button class="fpcp-open" data-fpcp-open="'+esc(o.id)+'">Consultar</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function renderConsolidated(){
    const ops=ensureOrderIds(load()),rows=consolidatedRows(ops),tot=consolidatedTotals(rows);
    const shortageProducts=rows.filter(r=>r.toRequest>0).length;
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><button class="fpcp-btn primary" id="fpcBack">← PCP</button><h1>Planejamento consolidado</h1><p>Demanda total dos pedidos em PCP cruzada com estoque e solicitações de produção</p></div></div>'+
      '<div class="fpcp-kpis">'+
        kpi('Demanda em PCP',tot.demand+' cx','todos os itens dos pedidos em aberto')+
        kpi('Já reservado',tot.reserved+' cx','estoque comprometido')+
        kpi('Necessidade produção',tot.productionNeed+' cx','após reserva, corte e estoque livre')+
        kpi('Produção solicitada',tot.requested+' cx','rascunhos + solicitações finalizadas')+
        kpi('Ainda solicitar',tot.toRequest+' cx',shortageProducts+' produto(s) pendente(s)')+
      '</div>'+
      '<div class="fpcp-guide"><b>Leitura:</b><span>Demanda = pedidos ainda no PCP</span><span>Estoque livre é considerado uma única vez por código</span><span>Produção solicitada evita duplicidade de solicitação</span><span>Prazo crítico = menor data relacionada aos pedidos</span></div>'+
      '<div class="fpcp-panel"><div class="fpcp-panel-head"><div><h2>Demanda consolidada por produto</h2><p>Prioridade automática pelo maior saldo ainda não solicitado para produção.</p></div></div>'+
      '<div class="fpcp-table-wrap">'+consolidatedTable(rows)+'</div></div>'+
      '<div class="fpcp-panel"><h2>Visão por base</h2>'+baseSummary(rows)+'</div>'+
      '</div>';
    document.getElementById('fpcBack').onclick=()=>render(filters);
    document.querySelectorAll('[data-fpc-prod]').forEach(b=>b.onclick=()=>createProductionFromRow(b.dataset.fpcProd,rows,ops));
    document.querySelectorAll('[data-fpc-orders]').forEach(b=>b.onclick=()=>showProductOrders(b.dataset.fpcOrders,ops));
  }
  function consolidatedTable(rows){
    if(!rows.length)return '<div class="fpcp-empty">Não há demanda aberta no PCP.</div>';
    return '<table class="fpcp-table fpcp-consolidated"><thead><tr><th>Produto</th><th>Pedidos</th><th>Demanda</th><th>Reservado</th><th>Corte</th><th>Estoque livre</th><th>Produção necessária</th><th>Já solicitada</th><th>A solicitar</th><th>Base(s)</th><th>Prazo crítico</th><th></th></tr></thead><tbody>'+
      rows.map(r=>'<tr>'+
        '<td><div class="fpcp-client">'+esc(r.name||'—')+'</div><div class="fpcp-muted">'+esc(r.code||r.productId||'')+'</div></td>'+
        '<td><button class="fpcp-open" data-fpc-orders="'+esc(r.key)+'">'+r.orderCount+'</button></td>'+
        '<td><b>'+r.demand+' cx</b></td>'+
        '<td>'+r.reserved+' cx</td><td>'+r.cut+' cx</td>'+
        '<td><span class="fpcp-stock '+(r.stockAvailable>0?'ok':'low')+'">'+r.stockAvailable+' cx</span></td>'+
        '<td><b>'+r.productionNeed+' cx</b></td>'+
        '<td>'+r.requestedProduction+' cx'+(r.productionRequests.length?'<div class="fpcp-muted">'+esc(r.productionRequests.join(', '))+'</div>':'')+'</td>'+
        '<td><span class="fpcp-status '+(r.toRequest>0?'attention':'ready')+'">'+r.toRequest+' cx</span></td>'+
        '<td>'+esc(r.bases.join(', ')||'A definir')+'</td>'+
        '<td>'+dbr(r.criticalDate)+'</td>'+
        '<td>'+(r.toRequest>0?'<button class="fpcp-btn primary" data-fpc-prod="'+esc(r.key)+'">Criar solicitação</button>':'<span class="fpcp-status ready">Coberto</span>')+'</td>'+
      '</tr>').join('')+'</tbody></table>';
  }
  function baseSummary(rows){
    const summary={};
    for(const r of rows){
      const targets=r.bases.length?r.bases:['A DEFINIR'];
      for(const b of targets){
        summary[b]=summary[b]||{demand:0,productionNeed:0,toRequest:0,products:0};
        summary[b].demand+=r.demand/targets.length;
        summary[b].productionNeed+=r.productionNeed/targets.length;
        summary[b].toRequest+=r.toRequest/targets.length;
        if(r.toRequest>0)summary[b].products++;
      }
    }
    const entries=Object.entries(summary);
    if(!entries.length)return '<div class="fpcp-empty">Nenhuma base associada à demanda.</div>';
    return '<div class="fpcp-base-grid">'+entries.map(([b,v])=>'<div class="fpcp-base-card"><span>'+esc(b)+'</span><strong>'+Math.round(v.demand)+' cx</strong><small>Produzir '+Math.round(v.productionNeed)+' · Solicitar '+Math.round(v.toRequest)+' · '+v.products+' produto(s) pendente(s)</small></div>').join('')+'</div>';
  }
  function createProductionFromRow(key,rows,ops){
    const r=rows.find(x=>String(x.key)===String(key));if(!r||r.toRequest<=0)return;
    const product=(window.FocadoProducts?.getCatalog?.(ops)||[]).find(p=>String(p.code||p.id||p.name)===String(r.code||r.productId||r.key));
    const base=r.bases.length===1?r.bases[0]:'SENIR';
    const seed={
      base,
      needByDate:r.criticalDate||'',
      notes:'Gerado pelo Planejamento Consolidado do PCP. Pedidos: '+[...r.orders].join(', '),
      items:[{product:product||{id:r.productId||r.key,code:r.code,name:r.name,brand:'',unit:'CX'},qty:r.toRequest,palletized:false,chapatex:false,boxesPerPallet:''}]
    };
    if(window.FocadoProduction?.createFromPlan){
      window.FocadoProduction.createFromPlan(seed);
    }else{
      alert('Módulo Produção não está pronto para receber o planejamento consolidado.');
    }
  }
  function showProductOrders(key,ops){
    const orders=(ops.orders||[]).filter(o=>o.status==='PCP'&&(o.items||[]).some(i=>productIdentity(i)===String(key)));
    const rows=orders.map(o=>{
      const its=(o.items||[]).filter(i=>productIdentity(i)===String(key));
      return '<tr><td>'+esc(o.number||'')+'</td><td>'+esc(o.client||'')+'</td><td>'+its.reduce((s,i)=>s+Number(i.qty||0),0)+' cx</td><td>'+its.reduce((s,i)=>s+Number(i.reservedQty||0),0)+' cx</td><td>'+esc(its.map(i=>i.deliveryBase).filter(Boolean).join(', ')||'—')+'</td><td>'+dbr(o.requestedDeliveryDate)+'</td><td><button class="fpcp-open" data-open-order="'+esc(o.id)+'">Abrir pedido</button></td></tr>';
    }).join('');
    content().innerHTML='<div class="fpcp-page"><div class="fpcp-head"><div><button class="fpcp-btn primary" id="fpoBack">← Consolidado</button><h1>Pedidos do produto</h1><p>Detalhamento da demanda consolidada</p></div></div><div class="fpcp-table-wrap"><table class="fpcp-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Quantidade</th><th>Reservado</th><th>Base</th><th>Entrega solicitada</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    document.getElementById('fpoBack').onclick=renderConsolidated;
    document.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
  }

  function openOrder(id){
    const ops=ensureOrderIds(load()),key=String(id||'');
    const o=(ops.orders||[]).find(x=>String(x.id||'')===key);
    if(!o){alert('Não foi possível abrir este pedido. A lista será atualizada.');render(filters);return}
    renderDetail(o,ops);
  }
  function renderDetail(o,ops){
    const editable=o.status==='PCP',st=planningStatus(o);
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><button class="fpcp-back" id="fpBack">← Fila PCP</button><h1>PCP · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+' · '+esc([o.city,o.uf].filter(Boolean).join('/'))+'</p></div><div class="fpcp-actions">'+
        (editable?'<button class="fpcp-btn secondary" id="fpSave">Salvar planejamento</button><button class="fpcp-btn primary" id="fpFinish">Liberar PCP → Logística</button>':'<span class="fpcp-status done">PCP concluído</span>')+
      '</div></div>'+
      '<div class="fpcp-flowline"><span class="done">Comercial ✓</span><i>→</i><span class="'+(editable?'active':'done')+'">PCP'+(editable?'':' ✓')+'</span><i>→</i><span class="'+(!editable?'active':'')+'">Logística</span><i>→</i><span>Entrega</span></div>'+
      '<div class="fpcp-commercial-readonly"><h2>Dados recebidos do Comercial</h2><div class="fpcp-read-grid">'+read('Cliente',o.client)+read('CNPJ',o.cnpj)+read('E-mail',o.email)+read('Representante',o.representative)+read('Data do pedido',dbr(o.orderDate))+read('Entrega solicitada',dbr(o.requestedDeliveryDate))+read('Frete',o.freightType)+read('Condição de pagamento',o.paymentTerms)+read('Local de entrega',o.deliveryAddress)+'</div></div>'+
      '<div class="fpcp-panel"><div class="fpcp-panel-head"><div><h2>Atendimento PCP dos itens</h2><p>O saldo disponível vem do estoque central do código: físico − reservado − bloqueado. Não é editável nesta tela.</p></div><div><span class="fpcp-status '+st[1]+'">'+st[0]+'</span>'+(o.pcp?.logisticsPreRelease?'<div class="fpcp-muted" style="margin-top:6px">Logística avisada com ressalva</div>':'')+'</div></div>'+
      '<div class="fpcp-item-table-wrap"><table class="fpcp-item-table"><thead><tr><th>Código</th><th>Produto</th><th>Pedido</th><th>Disponível agora</th><th>Reservar</th><th>Saldo faltante</th><th>Decisão</th><th>Previsão do saldo</th><th>Base retirada</th></tr></thead><tbody>'+
      (o.items||[]).map((i,n)=>itemRow(i,n,stockView(ops,i),editable)).join('')+
      '</tbody></table></div>'+
      '<div class="fpcp-help">Reserva total: informe toda a quantidade. Reserva parcial: informe somente o que existe agora e mantenha “Aguardar saldo” para o restante. Para liberar com corte, selecione “Liberar com corte”; o saldo não reservado será retirado deste pedido. A Base fica gravada por item para a Logística saber onde coletar.</div></div>'+
      '<div class="fpcp-panel"><h2>Observações do PCP</h2><textarea id="fpNotes" '+(editable?'':'disabled')+' placeholder="Observações gerais do planejamento">'+esc(o.pcp?.notes||'')+'</textarea></div>'+
      history(o)+'</div>';
    document.getElementById('fpBack').onclick=()=>render(filters);
    bindDynamicRows(o);
    if(editable){
      document.getElementById('fpSave').onclick=()=>savePlanning(o,false);
      updatePrimaryAction(o);
    }
  }
  function read(a,b){return '<div><span>'+a+'</span><b>'+esc(b||'—')+'</b></div>'}
  function itemRow(i,n,sv,editable){
    const qty=Number(i.qty||0),current=Number(i.reservedQty||0),maxReservable=current+sv.available;
    const cut=Number(i.cutQty||0),remain=Math.max(0,qty-current-cut);
    return '<tr data-pcp-item data-key="'+esc(i.id||i.code||i.productId||'')+'" data-qty="'+qty+'" data-max-reserve="'+maxReservable+'">'+
      '<td><b>'+esc(i.code||'—')+'</b></td><td>'+esc(i.name||'—')+'</td><td><b>'+qty+' cx</b></td>'+
      '<td><span class="fpcp-stock '+(sv.available<remain?'low':'ok')+'">'+sv.available+' cx</span><div class="fpcp-muted">físico '+sv.physical+' · já reservado '+sv.reserved+'</div></td>'+
      '<td><input data-reserve type="number" min="0" max="'+maxReservable+'" step="1" value="'+current+'" '+(editable?'':'disabled')+' style="width:90px"></td>'+
      '<td><b data-remaining>'+remain+' cx</b></td>'+
      '<td><select data-decision '+(editable?'':'disabled')+'><option value="AGUARDAR" '+(i.pcpBalanceDecision!=='CORTE'?'selected':'')+'>Aguardar saldo</option><option value="CORTE" '+(i.pcpBalanceDecision==='CORTE'?'selected':'')+'>Liberar com corte</option></select></td>'+
      '<td><input data-availability type="date" value="'+esc(i.pcpAvailabilityDate||'')+'" '+(editable?'':'disabled')+'></td>'+
      '<td><select data-base '+(editable?'':'disabled')+'><option value="">Selecione</option>'+['SENIR','GREENTECH','TOPLAND'].map(b=>'<option value="'+b+'" '+(i.deliveryBase===b?'selected':'')+'>'+b+'</option>').join('')+'</select></td>'+
      '</tr>';
  }
  function bindDynamicRows(o){
    document.querySelectorAll('[data-pcp-item]').forEach(r=>{
      const reserve=r.querySelector('[data-reserve]'),decision=r.querySelector('[data-decision]'),date=r.querySelector('[data-availability]'),out=r.querySelector('[data-remaining]');
      const update=()=>{
        const qty=Number(r.dataset.qty)||0,max=Number(r.dataset.maxReserve)||0;
        let rv=Math.max(0,Number(reserve.value)||0);if(rv>max){rv=max;reserve.value=String(max)}
        const remain=Math.max(0,qty-rv);
        out.textContent=decision.value==='CORTE'?'0 cx (corte '+remain+')':remain+' cx';
        date.disabled=decision.disabled||decision.value==='CORTE'||remain===0;
        if(date.disabled&&decision.value==='CORTE')date.value='';
      };
      const refresh=()=>{update();updatePrimaryAction(o)};
      reserve?.addEventListener('input',refresh);
      decision?.addEventListener('change',refresh);
      date?.addEventListener('change',()=>updatePrimaryAction(o));
      r.querySelector('[data-base]')?.addEventListener('change',()=>updatePrimaryAction(o));
      update();
    });
    updatePrimaryAction(o);
  }
  function currentPlanState(o){
    const changes=collectChanges();
    let waiting=false,unresolved=false,missingDate=false,missingBase=false;
    for(const incoming of changes.items){
      const item=(o.items||[]).find(i=>String(i.id||i.code||i.productId||'')===String(incoming.id));if(!item)continue;
      const qty=Number(item.qty||0),covered=Number(incoming.reservedQty||0)+Number(incoming.cutQty||0),missing=Math.max(0,qty-covered);
      if(!incoming.deliveryBase)missingBase=true;
      if(missing>0){
        unresolved=true;
        if(incoming.pcpBalanceDecision==='AGUARDAR'){
          waiting=true;
          if(!incoming.pcpAvailabilityDate)missingDate=true;
        }
      }
    }
    return {waiting,unresolved,missingDate,missingBase};
  }
  function latestWaitingDate(o,changes){
    const dates=[];
    for(const incoming of changes.items){
      const item=(o.items||[]).find(i=>String(i.id||i.code||i.productId||'')===String(incoming.id));if(!item)continue;
      const qty=Number(item.qty||0),covered=Number(incoming.reservedQty||0)+Number(incoming.cutQty||0),missing=Math.max(0,qty-covered);
      if(missing>0&&incoming.pcpBalanceDecision==='AGUARDAR'&&incoming.pcpAvailabilityDate)dates.push(incoming.pcpAvailabilityDate);
    }
    return dates.sort().slice(-1)[0]||'';
  }
  function updatePrimaryAction(o){
    const btn=document.getElementById('fpFinish');if(!btn)return;
    const st=currentPlanState(o);
    if(st.waiting && !st.missingDate && !st.missingBase){
      btn.textContent=o.pcp?.logisticsPreRelease?'Atualizar ressalva da Logística':'Enviar à Logística com ressalva';
      btn.onclick=()=>savePlanning(o,false,true);
      btn.dataset.mode='prelogistics';
      return;
    }
    btn.textContent='Liberar PCP → Logística';
    btn.onclick=()=>savePlanning(o,true,false);
    btn.dataset.mode='release';
  }
  function collectChanges(){
    return {
      pcp:{notes:document.getElementById('fpNotes').value.trim()},
      items:[...document.querySelectorAll('[data-pcp-item]')].map(r=>{
        const qty=Number(r.dataset.qty)||0,reservedQty=Math.max(0,Number(r.querySelector('[data-reserve]').value)||0);
        const decision=r.querySelector('[data-decision]').value;
        return {id:r.dataset.key,reservedQty,pcpBalanceDecision:decision,cutQty:decision==='CORTE'?Math.max(0,qty-reservedQty):0,pcpAvailabilityDate:r.querySelector('[data-availability]').value,deliveryBase:r.querySelector('[data-base]').value};
      })
    };
  }
  function validate(o,changes,finish){
    const errors=[];
    for(const incoming of changes.items){
      const item=(o.items||[]).find(i=>String(i.id||i.code||i.productId||'')===String(incoming.id));if(!item)continue;
      const qty=Number(item.qty||0),fulfilled=Number(incoming.reservedQty||0)+Number(incoming.cutQty||0),missing=Math.max(0,qty-fulfilled);
      if(!incoming.deliveryBase)errors.push('Defina a Base de retirada de '+(item.name||item.code)+'.');
      if(missing>0&&incoming.pcpBalanceDecision==='AGUARDAR'&&!incoming.pcpAvailabilityDate)errors.push('Informe quando haverá saldo disponível para '+(item.name||item.code)+'.');
      if(finish&&missing>0)errors.push((item.name||item.code)+' ainda possui '+missing+' cx pendente(s). Reserve o saldo ou libere com corte.');
    }
    return [...new Set(errors)];
  }
  async function savePlanning(o,finish,preReleaseLogistics=false){
    const ops=load(),changes=collectChanges(),errors=validate(o,changes,finish);
    if(preReleaseLogistics){
      const availability=latestWaitingDate(o,changes);
      changes.pcp.logisticsPreRelease=true;
      changes.pcp.logisticsAvailabilityDate=availability;
      changes.pcp.logisticsPreReleaseAt=Date.now();
    }
    if(errors.length){alert((finish?'Antes de liberar o PCP:':'Revise o planejamento:')+'\n\n• '+errors.join('\n• '));return}
    let result;
    if(window.FocadoDataStore?.isRemoteReady?.()){
      result=await window.FocadoDataStore.saveDomain('PCP',changes,o.id);
      if(!result?.ok){alert('Não foi possível salvar o planejamento. '+(result?.error||''));return}
      if(preReleaseLogistics){
        alert('Planejamento salvo. A Logística já pode iniciar a contratação de frete com a ressalva de disponibilidade em '+dbr(changes.pcp.logisticsAvailabilityDate)+'.');
      }
      if(finish){
        const tr=await window.FocadoDataStore.transitionOrder(o.id);
        if(!tr?.ok){alert('O PCP não pôde ser liberado: '+(tr?.code||tr?.error||'verifique os campos obrigatórios.'));return}
      }
      await window.FocadoDataStore.load();
    }else{
      const current=(ops.orders||[]).find(x=>String(x.id)===String(o.id));if(!current)return;
      ops.inventory=ops.inventory||{};ops.stockMovements=ops.stockMovements||[];
      changes.items.forEach(incoming=>{
        const item=(current.items||[]).find(i=>String(i.id||i.code||i.productId||'')===String(incoming.id));if(!item)return;
        const found=inventoryEntry(ops,item),key=found?.key||String(item.code||item.productId||item.name),inv=found?.inv||(ops.inventory[key]={code:item.code||'',name:item.name||'',unit:'CX',physical:0,reserved:0,blocked:0});
        const old=Number(item.reservedQty||0),desired=Number(incoming.reservedQty||0),free=Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0));
        if(desired>old+free){alert('O saldo de '+(item.name||item.code)+' mudou. Atualize o PCP e tente novamente.');return}
        const before=Number(inv.reserved||0);inv.reserved=Math.max(0,before-old+desired);
        if(desired!==old)ops.stockMovements.unshift({id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),at:Date.now(),kind:'finished',key,code:item.code||'',name:item.name||'',unit:'CX',type:desired>old?'RESERVA':'LIBERACAO_RESERVA',qty:Math.abs(desired-old),reason:'PCP · pedido '+current.number,user:window.FocadoAuth?.getUser?.()?.name||'PCP',before:{reserved:before},after:{reserved:inv.reserved}});
        Object.assign(item,incoming,{source:'ESTOQUE'});
      });
      current.pcp={...(current.pcp||{}),...changes.pcp};
      current.pcp.deliveryBase=basesOf(current).length===1?basesOf(current)[0]:'MÚLTIPLAS';
      current.events=current.events||[];current.events.unshift({at:Date.now(),text:finish?'PCP liberado com reservas confirmadas':(preReleaseLogistics?'Logística pré-liberada com ressalva de disponibilidade em '+dbr(changes.pcp.logisticsAvailabilityDate):'Planejamento PCP salvo'),user:window.FocadoAuth?.getUser?.()?.name||'PCP'});
      if(finish)current.status='LOGISTICA';
      await window.FocadoDataStore?.save?.(ops);
    }
    window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{source:'pcp'}}));
    if(finish)render({q:'',base:'TODAS'});else{const fresh=load(),updated=(fresh.orders||[]).find(x=>String(x.id)===String(o.id));if(updated)renderDetail(updated,fresh)}
  }
  function history(o){
    const events=(o.events||[]).slice(0,10);
    return '<div class="fpcp-panel"><h2>Histórico</h2>'+(events.length?'<div class="fpcp-history">'+events.map(e=>'<div><span>'+dbr(new Date(e.at).toISOString().slice(0,10))+'</span><p><b>'+esc(e.text||e.type||'Movimentação')+'</b><small>'+esc(e.user||'')+'</small></p></div>').join('')+'</div>':'<div class="fpcp-empty small">Nenhuma movimentação registrada.</div>')+'</div>';
  }
  window.FocadoPCP={render,openOrder};
})();