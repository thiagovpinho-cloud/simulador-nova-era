import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow=fs.readFileSync(new URL('../assets/modules/logistics-flow.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/modules/logistics-flow.css',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/core/module-loader.js',import.meta.url),'utf8');

assert.match(loader,/'logistics-flow':\{css:'logistics-flow\.css',js:'logistics-flow\.js',deps:\['logistics-engine'\]\}/);
assert.match(loader,/simulador:\{css:'simulator\.css',js:'simulator\.js',deps:\['simulator-master-data','produtos','logistics-flow'\]\}/);
assert.match(loader,/pedidos:\{css:'orders\.css',js:'orders\.js',deps:\['produtos','order-drafts','logistics-flow'\]\}/);
assert.match(loader,/'freight-requests':\{css:'freight-requests\.css',js:'freight-requests\.js',deps:\['logistics-flow'\]\}/);
assert.match(loader,/'logistics-flow':\(\)=>typeof window\.FocadoLogisticsFlow\?\.refresh==='function'/);

assert.match(flow,/Resumo logístico/);
assert.match(flow,/kind==='simulator'\?'da simulação':'do pedido'/);
assert.match(flow,/Valor estimado para seguro/);
assert.match(flow,/calculateLoad/);
assert.match(flow,/quoteOrder/);
assert.match(flow,/PRECO_COM_IPI_ST/);
assert.match(flow,/focado-logistics-freight-prefill-v1/);
assert.match(flow,/Solicitar cotação com esta carga/);
assert.match(flow,/frClient/);
assert.match(flow,/frReference/);
assert.match(flow,/frOrigin/);
assert.match(flow,/frDestination/);
assert.match(flow,/frCargo/);
assert.match(flow,/frQuantity/);
assert.match(flow,/frDate/);
assert.match(flow,/frNotes/);
assert.match(flow,/Peso bruto:/);
assert.match(flow,/Cubagem:/);
assert.match(flow,/Pallets estimados:/);
assert.match(flow,/Valor estimado da mercadoria para seguro:/);
assert.match(flow,/Cadastro de Produtos/);
assert.match(flow,/data-flog-context="simulator"/);
assert.match(flow,/data-flog-context="order"/);
assert.match(flow,/window\.FocadoNavigate\)window\.FocadoNavigate\('cotacoes-frete'\)/);

assert.match(css,/\.flog-kpis/);
assert.match(css,/\.flog-freight-preview/);
assert.match(css,/\.fr-summary \.wide b\{white-space:pre-line\}/);

console.log('logistics-flow-integration: ok');
