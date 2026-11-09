# Atlas — Organizador de viagens

Aplicativo responsivo em React e TypeScript para organizar viagens sem formulários obrigatórios. Backend preparado em Supabase (Auth, PostgreSQL com RLS e Storage privado). Nome Atlas provisório.

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

As integrações de descoberta por cartões, IA, mapa geográfico interno, colaboração em grupo, arquivos de reservas e sincronização offline de contas ainda não estão implementadas. As telas indicam as integrações indisponíveis. Não há viagens fictícias cadastradas. Preferências de perfil são locais. Supabase não foi validado contra um projeto remoto até o fornecimento da configuração.

Fotos de inspiração são carregadas do Unsplash; fontes do Google Fonts. Essas imagens não representam viagens do usuário. Links de mapas dependem de internet.

## Publicação

O build estático é gerado em `dist/` e pode ser hospedado em um serviço de frontend. Configure as mesmas variáveis públicas no build e as URLs de Auth no Supabase. O banco e os arquivos ficam no Supabase; o frontend precisa de hospedagem própria. Não há publicação automática configurada.

## Verificação

Build de produção e 7 testes automatizados aprovados. Verificados no navegador: criação sem campos preenchidos, inclusão de atividade, mudança de dia, marcação de visita, checklist e persistência após recarregar. Layout verificado em 1440px e 390px, sem overflow horizontal no roteiro mobile. O download offline é uma cópia estática; mapas externos e autenticação exigem internet. O cache PWA só funciona em produção, em HTTPS ou localhost.
