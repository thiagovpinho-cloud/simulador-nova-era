# Focado — Fase 1 BI: Matriz de Dados e KPIs

## Objetivo
Criar a fundação funcional do BI sem alterar os cálculos e fluxos existentes do Focado. Nesta fase nenhuma regra operacional foi substituída.

## Fonte única
O contrato canônico está em `shared/bi-contract.js`. A API `GET /api/bi-contract` expõe o mesmo contrato para futuros dashboards e auditoria.

## Situação dos KPIs
- READY: volume vendido, share por marca, ranking de SKU, lead time operacional, pedidos atrasados.
- PARTIAL: faturamento bruto, OTIF, risco de ruptura, carga de produção.
- MISSING: faturamento líquido, margem de contribuição, meta x realizado.

## Regra de implementação
Um KPI só pode mudar para READY quando:
1. todos os campos obrigatórios existirem;
2. sua regra de cálculo estiver definida em uma única fonte;
3. houver caminho de drill-down até o registro operacional;
4. testes automatizados validarem o contrato.

## Novas estruturas necessárias nas próximas fases
- monthly_targets
- financial_facts
- sku_costs
- inventory_policy

Nenhuma dessas estruturas deve sobrescrever pedidos, PCP, estoque, produção, expedição ou logística existentes.
