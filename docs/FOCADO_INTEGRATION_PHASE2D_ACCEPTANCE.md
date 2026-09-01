# FOCADO — Aceite Técnico da Fase 2D

**Data:** 01/09/2026  
**Branch:** `focado/integracao-operacional-fase-2d`  
**Base:** `focado/integracao-operacional-fase-2c`

## Objetivo

Introduzir automação ampliada de baixo risco com feature flags, idempotência e transparência operacional, sem executar ações irreversíveis.

## Motor de automação segura

Novo módulo:
- `shared/workflow-automation.js`

A automação é desligada por padrão e depende de:
`settings.workflowAutomation.enabled = true`

## Sinais automáticos suportados

Quando ativada, a automação pode registrar:

- `PRODUCTION_READY_FOR_REVIEW`
  - compra vinculada concluída;
  - Produção recebe sinal de prontidão.

- `PCP_RECHECK_AVAILABLE_STOCK`
  - produção concluída disponibilizou saldo;
  - PCP recebe sinal para reavaliar/reservar.

- `EXPEDITION_READY`
  - pedido coberto e em Logística;
  - Expedição recebe sinal de preparação.

- `LOGISTICS_READY`
  - Expedição liberada;
  - Logística recebe continuidade do fluxo.

- `FINANCE_READY`
  - pedido entregue sem fato financeiro;
  - Financeiro recebe sinal de fechamento.

## Limites invioláveis

A Fase 2D NÃO:
- cria pedidos de compra;
- conclui produção;
- reserva ou baixa estoque automaticamente;
- seleciona transportadora;
- confirma entrega;
- cria nota/fato financeiro;
- altera condição comercial;
- muda status macro do pedido.

## Idempotência

Cada atuação possui assinatura determinística. O mesmo estado não duplica o log de automação.

## Feature flags

Flags individuais disponíveis:
- `productionReadiness`
- `pcpRecheck`
- `expeditionReadiness`
- `logisticsReadiness`
- `financeReadiness`

Todas respeitam a chave mestra `enabled`.

## Transparência

A Central de Pendências mostra explicitamente:
- AUTOMAÇÃO SEGURA ATIVA; ou
- AUTOMAÇÃO SEGURA DESATIVADA.

Quando ativa, informa a quantidade de sinais técnicos ativos.

## Testes

Novo teste:
- `tests/workflow-automation.test.mjs`

Cobertura:
- automação desligada por padrão;
- ativação por feature flag;
- cinco sinais suportados;
- idempotência;
- desativação segura.

O teste foi incluído no `npm test` / Quality Gate do FOCADO.

## Próximo passo

Após validação completa da branch, a evolução recomendada é preparar uma fase controlada de ativação:
1. ativar inicialmente apenas sinais de Produção e PCP;
2. observar dados reais;
3. medir falsos positivos;
4. ampliar progressivamente Expedição, Logística e Financeiro;
5. somente depois avaliar automações que efetivamente escrevam em domínios operacionais.
