(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dbr=v=>{if(!v)return '—';const d=new Date(v+(String(v).length===10?'T12:00:00':''));return isNaN(d)?'—':d.toLocaleDateString('pt-BR')};
  const today=()=>new Date().toISOString().slice(0,10);
  const load=()=>window.FocadoDataStore?.readLocal?.()||(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}})();
  const save=async ops=>{
    if(window.FocadoDataStore) return window.FocadoDataStore.save(ops);
    localStorage.setItem(KEY,JSON.stringify(ops));
    window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{key:KEY}}));
    return {ok:true,mode:'local'};
  };
  const value=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const stage=s=>({COMERCIAL:['Em preenchimento','comercial'],PCP:['Aguardando PCP','pcp'],ESTOQUE_PRODUCAO:['Produção / Estoque','producao'],LOGISTICA:['Logística','logistica'],ENTREGUE:['Concluído','entregue']})[s]||[s||'—','comercial'];
  let currentFilters={q:'',stage:'TODOS'};
  let editingId=null;

  function nextNumber(ops){
    const nums=(ops.orders||[]).map(o=>String(o.number||'').match(/(\d+)$/)).filter(Boolean).map(m=>Number(m[1])).filter(Number.isFinite);
    return 'PED-'+String((Math.max(0,...nums)+1)).padStart(5,'0');
  }
  function addEvent(o,text){
    o.events=o.events||[];
    o.events.unshift({at:Date.now(),text,user:window.FocadoAuth?.getUser?.()?.name||sessionStorage.getItem('nova-era-role-label')||'Usuário'});
  }
  function createBlank(ops){
    return {
      id:'op_'+Date.now(),
      number:nextNumber(ops),
      status:'COMERCIAL',
      createdAt:Date.now(),
      brand:'',
      client:'',
      cnpj:'',
      representative:'',
      customerOrder:'',
      city:'',
      uf:'',
      orderDate:today(),
      requestedDeliveryDate:'',
      suggestedPickup:'',
      freightType:'',
      paymentTerms:'',
      deliveryAddress:'',
      notes:'',
      commercial:{completedAt:null,completedBy:null},
      pcp:{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false},
      logistics:{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''},
      items:[{productId:'',code:'',name:'',qty:'',price:'',source:'',reservedQty:0,productionConsumed:false}],
      events:[]
    };
  }
  function canEdit(o){return o.status==='COMERCIAL'}
  function normalizeItems(items){
    return (items||[]).filter(i=>String(i.code||i.name||'').trim()||Number(i.qty)||Number(i.price)).map(i=>({
      productId:i.productId||'',
      code:String(i.code||'').trim(),
      name:String(i.name||'').trim(),
      qty:Number(i.qty)||0,
      price:Number(i.price)||0,
      source:i.source||'',
      reservedQty:Number(i.reservedQty)||0,
      productionConsumed:Boolean(i.productionConsumed),
      productionCompleted:Boolean(i.productionCompleted)
    }));
  }
  function validateCommercial(o){
    const errors=[];
    if(!String(o.client||'').trim())errors.push('Cliente');
    if(!String(o.orderDate||'').trim())errors.push('Data do pedido');
    if(!String(o.city||'').trim())errors.push('Cidade');
    if(!String(o.uf||'').trim())errors.push('UF');
    const items=normalizeItems(o.items);
    if(!items.length)errors.push('Pelo menos um item');
    items.forEach((i,n)=>{if(!i.name&&!i.code)errors.push('Produto da linha '+(n+1));if(!(Number(i.qty)>0))errors.push('Quantidade da linha '+(n+1));});
    return [...new Set(errors)];
  }
  function render(filters){
    currentFilters=filters||currentFilters;
    editingId=null;
    const ops=load(),orders=(ops.orders||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const filtered=orders.filter(o=>{
      const q=currentFilters.q.toLowerCase();
      const matches=!q||[o.number,o.customerOrder,o.client,o.cnpj,o.representative,o.city,(o.items||[]).map(i=>i.name).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const stageOk=currentFilters.stage==='TODOS'||o.status===currentFilters.stage;
      return matches&&stageOk;
    });
    const open=orders.filter(o=>o.status!=='ENTREGUE');
    const drafts=orders.filter(o=>o.status==='COMERCIAL').length;
    const pcp=orders.filter(o=>o.status==='PCP').length;
    const done=orders.filter(o=>o.status==='ENTREGUE').length;
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><h1>Pedidos Comerciais</h1><p>Registro oficial do pedido · Comercial → PCP → Logística</p></div><div class="fo-actions"><button class="fo-btn primary" id="foNew">+ Novo pedido</button></div></div>'+
      '<div class="fo-summary">'+
        stat('Em preenchimento',drafts,'rascunhos do Comercial')+
        stat('Aguardando PCP',pcp,'enviados pelo Comercial')+
        stat('Pedidos em aberto',open.length,money(open.reduce((s,o)=>s+value(o),0)))+
        stat('Concluídos',done,'histórico finalizado')+
      '</div>'+
      '<div class="fo-toolbar"><input class="fo-search" id="foSearch" placeholder="Buscar pedido, cliente, representante ou produto" value="'+esc(currentFilters.q)+'"><select class="fo-select" id="foStage"><option value="TODOS">Todos os status</option>'+[['COMERCIAL','Em preenchimento'],['PCP','Aguardando PCP'],['ESTOQUE_PRODUCAO','Produção / Estoque'],['LOGISTICA','Logística'],['ENTREGUE','Concluído']].map(x=>'<option value="'+x[0]+'" '+(currentFilters.stage===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select><span class="fo-muted">'+filtered.length+' pedido(s)</span></div>'+
      '<div class="fo-table-wrap">'+table(filtered)+'</div></div>';
    document.getElementById('foNew').onclick=()=>openForm();
    const q=document.getElementById('foSearch'),st=document.getElementById('foStage');
    let timer;
    q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>render({q:q.value,stage:st.value}),180)};
    st.onchange=()=>render({q:q.value,stage:st.value});
    document.querySelectorAll('[data-fo-open]').forEach(b=>b.onclick=()=>openForm(b.dataset.foOpen));
  }
  function stat(label,n,sub){return '<div class="fo-stat"><span>'+label+'</span><strong>'+n+'</strong><small>'+sub+'</small></div>'}
  function table(rows){
    if(!rows.length)return '<div class="fo-empty">Nenhum pedido encontrado.</div>';
    return '<table class="fo-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Representante</th><th>Data</th><th>Itens</th><th>Valor</th><th>Status</th><th>Previsão</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const s=stage(o.status);
      return '<tr><td><div class="fo-order">'+esc(o.number)+'</div><div class="fo-muted">'+esc(o.customerOrder||'')+'</div></td><td><div class="fo-client">'+esc(o.client||'—')+'</div><div class="fo-muted">'+esc([o.city,o.uf].filter(Boolean).join('/'))+'</div></td><td>'+esc(o.representative||'—')+'</td><td>'+dbr(o.orderDate)+'</td><td>'+(o.items||[]).length+'</td><td>'+money(value(o))+'</td><td><span class="fo-stage '+s[1]+'">'+s[0]+'</span></td><td>'+dbr(o.pcp?.availableDate||o.requestedDeliveryDate)+'</td><td><button class="fo-open" data-fo-open="'+esc(o.id)+'">Abrir</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function openForm(id){
    const ops=load();
    let order=id?(ops.orders||[]).find(o=>o.id===id):null;
    if(!order){order=createBlank(ops);editingId=null}else editingId=order.id;
    renderForm(order);
  }
  function renderForm(o){
    const editable=canEdit(o);
    const readonly=editable?'':'disabled';
    const items=(o.items&&o.items.length?o.items:[{code:'',name:'',qty:'',price:''}]);
    const s=stage(o.status);
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><button class="fo-back" id="foBack">← Histórico</button><h1>'+esc(o.number)+'</h1><p>Pedido comercial · <span class="fo-stage '+s[1]+'">'+s[0]+'</span></p></div><div class="fo-actions">'+
        (editable?'<button class="fo-btn secondary" id="foSave">Salvar rascunho</button><button class="fo-btn primary" id="foFinalize">Finalizar Comercial → PCP</button>':'')+
      '</div></div>'+
      '<div class="fo-flowline"><span class="'+(o.status==='COMERCIAL'?'active':'done')+'">1. Comercial</span><i>→</i><span class="'+(o.status==='PCP'?'active':(['ESTOQUE_PRODUCAO','LOGISTICA','ENTREGUE'].includes(o.status)?'done':'') )+'">2. PCP</span><i>→</i><span class="'+(['ESTOQUE_PRODUCAO','LOGISTICA'].includes(o.status)?'active':(o.status==='ENTREGUE'?'done':''))+'">3. Logística</span><i>→</i><span class="'+(o.status==='ENTREGUE'?'done':'')+'">4. Concluído</span></div>'+
      '<form id="foOrderForm" class="fo-form">'+
        section('Dados do pedido',[
          field('Número interno','number',o.number,'text',true),
          field('Pedido do cliente','customerOrder',o.customerOrder),
          field('Data do pedido','orderDate',o.orderDate,'date'),
          field('Representante','representative',o.representative),
          field('Cliente / Razão social','client',o.client,'text',false,'wide'),
          field('CNPJ','cnpj',o.cnpj),
          field('Marca / Empresa','brand',o.brand)
        ],readonly)+
        section('Entrega e condição comercial',[
          field('Cidade','city',o.city),
          field('UF','uf',o.uf),
          field('Data solicitada pelo cliente','requestedDeliveryDate',o.requestedDeliveryDate,'date'),
          field('Tipo de frete','freightType',o.freightType),
          field('Condição de pagamento','paymentTerms',o.paymentTerms),
          field('Endereço / local de entrega','deliveryAddress',o.deliveryAddress,'text',false,'wide')
        ],readonly)+
        '<div class="fo-card"><div class="fo-card-head"><div><h2>Itens do pedido</h2><p>Grade semelhante à planilha: uma linha por produto.</p></div>'+(editable?'<button class="fo-btn secondary" type="button" id="foAddItem">+ Linha</button>':'')+'</div><div class="fo-items-wrap"><table class="fo-items" id="foItems"><thead><tr><th>Código</th><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th><th></th></tr></thead><tbody>'+items.map((i,n)=>itemRow(i,n,editable)).join('')+'</tbody></table></div><div class="fo-total"><span>Total do pedido</span><strong id="foGrandTotal">'+money(value(o))+'</strong></div></div>'+
        '<div class="fo-card"><h2>Observações comerciais</h2><textarea name="notes" '+readonly+' placeholder="Observações do pedido, particularidades do cliente, entrega ou negociação">'+esc(o.notes||'')+'</textarea></div>'+
      '</form>'+
      history(o)+
      '</div>';
    document.getElementById('foBack').onclick=()=>render(currentFilters);
    if(editable){
      bindItemEvents();
      document.getElementById('foAddItem').onclick=()=>addItemRow();
      document.getElementById('foSave').onclick=()=>persist(false);
      document.getElementById('foFinalize').onclick=()=>persist(true);
    }
  }
  function section(title,fields,disabled){
    return '<div class="fo-card"><h2>'+title+'</h2><div class="fo-fields">'+fields.map(f=>f.replace(' data-disabled-placeholder',' '+disabled)).join('')+'</div></div>';
  }
  function field(label,name,val,type='text',forceDisabled=false,cls=''){
    return '<label class="fo-field '+cls+'"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(val||'')+'" '+(forceDisabled?'disabled':'data-disabled-placeholder')+'></label>';
  }
  function itemRow(i,n,editable){
    return '<tr data-item-row><td><input data-k="code" value="'+esc(i.code||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="name" value="'+esc(i.name||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="qty" type="number" min="0" step="1" value="'+esc(i.qty||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="price" type="number" min="0" step="0.01" value="'+esc(i.price||'')+'" '+(editable?'':'disabled')+'></td><td class="fo-line-total">'+money((Number(i.qty)||0)*(Number(i.price)||0))+'</td><td>'+(editable?'<button type="button" class="fo-remove">×</button>':'')+'</td></tr>';
  }
  function addItemRow(){
    const tbody=document.querySelector('#foItems tbody');
    tbody.insertAdjacentHTML('beforeend',itemRow({},tbody.children.length,true));
    bindItemEvents();
  }
  function bindItemEvents(){
    document.querySelectorAll('#foItems input').forEach(i=>{i.oninput=updateTotals});
    document.querySelectorAll('.fo-remove').forEach(b=>b.onclick=()=>{if(document.querySelectorAll('[data-item-row]').length>1)b.closest('tr').remove();updateTotals()});
  }
  function updateTotals(){
    let total=0;
    document.querySelectorAll('[data-item-row]').forEach(r=>{
      const q=Number(r.querySelector('[data-k="qty"]').value)||0,p=Number(r.querySelector('[data-k="price"]').value)||0;
      r.querySelector('.fo-line-total').textContent=money(q*p);total+=q*p;
    });
    const g=document.getElementById('foGrandTotal');if(g)g.textContent=money(total);
  }
  function collect(){
    const form=document.getElementById('foOrderForm'),fd=new FormData(form);
    const o={
      number:fd.get('number')||'',
      customerOrder:fd.get('customerOrder')||'',
      orderDate:fd.get('orderDate')||'',
      representative:fd.get('representative')||'',
      client:fd.get('client')||'',
      cnpj:fd.get('cnpj')||'',
      brand:fd.get('brand')||'',
      city:fd.get('city')||'',
      uf:String(fd.get('uf')||'').toUpperCase().slice(0,2),
      requestedDeliveryDate:fd.get('requestedDeliveryDate')||'',
      freightType:fd.get('freightType')||'',
      paymentTerms:fd.get('paymentTerms')||'',
      deliveryAddress:fd.get('deliveryAddress')||'',
      notes:fd.get('notes')||'',
      items:[...document.querySelectorAll('[data-item-row]')].map(r=>({
        code:r.querySelector('[data-k="code"]').value,
        name:r.querySelector('[data-k="name"]').value,
        qty:r.querySelector('[data-k="qty"]').value,
        price:r.querySelector('[data-k="price"]').value
      }))
    };
    return o;
  }
  async function persist(finalize){
    const ops=load();ops.orders=ops.orders||[];
    const data=collect();
    let o=editingId?ops.orders.find(x=>x.id===editingId):null;
    if(!o){
      o=createBlank(ops);o.id='op_'+Date.now();o.createdAt=Date.now();ops.orders.unshift(o);editingId=o.id;
      addEvent(o,'Pedido criado pelo Comercial');
    }
    const preservedItems=(o.items||[]);
    Object.assign(o,data);
    o.items=normalizeItems(data.items).map((i,idx)=>Object.assign({},preservedItems[idx]||{},i,{source:(preservedItems[idx]||{}).source||'',reservedQty:Number((preservedItems[idx]||{}).reservedQty)||0,productionConsumed:Boolean((preservedItems[idx]||{}).productionConsumed)}));
    o.status=o.status||'COMERCIAL';
    o.commercial=o.commercial||{completedAt:null,completedBy:null};
    o.pcp=o.pcp||{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false};
    o.logistics=o.logistics||{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''};
    if(finalize){
      const errors=validateCommercial(o);
      if(errors.length){alert('Antes de finalizar o Comercial, preencha:\n\n• '+errors.join('\n• '));return}
      o.status='PCP';
      o.commercial.completedAt=Date.now();
      o.commercial.completedBy=window.FocadoAuth?.getUser?.()?.name||'Comercial';
      addEvent(o,'Comercial finalizado · pedido enviado ao PCP');
    }else addEvent(o,'Rascunho comercial salvo');
    const result=await save(ops);
    window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{key:KEY}}));
    if(result?.mode==='conflict'){alert('O pedido foi alterado em outro acesso. Atualize a tela antes de tentar novamente.');return}
    if(finalize){render({q:'',stage:'PCP'})}else renderForm(o);
  }
  function history(o){
    const events=(o.events||[]).slice(0,12);
    return '<div class="fo-card"><h2>Histórico do pedido</h2>'+(events.length?'<div class="fo-history">'+events.map(e=>'<div class="fo-history-row"><span>'+dbr(new Date(e.at).toISOString().slice(0,10))+'</span><div><b>'+esc(e.text||'')+'</b><small>'+esc(e.user||'')+(e.at?' · '+new Date(e.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</small></div></div>').join('')+'</div>':'<div class="fo-empty compact">Ainda não há movimentações neste pedido.</div>')+'</div>';
  }

  window.FocadoOrders={render,openOrder:openForm,openNew:()=>openForm()};
})();