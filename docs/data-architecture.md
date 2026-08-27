# Focado — arquitetura de dados compartilhada

## Objetivo
Migrar o estado operacional do navegador para uma base compartilhada sem quebrar os módulos atuais.

## Estratégia
1. `FocadoDataStore` passa a ser a fronteira única de persistência.
2. Enquanto o Supabase do Focado não estiver criado/configurado, o DataStore mantém fallback em `localStorage`.
3. Quando o Supabase estiver disponível, o mesmo DataStore sincroniza o estado remoto e mantém cache local.
4. Pedidos, PCP, Produção, Estoque, Logística e Kanban continuam consumindo a mesma estrutura de estado durante a transição.

## Tabela inicial proposta
`public.focado_workspace_state`

Campos:
- `workspace_key text primary key`
- `payload jsonb not null`
- `updated_at timestamptz not null default now()`

Essa tabela é uma etapa intermediária de migração. Depois, o estado será normalizado em tabelas de domínio:
- orders
- order_items
- production_orders
- inventory_items
- inventory_movements
- lots
- logistics_events
- audit_events

## Segurança
- Nenhuma `service_role` ou secret key será incluída no frontend.
- O cliente web usará apenas publishable key.
- A tabela exposta deverá ter RLS habilitada antes de receber grants para `authenticated`.
- A política final deve restringir acesso por organização/workspace, não apenas por usuário autenticado.
- O modelo atual de login local ainda precisa ser substituído por autenticação compartilhada antes da ativação definitiva do backend multiusuário.

## Princípio de migração
Primeiro compatibilidade, depois normalização. Isso reduz risco de regressão e permite retirar o monólito em blocos.
