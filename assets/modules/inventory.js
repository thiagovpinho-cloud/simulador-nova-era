(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const fmt=(v,d=0)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const today=()=>new Date().toISOString().slice(0,10);
  const avail=inv=>Math.max(0,Number(inv?.physical||0)-Number(inv?.reserved||0)-Number(inv?.blocked||0));
  let viewState={tab:'finished',q:'',filter:'TODOS'};

  function catalog(ops){return window.FocadoProducts?.getCatalog?.(ops)||[]}
  function bases(ops){
    const found=Object.keys(ops.productionBases||{});
    return [...new Set(['SENIR','GREENTECH','TOPLAND',...found])];
  }
  const normKey=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  function productKey(p){return normKey(p.brand||'sem-marca')+'::'+normKey(p.code||p.id||p.name)}
  function ensureFinished(ops,p,unit='CX'){
    ops.inventory=ops.inventory||{};
    const exact=ops.inventory[productKey(p)];
    if(exact)return [productKey(p),exact];
    const found=Object.entries(ops.inventory).find(([,v])=>String(v?.code||'')===String(p.code||'')&&String(v?.brand||'')===String(p.brand||''));
    if(found)return found;
    const key=productKey(p);
    ops.inventory[key]={code:p.code||'',name:p.name||'',brand:p.brand||'',unit,physical:0,reserved:0,blocked:0,bases:{}};
    return [key,ops.inventory[key]];
  }
  function status(inv){
    if(Number(inv?.blocked||0)>0)return ['Bloqueado','block'];
    return ['Normal','ok'];
  }
  async function mutateFinished(mutator){
    for(let attempt=0;attempt<2;attempt++){
      if(attempt)await window.FocadoDataStore?.load?.();
      const ops=structuredClone(load());
      ops.inventory=ops.inventory||{};ops.stockMovements=Array.isArray(ops.stockMovements)?ops.stockMovements:[];ops.inventoryCounts=Array.isArray(ops.inventoryCounts)?ops.inventoryCounts:[];
      const ok=mutator(ops);if(ok===false)return {ok:false,cancelled:true};
      window.FocadoDataStore?.writeLocal?.(ops);
      const result=window.FocadoDataStore?.isRemoteReady?.()
        ?await window.FocadoDataStore.saveDomain('ESTOQUE',{inventory:ops.inventory,stockMovements:ops.stockMovements,inventoryCounts:ops.inventoryCounts},null)
        :await window.FocadoDataStore?.save?.(ops);
      if(result?.ok!==false&&result?.mode!=='conflict'){if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);return result||{ok:true}}
      if(result?.mode!=='conflict')return result;
    }
    return {ok:false,mode:'conflict'};
  }

  function render(state){
    viewState=state||viewState;
    const ops=load(),finished=Object.entries(ops.inventory||{});
    const rows=finished.filter(([,inv])=>{
      const q=String(viewState.q||'').toLowerCase();
      return !q||[inv.name,inv.code,inv.brand,inv.warehouse].some(v=>String(v||'').toLowerCase().includes(q));
    });
    const totalPhysical=finished.reduce((s,[,i])=>s+Number(i.physical||0),0);
    const totalReserved=finished.reduce((s,[,i])=>s+Number(i.reserved||0),0);
    const totalBlocked=finished.reduce((s,[,i])=>s+Number(i.blocked||0),0);
    const totalAvailable=finished.reduce((s,[,i])=>s+avail(i),0);
    content().innerHTML='<div class="fi-page">'+
      '<div class="fi-head"><div><h1>Estoque</h1><p>Saldo de produto acabado: entradas + inventários − quebras − saídas de vendas</p></div><div class="fi-actions"><button class="fi-btn primary" id="fiInv">Inventário</button><button class="fi-btn primary" id="fiMov">Movimentações / Reposições</button></div></div>'+
      '<div class="fi-kpis"><div class="fi-kpi"><span>Físico</span><strong>'+fmt(totalPhysical)+'</strong><small>saldo total</small></div><div class="fi-kpi"><span>Reservado</span><strong>'+fmt(totalReserved)+'</strong><small>comprometido com pedidos</small></div><div class="fi-kpi"><span>Bloqueado</span><strong>'+fmt(totalBlocked)+'</strong><small>não disponível</small></div><div class="fi-kpi"><span>Disponível</span><strong>'+fmt(totalAvailable)+'</strong><small>físico − reservado − bloqueado</small></div></div>'+
      '<div class="fi-grid"><div class="fi-panel"><h2>Regra do saldo</h2><div class="fi-alert"><div class="fi-alert-icon">+</div><div><b>Entradas</b><small>produção recebida em Movimentações / Reposições e inventários realizados</small></div></div><div class="fi-alert"><div class="fi-alert-icon">−</div><div><b>Saídas</b><small>pedidos de venda, bonificações, doações e quebras</small></div></div></div><div class="fi-panel"><h2>Histórico</h2><div class="fi-alert"><div class="fi-alert-icon">↕</div><div><b>'+((ops.stockMovements||[]).length)+' movimentações</b><small>rastreabilidade completa</small></div></div><div class="fi-alert"><div class="fi-alert-icon">✓</div><div><b>'+((ops.inventoryCounts||[]).length)+' inventários</b><small>lançamentos físicos preservados</small></div></div></div></div>'+
      '<div class="fi-toolbar"><input class="fi-search" id="fiSearch" placeholder="Buscar produto, código ou marca" value="'+esc(viewState.q||'')+'"><span class="fi-muted">'+rows.length+' produto(s) com saldo cadastrado</span></div>'+
      '<div class="fi-table-wrap">'+stockTable(rows)+'</div></div>';
    document.getElementById('fiInv').onclick=renderInventoryEntry;
    document.getElementById('fiMov').onclick=renderMovementEntry;
    document.getElementById('fiSearch').oninput=e=>render({...viewState,q:e.target.value});
    document.querySelectorAll('[data-fi-open]').forEach(b=>b.onclick=()=>openItem(b.dataset.fiOpen));
  }

  function stockTable(rows){
    if(!rows.length)return '<div class="fi-empty">Ainda não há saldo de produtos acabados. Use Inventário ou Movimentações / Reposições para alimentar o estoque.</div>';
    return '<table class="fi-table"><thead><tr><th>Produto</th><th>Unidade</th><th>Físico</th><th>Reservado</th><th>Bloqueado</th><th>Disponível</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(([key,i])=>{const st=status(i);return '<tr><td><div class="fi-item">'+esc(i.name||key)+'</div><div class="fi-muted">'+esc(i.code||'')+(i.brand?' · '+esc(i.brand):'')+'</div></td><td>'+esc(i.unit||'CX')+'</td><td>'+fmt(i.physical)+'</td><td>'+fmt(i.reserved)+'</td><td>'+fmt(i.blocked)+'</td><td><span class="fi-stock good">'+fmt(avail(i))+'</span></td><td><span class="fi-chip '+st[1]+'">'+st[0]+'</span></td><td><button class="fi-open" data-fi-open="'+esc(key)+'">Abrir</button></td></tr>'}).join('')+'</tbody></table>';
  }

  function back(){return '<button class="fi-btn primary" id="fiBack">← Estoque</button>'}
  function bindBack(){document.getElementById('fiBack').onclick=()=>render({tab:'finished',q:'',filter:'TODOS'})}

  function renderInventoryEntry(){
    const ops=load(),products=catalog(ops).slice().sort((a,b)=>String(a.brand).localeCompare(String(b.brand))||String(a.name).localeCompare(String(b.name)));
    content().innerHTML='<div class="fi-page">'+
      '<div class="fi-head"><div>'+back()+'<h1 style="margin-top:12px">Inventário de Produtos Acabados</h1><p>Todo volume inventariado soma ao estoque; toda quebra informada é abatida.</p></div><button class="fi-btn primary" id="fiSaveInventory">Finalizar inventário</button></div>'+
      '<div class="fi-panel"><div class="fi-grid"><label class="fi-field"><span>Base inventariada</span><select id="fiInvBase">'+bases(ops).map(b=>'<option>'+esc(b)+'</option>').join('')+'</select></label><label class="fi-field"><span>Data do inventário</span><input id="fiInvDate" type="date" value="'+today()+'"></label></div></div>'+
      '<div class="fi-panel"><h2>Produtos cadastrados</h2><p class="fi-note">Preencha somente os produtos contados. Quantidade inventariada será somada; quebra será subtraída.</p><div class="fi-table-wrap"><table class="fi-table"><thead><tr><th>Código</th><th>Produto</th><th>Marca</th><th>Quantidade inventariada</th><th>Medida</th><th>Quebra</th></tr></thead><tbody>'+
      products.map(p=>'<tr data-inv-product="'+esc(p.id)+'"><td><b>'+esc(p.code)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(p.brand||'')+'</td><td><input data-count type="number" min="0" step="1" placeholder="0"></td><td><select data-unit><option value="CX" '+((p.unit||'CX')==='CX'?'selected':'')+'>Caixas</option><option value="UN" '+((p.unit||'')==='UN'?'selected':'')+'>Unidades</option></select></td><td><input data-break type="number" min="0" step="1" placeholder="0"></td></tr>').join('')+
      '</tbody></table></div></div>'+
      '<div class="fi-panel"><h2>Observação geral</h2><textarea id="fiInvNote" class="fi-textarea" placeholder="Observações sobre a contagem, avarias, divergências etc."></textarea></div></div>';
    bindBack();
    document.getElementById('fiSaveInventory').onclick=()=>saveInventory(products);
  }

  async function saveInventory(products){
    const base=document.getElementById('fiInvBase').value,date=document.getElementById('fiInvDate').value,note=document.getElementById('fiInvNote').value.trim();
    if(!date){alert('Informe a data do inventário.');return}
    const rows=[...document.querySelectorAll('[data-inv-product]')].map(r=>({
      product:products.find(p=>p.id===r.dataset.invProduct),
      qty:Math.max(0,Number(r.querySelector('[data-count]').value)||0),
      unit:r.querySelector('[data-unit]').value,
      breakQty:Math.max(0,Number(r.querySelector('[data-break]').value)||0)
    })).filter(x=>x.product&&(x.qty>0||x.breakQty>0));
    if(!rows.length){alert('Informe ao menos uma quantidade inventariada ou uma quebra.');return}
    if(!confirm('Finalizar este inventário?\n\nOs volumes inventariados serão SOMADOS ao estoque e as quebras serão SUBTRAÍDAS.'))return;
    const batchId='inv_'+Date.now(),user=window.FocadoAuth?.getUser?.()?.name||'Estoque',at=new Date(date+'T12:00:00').getTime();
    const movements=[];
    for(const row of rows){
      const key=productKey(row.product);
      const current=(load().inventory||{})[key]||Object.values(load().inventory||{}).find(v=>
        String(v?.code||'')===String(row.product.code||'')&&String(v?.brand||'').trim().toLowerCase()===String(row.product.brand||'').trim().toLowerCase()
      )||{physical:0,reserved:0,blocked:0};
      if(row.breakQty>Number(current.physical||0)+row.qty){
        alert('A quebra de '+row.product.name+' é maior que o saldo disponível após o inventário.');
        return;
      }
      if(row.qty>0)movements.push({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),batchId,at,kind:'finished',key,
        code:row.product.code,name:row.product.name,brand:row.product.brand,unit:row.unit,type:'INVENTARIO_ENTRADA',
        qty:row.qty,deltaPhysical:row.qty,base,reason:'Inventário físico',note,user
      });
      if(row.breakQty>0)movements.push({
        id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),batchId,at,kind:'finished',key,
        code:row.product.code,name:row.product.name,brand:row.product.brand,unit:row.unit,type:'QUEBRA',
        qty:row.breakQty,deltaPhysical:-row.breakQty,base,reason:'Quebra informada no inventário',note,user
      });
    }
    const inventoryCount={id:batchId,at,date,base,note,user,mode:'ADITIVO',items:rows.map(r=>({
      productId:r.product.id,code:r.product.code,name:r.product.name,brand:r.product.brand,qty:r.qty,unit:r.unit,breakQty:r.breakQty
    }))};
    const result=await window.FocadoDataStore?.saveDomain?.('ESTOQUE',{movements,inventoryCount});
    if(!result?.ok){alert('Não foi possível salvar o inventário. Nenhuma movimentação foi confirmada.');return}
    if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);
    await window.FocadoDataStore?.refreshDomainV2?.('inventory');
    await window.FocadoDataStore?.refreshDomainV2?.('movements');
    alert('Inventário finalizado e estoque atualizado.');
    render();
  }

  function renderMovementEntry(){
    const ops=load(),products=catalog(ops).slice().sort((a,b)=>String(a.brand).localeCompare(String(b.brand))||String(a.name).localeCompare(String(b.name)));
    const history=(ops.stockMovements||[]).filter(m=>m.type==='ENTRADA_PRODUCAO').slice().sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,30);
    content().innerHTML='<div class="fi-page">'+
      '<div class="fi-head"><div>'+back()+'<h1 style="margin-top:12px">Movimentações / Reposições</h1><p>Entrada de produtos acabados recebidos das fábricas</p></div><button class="fi-btn primary" id="fiSaveMovement">Registrar entrada</button></div>'+
      '<div class="fi-panel"><h2>Nova entrada de produção</h2><div class="fi-form-grid">'+
        '<label class="fi-field"><span>Data de recebimento</span><input id="fiMovDate" type="date" value="'+today()+'"></label>'+
        '<label class="fi-field"><span>Base / fábrica de origem</span><select id="fiMovBase">'+bases(ops).map(b=>'<option>'+esc(b)+'</option>').join('')+'</select></label>'+
        '<label class="fi-field fi-span-2"><span>Produto</span><select id="fiMovProduct"><option value="">Selecione o produto</option>'+products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.code+' · '+p.name+' · '+p.brand)+'</option>').join('')+'</select></label>'+
        '<label class="fi-field"><span>Volume</span><input id="fiMovQty" type="number" min="1" step="1" placeholder="0"></label>'+
        '<label class="fi-field"><span>Medida</span><select id="fiMovUnit"><option value="CX">Caixas</option><option value="UN">Unidades</option></select></label>'+
        '<label class="fi-field"><span>Condição do produto</span><select id="fiMovCondition"><option value="OK">OK / Conforme</option><option value="AVARIA">Com avaria</option><option value="BLOQUEADO">Bloqueado</option><option value="RESSALVA">Recebido com ressalva</option></select></label>'+
        '<label class="fi-field"><span>Paletizado?</span><select id="fiMovPalletized"><option value="NAO">Não</option><option value="SIM">Sim</option></select></label>'+
        '<label class="fi-field"><span>Caixas por palete</span><input id="fiMovBoxes" type="number" min="0" step="1" placeholder="0"></label>'+
        '<label class="fi-field"><span>Chapatex?</span><select id="fiMovChapatex"><option value="NAO">Não</option><option value="SIM">Sim</option></select></label>'+
        '<label class="fi-field"><span>Paletes calculados</span><input id="fiMovPallets" readonly value="—"></label>'+
        '<label class="fi-field fi-span-2"><span>Observações</span><textarea id="fiMovNote" placeholder="Condições do recebimento, avarias, ressalvas, lote, veículo ou qualquer informação relevante"></textarea></label>'+
      '</div></div>'+
      '<div class="fi-panel"><h2>Últimas entradas</h2>'+movementHistory(history)+'</div></div>';
    bindBack();
    const qty=document.getElementById('fiMovQty'),pal=document.getElementById('fiMovPalletized'),boxes=document.getElementById('fiMovBoxes'),out=document.getElementById('fiMovPallets');
    const recalc=()=>{const q=Number(qty.value)||0,b=Number(boxes.value)||0;out.value=pal.value==='SIM'&&q>0&&b>0?String(Math.ceil(q/b)):'—'};
    qty.oninput=boxes.oninput=recalc;pal.onchange=recalc;
    document.getElementById('fiSaveMovement').onclick=()=>saveMovement(products);
  }

  function movementHistory(rows){
    if(!rows.length)return '<div class="fi-empty">Nenhuma entrada de produção registrada.</div>';
    return '<div class="fi-table-wrap"><table class="fi-table"><thead><tr><th>Data</th><th>Base</th><th>Produto</th><th>Volume</th><th>Condição</th><th>Paletização</th><th>Observação</th></tr></thead><tbody>'+rows.map(m=>'<tr><td>'+new Date(m.at||0).toLocaleDateString('pt-BR')+'</td><td>'+esc(m.base||m.warehouse||'—')+'</td><td><b>'+esc(m.name||'—')+'</b><div class="fi-muted">'+esc(m.code||'')+'</div></td><td>'+fmt(m.qty)+' '+esc(m.unit||'')+'</td><td>'+esc(m.condition||'OK')+'</td><td>'+(m.palletized?'Sim · '+fmt(m.boxesPerPallet)+' cx/pal · '+fmt(m.pallets)+' pal':'Não')+(m.chapatex?' · Chapatex':'')+'</td><td>'+esc(m.note||'—')+'</td></tr>').join('')+'</tbody></table></div>';
  }

  async function saveMovement(products){
    const p=products.find(x=>x.id===document.getElementById('fiMovProduct').value);
    const date=document.getElementById('fiMovDate').value,base=document.getElementById('fiMovBase').value,qty=Math.max(0,Number(document.getElementById('fiMovQty').value)||0),unit=document.getElementById('fiMovUnit').value;
    const condition=document.getElementById('fiMovCondition').value,palletized=document.getElementById('fiMovPalletized').value==='SIM',boxesPerPallet=Math.max(0,Number(document.getElementById('fiMovBoxes').value)||0),chapatex=document.getElementById('fiMovChapatex').value==='SIM',note=document.getElementById('fiMovNote').value.trim();
    if(!date||!p||!(qty>0)){alert('Informe data, produto e volume recebido.');return}
    if(palletized&&!(boxesPerPallet>0)){alert('Informe quantas caixas há por palete.');return}
    const pallets=palletized?Math.ceil(qty/boxesPerPallet):0,user=window.FocadoAuth?.getUser?.()?.name||'Estoque';
    const key=productKey(p);
    const result=await window.FocadoDataStore?.saveDomain?.('ESTOQUE',{movement:{
      id:'mov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      at:new Date(date+'T12:00:00').getTime(),kind:'finished',key,code:p.code,name:p.name,brand:p.brand,unit,
      type:'ENTRADA_PRODUCAO',qty,deltaPhysical:qty,deltaBlocked:condition==='BLOQUEADO'?qty:0,base,warehouse:base,
      condition,palletized,boxesPerPallet,pallets,chapatex,note,reason:'Recebimento de produção',user
    }});
    if(!result?.ok){alert('Não foi possível registrar a entrada. Nenhuma alteração foi confirmada.');return}
    if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);
    await window.FocadoDataStore?.refreshDomainV2?.('inventory');
    await window.FocadoDataStore?.refreshDomainV2?.('movements');
    alert('Entrada registrada e estoque atualizado.');
    renderMovementEntry();
  }

  function openItem(key){
    const ops=load(),inv=(ops.inventory||{})[key];if(!inv){alert('Item não encontrado.');return}
    const movements=(ops.stockMovements||[]).filter(m=>
      String(m.key)===String(key)||
      (String(m.code)===String(inv.code)&&String(m.brand||'').trim().toLowerCase()===String(inv.brand||'').trim().toLowerCase())
    ).slice().sort((a,b)=>(b.at||0)-(a.at||0));
    const policy=(ops.inventoryPolicy||{})[String(inv.code||key)]||(ops.inventoryPolicy||{})[key]||{};
    content().innerHTML='<div class="fi-page"><div class="fi-head"><div>'+back()+'<h1 style="margin-top:12px">'+esc(inv.name||key)+'</h1><p>'+esc(inv.code||'')+(inv.brand?' · '+esc(inv.brand):'')+'</p></div></div>'+
      '<div class="fi-kpis"><div class="fi-kpi"><span>Físico</span><strong>'+fmt(inv.physical)+'</strong></div><div class="fi-kpi"><span>Reservado</span><strong>'+fmt(inv.reserved)+'</strong></div><div class="fi-kpi"><span>Bloqueado</span><strong>'+fmt(inv.blocked)+'</strong></div><div class="fi-kpi"><span>Disponível</span><strong>'+fmt(avail(inv))+'</strong></div></div>'+
      '<div class="fi-panel"><h2>Política de estoque</h2><p class="fi-note">Esses campos alimentam o risco de ruptura e a reposição do BI.</p><div class="fi-grid">'+
        '<label class="fi-field"><span>Estoque mínimo</span><input id="fiMinStock" type="number" min="0" step="1" value="'+esc(policy.minimum_stock||0)+'"></label>'+
        '<label class="fi-field"><span>Ponto de reposição</span><input id="fiReorderPoint" type="number" min="0" step="1" value="'+esc(policy.reorder_point||0)+'"></label>'+
        '<label class="fi-field"><span>Estoque de segurança</span><input id="fiSafetyStock" type="number" min="0" step="1" value="'+esc(policy.safety_stock||0)+'"></label>'+
      '</div><div class="fi-actions"><button class="fi-btn primary" id="fiSavePolicy">Salvar política</button></div></div>'+
      '<div class="fi-panel"><h2>Saldo por base</h2>'+(Object.keys(inv.bases||{}).length?'<div class="fi-table-wrap"><table class="fi-table"><thead><tr><th>Base</th><th>Saldo físico atribuído</th></tr></thead><tbody>'+Object.entries(inv.bases).map(([b,v])=>'<tr><td>'+esc(b)+'</td><td>'+fmt(v)+' '+esc(inv.unit||'CX')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="fi-empty">Ainda não há saldo separado por base.</div>')+'</div>'+
      '<div class="fi-panel"><h2>Histórico do produto</h2>'+movementHistoryFull(movements)+'</div></div>';
    bindBack();
    document.getElementById('fiSavePolicy').onclick=async()=>{
      const sku=String(inv.code||key);
      const result=await window.FocadoDataStore?.saveDomain?.('ESTOQUE',{inventoryPolicy:{
        sku,
        minimum_stock:document.getElementById('fiMinStock').value,
        reorder_point:document.getElementById('fiReorderPoint').value,
        safety_stock:document.getElementById('fiSafetyStock').value
      }});
      if(!result?.ok){alert('Não foi possível salvar a política de estoque.');return}
      if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);
      alert('Política de estoque salva.');
      openItem(key);
    };
  }
  function movementHistoryFull(rows){
    if(!rows.length)return '<div class="fi-empty">Nenhuma movimentação registrada para este produto.</div>';
    return '<div class="fi-table-wrap"><table class="fi-table"><thead><tr><th>Data</th><th>Tipo</th><th>Base</th><th>Quantidade</th><th>Motivo</th><th>Usuário</th></tr></thead><tbody>'+rows.map(m=>'<tr><td>'+new Date(m.at||0).toLocaleString('pt-BR')+'</td><td><span class="fi-chip '+(m.type==='QUEBRA'?'block':'ok')+'">'+esc(m.type||'—')+'</span></td><td>'+esc(m.base||m.warehouse||'—')+'</td><td>'+fmt(m.qty)+' '+esc(m.unit||'')+'</td><td>'+esc(m.reason||'—')+'</td><td>'+esc(m.user||'—')+'</td></tr>').join('')+'</tbody></table></div>';
  }

  function renderMovements(){renderMovementEntry()}
  function renderInventoryCounts(){renderInventoryEntry()}
  window.FocadoInventory={render,openItem,renderMovements,renderInventoryCounts};
})();