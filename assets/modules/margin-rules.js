(function(){
  'use strict';
  const root=()=>document.getElementById('fxContent');
  const state=()=>window.FocadoDataStore?.readLocal?.()||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ITEMS=[
    ['product_cost','Custo do Produto','Custo variável do SKU vigente na data do pedido.'],
    ['icms','ICMS','Valor de ICMS registrado no pedido/faturamento.'],
    ['pis','PIS','Valor de PIS registrado no pedido/faturamento.'],
    ['cofins','COFINS','Valor de COFINS registrado no pedido/faturamento.'],
    ['ipi','IPI','Valor de IPI somado ao valor final do pedido.'],
    ['st','ST','Valor de substituição tributária somado ao valor final do pedido.'],
    ['freight','Frete','Frete alocado ao pedido.'],
    ['commission','Comissão','Comissão vinculada ao pedido.'],
    ['contract','Contrato','Percentual/valor contratual convertido em valor do pedido.']
  ];
  const defaults=()=>Object.fromEntries(ITEMS.map(([k])=>[k,'CUSTO']));
  function current(){return {...defaults(),...(state().marginRules||{})}}
  function ruleRow(key,label,desc,value){
    return '<div class="fmr-row" data-rule="'+esc(key)+'"><div class="fmr-meta"><b>'+esc(label)+'</b><span>'+esc(desc)+'</span></div>'+
      '<div class="fmr-choice"><button type="button" data-value="CUSTO" class="'+(value==='CUSTO'?'active cost':'')+'">Custo</button>'+
      '<button type="button" data-value="MARGEM" class="'+(value==='MARGEM'?'active margin':'')+'">Margem</button></div></div>';
  }
  function render(){
    const r=current();
    root().innerHTML='<div class="fmr-page">'+
      '<div class="fx-titlebar"><div><span class="fx-eyebrow">CONFIGURAÇÕES · FINANCEIRO</span><h1>Regras de Margem</h1><p>Defina o que reduz o resultado líquido de cada pedido e o que permanece dentro da margem.</p></div></div>'+
      '<section class="fmr-explain"><div><b>Faturamento Bruto</b><span>Valor final dos pedidos, incluindo IPI e ST registrados.</span></div><i>−</i><div><b>Itens marcados como Custo</b><span>Mais descontos, devoluções e bonificações.</span></div><i>=</i><div><b>Faturamento Líquido</b><span>Valor que permanece como resultado/margem conforme estas regras.</span></div></section>'+
      '<section class="fmr-card"><div class="fmr-card-head"><div><h2>Classificação dos componentes</h2><p>“Custo” abate o valor correspondente. “Margem” mantém esse valor no resultado do pedido.</p></div><span>Todos iniciam como Custo</span></div>'+
      '<div class="fmr-list">'+ITEMS.map(([k,l,d])=>ruleRow(k,l,d,String(r[k]||'CUSTO').toUpperCase())).join('')+'</div>'+
      '<div id="fmrMsg" class="fmr-msg"></div><div class="fmr-actions"><button id="fmrReset" class="secondary">Marcar todos como Custo</button><button id="fmrSave" class="primary">Salvar Regras de Margem</button></div></section>'+
      '<section class="fmr-note"><b>Rastreabilidade</b><span>As regras ficam registradas no estado oficial e o BI usa a configuração vigente para calcular líquido e margem. Descontos, devoluções e bonificações continuam sendo deduções obrigatórias, independentemente desta tela.</span></section>'+
    '</div>';
    bind();
  }
  function readForm(){
    const out={};
    document.querySelectorAll('[data-rule]').forEach(row=>{
      out[row.dataset.rule]=row.querySelector('[data-value].active')?.dataset.value||'CUSTO';
    });
    return out;
  }
  function setAll(value){
    document.querySelectorAll('[data-rule]').forEach(row=>{
      row.querySelectorAll('[data-value]').forEach(b=>b.className=b.dataset.value===value?'active '+(value==='CUSTO'?'cost':'margin'):'');
    });
  }
  function bind(){
    document.querySelectorAll('[data-rule]').forEach(row=>{
      row.querySelectorAll('[data-value]').forEach(btn=>btn.onclick=()=>{
        row.querySelectorAll('[data-value]').forEach(b=>b.className='');
        btn.className='active '+(btn.dataset.value==='CUSTO'?'cost':'margin');
      });
    });
    document.getElementById('fmrReset').onclick=()=>setAll('CUSTO');
    document.getElementById('fmrSave').onclick=async()=>{
      const btn=document.getElementById('fmrSave'),msg=document.getElementById('fmrMsg');
      btn.disabled=true;btn.textContent='Salvando...';msg.textContent='';msg.className='fmr-msg';
      try{
        const result=await window.FocadoDataStore?.saveDomain?.('FINANCEIRO',{marginRules:readForm()});
        if(!result?.ok)throw new Error(result?.error||'SAVE_FAILED');
        if(result?.payload)window.FocadoDataStore?.writeLocal?.(result.payload);
        msg.className='fmr-msg ok';msg.textContent='Regras salvas. Os próximos cálculos de faturamento líquido e margem usarão esta configuração.';
      }catch(err){
        console.error('[FocadoMarginRules]',err);
        msg.className='fmr-msg error';msg.textContent='Não foi possível salvar as Regras de Margem.';
      }finally{btn.disabled=false;btn.textContent='Salvar Regras de Margem'}
    };
  }
  window.FocadoMarginRules={render};
})();