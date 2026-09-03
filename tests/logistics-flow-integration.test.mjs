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

// A solicitação originada do Simulador/Pedido deve carregar um snapshot de máquina
// dentro do payload já persistido pelo domínio, sem alterar a mensagem mostrada ao usuário.
assert.match(flow,/const MARKER='FOCADO_LOGISTICS_V1'/);
assert.match(flow,/function compactSnapshot\(snapshot\)/);
assert.match(flow,/function snapshotMarker\(snapshot\)/);
assert.match(flow,/function extractSnapshot\(value\)/);
assert.match(flow,/notes\.value=visibleNotes\(notes\.value\)\+snapshotMarker\(snapshot\)/);
assert.match(flow,/noteEl\.textContent=visibleNotes\(raw\)/);

// Economia de frete calculada sobre o snapshot original da carga.
assert.match(flow,/perBox:boxes>0\?v\/boxes:0/);
assert.match(flow,/perKg:kg>0\?v\/kg:0/);
assert.match(flow,/perM3:m3>0\?v\/m3:0/);
assert.match(flow,/perPallet:pallets>0\?v\/pallets:0/);
assert.match(flow,/pctMerch:merch>0\?v\/merch:0/);
assert.match(flow,/\/cx<\/span>/);
assert.match(flow,/\/kg<\/span>/);
assert.match(flow,/\/m³<\/span>/);
assert.match(flow,/\/pallet<\/span>/);
assert.match(flow,/da carga<\/span>/);
assert.match(flow,/CARGA GRAVADA NA SOLICITAÇÃO/);

// Prova numérica independente: frete R$ 1.000 para a carga teste da planilha.
const freight=1000,boxes=100,kg=1244.4,m3=2.2835,pallets=2,merch=5810.70;
assert.equal(freight/boxes,10);
assert.ok(Math.abs(freight/kg-0.8036001285760206)<1e-12);
assert.ok(Math.abs(freight/m3-437.92423910663456)<1e-10);
assert.equal(freight/pallets,500);
assert.ok(Math.abs(freight/merch-0.17209630509232968)<1e-12);

assert.match(css,/\.flog-kpis/);
assert.match(css,/\.flog-freight-preview/);
assert.match(css,/\.flog-economics/);
assert.match(css,/\.flog-request-snapshot/);
assert.match(css,/\.fr-summary \.wide b\{white-space:pre-line\}/);

console.log('logistics-flow-integration: ok');
