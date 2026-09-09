(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const normCnpj=v=>String(v||'').replace(/\D/g,'');
  const fmtCnpj=v=>{const d=normCnpj(v).slice(0,14);return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,'$1.$2.$3/$4-$5')};
  let state={q:''};
  let lastCnpjConsulted='';
  let cnpjRequestSeq=0;

  function isValidCnpj(value){
    const cnpj=normCnpj(value);
    if(cnpj.length!==14||/^(\d)\1{13}$/.test(cnpj))return false;
    const calc=(base,weights)=>{
      const sum=base.split('').reduce((acc,n,i)=>acc+(Number(n)*weights[i]),0);
      const mod=sum%11;
      return mod<2?0:11-mod;
    };
    const d1=calc(cnpj.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
    const d2=calc(cnpj.slice(0,12)+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
    return cnpj.endsWith(String(d1)+String(d2));
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
      map.set(key,{...prev,id:prev.id||'legacy_'+key,name:prev.name||o.client||'',cnpj:prev.cnpj||o.cnpj||'',email:prev.email||o.email||'',phone:prev.phone||o.phone||'',cep:prev.cep||o.cep||'',bairro:prev.bairro||o.bairro||'',city:prev.city||o.city||'',state:prev.state||o.uf||o.state||'',address:prev.address||o.deliveryAddress||'',representative:prev.representative||o.representative||'',active:prev.active!==false,source:prev.source||'PEDIDO'});
    }
    return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }

  function render(s){
    state=s||state;
    const ops=load(),all=aggregate(ops),q=String(state.q||'').toLowerCase();
    const rows=all.filter(c=>!q||[c.name,c.cnpj,c.email,c.phone,c.city,c.state,c.representative].some(v=>String(v||'').toLowerCase().includes(q)));
    content().innerHTML='<div class="fc-page"><div class="fc-head"><div><h1>Clientes</h1><p>Cadastro mestre e clientes já utilizados nos pedidos comerciais</p></div><button class="fc-btn primary" id="fcNew">+ Cadastrar cliente</button></div><div class="fc-toolbar"><div class="fc-search-wrap"><span>⌕</span><input id="fcSearch" placeholder="Pesquisar cliente por nome, CNPJ, cidade, e-mail ou telefone" value="'+esc(state.q||'')+'"></div><span class="fc-muted">'+rows.length+' cliente(s)</span></div><div class="fc-table-wrap">'+table(rows)+'</div></div>';
    document.getElementById('fcNew').onclick=()=>openForm();
    document.getElementById('fcSearch').oninput=e=>render({q:e.target.value});
    document.querySelectorAll('[data-fc-open]').forEach(b=>b.onclick=()=>openForm(b.dataset.fcOpen));
  }

  function table(rows){
    if(!rows.length)return '<div class="fc-empty">Nenhum cliente encontrado.</div>';
    return '<table class="fc-table"><thead><tr><th>Cliente</th><th>CNPJ</th><th>E-mail</th><th>Telefone</th><th>Cidade / UF</th><th>Endereço</th><th>Representante</th><th>Status</th><th></th></tr></thead><tbody>'+rows.map(c=>'<tr><td><b>'+esc(c.name||'—')+'</b></td><td>'+esc(fmtCnpj(c.cnpj)||'—')+'</td><td>'+esc(c.email||'—')+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc([c.city,c.state].filter(Boolean).join(' / ')||'—')+'</td><td>'+esc(c.address||'—')+'</td><td>'+esc(c.representative||'—')+'</td><td><span class="fc-chip '+(c.active!==false?'ok':'off')+'">'+(c.active!==false?'Ativo':'Inativo')+'</span></td><td><button class="fc-btn primary small" data-fc-open="'+esc(c.id)+'">Abrir</button></td></tr>').join('')+'</tbody></table>';
  }

  function findCustomer(ops,id){return aggregate(ops).find(c=>String(c.id)===String(id))}

  function openForm(id){
    const ops=load(),existing=id?findCustomer(ops,id):null;
    const c=existing||{id:'cli_'+Date.now(),active:true,createdAt:Date.now()};
    lastCnpjConsulted=normCnpj(c.cnpj);
    content().innerHTML='<div class="fc-page"><div class="fc-head"><div><button class="fc-btn primary" id="fcBack">← Clientes</button><h1>'+(existing?'Editar cliente':'Cadastrar cliente')+'</h1><p>Dados comerciais e de contato do cliente</p></div><button class="fc-btn primary" id="fcSave">Salvar cliente</button></div><div class="fc-card"><div class="fc-grid">'+cnpjField(c.cnpj,!!existing)+field('Cliente / Razão social','fcName',c.name,'text','wide')+field('E-mail','fcEmail',c.email,'email')+field('Telefone','fcPhone',c.phone)+field('CEP','fcCep',c.cep)+field('Bairro','fcBairro',c.bairro)+field('Cidade','fcCity',c.city)+field('UF','fcState',c.state)+field('Representante','fcRepresentative',c.representative)+select('Status','fcActive',c.active!==false?'ATIVO':'INATIVO',['ATIVO','INATIVO'])+'<label class="fc-field wide"><span>Endereço / Local de entrega</span><textarea id="fcAddress">'+esc(c.address||'')+'</textarea></label><label class="fc-field wide"><span>Observações</span><textarea id="fcNotes">'+esc(c.notes||'')+'</textarea></label></div></div></div>';
    document.getElementById('fcBack').onclick=()=>render(state);
    const cnpj=document.getElementById('fcCnpj');
    const updateBtn=document.getElementById('fcCnpjUpdate');
    cnpj.oninput=()=>{
      cnpj.value=fmtCnpj(cnpj.value);
      const digits=normCnpj(cnpj.value);
      if(digits.length<14){setCnpjStatus('', '');if(updateBtn)updateBtn.hidden=true;return}
      if(!isValidCnpj(digits)){setCnpjStatus('CNPJ inválido. Verifique os números.','error');if(updateBtn)updateBtn.hidden=true;return}
      if(digits===lastCnpjConsulted){setCnpjStatus('CNPJ válido.','ok');if(updateBtn)updateBtn.hidden=true;return}
      if(existing){setCnpjStatus('CNPJ válido. Para substituir os dados cadastrais, clique em “Atualizar dados pelo CNPJ”.','');if(updateBtn)updateBtn.hidden=false;return}
      consultCnpj(digits,{overwrite:true});
    };
    cnpj.onblur=()=>{
      const digits=normCnpj(cnpj.value);
      if(!existing&&digits.length===14&&isValidCnpj(digits)&&digits!==lastCnpjConsulted)consultCnpj(digits,{overwrite:true});
    };
    if(updateBtn)updateBtn.onclick=()=>{
      const digits=normCnpj(cnpj.value);
      if(!isValidCnpj(digits)){setCnpjStatus('CNPJ inválido. Verifique os números.','error');return}
      consultCnpj(digits,{overwrite:true});
    };
    document.getElementById('fcSave').onclick=()=>saveCustomer(c);
    if(!existing)setTimeout(()=>cnpj.focus(),0);
  }

  function cnpjField(val,isEditing){
    return '<label class="fc-field wide"><span>CNPJ</span><div style="display:flex;gap:8px;align-items:center"><input style="flex:1" id="fcCnpj" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" value="'+esc(fmtCnpj(val))+'"><button type="button" class="fc-btn small" id="fcCnpjUpdate" '+(isEditing?'hidden':'hidden')+'>Atualizar dados pelo CNPJ</button></div><small id="fcCnpjStatus" class="fc-muted" aria-live="polite"></small></label>';
  }

  function field(label,id,val,type='text',cls=''){return '<label class="fc-field '+cls+'"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+esc(val||'')+'"></label>'}
  function select(label,id,val,opts){return '<label class="fc-field"><span>'+label+'</span><select id="'+id+'">'+opts.map(x=>'<option '+(x===val?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'}

  function setCnpjStatus(message,type){
    const el=document.getElementById('fcCnpjStatus');
    if(!el)return;
    el.textContent=message||'';
    el.style.color=type==='error'?'#b42318':type==='ok'?'#027a48':'';
  }

  function setValue(id,value,overwrite){
    if(value===undefined||value===null||value==='')return;
    const el=document.getElementById(id);
    if(!el)return;
    if(overwrite||!String(el.value||'').trim())el.value=String(value).trim();
  }

  function buildAddress(data){
    const street=[data.descricao_tipo_de_logradouro,data.logradouro].filter(Boolean).join(' ').trim();
    return [street,data.numero,data.complemento].filter(Boolean).join(', ');
  }

  async function consultCnpj(cnpj,{overwrite=false}={}){
    const digits=normCnpj(cnpj);
    if(!isValidCnpj(digits)){setCnpjStatus('CNPJ inválido. Verifique os números.','error');return}
    if(digits===lastCnpjConsulted){setCnpjStatus('CNPJ já consultado nesta tela.','ok');return}
    const requestId=++cnpjRequestSeq;
    setCnpjStatus('Consultando CNPJ na BrasilAPI…','');
    try{
      const res=await fetch('https://brasilapi.com.br/api/cnpj/v1/'+digits,{headers:{Accept:'application/json'}});
      if(requestId!==cnpjRequestSeq)return;
      if(!res.ok){
        setCnpjStatus(res.status===404?'CNPJ não encontrado. Preencha os dados manualmente.':'Não foi possível consultar o CNPJ agora. Preencha os dados manualmente.','error');
        return;
      }
      const data=await res.json();
      if(requestId!==cnpjRequestSeq)return;
      lastCnpjConsulted=digits;
      setValue('fcName',data.razao_social||data.nome_fantasia,overwrite);
      setValue('fcEmail',data.email,overwrite);
      setValue('fcPhone',data.ddd_telefone_1||data.ddd_telefone_2,overwrite);
      setValue('fcCep',String(data.cep||'').replace(/\D/g,''),overwrite);
      setValue('fcBairro',data.bairro,overwrite);
      setValue('fcCity',data.municipio,overwrite);
      setValue('fcState',data.uf,overwrite);
      setValue('fcAddress',buildAddress(data),overwrite);
      const updateBtn=document.getElementById('fcCnpjUpdate');
      if(updateBtn)updateBtn.hidden=true;
      setCnpjStatus('Dados encontrados e preenchidos automaticamente. Revise antes de salvar.','ok');
    }catch(_){
      if(requestId!==cnpjRequestSeq)return;
      setCnpjStatus('Consulta indisponível no momento. Você pode continuar o cadastro manualmente.','error');
    }
  }

  async function saveCustomer(base){
    const customer={...base,id:base.id||'cli_'+Date.now(),name:document.getElementById('fcName').value.trim(),cnpj:normCnpj(document.getElementById('fcCnpj').value),email:document.getElementById('fcEmail').value.trim(),phone:document.getElementById('fcPhone').value.trim(),cep:document.getElementById('fcCep').value.trim(),bairro:document.getElementById('fcBairro').value.trim(),city:document.getElementById('fcCity').value.trim(),state:document.getElementById('fcState').value.trim().toUpperCase().slice(0,2),representative:document.getElementById('fcRepresentative').value.trim(),active:document.getElementById('fcActive').value==='ATIVO',address:document.getElementById('fcAddress').value.trim(),notes:document.getElementById('fcNotes').value.trim(),updatedAt:Date.now()};
    if(!customer.cnpj){alert('Informe o CNPJ do cliente.');return}
    if(!isValidCnpj(customer.cnpj)){alert('Informe um CNPJ válido.');return}
    if(!customer.name){alert('Informe o nome do cliente.');return}
    if(customer.email&&!/^\S+@\S+\.\S+$/.test(customer.email)){alert('Informe um e-mail válido.');return}
    const res=await window.FocadoDataStore.saveDomain('CLIENTES',{customer},null);
    if(!res?.ok){alert('Não foi possível salvar o cliente.');return}
    if(res?.payload)window.FocadoDataStore.writeLocal(res.payload);
    const refreshed=await window.FocadoDataStore.refreshDomainV2('customers');
    if(!refreshed?.ok&&res?.payload)window.FocadoDataStore.writeLocal(res.payload);
    render(state);
  }

  window.FocadoCustomers={render,openForm};
})();