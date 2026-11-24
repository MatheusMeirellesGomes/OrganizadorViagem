# Ativação do Supabase — 12/11/2026

Projeto: `wgmgbiozxpueekvhoupw` (Gomes pelo Mundo), região São Paulo.

## Aplicado e verificado

- Migrações `202611090001_initial.sql` e `002_private_documents.sql`, na mesma transação.
- Tabela `trips` com RLS por proprietário.
- Buckets `trip-photos` e `trip-documents` privados (`public = false`).
- Site URL e Redirect URL: `http://localhost:5173`.
- URL e chave publishable configuradas em `.env.local`, ignorado pelo Git.
- Consulta real pela chave pública sem login recusada com código `42501`.
- Tela de login/cadastro disponível no servidor local.

## Ainda pendente

- Cadastro e confirmação do e-mail do usuário pelo próprio usuário.
- Validação de gravação, sincronização e arquivos com sessão autenticada.
- Teste completo de isolamento com duas contas confirmadas (`npm run verificar:supabase`).
- Migrações 003 e 004 ainda NÃO aplicadas: compartilhamento, assistente e localizadores de reserva na nuvem não estão habilitados. Revisar as políticas antes de habilitar colaboração.
- Configuração de URL de produção e hospedagem do frontend.

O projeto existente da Isadora foi preservado. A configuração local não contém chave service_role e nenhuma senha foi adicionada ao repositório.
