(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=()=>window.FocadoDataStore?.readLocal?.()||{};
  const save=async ops=>window.FocadoDataStore?.save?.(ops)||{ok:true,mode:'local'};

  function ensure(ops){
    ops.representatives=Array.isArray(ops.representatives)?ops.representatives:[];
    return ops.representatives;
  }
  function activeList(ops){
    return ensure(ops||load()).filter(r=>r.active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }
  function render(){
    const ops=load(), reps=ensure(ops).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    content().innerHTML='<div class="fr-page">'+
      '<div class="fr-head"><div><h1>Representantes</h1><p>Cadastro comercial usado diretamente nos Pedidos Comerciais.</p></div><button class="fr-btn primary" id="frNew">+ Novo representante</button></div>'+
      '<div class="fr-summary"><div><span>Ativos</span><strong>'+reps.filter(r=>r.active!==false).length+'</strong></div><div><span>Inativos</span><strong>'+reps.filter(r=>r.active===false).length+'</strong></div></div>'+
      '<div class="fr-card"><div class="fr-toolbar"><input id="frSearch" placeholder="Buscar por nome, CPF/CNPJ, cidade ou telefone"><select id="frStatus"><option value="TODOS">Todos</option><option value="ATIVOS">Ativos</option><option value="INATIVOS">Inativos</option></select></div>'+
      '<div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>E-mail</th><th>Cidade/UF</th><th>Comissão</th><th>Status</th><th></th></tr></thead><tbody id="frBody"></tbody></table></div></div>'+
      '<div class="fr-modal hidden" id="frModal"><div class="fr-modal-card"><h2 id="frTitle">Novo representante</h2><div class="fr-grid">'+
        field('Nome completo','frName')+field('CPF/CNPJ','frDoc')+field('Telefone','frPhone')+field('E-mail','frEmail','email')+
        field('Cidade','frCity')+field('UF','frUf')+field('Comissão (%)','frCommission','number')+field('Observações','frNotes')+
      '</div><div class="fr-actions"><button class="fr-btn" id="frCancel">Cancelar</button><button class="fr-btn primary" id="frSave">Salvar representante</button></div></div></div>'+
      '</div>';
    const q=document.getElementById('frSearch'), status=document.getElementById('frStatus'), body=document.getElementById('frBody');
    function paint(){
      const qq=q.value.trim().toLowerCase();
      const rows=reps.filter(r=>{
        const match=!qq||[r.name,r.document,r.phone,r.email,r.city,r.uf].some(v=>String(v||'').toLowerCase().includes(qq));
        const st=status.value==='TODOS'||(status.value==='ATIVOS'&&r.active!==false)||(status.value==='INATIVOS'&&r.active===false);
        return match&&st;
      });
      body.innerHTML=rows.map(r=>'<tr><td><b>'+esc(r.name)+'</b></td><td>'+esc(r.document||'—')+'</td><td>'+esc(r.phone||'—')+'</td><td>'+esc(r.email||'—')+'</td><td>'+esc([r.city,r.uf].filter(Boolean).join('/'))+'</td><td>'+((Number(r.commission)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))+'%</td><td><span class="fr-status '+(r.active===false?'off':'on')+'">'+(r.active===false?'Inativo':'Ativo')+'</span></td><td><div class="fr-row-actions"><button data-edit="'+esc(r.id)+'">Editar</button><button data-toggle="'+esc(r.id)+'">'+(r.active===false?'Ativar':'Inativar')+'</button></div></td></tr>').join('')||'<tr><td colspan="8" class="fr-empty">Nenhum representante encontrado.</td></tr>';
      body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openModal(reps.find(r=>r.id===b.dataset.edit)));
      body.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const r=reps.find(x=>x.id===b.dataset.toggle);if(!r)return;r.active=r.active===false?true:false;await save(ops);render()});
    }
    q.oninput=paint;status.onchange=paint;paint();

    const modal=document.getElementById('frModal');let editing=null;
    function openModal(r){
      editing=r||null;
      document.getElementById('frTitle').textContent=r?'Editar representante':'Novo representante';
      document.getElementById('frName').value=r?.name||'';
      document.getElementById('frDoc').value=r?.document||'';
      document.getElementById('frPhone').value=r?.phone||'';
      document.getElementById('frEmail').value=r?.email||'';
      document.getElementById('frCity').value=r?.city||'';
      document.getElementById('frUf').value=r?.uf||'';
      document.getElementById('frCommission').value=r?.commission??'';
      document.getElementById('frNotes').value=r?.notes||'';
      modal.classList.remove('hidden');
    }
    document.getElementById('frNew').onclick=()=>openModal(null);
    document.getElementById('frCancel').onclick=()=>modal.classList.add('hidden');
    document.getElementById('frSave').onclick=async()=>{
      const name=document.getElementById('frName').value.trim();
      if(!name){alert('Informe o nome do representante.');return}
      const data={
        name,
        document:document.getElementById('frDoc').value.trim(),
        phone:document.getElementById('frPhone').value.trim(),
        email:document.getElementById('frEmail').value.trim(),
        city:document.getElementById('frCity').value.trim(),
        uf:document.getElementById('frUf').value.trim().toUpperCase().slice(0,2),
        commission:Number(document.getElementById('frCommission').value)||0,
        notes:document.getElementById('frNotes').value.trim()
      };
      if(editing)Object.assign(editing,data,{updatedAt:Date.now()});
      else reps.push({id:'rep_'+Date.now(),...data,active:true,createdAt:Date.now()});
      ops.representatives=reps;
      await save(ops);
      modal.classList.add('hidden');
      render();
    };
  }
  function field(label,id,type='text'){
    return '<label><span>'+label+'</span><input id="'+id+'" type="'+type+'"></label>';
  }
  window.FocadoRepresentatives={render,ensure,activeList};
})();