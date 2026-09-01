# FOCADO — Aceite Técnico da Fase 2C

**Data:** 01/09/2026  
**Branch:** `focado/integracao-operacional-fase-2c`  
**Base:** `focado/integracao-operacional-fase-2b`

## Objetivo

Transformar o workflow integrado em experiência operacional clara, priorizada e rastreável para o usuário.

## Entregas

- priorização automática das pendências;
- níveis: Crítica, Alta, Média e Normal;
- peso de prazo e tipo de ação na criticidade;
- ordenação automática da fila por prioridade;
- destaque visual das pendências críticas;
- Cockpit 360º com prioridade da próxima ação;
- timeline operacional por pedido;
- exibição das reações automáticas entre áreas;
- rastreabilidade causal preservada;
- botão contextual para resolver na área responsável;
- API de workflow passa a expor as reações recentes.

## Regras de priorização

A priorização é determinística e considera:
- atraso ou proximidade do prazo;
- dependência de produção/compra;
- expedição/logística;
- fechamento financeiro;
- estágio macro do pedido.

A prioridade não altera dados nem executa ações: apenas ordena e sinaliza o trabalho.

## Segurança

- nenhuma escrita operacional foi adicionada à Central;
- nenhuma baixa de estoque é disparada pela tela;
- nenhuma compra ou produção é criada;
- nenhum fato financeiro é criado automaticamente;
- o status macro legado continua intacto.

## Critérios de aceite

1. Central exibe criticidade;
2. itens são ordenados por score;
3. Cockpit mostra próxima ação e prioridade;
4. reações da Fase 2B aparecem na timeline;
5. vínculos causais permanecem visíveis;
6. mobile mantém tratamento responsivo;
7. suíte histórica continua verde.

## Arquivos alterados

- `api/workflow.js`
- `assets/modules/pendencias.js`
- `assets/modules/pendencias.css`
- `tests/pendencias-module.test.mjs`

## Próxima etapa recomendada — Fase 2D

Automação ampliada, apenas para ações determinísticas e reversíveis de baixo risco, com feature flags, auditoria e idempotência. Ações financeiras, comerciais, compras e baixas físicas devem continuar exigindo regras explícitas e proteção adicional.
