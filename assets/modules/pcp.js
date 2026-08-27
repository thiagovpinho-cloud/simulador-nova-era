(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const totalQty=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0);
  const prodQty=o=>(o.items||[]).filter(i=>i.source==='PRODUCAO').reduce((s,i)=>s+(Number(i.qty)||0),0);
  const stockQty=o=>(o.items||[]).filter(i=>i.source==='ESTOQUE').reduce((s,i)=>s+(Number(i.qty)||0),0);
  const orderValue=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  let filters={q:'',base:'TODAS'};

  function ensureOrderIds(ops){
    let changed=false;
    const used=new Set((ops.orders||[]).map(o=>String(o.id||'')).filter(Boolean));
    (ops.orders||[]).forEach((o,index)=>{
      if(o.id)return;
      const base=String(o.number||('pedido-'+(index+1))).replace(/[^a-zA-Z0-9_-]/g,'_');
      let candidate='op_'+base, n=2;
      while(used.has(candidate)){candidate='op_'+base+'_'+n;n++}
      o.id=candidate;used.add(candidate);changed=true;
      o.events=Array.isArray(o.events)?o.events:[];
      o.events.unshift({at:Date.now(),text:'Identificador interno do pedido normalizado automaticamente',user:'Sistema'});
    });
    if(changed){
      if(window.FocadoDataStore?.writeLocal)window.FocadoDataStore.writeLocal(ops);
      window.FocadoDataStore?.save?.(ops);
    }
    return ops;
  }

  function finishedAvailable(ops,item){
    const inv=(ops.inventory||{})[String(item.code||item.productId||item.name)]||(ops.inventory||{})[String(item.code||'')]||null;
    if(!inv)return 0;
    return Math.max(0,Number(inv.physical||0)-Number(inv.reserved||0)-Number(inv.blocked||0));
  }
  function planningStatus(o){
    if(o.status==='ESTOQUE_PRODUCAO')return ['PCP concluído','done'];
    if((o.items||[]).some(i=>!['ESTOQUE','PRODUCAO'].includes(i.source)))return ['Definir atendimento','attention'];
    if(!o.pcp?.deliveryBase)return ['Definir base','attention'];
    if(prodQty(o)>0&&!o.pcp?.availableDate)return ['Definir disponibilidade','attention'];
    return ['Pronto para finalizar','ready'];
  }
  function render(state){
    filters=state||filters;
    const ops=ensureOrderIds(load());
    const all=(ops.orders||[]).filter(o=>o.status==='PCP'||o.status==='ESTOQUE_PRODUCAO');
    const rows=all.filter(o=>{
      const q=filters.q.toLowerCase();
      const match=!q||[o.number,o.client,o.cnpj,o.city,o.representative,(o.items||[]).map(i=>i.name).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const byBase=filters.base==='TODAS'||o.pcp?.deliveryBase===filters.base;
      return match&&byBase;
    });
    const awaiting=all.filter(o=>o.status==='PCP').length;
    const ready=all.filter(o=>o.status==='PCP'&&planningStatus(o)[1]==='ready').length;
    const done=all.filter(o=>o.status==='ESTOQUE_PRODUCAO').length;
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><h1>PCP</h1><p>Pedidos recebidos do Comercial · planejar disponibilidade e atendimento</p></div></div>'+
      '<div class="fpcp-kpis">'+
        kpi('Aguardando análise',awaiting,'pedidos recebidos do Comercial')+
        kpi('Prontos para finalizar',ready,'planejamento completo')+
        kpi('PCP concluído',done,'enviados para operação')+
        kpi('Volume em produção',all.reduce((s,o)=>s+prodQty(o),0)+' cx','carteira atual')+
        kpi('Volume por estoque',all.reduce((s,o)=>s+stockQty(o),0)+' cx','carteira atual')+
      '</div>'+
      '<div class="fpcp-guide"><b>Como operar:</b><span>1. Abra um pedido</span><span>2. Confira estoque por item</span><span>3. Defina Estoque ou Produção</span><span>4. Informe base e disponibilidade</span><span>5. Finalize o PCP</span></div>'+
      '<div class="fpcp-toolbar"><input class="fpcp-search" id="fpSearch" placeholder="Buscar pedido, cliente, CNPJ, representante ou produto" value="'+esc(filters.q)+'"><select class="fpcp-select" id="fpBase"><option value="TODAS">Todas as bases</option>'+['SENIR','GREENTECH','TOPLAND'].map(b=>'<option value="'+b+'" '+(filters.base===b?'selected':'')+'>'+b+'</option>').join('')+'</select><span class="fpcp-muted">'+rows.length+' pedido(s)</span></div>'+
      '<div class="fpcp-table-wrap">'+table(rows)+'</div></div>';
    const q=document.getElementById('fpSearch'),base=document.getElementById('fpBase');let t;
    q.oninput=()=>{clearTimeout(t);t=setTimeout(()=>render({q:q.value,base:base.value}),180)};
    base.onchange=()=>render({q:q.value,base:base.value});
    document.querySelectorAll('[data-fpcp-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.fpOpen));
  }
  function kpi(a,b,c){return '<div class="fpcp-kpi"><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></div>'}
  function table(rows){
    if(!rows.length)return '<div class="fpcp-empty">Nenhum pedido aguardando PCP para os filtros atuais.</div>';
    return '<table class="fpcp-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Valor</th><th>Base</th><th>Disponível</th><th>Status PCP</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const st=planningStatus(o);
      return '<tr><td><div class="fpcp-order">'+esc(o.number)+'</div></td><td><div class="fpcp-client">'+esc(o.client||'—')+'</div><div class="fpcp-muted">'+esc([o.city,o.uf].filter(Boolean).join('/'))+'</div></td><td>'+dbr(o.orderDate)+'</td><td>'+((o.items||[]).length)+'<div class="fpcp-muted">'+totalQty(o)+' cx</div></td><td>'+money(orderValue(o))+'</td><td>'+esc(o.pcp?.deliveryBase||'—')+'</td><td>'+dbr(o.pcp?.availableDate)+'</td><td><span class="fpcp-status '+st[1]+'">'+st[0]+'</span></td><td><button class="fpcp-open" data-fpcp-open="'+esc(o.id||o.number)+'" data-fpcp-number="'+esc(o.number||'')+'">'+(o.status==='PCP'?'Planejar':'Consultar')+'</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function openOrder(id){
    const ops=ensureOrderIds(load());
    const key=String(id||'');
    const o=(ops.orders||[]).find(x=>String(x.id||'')===key || String(x.number||'')===key);
    if(!o){
      alert('Não foi possível abrir este pedido. A lista será atualizada.');
      render(filters);
      return;
    }
    renderDetail(o,ops);
  }
  function renderDetail(o,ops){
    const editable=o.status==='PCP';
    const st=planningStatus(o);
    content().innerHTML='<div class="fpcp-page">'+
      '<div class="fpcp-head"><div><button class="fpcp-back" id="fpBack">← Fila PCP</button><h1>PCP · '+esc(o.number)+'</h1><p>'+esc(o.client||'')+' · '+esc([o.city,o.uf].filter(Boolean).join('/'))+'</p></div><div class="fpcp-actions">'+
        (editable?'<button class="fpcp-btn secondary" id="fpSave">Salvar planejamento</button><button class="fpcp-btn primary" id="fpFinish">Finalizar PCP → Operação</button>':'<span class="fpcp-status done">PCP concluído</span>')+
      '</div></div>'+
      '<div class="fpcp-flowline"><span class="done">Comercial ✓</span><i>→</i><span class="'+(editable?'active':'done')+'">PCP'+(editable?'':' ✓')+'</span><i>→</i><span class="'+(!editable?'active':'')+'">Produção / Estoque</span><i>→</i><span>Logística</span></div>'+
      '<div class="fpcp-commercial-readonly"><h2>Dados recebidos do Comercial</h2><div class="fpcp-read-grid">'+read('Cliente',o.client)+read('CNPJ',o.cnpj)+read('Representante',o.representative)+read('Data do pedido',dbr(o.orderDate))+read('Entrega solicitada',dbr(o.requestedDeliveryDate))+read('Frete',o.freightType)+read('Condição de pagamento',o.paymentTerms)+read('Local de entrega',o.deliveryAddress)+'</div></div>'+
      '<div class="fpcp-panel"><div class="fpcp-panel-head"><div><h2>1. Atendimento dos itens</h2><p>O estoque mostrado é o saldo disponível atual de produto acabado.</p></div><span class="fpcp-status '+st[1]+'">'+st[0]+'</span></div>'+
        '<div class="fpcp-item-table-wrap"><table class="fpcp-item-table"><thead><tr><th>Código</th><th>Produto</th><th>Pedido</th><th>Estoque disponível</th><th>Atendimento PCP</th><th>Observação</th></tr></thead><tbody>'+
          (o.items||[]).map((i,n)=>itemRow(i,n,finishedAvailable(ops,i),editable)).join('')+
        '</tbody></table></div></div>'+
      '<div class="fpcp-panel"><h2>2. Planejamento e disponibilidade</h2><div class="fpcp-form-grid">'+
        select('Base de entrega / produção','deliveryBase',o.pcp?.deliveryBase||'',["","SENIR","GREENTECH","TOPLAND"],editable)+
        input('Data de início de produção','productionDate',o.pcp?.productionDate||'','date',editable)+
        input('Data disponível para expedição','availableDate',o.pcp?.availableDate||'','date',editable)+
        input('Quantidade programada (cx)','scheduledQty',o.pcp?.scheduledQty||'','number',editable)+
        '<label class="fpcp-field wide"><span>Observações do PCP</span><textarea id="fpNotes" '+(editable?'':'disabled')+'>'+esc(o.pcp?.notes||'')+'</textarea></label>'+
      '</div><div class="fpcp-help">Se todos os itens forem atendidos por estoque, a data disponível continua sendo útil para informar quando o pedido estará realmente liberado para a Logística.</div></div>'+
      history(o)+'</div>';
    document.getElementById('fpBack').onclick=()=>render(filters);
    if(editable){
      document.getElementById('fpSave').onclick=()=>savePlanning(o,false);
      document.getElementById('fpFinish').onclick=()=>savePlanning(o,true);
    }
  }
  function read(a,b){return '<div><span>'+a+'</span><b>'+esc(b||'—')+'</b></div>'}
  function select(label,id,val,options,editable){
    return '<label class="fpcp-field"><span>'+label+'</span><select id="fp_'+id+'" '+(editable?'':'disabled')+'>'+options.map(x=>'<option value="'+esc(x)+'" '+(String(val)===x?'selected':'')+'>'+(x||'Selecione')+'</option>').join('')+'</select></label>';
  }
  function input(label,id,val,type,editable){
    return '<label class="fpcp-field"><span>'+label+'</span><input id="fp_'+id+'" type="'+type+'" value="'+esc(val||'')+'" '+(editable?'':'disabled')+'></label>';
  }
  function itemRow(i,n,av,editable){
    const shortage=Number(i.qty||0)>av;
    return '<tr data-pcp-item data-key="'+esc(i.id||i.code||i.productId||'')+'"><td><b>'+esc(i.code||'—')+'</b></td><td>'+esc(i.name||'—')+'</td><td><b>'+Number(i.qty||0)+' cx</b></td><td><span class="fpcp-stock '+(shortage?'low':'ok')+'">'+av+' cx</span></td><td><select data-source '+(editable?'':'disabled')+'><option value="">Definir</option><option value="ESTOQUE" '+(i.source==='ESTOQUE'?'selected':'')+'>Estoque</option><option value="PRODUCAO" '+(i.source==='PRODUCAO'?'selected':'')+'>Produção</option></select></td><td class="fpcp-item-note">'+(shortage?'Estoque menor que o pedido':'Saldo suficiente para estoque')+'</td></tr>';
  }
  function collectChanges(o,ops){
    const items=[...document.querySelectorAll('[data-pcp-item]')].map(r=>({id:r.dataset.key,source:r.querySelector('[data-source]').value}));
    return {
      pcp:{
        deliveryBase:document.getElementById('fp_deliveryBase').value,
        productionDate:document.getElementById('fp_productionDate').value,
        availableDate:document.getElementById('fp_availableDate').value,
        scheduledQty:Number(document.getElementById('fp_scheduledQty').value)||0,
        notes:document.getElementById('fpNotes').value.trim()
      },
      items
    };
  }
  function validate(o,ops,changes){
    const errors=[];
    if(!changes.pcp.deliveryBase)errors.push('Defina a base de entrega / produção.');
    for(const incoming of changes.items){
      if(!['ESTOQUE','PRODUCAO'].includes(incoming.source))errors.push('Defina Estoque ou Produção para todos os itens.');
      if(incoming.source==='ESTOQUE'){
        const item=(o.items||[]).find(i=>String(i.id||i.code||i.productId||'')===String(incoming.id));
        if(item&&finishedAvailable(ops,item)<Number(item.qty||0))errors.push('O item '+(item.name||item.code)+' não possui estoque suficiente para atendimento por estoque.');
      }
    }
    if(changes.items.some(i=>i.source==='PRODUCAO')&&!changes.pcp.availableDate)errors.push('Informe a data disponível para os itens que serão produzidos.');
    return [...new Set(errors)];
  }
  async function savePlanning(o,finish){
    const ops=load(),changes=collectChanges(o,ops);
    const errors=validate(o,ops,changes);
    if(finish&&errors.length){alert('Antes de finalizar o PCP:\n\n• '+errors.join('\n• '));return}
    let result;
    if(window.FocadoDataStore?.isRemoteReady?.()){
      result=await window.FocadoDataStore.saveDomain('PCP',changes,o.id);
      if(!result?.ok){alert('Não foi possível salvar o planejamento do PCP. '+(result?.error||''));return}
      if(finish){
        const tr=await window.FocadoDataStore.transitionOrder(o.id);
        if(!tr?.ok){alert('O PCP não pôde ser finalizado: '+(tr?.code||tr?.error||'verifique os campos obrigatórios.'));return}
      }
      await window.FocadoDataStore.load();
    }else{
      const current=(ops.orders||[]).find(x=>String(x.id)===String(o.id));
      if(!current)return;
      current.pcp={...(current.pcp||{}),...changes.pcp};
      changes.items.forEach(incoming=>{const item=(current.items||[]).find(i=>String(i.id||i.code||i.productId||'')===String(incoming.id));if(item)item.source=incoming.source});
      current.events=Array.isArray(current.events)?current.events:[];
      current.events.unshift({at:Date.now(),text:finish?'PCP finalizado':'Planejamento PCP salvo',user:window.FocadoAuth?.getUser?.()?.name||'PCP'});
      if(finish)current.status='ESTOQUE_PRODUCAO';
      await window.FocadoDataStore?.save?.(ops);
    }
    window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{source:'pcp'}}));
    if(finish)render({q:'',base:'TODAS'});else{
      const fresh=load(),updated=(fresh.orders||[]).find(x=>String(x.id)===String(o.id));if(updated)renderDetail(updated,fresh);
    }
  }
  function history(o){
    const events=(o.events||[]).slice(0,8);
    return '<div class="fpcp-panel"><h2>Histórico</h2>'+(events.length?'<div class="fpcp-history">'+events.map(e=>'<div><span>'+dbr(new Date(e.at).toISOString().slice(0,10))+'</span><p><b>'+esc(e.text||e.type||'Movimentação')+'</b><small>'+esc(e.user||'')+'</small></p></div>').join('')+'</div>':'<div class="fpcp-empty small">Nenhuma movimentação registrada.</div>')+'</div>';
  }

  window.FocadoPCP={render,openOrder};
})();