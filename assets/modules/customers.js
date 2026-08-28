(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const normCnpj=v=>String(v||'').replace(/\D/g,'');
  const fmtCnpj=v=>{const d=normCnpj(v).slice(0,14);return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,'$1.$2.$3/$4-$5')};
  const today=()=>new Date().toISOString().slice(0,10);
  const apiBase=()=>String(window.FocadoDataStore?.getConfig?.().apiBaseUrl||'').replace(/\/$/,'');
  const token=()=>window.FocadoDataStore?.getSessionToken?.()||'';
  let state={q:''};
  const currentRole=()=>{
    const modern=String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
    if(modern)return modern;
    const userRole=String(window.FocadoAuth?.getUser?.()?.role||'').toUpperCase();
    if(userRole)return userRole;
    const legacy=String(sessionStorage.getItem('nova-era-role')||'').toLowerCase();
    if(legacy==='admin')return 'ADMIN';
    const label=String(sessionStorage.getItem('nova-era-role-label')||'').toLowerCase();
    if(label.includes('administrador'))return 'ADMIN';
    if(label.includes('diretor'))return 'DIRETOR';
    if(label.includes('gestor'))return 'GESTOR';
    return '';
  };
  const canEditExisting=()=>['ADMIN','DIRETOR','GESTOR'].includes(currentRole());


  async function lookupCnpj(value){
    const d=normCnpj(value);
    if(d.length!==14)throw Object.assign(new Error('INVALID_CNPJ'),{status:400});
    const base=apiBase();
    if(base&&token()){
      try{
        const res=await fetch(base+'/api/cnpj/'+encodeURIComponent(d),{
          headers:{Authorization:'Bearer '+token(),accept:'application/json'},cache:'no-store'
        });
        const body=await res.json().catch(()=>({}));
        if(res.ok)return body;
        if(res.status===404)throw Object.assign(new Error('CNPJ_NOT_FOUND'),{status:404});
      }catch(err){
        if(err?.status===404)throw err;
        console.warn('[FocadoCustomers] API CNPJ principal indisponível; tentando fallback',err);
      }
    }
    const res=await fetch('https://brasilapi.com.br/api/cnpj/v1/'+encodeURIComponent(d),{headers:{accept:'application/json'},cache:'no-store'});
    if(!res.ok)throw Object.assign(new Error(res.status===404?'CNPJ_NOT_FOUND':'CNPJ_LOOKUP_FAILED'),{status:res.status});
    const b=await res.json();
    return {
      cnpj:b.cnpj||d,
      razaoSocial:b.razao_social||'',
      nomeFantasia:b.nome_fantasia||'',
      descricaoSituacao:b.descricao_situacao_cadastral||'',
      cep:b.cep||'',
      logradouro:b.logradouro||'',
      numero:b.numero||'',
      complemento:b.complemento||'',
      bairro:b.bairro||'',
      municipio:b.municipio||'',
      uf:b.uf||'',
      dddTelefone1:b.ddd_telefone_1||'',
      email:b.email||''
    };
  }

  function addressFromCnpj(d){
    return [d.logradouro,d.numero,d.complemento].filter(Boolean).join(', ');
  }

  function applyCnpjData(d){
    const set=(id,value,overwrite=true)=>{
      const el=document.getElementById(id);if(!el||value==null||String(value).trim()==='')return;
      if(overwrite||!String(el.value||'').trim())el.value=String(value).trim();
    };
    set('fcName',d.razaoSocial||d.nomeFantasia||'',true);
    set('fcFantasyName',d.nomeFantasia||'',true);
    set('fcCep',d.cep||'',true);
    set('fcBairro',d.bairro||'',true);
    set('fcCity',d.municipio||'',true);
    set('fcState',(d.uf||'').toUpperCase(),true);
    set('fcAddress',addressFromCnpj(d),true);
    set('fcPhone',d.dddTelefone1||'',false);
    set('fcEmail',d.email||'',false);
  }

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
        representativeId:prev.representativeId||o.representativeId||'',
        active:prev.active!==false,
        source:prev.source||'PEDIDO'
      });
    }
    return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }

  function render(s){
    state=s||state;
    const ops=load(),all=aggregate(ops),q=String(state.q||'').toLowerCase();
    const rows=all.filter(c=>!q||[c.name,c.fantasyName,c.cnpj,c.email,c.phone,c.city,c.state,c.representative].some(v=>String(v||'').toLowerCase().includes(q)));
    content().innerHTML='<div class="fc-page">'+
      '<div class="fc-head"><div><h1>Clientes</h1><p>Cadastro mestre e clientes já utilizados nos pedidos comerciais</p></div><button class="fc-btn primary" id="fcNew">+ Cadastrar cliente</button></div>'+
      '<div class="fc-toolbar"><div class="fc-search-wrap"><span>⌕</span><input id="fcSearch" placeholder="Pesquisar cliente por nome, CNPJ, cidade, e-mail ou telefone" value="'+esc(state.q||'')+'"></div><span class="fc-muted">'+rows.length+' cliente(s)</span></div>'+
      '<div class="fc-table-wrap">'+table(rows)+'</div></div>';
    document.getElementById('fcNew').onclick=()=>openForm();
    document.getElementById('fcSearch').oninput=e=>render({q:e.target.value});
    document.querySelectorAll('[data-fc-open]').forEach(b=>b.onclick=()=>openForm(b.dataset.fcOpen,false));
    document.querySelectorAll('[data-fc-edit]').forEach(b=>b.onclick=()=>openForm(b.dataset.fcEdit,true));
  }

  function table(rows){
    if(!rows.length)return '<div class="fc-empty">Nenhum cliente encontrado.</div>';
    const allowEdit=canEditExisting();
    return '<table class="fc-table"><thead><tr><th>Cliente</th><th>CNPJ</th><th>E-mail</th><th>Telefone</th><th>Cidade / UF</th><th>Endereço</th><th>Representante</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(c=>'<tr><td><b>'+esc(c.name||'—')+'</b>'+(c.fantasyName?'<small>'+esc(c.fantasyName)+'</small>':'')+'</td><td>'+esc(fmtCnpj(c.cnpj)||'—')+'</td><td>'+esc(c.email||'—')+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc([c.city,c.state].filter(Boolean).join(' / ')||'—')+'</td><td>'+esc(c.address||'—')+'</td><td>'+esc(c.representative||'—')+'</td><td><span class="fc-chip '+(c.active!==false?'ok':'off')+'">'+(c.active!==false?'Ativo':'Inativo')+'</span></td><td><div class="fc-actions"><button class="fc-btn primary small" data-fc-open="'+esc(c.id)+'">Abrir</button>'+(allowEdit?'<button class="fc-btn secondary small" data-fc-edit="'+esc(c.id)+'">Editar</button>':'')+'</div></td></tr>').join('')+'</tbody></table>';
  }

  function findCustomer(ops,id){
    return aggregate(ops).find(c=>String(c.id)===String(id));
  }

  function representativeSelect(ops,customer){
    const all=(Array.isArray(ops.representatives)?ops.representatives:[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    let selectedId=String(customer?.representativeId||'');
    if(!selectedId&&customer?.representative){
      const byName=all.find(r=>String(r.name||'').trim().toLowerCase()===String(customer.representative||'').trim().toLowerCase()||
        String(r.fantasyName||'').trim().toLowerCase()===String(customer.representative||'').trim().toLowerCase());
      if(byName)selectedId=String(byName.id||'');
    }
    const visible=all.filter(r=>r.active!==false||String(r.id||'')===selectedId);
    return '<label class="fc-field"><span>Representante</span><select id="fcRepresentative"><option value="">Selecione um representante</option>'+
      visible.map(r=>{
        const label=[r.name,r.fantasyName&&r.fantasyName!==r.name?'('+r.fantasyName+')':'',r.active===false?'— inativo':''].filter(Boolean).join(' ');
        return '<option value="'+esc(r.id||'')+'" '+(String(r.id||'')===selectedId?'selected':'')+'>'+esc(label)+'</option>';
      }).join('')+
      '</select><small class="fc-rep-hint">'+(visible.length?'Lista vinculada ao cadastro de Representantes.':'Nenhum representante ativo cadastrado.')+'</small></label>';
  }

  function openForm(id,editMode=false){
    if(id&&editMode&&!canEditExisting()){alert('Seu perfil não possui permissão para editar clientes.');return}
    const ops=load(),existing=id?findCustomer(ops,id):null;
    const c=existing||{id:'cli_'+Date.now(),active:true,createdAt:Date.now()};
    const readonlyExisting=Boolean(existing&&!editMode);
    content().innerHTML='<div class="fc-page">'+
      '<div class="fc-head"><div><button class="fc-btn primary" id="fcBack">← Clientes</button><h1>'+(existing?(editMode?'Editar cliente':'Cliente'):'Cadastrar cliente')+'</h1><p>'+(readonlyExisting?'Consulta do cadastro existente':'Dados comerciais e de contato do cliente')+'</p></div>'+(!readonlyExisting?'<button class="fc-btn primary" id="fcSave">Salvar cliente</button>':'')+'</div>'+
      '<div class="fc-card"><div class="fc-grid">'+
        field('Cliente / Razão social','fcName',c.name,'text','wide')+
        field('Nome fantasia','fcFantasyName',c.fantasyName)+
        '<label class="fc-field"><span>CNPJ</span><div class="fc-cnpj-wrap"><input id="fcCnpj" inputmode="numeric" value="'+esc(fmtCnpj(c.cnpj)||'')+'" placeholder="00.000.000/0000-00"><button type="button" id="fcLookupCnpj">Consultar</button></div><small id="fcCnpjStatus" class="fc-cnpj-status"></small></label>'+
        field('E-mail','fcEmail',c.email,'email')+
        field('Telefone','fcPhone',c.phone)+
        field('CEP','fcCep',c.cep)+
        field('Bairro','fcBairro',c.bairro)+
        field('Cidade','fcCity',c.city)+
        field('UF','fcState',c.state)+
        representativeSelect(ops,c)+
        field('Condição de pagamento','fcPaymentTerms',c.paymentTerms)+
        select('Status','fcActive',c.active!==false? 'ATIVO':'INATIVO',['ATIVO','INATIVO'])+
        '<label class="fc-field wide"><span>Endereço / Local de entrega</span><textarea id="fcAddress">'+esc(c.address||'')+'</textarea></label>'+
        '<label class="fc-field wide"><span>Observações</span><textarea id="fcNotes">'+esc(c.notes||'')+'</textarea></label>'+
      '</div></div></div>';
    document.getElementById('fcBack').onclick=()=>render(state);
    const cnpj=document.getElementById('fcCnpj'),cnpjStatus=document.getElementById('fcCnpjStatus'),lookupBtn=document.getElementById('fcLookupCnpj');
    cnpj.oninput=()=>{cnpj.value=fmtCnpj(cnpj.value);cnpjStatus.textContent='';cnpjStatus.className='fc-cnpj-status'};
    async function runLookup(){
      const raw=normCnpj(cnpj.value);cnpj.value=fmtCnpj(raw);
      if(raw.length!==14){cnpjStatus.textContent='Informe os 14 dígitos do CNPJ.';cnpjStatus.className='fc-cnpj-status bad';return false}
      lookupBtn.disabled=true;lookupBtn.textContent='Consultando...';cnpjStatus.textContent='Consultando CNPJ...';cnpjStatus.className='fc-cnpj-status';
      try{
        const data=await lookupCnpj(raw);applyCnpjData(data);
        cnpjStatus.textContent='CNPJ localizado. Dados cadastrais preenchidos automaticamente.';cnpjStatus.className='fc-cnpj-status ok';return true;
      }catch(err){
        console.warn('[FocadoCustomers] consulta CNPJ falhou',err);
        cnpjStatus.textContent=err?.status===404?'CNPJ não encontrado.':'Não foi possível consultar o CNPJ agora. Você pode tentar novamente.';cnpjStatus.className='fc-cnpj-status bad';return false;
      }finally{lookupBtn.disabled=false;lookupBtn.textContent='Consultar'}
    }
    lookupBtn.onclick=runLookup;
    cnpj.onblur=()=>{if(normCnpj(cnpj.value).length===14&&!cnpjStatus.textContent)runLookup()};
    if(readonlyExisting){
      content().querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
      lookupBtn.disabled=true;
    }
    const saveBtn=document.getElementById('fcSave');
    if(saveBtn)saveBtn.onclick=()=>{
      if(existing&&!canEditExisting()){alert('Seu perfil não possui permissão para editar clientes.');return}
      saveCustomer(c);
    };
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
      fantasyName:document.getElementById('fcFantasyName').value.trim(),
      cnpj:normCnpj(document.getElementById('fcCnpj').value),
      email:document.getElementById('fcEmail').value.trim(),
      phone:document.getElementById('fcPhone').value.trim(),
      cep:document.getElementById('fcCep').value.trim(),
      bairro:document.getElementById('fcBairro').value.trim(),
      city:document.getElementById('fcCity').value.trim(),
      state:document.getElementById('fcState').value.trim().toUpperCase().slice(0,2),
      representativeId:document.getElementById('fcRepresentative').value,
      representative:(()=>{
        const id=document.getElementById('fcRepresentative').value;
        const rep=(load().representatives||[]).find(r=>String(r.id||'')===String(id));
        return rep?.name||'';
      })(),
      paymentTerms:document.getElementById('fcPaymentTerms').value.trim(),
      active:document.getElementById('fcActive').value==='ATIVO',
      address:document.getElementById('fcAddress').value.trim(),
      notes:document.getElementById('fcNotes').value.trim(),
      updatedAt:Date.now()
    };
    if(!customer.name){alert('Informe o nome do cliente.');return}
    if(!customer.paymentTerms){alert('Informe a condição de pagamento do cliente.');return}
    if(customer.cnpj&&customer.cnpj.length!==14){alert('Informe um CNPJ válido com 14 dígitos.');return}
    if(customer.email&&!/^\S+@\S+\.\S+$/.test(customer.email)){alert('Informe um e-mail válido.');return}
    const res=await window.FocadoDataStore.saveDomain('CLIENTES',{customer},null);
    if(!res?.ok){alert('Não foi possível salvar o cliente.');return}
    await window.FocadoDataStore.load();
    render(state);
  }

  window.FocadoCustomers={render,openForm};
})();