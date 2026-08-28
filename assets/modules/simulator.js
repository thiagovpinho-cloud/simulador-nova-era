(function(){
  'use strict';
  const root=()=>document.getElementById('fxContent');
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const pct=v=>Number(v||0).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
  let tab='simulacao',snap=null,selectedProduct='';

  async function get(){
    const api=window.FocadoLegacySimulator;
    if(!api)throw new Error('MOTOR_SIMULADOR_INDISPONIVEL');
    snap=await api.ready();
    if(!selectedProduct&&snap.products?.[0])selectedProduct=snap.products[0].id;
    return snap;
  }

  function head(){
    return '<div class="fsim-head"><div><span>COMERCIAL · FORMAÇÃO DE PREÇO</span><h1>Simulador</h1><p>Motor de precificação do Focado, preservando as regras originais de custos, impostos, frete e margem.</p></div><div class="fsim-badge">Motor legado encapsulado</div></div>'+
      '<div class="fsim-note"><b>Fase de integração.</b> Os cálculos abaixo usam o mesmo motor do simulador original. Nesta etapa vamos validar quais dados passarão a alimentar oficialmente Custos, Fiscal, Pedidos e BI.</div>';
  }

  function controls(){
    const freightMode=snap.global.tipoFrete==='FOB'?'':('<label><span>Modo do frete</span><select id="fsimFreightMode"><option value="AUTO" '+(!snap.global.freteManual?'selected':'')+'>Automático</option><option value="MANUAL" '+(snap.global.freteManual?'selected':'')+'>Manual por caixa</option></select></label>');
    return '<div class="fsim-controls">'+
      '<label><span>Marca</span><select id="fsimBrand">'+snap.brands.map(b=>'<option value="'+esc(b.id)+'" '+(b.id===snap.activeBrand?'selected':'')+'>'+esc(b.label)+'</option>').join('')+'</select></label>'+
      '<label><span>UF</span><select id="fsimUf">'+snap.estados.map(e=>'<option value="'+esc(e.code)+'" '+(e.code===snap.global.estado?'selected':'')+'>'+esc(e.code)+' — '+esc(e.name)+'</option>').join('')+'</select></label>'+
      '<label><span>Comissão</span><div class="fsim-inline"><input id="fsimCommission" type="number" min="0" step="0.1" value="'+(snap.global.comissao*100)+'"><i>%</i></div></label>'+
      '<label><span>Frete</span><select id="fsimFreight">'+['CIF','FOB','REDESPACHO'].map(x=>'<option '+(x===snap.global.tipoFrete?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      freightMode+
      '<label><span>Meta margem</span><div class="fsim-inline"><input id="fsimMarginTarget" type="number" min="0" step="0.1" value="'+(snap.marginTarget*100)+'"><i>%</i></div></label>'+
    '</div>';
  }

  function tabs(){
    return '<div class="fsim-tabs">'+
      [['simulacao','Simulação'],['insumos','Base de Insumos'],['composicao','Composição de Custo']].map(([id,label])=>'<button data-fsim-tab="'+id+'" class="'+(tab===id?'active':'')+'">'+label+'</button>').join('')+
      '</div>';
  }

  function summary(){
    return '<div class="fsim-kpis">'+
      '<div><span>Total sem IPI/ST</span><b>'+money(snap.totals.semImpostos)+'</b><small>Base comercial</small></div>'+
      '<div><span>Total com IPI/ST</span><b>'+money(snap.totals.comImpostos)+'</b><small>Valor faturado simulado</small></div>'+
      '<div><span>Margem sem IPI/ST</span><b>'+pct(snap.totals.margemSem)+'</b><small>Média ponderada</small></div>'+
      '<div><span>Margem com IPI/ST</span><b>'+pct(snap.totals.margemCom)+'</b><small>Média ponderada</small></div>'+
    '</div>';
  }

  function simulation(){
    const showFreight=snap.global.tipoFrete!=='FOB';
    const freightHead=showFreight?'<th>Frete/CX</th>':'';
    const freightNote=showFreight?'<div class="fsim-freight-note">'+(snap.global.freteManual?'Modo manual: informe o custo de frete por caixa em cada produto.':'Modo automático: o frete por caixa é calculado pelas faixas parametrizadas. Troque para “Manual por caixa” para simular outro valor.')+'</div>':'';
    return summary()+freightNote+'<div class="fsim-card"><div class="fsim-card-head"><div><h2>Produtos e formação de preço</h2><p>O preço digitado é o preço base da caixa. IPI e ST são calculados separadamente pelo motor.</p></div></div>'+
      '<div class="fsim-table-wrap"><table class="fsim-table"><thead><tr><th>Produto</th><th>NCM</th><th>Custo/CX</th><th>Preço base/CX</th>'+freightHead+'<th>IPI</th><th>ST</th><th>Preço c/ impostos</th><th>Margem</th></tr></thead><tbody>'+
      snap.products.map(p=>{
        const freightCell=!showFreight?'':(snap.global.freteManual
          ?'<td><div class="fsim-money-input"><span>R$</span><input data-freight-price="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+Number(p.pricing.frete||0).toFixed(2)+'"></div></td>'
          :'<td><b>'+money(p.metrics.freteValor)+'</b><small>automático</small></td>');
        return '<tr><td><b>'+esc(p.name)+'</b><small>'+p.unitsPerCaixa+' un/cx</small></td><td>'+esc(p.ncm)+'</td><td>'+money(p.metrics.custoCaixa)+'</td><td><div class="fsim-money-input"><span>R$</span><input data-price="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+Number(p.pricing.vendaCX||0).toFixed(2)+'"></div></td>'+freightCell+'<td>'+pct(p.pricing.ipi)+'</td><td>'+pct(p.pricing.icmsst)+'</td><td><b>'+money(p.metrics.precoComImpostosCaixa)+'</b></td><td><span class="fsim-margin '+(p.metrics.margemSem>=snap.marginTarget?'ok':'bad')+'">'+pct(p.metrics.margemSem)+'</span></td></tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  function inputs(){
    const groups=[...new Set(snap.insumos.map(i=>i.group))];
    return '<div class="fsim-input-toolbar"><div><h2>Base de Insumos</h2><p>Cadastre novos componentes e mantenha os preços usados pelo motor.</p></div><button id="fsimAddInput">+ Cadastrar insumo</button></div>'+
      '<div class="fsim-stack">'+groups.map(g=>'<section class="fsim-card"><div class="fsim-card-head"><div><h2>'+esc(g)+'</h2><p>Preço vigente usado pelo motor de custo.</p></div></div><div class="fsim-table-wrap"><table class="fsim-table"><thead><tr><th>Código</th><th>Insumo</th><th>Unidade</th><th>Preço</th></tr></thead><tbody>'+
      snap.insumos.filter(i=>i.group===g).map(i=>'<tr><td><b>'+esc(i.code)+'</b></td><td>'+esc(i.desc)+(i.custom?' <span class="fsim-custom-tag">cadastrado</span>':'')+'</td><td>'+esc(i.unit)+'</td><td><div class="fsim-money-input wide"><span>R$</span><input data-input-price="'+esc(i.code)+'" type="number" min="0" step="0.0001" value="'+Number(i.preco||0).toFixed(4)+'"></div></td></tr>').join('')+
      '</tbody></table></div></section>').join('')+'</div>';
  }

  function composition(){
    const p=snap.products.find(x=>x.id===selectedProduct)||snap.products[0];
    if(!p)return '<div class="fsim-empty">Nenhum produto disponível.</div>';
    return '<div class="fsim-card"><div class="fsim-card-head split"><div><h2>Composição de custo</h2><p>Unidade, quantidade e perda são editáveis e recalculam imediatamente o custo. Alterar a unidade não converte a quantidade automaticamente.</p></div><select id="fsimProductSel">'+snap.products.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===p.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div>'+
      '<div class="fsim-composition-summary"><div><span>Custo por caixa</span><b>'+money(p.metrics.custoCaixa)+'</b></div><div><span>Preço base</span><b>'+money(p.metrics.precoBaseCaixa)+'</b></div><div><span>IPI</span><b>'+money(p.metrics.ipiValor)+'</b></div><div><span>ST</span><b>'+money(p.metrics.stValor)+'</b></div><div><span>Frete</span><b>'+money(p.metrics.freteValor)+'</b></div><div><span>Margem base</span><b>'+pct(p.metrics.margemSem)+'</b></div></div>'+
      '<div class="fsim-table-wrap"><table class="fsim-table"><thead><tr><th>Código</th><th>Componente</th><th>Unid.</th><th>Quant.</th><th>Perda</th><th>Preço</th><th>Custo incorporado</th></tr></thead><tbody>'+
      p.materials.map(m=>{
        const source=m.source||'material',idx=Number.isInteger(m.materialIndex)?m.materialIndex:-1;
        const attrs=' data-comp-source="'+source+'" data-comp-index="'+idx+'"';
        return '<tr><td>'+esc(m.code)+'</td><td><b>'+esc(m.desc)+'</b></td>'+
          '<td><input class="fsim-cell-input fsim-unit" data-comp-unit'+attrs+' value="'+esc(m.unit)+'"></td>'+
          '<td><input class="fsim-cell-input" data-comp-qty'+attrs+' type="number" min="0" step="0.000001" value="'+Number(m.qty||0)+'"></td>'+
          '<td><div class="fsim-percent-input"><input class="fsim-cell-input" data-comp-loss'+attrs+' type="number" min="0" step="0.01" value="'+(Number(m.perda||0)*100)+'"><span>%</span></div></td>'+
          '<td>'+money(m.preco)+'</td><td><b>'+money(m.cic)+'</b></td></tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  function openInputModal(){
    document.getElementById('fsimInputModal')?.remove();
    const groups=[...new Set(snap.insumos.map(i=>i.group).filter(Boolean))];
    const modal=document.createElement('div');modal.id='fsimInputModal';modal.className='fsim-modal';
    modal.innerHTML='<div class="fsim-modal-card"><div class="fsim-modal-head"><div><span>NOVO COMPONENTE</span><h2>Cadastrar insumo</h2></div><button id="fsimModalClose">×</button></div>'+
      '<div class="fsim-modal-grid">'+
      '<label><span>Código</span><input id="fsimNewCode" placeholder="Código interno"></label>'+
      '<label class="wide"><span>Descrição</span><input id="fsimNewDesc" placeholder="Descrição do insumo"></label>'+
      '<label><span>Unidade</span><input id="fsimNewUnit" placeholder="L, KG, UND..."></label>'+
      '<label><span>Grupo</span><select id="fsimNewGroup">'+[...groups,'Outros'].filter((x,i,a)=>a.indexOf(x)===i).map(g=>'<option>'+esc(g)+'</option>').join('')+'</select></label>'+
      '<label><span>Preço</span><div class="fsim-money-input"><span>R$</span><input id="fsimNewPrice" type="number" min="0" step="0.0001" value="0"></div></label>'+
      '</div><div class="fsim-modal-actions"><button class="secondary" id="fsimModalCancel">Cancelar</button><button class="primary" id="fsimModalSave">Cadastrar insumo</button></div></div>';
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    $('#fsimModalClose').onclick=close;$('#fsimModalCancel').onclick=close;
    modal.onclick=e=>{if(e.target===modal)close()};
    $('#fsimModalSave').onclick=()=>{
      try{
        const next=window.FocadoLegacySimulator.addInput({
          code:$('#fsimNewCode').value,desc:$('#fsimNewDesc').value,unit:$('#fsimNewUnit').value,
          group:$('#fsimNewGroup').value,preco:Number($('#fsimNewPrice').value||0)
        });
        close();rerender(next);
      }catch(err){
        alert(err.message==='SIMULATOR_INPUT_ALREADY_EXISTS'?'Já existe um insumo com este código.':'Preencha código, descrição e unidade.');
      }
    };
  }

  function updateCompositionField(el,field){
    const source=el.dataset.compSource,index=Number(el.dataset.compIndex);
    const patch={};
    if(field==='unit')patch.unit=el.value;
    if(field==='qty')patch.qty=Number(el.value||0);
    if(field==='perda')patch.perda=Number(el.value||0)/100;
    const next=source==='process'
      ?window.FocadoLegacySimulator.setProcess(selectedProduct,patch)
      :window.FocadoLegacySimulator.setMaterial(selectedProduct,index,patch);
    rerender(next);
  }

  function body(){return tab==='insumos'?inputs():tab==='composicao'?composition():simulation()}

  async function render(){
    root().innerHTML='<div class="fsim-loading">Carregando motor de precificação...</div>';
    try{
      await get();
      root().innerHTML='<div class="fsim-page">'+head()+controls()+tabs()+body()+'</div>';
      bind();
    }catch(err){
      console.error('[FocadoSimulator]',err);
      root().innerHTML='<div class="fsim-error"><b>Não foi possível carregar o simulador.</b><span>'+esc(err.message||err)+'</span></div>';
    }
  }

  function rerender(next){snap=next;root().innerHTML='<div class="fsim-page">'+head()+controls()+tabs()+body()+'</div>';bind()}

  function bind(){
    document.querySelectorAll('[data-fsim-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.fsimTab;rerender(snap)});
    $('#fsimBrand').onchange=e=>rerender(window.FocadoLegacySimulator.setBrand(e.target.value));
    $('#fsimUf').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({estado:e.target.value}));
    $('#fsimCommission').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({comissao:Number(e.target.value||0)/100}));
    $('#fsimFreight').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({tipoFrete:e.target.value}));
    if($('#fsimFreightMode'))$('#fsimFreightMode').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({freteManual:e.target.value==='MANUAL'}));
    $('#fsimMarginTarget').onchange=e=>rerender(window.FocadoLegacySimulator.setMarginTarget(Number(e.target.value||0)/100));
    document.querySelectorAll('[data-price]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.price,{vendaCX:Number(i.value||0)})));
    document.querySelectorAll('[data-freight-price]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.freightPrice,{frete:Number(i.value||0)})));
    document.querySelectorAll('[data-input-price]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setInputPrice(i.dataset.inputPrice,Number(i.value||0))));
    if($('#fsimAddInput'))$('#fsimAddInput').onclick=openInputModal;
    if($('#fsimProductSel'))$('#fsimProductSel').onchange=e=>{selectedProduct=e.target.value;rerender(snap)};
    document.querySelectorAll('[data-comp-unit]').forEach(i=>i.onchange=()=>updateCompositionField(i,'unit'));
    document.querySelectorAll('[data-comp-qty]').forEach(i=>i.onchange=()=>updateCompositionField(i,'qty'));
    document.querySelectorAll('[data-comp-loss]').forEach(i=>i.onchange=()=>updateCompositionField(i,'perda'));
  }

  window.FocadoSimulator={render};
})();