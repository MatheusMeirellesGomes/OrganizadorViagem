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

## Etapa 5 — restaurantes e alimentação (partes independentes)

Modo restaurantes/cafés no catálogo, consulta específica de alimentação, filtros de culinária/dieta/refeição somente quando informadas, categorias e proximidade em linha reta. Cardápio/telefone/site conforme cadastro. Atrações e restaurantes podem ser adicionados ao dia de uma viagem, com fonte e coordenadas preservadas no backup; duplicata no mesmo dia é recusada. Navegação usa coordenadas quando presentes.

Arquivos: `food.ts`, `food.test.ts`, `Catalog.tsx`, `main.tsx`, `model.ts`, `offline.ts`, `travel-mode.ts`. **80 testes aprovados**, build aprovado e alternância da interface verificada no navegador. Limites: mesmo bloqueio HTTP 406 do Overpass; não afirmamos restaurantes retornados em teste real. Preços/avaliações não são oferecidos pela fonte de forma adequada, portanto filtros de custo/nota não foram simulados. Imagens/enriquecimento permanecem pendentes. Próxima etapa: decisões Quero ir/Talvez/Passar e favoritos por viagem, independentes do provedor.

## Etapa 6 — Quero ir, Talvez, Passar e Já visitei

Decisões persistem por viagem, com botões acessíveis e gestos horizontais (rolagem vertical preservada). Aba interna Lugares filtra escolhas, desfaz mediante confirmação, inclui no roteiro e mostra pontos conhecidos no mapa. Cadastro manual opcional funciona sem API, endereço ou coordenadas. Backup mantém escolhas; desfazer não apaga passeios já adicionados. Catálogo permite decidir após selecionar a viagem.

Arquivos: `choices.ts`, `choices.test.ts`, `ChoiceButtons.tsx`, `SavedPlaces.tsx`, `Catalog.tsx`, `catalog.css`, `food.ts`, `model.ts`, `offline.ts`, `main.tsx`. **83 testes aprovados**, build aprovado; cadastro manual e decisão Talvez preservados após reload no navegador. Limites: nuvem depende da configuração existente; gesto verificado por lógica automatizada, sem teste físico em telefone. Próxima etapa: gerador determinístico de roteiro com prévia editável.

## Etapa 7 — gerador sem IA com prévia editável

Proposta usa Quero ir e opcionalmente Talvez, quantidade de dias (datas sugerem o total), ritmo e proximidade geográfica. Não exige destino/datas/coordenadas. Mostra explicitamente lugares fora da capacidade. Prévia permite editar título/dia/horário/período, reordenar, retirar e descartar. Aceitar acrescenta atividades sem substituir as existentes e evita repetir lugares já presentes.

Arquivos: `itinerary.ts`, `itinerary.test.ts`, `ItineraryBuilder.tsx`, `SavedPlaces.tsx`. **86 testes aprovados**, build aprovado; geração e aceitação verificadas no navegador com lugar manual sem coordenadas. Limites: heurística de proximidade/capacidade, não otimização de trânsito; não calcula horários de abertura, duração, custos ou deslocamentos sem dados confirmados. Isso é informado antes de aceitar. Comparação/substituição de alternativas fica na etapa 13. Próxima etapa: mapas por dia e navegação com modos de transporte.

## Etapa 8 — mapa diário e navegação por transporte

Mapa do dia com marcadores numerados, hospedagens, alimentação/visitados distintos e agrupamento de pontos próximos ao zoom. Linhas pontilhadas são explicitamente sequência em linha reta, nunca rotas por rua; não pulam atividades sem coordenadas. Planejador permite hospedagem→atividade, atividade→atividade/restaurante ou origem escolhida no Google Maps. Modos caminhada/carro/transporte público também no Modo Viagem.

Arquivos: `routes.ts`, `routes.test.ts`, `RouteMap.tsx`, `RoutePlanner.tsx`, `main.tsx`, `TravelMode.tsx`, `catalog.css`. **89 testes aprovados**, build aprovado; estado com dados incompletos verificado no navegador. Build avisou chunk principal >500 KB, reservado para divisão na etapa visual/desempenho. Limites: estimativas/linhas/baldeações/custos só no provedor externo; nenhuma API de trânsito contratada. URLs seguem [documentação oficial Google Maps](https://developers.google.com/maps/documentation/urls/get-started), sem chave. Próxima etapa: dia atual/fuso opcional e proximidade no Modo Viagem.

## Etapa 9 — Modo Viagem avançado

Fuso IANA opcional no calendário, indicação do dia atual e botão para navegar até hoje; sem configuração usa fuso do aparelho explicitamente. Proximidade de lugares salvos por referência escolhida ou consulta pontual da posição (não persistida/nem monitorada). Distâncias rotuladas em linha reta, links de navegação e pesquisa de restaurantes externos. Mantidos hotéis por período, reservas, checklist, progresso, dados locais e cache de conta já existentes.

Arquivos: `travel-clock.ts`, `travel-clock.test.ts`, `TravelNearby.tsx`, `TravelMode.tsx`, `TripCalendar.tsx`, `model.ts`, `offline.ts`, `.gitignore` (ignora também symlink local de dependências). **92 testes aprovados**, build aprovado; fuso Europe/Madrid salvo e exibido no Modo Viagem pelo navegador. Não solicitamos localização real durante teste. Limites: API de restaurantes segue bloqueada; mapas externos precisam de internet; reinicialização PWA totalmente offline ainda não validada no navegador embutido. Horários pessoais não são convertidos automaticamente ao mudar fuso. Próxima etapa: fotos, álbuns e retrospectiva.

## Etapa 10 — fotos, álbuns e retrospectiva

Novas fotos JPG/PNG/WebP até 15 MB são reprocessadas para JPEG, lado maior até 1600 px e até 600 KB; originais antigos preservados. Álbuns por nome, legenda, data/local opcionais, vínculo com atividade, ordem cronológica, capa pessoal no cartão/cabeçalho, ampliação em diálogo e remoção confirmada. Retrospectiva mostra datas, lugares visitados, notas e mapa. Exportação de álbum em JSON portátil. Fotos remotas baixadas autenticadas, sem URLs públicas.

Arquivos: `photos.ts`, `photos.test.ts`, `PrivatePhoto.tsx`, `PhotoGallery.tsx`, `photos.css`, `main.tsx`, `model.ts`, `offline.ts`. **95 testes aprovados**, build aprovado; envio/compressão de PNG, edição de legenda/álbum, capa e ampliação verificados no navegador. Limites: remoção tira referência e preserva objetos remotos que podem ser usados por cópias; cota localStorage permanece pequena. Novos HEIC/GIF não são convertidos; fotos antigas desses formatos continuam preservadas. Álbum exportado em JSON (restaurável no Perfil), não ZIP; nuvem real continua pendente. Próxima etapa: internacionalização.

## Etapa 11a — idiomas e base de traduções

Seleção pt-BR/en/es no Perfil, persistência por aparelho, idioma do documento e traduções centralizadas. Navegação, abas internas, principais ações/campos e formatos de datas/moedas adaptados. Conteúdo pessoal permanece intacto. Helper de desenvolvimento altera somente literais conhecidos, nunca percorre texto pessoal no DOM.

Arquivos: `i18n.ts`, `i18n.test.tsx`, `LanguagePicker.tsx`, `locales/core.json`, `scripts/localize-ui.cjs`, componentes de interface e formatação em `model.ts`/`travel-mode.ts`. **98 testes aprovados**, build aprovado; troca imediata para inglês verificada no navegador. Limite deliberado desta subetapa: textos explicativos, estados e mensagens ainda parcialmente em português; serão tratados na 11b antes de considerar a internacionalização completa. Próxima subetapa: ampliar tradução dos fluxos e mensagens.
