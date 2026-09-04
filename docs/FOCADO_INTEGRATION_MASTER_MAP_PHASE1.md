# FOCADO — Mapa Mestre de Integrações
## Fase 1 · Diagnóstico técnico-operacional

**Data:** 01/09/2026  
**Branch:** `focado/integracao-operacional-fase-1`  
**Objetivo:** identificar, com base no código real, como os domínios do FOCADO se relacionam hoje, onde existem integrações completas, parciais ou manuais e qual deve ser a sequência segura para transformar o sistema em um fluxo operacional integrado de ponta a ponta.

---

## 1. Conclusão executiva

O FOCADO **já possui boa parte das capacidades necessárias para operar de ponta a ponta**, mas a integração ainda está incompleta no nível de orquestração.

Hoje existem regras e persistência para:
- Comercial / pedidos;
- PCP e reserva de estoque;
- Compras e recebimento de insumos;
- Produção e consumo/entrada de materiais;
- Estoque;
- Expedição;
- Logística;
- Financeiro;
- BI;
- Auditoria;
- motor de inteligência operacional.

O principal gargalo é que **muitos domínios conseguem trocar dados, mas o próximo passo ainda precisa ser acionado explicitamente por uma tela, operador ou chamada específica**.

A máquina de estados principal do pedido ainda cobre apenas:

`COMERCIAL → PCP → LOGISTICA → ENTREGUE`

Compras, Produção, Expedição e Financeiro participam do ciclo, porém **não são estados/dependências de primeira classe no fluxo principal do pedido**.

### Definição de “FOCADO integrado”

Um pedido deve conseguir atravessar:

`Comercial → Estoque/PCP → Produção/Compras → Estoque → Expedição → Logística → Entrega → Financeiro → BI`

sem depender de uma pessoa para transportar informação entre departamentos.

---

## 2. Arquitetura já existente e preservada

### 2.1 Fonte de estado
O backend trabalha com um workspace compartilhado versionado por `revision`, com proteção contra conflito de revisão.

### 2.2 Escrita por domínio
A API `/api/domain` aplica permissões específicas e delega alterações para regras centralizadas em `shared/domain-rules.js`.

### 2.3 Transições
A API `/api/transition` centraliza a mudança de status principal do pedido, valida regras e grava auditoria.

### 2.4 Auditoria
As escritas de domínio e transições já geram eventos em `focado_audit_events`.

### 2.5 Inteligência operacional
O motor `intelligence-core.js` já calcula:
- exceções;
- risco por pedido;
- MRP;
- necessidade de produção;
- faltas de material;
- score de fornecedores;
- score de transportadoras;
- sugestões;
- achados de auditoria.

Isto é uma base valiosa para a futura operação por exceção.

---

## 3. Matriz atual de integração

| Origem | Destino | Situação atual | Evidência no código | Lacuna principal |
|---|---|---|---|---|
| Comercial | PCP | **Integrado** | transição `COMERCIAL → PCP` | poderia gerar análise automática inicial |
| PCP | Estoque | **Integrado** | reserva/liberação altera `inventory.reserved` e cria movimentação | ainda depende da ação do PCP |
| PCP | Logística | **Integrado parcialmente** | pré-liberação e data de disponibilidade | coordenação ainda manual |
| PCP | Produção | **Parcial** | inteligência calcula necessidade e testes criam solicitação | solicitação não nasce automaticamente do gap |
| Produção | Compras | **Parcial** | `materialStatus=COMPRAR` e motor detecta falta | compra não é criada/vinculada automaticamente |
| Compras | Estoque de insumos | **Integrado** | recebimento atualiza `inputInventory` e gera `ENTRADA_COMPRA` | não reavalia automaticamente produção dependente |
| Produção | Estoque acabado | **Integrado** | conclusão consome insumo e gera `ENTRADA_PRODUCAO` | não reavalia automaticamente pedidos PCP aguardando |
| Estoque | PCP | **Parcial** | saldo passa a existir e pode ser reservado | pedido aguardando não é retomado automaticamente |
| PCP | Expedição | **Parcial** | pedido chega a LOGISTICA, reserva já existe | Expedição não faz parte da máquina de estados principal |
| Expedição | Estoque | **Integrado** | baixa física `SAIDA_PEDIDO`, libera reserva | disparo depende da ação de expedição |
| Expedição | Logística | **Parcial** | `readyForPickup` é usado pelo motor de exceções | sem transição explícita de carga liberada |
| Logística | Entrega | **Integrado** | `LOGISTICA → ENTREGUE` | entrega encerra status, mas ainda não fecha ciclo financeiro |
| Entrega | Financeiro | **Parcial** | financeiro aceita `financialFact` por `order_id` | fato financeiro não nasce automaticamente da conclusão |
| Financeiro | BI | **Integrado** | `financialFacts` alimentam analytics | depende de entrada correta do fato financeiro |
| Todos | Auditoria | **Integrado no backend** | `DOMAIN_WRITE` e `STATUS_TRANSITION` | eventos de negócio ainda podem ganhar granularidade causal |
| Todos | Inteligência | **Integrado para leitura** | motor usa pedidos, estoque, compras, produção e logística | recomenda, mas ainda não orquestra ações |

---

## 4. Gargalos estruturais encontrados

### G1 — Máquina de estados curta demais
O `FLOW` principal contém apenas:
- COMERCIAL;
- PCP;
- LOGISTICA;
- ENTREGUE.

Isso representa o status macro do pedido, porém esconde dependências reais de:
- compra;
- produção;
- expedição;
- faturamento/financeiro.

**Impacto:** a aplicação sabe que existem tarefas paralelas, mas não possui um modelo único para explicar “o que falta para este pedido avançar”.

**Prioridade:** P0.

---

### G2 — Orquestração depende de chamadas manuais
O teste E2E comprova que a empresa consegue operar de ponta a ponta, mas ele precisa chamar sequencialmente:
1. PCP;
2. Compras;
3. recebimento;
4. solicitação de produção;
5. conclusão de produção;
6. PCP novamente;
7. Logística;
8. Expedição;
9. Logística novamente;
10. Financeiro.

**Diagnóstico:** as peças funcionam, porém o sistema ainda não contém um orquestrador que interprete eventos e acione/recomende o próximo trabalho.

**Prioridade:** P0.

---

### G3 — Falta vínculo causal forte entre entidades
Solicitações de compra e produção podem existir sem um vínculo obrigatório e padronizado com:
- pedido de origem;
- item do pedido;
- necessidade/MRP que gerou a solicitação;
- dependência que será desbloqueada após conclusão.

**Impacto:** difícil responder com 100% de rastreabilidade:
> “Esta compra existe para destravar quais pedidos?”

**Prioridade:** P0.

---

### G4 — Produção concluída não reavalia automaticamente pedidos aguardando
A produção aumenta o estoque acabado corretamente, mas não existe no domínio uma rotina explícita que:
- encontre pedidos PCP aguardando aquele SKU;
- recalcule disponibilidade;
- proponha ou faça reserva conforme política;
- marque o pedido como pronto para próximo estágio.

**Prioridade:** P0.

---

### G5 — Compra recebida não reavalia automaticamente produção bloqueada
O recebimento atualiza o estoque de insumos, mas não existe uma rotina explícita para:
- localizar OPs/solicitações bloqueadas pelo material;
- recalcular shortage;
- mudar prontidão;
- alertar PCP/Produção.

**Prioridade:** P0.

---

### G6 — Expedição está fora do status macro
A expedição possui baixa de estoque e `readyForPickup`, mas o pedido continua macro em `LOGISTICA`.

**Impacto:** o status não diferencia:
- aguardando separação;
- separado;
- conferido;
- liberado;
- coletado;
- em trânsito.

**Prioridade:** P1.

---

### G7 — Financeiro está conectado ao pedido por dado, não por ciclo
`financialFact.order_id` garante vínculo, mas a conclusão operacional não obriga nem gera o estágio financeiro.

**Impacto:** pedido pode estar `ENTREGUE` sem fechamento financeiro correspondente.

**Prioridade:** P1.

---

### G8 — Operação por exceção já existe no motor, mas ainda não é o modelo central de trabalho
O motor já sabe identificar:
- atraso;
- frete acima do orçamento;
- falta de transportadora;
- carga não liberada;
- estoque crítico;
- compra atrasada;
- produção dependente de compra;
- gaps de MRP.

A oportunidade é converter isso em **fila operacional por responsável**, e não apenas recomendação/visualização.

**Prioridade:** P1.

---

### G9 — Política de crédito central ainda ausente
O próprio auditor da inteligência marca a ausência de `settings.creditPolicy`.

**Impacto:** Comercial pode concluir um pedido sem uma etapa sistêmica central de avaliação de crédito/limite.

**Prioridade:** P1/P2, dependendo da política de negócio definida.

---

## 5. Modelo-alvo recomendado

Não substituir imediatamente o status macro atual. Para preservar compatibilidade, introduzir uma segunda camada de **workflow operacional derivado**.

### 5.1 Status macro preservado inicialmente
- COMERCIAL
- PCP
- LOGISTICA
- ENTREGUE

### 5.2 Dependências operacionais por pedido
Cada pedido passa a possuir um objeto derivado:

```js
workflow: {
  commercial: { status, blockers, completedAt },
  inventory: { status, coverage, blockers },
  production: { status, requestIds, blockers },
  purchases: { status, requestIds, blockers },
  expedition: { status, blockers },
  logistics: { status, blockers },
  finance: { status, blockers },
  nextAction: { area, action, reason, entityId }
}
```

Este modelo pode ser introduzido incrementalmente sem quebrar o legado.

---

## 6. Eventos de negócio recomendados

Criar vocabulário de eventos explícitos:

- `ORDER_CREATED`
- `COMMERCIAL_APPROVED`
- `STOCK_ANALYZED`
- `STOCK_RESERVED`
- `STOCK_SHORTAGE_DETECTED`
- `PRODUCTION_REQUIRED`
- `PURCHASE_REQUIRED`
- `PURCHASE_ORDERED`
- `PURCHASE_RECEIVED`
- `PRODUCTION_READY`
- `PRODUCTION_COMPLETED`
- `ORDER_FULLY_COVERED`
- `EXPEDITION_RELEASED`
- `PICKUP_CONFIRMED`
- `ORDER_DELIVERED`
- `INVOICE_REGISTERED`
- `FINANCIAL_CYCLE_COMPLETED`

Cada evento deve registrar:
- pedido;
- item/SKU quando aplicável;
- entidade de origem;
- ator;
- data;
- estado anterior;
- novo estado;
- motivo;
- entidades desbloqueadas.

---

## 7. Regras cognitivas / “próxima melhor ação”

Antes de IA generativa, o FOCADO deve fornecer uma função determinística:

`computeNextAction(order, state)`

Exemplos:

- pedido sem cobertura → **PCP: decidir produção/corte**;
- produção sem material → **Compras: adquirir insumo X**;
- compra recebida → **Produção: OP pode ser liberada**;
- produto produzido → **PCP: reservar saldo do pedido**;
- estoque integral reservado → **Expedição: separar pedido**;
- carga liberada → **Logística: confirmar coleta**;
- entregue sem fato financeiro → **Financeiro: registrar faturamento**.

A IA cognitiva futura deve explicar e priorizar estas regras, não inventar o fluxo.

---

## 8. Visual e usabilidade — diagnóstico da Fase 1

### O que deve ser preservado
- identidade FOCADO;
- módulos existentes;
- melhorias mobile;
- Cockpit/Inteligência;
- dashboards e BI;
- permissões por área.

### Evolução prioritária
A navegação deve deixar de ser exclusivamente departamental e ganhar uma camada orientada a trabalho:

### A. Central “Minha Operação”
- pendências do usuário;
- criticidade;
- prazo;
- pedido afetado;
- razão;
- ação direta.

### B. Cockpit do Pedido
Uma visão única com:
- linha do tempo;
- cobertura de estoque;
- produção;
- compras;
- expedição;
- logística;
- financeiro;
- bloqueios;
- responsáveis;
- próxima ação.

### C. Gestão por exceção
O usuário entra no sistema e vê primeiro:
> “o que precisa de mim agora?”

Não é necessária uma reconstrução estética geral neste momento.

---

## 9. Sequência recomendada de implementação

### Fase 2A — Fundação de integração
1. criar modelo de dependências/workflow derivado;
2. criar IDs/vínculos causais entre pedido ↔ produção ↔ compra;
3. criar calculador de prontidão e `nextAction`;
4. manter status macro legado;
5. adicionar testes de compatibilidade.

### Fase 2B — Reações automáticas seguras
1. recebimento de compra recalcula produção bloqueada;
2. produção concluída recalcula pedidos PCP;
3. reserva completa sinaliza Expedição;
4. Expedição liberada sinaliza Logística;
5. entrega concluída sinaliza Financeiro.

Inicialmente estas reações devem **gerar estado/pendência**, não executar ações irreversíveis automaticamente.

### Fase 2C — Experiência integrada
1. Central de Pendências;
2. Cockpit do Pedido;
3. timeline de eventos;
4. badges de bloqueio;
5. links de ação contextual.

### Fase 2D — Automação ampliada
Após regressão:
- automatizar ações determinísticas de baixo risco;
- manter aprovação humana onde houver impacto financeiro/comercial relevante.

---

## 10. Critérios de aceite da integração

A integração será considerada concluída quando um teste E2E puder criar um pedido e, usando apenas eventos reais de negócio, verificar automaticamente:

1. Comercial conclui pedido;
2. sistema calcula cobertura;
3. falta gera necessidade rastreável;
4. produção/compra ficam vinculadas ao pedido;
5. compra recebida desbloqueia produção;
6. produção concluída disponibiliza produto;
7. pedido é reavaliado;
8. estoque é reservado;
9. Expedição recebe pendência;
10. baixa física ocorre uma vez;
11. Logística recebe prontidão;
12. entrega encerra operação;
13. Financeiro recebe pendência/fato;
14. BI reflete o ciclo;
15. auditoria consegue reconstruir toda a cadeia causal.

---

## 11. Riscos que NÃO devem ser introduzidos

- migração destrutiva do estado atual;
- alteração em massa do histórico;
- remoção imediata dos status existentes;
- automação financeira irreversível sem regra de negócio aprovada;
- duplicação de estoque por reprocessamento;
- compra/produção automática sem idempotência;
- deploy direto sem Quality Gate e Teste de Fogo.

---

## 12. Decisão do Conselho FOCADO

**Não expandir horizontalmente com novos módulos agora.**

O foco passa a ser:

> **Conectar verticalmente o fluxo que já existe e tornar o pedido a unidade central de coordenação operacional.**

A próxima execução lógica é a **Fase 2A — Fundação de Integração**, começando por modelo de workflow derivado, vínculos causais e calculador de próxima ação.
