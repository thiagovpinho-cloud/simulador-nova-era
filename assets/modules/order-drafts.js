(function(){
  'use strict';
  function render(rows,esc,money,value,dbr){
    const list=rows.length
      ? '<div class="fo-draft-list">'+rows.map(o=>
          '<div class="fo-draft-row"><div><span class="fo-stage draft">Rascunho</span><b>'+esc(o.number)+'</b><small>'+esc(o.client||'Cliente ainda não informado')+' · '+dbr(o.orderDate)+'</small></div>'+
          '<div class="fo-draft-value"><span>'+((o.items||[]).length)+' item(ns)</span><strong>'+money(value(o))+'</strong></div>'+
          '<div class="fo-actions"><button class="fo-open" data-fo-edit="'+esc(o.id)+'">Editar</button><button class="fo-open fo-delete-order" data-fo-delete="'+esc(o.id)+'">Excluir</button></div></div>'
        ).join('')+'</div>'
      : '<div class="fo-empty compact">Nenhum rascunho salvo.</div>';
    return '<section class="fo-drafts" id="foDrafts"><div class="fo-drafts-head"><div><span>RASCUNHOS</span><h2>Pedidos ainda não enviados</h2><p>Use Editar para continuar o preenchimento ou Excluir para remover um rascunho.</p></div><strong>'+rows.length+'</strong></div>'+list+'</section>';
  }
  window.FocadoOrderDrafts=Object.freeze({render});
})();