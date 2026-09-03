(function(){
  'use strict';
  const root=()=>document.getElementById('fxContent');
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const pct=v=>Number(v||0).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:2});
  const num=v=>Number(v||0);
  const role=()=>String(window.FocadoAuth?.getRole?.()||'').toUpperCase();
  const canRecipes=()=>['ADMIN','DIRETOR'].includes(role());
  const brandLabel=()=>snap?.brands?.find(b=>b.id===snap.activeBrand)?.label||'Nova Era';
  let tab='painel',snap=null,selectedProduct='';

  async function get(){
    const api=window.FocadoLegacySimulator;
    if(!api)throw new Error('MOTOR_SIMULADOR_INDISPONIVEL');
    snap=await api.ready();
    if(!snap.global?.spreadsheetMode)snap=api.setGlobal({spreadsheetMode:true});
    const original=snap.activeBrand,ops=window.FocadoDataStore?.readLocal?.()||{};
    const persisted=Array.isArray(ops.inputCatalog)?ops.inputCatalog:[];
    const master=window.FocadoSimulatorMasterData?.inputs||[];
    const key=x=>String(x.brand||'').toLowerCase()+'::'+String(x.code||'').toLowerCase();
    const merged=new Map(master.map(x=>[key(x),x]));
    for(const x of persisted.filter(x=>x.active!==false))merged.set(key(x),{...merged.get(key(x)),...x});
    try{
      for(const b of snap.brands||[]){
        let current=api.setBrand(b.id);
        for(const item of [...merged.values()].filter(x=>String(x.brand).toLowerCase()===String(b.label).toLowerCase())){
          try{
            const existing=(current.insumos||[]).find(x=>String(x.code)===String(item.code));
            if(existing){
              if(Math.abs(Number(existing.preco||0)-Number(item.price||0))>1e-9)current=api.setInputPrice(item.code,Number(item.price||0));
            }else current=api.addInput({code:item.code,desc:item.name,unit:item.unit,group:item.group,preco:Number(item.price||0)});
          }catch(_){}
        }
      }
    }finally{snap=original?api.setBrand(original):api.snapshot()}
    if(!selectedProduct&&snap.products?.[0])selectedProduct=snap.products[0].id;
    return snap;
  }

  function head(){
    const brand=snap?.brands?.find(b=>b.id===snap.activeBrand)?.label||'Nova Era';
    return '<div class="fsim-sheet-title"><h1>SIMULADOR '+esc(brand.toUpperCase())+' 2026</h1><span>Modelo oficial 07/07/2026</span></div>';
  }

  function brandSwitch(){
    return '<div class="fsim-brand-switch"><div><span>SIMULADOR ATIVO</span><b>'+esc(brandLabel())+'</b></div><div class="fsim-brand-buttons">'+
      snap.brands.map(b=>'<button type="button" data-fsim-brand="'+esc(b.id)+'" class="'+(b.id===snap.activeBrand?'active':'')+'">'+esc(b.label)+'</button>').join('')+
      '</div></div>';
  }

  function controls(){
    const official=Boolean(snap.global.spreadsheetMode);
    const freightMode=!official&&snap.global.tipoFrete!=='FOB'?('<label><span>Modo do frete</span><select id="fsimFreightMode"><option value="AUTO" '+(!snap.global.freteManual?'selected':'')+'>Automático</option><option value="MANUAL" '+(snap.global.freteManual?'selected':'')+'>Manual por caixa</option></select></label>'):'';
    const operational=official?'':(
      '<label><span>UF</span><select id="fsimUf">'+snap.estados.map(e=>'<option value="'+esc(e.code)+'" '+(e.code===snap.global.estado?'selected':'')+'>'+esc(e.code)+' — '+esc(e.name)+'</option>').join('')+'</select></label>'+
      '<label><span>Frete operacional</span><select id="fsimFreight">'+['CIF','FOB','REDESPACHO'].map(x=>'<option '+(x===snap.global.tipoFrete?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      freightMode
    );
    return '<div class="fsim-controls">'+
      '<label><span>Modo de cálculo</span><select id="fsimCalcMode"><option value="PLANILHA" '+(official?'selected':'')+'>Planilha oficial 07/07/2026</option><option value="OPERACIONAL" '+(!official?'selected':'')+'>Operacional Focado</option></select></label>'+
      '<label><span>Comissão</span><div class="fsim-inline"><input id="fsimCommission" type="number" min="0" step="0.1" value="'+(snap.global.comissao*100)+'"><i>%</i></div></label>'+
      '<label><span>Meta margem</span><div class="fsim-inline"><input id="fsimMarginTarget" type="number" min="0" step="0.1" value="'+(snap.marginTarget*100)+'"><i>%</i></div></label>'+
      operational+
      '</div>'+
      (official?'<div class="fsim-official-note"><b>Modo Planilha oficial:</b> ICMS, IPI/ST, comissão, contrato e <strong>frete informado por caixa</strong> seguem a lógica dos arquivos Nova Era/New Green de 07/07/2026. O frete automático do Focado fica fora deste cálculo.</div>':'');
  }

  function tabs(){
    const rows=[['painel','Painel']];
    if(canRecipes())rows.push(['receitas','Receitas']);
    return '<div class="fsim-tabs">'+rows.map(([id,label])=>'<button data-fsim-tab="'+id+'" class="'+(tab===id?'active':'')+'">'+label+'</button>').join('')+
      '<button type="button" id="fsimGoInputs">Base de Insumos → <small>'+esc(brandLabel())+'</small></button></div>';
  }

  function summary(){
    const approved=num(snap.totals.margemSem)>=num(snap.marginTarget);
    return '<div class="fsim-sheet-meta"><div><span>ICMS</span><b>'+pct(snap.global.icms)+'</b></div><div><span>COMISSÃO</span><b>'+pct(snap.global.comissao)+'</b></div></div>'+
      '<div class="fsim-edit-hint">FAVOR APENAS EDITAR AS CÉLULAS EM AZUL</div>'+
      '<div class="fsim-approval"><div><span>PAINEL DE DADOS E APROVAÇÃO</span><strong class="'+(approved?'ok':'bad')+'">'+(approved?'APROVADO':'NEGADO')+'</strong></div><div><span>MÉDIA PONDERADA</span><b>'+pct(snap.totals.margemSem)+'</b><b>'+pct(snap.totals.margemCom)+'</b></div></div>';
  }

  function painel(){
    const official=Boolean(snap.global.spreadsheetMode);
    return summary()+
      '<div class="fsim-card fsim-sheet-card"><div class="fsim-card-head"><div><h2>PAINEL</h2><p>Campos, lógica e fórmulas do arquivo oficial.</p></div></div>'+
      '<div class="fsim-table-wrap"><table class="fsim-table fsim-panel-table"><thead><tr>'+
      '<th>NCM</th><th>DESCRIÇÃO TÉCNICA DO PRODUTO</th><th>UND</th><th>QTD P/ CX</th><th>ICMS</th><th>QTD DE CXS</th>'+
      '<th>VALOR DE VENDA CX (SEM IPI E ST)</th><th>VALOR DE VENDA UNID. (SEM IPI E ST)</th><th>VALOR DE FRETE POR CX</th>'+
      '<th>CONTRATO</th><th>VALOR DE VENDA CX (COM IPI E ST)</th><th>VALOR DE VENDA UNID. (COM IPI E ST)</th><th>VALOR FINAL DA VENDA</th><th>(%) MARGEM SEM IPI E ST</th><th>(%) MARGEM COM IPI E ST</th>'+
      '</tr></thead><tbody>'+
      snap.products.map(p=>{
        const units=Math.max(1,num(p.unitsPerCaixa)),qty=Math.max(0,num(p.pricing.qtdCaixas));
        const base=num(p.pricing.vendaCX),withTax=num(p.metrics.precoComImpostosCaixa);
        const operationalFob=!official&&snap.global.tipoFrete==='FOB';
        const freightValue=official||snap.global.freteManual?num(p.pricing.frete):num(p.metrics.freteValor);
        const freight='<td><div class="fsim-money-input '+(operationalFob?'locked':'')+'"><span>R$</span><input data-freight-price="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+freightValue.toFixed(2)+'" '+(operationalFob?'disabled':'')+'></div><small>'+(official?'planilha · por caixa':operationalFob?'FOB · zerado':snap.global.freteManual?'manual':'automático · edite para assumir manual')+'</small></td>';
        return '<tr>'+
          '<td>'+esc(p.ncm)+'</td><td><b>'+esc(p.name)+'</b></td><td>CX</td><td>'+units+'</td><td>'+pct(snap.global.icms)+'</td>'+
          '<td><input class="fsim-cell-input" data-box-qty="'+esc(p.id)+'" type="number" min="0" step="1" value="'+qty+'"></td>'+
          '<td><div class="fsim-money-input"><span>R$</span><input data-price="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+base.toFixed(2)+'"></div></td>'+
          '<td>'+money(base/units)+'</td>'+freight+
          '<td><div class="fsim-percent-input"><input class="fsim-cell-input" data-contract="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+(num(p.pricing.contrato)*100).toFixed(2)+'"><span>%</span></div></td>'+
          '<td><b>'+money(withTax)+'</b></td><td>'+money(withTax/units)+'</td><td><b>'+money(num(p.metrics.totalComImpostos))+'</b></td>'+
          '<td><span class="fsim-margin '+(num(p.metrics.margemSem)>=num(snap.marginTarget)?'ok':'bad')+'">'+pct(p.metrics.margemSem)+'</span></td>'+
          '<td>'+pct(p.metrics.margemCom)+'</td></tr>';
      }).join('')+'</tbody></table></div>'+
      '<div class="fsim-cost-summary"><h3>RESUMO DE CUSTOS</h3>'+snap.products.map(p=>'<div><span>'+esc(p.name)+'</span><b>'+money(p.metrics.custoCaixa)+'</b></div>').join('')+'</div></div>';
  }

  function receitas(){
    if(!canRecipes())return '<div class="fsim-error"><b>Acesso restrito.</b><span>Receitas são visíveis somente para Administradores e Diretores.</span></div>';
    const p=snap.products.find(x=>x.id===selectedProduct)||snap.products[0];
    if(!p)return '<div class="fsim-empty">Nenhum produto disponível.</div>';
    return '<div class="fsim-card"><div class="fsim-card-head split"><div><h2>Receitas de Produção — '+esc(brandLabel())+'</h2><p>Quantidades e perdas desta receita alimentam a necessidade real de insumos da Produção. Esta receita pertence somente à marca selecionada.</p></div><select id="fsimProductSel">'+
      snap.products.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===p.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div>'+
      '<div class="fsim-composition-summary"><div><span>Custo por caixa</span><b>'+money(p.metrics.custoCaixa)+'</b></div><div><span>Unidades por caixa</span><b>'+num(p.unitsPerCaixa)+'</b></div><div><span>Preço base</span><b>'+money(p.metrics.precoBaseCaixa)+'</b></div><div><span>Margem base</span><b>'+pct(p.metrics.margemSem)+'</b></div></div>'+
      '<div class="fsim-table-wrap"><table class="fsim-table"><thead><tr><th>Código</th><th>Componente</th><th>Unid.</th><th>Qtd por unidade</th><th>Perda</th><th>Preço vigente</th><th>Custo incorporado</th></tr></thead><tbody>'+
      p.materials.map(m=>{
        const source=m.source||'material',idx=Number.isInteger(m.materialIndex)?m.materialIndex:-1;
        const attrs=' data-comp-source="'+source+'" data-comp-index="'+idx+'"';
        return '<tr><td>'+esc(m.code||'—')+'</td><td><b>'+esc(m.desc)+'</b>'+(source==='process'?'<small>serviço / processo</small>':'')+'</td>'+
          '<td><input class="fsim-cell-input fsim-unit" data-comp-unit'+attrs+' value="'+esc(m.unit)+'"></td>'+
          '<td><input class="fsim-cell-input" data-comp-qty'+attrs+' type="number" min="0" step="0.000001" value="'+num(m.qty)+'"></td>'+
          '<td><div class="fsim-percent-input"><input class="fsim-cell-input" data-comp-loss'+attrs+' type="number" min="0" step="0.01" value="'+(num(m.perda)*100)+'"><span>%</span></div></td>'+
          '<td>'+money(m.preco)+'</td><td><b>'+money(m.cic)+'</b></td></tr>';
      }).join('')+'</tbody></table></div>'+
      '<div class="fsim-note"><b>Integração operacional:</b> materiais físicos desta receita são multiplicados pela quantidade produzida e baixados do Estoque de Insumos no apontamento da Produção. Serviços continuam compondo custo, mas não baixam estoque físico.</div></div>';
  }

  function body(){return tab==='receitas'?receitas():painel()}

  async function render(){
    root().innerHTML='<div class="fsim-loading">Carregando motor de precificação...</div>';
    try{
      await get();
      if(tab==='receitas'&&!canRecipes())tab='painel';
      root().innerHTML='<div class="fsim-page">'+head()+brandSwitch()+controls()+tabs()+body()+'</div>';
      bind();
    }catch(err){
      console.error('[FocadoSimulator]',err);
      root().innerHTML='<div class="fsim-error"><b>Não foi possível carregar o simulador.</b><span>'+esc(err.message||err)+'</span></div>';
    }
  }
  function rerender(next){snap=next;if(tab==='receitas'&&!canRecipes())tab='painel';root().innerHTML='<div class="fsim-page">'+head()+brandSwitch()+controls()+tabs()+body()+'</div>';bind()}

  function updateCompositionField(el,field){
    if(!canRecipes())return;
    const source=el.dataset.compSource,index=Number(el.dataset.compIndex),patch={};
    if(field==='unit')patch.unit=el.value;
    if(field==='qty')patch.qty=num(el.value);
    if(field==='perda')patch.perda=num(el.value)/100;
    const next=source==='process'
      ?window.FocadoLegacySimulator.setProcess(selectedProduct,patch)
      :window.FocadoLegacySimulator.setMaterial(selectedProduct,index,patch);
    rerender(next);
  }

  function bind(){
    document.querySelectorAll('[data-fsim-tab]').forEach(b=>b.onclick=()=>{
      if(b.dataset.fsimTab==='receitas'&&!canRecipes())return;
      tab=b.dataset.fsimTab;rerender(snap)
    });
    document.querySelectorAll('[data-fsim-brand]').forEach(b=>b.onclick=()=>{
      if(b.dataset.fsimBrand===snap.activeBrand)return;
      selectedProduct='';
      rerender(window.FocadoLegacySimulator.setBrand(b.dataset.fsimBrand));
    });
    if($('#fsimGoInputs'))$('#fsimGoInputs').onclick=()=>{
      try{sessionStorage.setItem('focado-input-brand-from-simulator',brandLabel())}catch(_){}
      window.FocadoNavigate?.('inputs');
    };
    if($('#fsimCalcMode'))$('#fsimCalcMode').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({spreadsheetMode:e.target.value==='PLANILHA'}));
    if($('#fsimUf'))$('#fsimUf').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({estado:e.target.value}));
    $('#fsimCommission').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({comissao:num(e.target.value)/100}));
    if($('#fsimFreight'))$('#fsimFreight').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({tipoFrete:e.target.value}));
    if($('#fsimFreightMode'))$('#fsimFreightMode').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({freteManual:e.target.value==='MANUAL'}));
    $('#fsimMarginTarget').onchange=e=>rerender(window.FocadoLegacySimulator.setMarginTarget(num(e.target.value)/100));
    document.querySelectorAll('[data-price]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.price,{vendaCX:num(i.value)})));
    document.querySelectorAll('[data-box-qty]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.boxQty,{qtdCaixas:num(i.value)})));
    document.querySelectorAll('[data-contract]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.contract,{contrato:num(i.value)/100})));
    document.querySelectorAll('[data-freight-price]').forEach(i=>i.onchange=()=>{
      if(!snap.global.spreadsheetMode&&!snap.global.freteManual)window.FocadoLegacySimulator.setGlobal({freteManual:true});
      rerender(window.FocadoLegacySimulator.setPricing(i.dataset.freightPrice,{frete:num(i.value)}));
    });
    if($('#fsimProductSel'))$('#fsimProductSel').onchange=e=>{selectedProduct=e.target.value;rerender(snap)};
    document.querySelectorAll('[data-comp-unit]').forEach(i=>i.onchange=()=>updateCompositionField(i,'unit'));
    document.querySelectorAll('[data-comp-qty]').forEach(i=>i.onchange=()=>updateCompositionField(i,'qty'));
    document.querySelectorAll('[data-comp-loss]').forEach(i=>i.onchange=()=>updateCompositionField(i,'perda'));
  }

  window.FocadoSimulator=Object.freeze({render});
})();