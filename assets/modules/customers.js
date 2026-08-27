(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const normCnpj=v=>String(v||'').replace(/\D/g,'');
  const fmtCnpj=v=>{const d=normCnpj(v).slice(0,14);return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,'$1.$2.$3/$4-$5')};
  const today=()=>new Date().toISOString().slice(0,10);
  let state={q:''};

  function aggregate(ops){
    const map=new Map();
    for(const c of ops.customers||[]){
      const key=normCnpj(c.cnpj)||String(c.name||c.client||'').toLowerCase();
      if(!key)continue;
      map.set(key,{...c,source:'CADASTRO'});
    }
    for(const o of ops.orders||[]){
      const key=normCnpj(o.cnpj)||String(o.client||'').toLowerCase();
      if(!key)continue;
      const prev=map.get(key)||{};
      map.set(key,{
        ...prev,
        id:prev.id||'legacy_'+key,
        name:prev.name||o.client||'',
        cnpj:prev.cnpj||o.cnpj||'',
        email:prev.email||o.email||'',
        phone:prev.phone||o.phone||'',
        cep:prev.cep||o.cep||'',
        bairro:prev.bairro||o.bairro||'',
        city:prev.city||o.city||'',
        state:prev.state||o.uf||o.state||'',
        address:prev.address||o.deliveryAddress||'',
        representative:prev.representative||o.representative||'',
        active:prev.active!==false,
        source:prev.source||'PEDIDO'
      });
    }
    return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }

  function render(s){
    state=s||state;
    const ops=load(),all=aggregate(ops),q=String(state.q||'').toLowerCase();
    const rows=all.filter(c=>!q||[c.name,c.cnpj,c.email,c.phone,c.city,c.state,c.representative].some(v=>String(v||'').toLowerCase().includes(q)));
    content().innerHTML='<div class="fc-page">'+
      '<div class="fc-head"><div><h1>Clientes</h1><p>Cadastro mestre e clientes já utilizados nos pedidos comerciais</p></div><button class="fc-btn primary" id="fcNew">+ Cadastrar cliente</button></div>'+
      '<div class="fc-toolbar"><div class="fc-search-wrap"><span>⌕</span><input id="fcSearch" placeholder="Pesquisar cliente por nome, CNPJ, cidade, e-mail ou telefone" value="'+esc(state.q||'')+'"></div><span class="fc-muted">'+rows.length+' cliente(s)</span></div>'+
      '<div class="fc-table-wrap">'+table(rows)+'</div></div>';
    document.getElementById('fcNew').onclick=()=>openForm();
    document.getElementById('fcSearch').oninput=e=>render({q:e.target.value});
    document.querySelectorAll('[data-fc-open]').forEach(b=>b.onclick=()=>openForm(b.dataset.fcOpen));
  }

  function table(rows){
    if(!rows.length)return '<div class="fc-empty">Nenhum cliente encontrado.</div>';
    return '<table class="fc-table"><thead><tr><th>Cliente</th><th>CNPJ</th><th>E-mail</th><th>Telefone</th><th>Cidade / UF</th><th>Endereço</th><th>Representante</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(c=>'<tr><td><b>'+esc(c.name||'—')+'</b></td><td>'+esc(fmtCnpj(c.cnpj)||'—')+'</td><td>'+esc(c.email||'—')+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc([c.city,c.state].filter(Boolean).join(' / ')||'—')+'</td><td>'+esc(c.address||'—')+'</td><td>'+esc(c.representative||'—')+'</td><td><span class="fc-chip '+(c.active!==false?'ok':'off')+'">'+(c.active!==false?'Ativo':'Inativo')+'</span></td><td><button class="fc-btn primary small" data-fc-open="'+esc(c.id)+'">Abrir</button></td></tr>').join('')+'</tbody></table>';
  }

  function findCustomer(ops,id){
    return aggregate(ops).find(c=>String(c.id)===String(id));
  }

  function openForm(id){
    const ops=load(),existing=id?findCustomer(ops,id):null;
    const c=existing||{id:'cli_'+Date.now(),active:true,createdAt:Date.now()};
    content().innerHTML='<div class="fc-page">'+
      '<div class="fc-head"><div><button class="fc-btn primary" id="fcBack">← Clientes</button><h1>'+(existing?'Editar cliente':'Cadastrar cliente')+'</h1><p>Dados comerciais e de contato do cliente</p></div><button class="fc-btn primary" id="fcSave">Salvar cliente</button></div>'+
      '<div class="fc-card"><div class="fc-grid">'+
        field('Cliente / Razão social','fcName',c.name,'text','wide')+
        field('CNPJ','fcCnpj',fmtCnpj(c.cnpj))+
        field('E-mail','fcEmail',c.email,'email')+
        field('Telefone','fcPhone',c.phone)+
        field('CEP','fcCep',c.cep)+
        field('Bairro','fcBairro',c.bairro)+
        field('Cidade','fcCity',c.city)+
        field('UF','fcState',c.state)+
        field('Representante','fcRepresentative',c.representative)+
        select('Status','fcActive',c.active!==false? 'ATIVO':'INATIVO',['ATIVO','INATIVO'])+
        '<label class="fc-field wide"><span>Endereço / Local de entrega</span><textarea id="fcAddress">'+esc(c.address||'')+'</textarea></label>'+
        '<label class="fc-field wide"><span>Observações</span><textarea id="fcNotes">'+esc(c.notes||'')+'</textarea></label>'+
      '</div></div></div>';
    document.getElementById('fcBack').onclick=()=>render(state);
    const cnpj=document.getElementById('fcCnpj');
    cnpj.oninput=()=>{cnpj.value=fmtCnpj(cnpj.value)};
    document.getElementById('fcSave').onclick=()=>saveCustomer(c);
  }

  function field(label,id,val,type='text',cls=''){
    return '<label class="fc-field '+cls+'"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+esc(val||'')+'"></label>';
  }
  function select(label,id,val,opts){
    return '<label class="fc-field"><span>'+label+'</span><select id="'+id+'">'+opts.map(x=>'<option '+(x===val?'selected':'')+'>'+x+'</option>').join('')+'</select></label>';
  }

  async function saveCustomer(base){
    const customer={
      ...base,
      id:base.id||'cli_'+Date.now(),
      name:document.getElementById('fcName').value.trim(),
      cnpj:normCnpj(document.getElementById('fcCnpj').value),
      email:document.getElementById('fcEmail').value.trim(),
      phone:document.getElementById('fcPhone').value.trim(),
      cep:document.getElementById('fcCep').value.trim(),
      bairro:document.getElementById('fcBairro').value.trim(),
      city:document.getElementById('fcCity').value.trim(),
      state:document.getElementById('fcState').value.trim().toUpperCase().slice(0,2),
      representative:document.getElementById('fcRepresentative').value.trim(),
      active:document.getElementById('fcActive').value==='ATIVO',
      address:document.getElementById('fcAddress').value.trim(),
      notes:document.getElementById('fcNotes').value.trim(),
      updatedAt:Date.now()
    };
    if(!customer.name){alert('Informe o nome do cliente.');return}
    if(customer.cnpj&&customer.cnpj.length!==14){alert('Informe um CNPJ válido com 14 dígitos.');return}
    if(customer.email&&!/^\S+@\S+\.\S+$/.test(customer.email)){alert('Informe um e-mail válido.');return}
    const res=await window.FocadoDataStore.saveDomain('CLIENTES',{customer},null);
    if(!res?.ok){alert('Não foi possível salvar o cliente.');return}
    await window.FocadoDataStore.load();
    render(state);
  }

  window.FocadoCustomers={render,openForm};
})();