# Diário de desenvolvimento — Gomes pelo Mundo

## Etapa 0 — auditoria e preservação

Base: `66f18f2`, branch de origem `feature/supabase-online`. Repositório limpo no início. `origin/main` em `dd6cd61`; as mudanças mais recentes do Supabase estavam na branch de trabalho. Nenhum merge/force-push ou edição na pasta original foi feito. Continuação isolada em `feature/gomes-etapas`, partindo da versão mais completa, preservando todos os commits anteriores.

Arquitetura: React 19 + TypeScript + Vite; navegação por estado em `src/main.tsx`; tipos em `model.ts`; dados JSON por viagem. `store.ts` guarda viagens locais. `remote.ts` encapsula Supabase e versionamento otimista; `migration.ts` faz migração sem sobrescrita; `config.ts` recusa chaves secretas; `MigrationPanel.tsx` apresenta o envio local→conta. Modo Viagem e mapas são componentes separados. Backups passam por normalização em `offline.ts`. Cache PWA é gerado por plugin local em `vite.config.ts`.

Trabalho anterior confirmado: Modo Viagem, filtros nacionais/internacionais, responsividade de datas, modo visitante, proteção de versão, migração idempotente e script de validação de isolamento no Supabase. Não serão reimplementados.

Verificação inicial: 7 arquivos de teste, **59 testes aprovados**; build aprovado; `npm audit --omit=dev`: **0 vulnerabilidades**. Nenhuma variável secreta lida ou versionada. Não existe `.env.local` nesta cópia. Contas/projeto reais e hospedagem não foram fornecidos; os testes simulados não comprovam Auth/RLS/Storage em produção.

Riscos: campos novos precisam ser opcionais e passar pelo importador para sobreviver ao backup. Relações entre entidades precisam ter IDs remapeados na importação. Fotos locais usam a cota limitada de localStorage. Políticas remotas e concorrência precisam ser preservadas. Mudanças de sincronização dependem de validação contra duas contas reais antes de publicação.

Próxima etapa: complementar estabilidade e CI, sem alterar o contrato de sincronização já entregue.
