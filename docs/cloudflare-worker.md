# Cloudflare Worker — Focado API

Caminho principal de backend do Focado:

GitHub Pages → Cloudflare Worker → Hyperdrive → Neon/Postgres.

## Segurança
- Nenhuma credencial do Neon é versionada.
- `FOCADO_BOOTSTRAP_TOKEN` deve ser cadastrado como secret do Worker.
- A conexão do Postgres deve entrar via binding `HYPERDRIVE`.
- CORS fica restrito ao domínio oficial do GitHub Pages.
- Tokens de sessão são armazenados apenas em hash no banco.
- Senhas novas usam PBKDF2-SHA256 com salt e 210.000 iterações.

## Rotas
- GET /health
- POST /auth/bootstrap
- POST /auth/login
- GET /auth/me
- POST /auth/logout
- GET/PUT /state
- PUT /domain
- POST /transition
- GET/POST /users

## Publicação
1. Criar Hyperdrive apontando para o Neon dedicado do Focado.
2. Adicionar o binding `HYPERDRIVE` ao Worker.
3. Cadastrar `FOCADO_BOOTSTRAP_TOKEN` com Wrangler secret.
4. Executar `wrangler deploy --dry-run`.
5. Publicar com `wrangler deploy`.
6. Configurar no frontend `apiBaseUrl` com a URL do Worker.
7. Criar o primeiro Admin pelo bootstrap e remover/rotacionar o bootstrap secret.

A antiga API Vercel deve permanecer apenas como rollback até a validação do Worker em produção.
