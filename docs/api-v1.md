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
