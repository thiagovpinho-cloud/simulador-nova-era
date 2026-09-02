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
  let tab='painel',snap=null,selectedProduct='';

  async function get(){
    const api=window.FocadoLegacySimulator;
    if(!api)throw new Error('MOTOR_SIMULADOR_INDISPONIVEL');
    snap=await api.ready();
    if(!selectedProduct&&snap.products?.[0])selectedProduct=snap.products[0].id;
    return snap;
  }

  function head(){
    return '<div class="fsim-head"><div><span>COMERCIAL · FORMAÇÃO DE PREÇO</span><h1>Simulador</h1><p>Painel operacional espelhado dos simuladores oficiais Nova Era e New Green.</p></div><div class="fsim-badge">Base oficial · 07/07/2026</div></div>'+
      '<div class="fsim-note"><b>Arquitetura integrada.</b> Preços vêm da Base de Insumos; receitas definem consumo de produção; o Painel aplica as mesmas regras de custo, impostos, frete, contrato e margem do motor oficial.</div>';
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
    const rows=[['painel','Painel']];
    if(canRecipes())rows.push(['receitas','Receitas']);
    return '<div class="fsim-tabs">'+rows.map(([id,label])=>'<button data-fsim-tab="'+id+'" class="'+(tab===id?'active':'')+'">'+label+'</button>').join('')+
      '<button type="button" id="fsimGoInputs">Base de Insumos →</button></div>';
  }

  function summary(){
    const approved=num(snap.totals.margemSem)>=num(snap.marginTarget);
    return '<div class="fsim-kpis">'+
      '<div><span>Total sem IPI/ST</span><b>'+money(snap.totals.semImpostos)+'</b><small>Base comercial</small></div>'+
      '<div><span>Total com IPI/ST</span><b>'+money(snap.totals.comImpostos)+'</b><small>Valor final simulado</small></div>'+
      '<div><span>Margem sem IPI/ST</span><b>'+pct(snap.totals.margemSem)+'</b><small>Média ponderada</small></div>'+
      '<div><span>Margem com IPI/ST</span><b>'+pct(snap.totals.margemCom)+'</b><small>Média ponderada</small></div>'+
      '</div><div class="fsim-note"><b>Status da simulação: '+(approved?'APROVADO':'NEGADO')+'.</b> Critério atual: margem média sem IPI/ST ≥ '+pct(snap.marginTarget)+'.</div>';
  }

  function painel(){
    const showFreight=snap.global.tipoFrete!=='FOB';
    return summary()+
      '<div class="fsim-card"><div class="fsim-card-head"><div><h2>Painel de formação de preço</h2><p>Estrutura operacional equivalente à aba PAINEL das planilhas oficiais.</p></div></div>'+
      '<div class="fsim-table-wrap"><table class="fsim-table fsim-panel-table"><thead><tr>'+
      '<th>NCM</th><th>Descrição técnica</th><th>UND</th><th>Qtd/CX</th><th>ICMS</th><th>Qtd CXS</th>'+
      '<th>Venda CX sem IPI/ST</th><th>Venda UN sem IPI/ST</th>'+(showFreight?'<th>Frete/CX</th>':'')+
      '<th>Contrato</th><th>Venda CX com IPI/ST</th><th>Venda UN com IPI/ST</th><th>Valor final venda</th><th>Margem sem IPI/ST</th><th>Margem com IPI/ST</th>'+
      '</tr></thead><tbody>'+
      snap.products.map(p=>{
        const units=Math.max(1,num(p.unitsPerCaixa)),qty=Math.max(0,num(p.pricing.qtdCaixas));
        const base=num(p.pricing.vendaCX),withTax=num(p.metrics.precoComImpostosCaixa);
        const freight=showFreight?(snap.global.freteManual
          ?'<td><div class="fsim-money-input"><span>R$</span><input data-freight-price="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+num(p.pricing.frete).toFixed(2)+'"></div></td>'
          :'<td><b>'+money(p.metrics.freteValor)+'</b><small>automático</small></td>'):'';
        return '<tr>'+
          '<td>'+esc(p.ncm)+'</td><td><b>'+esc(p.name)+'</b></td><td>CX</td><td>'+units+'</td><td>'+pct(snap.global.icms)+'</td>'+
          '<td><input class="fsim-cell-input" data-box-qty="'+esc(p.id)+'" type="number" min="0" step="1" value="'+qty+'"></td>'+
          '<td><div class="fsim-money-input"><span>R$</span><input data-price="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+base.toFixed(2)+'"></div></td>'+
          '<td>'+money(base/units)+'</td>'+freight+
          '<td><div class="fsim-percent-input"><input class="fsim-cell-input" data-contract="'+esc(p.id)+'" type="number" min="0" step="0.01" value="'+(num(p.pricing.contrato)*100).toFixed(2)+'"><span>%</span></div></td>'+
          '<td><b>'+money(withTax)+'</b></td><td>'+money(withTax/units)+'</td><td><b>'+money(num(p.metrics.totalComImpostos))+'</b></td>'+
          '<td><span class="fsim-margin '+(num(p.metrics.margemSem)>=num(snap.marginTarget)?'ok':'bad')+'">'+pct(p.metrics.margemSem)+'</span></td>'+
          '<td>'+pct(p.metrics.margemCom)+'</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  }

  function receitas(){
    if(!canRecipes())return '<div class="fsim-error"><b>Acesso restrito.</b><span>Receitas são visíveis somente para Administradores e Diretores.</span></div>';
    const p=snap.products.find(x=>x.id===selectedProduct)||snap.products[0];
    if(!p)return '<div class="fsim-empty">Nenhum produto disponível.</div>';
    return '<div class="fsim-card"><div class="fsim-card-head split"><div><h2>Receitas de Produção</h2><p>Quantidades e perdas desta receita alimentam a necessidade real de insumos da Produção.</p></div><select id="fsimProductSel">'+
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
      root().innerHTML='<div class="fsim-page">'+head()+controls()+tabs()+body()+'</div>';
      bind();
    }catch(err){
      console.error('[FocadoSimulator]',err);
      root().innerHTML='<div class="fsim-error"><b>Não foi possível carregar o simulador.</b><span>'+esc(err.message||err)+'</span></div>';
    }
  }
  function rerender(next){snap=next;if(tab==='receitas'&&!canRecipes())tab='painel';root().innerHTML='<div class="fsim-page">'+head()+controls()+tabs()+body()+'</div>';bind()}

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
    document.querySelectorAll('[data-fsim-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.fsimTab;rerender(snap)});
    if($('#fsimGoInputs'))$('#fsimGoInputs').onclick=()=>window.FocadoNavigate?.('inputs');
    $('#fsimBrand').onchange=e=>{selectedProduct='';rerender(window.FocadoLegacySimulator.setBrand(e.target.value))};
    $('#fsimUf').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({estado:e.target.value}));
    $('#fsimCommission').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({comissao:num(e.target.value)/100}));
    $('#fsimFreight').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({tipoFrete:e.target.value}));
    if($('#fsimFreightMode'))$('#fsimFreightMode').onchange=e=>rerender(window.FocadoLegacySimulator.setGlobal({freteManual:e.target.value==='MANUAL'}));
    $('#fsimMarginTarget').onchange=e=>rerender(window.FocadoLegacySimulator.setMarginTarget(num(e.target.value)/100));
    document.querySelectorAll('[data-price]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.price,{vendaCX:num(i.value)})));
    document.querySelectorAll('[data-box-qty]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.boxQty,{qtdCaixas:num(i.value)})));
    document.querySelectorAll('[data-contract]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.contract,{contrato:num(i.value)/100})));
    document.querySelectorAll('[data-freight-price]').forEach(i=>i.onchange=()=>rerender(window.FocadoLegacySimulator.setPricing(i.dataset.freightPrice,{frete:num(i.value)})));
    if($('#fsimProductSel'))$('#fsimProductSel').onchange=e=>{selectedProduct=e.target.value;rerender(snap)};
    document.querySelectorAll('[data-comp-unit]').forEach(i=>i.onchange=()=>updateCompositionField(i,'unit'));
    document.querySelectorAll('[data-comp-qty]').forEach(i=>i.onchange=()=>updateCompositionField(i,'qty'));
    document.querySelectorAll('[data-comp-loss]').forEach(i=>i.onchange=()=>updateCompositionField(i,'perda'));
  }

  window.FocadoSimulator=Object.freeze({render});
})();