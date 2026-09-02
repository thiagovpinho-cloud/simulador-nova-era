# FOCADO — Fase 5C: Pré-piloto Cognitivo

Data: 2026-09-02

## Objetivo
Validar se a experiência conduz cada perfil à ação correta sem exigir memória do processo, tentativa e erro, planilhas paralelas ou acesso indevido a módulos.

## Jornada padrão
1. Usuário entra no FOCADO.
2. Dashboard apresenta "Seu trabalho agora".
3. Usuário acessa a Central de Pendências.
4. A Central mostra apenas pendências compatíveis com sua responsabilidade, exceto Administração/Direção/Gestão, que possuem visão global.
5. "Resolver" leva diretamente ao módulo em que a ação deve ser executada.
6. O topo do módulo mantém contexto: etapa, responsável, pendência e próximo passo.

## Contrato por perfil

| Perfil | Área do workflow | Destino de resolução |
| --- | --- | --- |
| Comercial | COMERCIAL | Pedidos |
| PCP | PCP | PCP |
| Produção | PRODUCAO | Produção |
| Estoque | ESTOQUE | Estoque |
| Estoque | EXPEDICAO | Expedição |
| Compras | COMPRAS | Compras |
| Logística | LOGISTICA | Logística |
| Financeiro | FINANCEIRO | Financeiro |
| Admin/Diretor/Gestor | Todas | Central + área responsável |

## Achado corrigido durante o pré-piloto
A Central reconhecia ESTOQUE como responsabilidade possível, mas não existia rota explícita ESTOQUE → inventory. Em uma pendência dessa área, "Resolver" poderia cair no Cockpit Executivo e bloquear o operador.

Correção:
- ESTOQUE → inventory;
- rótulo "Estoque" incluído na Central;
- gate automático verifica que toda área emitida pelo workflow possui rota navegável e que o perfil responsável tem acesso à rota.

## Critérios de aprovação cognitiva
- nenhuma área do workflow sem rota de resolução;
- nenhum perfil operacional direcionado a uma rota sem permissão;
- Central separada do Cockpit Executivo;
- fila filtrada por responsabilidade;
- status macro identificado como status macro;
- andamento operacional mostrado separadamente;
- próxima ação visível no dashboard e nos módulos;
- nenhum módulo operacional principal depende de pré-carregamento no boot;
- regressão funcional, navegação, mobile, multiusuário, E2E e Teste de Fogo verdes.

## Resultado atual
APROVADO TECNICAMENTE PARA REFINAMENTO FINAL DA FASE 5.

Quality Gates relevantes:
- #450 SUCCESS — boot/lazy loading
- #454 SUCCESS — contexto operacional
- #458 SUCCESS — linguagem/status
- #463 SUCCESS — responsabilidade da Central
- #464 SUCCESS — correção da rota de Estoque
- #466 SUCCESS — pré-piloto cognitivo incorporado à suíte completa

## Próximo gate
Fase 5D: acabamento final de UX + candidato de release. Somente depois disso a mudança deve ser promovida para produção e submetida ao piloto real controlado.
