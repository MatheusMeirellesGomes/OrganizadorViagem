# Fontes do catálogo

A busca local é acionada pelo usuário, por região e raio de 0,5–10 km; não varre cidades ou países automaticamente. Overpass retorna os elementos dentro da consulta; paginação da interface mostra 24 por vez sem limitar o conjunto às atrações mais famosas. Cache de 24 horas (até seis regiões), uma consulta por vez e intervalo mínimo de 15 segundos. Resposta parcial/timeout não é tratada como resultado completo.

## Serviços

- OpenStreetMap/Overpass: nomes, tipos, coordenadas, tags opcionais, fonte individual, momento da consulta e edição do registro. ODbL, atribuição visível. [Política de uso](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) orienta aplicativos públicos a operar uma instância adequada; a instância comunitária é usada apenas no desenvolvimento para consultas manuais. Em produção configure `VITE_OVERPASS_URL` com HTTPS/CORS e capacidade adequada. Não ativamos serviço ou cobrança. Proxy com segredo deve ficar no backend, nunca em `VITE_*`.
- Wikipédia: localização por título com redirecionamentos e coordenadas; consulta somente ao clicar em Localizar. Não é geocodificação completa de endereços. Confirmar a região no mapa antes da busca. [GeoData](https://www.mediawiki.org/wiki/API:Geosearch), [CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests).
- Tiles OpenStreetMap: apenas mapa interativo. Sem download em massa nem promessa de mapa offline.
- Nominatim público: não integrado; evitar autocomplete e uso inadequado de geocodificador público.
- Wikidata/Commons: candidatos para enriquecimento; nenhum dado/foto fabricado. Exibir imagens requer preservar autoria, licença e página de origem. Fontes oficiais continuam preferíveis para preços/horários atuais.

Tags colaborativas não comprovam que um lugar está aberto agora. Ausência de `fee=no` não significa que seja pago. Ausência de preço, horário ou acessibilidade permanece explicitamente desconhecida. Conteúdo externo é texto escapado pelo React; URLs aceitam apenas HTTP/HTTPS. Distâncias calculadas por coordenadas serão identificadas como linha reta, nunca rota de trânsito.
