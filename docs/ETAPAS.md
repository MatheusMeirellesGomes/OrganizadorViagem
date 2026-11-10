# Diário de desenvolvimento — Gomes pelo Mundo

## Etapa 0 — auditoria e preservação

Base: `66f18f2`, branch de origem `feature/supabase-online`. Repositório limpo no início. `origin/main` em `dd6cd61`; as mudanças mais recentes do Supabase estavam na branch de trabalho. Nenhum merge/force-push ou edição na pasta original foi feito. Continuação isolada em `feature/gomes-etapas`, partindo da versão mais completa, preservando todos os commits anteriores.

Arquitetura: React 19 + TypeScript + Vite; navegação por estado em `src/main.tsx`; tipos em `model.ts`; dados JSON por viagem. `store.ts` guarda viagens locais. `remote.ts` encapsula Supabase e versionamento otimista; `migration.ts` faz migração sem sobrescrita; `config.ts` recusa chaves secretas; `MigrationPanel.tsx` apresenta o envio local→conta. Modo Viagem e mapas são componentes separados. Backups passam por normalização em `offline.ts`. Cache PWA é gerado por plugin local em `vite.config.ts`.

Trabalho anterior confirmado: Modo Viagem, filtros nacionais/internacionais, responsividade de datas, modo visitante, proteção de versão, migração idempotente e script de validação de isolamento no Supabase. Não serão reimplementados.

Verificação inicial: 7 arquivos de teste, **59 testes aprovados**; build aprovado; `npm audit --omit=dev`: **0 vulnerabilidades**. Nenhuma variável secreta lida ou versionada. Não existe `.env.local` nesta cópia. Contas/projeto reais e hospedagem não foram fornecidos; os testes simulados não comprovam Auth/RLS/Storage em produção.

Riscos: campos novos precisam ser opcionais e passar pelo importador para sobreviver ao backup. Relações entre entidades precisam ter IDs remapeados na importação. Fotos locais usam a cota limitada de localStorage. Políticas remotas e concorrência precisam ser preservadas. Mudanças de sincronização dependem de validação contra duas contas reais antes de publicação.

Próxima etapa: complementar estabilidade e CI, sem alterar o contrato de sincronização já entregue.

## Etapa 1 — estabilidade e publicação preparada

Mantidos os recursos Supabase entregues anteriormente. Acrescentados CI de testes/build no GitHub Actions, configuração estática Netlify sem publicação automática e bloqueio de chaves secretas **antes** de o Vite gerar os arquivos públicos. Exclusão remota agora pode conferir a mesma versão usada na edição; uma viagem alterada em outro aparelho não é apagada silenciosamente.

Arquivos: `.github/workflows/quality.yml`, `netlify.toml`, `vite.config.ts`, `src/config.ts`, `src/config.test.ts`, `src/remote.ts`, `src/remote.test.ts`, integração em `src/main.tsx`. **61 testes aprovados**, build aprovado. A revisão não identificou credenciais versionadas. Ambiente local preservado.

Bloqueios: URL/chave pública e duas contas de teste ainda não fornecidas; Auth/RLS/PostgreSQL/Storage reais e publicação HTTPS continuam pendentes. Netlify é uma preparação opcional, não um site publicado; nenhum serviço pago foi ativado. Próxima etapa: calendário e grupo opcional.

## Etapa 2 — calendário e grupo opcional

Aba Calendário com mês navegável, seleção de dias, datas editáveis, dias livres e visão por período. Datas alteradas preservam o número e ordem das atividades. Sem datas, navegação por Dia 1/2/3. Grupo opcional com adultos, crianças, nomes/apelidos e preferências; despesas permanecem desativadas por padrão.

Arquivos: `TripCalendar.tsx`, `calendar.ts`, `calendar.test.ts`, `extensions.css`, integração em `main.tsx`, campos opcionais em `model.ts` e importação em `offline.ts`. **64 testes aprovados**, build aprovado e formulário sem datas verificado no navegador. Backup antigo continua válido. Limites: participantes são registros locais, não convites/contas compartilhadas. Próxima etapa: múltiplas hospedagens e reservas associadas.

## Etapa 3a — múltiplas hospedagens e vínculos de reservas

Hospedagens opcionais com endereço, cidade, datas/horários, link, código de confirmação recolhido, notas e coordenadas. Botão de navegação. Modo Viagem destaca estadias do dia (entrada inclusiva, saída exclusiva), sem presumir hospedagem quando faltam datas. Reservas podem se vincular a atividades e hotéis; excluir hotel exige confirmação e preserva reservas. O campo antigo `hotel` continua visível.

Arquivos: `StaysPanel.tsx`, `stays.ts`, `stays.test.ts`, `model.ts`, `main.tsx`, `offline.ts`, `TravelMode.tsx`, `travel-mode.ts`, `extensions.css`. Importação remapeia IDs; exportação HTML inclui hotéis. **68 testes aprovados**, build aprovado; criação sem datas/endereço validada no navegador. Limites: documentos privados seguem na subetapa 3b; armazenamento remoto ainda depende de configuração real do Supabase. Branch `feature/gomes-etapas`.

## Etapa 3b — anexos privados e backup portátil

Documentos PDF/JPG/PNG/WebP de até 1 MB, com verificação de assinatura/formato, vínculo opcional à reserva, download e remoção confirmada. Localmente ficam no navegador, sujeitos à cota; o aplicativo explica essa privacidade. Estrutura remota usa bucket privado `trip-documents`, políticas por usuário e download autenticado. Migração e importação enviam anexos antes de inserir viagens. Exportação materializa fotos/documentos da conta; erro impede backup silenciosamente incompleto.

Arquivos: `DocumentsPanel.tsx`, `documents.ts`, `documents.test.ts`, `backup.ts`, `model.ts`, `main.tsx`, `offline.ts`, `migration.ts`, `remote.ts`, `supabase/migrations/002_private_documents.sql`. **72 testes aprovados**, build aprovado; upload local de imagem de teste validado pelo navegador. Limites: SQL preparado, não aplicado nem validado em projeto real; não existe promessa de nuvem funcionando. Remover um anexo tira a referência da viagem; objetos já confirmados na nuvem são preservados para não quebrar cópias de viagens que possam referenciá-los (limpeza definitiva futura). HTML offline contém dados textuais, não anexa binários; baixe os documentos antes da viagem. Backup JSON limitado a 20 MB. Próxima etapa: catálogo geográfico de lugares reais.

## Etapa 4a — catálogo geográfico e fontes

Interface de descoberta por cidade ou ponto no mapa, raio de 0,5–10 km, categorias amplas, filtros de nome/gratuidade, detalhes com fonte e timestamps, normalização/deduplicação e carregamento de 24 cartões por vez sem truncar a consulta. Cache de 24h, intervalo de requisições, timeout e rejeição de respostas parciais. Sem preço/horário inventado. Produção exige provedor próprio/configurado; instância comunitária apenas em desenvolvimento manual, conforme orientação oficial.

Arquivos: `Catalog.tsx`, `catalog-service.ts`, `places.ts`, `places.test.ts`, `catalog.css`, `TravelMap.tsx`, `main.tsx`, `.env.example`, `docs/CATALOGO.md`. **77 testes aprovados**, build aprovado. **Teste real:** Wikipédia localizou Madrid no navegador. Overpass retornou HTTP 406 em navegador e consulta mínima direta; a indisponibilidade foi exibida corretamente. Portanto normalização/cache/UI estão validados, mas consulta de atrações no provedor externo NÃO foi confirmada. Sem simular sucesso com dados de teste. Próxima subetapa: enriquecimento com informações e imagens atribuídas quando disponíveis; produção/catálogo abrangente permanece dependente de provedor acessível.
