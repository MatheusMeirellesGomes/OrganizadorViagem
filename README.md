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
- Aba Viagens nacionais, com filtros de status e categoria opcional Nacional/Internacional.
- Pesquisa e trajetos com links para Google Maps.
- Login e cadastro com Supabase quando configurado.

## Conectar Supabase

1. Crie um projeto Supabase dedicado.
2. Execute `supabase/migrations/202611090001_initial.sql` no SQL Editor desse projeto.
3. Copie `.env.example` para `.env.local`.
4. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública publishable/anon do projeto. Nunca use a chave service_role no navegador.
5. Configure as URLs de autenticação no painel Supabase para o domínio que hospeda a aplicação.
6. Reinicie o servidor e crie a conta pela interface. A confirmação de e-mail depende da configuração do Supabase.

Sem variáveis, a aplicação usa armazenamento local. Dados locais não são enviados automaticamente para uma conta; não apague os dados do navegador sem exportar um backup. Fotos grandes podem exceder a cota local, e o aplicativo avisa quando o salvamento falha.

A tabela `trips` guarda um documento JSON por viagem com proprietário validado pelas políticas RLS. Cada usuário autenticado só pode ler/escrever suas viagens. O bucket de fotos é privado, com políticas por prefixo de usuário e URLs assinadas.

## Limites atuais

As integrações de descoberta por cartões, IA, colaboração em grupo, arquivos de reservas e sincronização offline de contas ainda não estão implementadas. As telas indicam as integrações indisponíveis. Não há viagens fictícias cadastradas. Preferências de perfil são locais. Supabase não foi validado contra um projeto remoto até o fornecimento da configuração.

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
