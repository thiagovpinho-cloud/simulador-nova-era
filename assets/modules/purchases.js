(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>window.FocadoDS?.money?.(v)||Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>window.FocadoDS?.date?.(v)||v||'—';
  const parseMoney=v=>window.FocadoDS?.parseMoney?.(v)||Number(v||0);
  let tab='needs';

  function needs(ops){
    const agg={};
    for(const r of ops.productionRequests||[]){
      if(r.status!=='FINALIZADA')continue;
      const s=r.snapshot||r;
      for(const m of s.materials||[]){
        const shortage=Math.max(0,Number(m.shortage||0));
        if(!(shortage>0))continue;
        const key=String(m.code||m.name||'');
        agg[key]=agg[key]||{code:m.code||key,name:m.name||key,unit:m.unit||'',required:0,requests:new Set()};
        agg[key].required+=shortage;
        agg[key].requests.add(r.number||r.id);
      }
    }
    for(const req of ops.purchaseRequests||[]){
      if(req.status==='CANCELADO')continue;
      const a=agg[String(req.code||'')];if(a)a.required=Math.max(0,a.required-Number(req.qty||0));
    }
    return Object.values(agg).filter(x=>x.required>0).sort((a,b)=>b.required-a.required);
  }

  function render(){
    const ops=load(),ns=needs(ops),reqs=(ops.purchaseRequests||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),sup=(ops.suppliers||[]).filter(s=>s.active!==false);
    const open=reqs.filter(r=>!['RECEBIDO','CANCELADO'].includes(r.status)).length;
    content().innerHTML='<div class="fds-page">'+
      '<div class="fpur-head"><div><h1>Compras</h1><p>Necessidades de matéria-prima, requisições, fornecedores e recebimentos</p></div><div class="fds-row"><button class="fds-btn" id="fpurScore">Performance fornecedores</button><button class="fds-btn" id="fpurNew">+ Nova requisição</button><button class="fds-btn" id="fpurSupplier">+ Fornecedor</button></div></div>'+
      '<div class="fpur-kpis"><div class="fds-card"><span>Necessidades</span><strong>'+ns.length+'</strong><small>insumos ainda sem cobertura</small></div><div class="fds-card"><span>Requisições abertas</span><strong>'+open+'</strong><small>em cotação/aprovação/pedido</small></div><div class="fds-card"><span>Fornecedores ativos</span><strong>'+sup.length+'</strong><small>cadastro disponível</small></div></div>'+
      '<div class="fpur-tabs"><button class="'+(tab==='needs'?'active':'')+'" data-tab="needs">Necessidades</button><button class="'+(tab==='requests'?'active':'')+'" data-tab="requests">Requisições</button><button class="'+(tab==='suppliers'?'active':'')+'" data-tab="suppliers">Fornecedores</button></div>'+
      (tab==='needs'?needsView(ns):tab==='requests'?requestsView(reqs):suppliersView(ops.suppliers||[]))+
      '</div>';
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});
    document.getElementById('fpurScore').onclick=async()=>{
      await window.FocadoModules?.ensure?.('cockpit');
      window.FocadoIntelligenceUI?.renderSuppliers();
    };
    document.getElementById('fpurNew').onclick=()=>openRequest(null);
    document.getElementById('fpurSupplier').onclick=()=>openSupplier();
    document.querySelectorAll('[data-need]').forEach(b=>b.onclick=()=>openRequest(b.dataset.need));
    document.querySelectorAll('[data-request]').forEach(b=>b.onclick=()=>openRequest(null,b.dataset.request));
    document.querySelectorAll('[data-receive]').forEach(b=>b.onclick=()=>receiveRequest(b.dataset.receive));
    document.querySelectorAll('[data-supplier]').forEach(b=>b.onclick=()=>openSupplier(b.dataset.supplier));
  }

  function needsView(rows){
    if(!rows.length)return '<div class="fds-card fpur-empty">Nenhuma necessidade de compra pendente.</div>';
    return '<div class="fpur-table-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th>Necessidade líquida</th><th>Origem</th><th></th></tr></thead><tbody>'+
      rows.map(n=>'<tr><td><b>'+esc(n.code)+'</b></td><td>'+esc(n.name)+'</td><td><b>'+Number(n.required).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+esc(n.unit)+'</b></td><td>'+esc([...n.requests].join(', '))+'</td><td><button class="fds-btn" data-need="'+esc(n.code)+'">Gerar requisição</button></td></tr>').join('')+
      '</tbody></table></div>';
  }
  function requestsView(rows){
    if(!rows.length)return '<div class="fds-card fpur-empty">Nenhuma requisição cadastrada.</div>';
    return '<div class="fpur-table-wrap"><table><thead><tr><th>Requisição</th><th>Insumo</th><th>Qtd.</th><th>Fornecedor</th><th>Valor unit.</th><th>Previsão</th><th>Status</th><th></th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td><b>'+esc(r.number||r.id)+'</b></td><td>'+esc(r.code+' · '+r.material)+'</td><td>'+Number(r.qty||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+esc(r.unit||'')+'</td><td>'+esc(r.supplierName||'—')+'</td><td>'+money(r.unitPrice)+'</td><td>'+date(r.expectedDate)+'</td><td><span class="fpur-chip '+statusClass(r.status)+'">'+esc(r.status||'NECESSIDADE')+'</span></td><td><div class="fds-row"><button class="fds-btn" data-request="'+esc(r.id)+'">Abrir</button>'+(!['RECEBIDO','CANCELADO'].includes(r.status)?'<button class="fds-btn" data-receive="'+esc(r.id)+'">Receber</button>':'')+'</div></td></tr>').join('')+
      '</tbody></table></div>';
  }
  function suppliersView(rows){
    if(!rows.length)return '<div class="fds-card fpur-empty">Nenhum fornecedor cadastrado.</div>';
    return '<div class="fpur-table-wrap"><table><thead><tr><th>Fornecedor</th><th>CNPJ</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th>Status</th><th></th></tr></thead><tbody>'+
      rows.map(s=>'<tr><td><b>'+esc(s.name||'')+'</b></td><td>'+esc(s.cnpj||'—')+'</td><td>'+esc(s.contact||'—')+'</td><td>'+esc(s.phone||'—')+'</td><td>'+esc(s.email||'—')+'</td><td><span class="fpur-chip '+(s.active!==false?'ok':'off')+'">'+(s.active!==false?'ATIVO':'INATIVO')+'</span></td><td><button class="fds-btn" data-supplier="'+esc(s.id)+'">Editar</button></td></tr>').join('')+
      '</tbody></table></div>';
  }
  function statusClass(s){return s==='RECEBIDO'?'ok':s==='CANCELADO'?'off':s==='PEDIDO_EMITIDO'?'blue':'warn'}

  function requestNumber(ops){
    const n=(ops.purchaseRequests||[]).map(r=>Number(String(r.number||'').replace(/\D/g,''))||0);
    return 'RC-'+String(Math.max(0,...n)+1).padStart(5,'0');
  }
  function openRequest(code,id){
    const ops=load(),existing=id?(ops.purchaseRequests||[]).find(r=>String(r.id)===String(id)):null;
    const need=code?needs(ops).find(n=>String(n.code)===String(code)):null;
    const r=existing||{id:'pr_'+Date.now(),number:requestNumber(ops),code:need?.code||'',material:need?.name||'',unit:need?.unit||'',qty:need?.required||0,status:'NECESSIDADE',createdAt:Date.now(),createdBy:window.FocadoAuth?.getUser?.()?.name||'Compras'};
    const suppliers=(ops.suppliers||[]).filter(s=>s.active!==false);
    content().innerHTML='<div class="fds-page"><div class="fpur-head"><div><button class="fds-btn" id="fpurBack">← Compras</button><h1>'+esc(r.number)+'</h1><p>Requisição de compra</p></div><button class="fds-btn" id="fpurSave">Salvar requisição</button></div>'+
      '<div class="fds-card"><div class="fds-grid">'+
        field('Código do insumo','prCode',r.code)+field('Insumo','prMaterial',r.material)+field('Quantidade','prQty',r.qty,'number')+field('Unidade','prUnit',r.unit)+
        '<label class="fds-field"><span>Fornecedor</span><select class="fds-input" id="prSupplier"><option value="">A definir</option>'+suppliers.map(s=>'<option value="'+esc(s.id)+'" '+(String(s.id)===String(r.supplierId||'')?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>'+
        field('Valor unitário','prPrice',money(r.unitPrice),'text')+field('Previsão de entrega','prExpected',r.expectedDate,'date')+
        '<label class="fds-field"><span>Status</span><select class="fds-input" id="prStatus">'+['NECESSIDADE','COTACAO','APROVADO','PEDIDO_EMITIDO','CANCELADO'].map(s=>'<option '+(s===r.status?'selected':'')+'>'+s+'</option>').join('')+'</select></label>'+
        '<label class="fds-field fpur-span-2"><span>Observações</span><textarea class="fds-input" id="prNotes">'+esc(r.notes||'')+'</textarea></label>'+
      '</div></div></div>';
    document.getElementById('fpurBack').onclick=render;
    const price=document.getElementById('prPrice');window.FocadoDS?.bindMoneyInput?.(price);
    document.getElementById('fpurSave').onclick=async()=>{
      const supplier=suppliers.find(s=>String(s.id)===String(document.getElementById('prSupplier').value));
      const req={...r,code:document.getElementById('prCode').value.trim(),material:document.getElementById('prMaterial').value.trim(),qty:Math.max(0,Number(document.getElementById('prQty').value)||0),unit:document.getElementById('prUnit').value.trim(),supplierId:supplier?.id||'',supplierName:supplier?.name||'',unitPrice:parseMoney(document.getElementById('prPrice').value),expectedDate:document.getElementById('prExpected').value,status:document.getElementById('prStatus').value,notes:document.getElementById('prNotes').value.trim(),updatedAt:Date.now()};
      if(!req.code||!req.material||!(req.qty>0)){alert('Informe código, insumo e quantidade.');return}
      const res=await window.FocadoDataStore.saveDomain('COMPRAS',{request:req},null);
      if(!res?.ok){alert('Não foi possível salvar a requisição.');return}
      await window.FocadoDataStore.load();tab='requests';render();
    };
  }
  function field(label,id,val,type='text'){return '<label class="fds-field"><span>'+label+'</span><input class="fds-input" id="'+id+'" type="'+type+'" value="'+esc(val??'')+'"></label>'}

  async function receiveRequest(id){
    const ops=load(),r=(ops.purchaseRequests||[]).find(x=>String(x.id)===String(id));if(!r)return;
    const raw=prompt('Quantidade recebida ('+(r.unit||'')+'):',String(r.qty||0));if(raw===null)return;
    const qty=Number(String(raw).replace(',','.'));if(!(qty>0)){alert('Quantidade inválida.');return}
    if(!confirm('Confirmar recebimento de '+qty+' '+(r.unit||'')+' de '+r.material+'?\n\nO estoque de insumos será atualizado.'))return;
    const res=await window.FocadoDataStore.saveDomain('COMPRAS',{request:{...r,status:'PEDIDO_EMITIDO'},receive:{requestId:r.id,qty,receivedAt:Date.now(),user:window.FocadoAuth?.getUser?.()?.name||'Compras'}},null);
    if(!res?.ok){alert('Não foi possível registrar o recebimento.');return}
    await window.FocadoDataStore.load();tab='requests';render();
  }

  function openSupplier(id){
    const ops=load(),existing=(ops.suppliers||[]).find(s=>String(s.id)===String(id)),s=existing||{id:'sup_'+Date.now(),active:true};
    content().innerHTML='<div class="fds-page"><div class="fpur-head"><div><button class="fds-btn" id="fsBack">← Compras</button><h1>'+(existing?'Editar fornecedor':'Novo fornecedor')+'</h1></div><button class="fds-btn" id="fsSave">Salvar fornecedor</button></div>'+
      '<div class="fds-card"><div class="fds-grid">'+field('Fornecedor','fsName',s.name)+field('CNPJ','fsCnpj',s.cnpj)+field('Contato','fsContact',s.contact)+field('Telefone','fsPhone',s.phone)+field('E-mail','fsEmail',s.email,'email')+
      '<label class="fds-field"><span>Status</span><select class="fds-input" id="fsActive"><option value="SIM" '+(s.active!==false?'selected':'')+'>Ativo</option><option value="NAO" '+(s.active===false?'selected':'')+'>Inativo</option></select></label>'+
      '<label class="fds-field fpur-span-2"><span>Observações</span><textarea class="fds-input" id="fsNotes">'+esc(s.notes||'')+'</textarea></label></div></div></div>';
    document.getElementById('fsBack').onclick=render;
    document.getElementById('fsSave').onclick=async()=>{
      const supplier={...s,name:document.getElementById('fsName').value.trim(),cnpj:document.getElementById('fsCnpj').value.trim(),contact:document.getElementById('fsContact').value.trim(),phone:document.getElementById('fsPhone').value.trim(),email:document.getElementById('fsEmail').value.trim(),active:document.getElementById('fsActive').value==='SIM',notes:document.getElementById('fsNotes').value.trim(),updatedAt:Date.now()};
      if(!supplier.name){alert('Informe o nome do fornecedor.');return}
      const res=await window.FocadoDataStore.saveDomain('COMPRAS',{supplier},null);
      if(!res?.ok){alert('Não foi possível salvar o fornecedor.');return}
      await window.FocadoDataStore.load();tab='suppliers';render();
    };
  }

  window.FocadoPurchases={render};
})();