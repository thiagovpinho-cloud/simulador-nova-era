# Focado API v1

## Princípios
A API é a fronteira estável entre frontend e persistência. Nenhum módulo de UI acessa banco diretamente.

## Endpoints

### GET /api/health
Diagnóstico sem dados operacionais.

### GET /api/state
Retorna:
- workspaceKey
- revision
- payload
- updatedAt

Exige Bearer token.

### PUT /api/state
Body:
```json
{"payload":{}}
```

Suporta concorrência otimista via `If-Match: "<revision>"`. Se outro usuário salvar antes, responde HTTP 409 e o cliente deve recarregar antes de sobrescrever.

## Segurança
A rota de estado permanece bloqueada se `FOCADO_API_TOKEN` não estiver configurado. Nenhum token é versionado no repositório.

O adaptador atual de memória existe somente para desenvolvimento e só é habilitado com `FOCADO_ALLOW_MEMORY_STORE=true`. Em produção, a API deve receber um adaptador persistente.

## Próxima evolução
Substituir o adaptador de desenvolvimento em `api/_lib/store.js` por um adaptador Postgres sem alterar os endpoints nem os módulos do frontend.


## Persistência Neon
Projeto dedicado: `focado`.

A API usa `@neondatabase/serverless` e lê a conexão exclusivamente de `DATABASE_URL`.

Tabela ativa:
- `public.focado_workspace_state`
- chave: `workspace_key`
- estado: `payload jsonb`
- concorrência: `revision bigint`
- auditoria temporal mínima: `updated_at timestamptz`

O segredo de conexão nunca deve ser incluído no repositório.

## Variáveis obrigatórias na API
- `DATABASE_URL`: conexão pooled do Neon
- `FOCADO_API_TOKEN`: segredo de autenticação da API

Até que essas variáveis estejam configuradas no ambiente serverless, o frontend permanece no modo local seguro.
