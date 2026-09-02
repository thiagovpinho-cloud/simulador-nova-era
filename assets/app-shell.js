(function(){
  'use strict';
  const OPS_KEY='focado-operacoes-v2';
  const $=s=>document.querySelector(s);
  const shell=document.createElement('div');
  shell.id='focadoShell'; shell.className='hidden';

  const navGroups=[
    ['Principal',[['dashboard','⌂','Dashboard'],['pendencias','⚡','Central de Pendências'],['cockpit','◉','Cockpit Executivo'],['kanban','▦','Kanban Operacional']]],
    ['Comercial',[['clientes','♙','Clientes'],['representantes','♣','Representantes'],['pedidos','▤','Pedidos Comerciais'],['simulador','∑','Simulador']]],
    ['Operações',[['pcp','⌘','PCP'],['production','⚙','Produção'],['inventory','▣','Estoque'],['inputs','◇','Insumos'],['purchases','↻','Compras'],['expedicao','⇱','Expedição']]],
    ['Logística',[['logistica','▰','Logística'],['entregas','✓','Entregas'],['transportadoras','⌁','Transportadoras']]],
    ['Cadastros',[['produtos','◫','Produtos'],['fichas','▧','Fichas Técnicas'],['bases','▦','Bases Produtivas']]],
    ['Financeiro',[['financeiro','₿','Faturamento e Margem']]],
    ['Relatórios',[['relatorios','▥','Relatórios','soon'],['indicadores','◉','Indicadores'],['bi-config','⚙','Parâmetros BI']]],
    ['Configurações',[['corpo-auditor','◇','Corpo Auditor'],['system-health','◎','Saúde & Auditoria'],['regras-margem','%','Regras de Margem'],['config','⚙','Configurações'],['usuarios','♚','Usuários e Perfis']]]
  ];

  function navHtml(){
    return navGroups.map(([label,items])=>{
      const visible=items.filter(([id])=>!window.FocadoAuth||window.FocadoAuth.can(id));
      if(!visible.length)return '';
      return '<div class="fx-menu-label">'+label+'</div>'+visible.map(([id,icon,text,flag])=>'<button class="fx-nav '+(id==='dashboard'?'active':'')+'" data-fx-nav="'+id+'"><span class="fx-nav-icon">'+icon+'</span><span>'+text+'</span>'+(flag?'<span class="fx-nav-soon">em breve</span>':'')+'</button>').join('');
    }).join('');
  }
  const mobilePrimaryByRole={
    ADMIN:['cockpit','Gestão','◉'],
    DIRETOR:['cockpit','Gestão','◉'],
    GESTOR:['cockpit','Gestão','◉'],
    COMERCIAL:['pedidos','Pedidos','▤'],
    PCP:['pcp','PCP','⌘'],
    PRODUCAO:['production','Produção','⚙'],
    ESTOQUE:['inventory','Estoque','▣'],
    LOGISTICA:['logistica','Logística','▰'],
    COMPRAS:['purchases','Compras','↻'],
    FINANCEIRO:['financeiro','Financeiro','₿']
  };
  function mobileNavHtml(){
    const role=String(window.FocadoAuth?.getRole?.()||'COMERCIAL').toUpperCase();
    const primary=mobilePrimaryByRole[role]||mobilePrimaryByRole.COMERCIAL;
    return [
      ['dashboard','⌂','Início'],
      ['pendencias','⚡','Pendências'],
      [primary[0],primary[2],primary[1]],
      ['__more__','☰','Mais']
    ].map(([id,icon,label])=>'<button class="fx-mobile-nav-btn '+(id==='dashboard'?'active':'')+'" data-mobile-route="'+id+'"><span>'+icon+'</span><b>'+label+'</b></button>').join('');
  }
  function refreshMobileNav(){
    const nav=shell.querySelector('.fx-mobile-nav');
    if(!nav)return;
    nav.innerHTML=mobileNavHtml();
    bindMobileNav();
  }
  function refreshNav(){
    const menu=shell.querySelector('.fx-menu');
    if(!menu)return;
    menu.innerHTML=navHtml();
    bindNav();
    refreshMobileNav();
  }
  shell.innerHTML='<div class="fx-mobile-backdrop" id="fxMobileBackdrop" aria-hidden="true"></div><aside class="fx-sidebar" id="fxSidebar"><div class="fx-brand"><img id="fxBrandLogo" src="" alt="Focado"></div><div class="fx-menu">'+navHtml()+'</div><div class="fx-version">Versão 1.0 · Novo Frontend</div></aside><main class="fx-main"><header class="fx-topbar"><button class="fx-menu-toggle" id="fxMenuToggle" aria-label="Abrir menu">☰</button><div class="fx-mobile-title"><b>FOCADO</b><small id="fxMobileRole">Operação</small></div><div class="fx-search"><span>⌕</span><input id="fxSearch" placeholder="Buscar pedidos, clientes, produtos, insumos..."></div><div class="fx-user"><div class="fx-avatar" id="fxAvatar">A</div><div class="fx-user-meta"><b id="fxUserName">Administrador</b><small id="fxUserRole">Administrador</small></div><button class="fx-logout" id="fxLogout">Sair</button></div></header><section class="fx-content" id="fxContent"></section><nav class="fx-mobile-nav" aria-label="Navegação principal mobile">'+mobileNavHtml()+'</nav></main>';
  document.body.appendChild(shell);

  function syncBrandLogo(){
    const target=document.getElementById('fxBrandLogo');
    if(target && !target.src.includes('focado-brand.svg')) target.src='focado-brand.svg?v=20260827c';
  }
  syncBrandLogo();
  window.addEventListener('load',syncBrandLogo);


  function loadOps(){try{return JSON.parse(localStorage.getItem(OPS_KEY)||'{}')||{}}catch(_){return {}}}
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function stageLabel(s){return ({COMERCIAL:'Comercial',PCP:'PCP',LOGISTICA:'Logística',ENTREGUE:'Entrega'})[s]||s||'—'}
  function orderValue(o){return (o.items||[]).reduce((a,i)=>a+(Number(i.qty)||0)*(Number(i.price)||0),0)}
  function inputAvailable(inv){return Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0))}
  function reorderPoint(inv){const r=inv.reorder||{};return Math.max(0,(Number(r.avgDaily)||0)*(Number(r.leadTimeDays)||0)+(Number(r.safetyStock)||0))}

  const workflowAreasForRole=role=>({
    ADMIN:['COMERCIAL','PCP','PRODUCAO','ESTOQUE','COMPRAS','EXPEDICAO','LOGISTICA','FINANCEIRO'],
    DIRETOR:['COMERCIAL','PCP','PRODUCAO','ESTOQUE','COMPRAS','EXPEDICAO','LOGISTICA','FINANCEIRO'],
    GESTOR:['COMERCIAL','PCP','PRODUCAO','ESTOQUE','COMPRAS','EXPEDICAO','LOGISTICA','FINANCEIRO'],
    COMERCIAL:['COMERCIAL'],PCP:['PCP'],PRODUCAO:['PRODUCAO'],ESTOQUE:['ESTOQUE','EXPEDICAO'],
    COMPRAS:['COMPRAS'],LOGISTICA:['LOGISTICA'],FINANCEIRO:['FINANCEIRO']
  })[String(role||'').toUpperCase()]||[];

  async function refreshWorkflowCommand(){
    const box=document.getElementById('fxOperationalCommand');
    if(!box||!window.FocadoDataStore?.isRemoteReady?.())return;
    try{
      const base=String(window.FocadoDataStore.getConfig().apiBaseUrl||'').replace(/\/$/,'');
      const token=window.FocadoDataStore.getSessionToken();
      const res=await fetch(base+'/api/workflow',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!res.ok)return;
      const data=await res.json();
      const queue=Array.isArray(data.workQueue)?data.workQueue:[];
      const role=window.FocadoAuth?.getRole?.()||'';
      const title=box.querySelector('h2'),textEl=box.querySelector('p'),btn=box.querySelector('[data-open]');
      if(!title||!textEl||!btn)return;
      const ops=loadOps(),orders=ops.orders||[];
      const quoteRequested=orders.filter(o=>['SOLICITADA','EM_COTACAO'].includes(o.freightQuote?.status));
      const quoteAnswered=orders.filter(o=>o.freightQuote?.status==='RESPONDIDA'&&!o.freightQuote?.commercialViewedAt);
      const roleKey=String(role).toUpperCase();
      if(roleKey==='LOGISTICA'&&quoteRequested.length){
        box.className='fx-command warn';
        box.querySelector('.fx-command-eyebrow').textContent='NOVA SOLICITAÇÃO DO COMERCIAL';
        title.textContent=quoteRequested.length+' cotação(ões) de frete aguardando Logística';
        const q=quoteRequested[0];
        textEl.textContent=(q.number||q.id)+' · '+(q.client||'Cliente')+' · '+(q.city||'destino a confirmar');
        btn.dataset.open='logistica';btn.textContent='Fazer cotação →';
        return;
      }
      if(roleKey==='COMERCIAL'&&quoteAnswered.length){
        box.className='fx-command info';
        box.querySelector('.fx-command-eyebrow').textContent='COTAÇÃO DE FRETE RECEBIDA';
        title.textContent=quoteAnswered.length+' cotação(ões) respondida(s) pela Logística';
        const q=quoteAnswered[0],best=(q.freightQuote?.quotes||[]).slice().sort((a,b)=>Number(a.value||0)-Number(b.value||0))[0];
        textEl.textContent=(q.number||q.id)+' · '+(best?best.provider+' · '+money(best.value):'Valores disponíveis para consulta');
        btn.dataset.open='pedidos';btn.textContent='Ver cotações →';
        return;
      }
      const areas=workflowAreasForRole(role);
      const mine=areas.length?queue.filter(x=>areas.includes(String(x.area||'').toUpperCase())):queue;
      const rows=String(role).toUpperCase()==='ADMIN'?queue:mine;
      if(!rows.length){
        box.className='fx-command ok';
        box.querySelector('.fx-command-eyebrow').textContent='OPERAÇÃO SOB CONTROLE';
        title.textContent='Nenhuma ação pendente para você agora';
        textEl.textContent='O workflow integrado não identificou nenhuma próxima ação na sua responsabilidade.';
        btn.dataset.open='pendencias';btn.textContent='Ver Central →';
        return;
      }
      const first=rows[0];
      box.className='fx-command '+(rows.length>=5?'warn':'info');
      box.querySelector('.fx-command-eyebrow').textContent='SEU TRABALHO AGORA';
      title.textContent=rows.length+' ação(ões) aguardando sua atenção';
      textEl.textContent=(first.number||first.orderId)+' · '+String(first.reason||'Próxima ação operacional identificada.');
      btn.dataset.open='pendencias';btn.textContent='Resolver na Central →';
    }catch(err){
      console.warn('[FocadoShell] resumo do workflow indisponível',err);
    }
  }

  function dashboard(){
    const ops=loadOps(),orders=ops.orders||[],inputs=ops.inputInventory||{},bases=ops.productionBases||{};
    const counts={COMERCIAL:0,PCP:0,LOGISTICA:0,ENTREGUE:0}; orders.forEach(o=>{if(counts[o.status]!==undefined)counts[o.status]++});
    const open=orders.filter(o=>o.status!=='ENTREGUE'),today=new Date().toISOString().slice(0,10);
    const deliveredToday=orders.filter(o=>o.status==='ENTREGUE'&&(o.logistics?.actualDeliveryDate||o.logistics?.deliveryDate)===today).length;
    const late=orders.filter(o=>o.status!=='ENTREGUE'&&o.logistics?.deliveryDate&&o.logistics.deliveryDate<today).length;
    const alerts=Object.values(inputs).filter(inv=>{const rp=reorderPoint(inv);return rp>0&&inputAvailable(inv)<=rp});
    const recent=orders.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,6);
    const totalOpen=open.reduce((s,o)=>s+orderValue(o),0);
    const date=new Date().toLocaleDateString('pt-BR');

    const baseRows=Object.entries(bases).map(([name,cfg])=>{
      const cap=Number(cfg.capacityPerDay)||0;
      const committed=(ops.productionRequests||[]).filter(r=>r.status==='FINALIZADA'&&r.base===name).reduce((s,r)=>s+(r.items||[]).reduce((a,i)=>a+(Number(i.qty)||0),0),0);
      const pct=cap?Math.min(100,Math.round(committed/cap*100)):0;
      return '<div class="fx-bar-row"><div class="fx-bar-meta"><b>'+name+'</b><span>'+pct+'% · '+committed+' / '+cap+' cx/dia</span></div><div class="fx-bar"><i style="width:'+pct+'%"></i></div></div>';
    }).join('')||'<div class="fx-empty">Capacidades ainda não configuradas.</div>';

    const alertRows=[];
    if(late) alertRows.push(['⚠',late+' pedido(s) com previsão vencida','Revisar programação e entrega']);
    if(alerts.length) alertRows.push(['◇',alerts.length+' insumo(s) abaixo do ponto de reposição','Revisar necessidade de compra']);
    const blocked=Object.values(inputs).filter(i=>Number(i.blocked||0)>0).length;
    if(blocked) alertRows.push(['!',blocked+' insumo(s) com saldo bloqueado','Materiais não disponíveis para produção']);
    if(!alertRows.length) alertRows.push(['✓','Nenhum alerta crítico no momento','Operação sem exceções registradas']);
    const priority=late
      ? {tone:'danger',eyebrow:'PRIORIDADE AGORA',title:late+' pedido(s) fora da previsão',text:'Acesse Logística e trate primeiro as entregas vencidas.',route:'logistica',action:'Revisar atrasos'}
      : alerts.length
        ? {tone:'warn',eyebrow:'ATENÇÃO OPERACIONAL',title:alerts.length+' insumo(s) em nível crítico',text:'Revise necessidade de compra antes que a produção seja impactada.',route:'purchases',action:'Abrir Compras'}
        : counts.PCP
          ? {tone:'info',eyebrow:'PRÓXIMA DECISÃO',title:counts.PCP+' pedido(s) aguardando PCP',text:'Priorize os pedidos mais próximos da data solicitada de entrega.',route:'pcp',action:'Abrir PCP'}
          : {tone:'ok',eyebrow:'OPERAÇÃO SOB CONTROLE',title:'Nenhuma exceção crítica neste momento',text:'O fluxo operacional está sem alertas prioritários registrados.',route:'pedidos',action:'Ver carteira'};

    $('#fxContent').innerHTML=
      '<div class="fx-titlebar fx-titlebar-premium"><div><span class="fx-eyebrow">FOCADO · OPERAÇÃO</span><h1>Bom trabalho. Aqui está o que importa hoje.</h1><p>Decisões, exceções e andamento da operação em uma única visão.</p></div><div class="fx-date">'+date+'</div></div>'+
      '<div class="fx-command '+priority.tone+'" id="fxOperationalCommand"><div><span class="fx-command-eyebrow">'+priority.eyebrow+'</span><h2>'+priority.title+'</h2><p>'+priority.text+'</p></div><button class="fx-command-action" data-open="'+priority.route+'">'+priority.action+' →</button></div>'+
      '<div class="fx-kpis fx-kpis-premium">'+
        kpi('▤','Pedidos em aberto',open.length,money(totalOpen),'')+
        kpi('⌘','Status macro PCP',counts.PCP,'andamento real no contexto operacional','purple')+
        kpi('▰','Na logística',counts.LOGISTICA,'em programação / entrega','blue')+
        kpi('!','Atrasos',late,late?'atenção imediata':'nenhum vencido','danger')+
      '</div>'+
      '<div class="fx-grid">'+
        '<div class="fx-panel fx-mobile-secondary"><div class="fx-panel-head"><h2>Status macro dos pedidos</h2><button class="fx-link" data-open="orders">Ver pedidos</button></div><div class="fx-flow">'+flow('Comercial',counts.COMERCIAL)+flow('PCP',counts.PCP)+flow('Logística',counts.LOGISTICA)+flow('Entrega',counts.ENTREGUE)+'</div></div>'+
        '<div class="fx-panel fx-mobile-secondary"><div class="fx-panel-head"><h2>Produção · Capacidade</h2><button class="fx-link" data-open="production">Ver programação</button></div>'+baseRows+'</div>'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Alertas Operacionais</h2></div>'+alertRows.map(a=>'<div class="fx-alert"><div class="fx-alert-icon">'+a[0]+'</div><div><b>'+a[1]+'</b><small>'+a[2]+'</small></div></div>').join('')+'</div>'+
      '</div>'+
      '<div class="fx-grid">'+
        '<div class="fx-panel"><div class="fx-panel-head"><h2>Pedidos Recentes</h2><button class="fx-link" data-open="orders">Ver todos</button></div>'+recentTable(recent)+'</div>'+
        '<div class="fx-panel fx-mobile-secondary"><div class="fx-panel-head"><h2>Estoque Crítico</h2><button class="fx-link" data-open="purchases">Ver reposição</button></div>'+criticalStock(alerts)+'</div>'+
        '<div class="fx-panel fx-mobile-secondary"><div class="fx-panel-head"><h2>Resumo da Carteira</h2></div><div class="fx-kpi" style="border:0;padding:6px 0"><span>Pedidos abertos</span><strong>'+money(totalOpen)+'</strong><small>'+open.length+' pedido(s) em andamento</small></div><div class="fx-alert"><div class="fx-alert-icon">✓</div><div><b>'+counts.ENTREGUE+' pedido(s) concluído(s)</b><small>Histórico operacional registrado</small></div></div></div>'+
      '</div><div class="fx-footer"><span>Focado © 2026 · Ambiente operacional</span><span>Arquitetura modular · Product UI 2.0</span></div>';
    bindDashboardLinks();
    refreshWorkflowCommand().then(bindDashboardLinks);
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

  const operationalContext={
    pedidos:{label:'Comercial',area:'COMERCIAL',purpose:'Transformar a necessidade do cliente em um pedido completo e liberável.'},
    pcp:{label:'PCP',area:'PCP',purpose:'Garantir cobertura, data e liberação correta do pedido.'},
    production:{label:'Produção',area:'PRODUCAO',purpose:'Concluir o que falta produzir para atender pedidos liberados.'},
    inventory:{label:'Estoque',area:'ESTOQUE',purpose:'Manter saldo físico confiável e disponível para reserva e expedição.'},
    inputs:{label:'Insumos',area:'ESTOQUE',purpose:'Garantir disponibilidade dos materiais necessários à produção.'},
    purchases:{label:'Compras',area:'COMPRAS',purpose:'Eliminar faltas de insumo e acompanhar recebimentos vinculados.'},
    expedicao:{label:'Expedição',area:'EXPEDICAO',purpose:'Separar e liberar fisicamente pedidos já cobertos.'},
    logistica:{label:'Logística',area:'LOGISTICA',purpose:'Definir transporte, coleta e concluir a entrega.'},
    entregas:{label:'Entregas',area:'LOGISTICA',purpose:'Acompanhar o compromisso com o cliente até a confirmação final.'},
    transportadoras:{label:'Transportadoras',area:'LOGISTICA',purpose:'Manter os recursos logísticos prontos para execução.'},
    financeiro:{label:'Financeiro',area:'FINANCEIRO',purpose:'Fechar o ciclo econômico dos pedidos já entregues.'}
  };

  async function workflowSnapshot(){
    if(!window.FocadoDataStore?.isRemoteReady?.())return null;
    const base=String(window.FocadoDataStore.getConfig().apiBaseUrl||'').replace(/\/$/,'');
    const token=window.FocadoDataStore.getSessionToken();
    const res=await fetch(base+'/api/workflow',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!res.ok)return null;
    return res.json();
  }

  async function enhanceOperationalContext(id){
    const cfg=operationalContext[id];
    const host=document.getElementById('fxContent');
    if(!cfg||!host)return;
    host.querySelector('.fx-journey-context')?.remove();

    let rows=[];
    try{
      const data=await workflowSnapshot();
      rows=(data?.workQueue||[]).filter(x=>String(x.area||'').toUpperCase()===cfg.area);
    }catch(err){
      console.warn('[FocadoShell] contexto operacional indisponível',err);
    }

    const first=rows[0];
    const context=document.createElement('section');
    context.className='fx-journey-context '+(rows.length?'attention':'clear');
    context.setAttribute('aria-label','Contexto operacional da área');
    context.innerHTML=
      '<div class="fx-journey-main">'+
        '<span class="fx-journey-eyebrow">ETAPA ATUAL · '+esc(cfg.label)+'</span>'+
        '<strong>'+(rows.length?rows.length+' ação(ões) aguardando esta área':'Nenhuma ação crítica aguardando esta área')+'</strong>'+
        '<p>'+(first?esc((first.number||first.orderId)+' · '+(first.reason||'Próxima ação identificada pelo workflow.')):esc(cfg.purpose))+'</p>'+
      '</div>'+
      '<div class="fx-journey-meta">'+
        '<div><span>Responsável</span><b>'+esc(cfg.label)+'</b></div>'+
        '<div><span>Próximo passo</span><b>'+(first?esc(String(first.action||'').replace(/_/g,' ')):'Sem pendência crítica')+'</b></div>'+
        '<button class="fx-journey-action" type="button">Ver Central de Pendências →</button>'+
      '</div>';
    context.querySelector('.fx-journey-action').onclick=()=>navigate('pendencias');
    host.prepend(context);
  }

  function showShell(openDashboard=true){
    if(!sessionStorage.getItem('nova-era-role'))return;
    document.documentElement.classList.remove('focado-booting');
    syncBrandLogo();
    const hub=$('#hubScreen'); if(hub)hub.classList.add('hidden');
    shell.classList.remove('hidden');
    const user=window.FocadoAuth?.getUser?.();
    const label=user?.name||sessionStorage.getItem('nova-era-role-label')||'Usuário';
    const role=user?.role||window.FocadoAuth?.getRole?.()||sessionStorage.getItem('nova-era-role')||'usuário';
    refreshNav();
    $('#fxUserName').textContent=label;
    const roleText=window.FocadoAuth?.roleLabel?.(role)||role;
    $('#fxUserRole').textContent=roleText;
    const mobileRole=$('#fxMobileRole'); if(mobileRole)mobileRole.textContent=roleText;
    $('#fxAvatar').textContent=label.charAt(0).toUpperCase();
    if(openDashboard){dashboard();setActive('dashboard')}
  }
  function hideShell(){shell.classList.add('hidden')}
  function setActive(id){
    document.querySelectorAll('[data-fx-nav]').forEach(b=>b.classList.toggle('active',b.dataset.fxNav===id));
    document.querySelectorAll('[data-mobile-route]').forEach(b=>b.classList.toggle('active',b.dataset.mobileRoute===id));
  }
  async function navigate(id){
    if(window.FocadoAuth && !window.FocadoAuth.can(id)){
      alert('Seu perfil não possui acesso a esta área.');
      return;
    }
    try{
      if(id!=='dashboard'&&!window.FocadoModules?.ensure)throw new Error('MODULE_LOADER_UNAVAILABLE');
      await window.FocadoModules?.ensure?.(id==='cockpit'?'indicadores':id);
    }catch(err){
      console.error('[FocadoModules]',err);
      alert('Esta área não foi carregada corretamente. Atualize a página e tente novamente. Se persistir, informe o Administrador.');
      return;
    }
    const open=(fn)=>{
      showShell(false);
      if(typeof fn==='function')fn();
      setActive(id);
      document.getElementById('fxSidebar')?.classList.remove('open');
      queueMicrotask(()=>enhanceOperationalContext(id));
    };
    const refreshInBackground=(domain,rerender)=>{
      Promise.resolve(window.FocadoDataStore?.refreshDomainV2?.(domain))
        .then(result=>{
          if(result?.ok&&typeof rerender==='function'&&document.querySelector('[data-fx-nav="'+id+'"].active')){
            rerender();
            queueMicrotask(()=>enhanceOperationalContext(id));
          }
        })
        .catch(err=>console.warn('[FocadoDataStore] atualização em segundo plano falhou para '+domain,err));
    };
    if(id==='dashboard'){showShell(true);return}
    if(id==='pendencias'){open(()=>window.FocadoPendencias?.render());return}
    if(id==='kanban'){open(()=>window.FocadoKanban?.render({q:'',brand:'TODAS'}));return}
    if(id==='clientes'){
      open(()=>window.FocadoCustomers?.render());
      refreshInBackground('customers',()=>window.FocadoCustomers?.render());
      return
    }
    if(id==='representantes'){open(()=>window.FocadoRepresentatives?.render());return}
    if(id==='simulador'){open(()=>window.FocadoSimulator?.render());return}
    if(id==='regras-margem'){open(()=>window.FocadoMarginRules?.render());return}
    if(id==='pedidos'){
      open(()=>window.FocadoOrders?.render());
      refreshInBackground('orders',()=>{
        if(window.FocadoOrders?.isFormOpen?.())return;
        window.FocadoOrders?.render();
      });
      return
    }
    if(id==='fichas'){open(()=>window.FocadoTechnicalSheets?.render());return}
    if(id==='produtos'){open(()=>window.FocadoProducts?.render());return}
    if(id==='pcp'){open(()=>window.FocadoPCP?.render());return}
    if(id==='production'){
      open(()=>window.FocadoProduction?.render());
      refreshInBackground('production',()=>window.FocadoProduction?.render());
      return
    }
    if(id==='bases'){open(()=>window.FocadoBases?.render());return}
    if(id==='inventory'){
      open(()=>window.FocadoInventory?.render({tab:'finished',q:'',filter:'TODOS'}));
      refreshInBackground('inventory',()=>window.FocadoInventory?.render({tab:'finished',q:'',filter:'TODOS'}));
      return
    }
    if(id==='inputs'){
      open(()=>window.FocadoInventory?.render({tab:'inputs',q:'',filter:'TODOS'}));
      refreshInBackground('inventory',()=>window.FocadoInventory?.render({tab:'inputs',q:'',filter:'TODOS'}));
      return
    }
    if(id==='purchases'){
      open(()=>window.FocadoPurchases?.render());
      refreshInBackground('purchases',()=>window.FocadoPurchases?.render());
      return
    }
    if(id==='expedicao'){open(()=>window.FocadoExpedition?.render());return}
    if(id==='cockpit'){open(()=>window.FocadoIndicators?.render());return}
    if(id==='corpo-auditor'){open(()=>window.FocadoIntelligenceUI?.renderAuditor());return}
    if(id==='system-health'){open(()=>window.FocadoSystemHealth?.render());return}
    if(id==='config'){open(()=>window.FocadoSettings?.render());return}
    if(id==='usuarios'){open(()=>window.FocadoUsers?.render());return}
    if(id==='indicadores'){open(()=>window.FocadoIndicators?.render());return}
    if(id==='bi-config'){open(()=>window.FocadoBIConfig?.render());return}
    if(id==='financeiro'){open(()=>window.FocadoFinance?.render());return}
    if(id==='logistica'){open(()=>window.FocadoLogistics?.render({q:'',status:'TODOS'}));return}
    if(id==='entregas'){open(()=>window.FocadoLogistics?.renderDeliveries());return}
    if(id==='transportadoras'){
      open(()=>window.FocadoLogistics?.renderCarriers());
      refreshInBackground('carriers',()=>window.FocadoLogistics?.renderCarriers());
      return
    }
  }
  function bindDashboardLinks(){document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>navigate(b.dataset.open))}
  function bindNav(){document.querySelectorAll('[data-fx-nav]').forEach(b=>b.onclick=()=>{if(!b.querySelector('.fx-nav-soon'))navigate(b.dataset.fxNav)})}
  function bindMobileNav(){
    document.querySelectorAll('[data-mobile-route]').forEach(b=>b.onclick=()=>{
      const route=b.dataset.mobileRoute;
      if(route==='__more__'){
        $('#fxSidebar')?.classList.add('open');
        return;
      }
      navigate(route);
    });
  }
  bindNav();
  bindMobileNav();
  const closeMobileNav=()=>$('#fxSidebar')?.classList.remove('open');
  $('#fxMenuToggle').onclick=()=>$('#fxSidebar').classList.toggle('open');
  $('#fxMobileBackdrop').onclick=closeMobileNav;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav()});
  $('#fxLogout').onclick=async()=>{hideShell();try{await window.FocadoAuth?.logout?.()}catch(_){} document.getElementById('hubLogoutBtn')?.click()};
  $('#fxSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){const q=e.target.value.trim();if(q)navigate('pedidos')}});

  window.addEventListener('focado:auth-changed',e=>{
    if(e.detail?.user){
      const active=document.querySelector('[data-fx-nav].active')?.dataset?.fxNav||'dashboard';
      showShell(active==='dashboard');
      document.getElementById('loginScreen')?.classList.add('hidden');
      document.getElementById('hubScreen')?.classList.add('hidden');
    }else hideShell();
  });
  window.addEventListener('focado:cache-hydrated',()=>{
    if(shell.classList.contains('hidden'))return;
    const active=document.querySelector('[data-fx-nav].active')?.dataset?.fxNav||'dashboard';
    if(active==='dashboard')dashboard();
  });
  const observer=new MutationObserver(()=>{
    const hub=$('#hubScreen');
    if(hub&&!hub.classList.contains('hidden')&&sessionStorage.getItem('nova-era-role')){
      const active=document.querySelector('[data-fx-nav].active')?.dataset?.fxNav||'dashboard';
      showShell(active==='dashboard');
    }
  });
  const hub=$('#hubScreen'); if(hub)observer.observe(hub,{attributes:true,attributeFilter:['class']});
  window.addEventListener('load',()=>{setTimeout(()=>{
    if(sessionStorage.getItem('nova-era-role')){
      document.getElementById('hubScreen')?.classList.add('hidden');
      const active=document.querySelector('[data-fx-nav].active')?.dataset?.fxNav||'dashboard';
      showShell(active==='dashboard');
    }
  },0)});
  window.FocadoShell={show:showShell,refresh:dashboard,navigate};
})();