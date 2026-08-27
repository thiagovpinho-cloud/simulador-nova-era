(function(){
  'use strict';
  const OPS_KEY='focado-operacoes-v2';
  const $=s=>document.querySelector(s);
  const shell=document.createElement('div');
  shell.id='focadoShell'; shell.className='hidden';

  const navGroups=[
    ['Principal',[['dashboard','⌂','Dashboard'],['kanban','▦','Kanban Operacional']]],
    ['Comercial',[['clientes','♙','Clientes'],['representantes','♣','Representantes'],['oportunidades','◎','Oportunidades','soon'],['pedidos','▤','Pedidos Comerciais']]],
    ['Operações',[['pcp','⌘','PCP'],['production','⚙','Produção'],['inventory','▣','Estoque'],['inputs','◇','Insumos']]],
    ['Logística',[['logistica','▰','Logística'],['entregas','✓','Entregas'],['transportadoras','⌁','Transportadoras','soon']]],
    ['Cadastros',[['produtos','◫','Produtos'],['fichas','▧','Fichas Técnicas'],['bases','▦','Bases Produtivas']]],
    ['Relatórios',[['relatorios','▥','Relatórios','soon'],['indicadores','◉','Indicadores','soon']]],
    ['Configurações',[['config','⚙','Configurações','soon'],['usuarios','♚','Usuários e Perfis','soon']]]
  ];

  function navHtml(){
    return navGroups.map(([label,items])=>{
      const visible=items.filter(([id])=>!window.FocadoAuth||window.FocadoAuth.can(id));
      if(!visible.length)return '';
      return '<div class="fx-menu-label">'+label+'</div>'+visible.map(([id,icon,text,flag])=>'<button class="fx-nav '+(id==='dashboard'?'active':'')+'" data-fx-nav="'+id+'"><span class="fx-nav-icon">'+icon+'</span><span>'+text+'</span>'+(flag?'<span class="fx-nav-soon">em breve</span>':'')+'</button>').join('');
    }).join('');
  }
  function refreshNav(){
    const menu=shell.querySelector('.fx-menu');
    if(!menu)return;
    menu.innerHTML=navHtml();
    bindNav();
  }
  shell.innerHTML='<aside class="fx-sidebar" id="fxSidebar"><div class="fx-brand"><img id="fxBrandLogo" src="" alt="Focado"></div><div class="fx-menu">'+navHtml()+'</div><div class="fx-version">Versão 1.0 · Novo Frontend</div></aside><main class="fx-main"><header class="fx-topbar"><button class="fx-menu-toggle" id="fxMenuToggle">☰</button><div class="fx-search"><span>⌕</span><input id="fxSearch" placeholder="Buscar pedidos, clientes, produtos, insumos..."></div><div class="fx-user"><div class="fx-avatar" id="fxAvatar">A</div><div class="fx-user-meta"><b id="fxUserName">Administrador</b><small id="fxUserRole">Administrador</small></div><button class="fx-logout" id="fxLogout">Sair</button></div></header><section class="fx-content" id="fxContent"></section></main>';
  document.body.appendChild(shell);

  function syncBrandLogo(){
    const target=document.getElementById('fxBrandLogo');
    if(target && !target.src.includes('focado-brand.svg')) target.src='focado-brand.svg?v=20260827c';
  }
  syncBrandLogo();
  window.addEventListener('load',syncBrandLogo);


  function loadOps(){try{return JSON.parse(localStorage.getItem(OPS_KEY)||'{}')||{}}catch(_){return {}}}
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function stageLabel(s){return ({COMERCIAL:'Comercial',PCP:'PCP',ESTOQUE_PRODUCAO:'Produção',LOGISTICA:'Logística',ENTREGUE:'Entrega'})[s]||s||'—'}
  function orderValue(o){return (o.items||[]).reduce((a,i)=>a+(Number(i.qty)||0)*(Number(i.price)||0),0)}
  function inputAvailable(inv){return Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0))}
  function reorderPoint(inv){const r=inv.reorder||{};return Math.max(0,(Number(r.avgDaily)||0)*(Number(r.leadTimeDays)||0)+(Number(r.safetyStock)||0))}

  function dashboard(){
    const ops=loadOps(),orders=ops.orders||[],inputs=ops.inputInventory||{},bases=ops.productionBases||{};
    const counts={COMERCIAL:0,PCP:0,ESTOQUE_PRODUCAO:0,LOGISTICA:0,ENTREGUE:0}; orders.forEach(o=>{if(counts[o.status]!==undefined)counts[o.status]++});
    const open=orders.filter(o=>o.status!=='ENTREGUE'),today=new Date().toISOString().slice(0,10);
    const deliveredToday=orders.filter(o=>o.status==='ENTREGUE'&&o.logistics?.deliveryDate===today).length;
    const late=orders.filter(o=>o.status!=='ENTREGUE'&&o.logistics?.deliveryDate&&o.logistics.deliveryDate<today).length;
    const alerts=Object.values(inputs).filter(inv=>{const rp=reorderPoint(inv);return rp>0&&inputAvailable(inv)<=rp});
    const recent=orders.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,6);
    const totalOpen=open.reduce((s,o)=>s+orderValue(o),0);
    const date=new Date().toLocaleDateString('pt-BR');

    const baseRows=Object.entries(bases).map(([name,cfg])=>{
      const cap=Number(cfg.capacityPerDay)||0;
      const committed=orders.filter(o=>o.status==='ESTOQUE_PRODUCAO'&&o.pcp?.deliveryBase===name).reduce((s,o)=>s+(Number(o.pcp?.scheduledQty)||0),0);
      const pct=cap?Math.min(100,Math.round(committed/cap*100)):0;
      return '<div class="fx-bar-row"><div class="fx-bar-meta"><b>'+name+'</b><span>'+pct+'% · '+committed+' / '+cap+' cx/dia</span></div><div class="fx-bar"><i style="width:'+pct+'%"></i></div></div>';
    }).join('')||'<div class="fx-empty">Capacidades ainda não configuradas.</div>';

    const alertRows=[];
    if(late) alertRows.push(['⚠',late+' pedido(s) com previsão vencida','Revisar programação e entrega']);
    if(alerts.length) alertRows.push(['◇',alerts.length+' insumo(s) abaixo do ponto de reposição','Revisar necessidade de compra']);
    const blocked=Object.values(inputs).filter(i=>Number(i.blocked||0)>0).length;
    if(blocked) alertRows.push(['!',blocked+' insumo(s) com saldo bloqueado','Materiais não disponíveis para produção']);
    if(!alertRows.length) alertRows.push(['✓','Nenhum alerta crítico no momento','Operação sem exceções registradas']);

    $('#fxContent').innerHTML=
      '<div class="fx-titlebar"><div><h1>Dashboard Executivo</h1><p>Visão consolidada da operação comercial e industrial</p></div><div class="fx-date">'+date+'</div></div>'+
      '<div class="fx-kpis">'+
        kpi('▤','Pedidos em aberto',open.length,money(totalOpen),'')+
        kpi('⌘','Em PCP',counts.PCP,'aguardando planejamento','purple')+
        kpi('⚙','Aguardando produção',counts.ESTOQUE_PRODUCAO,'em estoque/produção','warn')+
        kpi('▰','Liberados p/ logística',counts.LOGISTICA,'aguardando entrega','blue')+
        kpi('✓','Entregas hoje',deliveredToday,'registradas hoje','')+
        kpi('!','Atrasos',late,'atenção necessária','danger')+
      '</div>'+
      '<div class="fx-grid">'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Fluxo de Pedidos</h2><button class="fx-link" data-open="orders">Ver pedidos</button></div><div class="fx-flow">'+flow('Comercial',counts.COMERCIAL)+flow('PCP',counts.PCP)+flow('Produção',counts.ESTOQUE_PRODUCAO)+flow('Logística',counts.LOGISTICA)+flow('Entrega',counts.ENTREGUE)+'</div></div>'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Produção · Capacidade</h2><button class="fx-link" data-open="production">Ver programação</button></div>'+baseRows+'</div>'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Alertas Operacionais</h2></div>'+alertRows.map(a=>'<div class="fx-alert"><div class="fx-alert-icon">'+a[0]+'</div><div><b>'+a[1]+'</b><small>'+a[2]+'</small></div></div>').join('')+'</div>'+
      '</div>'+
      '<div class="fx-grid">'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Pedidos Recentes</h2><button class="fx-link" data-open="orders">Ver todos</button></div>'+recentTable(recent)+'</div>'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Estoque Crítico</h2><button class="fx-link" data-open="purchases">Ver reposição</button></div>'+criticalStock(alerts)+'</div>'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Resumo da Carteira</h2></div><div class="fx-kpi" style="border:0;padding:6px 0"><span>Pedidos abertos</span><strong>'+money(totalOpen)+'</strong><small>'+open.length+' pedido(s) em andamento</small></div><div class="fx-alert"><div class="fx-alert-icon">✓</div><div><b>'+counts.ENTREGUE+' pedido(s) concluído(s)</b><small>Histórico operacional registrado</small></div></div></div>'+
      '</div><div class="fx-footer"><span>Focado © 2026 · Ambiente operacional</span><span>Arquitetura modular · Dashboard v1</span></div>';
    bindDashboardLinks();
  }
  function kpi(icon,label,value,sub,cls){return '<div class="fx-kpi '+(cls||'')+'"><div class="fx-kpi-top"><span>'+label+'</span><div class="fx-kpi-icon">'+icon+'</div></div><strong>'+value+'</strong><small>'+sub+'</small></div>'}
  function flow(label,n){return '<div class="fx-flow-step '+(n?'active':'')+'"><b>'+n+'</b><span>'+label+'</span></div>'}
  function recentTable(rows){
    if(!rows.length)return '<div class="fx-empty">Nenhum pedido operacional registrado ainda.</div>';
    return '<table class="fx-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Etapa</th></tr></thead><tbody>'+rows.map(o=>'<tr><td>'+esc(o.number)+'</td><td>'+esc(o.client)+'</td><td>'+money(orderValue(o))+'</td><td><span class="fx-status">'+esc(stageLabel(o.status))+'</span></td></tr>').join('')+'</tbody></table>'
  }
  function criticalStock(rows){
    if(!rows.length)return '<div class="fx-empty">Nenhum insumo configurado abaixo do ponto de reposição.</div>';
    return rows.slice(0,5).map(inv=>'<div class="fx-alert"><div class="fx-alert-icon">◇</div><div><b>'+esc(inv.name||inv.code)+'</b><small>Disponível '+inputAvailable(inv).toFixed(2)+' '+esc(inv.unit||'')+' · Ponto '+reorderPoint(inv).toFixed(2)+'</small></div></div>').join('')
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function showShell(){
    if(!sessionStorage.getItem('nova-era-role'))return;
    syncBrandLogo();
    const hub=$('#hubScreen'); if(hub)hub.classList.add('hidden');
    shell.classList.remove('hidden');
    const user=window.FocadoAuth?.getUser?.();
    const label=user?.name||sessionStorage.getItem('nova-era-role-label')||'Usuário';
    const role=user?.role||window.FocadoAuth?.getRole?.()||sessionStorage.getItem('nova-era-role')||'usuário';
    refreshNav();
    $('#fxUserName').textContent=label;
    $('#fxUserRole').textContent=window.FocadoAuth?.roleLabel?.(role)||role;
    $('#fxAvatar').textContent=label.charAt(0).toUpperCase();
    dashboard(); setActive('dashboard');
  }
  function hideShell(){shell.classList.add('hidden')}
  function setActive(id){document.querySelectorAll('[data-fx-nav]').forEach(b=>b.classList.toggle('active',b.dataset.fxNav===id))}
  function clickLegacy(id){hideShell();const b=document.getElementById(id);if(b)b.click()}
  function openOps(view){
    hideShell();
    const btn=document.getElementById('hubGoOperacoes');
    if(!btn){showShell();return}
    btn.click();
    if(view&&view!=='orders')setTimeout(()=>{const t=document.querySelector('#opsBody [data-view="'+view+'"]');if(t)t.click()},0);
  }
  function navigate(id){
    if(window.FocadoAuth && !window.FocadoAuth.can(id)){
      alert('Seu perfil não possui acesso a esta área.');
      return;
    }
    setActive(id);
    if(id==='dashboard'){showShell();return}
    if(id==='kanban'){showShell(); if(window.FocadoKanban) window.FocadoKanban.render({q:'',brand:'TODAS'}); return}
    if(id==='clientes')return clickLegacy('hubGoCadastro');
    if(id==='representantes'){showShell(); if(window.FocadoRepresentatives) window.FocadoRepresentatives.render(); return}
    if(id==='pedidos'){showShell(); if(window.FocadoOrders) window.FocadoOrders.render(); return}
    if(id==='fichas')return clickLegacy('hubGoFichas');
    if(id==='produtos'){showShell(); if(window.FocadoProducts) window.FocadoProducts.render(); return}
    if(id==='pcp'){showShell(); if(window.FocadoPCP) window.FocadoPCP.render(); return}
    if(id==='production'){showShell(); if(window.FocadoProduction) window.FocadoProduction.render(); return}
    if(id==='bases')return openOps('production');
    if(id==='inventory'){showShell(); if(window.FocadoInventory) window.FocadoInventory.render({tab:'finished',q:'',filter:'TODOS'}); return}
    if(id==='inputs'){showShell(); if(window.FocadoInventory) window.FocadoInventory.render({tab:'inputs',q:'',filter:'TODOS'}); return}
    if(id==='logistica'||id==='entregas'){showShell(); if(window.FocadoLogistics) window.FocadoLogistics.render({q:'',status:id==='entregas'?'Entregue':'TODOS'}); return}
  }
  function bindDashboardLinks(){document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>navigate(b.dataset.open))}
  function bindNav(){document.querySelectorAll('[data-fx-nav]').forEach(b=>b.onclick=()=>{if(!b.querySelector('.fx-nav-soon'))navigate(b.dataset.fxNav)})}
  bindNav();
  $('#fxMenuToggle').onclick=()=>$('#fxSidebar').classList.toggle('open');
  $('#fxLogout').onclick=async()=>{hideShell();try{await window.FocadoAuth?.logout?.()}catch(_){} document.getElementById('hubLogoutBtn')?.click()};
  $('#fxSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){const q=e.target.value.trim();if(q)navigate('pedidos')}});

  window.addEventListener('focado:auth-changed',()=>{if(!shell.classList.contains('hidden'))showShell()});
  const observer=new MutationObserver(()=>{
    const hub=$('#hubScreen');
    if(hub&&!hub.classList.contains('hidden')&&sessionStorage.getItem('nova-era-role'))showShell();
  });
  const hub=$('#hubScreen'); if(hub)observer.observe(hub,{attributes:true,attributeFilter:['class']});
  window.addEventListener('load',()=>{setTimeout(()=>{if(sessionStorage.getItem('nova-era-role')&&$('#hubScreen')&&!$('#hubScreen').classList.contains('hidden'))showShell()},50)});
  window.FocadoShell={show:showShell,refresh:dashboard,navigate};
})();