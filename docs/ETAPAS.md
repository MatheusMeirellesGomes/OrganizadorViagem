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

## Revisão — erros, catálogo real e carregamento (Claude)

Revisão da `main` após o PR #1: 98 testes e build aprovados; fluxos de conta, migração e telas de 360/390 px sem regressões. Erros encontrados e corrigidos:

- **Catálogo nunca funcionava:** instâncias públicas do Overpass sobrecarregadas (testado no navegador real: "at capacity", 504 e timeouts) e catálogo desligado em produção. Atrações passam a vir de Wikipédia + Wikidata + Commons (fotos livres com autor e licença), restaurantes e complemento de cidades pequenas do Nominatim, dentro da política de uso. Detalhes em `docs/CATALOGO.md`.
- **Arquivo principal de 530 KB:** mapas (Leaflet) e catálogo carregados sob demanda; principal com 366 KB. Para não quebrar o uso offline, as partes são baixadas em segundo plano após abrir o app e, se faltarem, aparece um aviso no lugar do mapa (antes o app inteiro travava).
- **Verificação do Supabase:** passa a cobrir o bucket privado `trip-documents`.
- Distâncias formatadas no idioma da interface; cache antigo do catálogo removido.

Arquivos: `wiki-places.ts`, `osm-places.ts`, `catalog-service.ts`, `Catalog.tsx`, `catalog.css`, `LazyMaps.tsx`, `main.tsx`, `scripts/verificar-supabase.mjs` e testes. Verificação: testes unitários, build, testes de navegador (catálogo, conta, migração, telas, falha de carregamento) e testes reais das fontes no navegador do computador do Matheus.

## Etapa 12 — idiomas completos (Claude)

Toda a interface, as mensagens de erro e o roteiro offline estão em português, inglês e espanhol. O teste `i18n-coverage.test.ts` falha se algum texto novo ficar sem tradução, se as variáveis {assim} não baterem entre os idiomas, ou se um texto traduzido for usado como valor de controle. Esse último caso foi o erro que deixava as abas vazias em inglês e espanhol.

## Etapa 13 — design e acessibilidade (Claude)

- **Contraste e tamanho:** cores de texto com contraste mínimo de 4,5:1 e nenhum texto menor que 11 px. A auditoria axe passou de 90 violações para 0.
- **Abas da viagem no celular:** roláveis, com indicação de que há mais e área de toque de 44 px.
- **Datas e valores:** "Dia 1" com espaço e despesas no formato de moeda de cada idioma.
- **Fotos:** os desenhos de linha foram trocados por fotos reais do Unsplash, de licença livre. Se uma foto não carregar, o layout continua no lugar.

## Etapa 14 — comparação de roteiros (Claude)

Alternativas rápida, econômica e tranquila, comparadas lado a lado antes de escolher:

- dias usados;
- lugares incluídos e fora da proposta;
- máximo de lugares por dia;
- distância em linha reta;
- lugares gratuitos, pagos e sem informação.

Os preços só aparecem quando a fonte informa. A alternativa escolhida vira uma prévia editável e não apaga o roteiro atual.

## Explorar mundial (Claude)

A auditoria e as decisões estão em `docs/EXPLORAR.md`.

**Causa encontrada:** a busca antiga trazia só os 100 artigos da Wikipédia mais próximos do centro. Em Madrid, eles cabem em 312 m, e por isso o Palacio Real e o Prado não apareciam.

**Atrações:** agora vêm do Wikidata por raio real, de 1 a 20 km, com regras de equivalência de categorias. Ficam fora estações, aeroportos, cidades, lugares demolidos e obras de acervo.

**Fotos:** só a imagem P18 do próprio item ou a etiqueta `wikimedia_commons` do próprio objeto. A galeria usa arquivos que retratam o item (P180).

**Busca:** mundial com sugestões. Endereços vão ao OpenStreetMap só quando a pessoa pede.

**Restaurantes:** por refeição, culinária, preço e "aberto agora", no fuso do lugar.

**Interface:**

- cards com esqueleto de carregamento;
- mapa com círculo do raio e agrupamento de marcadores;
- painel de detalhes;
- adicionar ao roteiro com dia, horário, observação e hospedagem, sem duplicar.

**Verificação:**

- testes unitários e de tela com fontes simuladas no formato real;
- axe com 0 violações em pt, en e es, em 1280 e 390 px;
- buscas reais feitas no navegador do computador do Matheus:
  - Madrid, 20 km: 782 atrações, com os 9 lugares obrigatórios;
  - Segóvia: aqueduto, Alcázar (castelo) e catedral;
  - Lisboa, Paris e Belo Horizonte sem aeroportos, cidades ou lugares demolidos;
  - restaurantes para jantar e "carregar mais".

Testes com as fontes reais: `npm run testar:explorar`.

**Limites:**

- avaliações, tempo de visita, cardápio e reserva de mesa não existem nas fontes livres;
- poucos restaurantes têm faixa de preço cadastrada;
- a primeira busca grande (Paris, 10 km) pode levar até ~35 s; as seguintes usam o cache.

## Fase 2 — roteiro inteligente por proximidade (Claude)

`src/planner.ts` monta o roteiro sem IA e sem custo. Ele:

- agrupa por hospedagem de cada data;
- ordena por vizinho mais próximo + 2-opt;
- considera horários de funcionamento, duração por categoria, refeições, compromissos fixos e ritmo.

Deslocamentos são estimativas (linha reta × desvio ÷ velocidade) e aparecem assim na tela. Antes de salvar, a pessoa vê a prévia e compara três estratégias, e pode desfazer depois. Atividades existentes nunca são alteradas. Testado com o cenário Lisboa → Mérida → Madrid → Segóvia → Salamanca → Covilhã → Coimbra → Nazaré.

## Fase 3 — restaurantes no roteiro (Claude)

Para cada refeição, `src/meals.ts` busca restaurantes perto da visita anterior, da seguinte, da hospedagem ou no caminho. Os resultados podem ser filtrados por culinária, preço e horário. A pessoa pode adicionar ou substituir sem duplicar, e lançar um gasto previsto opcional.

## Fase 4 — orçamento (Claude)

`src/budget.ts` faz as contas em centavos inteiros e cobre:

- previsto e pago;
- status das despesas;
- divisão igual, por partes, por valor ou por porcentagem;
- saldos e acertos sugeridos;
- qualquer moeda ISO, com taxa, data e fonte da conversão registradas.

A cotação do BCE (frankfurter.app) só é buscada com clique.

## Fase 5 — Modo Viagem avançado (Claude)

`src/travel-day.ts` cuida do dia da viagem:

- painel do dia;
- iniciar, concluir, pular, adiar, reagendar, observação e gasto, com histórico;
- links do Google Maps e do Apple Maps;
- "Estou atrasado" com opções que nunca movem reservas fixas.

Fora do ar, as edições da conta vão para uma fila (`src/outbox.ts`) e sincronizam depois. Em caso de conflito, fica a versão remota e a pessoa é avisada.

## Etapa 15 — colaboração e assistente opcional (Claude)

**Compartilhamento** (migração `003`): papéis editor e leitor, e convites de uso único que valem 7 dias. No banco fica só o SHA-256 do código. O aceite é feito pela função `accept_trip_invite` e o RLS é verificado por `trip_role()`. Só o dono exclui a viagem.

**Assistente:** a função `supabase/functions/assistente` guarda a `ANTHROPIC_API_KEY` no servidor e tem limite diário por pessoa. O contexto enviado não inclui códigos de reserva, notas, despesas nem nomes. As sugestões só entram no roteiro com clique. O painel fica desligado sem `VITE_ASSISTENTE=on`.

**Testado** com um Supabase simulado: convite, aceite depois do login, viagem visível para a convidada, código não reutilizável, e assistente recebendo só o id da viagem e a pergunta. Ainda **não foi testado** com o projeto Supabase real. Falta aplicar a migração 003, publicar a função e cadastrar os segredos.

## Etapa 16 — refinamento visual, transportes, perfil e viagem completa (Claude)

Branch `feature/transportes-perfil-refinamento`. Nada foi recriado: os módulos novos ficam em `src/home`, `src/profile` e `src/journey` e usam os registros que já existiam (viagem, hospedagens, atividades, reservas, documentos e despesas).

**Visão Geral.** A foto principal, os textos e o botão "Planejar uma viagem" continuam iguais. Embaixo, a faixa com ícones virou quatro cards com foto, número, nome e descrição. Os números vêm das viagens. Quando há um lugar do roteiro com foto verificada (Wikidata/Commons), o card usa essa foto e diz de onde ela é; senão, mostra uma foto do Unsplash marcada como "Imagem ilustrativa". Cada card leva a Minhas viagens ou ao Histórico.

**Nova viagem.** Janela com a foto da capa escolhida no topo. Só o nome aparece de início; datas, tipo, momento e capa ficam em "Mais detalhes (opcional)".

**Meu Espaço.** Perfil com foto, nome, cidade de origem, apresentação, idioma, ritmo e estilo, mais as seções Preferências, Minha conta, Meus dados, Privacidade e Configurações, e estatísticas pessoais. A foto:
- aceita só JPG, PNG ou WebP de até 10 MB, conferidos pelo conteúdo;
- é cortada em quadrado, reduzida para 320 px e comprimida (até 120 KB) no próprio navegador.

Sem conta, foto e preferências ficam no navegador. Com conta, as preferências vão para os metadados do usuário (sem os bytes da foto) e a foto para `trip-photos/<id>/perfil/`, uma pasta já protegida pelas políticas existentes.

**Transportes.** Avião, carro próprio, carro alugado, trem, ônibus, barco, transporte público, táxi e outros, na mesma viagem.
- Cada registro tem trechos com origem, destino, datas, horários, fuso IANA, empresa, número, terminal, portão, classe e assento.
- Os voos também têm escalas, bagagem e check-in. A abertura do check-in é a informada pela companhia; o app não confirma status de voo.
- A duração considera o fuso de cada ponta: São Paulo 17:30 → Lisboa 07:05 = 10 h 35.
- A linha do tempo junta partidas, chegadas em outro dia, check-in e check-out e atividades.

**Localizador (PNR) e números de reserva.** Nunca entram nos dados da viagem, então ficam fora de backups, links, cópias offline, participantes e assistente.
- No modo local, ficam cifrados (AES-GCM) com uma chave do navegador não exportável guardada no IndexedDB.
- Com conta, ficam na tabela `booking_secrets` (migração 004). Só quem guardou o código o vê; outra pessoa só se for autorizada explicitamente e enquanto participar da viagem.
- O código aparece oculto e só é mostrado com clique, por 30 segundos.

**Carros.**
- Cadastro de carro próprio ou alugado, com locadora, retirada, devolução, seguro, franquia, caução, motoristas e países.
- Combustível: litros = distância ÷ consumo e custo = litros × preço. Aceita km/L, L/100 km e kWh/100 km. Exemplo: 500 km a 12,5 km/L com €1,70 o litro dá 40 L e €68.
- Rota por estrada só com clique (OSRM, `VITE_ROTAS_URL`), com alternativas e links para Google Maps e Apple Maps. Sem rota calculada, a pessoa digita a quilometragem; a linha reta nunca é usada como distância por estrada.
- O comparador soma aluguel, combustível, pedágios e estacionamento por carro e confere lugares, malas e motoristas. Um valor desconhecido deixa a opção "incompleta", em vez de valer zero.

**Custos.** Passagem, aluguel, combustível, pedágios e estacionamento viram despesas ligadas ao transporte ou ao carro, sempre uma por tipo de custo. Editar atualiza a mesma despesa. Nada fica "pago" sem a pessoa informar. Remover um transporte mantém as despesas no orçamento.

**Carteira.** A aba Documentos virou Carteira. Ela reúne passagens, hotéis, locações, ingressos, reservas de restaurante, seguros, comprovantes e outros documentos, sem copiar registros. Tem busca sem acento, filtros por categoria, data e "só arquivos", pré-visualização, download, exclusão e organização por categoria, dia, transporte, hospedagem, veículo ou reserva.

**Preparação.** A aba Checklist virou Preparação e mantém o checklist antigo. Também tem:
- **lembretes** escolhidos pela pessoa (check-in, embarque, retirada e devolução do carro, hospedagem, ingressos com horário, pagamentos), mostrados no topo do app. A notificação do navegador só aparece com permissão e com o app aberto;
- **bagagem** por grupo, por viajante e por lista, com quantidades, sugestões pela duração, pelo tipo de viagem e pelos transportes (sem supor o clima) e reaproveitamento de listas de outras viagens;
- **preparação internacional** informativa: situação, link da fonte oficial e data da consulta. Não guarda números de documentos.

**Mapa da viagem inteira.** Voos aparecem como linha reta pontilhada (rotulada assim), estradas pela rota calculada (ou pontilhadas e com a distância digitada) e trem e barco com estilos próprios. Há filtros por dia e por trecho, e cada trecho mostra distância, tempo e custos.

**Integração.** O calendário e o Modo Viagem mostram os deslocamentos do dia; a Carteira, os lembretes, o mapa e o orçamento usam os mesmos ids. O backup leva tudo, com ids novos e vínculos refeitos. A opção "Exportar sem documentos" deixa os arquivos de fora, e arquivos de viagens compartilhadas com você não entram no backup.

**Testes.**
- Vitest: 250 aprovados, incluindo o cenário com cinco viajantes, voo com escala, dois carros, viagem até Madrid e custos em R$ e €.
- Playwright em 1280 px e 390 px: Visão Geral, nova viagem, perfil local e com conta (Supabase simulado), transportes, carteira, preparação, mapa e calendário.
- axe: 0 violações em pt, en e es.
- RLS da migração 004 executada num PostgreSQL embutido (PGlite): o dono vê o código; o participante e um estranho não veem; a autorização explícita funciona e acaba quando a pessoa sai da viagem.

**Ainda não testado com o Supabase real.** Aplique a migração 004 e rode `npm run verificar:supabase`.
