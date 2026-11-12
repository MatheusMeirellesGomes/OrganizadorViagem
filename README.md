# Gomes pelo Mundo — Organizador de viagens

Aplicativo responsivo em React e TypeScript para organizar viagens sem formulários obrigatórios. Backend preparado em Supabase (Auth, PostgreSQL com RLS e Storage privado). Identidade inspirada na família Gomes.

## Executar

Requer Node.js 22.12+ ou 24 e npm.

```sh
npm ci
npm run dev
```

Abra http://localhost:5173. Para acessar no celular na mesma rede, use o endereço Network mostrado pelo Vite. O servidor de desenvolvimento não é hospedagem de produção.

```sh
npm run build
npm test
npm run preview
```

## Funcionalidades implementadas

- Interface adaptada a computador, tablet e celular, com navegação inferior mobile.
- Cadastro de viagens sem exigir nome, destino, datas ou orçamento.
- Viagens futuras, em planejamento, em andamento e histórico.
- Roteiro por dia, atividades, visita concluída, reordenação e mudança de dia.
- Hospedagem, anotações, reservas com links e checklist.
- Fotos locais ou arquivos privados no Supabase.
- Orçamento com previsto e pago, status, divisão entre pessoas, saldos e acertos, em qualquer moeda e com conversão registrada.
- Roteiro inteligente por proximidade, com prévia, comparação de estratégias e desfazer (sem IA).
- Restaurantes por refeição perto das visitas do dia, com troca e gasto previsto.
- Modo Viagem com painel do dia, histórico, navegação no Google/Apple Maps, "Estou atrasado" e fila de edições fora do ar.
- Compartilhamento de viagem com convites de uso único (editor ou leitor) e assistente de roteiro opcional com IA, ambos dependentes do Supabase.
- Exportação/importação de backup JSON sem sobrescrever viagens.
- Download HTML offline com todos os dias, hospedagem, reservas e checklist.
- PWA com cache da interface em produção; dados locais acessíveis sem rede após a primeira visita.
- Mapa interativo OpenStreetMap com marcação manual de destinos por viagem.
- Minhas viagens e Histórico organizados por tipo: Todas, Nacionais, Internacionais e Sem tipo, com contador em cada opção e combinados com os filtros de status.
- Escolha visual de viagem Nacional, Internacional ou "Ainda não sei" no cadastro e na edição. O tipo é opcional; viagens e backups antigos sem tipo continuam válidos.
- Selo Nacional/Internacional nos cartões das viagens.
- Pesquisa e trajetos com links para Google Maps.
- **Explorar mundial** (detalhes em `docs/EXPLORAR.md`):
  - busca de cidades, bairros, endereços, atrações, coordenadas e localização atual, com sugestões em português, inglês, espanhol e nomes locais;
  - raio real de 1 a 20 km, mostrado no mapa, com o centro na cidade, no hotel cadastrado, numa atração, num ponto do mapa ou na sua localização;
  - atrações do Wikidata (palácios, castelos, praças, museus, igrejas, parques, mirantes, zoológicos, mercados, ruínas, natureza, estádios…);
  - restaurantes do OpenStreetMap por refeição (café da manhã, almoço, jantar…), culinária, faixa de preço e "aberto agora";
  - fotos sempre ligadas ao próprio lugar, com autor e licença;
  - cards, mapa ou cards + mapa, com marcadores agrupados;
  - painel de detalhes com galeria, horários, preços, transporte próximo e atrações vizinhas;
  - adicionar ao roteiro com dia, horário, observação e hospedagem, sem duplicar;
  - filtros combinados, filtros salvos e buscas recentes guardados só no aparelho.
- Login e cadastro com Supabase quando configurado.
- **Etapa 16** (detalhes em `docs/ETAPAS.md`):
  - Visão Geral com quatro cards de foto e números reais; nova viagem só com o nome;
  - Meu Espaço como perfil de viajante, com foto (corte, compressão, só JPG/PNG/WebP), preferências e estatísticas;
  - Central de Transportes: avião (com escalas, fusos, bagagem e check-in), carro próprio ou alugado, trem, ônibus, barco, transporte público, táxi, numa linha do tempo com hospedagens e atividades;
  - localizador da reserva (PNR) oculto, fora dos dados da viagem e dos backups;
  - calculadora de combustível, rota por estrada sob demanda (OSRM) e comparador "um carro grande × dois menores";
  - Carteira de reservas e documentos com categorias, busca, filtros e pré-visualização;
  - lembretes opcionais, listas de bagagem e preparação internacional informativa;
  - mapa da viagem inteira, com voos e estradas diferenciados.

## Conectar Supabase

### O que é necessário

Do painel do projeto Supabase (**Project Settings → API** ou botão **Connect**):

- **Project URL**, por exemplo `https://abcdefghijkl.supabase.co`.
- **Chave pública**: `anon` (legacy) ou `publishable` (`sb_publishable_...`).

Nunca use a `service_role` nem a `sb_secret_...` no frontend. O aplicativo recusa essas chaves e volta ao modo local.

### Passo a passo

1. Crie um projeto Supabase dedicado.
2. Abra o **SQL Editor** e execute, nesta ordem, `supabase/migrations/202611090001_initial.sql` (tabela `trips`, RLS e bucket privado `trip-photos`), `002_private_documents.sql`, `003_colaboracao_e_assistente.sql` (pessoas da viagem, convites e limite do assistente) e `004_transportes_e_localizadores.sql` (localizadores de reserva visíveis só para quem os guardou).
3. Em **Authentication → URL Configuration**, defina a **Site URL** (em desenvolvimento, `http://localhost:5173`; em produção, o domínio publicado) e inclua a mesma URL em **Redirect URLs**. O link de confirmação de e-mail volta para ela.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O `.env.local` não é enviado ao Git.
5. Reinicie `npm run dev`.

### Verificar o projeto real (obrigatório antes de publicar)

Crie duas contas de teste confirmadas (pelo app ou em **Authentication → Users → Add user**, marcando *Auto Confirm User*) e acrescente ao `.env.local`:

```sh
TESTE_EMAIL_A=...
TESTE_SENHA_A=...
TESTE_EMAIL_B=...
TESTE_SENHA_B=...
```

Depois execute:

```sh
npm run verificar:supabase
```

O script usa só a chave pública, como o navegador, e confere: visitante sem login não lê nem cria viagens; cada conta só vê, altera e apaga as próprias viagens; ninguém cria viagem em nome de outra conta nem transfere viagens; uma versão desatualizada não sobrescreve outra; documento com id diferente é recusado; fotos ficam restritas à pasta do dono. Os dados de teste são apagados no final.

### Assistente de roteiro (opcional)

1. Publique a função: `supabase functions deploy assistente`.
2. Cadastre os segredos no servidor: `supabase secrets set ANTHROPIC_API_KEY=... ASSISTENTE_ORIGENS=https://seu-dominio`. Opcional: `ASSISTENTE_MODELO` e `ASSISTENTE_LIMITE_DIARIO`.
3. No `.env.local` (ou no build), defina `VITE_ASSISTENTE=on`.

A chave da Anthropic nunca vai para o frontend. Cada pergunta tem custo de API, por isso há um limite diário por pessoa.

### Como funciona

- **Sem conta**: com ou sem Supabase configurado, o botão **Continuar sem conta** mantém o modo local (`localStorage`). A conta pode ser criada depois pelo Perfil.
- **Com conta**: cada viagem é uma linha em `trips` (`data` guarda o mesmo documento usado localmente), protegida por RLS. A mesma conta vê as viagens em qualquer aparelho.
- **Edição em dois aparelhos**: cada gravação confere o `updated_at`. Se a viagem mudou em outro aparelho, nada é sobrescrito e o app pede para recarregar.
- **Sem internet com conta**: o app mostra uma cópia somente leitura salva no aparelho, incluindo o Modo Viagem. No Modo Viagem, as mudanças feitas fora do ar ficam numa fila e são enviadas quando a conexão volta; em conflito, vale a versão da conta e o app avisa. A cópia é apagada ao sair da conta.
- **Envio das viagens locais**: ao entrar, se houver viagens salvas só neste navegador, um painel oferece enviá-las. Viagens novas são inseridas; idênticas não são duplicadas; viagens com o mesmo id e conteúdo diferente nunca substituem a conta (podem ser enviadas como cópias). Fotos locais vão para o bucket privado. A conta é lida novamente para confirmar, e a cópia local só é removida se o usuário pedir.
- **Backups e HTML offline** continuam funcionando nos dois modos. Importar um backup com conta cria novas viagens na conta.

## Limites atuais

No Explorar, avaliações, tempo médio de visita, cardápios e disponibilidade de mesas aparecem como "Não informado": as fontes livres usadas não têm esses dados. Os testes com as fontes reais rodam com `npm run testar:explorar` (precisa de internet). Compartilhamento e assistente foram testados só com um Supabase simulado; fotos e documentos privados continuam visíveis apenas para o dono. As telas indicam as integrações indisponíveis. Não há viagens fictícias cadastradas. Sem conta, o perfil fica no navegador; com conta, as preferências vão para os metadados do usuário e a foto para a pasta privada `trip-photos/<id>/perfil/`. Lembretes só avisam com o app aberto (não há servidor de notificações). O cálculo de rotas usa por padrão o servidor público de demonstração do OSRM, só quando você clica; para uso intenso, configure `VITE_ROTAS_URL` com um servidor próprio ou `off`. Recuperação de senha ainda não existe na interface. A integração Supabase foi testada com testes automatizados e uma API simulada no navegador; a validação contra um projeto real depende de `npm run verificar:supabase`.

Fotos de inspiração são carregadas do Unsplash; fontes do Google Fonts. Essas imagens não representam viagens do usuário. Links de mapas dependem de internet.

## Publicação

O build estático é gerado em `dist/` e pode ser hospedado em um serviço de frontend. Configure as mesmas variáveis públicas no build e as URLs de Auth no Supabase. O banco e os arquivos ficam no Supabase; o frontend precisa de hospedagem própria. Não há publicação automática configurada.

## Verificação

Build de produção e 26 testes automatizados aprovados. Verificados no navegador: criação sem campos preenchidos, inclusão de atividade, mudança de dia, marcação de visita, checklist e persistência após recarregar. Layout verificado em 1440px e 390px, sem overflow horizontal no roteiro mobile. O download offline é uma cópia estática; mapas externos e autenticação exigem internet. O cache PWA só funciona em produção, em HTTPS ou localhost.

## Mapas

Mapas interativos usam Leaflet e tiles OpenStreetMap, com atribuição visível e cache HTTP padrão. Não há download/prefetch de mapas offline. Consulte a política https://operations.osmfoundation.org/policies/tiles/ antes de escalar o produto. Marcação de destino é manual; não há geocodificação automática.


## Modo Viagem

Abra uma viagem e toque em **Modo Viagem**, ao lado do status. Funciona com qualquer status e não muda a viagem para “em andamento”. Retorne pelo botão **Planejamento** ou pela barra inferior; o dia selecionado é mantido entre as duas telas.

- Cabeçalho compacto, navegação horizontal por dias, timeline na ordem original e progresso das visitas.
- Atividades sem datas, horários ou endereços continuam utilizáveis. Quando há datas, os dias são calculados por calendário, sem inferir o fuso do destino.
- “A seguir no roteiro” destaca a primeira atividade não visitada do dia. Como o modelo não possui fuso horário, não há “Hoje” automático, contagem regressiva ou reordenação por horário.
- “Como chegar” só existe com endereço informado. Links externos ficam indisponíveis quando o navegador informa ausência de conexão.
- Detalhes expansíveis mantêm o dia selecionado. Endereços e hospedagem podem ser copiados.
- “Informações da viagem” aparece somente quando há hospedagem, notas, reservas ou checklist. As reservas são gerais: o modelo ainda não associa reservas a atividades.
- Marcar/desmarcar visitas e atualizar checklist reutiliza o mesmo objeto Trip, a mesma função save e o mesmo localStorage do planejamento. Sem novos bancos, migrações, dependências ou filas de sincronização.
- Foco de teclado ao entrar/sair, feedback por região live, controles de toque com 44px ou mais e respeito a movimento reduzido.

### Verificação desta etapa

`npm run build` e `npm test`: build aprovado e 26 testes aprovados (18 específicos do Modo Viagem e 8 anteriores). Testes abrangem calendário, dados incompletos, seleção de dias, ordem das atividades, visitas, persistência local, links offline, renderização sem hospedagem e compatibilidade de backup/HTML.

QA no navegador em origem isolada: viagem vazia, entrada e retorno, seleção de dia, atividade sem horário/endereço, marcar/desmarcar, detalhes, atualização no planejamento, persistência após reload, datas e informações recolhíveis. Layout de 390px sem overflow horizontal. Navegação e gravação local verificadas com servidor desligado e página já carregada.

### Limites offline

O Modo Viagem não usa rede para consultar ou atualizar dados locais. Abrir/recarregar o aplicativo sem rede exige visita prévia ao build de produção, HTTPS ou localhost e suporte a service workers. O navegador integrado usado no teste não recuperou a página com o servidor desligado; esse cenário de inicialização offline não foi validado nele. O download HTML offline existente permanece disponível como alternativa. Mapas, links de reservas, autenticação e dados remotos exigem conexão. Não há sincronização offline entre dispositivos.

### Arquivos do Modo Viagem

- `src/TravelMode.tsx`: apresentação, controles e callbacks de salvamento.
- `src/travel-mode.ts`: calendário, seleção, progresso, próxima atividade e URLs seguras.
- `src/travel-mode.css`: estilos responsivos isolados.
- `src/travelMode.test.tsx`: testes de lógica, renderização, persistência e compatibilidade.
- `src/main.tsx`: acesso ao modo, estado compartilhado, retorno com foco e registro do cache PWA com diagnóstico de falhas.

Evoluções futuras: fuso IANA por destino para identificar o dia atual com precisão, vínculo explícito reserva–atividade e validação do cache em aparelhos reais após hospedagem HTTPS.
