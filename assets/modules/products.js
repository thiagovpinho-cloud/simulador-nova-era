(function(){
  'use strict';
  const KEY='focado-operacoes-v2';
  const seeds=[
    {id:'novaera_93968',simulatorId:'bicarbonato',code:'93968',name:'Álcool + Bicarbonato 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_59997',simulatorId:'inpm46',code:'59997',name:'Álcool 46° INPM 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_135379',simulatorId:'inpm46bact',code:'135379',name:'Álcool 46° INPM Bactericida 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_59894',simulatorId:'inpm70',code:'59894',name:'Álcool 70° INPM 12x1L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_92277',simulatorId:'inpm70_3x5',code:'92277',name:'Álcool 70° INPM 3x5L',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_59950',simulatorId:'gel70_440',code:'59950',name:'Álcool Gel 70° INPM 12x440g Pump',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_88742',simulatorId:'gel70_43kg',code:'88742',name:'Álcool Gel 70° INPM 3x4,3kg',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'novaera_89394',simulatorId:'gel80_barrica',code:'89394',name:'Álcool Gel 80° Acendedor Barrica 10kg',brand:'Nova Era',unit:'CX',source:'simulator'},
    {id:'newgreen_93968',simulatorId:'ng_bicarbonato',code:'93968',name:'Álcool + Bicarbonato 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_160441',simulatorId:'ng_inpm46',code:'160441',name:'Álcool 46° INPM 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_135379',simulatorId:'ng_frag46',code:'135379',name:'Álcool 46° INPM Fragrâncias 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_59950',simulatorId:'ng_gel425',code:'59950',name:'Álcool Gel Acendedor 80° INPM 425g',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_59961',simulatorId:'ng_inpm92',code:'59961',name:'Álcool 92° INPM 12x1L',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_88742',simulatorId:'ng_gel44kg',code:'88742',name:'Álcool Gel 80° Acendedor Galão 4,4kg',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_89394',simulatorId:'ng_barrica10',code:'89394',name:'Álcool Gel 80° Acendedor Barrica 10kg',brand:'New Green',unit:'CX',source:'simulator'},
    {id:'newgreen_89394_13',simulatorId:'ng_barrica13',code:'89394-13',name:'Álcool Gel 80° Acendedor Barrica 13kg',brand:'New Green',unit:'CX',source:'simulator'}
  ];
  const load=()=>window.FocadoDataStore?.readLocal?.()||(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}})();
  const save=async ops=>{
    if(window.FocadoDataStore)return window.FocadoDataStore.save(ops);
    localStorage.setItem(KEY,JSON.stringify(ops));
    return {ok:true,mode:'local'};
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numberValue=v=>{
    const n=Number(String(v??'').replace(',','.'));
    return Number.isFinite(n)&&n>=0?n:'';
  };
  const cubage=(lengthCm,widthCm,heightCm)=>{
    const l=Number(lengthCm),w=Number(widthCm),h=Number(heightCm);
    return l>0&&w>0&&h>0?(l*w*h)/1000000:'';
  };
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
    root.innerHTML='<div class="fp-page"><div class="fp-head"><div><h1>Cadastro de Produtos</h1><p>Base única usada pelos Pedidos Comerciais, Simulador e parâmetros logísticos.</p></div><button class="fp-btn primary" id="fpNew">+ Novo produto</button></div>'+
      '<div class="fp-card"><div class="fp-toolbar"><input id="fpSearch" placeholder="Buscar código ou produto"><select id="fpBrand"><option value="TODAS">Todas as marcas</option><option>Nova Era</option><option>New Green</option></select></div>'+
      '<div class="fp-table-wrap"><table class="fp-table"><thead><tr><th>Código</th><th>Produto</th><th>Marca</th><th>Unidade</th><th>Peso bruto</th><th>Cubagem</th><th>Status</th><th></th></tr></thead><tbody id="fpBody"></tbody></table></div></div>'+
      '<div class="fp-modal hidden" id="fpModal"><div class="fp-modal-card"><h2 id="fpModalTitle">Novo produto</h2><div class="fp-grid"><label><span>Código</span><input id="fpCode"></label><label><span>Nome do produto</span><input id="fpName"></label><label><span>Marca</span><select id="fpProductBrand"><option>Nova Era</option><option>New Green</option></select></label><label><span>Unidade</span><select id="fpUnit"><option>CX</option><option>UN</option><option>KG</option><option>L</option></select></label></div><p class="fp-note">Produtos cadastrados aqui ficam disponíveis imediatamente no Pedido Comercial. Para entrar no Simulador com cálculo de custo, o produto ainda precisará de ficha técnica e parametrização.</p><div class="fp-actions"><button class="fp-btn" id="fpCancel">Cancelar</button><button class="fp-btn primary" id="fpSave">Salvar produto</button></div></div></div>'+
      '<div class="fp-modal hidden" id="fpLogModal"><div class="fp-modal-card"><h2>Parâmetros logísticos</h2><p class="fp-note" id="fpLogProduct"></p><div class="fp-grid"><label><span>Peso bruto por caixa (kg)</span><input id="fpGrossWeight" type="number" min="0" step="0.001"></label><label><span>Unidades por caixa</span><input id="fpUnitsPerBox" type="number" min="0" step="1"></label><label><span>Comprimento (cm)</span><input id="fpLength" type="number" min="0" step="0.1"></label><label><span>Largura (cm)</span><input id="fpWidth" type="number" min="0" step="0.1"></label><label><span>Altura (cm)</span><input id="fpHeight" type="number" min="0" step="0.1"></label><label><span>Cubagem calculada (m³)</span><input id="fpCubage" readonly></label><label><span>Tipo de embalagem</span><input id="fpPackaging" placeholder="Ex.: caixa de papelão"></label><label><span>Caixas por pallet</span><input id="fpBoxesPerPallet" type="number" min="0" step="1"></label><label><span>Classificação logística</span><select id="fpLogClass"><option value="">Não definida</option><option>Normal</option><option>Frágil</option><option>Pesado</option><option>Químico</option></select></label><label><span>Valor estimado NF por caixa (R$)</span><input id="fpEstimatedInvoice" type="number" min="0" step="0.01"></label></div><p class="fp-note">A cubagem é calculada automaticamente pelas dimensões externas da caixa. Estes dados serão reutilizados pela cotação de frete e não duplicados em outros módulos.</p><div class="fp-actions"><button class="fp-btn" id="fpLogCancel">Cancelar</button><button class="fp-btn primary" id="fpLogSave">Salvar parâmetros</button></div></div></div></div>';
    const q=document.getElementById('fpSearch'),brand=document.getElementById('fpBrand'),body=document.getElementById('fpBody');
    let logEditingId='';
    const fmtWeight=v=>Number(v)>0?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' kg':'—';
    const fmtCubage=v=>Number(v)>0?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})+' m³':'—';
    function paint(){
      const qq=q.value.trim().toLowerCase(),bb=brand.value;
      const rows=catalog.filter(p=>(bb==='TODAS'||p.brand===bb)&&(!qq||[p.code,p.name].some(v=>String(v||'').toLowerCase().includes(qq))));
      body.innerHTML=rows.map(p=>'<tr><td><b>'+esc(p.code)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(p.brand)+'</td><td>'+esc(p.unit||'CX')+'</td><td>'+fmtWeight(p.logistics?.grossWeightKg)+'</td><td>'+fmtCubage(p.logistics?.cubageM3)+'</td><td><span class="fp-status '+(p.active===false?'off':'on')+'">'+(p.active===false?'Inativo':'Ativo')+'</span></td><td><button class="fp-link" data-logistics="'+esc(p.id)+'">Logística</button>'+(p.source==='simulator'?'':' <button class="fp-link" data-toggle="'+esc(p.id)+'">'+(p.active===false?'Ativar':'Inativar')+'</button>')+'</td></tr>').join('')||'<tr><td colspan="8" class="fp-empty">Nenhum produto encontrado.</td></tr>';
      body.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const p=catalog.find(x=>x.id===b.dataset.toggle);if(!p)return;p.active=p.active===false?true:false;await save(ops);paint()});
      body.querySelectorAll('[data-logistics]').forEach(b=>b.onclick=()=>openLogistics(b.dataset.logistics));
    }
    q.oninput=paint;brand.onchange=paint;paint();
    const modal=document.getElementById('fpModal');
    document.getElementById('fpNew').onclick=()=>modal.classList.remove('hidden');
    document.getElementById('fpCancel').onclick=()=>modal.classList.add('hidden');
    document.getElementById('fpSave').onclick=async()=>{
      const code=document.getElementById('fpCode').value.trim(),name=document.getElementById('fpName').value.trim(),b=document.getElementById('fpProductBrand').value,unit=document.getElementById('fpUnit').value;
      if(!code||!name){alert('Informe código e nome do produto.');return}
      if(catalog.some(p=>p.active!==false&&p.code===code&&p.brand===b)){alert('Já existe um produto ativo com este código para esta marca.');return}
      catalog.push({id:'manual_'+Date.now(),simulatorId:'',code,name,brand:b,unit,source:'manual',active:true,createdAt:Date.now()});
      ops.productCatalog=catalog;
      await save(ops);modal.classList.add('hidden');render();
    };
    const logModal=document.getElementById('fpLogModal');
    const gross=document.getElementById('fpGrossWeight'),units=document.getElementById('fpUnitsPerBox'),length=document.getElementById('fpLength'),width=document.getElementById('fpWidth'),height=document.getElementById('fpHeight'),cube=document.getElementById('fpCubage');
    const refreshCubage=()=>{const value=cubage(numberValue(length.value),numberValue(width.value),numberValue(height.value));cube.value=value===''?'':Number(value).toFixed(6)};
    [length,width,height].forEach(el=>el.oninput=refreshCubage);
    function openLogistics(id){
      const p=catalog.find(x=>x.id===id);if(!p)return;
      logEditingId=id;
      const l=p.logistics||{};
      document.getElementById('fpLogProduct').textContent=p.code+' — '+p.name+' · '+p.brand;
      gross.value=l.grossWeightKg??'';units.value=l.unitsPerBox??'';length.value=l.lengthCm??'';width.value=l.widthCm??'';height.value=l.heightCm??'';
      document.getElementById('fpPackaging').value=l.packaging??'';
      document.getElementById('fpBoxesPerPallet').value=l.boxesPerPallet??'';
      document.getElementById('fpLogClass').value=l.logisticsClass??'';
      document.getElementById('fpEstimatedInvoice').value=l.estimatedInvoiceValue??'';
      refreshCubage();
      logModal.classList.remove('hidden');
    }
    document.getElementById('fpLogCancel').onclick=()=>{logEditingId='';logModal.classList.add('hidden')};
    document.getElementById('fpLogSave').onclick=async()=>{
      const p=catalog.find(x=>x.id===logEditingId);if(!p)return;
      const lengthCm=numberValue(length.value),widthCm=numberValue(width.value),heightCm=numberValue(height.value);
      p.logistics={
        grossWeightKg:numberValue(gross.value),
        unitsPerBox:numberValue(units.value),
        lengthCm,widthCm,heightCm,
        cubageM3:cubage(lengthCm,widthCm,heightCm),
        packaging:document.getElementById('fpPackaging').value.trim(),
        boxesPerPallet:numberValue(document.getElementById('fpBoxesPerPallet').value),
        logisticsClass:document.getElementById('fpLogClass').value,
        estimatedInvoiceValue:numberValue(document.getElementById('fpEstimatedInvoice').value),
        updatedAt:Date.now()
      };
      ops.productCatalog=catalog;
      await save(ops);
      logEditingId='';logModal.classList.add('hidden');paint();
    };
  }
  window.FocadoProducts={render,ensureCatalog,getCatalog,findProduct,seeds};
})();