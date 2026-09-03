import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const master=read('assets/modules/simulator-master-data.js');
const inputs=read('assets/modules/inputs.js');
const pcp=read('assets/modules/pcp.js');
const sim=read('assets/modules/simulator.js');
const prod=read('assets/modules/production.js');
const loader=read('assets/core/module-loader.js');
const index=read('index.html');

// Base oficial: 40 linhas utilizáveis por marca, excluindo produto acabado e "Não Utilizável".
assert.equal((master.match(/brand:'Nova Era'/g)||[]).length,40);
assert.equal((master.match(/brand:'New Green'/g)||[]).length,40);
assert.match(master,/code:'51640',name:'ÁLCOOL ANIDRO GRANEL'.*price:2\.9/);
assert.match(master,/brand:'New Green'.*code:'51640'.*price:3\.045/);
assert.match(master,/code:'46255',name:'TRIETANOLAMINA \/ NEUTRALIZANTE'/);
assert.match(master,/code:'127279',name:'CHAPATEX MARRON 1200X1000X3MM'/);

// Insumos é cadastro próprio, editável/removível e usa a fonte oficial.
assert.match(loader,/inputs:\{css:'inputs\.css',js:'inputs\.js',deps:\['simulator-master-data'\]\}/);
assert.match(inputs,/FocadoSimulatorMasterData/);
assert.match(inputs,/Código Senir/);
assert.match(inputs,/Código CHB/);
assert.match(inputs,/data-fin-delete/);
assert.match(inputs,/deleteId:item\.id/);
assert.match(inputs,/manualOverride:true/);
assert.match(inputs,/active!==false/);

// Histórico PCP deve usar a mesma definição do KPI concluído.
assert.match(pcp,/historyRows=\(ops\.orders\|\|\[\]\)[\s\S]*?\['LOGISTICA','ENTREGUE'\]\.includes/);
assert.ok(!/historyRows[\s\S]{0,240}commercial\?\.completedAt/.test(pcp));
assert.match(pcp,/inventoryEntry\(ops,item,brand=''/);
assert.match(pcp,/stockView\(ops,i,o\.brand\)/);

// Painel espelha colunas da planilha e Receitas é restrito.
for(const label of ['NCM','Descrição técnica','Qtd CXS','Venda CX sem IPI/ST','Venda UN sem IPI/ST','Frete/CX','Contrato','Venda CX com IPI/ST','Valor final venda','Margem sem IPI/ST','Margem com IPI/ST']){
  assert.ok(sim.includes(label),'Painel sem coluna: '+label);
}
assert.match(sim,/const canRecipes=.*ADMIN.*DIRETOR/);
assert.match(sim,/Receitas de Produção/);
assert.ok(!sim.includes("['insumos','Base de Insumos']"));
assert.match(sim,/FocadoNavigate\?\.\('inputs'\)/);

// Receita vigente alimenta Produção.
assert.match(index,/recipeFor\(brandLabel,productRef\)/);
assert.match(prod,/FocadoLegacySimulator\?\.recipeFor/);

// Quantidades de receita confirmadas pelos simuladores oficiais 07/07/2026.
for(const value of ['0.6088607594936708','0.8835443037974683','4.417721518987341','0.2715495090000001']){
  assert.ok(index.includes(value),'Quantidade oficial ausente: '+value);
}
assert.match(index,/link\('51640',10,0\.03\)/);
assert.match(index,/link\('51640',10,0\.01\)/);
assert.match(index,/link\('51640',13,0\.01\)/);

// O motor de preço é alimentado pelo cadastro Focado de insumos.
assert.match(sim,/inputCatalog/);
assert.match(sim,/setInputPrice/);
assert.match(sim,/PLANILHA|FocadoSimulatorMasterData/);

// Cache publica a nova arquitetura.
assert.match(index,/module-loader\.js\?v=20260902-simulator-hotfix-v3/);
assert.match(loader,/const VERSION='20260902-simulator-hotfix-v3'/);

console.log('simulator-architecture-v2: ok');
