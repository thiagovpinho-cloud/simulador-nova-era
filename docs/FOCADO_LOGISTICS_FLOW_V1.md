# FOCADO — Fluxo Logístico Integrado V1

## Objetivo
Usar uma única parametrização logística do Cadastro de Produtos para calcular e transportar informações de carga entre Simulador, Pedido Comercial e Cotação de Frete, eliminando redigitação.

## Fonte de verdade
- Cadastro de Produtos: peso, cubagem, embalagem e palletização.
- Motor: `assets/modules/logistics-engine.js`.
- Referência inicial: planilha interna Modelo Cotação de Coleta / Tabela de Referência de 03/09/2026.

## Simulador
Com quantidades de caixas informadas, exibe automaticamente:
- caixas;
- peso bruto;
- cubagem;
- pallets estimados;
- valor estimado da mercadoria para seguro, usando preço com IPI/ST do simulador;
- alerta de cadastro incompleto por SKU.

## Pedido Comercial
A mesma leitura é feita sobre os itens do pedido. Quando há UF e vínculo com o simulador, o valor de seguro usa a estimativa de preço com IPI/ST. Caso contrário, o sistema sinaliza que está usando o preço base como referência e que o valor fiscal deve ser validado.

## Cotação de Frete
O botão `Solicitar cotação com esta carga` reaproveita a carga calculada e abre a cotação com cliente, referência, destino, produtos, caixas, peso, cubagem, pallets, data desejada e valor estimado para seguro preenchidos. A origem permanece editável porque o Pedido Comercial não contém uma origem de coleta confiável única.

## Regras de segurança
- Não inventar cubagem ausente: produto incompleto permanece sinalizado.
- Não alterar pedidos históricos.
- Não criar nova base paralela de peso/cubagem.
- Não usar valor estimado como NF emitida; ele é referência para seguro/cotação.
- Parâmetros posteriores devem ser mantidos no Cadastro de Produtos.

## Testes
- `product-logistics-parameters.test.mjs`: valida motor e referência logística.
- `logistics-flow-integration.test.mjs`: valida contratos Simulador → Pedido → Cotação.
- Quality Gate completo deve passar antes de merge/deploy.
