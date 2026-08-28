# Focado — Quality Gate de Produção

A partir deste marco, alterações do Focado seguem obrigatoriamente esta ordem:

1. Alterar código em main.
2. Executar a suíte completa de regras de negócio, regressão, BI, E2E, stress e usabilidade.
3. Executar smoke test de carregamento de módulos no primeiro clique, incluindo CSS/JS.
4. Validar sintaxe de todos os módulos frontend.
5. Validar a existência dos arquivos que compõem o pacote publicado.
6. Somente com a validação verde, liberar deploy do Worker e do Cloudflare Pages.
7. Se qualquer teste falhar, produção não recebe automaticamente a revisão reprovada.
8. Após deploy, considerar a entrega apta para teste do usuário somente quando os workflows de produção concluírem com sucesso.

## Critério de aceite antes de informar "pode testar"

O assistente só deve informar que uma mudança está pronta para teste quando:
- Validate Focado Frontend = success;
- Deploy Focado Worker = success, quando houver backend envolvido;
- Deploy Focado Cloudflare Pages = success, quando houver frontend envolvido;
- o teste específico da função alterada estiver incluído na suíte;
- não houver falha conhecida aberta relacionada à alteração.

Este gate existe para reduzir retrabalho e impedir publicação de mudanças não validadas.


## Regra adicional — validação no ambiente publicado

Para qualquer módulo/tela alterado:
- CI verde não é suficiente.
- Após o deploy, deve existir smoke test contra `https://focado.pages.dev`.
- O teste deve confirmar que os arquivos publicados respondem, que o contrato do módulo existe e que a página publicada referencia a revisão correta.
- Para problemas de boot/primeiro paint, o HTML publicado deve ser inspecionado para garantir ausência de texto residual como `\\n`.
- O usuário só recebe "pode testar" depois do smoke test publicado passar.
