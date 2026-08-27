(function(){
  'use strict';
  const content=()=>document.getElementById('fxContent');
  const sheets=[
    {name:'Álcool + Bicarbonato',file:'Ficha_Bicarbonato.pdf',brand:'Nova Era',desc:'Ficha de especificação técnica'},
    {name:'Álcool 46° INPM',file:'Ficha_46_INPM.pdf',brand:'Nova Era',desc:'Ficha de especificação técnica'},
    {name:'Álcool 70° INPM',file:'Ficha_70_INPM.pdf',brand:'Nova Era',desc:'Ficha de especificação técnica'},
    {name:'Álcool Gel 70° INPM',file:'Ficha_Gel_70_INPM.pdf',brand:'Nova Era',desc:'Ficha de especificação técnica'}
  ];
  function render(){
    content().innerHTML='<div class="fts-page">'+
      '<div class="fts-head"><div><span>CADASTROS</span><h1>Fichas Técnicas</h1><p>Documentos técnicos disponíveis no Focado.</p></div></div>'+
      '<div class="fts-grid">'+sheets.map(s=>'<article class="fts-card"><div class="fts-brand">'+s.brand+'</div><h2>'+s.name+'</h2><p>'+s.desc+'</p><div class="fts-actions"><a href="'+s.file+'" target="_blank" rel="noopener">Visualizar PDF</a><a href="'+s.file+'" download>Baixar PDF</a></div></article>').join('')+'</div>'+
      '<div class="fts-note">As demais fichas poderão ser adicionadas aqui sem voltar ao simulador legado.</div>'+
      '</div>';
  }
  window.FocadoTechnicalSheets={render};
})();