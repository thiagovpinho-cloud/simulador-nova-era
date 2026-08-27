(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const totalQty=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0);
  const orderValue=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  let filters={q:'',base:'TODAS'};

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
  function basesOf(o){return [...new Set((o.items||[]).map(i=>i.deliveryBase).filter(Boolean))]}

  function render(state){
    filters=state||filters;
    const ops=ensureOrderIds(load());
    const all=(ops.orders||[]).filter(o=>o.status==='PCP'||o.status==='LOGISTICA');
    const knownBases=['SENIR','GREENTECH','TOPLAND'];
    const rows=all.filter(o=>{
      const q=filters.q.toLowerCase();
      const match=!q||[o.number,o.client,o.cnpj,o.city,o.representative,(o.items||[]).map(i=>i.name+' '+i.code).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const byBase=filters.base==='TODAS'||basesOf(o).includes(filters.base);
      return match&&byBase;
    });
    const awaiting=all.filter(o=>o.status==='PCP').length;
    const ready=all.filter(o=>o.status==='PCP'&&planningStatus(o)[1]==='ready').length;
    const done=all.filter(o=>o.status==='LOGISTICA').length;
    const reserved=all.reduce((s,o)=>s+(o.items||[]).reduce((a,i)=>a+Number(i.reservedQty||0),0),0);
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><h1>PCP</h1><p>Estoque real por código · reserva · disponibilidade · base de retirada</p></div></div>'+
      '<div class="fpcp-kpis">'+kpi('Aguardando análise',awaiting,'pedidos recebidos do Comercial')+kpi('Prontos para liberar',ready,'itens atendidos ou cortados')+kpi('PCP concluído',done,'enviados para Logística')+kpi('Reservado',reserved+' cx','estoque comprometido com pedidos')+'</div>'+
      '<div class="fpcp-guide"><b>Como operar:</b><span>1. Abra o pedido</span><span>2. Confira o saldo atual</span><span>3. Reserve total ou parcialmente</span><span>4. Informe previsão do saldo ou corte</span><span>5. Defina a base por item e libere</span></div>'+
      '<div class="fpcp-toolbar"><input class="fpcp-search" id="fpSearch" placeholder="Buscar pedido, cliente, CNPJ, representante ou produto" value="'+esc(filters.q)+'"><select class="fpcp-select" id="fpBase"><option value="TODAS">Todas as bases</option>'+knownBases.map(b=>'<option value="'+b+'" '+(filters.base===b?'selected':'')+'>'+b+'</option>').join('')+'</select><span class="fpcp-muted">'+rows.length+' pedido(s)</span></div>'+
      '<div class="fpcp-table-wrap">'+table(rows)+'</div></div>';
    const q=document.getElementById('fpSearch'),base=document.getElementById('fpBase');let t;
    q.oninput=()=>{clearTimeout(t);t=setTimeout(()=>render({q:q.value,base:base.value}),180)};
    base.onchange=()=>render({q:q.value,base:base.value});
    document.querySelectorAll('[data-fpcp-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.fpcpOpen||b.dataset.fpcpNumber));
  }
  function kpi(a,b,c){return '<div class="fpcp-kpi"><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></div>'}
  function table(rows){
    if(!rows.length)return '<div class="fpcp-empty">Nenhum pedido aguardando PCP para os filtros atuais.</div>';
    return '<table class="fpcp-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Valor</th><th>Base(s)</th><th>Status PCP</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const st=planningStatus(o);
      return '<tr><td><div class="fpcp-order">'+esc(o.number)+'</div></td><td><div class="fpcp-client">'+esc(o.client||'—')+'</div><div class="fpcp-muted">'+esc([o.city,o.uf].filter(Boolean).join('/'))+'</div></td><td>'+dbr(o.orderDate)+'</td><td>'+((o.items||[]).length)+'<div class="fpcp-muted">'+totalQty(o)+' cx</div></td><td>'+money(orderValue(o))+'</td><td>'+esc(basesOf(o).join(', ')||'—')+'</td><td><span class="fpcp-status '+st[1]+'">'+st[0]+'</span></td><td><button class="fpcp-open" data-fpcp-open="'+esc(o.id||o.number)+'" data-fpcp-number="'+esc(o.number||'')+'">'+(o.status==='PCP'?'Planejar':'Consultar')+'</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function openOrder(id){
    const ops=ensureOrderIds(load()),key=String(id||'');
    const o=(ops.orders||[]).find(x=>String(x.id||'')===key||String(x.number||'')===key);
    if(!o){alert('Não foi possível abrir este pedido. A lista será atualizada.');render(filters);return}
    renderDetail(o,ops);
  }
  function renderDetail(o,ops){
    const editable=o.status==='PCP',st=planningStatus(o);
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><button class="fpcp-back" id="fpBack">← Fila PCP</button><h1>PCP · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+' · '+esc([o.city,o.uf].filter(Boolean).join('/'))+'</p></div><div class="fpcp-actions">'+
        (editable?'<button class="fpcp-btn secondary" id="fpSave">Salvar planejamento</button><button class="fpcp-btn primary" id="fpFinish">Liberar PCP → Operação</button>':'<span class="fpcp-status done">PCP concluído</span>')+
      '</div></div>'+
      '<div class="fpcp-flowline"><span class="done">Comercial ✓</span><i>→</i><span class="'+(editable?'active':'done')+'">PCP'+(editable?'':' ✓')+'</span><i>→</i><span class="'+(!editable?'active':'')+'">Produção / Estoque</span><i>→</i><span>Logística</span></div>'+
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
    btn.textContent='Liberar PCP → Operação';
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