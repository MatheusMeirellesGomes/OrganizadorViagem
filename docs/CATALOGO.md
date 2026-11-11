# Fontes do catálogo

Todas as consultas são iniciadas pelo usuário (botão), para uma região e raio de 0,5–10 km. Nada é varrido automaticamente, não há autocompletar e os resultados ficam em cache por 24 horas (até seis consultas). Preços, avaliações e horários nunca são inventados: aparece apenas o que a fonte informa, com link para conferir.

## Atrações — Wikipédia, Wikidata e Wikimedia Commons

- **Wikipédia (GeoSearch):** até 100 artigos com coordenadas perto do ponto, do mais próximo ao mais distante, no idioma da interface (pt, en ou es). Descrição curta e foto principal **somente com licença livre** (`pilicense=free`).
- **Wikidata (SPARQL):** classifica cada artigo (castelo, museu, igreja, praça, mirante…), indica patrimônio tombado (P1435) e o site oficial (P856). Ruas, estações comuns, eventos e organizações ficam ocultos por padrão; o usuário pode mostrá-los.
- **Wikimedia Commons:** autor e licença de cada foto, exibidos sob a imagem com link para a página do arquivo. Imagens só são aceitas de servidores `wikimedia.org`.
- Licenças: textos CC BY-SA, Wikidata CC0, fotos conforme cada arquivo. Pedidos levam o cabeçalho `Api-User-Agent`, como a Wikimedia recomenda.
- Teste real em 11/11/2026: Lisboa 79 pontos turísticos (75 com foto creditada), Madrid 31, respostas em 1–3 s.

## Complemento e restaurantes — OpenStreetMap via Nominatim

- **Atrações extras:** botão "Completar com OpenStreetMap" busca atrações, museus, mirantes, parques temáticos, cachoeiras e parques. Lugares iguais aos da Wikipédia (mesmo item Wikidata ou mesmo nome a menos de 300 m) não se repetem. Miniaturas dentro de parques temáticos (ex.: Mini Mundo) são ocultadas.
- **Restaurantes:** restaurantes, cafés e lanchonetes (até 40 de cada), com endereço, culinária, dieta, horário, telefone e site quando cadastrados.
- **Política de uso do Nominatim** (https://operations.osmfoundation.org/policies/nominatim/): no máximo 1 requisição por segundo (o app espera 1,1 s entre pedidos), resultados em cache, identificação pelo Referer do site, sem autocompletar e sem consultas sistemáticas. O limite vale para o **app inteiro**, somando todos os usuários. Com mais tráfego, configure um servidor próprio ou contratado em `VITE_NOMINATIM_URL`; `VITE_NOMINATIM_URL=off` desliga o serviço caso a OSMF peça.
- Teste real em 11/11/2026: Lisboa (500 m) 81 lugares em 3,4 s; Gramado passou de 5 para 82 lugares com o complemento.
- Dados © OpenStreetMap contributors, ODbL, com atribuição visível.

## Overpass

As instâncias públicas responderam "at capacity" ou estouraram o tempo em 11/11/2026 (4 de 4 servidores na segunda rodada) e a política delas desaconselha uso como backend de aplicativo. Por isso não são mais usadas. Um servidor Overpass próprio pode ser configurado em `VITE_OVERPASS_URL`; nesse caso os restaurantes vêm dele, tentando os servidores configurados dois a dois.

## Limites

- A cobertura depende de artigos e cadastros colaborativos; nenhuma fonte reúne todos os lugares.
- Tags colaborativas não comprovam que um lugar está aberto agora. Ausência de preço, horário ou acessibilidade continua desconhecida.
- Distâncias são em linha reta, nunca rota de trânsito.
- Conteúdo externo é texto escapado pelo React; URLs aceitam apenas HTTP/HTTPS.
