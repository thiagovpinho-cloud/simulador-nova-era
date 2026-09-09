from pathlib import Path
import re
import json

customers = Path('assets/modules/customers.js')
s = customers.read_text()

old = '<th>Representante</th><th>Status</th>'
assert old in s
s = s.replace(old, '<th>Representante</th><th>Condição pgto.</th><th>Status</th>', 1)

old = "<td>'+esc(c.representative||'—')+'</td><td><span class=\"fc-chip "
assert old in s
s = s.replace(old, "<td>'+esc(c.representative||'—')+'</td><td>'+esc(c.paymentTerms||'—')+'</td><td><span class=\"fc-chip ", 1)

old = "field('UF','fcState',c.state)+field('Representante','fcRepresentative',c.representative)+select('Status','fcActive'"
assert old in s
s = s.replace(old, "field('UF','fcState',c.state)+field('Representante','fcRepresentative',c.representative)+field('Condição de pagamento','fcPaymentTerms',c.paymentTerms)+select('Tipo de frete padrão','fcFreightType',c.freightType||'CIF',['CIF','FOB','Redespacho'])+select('Status','fcActive'", 1)

old = '<button class="fc-btn primary" id="fcSave">Salvar cliente</button></div><div class="fc-card">'
assert old in s
new = '<div class="fc-actions">\'+(existing?\'<button class="fc-btn" id="fcDelete" type="button">Excluir cliente</button>\':\'\')+\'<button class="fc-btn primary" id="fcSave">Salvar cliente</button></div></div><div class="fc-card">'
s = s.replace(old, new, 1)

old = "document.getElementById('fcSave').onclick=()=>saveCustomer(c);\n    if(!existing)setTimeout(()=>cnpj.focus(),0);"
assert old in s
s = s.replace(old, "document.getElementById('fcSave').onclick=()=>saveCustomer(c);\n    const deleteBtn=document.getElementById('fcDelete');\n    if(deleteBtn)deleteBtn.onclick=()=>deleteCustomer(c);\n    if(!existing)setTimeout(()=>cnpj.focus(),0);", 1)

old = "representative:document.getElementById('fcRepresentative').value.trim(),active:document.getElementById('fcActive').value==='ATIVO'"
assert old in s
s = s.replace(old, "representative:document.getElementById('fcRepresentative').value.trim(),paymentTerms:document.getElementById('fcPaymentTerms').value.trim(),freightType:document.getElementById('fcFreightType').value,active:document.getElementById('fcActive').value==='ATIVO'", 1)

marker = '  async function saveCustomer(base){'
assert marker in s
fn = """  async function deleteCustomer(customer){
    const ops=load();
    const cnpj=normCnpj(customer.cnpj);
    const linked=(ops.orders||[]).some(o=>normCnpj(o.cnpj)===cnpj);
    const message=linked
      ?'Este cliente já possui pedido(s) no histórico. Ele não será apagado; ficará INATIVO para preservar a rastreabilidade. Continuar?'
      :'Excluir este cliente? Esta ação remove somente o cadastro mestre e não pode ser desfeita.';
    if(!confirm(message))return;
    const changes=linked?{customer:{...customer,active:false,updatedAt:Date.now()}}:{deleteId:customer.id};
    const res=await window.FocadoDataStore.saveDomain('CLIENTES',changes,null);
    if(!res?.ok){alert('Não foi possível excluir/inativar o cliente.');return}
    if(res.payload)window.FocadoDataStore.writeLocal(res.payload);
    const refreshed=await window.FocadoDataStore.refreshDomainV2?.('customers');
    if(refreshed?.payload)window.FocadoDataStore.writeLocal(refreshed.payload);
    alert(linked?'Cliente inativado. O histórico dos pedidos foi preservado.':'Cliente excluído.');
    render({q:''});
  }

"""
s = s.replace(marker, fn + marker, 1)
customers.write_text(s)

orders = Path('assets/modules/orders.js')
s = orders.read_text()
pattern = re.compile(r"  function previousOrderByCnpj\(cnpj,ops,currentId\)\{.*?\n  function collect\(\)\{", re.S)
m = pattern.search(s)
assert m, 'customer lookup block not found'
replacement = """  function customerByCnpj(cnpj,ops){
    const key=normalizeCnpj(cnpj);
    return (ops.customers||[]).find(c=>normalizeCnpj(c.cnpj)===key)||null;
  }
  function applyCustomer(customer){
    setForm('client',customer.name||customer.client||'');
    setForm('email',customer.email);
    setForm('phone',customer.phone);
    setForm('cep',customer.cep);
    setForm('bairro',customer.bairro);
    setForm('city',customer.city);
    setForm('uf',customer.state||customer.uf);
    setForm('deliveryAddress',customer.address);
    setForm('representative',customer.representative);
    setForm('paymentTerms',customer.paymentTerms);
    if(customer.freightType)setForm('freightType',customer.freightType);
    if(customer.brand)setForm('brand',customer.brand);
  }
  function bindCnpjLookup(ops,o){
    const input=document.getElementById('foCnpj'),btn=document.getElementById('foCnpjLookup'),status=document.getElementById('foCnpjStatus');let last='';
    function lookup(){
      const cnpj=normalizeCnpj(input.value);input.value=formatCnpj(cnpj);
      if(cnpj.length!==14){status.textContent='Informe os 14 dígitos do CNPJ.';status.className='fo-cnpj-status bad';return}
      if(cnpj===last)return;last=cnpj;
      status.textContent='Consultando cadastro de Clientes...';status.className='fo-cnpj-status';
      const customer=customerByCnpj(cnpj,load());
      if(!customer){
        status.textContent='Cliente não encontrado no cadastro do Focado. Cadastre o cliente antes de criar o pedido.';
        status.className='fo-cnpj-status bad';
        return;
      }
      if(customer.active===false){
        status.textContent='Cliente inativo. Reative o cadastro antes de criar um novo pedido.';
        status.className='fo-cnpj-status bad';
        return;
      }
      applyCustomer(customer);
      status.textContent='Cliente encontrado no cadastro mestre do Focado. Dados comerciais carregados.';
      status.className='fo-cnpj-status ok';
    }
    btn.onclick=lookup;
    input.onblur=lookup;
    input.oninput=()=>{
      const d=normalizeCnpj(input.value);
      input.value=formatCnpj(d);
      if(d!==last)last='';
      if(d.length===14)setTimeout(lookup,120);
    };
  }

  function collect(){"""
s = s[:m.start()] + replacement + s[m.end():]
orders.write_text(s)

rules = Path('shared/domain-rules.js')
s = rules.read_text()
old = """function applyCustomers(state,body){
  const c=body.changes||{};
  state.customers=Array.isArray(state.customers)?state.customers:[];
  if(c.customer&&typeof c.customer==='object'){
    const incoming=structuredClone(c.customer);
    const idx=state.customers.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx>=0)state.customers[idx]=incoming;
    else state.customers.unshift(incoming);
  }
}"""
assert old in s
new = """function applyCustomers(state,body){
  const c=body.changes||{};
  state.customers=Array.isArray(state.customers)?state.customers:[];
  const norm=v=>String(v||'').replace(/\\D/g,'');
  if(c.customer&&typeof c.customer==='object'){
    const incoming=structuredClone(c.customer);
    const cnpj=norm(incoming.cnpj);
    if(cnpj){
      const duplicate=state.customers.find(x=>String(x.id)!==String(incoming.id)&&norm(x.cnpj)===cnpj);
      if(duplicate)throw Object.assign(new Error('CUSTOMER_CNPJ_ALREADY_EXISTS'),{status:409});
    }
    const idx=state.customers.findIndex(x=>String(x.id)===String(incoming.id));
    if(idx>=0)state.customers[idx]=incoming;
    else state.customers.unshift(incoming);
  }
  if(c.deleteId){
    const target=state.customers.find(x=>String(x.id)===String(c.deleteId));
    if(!target)return;
    const targetCnpj=norm(target.cnpj);
    const linked=(state.orders||[]).some(o=>targetCnpj&&norm(o.cnpj)===targetCnpj);
    if(linked){target.active=false;target.updatedAt=Date.now();}
    else state.customers=state.customers.filter(x=>String(x.id)!==String(c.deleteId));
  }
}"""
s = s.replace(old, new, 1)
rules.write_text(s)

test = Path('tests/customer-master-flow.test.mjs')
test.write_text('''import assert from "node:assert/strict";\nimport { applyDomain } from "../shared/domain-rules.js";\n\nconst state={customers:[],orders:[]};\nconst customer={id:"cli_1",cnpj:"47978428000177",name:"Cliente Teste",paymentTerms:"28 dias",active:true};\napplyDomain("CLIENTES",state,{changes:{customer}});\nassert.equal(state.customers.length,1);\nassert.equal(state.customers[0].paymentTerms,"28 dias");\nassert.throws(()=>applyDomain("CLIENTES",state,{changes:{customer:{...customer,id:"cli_2"}}}),/CUSTOMER_CNPJ_ALREADY_EXISTS/);\napplyDomain("CLIENTES",state,{changes:{deleteId:"cli_1"}});\nassert.equal(state.customers.length,0);\napplyDomain("CLIENTES",state,{changes:{customer}});\nstate.orders.push({id:"op_1",cnpj:customer.cnpj});\napplyDomain("CLIENTES",state,{changes:{deleteId:"cli_1"}});\nassert.equal(state.customers.length,1);\nassert.equal(state.customers[0].active,false);\nconsole.log("customer-master-flow: ok");\n''')

package = Path('package.json')
data = json.loads(package.read_text())
needle = 'node tests/customer-master-flow.test.mjs'
if needle not in data['scripts']['test']:
    data['scripts']['test'] += ' && ' + needle
package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
