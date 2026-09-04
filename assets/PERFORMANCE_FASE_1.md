# Focado Performance — Fase 1

Objetivo: reduzir carga e chamadas redundantes sem alterar regras de negócio.

## Alteração 1
- A transição de pedido passou a retornar o workspace atualizado na própria resposta.
- O frontend reutiliza esse payload e deixa de executar uma segunda leitura completa de `/api/state` após cada transição.
- Produção permanece intacta; alterações estão isoladas na branch `focado/performance-fase-1`.

## Critérios de validação
- `npm test` sem regressões.
- Verificação de sintaxe dos módulos frontend.
- Mesmo estado final, revisão, auditoria e efeitos de workflow após a transição.
