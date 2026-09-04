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
  const save=async ops=>{if(window.FocadoDataStore)return window.FocadoDataStore.save(ops);localStorage.setItem(KEY,JSON.stringify(ops));return {ok:true,mode:'local'}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
  const fmt=(v,d=3)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const engine=()=>window.FocadoLogisticsEngine;
  function ensureCatalog(ops){
    ops.productCatalog=Array.isArray(ops.productCatalog)?ops.productCatalog:[];
    const byId=new Map(ops.productCatalog.map(p=>[String(p.id),p]));
    seeds.forEach(seed=>{
      let p=byId.get(seed.id);
      if(!p){p={...seed,active:true,createdAt:0};ops.productCatalog.push(p);byId.set(seed.id,p)}
      else Object.keys(seed).forEach(k=>{if(p[k]==null||p[k]==='')p[k]=seed[k]});
      const defaults=engine()?.defaultsForProduct?.(p)||{};
      p.logistics=engine()?.derive?.({...defaults,...(p.logistics||{})})||{...(p.logistics||{})};
    });
    ops.productCatalog.forEach(p=>{p.logistics=engine()?.derive?.(p.logistics||{})||{...(p.logistics||{})}});
    return ops.productCatalog;
  }
  function getCatalog(ops){const state=ops||load();return ensureCatalog(state).filter(p=>p.active!==false)}
  function findProduct(query,brand,ops){
    const q=String(query||'').trim().toLowerCase();if(!q)return null;
    const list=getCatalog(ops),scoped=brand?list.filter(p=>String(p.brand||'').toLowerCase()===String(brand).toLowerCase()):list;
    return scoped.find(p=>String(p.code||'').toLowerCase()===q)||scoped.find(p=>String(p.name||'').toLowerCase()===q)||list.find(p=>String(p.code||'').toLowerCase()===q)||list.find(p=>String(p.name||'').toLowerCase()===q)||null;
  }
  function calculateLoad(items,brand,ops){
    const list=getCatalog(ops||load());
    const enriched=(items||[]).map(i=>({...i,brand:i.brand||brand||''}));
    return engine()?.calculateLoad?.(enriched,list)||{boxes:0,grossWeightKg:0,volumeM3:0,palletsEstimated:0,estimatedMerchandiseValue:0,details:[],missing:[],complete:false};
  }
  function logisticsStatus(p){const c=engine()?.completeness?.(p.logistics||{})||{complete:false,missing:['parametrização']};return c}
  function render(){
    const ops=load(),catalog=ensureCatalog(ops).slice().sort((a,b)=>String(a.brand).localeCompare(String(b.brand))||String(a.name).localeCompare(String(b.name)));
    const root=document.getElementById('fxContent');if(!root)return;let editingId='';
    root.innerHTML='<div class="fp-page"><div class="fp-head"><div><h1>Cadastro de Produtos</h1><p>Fonte única do produto para Pedidos, Simulador e Logística. Peso, cubagem e palletização são parametrizados aqui.</p></div><button class="fp-btn primary" id="fpNew">+ Novo produto</button></div>'+
      '<div class="fp-card"><div class="fp-toolbar"><input id="fpSearch" placeholder="Buscar código ou produto"><select id="fpBrand"><option value="TODAS">Todas as marcas</option><option>Nova Era</option><option>New Green</option></select></div>'+
      '<div class="fp-table-wrap"><table class="fp-table"><thead><tr><th>Código</th><th>Produto</th><th>Marca</th><th>Logística</th><th>Status logístico</th><th>Status</th><th></th></tr></thead><tbody id="fpBody"></tbody></table></div></div>'+
      '<div class="fp-modal hidden" id="fpModal"><div class="fp-modal-card fp-modal-wide"><div class="fp-modal-head"><div><span class="fp-eyebrow">CADASTRO MESTRE</span><h2 id="fpModalTitle">Novo produto</h2></div><button class="fp-modal-x" id="fpX">×</button></div>'+
      '<section class="fp-section"><h3>Dados do produto</h3><div class="fp-grid"><label><span>Código</span><input id="fpCode"></label><label><span>Nome do produto</span><input id="fpName"></label><label><span>Marca</span><select id="fpProductBrand"><option>Nova Era</option><option>New Green</option></select></label><label><span>Unidade</span><select id="fpUnit"><option>CX</option><option>UN</option><option>KG</option><option>L</option></select></label></div></section>'+
      '<section class="fp-section"><div class="fp-section-head"><div><h3>Parametrização logística</h3><p>Dados usados automaticamente no Simulador, Pedido e Cotação de Frete.</p></div><span id="fpLogSource" class="fp-source"></span></div>'+
      '<div class="fp-log-grid">'+
      field('fpUnitsPerBox','Unidades por caixa','un')+field('fpUnitLength','Comp. unitário','mm')+field('fpNetUnit','Peso líquido unit.','kg')+field('fpGrossUnit','Peso bruto unit.','kg')+
      field('fpBoxHeight','Altura da caixa','mm')+field('fpBoxWidth','Largura da caixa','mm')+field('fpBoxLength','Comprimento da caixa','mm')+field('fpBoxVolume','Cubagem da caixa','m³')+
      field('fpNetBox','Peso líquido caixa','kg')+field('fpGrossBox','Peso bruto caixa','kg')+field('fpPalletWidth','Largura pallet','mm')+field('fpPalletLength','Comprimento pallet','mm')+
      field('fpLayerBoxes','Caixas por lastro','cx')+field('fpLayers','Camadas','cam')+field('fpBoxesPallet','Caixas por pallet','cx')+field('fpPalletWeight','Peso palletizado','kg')+
      '</div><div class="fp-log-preview" id="fpLogPreview"></div></section>'+
      '<p class="fp-note"><b>Governança:</b> exclusão é lógica e reversível. Produtos vinculados ao Simulador não são apagados fisicamente; ficam inativos para preservar histórico e rastreabilidade.</p><div class="fp-actions"><button class="fp-btn" id="fpCancel">Cancelar</button><button class="fp-btn primary" id="fpSave">Salvar produto</button></div></div></div></div>';
    function field(id,label,unit){return '<label><span>'+label+'</span><div class="fp-unit-input"><input id="'+id+'" inputmode="decimal"><i>'+unit+'</i></div></label>'}
    const q=document.getElementById('fpSearch'),brand=document.getElementById('fpBrand'),body=document.getElementById('fpBody'),modal=document.getElementById('fpModal');
    function paint(){
      const qq=q.value.trim().toLowerCase(),bb=brand.value;
      const rows=catalog.filter(p=>(bb==='TODAS'||p.brand===bb)&&(!qq||[p.code,p.name].some(v=>String(v||'').toLowerCase().includes(qq))));
      body.innerHTML=rows.map(p=>{
        const l=engine()?.derive?.(p.logistics||{})||{},s=logisticsStatus(p),logText=(l.grossBoxKg>0?fmt(l.grossBoxKg,3)+' kg/cx':'peso pendente')+' · '+(l.boxVolumeM3>0?fmt(l.boxVolumeM3,6)+' m³/cx':'cubagem pendente');
        return '<tr><td><b>'+esc(p.code)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(p.brand)+'</td><td><b class="fp-log-main">'+esc(logText)+'</b><small>'+(l.boxesPerPallet>0?fmt(l.boxesPerPallet,0)+' cx/pallet':'palletização pendente')+'</small></td><td><span class="fp-log-status '+(s.complete?'ok':'warn')+'">'+(s.complete?'Completo':'Completar dados')+'</span></td><td><span class="fp-status '+(p.active===false?'off':'on')+'">'+(p.active===false?'Inativo':'Ativo')+'</span></td><td><div class="fp-row-actions"><button class="fp-link" data-edit="'+esc(p.id)+'">Editar</button><button class="fp-link danger" data-toggle="'+esc(p.id)+'">'+(p.active===false?'Reativar':'Excluir')+'</button></div></td></tr>';
      }).join('')||'<tr><td colspan="7" class="fp-empty">Nenhum produto encontrado.</td></tr>';
      body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));
      body.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const p=catalog.find(x=>x.id===b.dataset.toggle);if(!p)return;if(p.active!==false&&!confirm('Excluir este produto do uso operacional? O histórico será preservado.'))return;p.active=p.active===false?true:false;p.updatedAt=Date.now();await save(ops);paint()});
    }
    function setVal(id,v){document.getElementById(id).value=(v==null||v===0)?'':String(v)}
    function getVal(id){return num(document.getElementById(id).value)}
    function collectLogistics(){return engine()?.derive?.({
      unitsPerBox:getVal('fpUnitsPerBox'),unitLengthMm:getVal('fpUnitLength'),netUnitKg:getVal('fpNetUnit'),grossUnitKg:getVal('fpGrossUnit'),boxHeightMm:getVal('fpBoxHeight'),boxWidthMm:getVal('fpBoxWidth'),boxLengthMm:getVal('fpBoxLength'),boxVolumeM3:getVal('fpBoxVolume'),netBoxKg:getVal('fpNetBox'),grossBoxKg:getVal('fpGrossBox'),palletWidthMm:getVal('fpPalletWidth'),palletLengthMm:getVal('fpPalletLength'),layerBoxes:getVal('fpLayerBoxes'),layers:getVal('fpLayers'),boxesPerPallet:getVal('fpBoxesPallet'),palletWeightKg:getVal('fpPalletWeight'),source:'Cadastro de Produtos',updatedAt:Date.now()
    })||{}}
    function preview(){const l=collectLogistics(),s=engine()?.completeness?.(l)||{complete:false,missing:[]};document.getElementById('fpLogPreview').innerHTML='<div><span>Peso bruto / caixa</span><b>'+fmt(l.grossBoxKg,3)+' kg</b></div><div><span>Cubagem / caixa</span><b>'+fmt(l.boxVolumeM3,6)+' m³</b></div><div><span>Caixas / pallet</span><b>'+fmt(l.boxesPerPallet,0)+'</b></div><div><span>Status</span><b class="'+(s.complete?'ok':'warn')+'">'+(s.complete?'Completo':'Falta: '+esc(s.missing.join(', ')))+'</b></div>'}
    function openEditor(id){
      editingId=id||'';const p=editingId?catalog.find(x=>x.id===editingId):null,defaults=p?engine()?.mergeProductLogistics?.(p)||p.logistics||{}:{};
      document.getElementById('fpModalTitle').textContent=p?'Editar produto':'Novo produto';document.getElementById('fpCode').value=p?.code||'';document.getElementById('fpName').value=p?.name||'';document.getElementById('fpProductBrand').value=p?.brand||'Nova Era';document.getElementById('fpUnit').value=p?.unit||'CX';
      setVal('fpUnitsPerBox',defaults.unitsPerBox);setVal('fpUnitLength',defaults.unitLengthMm);setVal('fpNetUnit',defaults.netUnitKg);setVal('fpGrossUnit',defaults.grossUnitKg);setVal('fpBoxHeight',defaults.boxHeightMm);setVal('fpBoxWidth',defaults.boxWidthMm);setVal('fpBoxLength',defaults.boxLengthMm);setVal('fpBoxVolume',defaults.boxVolumeM3);setVal('fpNetBox',defaults.netBoxKg);setVal('fpGrossBox',defaults.grossBoxKg);setVal('fpPalletWidth',defaults.palletWidthMm);setVal('fpPalletLength',defaults.palletLengthMm);setVal('fpLayerBoxes',defaults.layerBoxes);setVal('fpLayers',defaults.layers);setVal('fpBoxesPallet',defaults.boxesPerPallet);setVal('fpPalletWeight',defaults.palletWeightKg);
      document.getElementById('fpLogSource').textContent=defaults.source||'Sem referência logística';modal.classList.remove('hidden');preview();
    }
    q.oninput=paint;brand.onchange=paint;paint();
    document.getElementById('fpNew').onclick=()=>openEditor('');document.getElementById('fpCancel').onclick=()=>modal.classList.add('hidden');document.getElementById('fpX').onclick=()=>modal.classList.add('hidden');
    modal.querySelectorAll('.fp-log-grid input').forEach(i=>i.oninput=preview);
    document.getElementById('fpSave').onclick=async()=>{
      const code=document.getElementById('fpCode').value.trim(),name=document.getElementById('fpName').value.trim(),b=document.getElementById('fpProductBrand').value,unit=document.getElementById('fpUnit').value;if(!code||!name){alert('Informe código e nome do produto.');return}
      let p=editingId?catalog.find(x=>x.id===editingId):null;
      const identityChanged=!p||String(p.code||'')!==code||String(p.brand||'')!==b;
      if(identityChanged&&catalog.some(x=>x.id!==editingId&&x.active!==false&&x.code===code&&x.brand===b)){alert('Já existe um produto ativo com este código para esta marca.');return}
      if(!p){p={id:'manual_'+Date.now(),simulatorId:'',source:'manual',active:true,createdAt:Date.now()};catalog.push(p)}
      p.code=code;p.name=name;p.brand=b;p.unit=unit;p.logistics=collectLogistics();p.updatedAt=Date.now();ops.productCatalog=catalog;await save(ops);modal.classList.add('hidden');render();
    };
  }
  window.FocadoProducts={render,ensureCatalog,getCatalog,findProduct,calculateLoad,seeds};
})();