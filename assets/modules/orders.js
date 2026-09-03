(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const moneyInput=v=>{
    const n=Number(v||0);
    return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const parseMoneyInput=v=>{
    let s=String(v??'').trim().replace(/\s/g,'').replace(/^R\$/i,'');
    if(!s)return 0;
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const today=()=>new Date().toISOString().slice(0,10);
  const firstDayMonth=()=>today().slice(0,8)+'01';
  const normalizeCnpj=v=>String(v||'').replace(/\D/g,'').slice(0,14);
  const formatCnpj=v=>{const d=normalizeCnpj(v);return d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')};
  const load=()=>window.FocadoDataStore?.readLocal?.()||(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}})();
  const save=async ops=>{
    if(window.FocadoDataStore)return window.FocadoDataStore.save(ops);
    localStorage.setItem(KEY,JSON.stringify(ops));
    window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{key:KEY}}));
    return {ok:true,mode:'local'};
  };
  const value=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const stage=s=>({COMERCIAL:['Em preenchimento','comercial'],PCP:['Aguardando PCP','pcp'],ESTOQUE_PRODUCAO:['Produção / Estoque','producao'],LOGISTICA:['Logística','logistica'],ENTREGUE:['Concluído','entregue']})[s]||[s||'—','comercial'];
  let currentFilters={q:'',stage:'TODOS'};
  let editingId=null;
  let correctionMode=false;
  let editRequested=false;
  const currentRole=()=>{
    const legacy=String(sessionStorage.getItem('nova-era-role')||'').toLowerCase();
    const label=String(sessionStorage.getItem('nova-era-role-label')||'').toLowerCase();
    if(legacy==='admin'||label.includes('administrador'))return 'ADMIN';
    if(label.includes('diretor'))return 'DIRETOR';
    if(label.includes('gestor'))return 'GESTOR';
    const userRole=String(window.FocadoAuth?.getUser?.()?.role||'').toUpperCase();
    if(['ADMIN','DIRETOR','GESTOR'].includes(userRole))return userRole;
    const modern=String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
    if(['ADMIN','DIRETOR','GESTOR'].includes(modern))return modern;
    return modern||userRole||'';
  };
  const canEditExisting=()=>['ADMIN','DIRETOR','GESTOR'].includes(currentRole());
  const canManageDraft=()=>['ADMIN','DIRETOR','GESTOR','COMERCIAL'].includes(currentRole());
  const isDraft=o=>Boolean(o&&o.status==='COMERCIAL'&&!o.commercial?.completedAt);
  function ensureOrderIds(ops){
    let changed=false;
    const used=new Set((ops.orders||[]).map(o=>String(o.id||'')).filter(Boolean));
    (ops.orders||[]).forEach((o,index)=>{
      if(o.id)return;
      const base=String(o.number||('pedido-'+(index+1))).replace(/[^a-zA-Z0-9_-]/g,'_');
      let candidate='op_'+base,n=2;
      while(used.has(candidate)){candidate='op_'+base+'_'+n;n++}
      o.id=candidate;used.add(candidate);changed=true;
    });
    if(changed){window.FocadoDataStore?.writeLocal?.(ops);window.FocadoDataStore?.save?.(ops)}
    return ops;
  }
  let formEditable=true;

  function apiBase(){return String(window.FocadoDataStore?.getConfig?.().apiBaseUrl||'').replace(/\/$/,'')}
  function token(){return window.FocadoDataStore?.getSessionToken?.()||''}

  function ensureCatalog(ops){
    return window.FocadoProducts?.ensureCatalog?.(ops)||[];
  }
  function catalog(ops){return window.FocadoProducts?.getCatalog?.(ops)||ensureCatalog(ops)}
  function findProduct(query,brand,ops){return window.FocadoProducts?.findProduct?.(query,brand,ops)||null}

  function nextNumber(ops){
    const nums=(ops.orders||[]).map(o=>String(o.number||'').match(/(\d+)$/)).filter(Boolean).map(m=>Number(m[1])).filter(Number.isFinite);
    return 'PED-'+String((Math.max(0,...nums)+1)).padStart(5,'0');
  }
  function createBlank(ops){
    return {
      id:'op_'+Date.now(),number:nextNumber(ops),status:'COMERCIAL',createdAt:Date.now(),
      brand:'Nova Era',customerId:'',client:'',cnpj:'',representativeId:'',representative:'',salesChannel:'REPRESENTANTE',salesJustification:'',city:'',uf:'',cep:'',bairro:'',email:'',phone:'',
      orderDate:today(),requestedDeliveryDate:'',suggestedPickup:'',freightType:'CIF',paymentTerms:'',logisticsBudget:0,deliveryAddress:'',notes:'',
      commercial:{completedAt:null,completedBy:null},
      pcp:{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false},
      logistics:{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''},
      items:[{productId:'',code:'',name:'',qty:'',price:'',source:'',reservedQty:0,productionConsumed:false}],
      events:[]
    };
  }
  function canEdit(o){return o.status==='COMERCIAL'}
  const CORRECTION_ROLE_LABELS={ADMIN:'Administrador',COMERCIAL:'Comercial'};
  function correctionRoles(ops){
    const configured=ops?.settings?.orderCorrectionRoles;
    const roles=Array.isArray(configured)?configured.filter(r=>CORRECTION_ROLE_LABELS[r]):[];
    return roles.length?roles:['ADMIN'];
  }
  function canCorrectPast(o,ops){
    if(!o||o.status==='COMERCIAL')return false;
    return canEditExisting();
  }
  function renderCorrectionPermissions(){
    const ops=load(),selected=new Set(correctionRoles(ops));
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><button class="fo-back" id="foBackPermissions">← Pedidos</button><h1>Permissão para editar pedidos enviados</h1><p>Defina quem pode editar pedidos após o envio pelo Comercial.</p></div></div>'+
      '<div class="fo-card"><h2>Perfis autorizados</h2><div class="fo-fields">'+
        '<label class="fo-field"><span>Administrador</span><label><input type="checkbox" checked disabled> Sempre autorizado</label></label>'+
        '<label class="fo-field"><span>Comercial</span><label><input type="checkbox" id="foCorrectionCommercial" '+(selected.has('COMERCIAL')?'checked':'')+'> Pode corrigir pedidos já enviados</label></label>'+
      '</div><div class="fo-cnpj-status warn">A correção mantém a etapa atual e fica registrada no histórico.</div>'+
      '<div class="fo-actions" style="margin-top:16px"><button class="fo-btn primary" id="foSaveCorrectionPermissions">Salvar permissão</button></div></div></div>';
    document.getElementById('foBackPermissions').onclick=()=>render(currentFilters);
    document.getElementById('foSaveCorrectionPermissions').onclick=async()=>{
      ops.settings=ops.settings||{};
      ops.settings.orderCorrectionRoles=['ADMIN'];
      if(document.getElementById('foCorrectionCommercial').checked)ops.settings.orderCorrectionRoles.push('COMERCIAL');
      const result=await save(ops);
      if(result?.mode==='conflict'){alert('As configurações foram alteradas em outro acesso. Atualize a tela e tente novamente.');return}
      alert('Permissão de edição atualizada.');
      render(currentFilters);
    };
  }
  function normalizeItems(items){
    return (items||[]).filter(i=>String(i.code||i.name||'').trim()||Number(i.qty)||Number(i.price)).map(i=>({
      productId:i.productId||'',code:String(i.code||'').trim(),name:String(i.name||'').trim(),
      qty:Number(i.qty)||0,price:Number(i.price)||0,source:i.source||'',reservedQty:Number(i.reservedQty)||0,
      productionConsumed:Boolean(i.productionConsumed),productionCompleted:Boolean(i.productionCompleted)
    }));
  }
  function validateCommercial(o){
    const errors=[];
    if(normalizeCnpj(o.cnpj).length!==14)errors.push('CNPJ válido');
    if(!String(o.client||'').trim())errors.push('Cliente');
    if(!String(o.orderDate||'').trim())errors.push('Data do pedido');
    if(!/^\S+@\S+\.\S+$/.test(String(o.email||'').trim()))errors.push('E-mail válido do cliente');
    if(!String(o.city||'').trim())errors.push('Cidade');
    if(!String(o.requestedDeliveryDate||'').trim())errors.push('Data de entrega solicitada pelo cliente');
    if(!String(o.paymentTerms||'').trim())errors.push('Condição de pagamento');
    if(!(Number(o.logisticsBudget)>0))errors.push('Orçamento de logística');
    const channel=String(o.salesChannel||'REPRESENTANTE');
    if(channel==='REPRESENTANTE'&&!String(o.representative||'').trim())errors.push('Representante');
    if(['VENDAS_INTERNAS','BONIFICACAO'].includes(channel)&&!String(o.salesJustification||'').trim())errors.push('Justificativa da venda');
    if(!String(o.uf||'').trim())errors.push('UF');
    if(!['CIF','FOB','Redespacho'].includes(o.freightType))errors.push('Tipo de frete');
    const items=normalizeItems(o.items);
    if(!items.length)errors.push('Pelo menos um item');
    items.forEach((i,n)=>{if(!i.name&&!i.code)errors.push('Produto da linha '+(n+1));if(!(Number(i.qty)>0))errors.push('Quantidade da linha '+(n+1));});
    return [...new Set(errors)];
  }

  function render(filters){
    currentFilters=filters||currentFilters;editingId=null;correctionMode=false;editRequested=false;
    const ops=ensureOrderIds(load());ensureCatalog(ops);
    const orders=(ops.orders||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const qText=currentFilters.q.toLowerCase();
    const matchesSearch=o=>!qText||[o.number,o.client,o.cnpj,o.representative,o.city,(o.items||[]).map(i=>i.name+' '+i.code).join(' ')].some(v=>String(v||'').toLowerCase().includes(qText));
    const drafts=orders.filter(isDraft);
    const official=orders.filter(o=>!isDraft(o));
    const filtered=official.filter(o=>matchesSearch(o)&&(currentFilters.stage==='TODOS'||o.status===currentFilters.stage));
    const draftFiltered=drafts.filter(matchesSearch);
    const open=official.filter(o=>o.status!=='ENTREGUE');
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><h1>Pedidos Comerciais</h1><p>Registro oficial do pedido · o status macro é preservado; a barra superior mostra o andamento operacional real</p></div><div class="fo-actions">'+(window.FocadoAuth?.getRole?.()==='ADMIN'?'<button class="fo-btn secondary" id="foCorrectionPermissions">Permissão de edição</button>':'')+'<button class="fo-btn secondary" id="foPeriod">Listagem / período</button><button class="fo-btn primary" id="foNew">+ Novo pedido</button></div></div>'+
      '<div class="fo-summary">'+
        stat('Rascunhos',drafts.length,'salvos e ainda não enviados')+
        stat('Aguardando PCP',official.filter(o=>o.status==='PCP').length,'enviados pelo Comercial')+
        stat('Pedidos em aberto',open.length,money(open.reduce((s,o)=>s+value(o),0)))+
        stat('Concluídos',official.filter(o=>o.status==='ENTREGUE').length,'histórico finalizado')+
      '</div>'+
      '<div class="fo-toolbar"><input class="fo-search" id="foSearch" placeholder="Buscar pedido, cliente, CNPJ, representante ou produto" value="'+esc(currentFilters.q)+'"><select class="fo-select" id="foStage"><option value="TODOS">Todos os status macro</option>'+[['PCP','Aguardando PCP'],['ESTOQUE_PRODUCAO','Produção / Estoque'],['LOGISTICA','Logística'],['ENTREGUE','Concluído']].map(x=>'<option value="'+x[0]+'" '+(currentFilters.stage===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select><span class="fo-muted">'+filtered.length+' pedido(s)</span></div>'+
      '<div class="fo-table-wrap">'+table(filtered)+'</div>'+
      window.FocadoOrderDrafts.render(draftFiltered,esc,money,value,dbr)+'</div>';
    document.getElementById('foNew').onclick=()=>openForm();
    document.getElementById('foPeriod').onclick=()=>renderReport(firstDayMonth(),today());
    const correctionPermissions=document.getElementById('foCorrectionPermissions');
    if(correctionPermissions)correctionPermissions.onclick=renderCorrectionPermissions;
    const q=document.getElementById('foSearch'),st=document.getElementById('foStage');let timer;
    q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>render({q:q.value,stage:st.value}),180)};
    st.onchange=()=>render({q:q.value,stage:st.value});
    document.querySelectorAll('[data-fo-open]').forEach(b=>b.onclick=()=>openForm(b.dataset.foOpen,false));
    document.querySelectorAll('[data-fo-edit]').forEach(b=>b.onclick=()=>openForm(b.dataset.foEdit,true));
    document.querySelectorAll('[data-fo-delete]').forEach(b=>b.onclick=()=>deleteOrder(b.dataset.foDelete));
  }
  function stat(label,n,sub){return '<div class="fo-stat"><span>'+label+'</span><strong>'+n+'</strong><small>'+sub+'</small></div>'}
  function table(rows){
    if(!rows.length)return '<div class="fo-empty">Nenhum pedido encontrado.</div>';
    const allowEdit=canEditExisting();
    return '<table class="fo-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>CNPJ</th><th>Representante</th><th>Data</th><th>Itens</th><th>Valor</th><th>Status macro</th><th>Previsão</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const s=stage(o.status);
      const canDelete=allowEdit;
      return '<tr><td><div class="fo-order">'+esc(o.number)+'</div></td><td><div class="fo-client">'+esc(o.client||'—')+'</div><div class="fo-muted">'+esc([o.city,o.uf].filter(Boolean).join('/'))+'</div></td><td>'+esc(formatCnpj(o.cnpj)||'—')+'</td><td>'+esc(o.representative||'—')+'</td><td>'+dbr(o.orderDate)+'</td><td>'+(o.items||[]).length+'</td><td>'+money(value(o))+'</td><td><span class="fo-stage '+s[1]+'">'+s[0]+'</span></td><td>'+dbr(o.pcp?.availableDate||o.requestedDeliveryDate)+'</td><td><div class="fo-actions"><button class="fo-open" data-fo-open="'+esc(o.id)+'">Abrir</button>'+(allowEdit?'<button class="fo-open" data-fo-edit="'+esc(o.id)+'">Editar</button>':'')+(canDelete?'<button class="fo-open fo-delete-order" data-fo-delete="'+esc(o.id)+'">Excluir</button>':'')+'</div></td></tr>';
    }).join('')+'</tbody></table>';
  }

  async function deleteOrder(id){
    const ops=load(),order=(ops.orders||[]).find(o=>String(o.id)===String(id));
    if(!order){alert('Pedido não encontrado.');return}
    const draft=isDraft(order);
    if(draft&&!canManageDraft()){alert('Sem permissão para excluir este rascunho.');return}
    if(!draft&&!canEditExisting()){alert('Apenas Admin, Diretor ou Gestor podem excluir pedidos enviados.');return}
    const detail=draft
      ? 'O rascunho será removido definitivamente.'
      : 'Pedido e vínculos serão removidos; reservas/saídas serão revertidas.';
    const ok=confirm('Excluir o pedido '+String(order.number||'')+'?\n\n'+detail+'\n\nAção irreversível.');
    if(!ok)return;
    try{
      const changes=draft?{deleteOrderId:order.id}:{deleteOrderCascadeId:order.id};
      const result=await window.FocadoDataStore.saveDomain('COMERCIAL',changes,order.id);
      if(!result?.ok){alert('Não foi possível excluir o pedido.');return}
      if(result.payload)window.FocadoDataStore.writeLocal(result.payload);
      render(currentFilters);
    }catch(err){
      alert('Não foi possível excluir o pedido.');
    }
  }

  function openForm(id,requestEdit=false){
    const ops=load();ensureCatalog(ops);correctionMode=false;
    let order=id?(ops.orders||[]).find(o=>o.id===id):null;
    if(id&&requestEdit&&order&&!isDraft(order)&&!canEditExisting()){alert('Seu perfil não possui permissão para editar pedidos enviados.');return}
    if(id&&requestEdit&&order&&isDraft(order)&&!canManageDraft()){alert('Seu perfil não possui permissão para editar este rascunho.');return}
    if(!order){order=createBlank(ops);editingId=order.id;editRequested=true}
    else {
      editingId=order.id;editRequested=Boolean(requestEdit);correctionMode=Boolean(requestEdit&&order.status!=='COMERCIAL');
      order=syncPaymentTermsFromCustomer(structuredClone(order),ops);
    }
    renderForm(order,ops);
  }
  function renderForm(o,ops){
    const regularEditable=canEdit(o)&&(editRequested&&(isDraft(o)?canManageDraft():canEditExisting())),correctionAllowed=canCorrectPast(o,ops);
    const canOfferEdit=editingId!==null&&(canEditExisting()||(isDraft(o)&&canManageDraft()));
    const editable=regularEditable||(correctionMode&&correctionAllowed),readonly=editable?'':'disabled';formEditable=editable;
    const items=(o.items&&o.items.length?o.items:[{code:'',name:'',qty:'',price:''}]);
    const s=stage(o.status),cat=catalog(ops);
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><button class="fo-back" id="foBack">← Histórico</button><h1>'+esc(o.number)+'</h1><p>Pedido comercial · <span class="fo-stage '+(isDraft(o)?'draft':s[1])+'">'+(isDraft(o)?'Rascunho':s[0])+'</span></p></div><div class="fo-actions">'+
        (!editable&&canOfferEdit?'<button class="fo-btn primary" id="foEditPast">Editar pedido</button>':'')+
      '</div></div>'+(correctionMode?'<div class="fo-cnpj-status warn" style="margin-bottom:14px">Modo de correção: a etapa atual será mantida.</div>':'')+
      '<div class="fo-flowline"><span class="'+(o.status==='COMERCIAL'?'active':'done')+'">1. Comercial</span><i>→</i><span class="'+(o.status==='PCP'?'active':(['ESTOQUE_PRODUCAO','LOGISTICA','ENTREGUE'].includes(o.status)?'done':'') )+'">2. PCP</span><i>→</i><span class="'+(['ESTOQUE_PRODUCAO','LOGISTICA'].includes(o.status)?'active':(o.status==='ENTREGUE'?'done':''))+'">3. Logística</span><i>→</i><span class="'+(o.status==='ENTREGUE'?'done':'')+'">4. Concluído</span></div>'+
      '<form id="foOrderForm" class="fo-form">'+
        '<div class="fo-card"><h2>Dados do pedido</h2><div class="fo-fields">'+
          field('Número do pedido','number',o.number,'text',true)+
          customerCnpjField(o,ops,editable)+
          '<input type="hidden" name="customerId" value="'+esc(o.customerId||'')+'"><input type="hidden" name="representativeId" value="'+esc(o.representativeId||'')+'">'+
          field('Data do pedido','orderDate',o.orderDate,'date')+
          salesChannelField(o.salesChannel||'REPRESENTANTE')+
          readonlyField('Representante','representative',o.representative)+
          salesJustificationField(o.salesJustification||'',o.salesChannel||'REPRESENTANTE')+
          readonlyField('Cliente / Razão social','client',o.client,'wide')+
          selectField('Marca / Empresa','brand',o.brand,['Nova Era','New Green'])+
          readonlyField('E-mail','email',o.email)+
          readonlyField('Telefone','phone',o.phone)+
        '</div><div class="fo-cnpj-status" id="foCnpjStatus"></div></div>'+
        '<div class="fo-card"><h2>Entrega e condição comercial</h2><div class="fo-fields">'+
          readonlyField('CEP','cep',o.cep)+readonlyField('Bairro','bairro',o.bairro)+readonlyField('Cidade','city',o.city)+readonlyField('UF','uf',o.uf)+
          field('Data solicitada pelo cliente','requestedDeliveryDate',o.requestedDeliveryDate,'date')+
          selectField('Tipo de frete','freightType',o.freightType||'CIF',['CIF','FOB','Redespacho'])+
          readonlyField('Condição de pagamento','paymentTerms',o.paymentTerms)+
          moneyField('Orçamento de logística','logisticsBudget',o.logisticsBudget)+
          readonlyField('Endereço / local de entrega','deliveryAddress',o.deliveryAddress,'wide')+
        '</div></div>'+
        '<div class="fo-card"><div class="fo-card-head"><div><h2>Itens do pedido</h2><p>Informe o <b>preço base da mercadoria por caixa, sem IPI e sem ST</b>, igual ao Simulador. Na margem, a referência logística é o orçamento de logística dividido pelo total de caixas do pedido.</p></div>'+(editable?'<div class="fo-actions"><button class="fo-btn secondary" type="button" id="foProducts">Cadastrar produto</button><button class="fo-btn secondary" type="button" id="foAddItem">+ Linha</button></div>':'')+'</div>'+
          '<datalist id="foProductCodes">'+cat.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name)+' · '+esc(p.brand)+'</option>').join('')+'</datalist>'+
          '<datalist id="foProductNames">'+cat.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.code)+' · '+esc(p.brand)+'</option>').join('')+'</datalist>'+
          '<div class="fo-items-wrap"><table class="fo-items" id="foItems"><thead><tr><th>Código</th><th>Produto</th><th>Quantidade</th><th>Preço da mercadoria s/ IPI/ST</th><th>Margem estimada</th><th>Total</th><th></th></tr></thead><tbody>'+items.map((i,n)=>itemRow(i,n,editable)).join('')+'</tbody></table></div><div class="fo-order-profit"><div id="foProfitSummary"><span>Margem estimada do pedido</span><strong>—</strong><small>Preencha produto, quantidade, preço e UF</small></div><div class="fo-total"><span>Total do pedido</span><strong id="foGrandTotal">'+money(value(o))+'</strong></div></div></div>'+

        '<div class="fo-card"><h2>Observações comerciais</h2><textarea name="notes" '+readonly+' placeholder="Observações do pedido, particularidades do cliente, entrega ou negociação">'+esc(o.notes||'')+'</textarea></div>'+
        (editable?'<div class="fo-form-finish"><div><span>'+(correctionMode?'CORREÇÃO':'FINAL DO PREENCHIMENTO')+'</span><h2>'+(correctionMode?'Revise e salve a correção':'O que deseja fazer com este pedido?')+'</h2><p>'+(correctionMode?'A etapa atual será mantida e a alteração ficará no histórico.':'Salvar rascunho guarda o preenchimento sem enviar ao PCP. Finalizar envia o pedido para o PCP.')+'</p></div><div class="fo-form-finish-actions">'+(correctionMode?'<button class="fo-btn secondary" type="button" id="foCancelCorrection">Cancelar correção</button><button class="fo-btn primary" type="button" id="foSave">Salvar correção</button>':'<button class="fo-btn secondary" type="button" id="foSave">Salvar como rascunho</button><button class="fo-btn primary" type="button" id="foFinalize">Finalizar e enviar ao PCP</button>')+'</div></div>':'')+
      '</form>'+history(o)+'</div>';
    document.getElementById('foBack').onclick=()=>render(currentFilters);
    const editPast=document.getElementById('foEditPast');
    if(editPast)editPast.onclick=()=>{
      if(!confirm('Editar este pedido já enviado?\n\nA etapa atual será mantida e a correção ficará registrada no histórico.'))return;
      editRequested=true;correctionMode=o.status!=='COMERCIAL';renderForm(o,ops);
    };
    if(editable){
      bindItemEvents(ops);
      document.getElementById('foAddItem').onclick=()=>addItemRow(ops);
      document.getElementById('foProducts').onclick=async()=>{const ok=await persist(false,true);if(ok!==false)window.FocadoShell?.navigate?.('produtos')};
      const repManage=document.getElementById('foRepManage');
      if(repManage)repManage.onclick=async()=>{const ok=await persist(false,true);if(ok!==false)window.FocadoShell?.navigate?.('representantes')};
      document.getElementById('foSave').onclick=()=>persist(false);
      const finalizeBtn=document.getElementById('foFinalize');
      if(finalizeBtn)finalizeBtn.onclick=()=>persist(true);
      const cancelCorrection=document.getElementById('foCancelCorrection');
      if(cancelCorrection)cancelCorrection.onclick=()=>{correctionMode=false;renderForm(o,ops)};
      bindCustomerSelection(ops,o);
      const salesChannel=document.getElementById('foSalesChannel');
      const justWrap=document.getElementById('foSalesJustificationWrap');
      if(salesChannel)salesChannel.onchange=()=>{
        const special=['VENDAS_INTERNAS','BONIFICACAO'].includes(salesChannel.value);
        if(justWrap)justWrap.style.display=special?'flex':'none';
      };
      const profitabilitySelectors=['brand','uf','freightType'];
      profitabilitySelectors.forEach(name=>{const el=document.querySelector('[name="'+name+'"]');if(el)el.addEventListener('change',()=>scheduleProfitability(ops))});
      const budget=document.querySelector('[name="logisticsBudget"]');
      if(budget){
        budget.onfocus=()=>budget.select();
        budget.onblur=()=>{budget.value=moneyInput(parseMoneyInput(budget.value))};
      }
    }
  }
  function field(label,name,val,type='text',forceDisabled=false,cls=''){
    return '<label class="fo-field '+cls+'"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(val||'')+'" '+((forceDisabled||!formEditable)?'disabled':'')+'></label>';
  }
  function selectField(label,name,val,options){
    return '<label class="fo-field"><span>'+label+'</span><select name="'+name+'" '+(!formEditable?'disabled':'')+'>'+options.map(x=>'<option value="'+esc(x)+'" '+(String(val||'')===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
  }
  function representativeField(val,ops){
    const reps=window.FocadoRepresentatives?.activeList?.(ops)||[];
    const options=['<option value="">Selecione</option>'].concat(reps.map(r=>'<option value="'+esc(r.name)+'" '+(String(val||'')===String(r.name)?'selected':'')+'>'+esc(r.name)+'</option>'));
    if(val && !reps.some(r=>String(r.name)===String(val)))options.push('<option value="'+esc(val)+'" selected>'+esc(val)+' (histórico)</option>');
    return '<label class="fo-field"><span>Representante</span><div class="fo-rep-select"><select name="representative" '+(!formEditable?'disabled':'')+'>'+options.join('')+'</select>'+(formEditable?'<button type="button" id="foRepManage" title="Cadastrar representante">+</button>':'')+'</div></label>';
  }
  function salesChannelField(val){
    const options=[['REPRESENTANTE','Representante'],['VENDAS_INTERNAS','Vendas internas'],['BONIFICACAO','Bonificação']];
    return '<label class="fo-field"><span>Origem da venda</span><select name="salesChannel" id="foSalesChannel" '+(!formEditable?'disabled':'')+'>'+options.map(([v,l])=>'<option value="'+v+'" '+(String(val)===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';
  }
  function salesJustificationField(val,channel){
    const required=['VENDAS_INTERNAS','BONIFICACAO'].includes(channel);
    return '<label class="fo-field wide" id="foSalesJustificationWrap" style="display:'+(required?'flex':'none')+'"><span>Justificativa *</span><input name="salesJustification" value="'+esc(val||'')+'" '+(!formEditable?'disabled':'')+' placeholder="Informe o motivo da venda interna ou bonificação"></label>';
  }
  function moneyField(label,name,val){
    return '<label class="fo-field"><span>'+label+'</span><div class="fo-money-input"><span>R$</span><input name="'+name+'" type="text" inputmode="decimal" value="'+esc(moneyInput(val))+'" '+(!formEditable?'disabled':'')+'></div></label>';
  }
  function readonlyField(label,name,val,cls=''){
    return '<label class="fo-field '+cls+'"><span>'+label+'</span><input name="'+name+'" value="'+esc(val||'')+'" readonly></label>';
  }
  function customerCnpjField(order,ops,editable){
    const customers=(ops.customers||[]).filter(x=>x.active!==false&&normalizeCnpj(x.cnpj).length===14).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    const current=normalizeCnpj(order.cnpj),hasCurrent=customers.some(x=>normalizeCnpj(x.cnpj)===current);
    const options=['<option value="">Selecione um cliente cadastrado</option>'].concat(customers.map(x=>{
      const label=formatCnpj(x.cnpj)+' · '+(x.name||x.fantasyName||'Cliente')+(x.fantasyName&&x.fantasyName!==x.name?' ('+x.fantasyName+')':'');
      return '<option value="'+esc(normalizeCnpj(x.cnpj))+'" '+(normalizeCnpj(x.cnpj)===current?'selected':'')+'>'+esc(label)+'</option>';
    }));
    if(current&&!hasCurrent)options.push('<option value="'+esc(current)+'" selected>'+esc(formatCnpj(current)+' · histórico')+'</option>');
    return '<label class="fo-field"><span>CNPJ do cliente cadastrado</span><select name="cnpj" id="foCnpj" '+(editable?'':'disabled')+'>'+options.join('')+'</select><small class="fo-master-hint">Fonte: Cadastro de Clientes</small></label>';
  }
  function itemRow(i,n,editable){
    return '<tr data-item-row data-product-id="'+esc(i.productId||'')+'"><td><input data-k="code" list="foProductCodes" value="'+esc(i.code||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="name" list="foProductNames" value="'+esc(i.name||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="qty" type="number" min="0" step="1" value="'+esc(i.qty||'')+'" '+(editable?'':'disabled')+'></td><td><div class="fo-money-input"><span>R$</span><input data-k="price" type="text" inputmode="decimal" value="'+esc(moneyInput(i.price))+'" '+(editable?'':'disabled')+'></div><small class="fo-price-hint">Preço base · sem IPI/ST</small></td><td class="fo-margin-cell"><span class="fo-margin pending">Aguardando dados</span><small></small></td><td class="fo-line-total">'+money((Number(i.qty)||0)*(Number(i.price)||0))+'</td><td>'+(editable?'<button type="button" class="fo-remove">×</button>':'')+'</td></tr>';
  }
  function addItemRow(ops){
    const tbody=document.querySelector('#foItems tbody');tbody.insertAdjacentHTML('beforeend',itemRow({},tbody.children.length,true));bindItemEvents(ops);
  }
  let profitabilityTimer=0;
  function brandIdFromLabel(label,snap){
    return snap?.brands?.find(b=>String(b.label||'').toLowerCase()===String(label||'').toLowerCase())?.id||'';
  }
  async function updateProfitability(ops){
    const rows=[...document.querySelectorAll('[data-item-row]')],uf=String(document.querySelector('[name="uf"]')?.value||'').toUpperCase();
    const brandLabel=document.querySelector('[name="brand"]')?.value||'',freightType=String(document.querySelector('[name="freightType"]')?.value||'CIF').toUpperCase();
    if(!window.FocadoLegacySimulator){rows.forEach(r=>setMarginCell(r,null,'Simulador indisponível'));return}
    if(!uf){rows.forEach(r=>setMarginCell(r,null,'Informe a UF'));return}
    try{
      const snap=await window.FocadoLegacySimulator.ready(),brandId=brandIdFromLabel(brandLabel,snap);
      const items=rows.map(r=>({
        row:r,productId:r.dataset.productId||'',qty:Number(r.querySelector('[data-k="qty"]').value)||0,
        basePrice:parseMoneyInput(r.querySelector('[data-k="price"]').value)
      }));
      const valid=items.filter(x=>x.productId&&x.qty>0&&x.basePrice>0);
      rows.forEach(r=>setMarginCell(r,null,'Aguardando dados'));
      if(!valid.length)return;
      const totalBoxes=valid.reduce((sum,x)=>sum+Number(x.qty||0),0);
      const logisticsBudget=parseMoneyInput(document.querySelector('[name="logisticsBudget"]')?.value||0);
      const freightPerBox=totalBoxes>0?logisticsBudget/totalBoxes:0;
      const quote=window.FocadoLegacySimulator.quoteOrder({
        brandId,uf,freightType,manualFreight:true,marginRules:ops.marginRules||{},
        items:valid.map(x=>({productId:x.productId,qty:x.qty,basePrice:x.basePrice,freightPerBox}))
      });
      if(!quote?.ok){valid.forEach(x=>setMarginCell(x.row,null,'Sem vínculo no simulador'));return}
      valid.forEach(x=>{
        const q=quote.rows.find(r=>String(r.productId)===String(x.productId));
        if(!q){setMarginCell(x.row,null,'Sem cálculo');return}
        setMarginCell(x.row,q.marginPct,'Custo '+money(q.costPerBox)+' · Base '+money(q.basePrice)+' · Logística '+money(q.freight?.value||0)+'/cx');
      });
      const box=document.getElementById('foProfitSummary');
      if(box)box.innerHTML='<span>Margem estimada do pedido</span><strong class="'+(quote.marginPct>=0?'ok':'bad')+'">'+(quote.marginPct*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%</strong><small>'+esc(uf)+' · '+esc(freightType)+' · Logística '+money(freightPerBox)+'/cx · preço sem IPI/ST</small>';
    }catch(err){
      console.warn('[OrdersProfitability]',err);valid?.forEach?.(x=>setMarginCell(x.row,null,'Não foi possível calcular'));
    }
  }
  function setMarginCell(row,value,detail){
    const cell=row.querySelector('.fo-margin-cell');if(!cell)return;const chip=cell.querySelector('.fo-margin'),small=cell.querySelector('small');
    if(value==null){chip.className='fo-margin pending';chip.textContent='—';small.textContent=detail||'';return}
    chip.className='fo-margin '+(value<0?'bad':value<0.1?'warn':'ok');
    chip.textContent=(value*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
    small.textContent=detail||'';
  }
  function scheduleProfitability(ops){clearTimeout(profitabilityTimer);profitabilityTimer=setTimeout(()=>updateProfitability(ops),120)}
  function bindItemEvents(ops){
    const brand=()=>document.querySelector('[name="brand"]')?.value||'';
    document.querySelectorAll('[data-item-row]').forEach(row=>{
      const code=row.querySelector('[data-k="code"]'),name=row.querySelector('[data-k="name"]');
      function resolve(source){
        const p=findProduct(source.value,brand(),ops);if(!p)return;
        code.value=p.code;name.value=p.name;row.dataset.productId=p.simulatorId||'';
        scheduleProfitability(ops);
      }
      code.onchange=()=>resolve(code);code.onblur=()=>resolve(code);
      name.onchange=()=>resolve(name);name.onblur=()=>resolve(name);
      const price=row.querySelector('[data-k="price"]');
      if(price){
        price.onfocus=()=>{price.select()};
        price.onblur=()=>{price.value=moneyInput(parseMoneyInput(price.value));updateTotals();scheduleProfitability(ops)};
        price.oninput=()=>{updateTotals();scheduleProfitability(ops)};
      }
      row.querySelectorAll('input:not([data-k="price"])').forEach(i=>i.addEventListener('input',()=>{updateTotals();scheduleProfitability(ops)}));
      const logisticsBudget=document.querySelector('[name="logisticsBudget"]');
      if(logisticsBudget&&!logisticsBudget.dataset.marginBound){
        logisticsBudget.dataset.marginBound='1';
        logisticsBudget.addEventListener('input',()=>scheduleProfitability(ops));
        logisticsBudget.addEventListener('blur',()=>scheduleProfitability(ops));
      }
    });
    document.querySelectorAll('.fo-remove').forEach(b=>b.onclick=()=>{if(document.querySelectorAll('[data-item-row]').length>1)b.closest('tr').remove();updateTotals();scheduleProfitability(ops)});
    scheduleProfitability(ops);
  }
  function updateTotals(){
    let total=0;document.querySelectorAll('[data-item-row]').forEach(r=>{const q=Number(r.querySelector('[data-k="qty"]').value)||0,p=parseMoneyInput(r.querySelector('[data-k="price"]').value);r.querySelector('.fo-line-total').textContent=money(q*p);total+=q*p});
    const g=document.getElementById('foGrandTotal');if(g)g.textContent=money(total);
  }

  function setForm(name,value){const el=document.querySelector('[name="'+name+'"]');if(el&&value!=null&&String(value)!=='')el.value=value}
  function previousOrderByCnpj(cnpj,ops,currentId){
    const key=normalizeCnpj(cnpj);
    return (ops.orders||[]).filter(o=>o.id!==currentId&&normalizeCnpj(o.cnpj)===key).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0]||null;
  }
  function applyPrevious(prev){
    if(!prev)return false;
    ['representative','salesChannel','brand','freightType','paymentTerms','deliveryAddress','city','uf','cep','bairro','email','phone'].forEach(k=>setForm(k,prev[k]));
    return true;
  }
  async function fetchCnpj(cnpj){
    const base=apiBase(),headers={'accept':'application/json'};if(token())headers.Authorization='Bearer '+token();
    if(base){
      const r=await fetch(base+'/api/cnpj/'+encodeURIComponent(cnpj),{headers,cache:'no-store'});
      if(r.ok)return r.json();
      if(r.status!==503&&r.status!==502)throw Object.assign(new Error('CNPJ_LOOKUP_FAILED'),{status:r.status});
    }
    const r=await fetch('https://brasilapi.com.br/api/cnpj/v1/'+encodeURIComponent(cnpj),{headers:{accept:'application/json'},cache:'no-store'});
    if(!r.ok)throw Object.assign(new Error('CNPJ_LOOKUP_FAILED'),{status:r.status});
    const b=await r.json();
    return {cnpj:b.cnpj,razaoSocial:b.razao_social,nomeFantasia:b.nome_fantasia,cep:b.cep,logradouro:b.logradouro,numero:b.numero,complemento:b.complemento,bairro:b.bairro,municipio:b.municipio,uf:b.uf,dddTelefone1:b.ddd_telefone_1,email:b.email};
  }
  function customersByCnpj(cnpj,ops){
    const key=normalizeCnpj(cnpj);
    return (ops.customers||[])
      .filter(x=>normalizeCnpj(x.cnpj)===key)
      .sort((a,b)=>(Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0)));
  }
  function customerByCnpj(cnpj,ops){
    return customersByCnpj(cnpj,ops)[0]||null;
  }
  function currentCustomerForOrder(order,ops){
    if(!order)return null;
    const byCnpj=customersByCnpj(order.cnpj,ops);
    if(byCnpj.length)return byCnpj[0];
    return (ops.customers||[]).find(x=>String(x.id||'')===String(order.customerId||''))||null;
  }
  function syncPaymentTermsFromCustomer(order,ops){
    if(!order)return order;
    const customer=currentCustomerForOrder(order,ops);
    if(!customer)return order;
    order.customerId=customer.id||order.customerId||'';
    const next=String(customer.paymentTerms||'').trim();
    if(String(order.paymentTerms||'').trim()!==next)order.paymentTerms=next;
    return order;
  }
  function bindCustomerSelection(ops,o){
    const select=document.getElementById('foCnpj'),status=document.getElementById('foCnpjStatus');
    function applyCustomer(){
      const customer=customerByCnpj(select.value,ops);
      if(!customer){
        status.textContent=select.value?'Cliente histórico: cadastro mestre não localizado.':'Selecione um CNPJ cadastrado para preencher os dados do cliente.';
        status.className='fo-cnpj-status '+(select.value?'warn':'');
        return;
      }
      setForm('customerId',customer.id||'');
      setForm('client',customer.name||customer.fantasyName||'');
      setForm('cep',customer.cep||'');
      setForm('bairro',customer.bairro||'');
      setForm('city',customer.city||'');
      setForm('uf',customer.state||customer.uf||'');
      setForm('email',customer.email||'');
      setForm('phone',customer.phone||'');
      setForm('deliveryAddress',customer.address||'');
      setForm('paymentTerms',customer.paymentTerms||'');
      setForm('representativeId',customer.representativeId||'');
      setForm('representative',customer.representative||'');
      status.textContent='Dados preenchidos pelo Cadastro de Clientes.';
      status.className='fo-cnpj-status ok';
      scheduleProfitability(ops);
    }
    select.onchange=applyCustomer;
    if(select.value)applyCustomer();
  }

  function collect(){
    const form=document.getElementById('foOrderForm'),fd=new FormData(form),ops=load(),brand=fd.get('brand')||'';
    return {
      number:document.querySelector('[name="number"]')?.value||'',orderDate:fd.get('orderDate')||'',customerId:fd.get('customerId')||'',
      representativeId:fd.get('representativeId')||'',representative:fd.get('representative')||'',
      salesChannel:fd.get('salesChannel')||'REPRESENTANTE',salesJustification:fd.get('salesJustification')||'',
      client:fd.get('client')||'',cnpj:normalizeCnpj(fd.get('cnpj')),brand,city:fd.get('city')||'',uf:String(fd.get('uf')||'').toUpperCase().slice(0,2),
      cep:fd.get('cep')||'',bairro:fd.get('bairro')||'',email:fd.get('email')||'',phone:fd.get('phone')||'',
      requestedDeliveryDate:fd.get('requestedDeliveryDate')||'',freightType:fd.get('freightType')||'CIF',paymentTerms:fd.get('paymentTerms')||'',
      logisticsBudget:parseMoneyInput(fd.get('logisticsBudget')),
      deliveryAddress:fd.get('deliveryAddress')||'',notes:fd.get('notes')||'',
      items:[...document.querySelectorAll('[data-item-row]')].map(r=>{
        const code=r.querySelector('[data-k="code"]').value,name=r.querySelector('[data-k="name"]').value,p=findProduct(code||name,brand,ops);
        return {productId:p?.simulatorId||r.dataset.productId||'',code:p?.code||code,name:p?.name||name,qty:r.querySelector('[data-k="qty"]').value,price:parseMoneyInput(r.querySelector('[data-k="price"]').value)};
      })
    };
  }
  let persistInFlight=false;
  async function persist(finalize,silentNavigate=false){
    if(persistInFlight)return false;
    persistInFlight=true;
    try{
    const ops=load();ensureCatalog(ops);ops.orders=ops.orders||[];
    const data=collect();
    const existing=editingId?ops.orders.find(x=>x.id===editingId):null;
    const isNew=!existing;
    const isCorrection=Boolean(existing&&correctionMode&&existing.status!=='COMERCIAL');
    const o=existing?structuredClone(existing):createBlank(ops);

    if(isNew){
      o.id=editingId||o.id||('op_'+Date.now());
      o.createdAt=o.createdAt||Date.now();
      editingId=o.id;
    }

    const previousItems=o.items||[];
    Object.assign(o,data);
    o.items=normalizeItems(data.items).map((i,idx)=>Object.assign({},previousItems[idx]||{},i,{
      id:(previousItems[idx]||{}).id||i.id||i.code||i.productId||('item_'+(idx+1)),
      source:(previousItems[idx]||{}).source||'',
      reservedQty:Number((previousItems[idx]||{}).reservedQty)||0,
      productionConsumed:Boolean((previousItems[idx]||{}).productionConsumed),
      productionCompleted:Boolean((previousItems[idx]||{}).productionCompleted)
    }));
    o.status=existing?.status||'COMERCIAL';
    o.commercial=o.commercial||{completedAt:null,completedBy:null};
    o.pcp=o.pcp||{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false};
    o.logistics=o.logistics||{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''};

    if(finalize){
      const errors=validateCommercial(o);
      if(errors.length){alert('Antes de finalizar o Comercial, preencha:\n\n• '+errors.join('\n• '));return false}
      o.commercial.completedAt=Date.now();
      o.commercial.completedBy=window.FocadoAuth?.getUser?.()?.name||'Comercial';
    }else if(isCorrection){
      o.lastCorrection={at:Date.now(),by:window.FocadoAuth?.getUser?.()?.name||window.FocadoAuth?.roleLabel?.()||'Usuário',status:o.status};
    }

    const event={
      at:Date.now(),
      text:isNew?'Pedido criado pelo Comercial':finalize?'Comercial finalizado · pedido enviado ao PCP':isCorrection?'Pedido corrigido após envio · etapa mantida em '+stage(o.status)[0]:'Rascunho comercial salvo',
      user:window.FocadoAuth?.getUser?.()?.name||sessionStorage.getItem('nova-era-role-label')||'Usuário'
    };

    let result;
    if(window.FocadoDataStore?.isRemoteReady?.()){
      if(isNew){
        o.events=[event,...(o.events||[])];
        result=await window.FocadoDataStore.saveDomain('COMERCIAL',{createOrder:o},o.id);
      }else{
        result=await window.FocadoDataStore.saveDomain('COMERCIAL',{
          ...data,
          items:o.items,
          commercial:o.commercial,
          ...(isCorrection?{lastCorrection:o.lastCorrection}:{}),
          event
        },o.id);
      }
    }else{
      alert('Não foi possível salvar: o Focado precisa estar conectado ao servidor para registrar pedidos.');
      return false;
    }

    if(!result?.ok){
      if(result?.mode==='conflict')alert('O pedido mudou em outro acesso. Os dados foram protegidos; atualize a tela e tente novamente.');
      else alert('Não foi possível confirmar a gravação no servidor. Nenhuma alteração foi considerada concluída.');
      return false;
    }
    if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);

    if(finalize){
      const tr=await window.FocadoDataStore.transitionOrder(o.id);
      if(!tr?.ok){
        alert(tr?.code==='TRANSITION_BLOCKED'?('Pedido salvo, mas o envio ao PCP foi bloqueado: '+tr.error):'Pedido salvo, mas não foi possível enviá-lo ao PCP. Atualize e tente novamente.');
        return false;
      }
    }

    window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{key:KEY}}));
    if(!silentNavigate){
      if(finalize)render({q:'',stage:'PCP'});
      else if(isCorrection){correctionMode=false;renderForm((load().orders||[]).find(x=>x.id===o.id)||o,load())}
      else{
        render({q:'',stage:'TODOS'});
        requestAnimationFrame(()=>document.getElementById('foDrafts')?.scrollIntoView({behavior:'smooth',block:'start'}));
      }
    }
    return true;
    }finally{persistInFlight=false}
  }

  function history(o){
    const events=(o.events||[]).slice(0,12);
    return '<div class="fo-card"><h2>Histórico do pedido</h2>'+(events.length?'<div class="fo-history">'+events.map(e=>'<div class="fo-history-row"><span>'+dbr(new Date(e.at).toISOString().slice(0,10))+'</span><div><b>'+esc(e.text||'')+'</b><small>'+esc(e.user||'')+(e.at?' · '+new Date(e.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</small></div></div>').join('')+'</div>':'<div class="fo-empty compact">Ainda não há movimentações neste pedido.</div>')+'</div>';
  }

  function ordersInPeriod(from,to){
    return (load().orders||[]).filter(o=>o.orderDate&&o.orderDate>=from&&o.orderDate<=to).sort((a,b)=>String(a.orderDate).localeCompare(String(b.orderDate))||String(a.number).localeCompare(String(b.number)));
  }
  function renderReport(from,to){
    const rows=ordersInPeriod(from,to),total=rows.reduce((s,o)=>s+value(o),0);
    content().innerHTML='<div class="fo-page"><div class="fo-head"><div><button class="fo-back" id="foBackOrders">← Pedidos</button><h1>Listagem de Pedidos</h1><p>Por padrão, o mês atual. Escolha qualquer período para consulta e exportação.</p></div><div class="fo-actions"><button class="fo-btn secondary" id="foEmail">E-mail</button><button class="fo-btn secondary" id="foWhatsapp">WhatsApp</button><button class="fo-btn primary" id="foExcel">Baixar Excel</button></div></div>'+
      '<div class="fo-period"><label><span>De</span><input type="date" id="foFrom" value="'+esc(from)+'"></label><label><span>Até</span><input type="date" id="foTo" value="'+esc(to)+'"></label><div><span>Pedidos</span><strong>'+rows.length+'</strong></div><div><span>Total</span><strong>'+money(total)+'</strong></div></div>'+
      '<div class="fo-table-wrap">'+reportTable(rows)+'</div></div>';
    document.getElementById('foBackOrders').onclick=()=>render(currentFilters);
    const a=document.getElementById('foFrom'),b=document.getElementById('foTo');a.onchange=b.onchange=()=>renderReport(a.value,b.value);
    document.getElementById('foExcel').onclick=()=>downloadExcel(rows,from,to);
    document.getElementById('foEmail').onclick=()=>shareReport('email',rows,from,to);
    document.getElementById('foWhatsapp').onclick=()=>shareReport('whatsapp',rows,from,to);
  }
  function reportTable(rows){
    if(!rows.length)return '<div class="fo-empty">Nenhum pedido no período selecionado.</div>';
    return '<table class="fo-table fo-report-table"><thead><tr><th>Data</th><th>Pedido</th><th>CNPJ</th><th>Cliente</th><th>Representante</th><th>Frete</th><th>Orç. logística</th><th>Status</th><th>Itens</th><th>Valor</th></tr></thead><tbody>'+rows.map(o=>'<tr><td>'+dbr(o.orderDate)+'</td><td><b>'+esc(o.number)+'</b></td><td>'+esc(formatCnpj(o.cnpj))+'</td><td>'+esc(o.client)+'</td><td>'+esc(o.representative||'—')+'</td><td>'+esc(o.freightType||'—')+'</td><td>'+money(o.logisticsBudget)+'</td><td>'+esc(stage(o.status)[0])+'</td><td>'+((o.items||[]).map(i=>esc(i.code+' - '+i.name+' ('+i.qty+')')).join('<br>'))+'</td><td>'+money(value(o))+'</td></tr>').join('')+'</tbody></table>';
  }
  function reportWorkbook(rows,from,to){
    const table='<table><tr><th>Data</th><th>Pedido</th><th>CNPJ</th><th>Cliente</th><th>Representante</th><th>Cidade</th><th>UF</th><th>Frete</th><th>Orçamento logística</th><th>Status</th><th>Itens</th><th>Valor</th></tr>'+rows.map(o=>'<tr><td>'+esc(o.orderDate)+'</td><td>'+esc(o.number)+'</td><td>'+esc(formatCnpj(o.cnpj))+'</td><td>'+esc(o.client)+'</td><td>'+esc(o.representative||'')+'</td><td>'+esc(o.city||'')+'</td><td>'+esc(o.uf||'')+'</td><td>'+esc(o.freightType||'')+'</td><td>'+Number(o.logisticsBudget||0).toFixed(2)+'</td><td>'+esc(stage(o.status)[0])+'</td><td>'+esc((o.items||[]).map(i=>i.code+' - '+i.name+' x '+i.qty).join(' | '))+'</td><td>'+value(o).toFixed(2)+'</td></tr>').join('')+'</table>';
    return '<html><head><meta charset="UTF-8"></head><body><h2>Focado - Pedidos '+esc(from)+' a '+esc(to)+'</h2>'+table+'</body></html>';
  }
  function reportFile(rows,from,to){
    const blob=new Blob(['\ufeff'+reportWorkbook(rows,from,to)],{type:'application/vnd.ms-excel;charset=utf-8'});
    return new File([blob],'Focado_Pedidos_'+from+'_a_'+to+'.xls',{type:'application/vnd.ms-excel'});
  }
  function downloadExcel(rows,from,to){
    const file=reportFile(rows,from,to),url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function reportSummary(rows,from,to){
    const total=rows.reduce((s,o)=>s+value(o),0);
    return 'Focado — Pedidos de '+dbr(from)+' a '+dbr(to)+'\nPedidos: '+rows.length+'\nTotal: '+money(total);
  }
  async function shareReport(kind,rows,from,to){
    if(!rows.length){alert('Não há pedidos no período para compartilhar.');return}
    const file=reportFile(rows,from,to),text=reportSummary(rows,from,to);
    try{
      if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Focado - Relatório de Pedidos',text});return}
    }catch(e){if(e?.name==='AbortError')return}
    downloadExcel(rows,from,to);
    if(kind==='email')window.location.href='mailto:?subject='+encodeURIComponent('Focado - Relatório de Pedidos')+'&body='+encodeURIComponent(text+'\n\nO arquivo Excel foi baixado para ser anexado.');
    else window.open('https://wa.me/?text='+encodeURIComponent(text+'\n\nO arquivo Excel foi baixado para envio.'),'_blank');
  }

  function isFormOpen(){return Boolean(document.getElementById('foOrderForm'))}
  window.FocadoOrders={render,openOrder:openForm,openNew:()=>openForm(),renderReport,isFormOpen};
})();