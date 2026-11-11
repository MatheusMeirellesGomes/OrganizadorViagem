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
- Despesas opcionais, com totais separados por moeda.
- Exportação/importação de backup JSON sem sobrescrever viagens.
- Download HTML offline com todos os dias, hospedagem, reservas e checklist.
- PWA com cache da interface em produção; dados locais acessíveis sem rede após a primeira visita.
- Mapa interativo OpenStreetMap com marcação manual de destinos por viagem.
- Minhas viagens e Histórico organizados por tipo: Todas, Nacionais, Internacionais e Sem tipo, com contador em cada opção e combinados com os filtros de status.
- Escolha visual de viagem Nacional, Internacional ou "Ainda não sei" no cadastro e na edição. O tipo é opcional; viagens e backups antigos sem tipo continuam válidos.
- Selo Nacional/Internacional nos cartões das viagens.
- Pesquisa e trajetos com links para Google Maps.
- Calendário, participantes opcionais, várias hospedagens, reservas vinculadas, documentos privados, álbuns de fotos e gerador de roteiro sem IA (veja `docs/ETAPAS.md`).
- **Explorar lugares reais:** atrações da Wikipédia e do Wikidata com fotos livres creditadas (autor e licença), patrimônio e site oficial; complemento e restaurantes do OpenStreetMap via Nominatim, dentro da política de uso. Nada de preço, nota ou horário inventado. Detalhes em `docs/CATALOGO.md`.
- **Idiomas:** português, inglês e espanhol, com datas e números no formato de cada idioma, inclusive mensagens de erro e o HTML offline. Um teste automático falha se algum texto novo ficar sem tradução.
- Mapas e catálogo carregados sob demanda, com aviso em vez de travar se faltar conexão.
- Login e cadastro com Supabase quando configurado.

## Conectar Supabase

### O que é necessário

Do painel do projeto Supabase (**Project Settings → API** ou botão **Connect**):

- **Project URL**, por exemplo `https://abcdefghijkl.supabase.co`.
- **Chave pública**: `anon` (legacy) ou `publishable` (`sb_publishable_...`).

Nunca use a `service_role` nem a `sb_secret_...` no frontend. O aplicativo recusa essas chaves e volta ao modo local.

### Passo a passo

1. Crie um projeto Supabase dedicado.
2. Abra o **SQL Editor** e execute `supabase/migrations/202611090001_initial.sql`. Ele cria a tabela `trips`, as políticas RLS e o bucket privado `trip-photos`.
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

### Como funciona

- **Sem conta**: com ou sem Supabase configurado, o botão **Continuar sem conta** mantém o modo local (`localStorage`). A conta pode ser criada depois pelo Perfil.
- **Com conta**: cada viagem é uma linha em `trips` (`data` guarda o mesmo documento usado localmente), protegida por RLS. A mesma conta vê as viagens em qualquer aparelho.
- **Edição em dois aparelhos**: cada gravação confere o `updated_at`. Se a viagem mudou em outro aparelho, nada é sobrescrito e o app pede para recarregar.
- **Sem internet com conta**: o app mostra uma cópia somente leitura salva no aparelho, incluindo o Modo Viagem. Alterações exigem conexão; não há fila de sincronização offline. A cópia é apagada ao sair da conta.
- **Envio das viagens locais**: ao entrar, se houver viagens salvas só neste navegador, um painel oferece enviá-las. Viagens novas são inseridas; idênticas não são duplicadas; viagens com o mesmo id e conteúdo diferente nunca substituem a conta (podem ser enviadas como cópias). Fotos locais vão para o bucket privado. A conta é lida novamente para confirmar, e a cópia local só é removida se o usuário pedir.
- **Backups e HTML offline** continuam funcionando nos dois modos. Importar um backup com conta cria novas viagens na conta.

## Limites atuais

As integrações de descoberta por cartões, IA, colaboração em grupo, arquivos de reservas e edição offline com sincronização posterior ainda não estão implementadas. As telas indicam as integrações indisponíveis. Não há viagens fictícias cadastradas. Preferências de perfil são locais. Recuperação de senha ainda não existe na interface. A integração Supabase foi testada com testes automatizados e uma API simulada no navegador; a validação contra um projeto real depende de `npm run verificar:supabase`.

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
- “A seguir no roteiro” destaca a primeira atividade não visitada do dia. Com um fuso horário opcional (calendário da viagem), o Modo Viagem indica o dia atual; sem ele, usa o fuso do aparelho e avisa isso.
- “Como chegar” só existe com endereço informado. Links externos ficam indisponíveis quando o navegador informa ausência de conexão.
- Detalhes expansíveis mantêm o dia selecionado. Endereços e hospedagem podem ser copiados.
- “Informações da viagem” aparece somente quando há hospedagem, notas, reservas ou checklist. Reservas podem ser vinculadas a atividades e hospedagens no planejamento.
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
