(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const seeds=[
    {id:'novaera_93968',code:'93968',name:'Álcool + Bicarbonato 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_59997',code:'59997',name:'Álcool 46° INPM 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_135379',code:'135379',name:'Álcool 46° INPM Bactericida 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_59894',code:'59894',name:'Álcool 70° INPM 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_92277',code:'92277',name:'Álcool 70° INPM 3x5L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_59950',code:'59950',name:'Álcool Gel 70° INPM 12x440g Pump',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_88742',code:'88742',name:'Álcool Gel 70° INPM 3x4,3kg',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_89394',code:'89394',name:'Álcool Gel 80° Acendedor Barrica 10kg',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'newgreen_93968',code:'93968',name:'Álcool + Bicarbonato 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_160441',code:'160441',name:'Álcool 46° INPM 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_135379',code:'135379',name:'Álcool 46° INPM Fragrâncias 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_59950',code:'59950',name:'Álcool Gel Acendedor 80° INPM 425g',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_59961',code:'59961',name:'Álcool 92° INPM 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_88742',code:'88742',name:'Álcool Gel 80° Acendedor Galão 4,4kg',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_89394',code:'89394',name:'Álcool Gel 80° Acendedor Barrica 10kg',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_89394_13',code:'89394-13',name:'Álcool Gel 80° Acendedor Barrica 13kg',brand:'New Green',unit:'CX',source:'simulator'}
  ];
  const load=()=>window.FocadoDataStore?.readLocal?.()||(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}})();
  const save=async ops=>{
    if(window.FocadoDataStore)return window.FocadoDataStore.save(ops);
    localStorage.setItem(KEY,JSON.stringify(ops));
    return {ok:true,mode:'local'};
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensureCatalog(ops){
    ops.productCatalog=Array.isArray(ops.productCatalog)?ops.productCatalog:[];
    const existing=new Set(ops.productCatalog.map(p=>String(p.id)));
    seeds.forEach(p=>{if(!existing.has(p.id))ops.productCatalog.push({...p,active:true,createdAt:0})});
    return ops.productCatalog;
  }
  function getCatalog(ops){
    const state=ops||load();return ensureCatalog(state).filter(p=>p.active!==false);
  }
  function findProduct(query,brand,ops){
    const q=String(query||'').trim().toLowerCase();
    if(!q)return null;
    const list=getCatalog(ops);
    const scoped=brand?list.filter(p=>String(p.brand||'').toLowerCase()===String(brand).toLowerCase()):list;
    return scoped.find(p=>String(p.code||'').toLowerCase()===q)
      ||scoped.find(p=>String(p.name||'').toLowerCase()===q)
      ||list.find(p=>String(p.code||'').toLowerCase()===q)
      ||list.find(p=>String(p.name||'').toLowerCase()===q)
      ||null;
  }
  function render(){
    const ops=load(),catalog=ensureCatalog(ops).slice().sort((a,b)=>String(a.brand).localeCompare(String(b.brand))||String(a.name).localeCompare(String(b.name)));
    const root=document.getElementById('fxContent');if(!root)return;
    root.innerHTML='<div class="fp-page"><div class="fp-head"><div><h1>Cadastro de Produtos</h1><p>Base única usada pelos Pedidos Comerciais e vinculada aos produtos do Simulador.</p></div><button class="fp-btn primary" id="fpNew">+ Novo produto</button></div>'+
      '<div class="fp-card"><div class="fp-toolbar"><input id="fpSearch" placeholder="Buscar código ou produto"><select id="fpBrand"><option value="TODAS">Todas as marcas</option><option>Nova Era</option><option>New Green</option></select></div>'+
      '<div class="fp-table-wrap"><table class="fp-table"><thead><tr><th>Código</th><th>Produto</th><th>Marca</th><th>Unidade</th><th>Origem</th><th>Status</th><th></th></tr></thead><tbody id="fpBody"></tbody></table></div></div>'+
      '<div class="fp-modal hidden" id="fpModal"><div class="fp-modal-card"><h2 id="fpModalTitle">Novo produto</h2><div class="fp-grid"><label><span>Código</span><input id="fpCode"></label><label><span>Nome do produto</span><input id="fpName"></label><label><span>Marca</span><select id="fpProductBrand"><option>Nova Era</option><option>New Green</option></select></label><label><span>Unidade</span><select id="fpUnit"><option>CX</option><option>UN</option><option>KG</option><option>L</option></select></label></div><p class="fp-note">Produtos cadastrados aqui ficam disponíveis imediatamente no Pedido Comercial. Para entrar no Simulador com cálculo de custo, o produto ainda precisará de ficha técnica e parametrização.</p><div class="fp-actions"><button class="fp-btn" id="fpCancel">Cancelar</button><button class="fp-btn primary" id="fpSave">Salvar produto</button></div></div></div></div>';
    const q=document.getElementById('fpSearch'),brand=document.getElementById('fpBrand'),body=document.getElementById('fpBody');
    function paint(){
      const qq=q.value.trim().toLowerCase(),bb=brand.value;
      const rows=catalog.filter(p=>(bb==='TODAS'||p.brand===bb)&&(!qq||[p.code,p.name].some(v=>String(v||'').toLowerCase().includes(qq))));
      body.innerHTML=rows.map(p=>'<tr><td><b>'+esc(p.code)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(p.brand)+'</td><td>'+esc(p.unit||'CX')+'</td><td>'+(p.source==='simulator'?'Simulador':'Cadastro manual')+'</td><td><span class="fp-status '+(p.active===false?'off':'on')+'">'+(p.active===false?'Inativo':'Ativo')+'</span></td><td>'+(p.source==='simulator'?'':'<button class="fp-link" data-toggle="'+esc(p.id)+'">'+(p.active===false?'Ativar':'Inativar')+'</button>')+'</td></tr>').join('')||'<tr><td colspan="7" class="fp-empty">Nenhum produto encontrado.</td></tr>';
      body.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const p=catalog.find(x=>x.id===b.dataset.toggle);if(!p)return;p.active=p.active===false?true:false;await save(ops);paint()});
    }
    q.oninput=paint;brand.onchange=paint;paint();
    const modal=document.getElementById('fpModal');
    document.getElementById('fpNew').onclick=()=>modal.classList.remove('hidden');
    document.getElementById('fpCancel').onclick=()=>modal.classList.add('hidden');
    document.getElementById('fpSave').onclick=async()=>{
      const code=document.getElementById('fpCode').value.trim(),name=document.getElementById('fpName').value.trim(),b=document.getElementById('fpProductBrand').value,unit=document.getElementById('fpUnit').value;
      if(!code||!name){alert('Informe código e nome do produto.');return}
      if(catalog.some(p=>p.active!==false&&p.code===code&&p.brand===b)){alert('Já existe um produto ativo com este código para esta marca.');return}
      catalog.push({id:'manual_'+Date.now(),code,name,brand:b,unit,source:'manual',active:true,createdAt:Date.now()});
      ops.productCatalog=catalog;
      await save(ops);modal.classList.add('hidden');render();
    };
  }
  window.FocadoProducts={render,ensureCatalog,getCatalog,findProduct,seeds};
})();