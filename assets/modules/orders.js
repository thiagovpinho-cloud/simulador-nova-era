(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
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
  function addEvent(o,text){
    o.events=o.events||[];
    o.events.unshift({at:Date.now(),text,user:window.FocadoAuth?.getUser?.()?.name||sessionStorage.getItem('nova-era-role-label')||'Usuário'});
  }
  function createBlank(ops){
    return {
      id:'op_'+Date.now(),number:nextNumber(ops),status:'COMERCIAL',createdAt:Date.now(),
      brand:'Nova Era',client:'',cnpj:'',representative:'',city:'',uf:'',cep:'',bairro:'',email:'',phone:'',
      orderDate:today(),requestedDeliveryDate:'',suggestedPickup:'',freightType:'CIF',paymentTerms:'',deliveryAddress:'',notes:'',
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
    if(!String(o.city||'').trim())errors.push('Cidade');
    if(!String(o.uf||'').trim())errors.push('UF');
    if(!['CIF','FOB','Redespacho'].includes(o.freightType))errors.push('Tipo de frete');
    const items=normalizeItems(o.items);
    if(!items.length)errors.push('Pelo menos um item');
    items.forEach((i,n)=>{if(!i.name&&!i.code)errors.push('Produto da linha '+(n+1));if(!(Number(i.qty)>0))errors.push('Quantidade da linha '+(n+1));});
    return [...new Set(errors)];
  }

  function render(filters){
    currentFilters=filters||currentFilters;editingId=null;
    const ops=load();ensureCatalog(ops);
    const orders=(ops.orders||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const filtered=orders.filter(o=>{
      const q=currentFilters.q.toLowerCase();
      const matches=!q||[o.number,o.client,o.cnpj,o.representative,o.city,(o.items||[]).map(i=>i.name+' '+i.code).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      return matches&&(currentFilters.stage==='TODOS'||o.status===currentFilters.stage);
    });
    const open=orders.filter(o=>o.status!=='ENTREGUE');
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><h1>Pedidos Comerciais</h1><p>Registro oficial do pedido · Comercial → PCP → Logística</p></div><div class="fo-actions"><button class="fo-btn secondary" id="foPeriod">Listagem / período</button><button class="fo-btn primary" id="foNew">+ Novo pedido</button></div></div>'+
      '<div class="fo-summary">'+
        stat('Em preenchimento',orders.filter(o=>o.status==='COMERCIAL').length,'rascunhos do Comercial')+
        stat('Aguardando PCP',orders.filter(o=>o.status==='PCP').length,'enviados pelo Comercial')+
        stat('Pedidos em aberto',open.length,money(open.reduce((s,o)=>s+value(o),0)))+
        stat('Concluídos',orders.filter(o=>o.status==='ENTREGUE').length,'histórico finalizado')+
      '</div>'+
      '<div class="fo-toolbar"><input class="fo-search" id="foSearch" placeholder="Buscar pedido, cliente, CNPJ, representante ou produto" value="'+esc(currentFilters.q)+'"><select class="fo-select" id="foStage"><option value="TODOS">Todos os status</option>'+[['COMERCIAL','Em preenchimento'],['PCP','Aguardando PCP'],['ESTOQUE_PRODUCAO','Produção / Estoque'],['LOGISTICA','Logística'],['ENTREGUE','Concluído']].map(x=>'<option value="'+x[0]+'" '+(currentFilters.stage===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select><span class="fo-muted">'+filtered.length+' pedido(s)</span></div>'+
      '<div class="fo-table-wrap">'+table(filtered)+'</div></div>';
    document.getElementById('foNew').onclick=()=>openForm();
    document.getElementById('foPeriod').onclick=()=>renderReport(firstDayMonth(),today());
    const q=document.getElementById('foSearch'),st=document.getElementById('foStage');let timer;
    q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>render({q:q.value,stage:st.value}),180)};
    st.onchange=()=>render({q:q.value,stage:st.value});
    document.querySelectorAll('[data-fo-open]').forEach(b=>b.onclick=()=>openForm(b.dataset.foOpen));
  }
  function stat(label,n,sub){return '<div class="fo-stat"><span>'+label+'</span><strong>'+n+'</strong><small>'+sub+'</small></div>'}
  function table(rows){
    if(!rows.length)return '<div class="fo-empty">Nenhum pedido encontrado.</div>';
    return '<table class="fo-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>CNPJ</th><th>Representante</th><th>Data</th><th>Itens</th><th>Valor</th><th>Status</th><th>Previsão</th><th></th></tr></thead><tbody>'+rows.map(o=>{
      const s=stage(o.status);
      return '<tr><td><div class="fo-order">'+esc(o.number)+'</div></td><td><div class="fo-client">'+esc(o.client||'—')+'</div><div class="fo-muted">'+esc([o.city,o.uf].filter(Boolean).join('/'))+'</div></td><td>'+esc(formatCnpj(o.cnpj)||'—')+'</td><td>'+esc(o.representative||'—')+'</td><td>'+dbr(o.orderDate)+'</td><td>'+(o.items||[]).length+'</td><td>'+money(value(o))+'</td><td><span class="fo-stage '+s[1]+'">'+s[0]+'</span></td><td>'+dbr(o.pcp?.availableDate||o.requestedDeliveryDate)+'</td><td><button class="fo-open" data-fo-open="'+esc(o.id)+'">Abrir</button></td></tr>';
    }).join('')+'</tbody></table>';
  }

  function openForm(id){
    const ops=load();ensureCatalog(ops);
    let order=id?(ops.orders||[]).find(o=>o.id===id):null;
    if(!order){order=createBlank(ops);editingId=null}else editingId=order.id;
    renderForm(order,ops);
  }
  function renderForm(o,ops){
    const editable=canEdit(o),readonly=editable?'':'disabled';formEditable=editable;
    const items=(o.items&&o.items.length?o.items:[{code:'',name:'',qty:'',price:''}]);
    const s=stage(o.status),cat=catalog(ops);
    content().innerHTML='<div class="fo-page">'+
      '<div class="fo-head"><div><button class="fo-back" id="foBack">← Histórico</button><h1>'+esc(o.number)+'</h1><p>Pedido comercial · <span class="fo-stage '+s[1]+'">'+s[0]+'</span></p></div><div class="fo-actions">'+
        (editable?'<button class="fo-btn secondary" id="foSave">Salvar rascunho</button><button class="fo-btn primary" id="foFinalize">Finalizar Comercial → PCP</button>':'')+
      '</div></div>'+
      '<div class="fo-flowline"><span class="'+(o.status==='COMERCIAL'?'active':'done')+'">1. Comercial</span><i>→</i><span class="'+(o.status==='PCP'?'active':(['ESTOQUE_PRODUCAO','LOGISTICA','ENTREGUE'].includes(o.status)?'done':'') )+'">2. PCP</span><i>→</i><span class="'+(['ESTOQUE_PRODUCAO','LOGISTICA'].includes(o.status)?'active':(o.status==='ENTREGUE'?'done':''))+'">3. Logística</span><i>→</i><span class="'+(o.status==='ENTREGUE'?'done':'')+'">4. Concluído</span></div>'+
      '<form id="foOrderForm" class="fo-form">'+
        '<div class="fo-card"><h2>Dados do pedido</h2><div class="fo-fields">'+
          field('Número do pedido','number',o.number,'text',true)+
          cnpjField(o.cnpj,editable)+
          field('Data do pedido','orderDate',o.orderDate,'date')+
          field('Representante','representative',o.representative)+
          field('Cliente / Razão social','client',o.client,'text',false,'wide')+
          selectField('Marca / Empresa','brand',o.brand,['Nova Era','New Green'])+
          field('E-mail','email',o.email,'email')+
          field('Telefone','phone',o.phone)+
        '</div><div class="fo-cnpj-status" id="foCnpjStatus"></div></div>'+
        '<div class="fo-card"><h2>Entrega e condição comercial</h2><div class="fo-fields">'+
          field('CEP','cep',o.cep)+field('Bairro','bairro',o.bairro)+field('Cidade','city',o.city)+field('UF','uf',o.uf)+
          field('Data solicitada pelo cliente','requestedDeliveryDate',o.requestedDeliveryDate,'date')+
          selectField('Tipo de frete','freightType',o.freightType||'CIF',['CIF','FOB','Redespacho'])+
          field('Condição de pagamento','paymentTerms',o.paymentTerms)+
          field('Endereço / local de entrega','deliveryAddress',o.deliveryAddress,'text',false,'wide')+
        '</div></div>'+
        '<div class="fo-card"><div class="fo-card-head"><div><h2>Itens do pedido</h2><p>Digite o código ou o nome; o produto será identificado automaticamente na base.</p></div>'+(editable?'<div class="fo-actions"><button class="fo-btn secondary" type="button" id="foProducts">Cadastrar produto</button><button class="fo-btn secondary" type="button" id="foAddItem">+ Linha</button></div>':'')+'</div>'+
          '<datalist id="foProductCodes">'+cat.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name)+' · '+esc(p.brand)+'</option>').join('')+'</datalist>'+
          '<datalist id="foProductNames">'+cat.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.code)+' · '+esc(p.brand)+'</option>').join('')+'</datalist>'+
          '<div class="fo-items-wrap"><table class="fo-items" id="foItems"><thead><tr><th>Código</th><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th><th></th></tr></thead><tbody>'+items.map((i,n)=>itemRow(i,n,editable)).join('')+'</tbody></table></div><div class="fo-total"><span>Total do pedido</span><strong id="foGrandTotal">'+money(value(o))+'</strong></div></div>'+
        '<div class="fo-card"><h2>Observações comerciais</h2><textarea name="notes" '+readonly+' placeholder="Observações do pedido, particularidades do cliente, entrega ou negociação">'+esc(o.notes||'')+'</textarea></div>'+
      '</form>'+history(o)+'</div>';
    document.getElementById('foBack').onclick=()=>render(currentFilters);
    if(editable){
      bindItemEvents(ops);
      document.getElementById('foAddItem').onclick=()=>addItemRow(ops);
      document.getElementById('foProducts').onclick=async()=>{const ok=await persist(false,true);if(ok!==false)window.FocadoShell?.navigate?.('produtos')};
      document.getElementById('foSave').onclick=()=>persist(false);
      document.getElementById('foFinalize').onclick=()=>persist(true);
      bindCnpjLookup(ops,o);
    }
  }
  function field(label,name,val,type='text',forceDisabled=false,cls=''){
    return '<label class="fo-field '+cls+'"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(val||'')+'" '+((forceDisabled||!formEditable)?'disabled':'')+'></label>';
  }
  function selectField(label,name,val,options){
    return '<label class="fo-field"><span>'+label+'</span><select name="'+name+'" '+(!formEditable?'disabled':'')+'>'+options.map(x=>'<option value="'+esc(x)+'" '+(String(val||'')===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
  }
  function cnpjField(val,editable){
    return '<label class="fo-field"><span>CNPJ</span><div class="fo-inline-input"><input name="cnpj" id="foCnpj" value="'+esc(formatCnpj(val))+'" inputmode="numeric" '+(editable?'':'disabled')+'><button type="button" id="foCnpjLookup" '+(editable?'':'disabled')+'>Buscar</button></div></label>';
  }
  function itemRow(i,n,editable){
    return '<tr data-item-row data-product-id="'+esc(i.productId||'')+'"><td><input data-k="code" list="foProductCodes" value="'+esc(i.code||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="name" list="foProductNames" value="'+esc(i.name||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="qty" type="number" min="0" step="1" value="'+esc(i.qty||'')+'" '+(editable?'':'disabled')+'></td><td><input data-k="price" type="number" min="0" step="0.01" value="'+esc(i.price||'')+'" '+(editable?'':'disabled')+'></td><td class="fo-line-total">'+money((Number(i.qty)||0)*(Number(i.price)||0))+'</td><td>'+(editable?'<button type="button" class="fo-remove">×</button>':'')+'</td></tr>';
  }
  function addItemRow(ops){
    const tbody=document.querySelector('#foItems tbody');tbody.insertAdjacentHTML('beforeend',itemRow({},tbody.children.length,true));bindItemEvents(ops);
  }
  function bindItemEvents(ops){
    const brand=()=>document.querySelector('[name="brand"]')?.value||'';
    document.querySelectorAll('[data-item-row]').forEach(row=>{
      const code=row.querySelector('[data-k="code"]'),name=row.querySelector('[data-k="name"]');
      function resolve(source){
        const p=findProduct(source.value,brand(),ops);if(!p)return;
        code.value=p.code;name.value=p.name;row.dataset.productId=p.simulatorId||'';
      }
      code.onchange=()=>resolve(code);code.onblur=()=>resolve(code);
      name.onchange=()=>resolve(name);name.onblur=()=>resolve(name);
      row.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateTotals));
    });
    document.querySelectorAll('.fo-remove').forEach(b=>b.onclick=()=>{if(document.querySelectorAll('[data-item-row]').length>1)b.closest('tr').remove();updateTotals()});
  }
  function updateTotals(){
    let total=0;document.querySelectorAll('[data-item-row]').forEach(r=>{const q=Number(r.querySelector('[data-k="qty"]').value)||0,p=Number(r.querySelector('[data-k="price"]').value)||0;r.querySelector('.fo-line-total').textContent=money(q*p);total+=q*p});
    const g=document.getElementById('foGrandTotal');if(g)g.textContent=money(total);
  }

  function setForm(name,value){const el=document.querySelector('[name="'+name+'"]');if(el&&value!=null&&String(value)!=='')el.value=value}
  function previousOrderByCnpj(cnpj,ops,currentId){
    const key=normalizeCnpj(cnpj);
    return (ops.orders||[]).filter(o=>o.id!==currentId&&normalizeCnpj(o.cnpj)===key).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0]||null;
  }
  function applyPrevious(prev){
    if(!prev)return false;
    ['representative','brand','freightType','paymentTerms','deliveryAddress','city','uf','cep','bairro','email','phone'].forEach(k=>setForm(k,prev[k]));
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
  function bindCnpjLookup(ops,o){
    const input=document.getElementById('foCnpj'),btn=document.getElementById('foCnpjLookup'),status=document.getElementById('foCnpjStatus');let busy=false,last='';
    async function lookup(){
      const cnpj=normalizeCnpj(input.value);input.value=formatCnpj(cnpj);
      if(cnpj.length!==14){status.textContent='Informe os 14 dígitos do CNPJ.';status.className='fo-cnpj-status bad';return}
      if(busy||cnpj===last)return;busy=true;last=cnpj;btn.disabled=true;status.textContent='Consultando CNPJ...';status.className='fo-cnpj-status';
      const prev=previousOrderByCnpj(cnpj,ops,o.id);
      try{
        const b=await fetchCnpj(cnpj);
        setForm('client',b.razaoSocial||b.nomeFantasia);
        setForm('cep',b.cep);
        setForm('bairro',b.bairro);
        setForm('city',b.municipio);
        setForm('uf',b.uf);
        setForm('email',b.email);
        setForm('phone',b.dddTelefone1);
        const address=[b.logradouro,b.numero,b.complemento,b.bairro].filter(Boolean).join(', ');
        setForm('deliveryAddress',address);
        const reused=applyPrevious(prev);
        status.textContent=(reused?'Cliente recorrente: dados comerciais e de entrega do último pedido reaproveitados. ':'')+'Dados cadastrais consultados pela BrasilAPI.';
        status.className='fo-cnpj-status ok';
      }catch(err){
        const reused=applyPrevious(prev);
        if(reused){status.textContent='Cliente recorrente: dados do último pedido reaproveitados. A consulta cadastral externa não respondeu.';status.className='fo-cnpj-status warn'}
        else{status.textContent=err.status===404?'CNPJ não encontrado.':'Não foi possível consultar o CNPJ agora.';status.className='fo-cnpj-status bad'}
      }finally{busy=false;btn.disabled=false}
    }
    btn.onclick=lookup;input.onblur=lookup;input.oninput=()=>{const d=normalizeCnpj(input.value);input.value=formatCnpj(d);if(d.length===14)setTimeout(lookup,120)};
  }

  function collect(){
    const form=document.getElementById('foOrderForm'),fd=new FormData(form),ops=load(),brand=fd.get('brand')||'';
    return {
      number:document.querySelector('[name="number"]')?.value||'',orderDate:fd.get('orderDate')||'',representative:fd.get('representative')||'',
      client:fd.get('client')||'',cnpj:normalizeCnpj(fd.get('cnpj')),brand,city:fd.get('city')||'',uf:String(fd.get('uf')||'').toUpperCase().slice(0,2),
      cep:fd.get('cep')||'',bairro:fd.get('bairro')||'',email:fd.get('email')||'',phone:fd.get('phone')||'',
      requestedDeliveryDate:fd.get('requestedDeliveryDate')||'',freightType:fd.get('freightType')||'CIF',paymentTerms:fd.get('paymentTerms')||'',
      deliveryAddress:fd.get('deliveryAddress')||'',notes:fd.get('notes')||'',
      items:[...document.querySelectorAll('[data-item-row]')].map(r=>{
        const code=r.querySelector('[data-k="code"]').value,name=r.querySelector('[data-k="name"]').value,p=findProduct(code||name,brand,ops);
        return {productId:p?.simulatorId||r.dataset.productId||'',code:p?.code||code,name:p?.name||name,qty:r.querySelector('[data-k="qty"]').value,price:r.querySelector('[data-k="price"]').value};
      })
    };
  }
  async function persist(finalize,silentNavigate=false){
    const ops=load();ensureCatalog(ops);ops.orders=ops.orders||[];const data=collect();let o=editingId?ops.orders.find(x=>x.id===editingId):null;
    if(!o){o=createBlank(ops);o.id='op_'+Date.now();o.createdAt=Date.now();ops.orders.unshift(o);editingId=o.id;addEvent(o,'Pedido criado pelo Comercial')}
    const previousItems=o.items||[];Object.assign(o,data);
    o.items=normalizeItems(data.items).map((i,idx)=>Object.assign({},previousItems[idx]||{},i,{source:(previousItems[idx]||{}).source||'',reservedQty:Number((previousItems[idx]||{}).reservedQty)||0,productionConsumed:Boolean((previousItems[idx]||{}).productionConsumed)}));
    o.status=o.status||'COMERCIAL';o.commercial=o.commercial||{completedAt:null,completedBy:null};o.pcp=o.pcp||{deliveryBase:'',productionDate:'',availableDate:'',separated:false,scheduledQty:0,autoScheduled:false};o.logistics=o.logistics||{freightValue:'',pickupDate:'',deliveryDate:'',carrier:''};
    if(finalize){const errors=validateCommercial(o);if(errors.length){alert('Antes de finalizar o Comercial, preencha:\n\n• '+errors.join('\n• '));return}o.status='PCP';o.commercial.completedAt=Date.now();o.commercial.completedBy=window.FocadoAuth?.getUser?.()?.name||'Comercial';addEvent(o,'Comercial finalizado · pedido enviado ao PCP')}
    else addEvent(o,'Rascunho comercial salvo');
    const result=await save(ops);window.dispatchEvent(new CustomEvent('focado:ops-updated',{detail:{key:KEY}}));
    if(result?.mode==='conflict'){alert('O pedido foi alterado em outro acesso. Atualize a tela antes de tentar novamente.');return false}
    if(!silentNavigate){if(finalize)render({q:'',stage:'PCP'});else renderForm(o,ops)}
    return true;
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
    return '<table class="fo-table fo-report-table"><thead><tr><th>Data</th><th>Pedido</th><th>CNPJ</th><th>Cliente</th><th>Representante</th><th>Frete</th><th>Status</th><th>Itens</th><th>Valor</th></tr></thead><tbody>'+rows.map(o=>'<tr><td>'+dbr(o.orderDate)+'</td><td><b>'+esc(o.number)+'</b></td><td>'+esc(formatCnpj(o.cnpj))+'</td><td>'+esc(o.client)+'</td><td>'+esc(o.representative||'—')+'</td><td>'+esc(o.freightType||'—')+'</td><td>'+esc(stage(o.status)[0])+'</td><td>'+((o.items||[]).map(i=>esc(i.code+' - '+i.name+' ('+i.qty+')')).join('<br>'))+'</td><td>'+money(value(o))+'</td></tr>').join('')+'</tbody></table>';
  }
  function reportWorkbook(rows,from,to){
    const table='<table><tr><th>Data</th><th>Pedido</th><th>CNPJ</th><th>Cliente</th><th>Representante</th><th>Cidade</th><th>UF</th><th>Frete</th><th>Status</th><th>Itens</th><th>Valor</th></tr>'+rows.map(o=>'<tr><td>'+esc(o.orderDate)+'</td><td>'+esc(o.number)+'</td><td>'+esc(formatCnpj(o.cnpj))+'</td><td>'+esc(o.client)+'</td><td>'+esc(o.representative||'')+'</td><td>'+esc(o.city||'')+'</td><td>'+esc(o.uf||'')+'</td><td>'+esc(o.freightType||'')+'</td><td>'+esc(stage(o.status)[0])+'</td><td>'+esc((o.items||[]).map(i=>i.code+' - '+i.name+' x '+i.qty).join(' | '))+'</td><td>'+value(o).toFixed(2)+'</td></tr>').join('')+'</table>';
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

  window.FocadoOrders={render,openOrder:openForm,openNew:()=>openForm(),renderReport};
})();