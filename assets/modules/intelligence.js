(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const I=()=>window.FocadoIntelligence;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>window.FocadoDS?.money?.(v)||Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>window.FocadoDS?.date?.(v)||v||'—';
  const tone=s=>({CRITICO:'danger',ALTO:'warn',MEDIO:'info',BAIXO:'ok'})[s]||'info';

  function bindRoutes(){
    document.querySelectorAll('[data-fi-route]').forEach(b=>b.onclick=()=>document.querySelector('[data-fx-nav="'+b.dataset.fiRoute+'"]')?.click());
  }

  function renderCockpit(){
    const ops=load(),ex=I().exceptions(ops),sug=I().suggestions(ops),orders=(ops.orders||[]).filter(o=>o.status!=='ENTREGUE').map(o=>({o,r:I().orderRisk(o)})).sort((a,b)=>b.r.score-a.r.score);
    const critical=ex.filter(x=>x.severity==='CRITICO').length,high=ex.filter(x=>x.severity==='ALTO').length;
    content().innerHTML='<div class="fds-page fiq-page">'+
      '<div class="fiq-head"><div><span class="fiq-eyebrow">CENTRAL DE DECISÃO</span><h1>Cockpit Operacional</h1><p>O Focado mostra primeiro o que exige decisão e explica o motivo.</p></div><button class="fds-btn" id="fiqRefresh">Atualizar análise</button></div>'+
      '<div class="fiq-hero '+(critical?'danger':high?'warn':'ok')+'"><div><span>AGORA</span><strong>'+(critical?critical+' situação(ões) crítica(s)':high?high+' ponto(s) de atenção alto':'Operação sem exceção crítica')+'</strong><small>'+(critical?'Trate primeiro os itens vermelhos abaixo.':high?'Há riscos que merecem ação antes de virarem atraso.':'Continue acompanhando as próximas decisões sugeridas.')+'</small></div></div>'+
      '<div class="fiq-grid">'+
        '<div class="fiq-panel fiq-span-2"><div class="fiq-panel-head"><div><h2>Exceções prioritárias</h2><p>Problemas e riscos ordenados por impacto operacional.</p></div><span>'+ex.length+' ocorrência(s)</span></div>'+exceptionList(ex)+'</div>'+
        '<div class="fiq-panel"><div class="fiq-panel-head"><div><h2>Próximas ações sugeridas</h2><p>Sempre acompanhadas de evidência.</p></div></div>'+suggestionList(sug.slice(0,6))+'</div>'+
      '</div>'+
      '<div class="fiq-panel"><div class="fiq-panel-head"><div><h2>Risco de atraso por pedido</h2><p>Score explicável de 0 a 100 baseado em prazo, transportadora, coleta, expedição e atendimento do PCP.</p></div></div>'+riskTable(orders.slice(0,12))+'</div>'+
      '</div>';
    document.getElementById('fiqRefresh').onclick=renderCockpit;bindRoutes();
  }
  function exceptionList(rows){
    if(!rows.length)return '<div class="fiq-empty">Nenhuma exceção operacional encontrada.</div>';
    return rows.slice(0,12).map(x=>'<div class="fiq-exception '+tone(x.severity)+'"><div class="fiq-severity">'+esc(x.severity)+'</div><div class="fiq-exception-body"><b>'+esc(x.title)+'</b><p>'+esc(x.why)+'</p><small>'+esc(x.evidence||'')+'</small></div><button data-fi-route="'+esc(x.route)+'">'+esc(x.action)+' →</button></div>').join('');
  }
  function suggestionList(rows){
    if(!rows.length)return '<div class="fiq-empty">Sem recomendação adicional neste momento.</div>';
    return rows.map(x=>'<div class="fiq-suggestion"><div><span>'+esc(x.area)+' · '+esc(x.confidence)+'</span><b>'+esc(x.title)+'</b><p>'+esc(x.why)+'</p><small>'+esc(x.evidence||'')+'</small></div><button data-fi-route="'+esc(x.route)+'">Abrir</button></div>').join('');
  }
  function riskTable(rows){
    if(!rows.length)return '<div class="fiq-empty">Nenhum pedido em aberto.</div>';
    return '<div class="fiq-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Etapa</th><th>Risco</th><th>Motivos</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><b>'+esc(x.o.number||x.o.id)+'</b></td><td>'+esc(x.o.client||'—')+'</td><td>'+esc(x.o.status||'—')+'</td><td><span class="fiq-risk '+tone(x.r.level)+'">'+x.r.score+' · '+x.r.level+'</span></td><td>'+esc(x.r.reasons.join(' · ')||'Sem fator crítico')+'</td></tr>').join('')+
      '</tbody></table></div>';
  }

  function renderMRP(){
    const ops=load(),rows=I().mrp(ops),materials=I().materialPlan(ops),bases=ops.productionBases||{};
    const gap=rows.reduce((s,x)=>s+x.gap,0),need=rows.reduce((s,x)=>s+x.productionNeed,0);
    content().innerHTML='<div class="fds-page fiq-page">'+
      '<div class="fiq-head"><div><span class="fiq-eyebrow">PCP · PLANEJAMENTO</span><h1>MRP leve & Capacidade</h1><p>Demanda líquida, necessidade de produção, materiais e capacidade sem transformar o Focado em um ERP pesado.</p></div><button class="fds-btn" data-fi-route="pcp">← Voltar ao PCP</button></div>'+
      '<div class="fiq-kpis">'+kpi('Necessidade de produção',need+' cx','demanda sem cobertura de estoque')+kpi('Ainda sem solicitação',gap+' cx','necessidade não coberta por produção aberta')+kpi('Produtos em risco',rows.filter(x=>x.risk==='CRITICO'||x.risk==='ALTO').length,'prioridade de planejamento')+kpi('Insumos com falta',materials.filter(x=>x.shortage>0).length,'nas solicitações finalizadas')+'</div>'+
      '<div class="fiq-grid">'+
        '<div class="fiq-panel fiq-span-2"><div class="fiq-panel-head"><div><h2>Plano por produto</h2><p>Ordenado por criticidade e saldo ainda descoberto.</p></div></div>'+mrpTable(rows)+'</div>'+
        '<div class="fiq-panel"><div class="fiq-panel-head"><div><h2>Capacidade por planta</h2><p>Referência diária configurada.</p></div></div>'+capacityView(bases,ops)+'</div>'+
      '</div>'+
      '<div class="fiq-panel"><div class="fiq-panel-head"><div><h2>Necessidade consolidada de materiais</h2><p>Baseada nas solicitações de produção finalizadas e suas análises de ficha técnica.</p></div></div>'+materialTable(materials)+'</div>'+
      '</div>';
    bindRoutes();
  }
  function mrpTable(rows){
    if(!rows.length)return '<div class="fiq-empty">Nenhuma demanda aberta para planejamento.</div>';
    return '<div class="fiq-table-wrap"><table><thead><tr><th>Produto</th><th>Pedidos</th><th>Demanda</th><th>Estoque livre</th><th>Produzir</th><th>Já solicitado</th><th>Gap</th><th>Prazo crítico</th><th>Base</th><th>Risco</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><b>'+esc(x.name||x.code)+'</b><small>'+esc(x.code)+'</small></td><td>'+x.orderCount+'</td><td>'+x.demand+' cx</td><td>'+x.available+' cx</td><td>'+x.productionNeed+' cx</td><td>'+x.productionRequested+' cx</td><td><b>'+x.gap+' cx</b></td><td>'+date(x.criticalDate)+'</td><td>'+esc(x.suggestedBase)+'</td><td><span class="fiq-risk '+tone(x.risk)+'">'+x.risk+'</span></td></tr>').join('')+
      '</tbody></table></div>';
  }
  function capacityView(bases,ops){
    const entries=Object.entries(bases);
    if(!entries.length)return '<div class="fiq-empty">Capacidades ainda não configuradas.</div>';
    return entries.map(([name,cfg])=>{
      const cap=Number(cfg.capacityPerDay||0);
      const committed=(ops.productionRequests||[]).filter(r=>r.status==='FINALIZADA'&&(r.snapshot||r).base===name).reduce((s,r)=>s+((r.snapshot||r).items||[]).reduce((a,i)=>a+Number(i.qty||0),0),0);
      const pct=cap?Math.round(committed/cap*100):0;
      return '<div class="fiq-cap"><div><b>'+esc(name)+'</b><span>'+committed+' / '+cap+' cx/dia</span></div><div class="fiq-bar"><i style="width:'+Math.min(100,pct)+'%"></i></div><small>'+pct+'% da capacidade diária de referência</small></div>';
    }).join('');
  }
  function materialTable(rows){
    if(!rows.length)return '<div class="fiq-empty">Nenhuma necessidade de material analisada.</div>';
    return '<div class="fiq-table-wrap"><table><thead><tr><th>Insumo</th><th>Necessidade</th><th>Falta</th><th>Solicitações</th><th>Status</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><b>'+esc(x.name)+'</b><small>'+esc(x.code)+'</small></td><td>'+x.required.toFixed(2)+' '+esc(x.unit)+'</td><td>'+x.shortage.toFixed(2)+' '+esc(x.unit)+'</td><td>'+x.requests+'</td><td><span class="fiq-risk '+(x.shortage>0?'warn':'ok')+'">'+(x.shortage>0?'COMPRAR':'OK')+'</span></td></tr>').join('')+'</tbody></table></div>';
  }

  function renderSuppliers(){
    const rows=I().supplierScores(load());
    content().innerHTML='<div class="fds-page fiq-page"><div class="fiq-head"><div><span class="fiq-eyebrow">COMPRAS · PERFORMANCE</span><h1>Score de Fornecedores</h1><p>Prazo e histórico real de recebimento. O score só aparece quando há dados suficientes.</p></div><button class="fds-btn" data-fi-route="purchases">← Compras</button></div>'+scoreCards(rows,'supplier')+scoreTable(rows,'supplier')+'</div>';bindRoutes();
  }
  function renderCarriers(){
    const rows=I().carrierScores(load());
    content().innerHTML='<div class="fds-page fiq-page"><div class="fiq-head"><div><span class="fiq-eyebrow">LOGÍSTICA · PERFORMANCE</span><h1>Score de Transportadoras</h1><p>Pontualidade, custo versus orçamento e lead time real.</p></div><button class="fds-btn" data-fi-route="logistica">← Logística</button></div>'+scoreCards(rows,'carrier')+scoreTable(rows,'carrier')+'</div>';bindRoutes();
  }
  function scoreCards(rows,type){
    const valid=rows.filter(x=>x.score!=null),best=valid[0],avg=valid.length?Math.round(valid.reduce((s,x)=>s+x.score,0)/valid.length):null;
    return '<div class="fiq-kpis">'+kpi(type==='supplier'?'Fornecedores medidos':'Transportadoras medidas',valid.length,'com histórico suficiente')+kpi('Score médio',avg==null?'—':avg+'/100','desempenho histórico')+kpi('Melhor desempenho',best?.name||'—',best?.score!=null?'score '+best.score+'/100':'aguardando histórico')+'</div>';
  }
  function scoreTable(rows,type){
    if(!rows.length)return '<div class="fiq-panel"><div class="fiq-empty">Ainda não há histórico suficiente.</div></div>';
    return '<div class="fiq-panel"><div class="fiq-table-wrap"><table><thead><tr><th>Nome</th><th>Operações</th><th>Concluídas</th><th>Pontualidade</th><th>'+(type==='supplier'?'Atraso médio':'Lead médio')+'</th><th>'+(type==='supplier'?'Preço médio':'Frete / orçamento')+'</th><th>Score</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+x.orders+'</td><td>'+(type==='supplier'?x.received:x.delivered)+'</td><td>'+(x.punctuality==null?'—':x.punctuality+'%')+'</td><td>'+(type==='supplier'?(x.avgDelay==null?'—':x.avgDelay.toFixed(1)+' d'):(x.avgLead==null?'—':x.avgLead.toFixed(1)+' d'))+'</td><td>'+(type==='supplier'?(x.avgPrice==null?'—':money(x.avgPrice)):(x.budgetRatio==null?'—':Math.round(x.budgetRatio*100)+'%'))+'</td><td><span class="fiq-score '+(x.score==null?'neutral':x.score>=85?'ok':x.score>=70?'info':'warn')+'">'+(x.score==null?'Formando base':x.score+'/100')+'</span></td></tr>').join('')+
      '</tbody></table></div></div>';
  }

  function renderAuditor(){
    const ops=load(),rows=I().auditorFindings(ops),types=['FALHA','RISCO','OPORTUNIDADE','INOVACAO'];
    content().innerHTML='<div class="fds-page fiq-page"><div class="fiq-head"><div><span class="fiq-eyebrow">CORPO AUDITOR</span><h1>Auditoria contínua do Focado</h1><p>Especialistas virtuais baseados em regras verificáveis do processo. Cada achado mostra evidência e proposta de ação.</p></div><button class="fds-btn" id="fiaRefresh">Rodar auditoria agora</button></div>'+
      '<div class="fiq-kpis">'+types.map(t=>kpi(t==='INOVACAO'?'Inovação':t.charAt(0)+t.slice(1).toLowerCase(),rows.filter(x=>x.type===t).length,'achado(s) nesta auditoria')).join('')+'</div>'+
      '<div class="fiq-auditor-grid">'+rows.map(a=>'<article class="fiq-audit-card '+tone(a.severity)+'"><div class="fiq-audit-top"><span>'+esc(a.type)+' · '+esc(a.specialist)+'</span><b>'+esc(a.severity)+'</b></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.why)+'</p><small><b>Evidência:</b> '+esc(a.evidence||'—')+'</small><div class="fiq-audit-action"><span>'+esc(a.proposal)+'</span><button data-fi-route="'+esc(a.route)+'">Abrir área →</button></div></article>').join('')+'</div></div>';
    document.getElementById('fiaRefresh').onclick=renderAuditor;bindRoutes();
  }

  function kpi(label,value,sub){return '<div class="fds-card fiq-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>'}

  window.FocadoIntelligenceUI={renderCockpit,renderMRP,renderSuppliers,renderCarriers,renderAuditor};
})();