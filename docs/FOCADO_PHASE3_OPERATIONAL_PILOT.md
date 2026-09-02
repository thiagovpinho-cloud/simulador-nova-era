# FOCADO — Fase 3: Piloto Operacional Integrado

**Data:** 01/09/2026  
**Branch:** `focado/fase-3-piloto-operacional`  
**Base:** `focado/integracao-operacional-fase-2d`

## Objetivo

Validar o FOCADO como sistema operacional integrado, exercitando simultaneamente regras de domínio, workflow, reações automáticas, automação segura e integridade de estoque.

## Cenário adversarial

O piloto inclui três pedidos concorrentes:

1. Pedido A1
   - disputa estoque existente;
   - atendimento integral.

2. Pedido A2
   - disputa o mesmo SKU;
   - estoque insuficiente;
   - atendimento parcial;
   - corte operacional controlado;
   - entrega com atraso e justificativa.

3. Pedido B1
   - produto sem estoque;
   - necessidade de produção;
   - dependência de compra;
   - recebimento destrava produção;
   - produção gera estoque;
   - PCP reavalia e reserva;
   - expedição e logística concluem o fluxo.

## Critérios de integridade

O piloto exige:

- nenhuma reserva acima do estoque disponível;
- nenhum saldo físico, reservado ou bloqueado negativo;
- compra recebida registrada uma única vez;
- produção consumindo matéria-prima;
- produção gerando produto acabado;
- expedição baixando estoque apenas após cobertura;
- corte preservando quantidade originalmente solicitada;
- atraso logístico exigindo justificativa;
- financeiro permanecendo humano-controlado;
- automação segura gerando sinais sem executar fatos financeiros;
- idempotência do log de automação;
- workflow refletindo corretamente cada mudança de responsabilidade.

## Cobertura já existente preservada

A suíte do FOCADO já possui:
- piloto com 100 usuários;
- cenário empresarial real E2E;
- stress multiusuário com 200 pedidos;
- Teste de Fogo desktop;
- Teste de Fogo mobile;
- regressão;
- BI;
- performance;
- usabilidade multifaixa etária;
- estabilidade do formulário de pedidos;
- workflow e automação segura.

A Fase 3 não substitui esses testes: adiciona uma camada de integração adversarial entre eles.

## Arquivo novo

- `tests/phase3-integrated-pilot.test.mjs`

## Decisão de liberação

A Fase 3 somente será considerada concluída se:
1. o piloto integrado passar;
2. todo o `npm test` continuar verde;
3. nenhuma regressão for detectada nos testes históricos;
4. produção permanecer sem alteração até merge controlado.
