# Explorar — auditoria e reformulação

## Auditoria (11/11/2026)

Testes feitos no navegador com as fontes reais, antes de mudar qualquer coisa.

### Por que atrações famosas não apareciam

O catálogo de atrações usava a busca geográfica da Wikipédia (`list=geosearch`). Ela devolve **no máximo os 100 artigos mais próximos do centro**, e o raio máximo é de 10 km.

No centro de Madrid (Puerta del Sol), esses 100 artigos cabem em **312 m**. Eles são ruas, estações de metrô, cafés antigos e eventos históricos. Palacio Real, Museo del Prado, Retiro, Puerta de Alcalá e Bernabéu ficavam de fora com qualquer raio escolhido. Ou seja, o seletor de raio não tinha efeito real em cidades grandes.

A classificação também usava uma lista curta de classes do Wikidata. Lugares com classes mais específicas sumiam, por exemplo "catedral católica", "parque urbano", "arco do triunfo" e "estádio multiuso". Isso só não acontecia quando o lugar era tombado.

### Por que algumas fotos eram de outro lugar

- **OpenStreetMap:** o complemento copiava a etiqueta `image`, um endereço livre digitado por qualquer mapeador. Às vezes era a foto de um vizinho, de um logotipo ou de uma vista da cidade.
- **Wikipédia:** a foto vinha da imagem principal do artigo (`pageimages`). Ela nem sempre mostra o próprio lugar, por exemplo em artigos sobre ruas, bairros ou eventos.

### Outras limitações encontradas

- **Busca de destino:** só pela busca de texto da Wikipédia. Não havia sugestões enquanto se digita, nem endereço, coordenadas ou localização atual.
- **Raio:** 0,5 a 10 km. Não havia círculo no mapa nem como explorar outra área.
- **Restaurantes:** até 40 por tipo, sem "carregar mais" e sem filtros de refeição, preço ou "aberto agora".
- **Cards:** grandes, com informações escondidas em "Conhecer o lugar". Não havia mapa com os resultados.
- **Lugares salvos** (`placeChoices`) e **atividades:** guardam id, nome, coordenadas, categoria, endereço e fonte. Esse formato é mantido, para que viagens antigas continuem funcionando.

## O que mudou

### Atrações: Wikidata por raio real (`src/explore/wikidata.ts`)

1. Todos os itens do Wikidata com coordenadas dentro do raio (1 a 20 km) e pelo menos um artigo da Wikipédia, ordenados pelo número de artigos (relevância).
2. As classes de cada item.
3. As superclasses das classes desconhecidas, até 3 níveis. Ficam em cache no aparelho.

Ficam fora:

- cidades, aeroportos, estações, escritórios, escolas e empresas, a não ser que também sejam claramente um ponto turístico;
- lugares demolidos (P576);
- obras guardadas em acervo de museu (P195).

Resultado medido em Madrid, raio de 20 km: **867 atrações**. Os 9 lugares obrigatórios aparecem entre as 120 primeiras, todos com foto e licença.

### Equivalência de categorias (`src/explore/categories.ts`)

O Wikidata e o OpenStreetMap usam as mesmas categorias do app. Quando um lugar tem várias, vence a mais específica: castelo, depois palácio, igreja, ruínas, zoológico, museu, praça, parque e assim por diante.

Um palácio marcado como "edifício histórico" ou "atração" não desaparece.

### Fotos (`src/explore/photos.ts`)

O card só mostra uma foto ligada à identidade do lugar:

1. a imagem P18 do próprio item do Wikidata;
2. a etiqueta `wikimedia_commons=File:…` do próprio objeto no OpenStreetMap;
3. a foto que lugares salvos antes desta mudança já tinham.

Nunca se busca foto por nome ou por cidade. Uma foto repetida em dois lugares fica só no mais relevante. Sem foto confiável, o card mostra uma ilustração da categoria com o aviso "Sem foto verificada".

Na galeria de detalhes entram só arquivos do Commons cujos dados estruturados dizem que **retratam este item** (P180). Arquivos sem licença conhecida não aparecem.

### Busca mundial (`src/explore/search.ts`)

- **Sugestões enquanto se digita:** vêm do Wikidata, com nomes em todos os idiomas, apelidos e nomes históricos, e sem diferença de acentos. Há espera de 350 ms e a busca anterior é cancelada.
- **Endereços:** vão ao OpenStreetMap (Nominatim) só quando a pessoa pede, porque a política de uso proíbe autocompletar.
- **Coordenadas** são lidas direto. A **localização atual** só é usada com autorização do navegador.

### Restaurantes (`src/explore/restaurants.ts`, `src/explore/hours.ts`)

- **Refeições:** café da manhã, brunch, almoço, café da tarde e jantar vêm do horário cadastrado no OpenStreetMap ou de etiquetas explícitas.
- **Tipos de lugar:** cafeterias, padarias, sorveterias, sobremesas, comida rápida e restaurantes tradicionais vêm do tipo e da culinária cadastrados.
- **Preço (€ a €€€€):** só quando o lugar tem faixa de preço cadastrada. O app nunca chama um restaurante de barato ou caro sem esse dado.
- **"Aberto agora":** usa o fuso do país do lugar, não o do aparelho. Horários em formatos que o leitor não entende não são adivinhados.
- **"Carregar mais":** pede ao OpenStreetMap só os lugares ainda não mostrados (`exclude_place_ids`).

### Dados que as fontes não têm

O app mostra "Não informado" para avaliações, tempo médio de visita, cardápios e disponibilidade de mesas. Nenhuma das fontes livres usadas tem esses dados com licença compatível, e nada disso é inventado.

### Interface (`src/explore/Explore.tsx` e componentes)

- **Busca:** com sugestões acessíveis pelo teclado, "Minha localização" e buscas recentes.
- **Raio:** em botões de 1, 2, 5, 10, 15 e 20 km. O centro pode ser a cidade pesquisada, um hotel cadastrado, uma atração ("Buscar perto daqui"), um ponto do mapa ou a localização atual.
- **Visualização:** Cards, Mapa ou Cards + mapa.
  - O mapa mostra o círculo do raio, cores por categoria, marcadores próximos agrupados e o lugar selecionado em destaque.
  - Card e marcador se destacam um ao outro.
  - Depois de arrastar o mapa, aparece "Buscar nesta área".
- **Cards:**
  - foto grande com crédito e esqueleto enquanto carrega;
  - nome traduzido e nome local ou oficial, cidade e categoria;
  - distância;
  - etiquetas honestas: preço real, Gratuito, Patrimônio, Ao ar livre ou Ambiente interno (pela categoria), Acessível, Reserva recomendada, Aberto agora.
- **Painel de detalhes:**
  - galeria verificada e resumo da Wikipédia;
  - endereço, horários, dias de fechamento, preços, site oficial e ingressos;
  - duração, acessibilidade e transporte público em até 700 m;
  - atrações a até 1,5 km;
  - fonte e data da consulta. O que falta aparece como "Não informado".
- **Adicionar à viagem:**
  - viagem, dia, horário, observação e hospedagem, com marcação Quero ir, Talvez ou Já visitei;
  - o lugar é salvo com id estável, nome, coordenadas, categoria, endereço, foto validada e fonte;
  - o mesmo lugar não entra duas vezes e as atividades existentes nunca são alteradas.
- **Filtros combinados:**
  - categorias com contagem;
  - gratuito ou pago, distância e ambiente;
  - crianças, acessível e só com foto;
  - culinária, faixa de preço, aberto agora, vegetariano e reserva;
  - opção "incluir lugares sem a informação".
- **Ordenação:** relevância, mais próximos, nome ou menor preço.
- **Outros recursos:** "Limpar filtros", filtros salvos e "Carregar mais".

### Desempenho e confiabilidade

- **Cache por aparelho:** guarda as 4 últimas buscas por 24 h, por local, raio, tipo e idioma. As classes do Wikidata ficam salvas para buscas futuras.
- **Busca nova:** cancela a anterior. As sugestões esperam 350 ms sem digitação.
- **Wikidata:** no máximo 3 consultas ao mesmo tempo, com nova tentativa quando responde 429 ou 5xx.
- **OpenStreetMap:** 1 pedido por segundo (política do Nominatim). Nenhum Overpass público é usado.
- **Carregamento:** os detalhes vêm em páginas de 120 lugares, com "Carregar mais".
- **Chaves:** nenhuma chave de API no navegador. Todas as fontes são abertas.

## Testes

- `npm test`: testes automáticos com respostas no formato real das fontes (categorias, fotos, horários, filtros, cache, paginação e busca).
- `npm run testar:explorar`: testes com as **fontes reais**. Precisam de internet e não usam nada simulado:
  - lugares obrigatórios de Madrid e Segóvia;
  - pontos de Lisboa, Paris e Belo Horizonte;
  - a foto de cada card é a P18 do próprio item;
  - buscas em outros idiomas;
  - jantar em Madrid.
