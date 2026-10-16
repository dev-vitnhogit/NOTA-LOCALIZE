# RotaFácil — protótipo frontend

Projeto inicial de planejador de entregas usando somente HTML, CSS e JavaScript no navegador.

## Como executar

1. Extraia o ZIP.
2. Abra a pasta no VS Code.
3. Execute `index.html` com a extensão Live Server, ou use outro servidor estático local.
4. Cole endereços completos, de preferência com cidade e estado, um por linha.
5. Clique em **Montar rota**.

Abrir pelo Live Server costuma ser mais confiável do que abrir o arquivo diretamente (`file://`).

## Tecnologias

- HTML, CSS e JavaScript
- Leaflet para o mapa
- OpenStreetMap para as imagens do mapa
- Photon (Komoot) para geocodificação
- OSRM público para cálculo de rota e tentativa de ordenar as paradas
- Google Maps para abrir a navegação externa

## Limitações importantes

- É um protótipo, não um produto pronto para vender.
- Os serviços públicos podem ter limites, indisponibilidade e termos de uso que precisam ser respeitados.
- A geocodificação pode escolher um endereço parecido, por isso confira os pontos no mapa.
- O sistema não tem login, banco de dados, sincronização entre dispositivos ou salvamento permanente.
- O progresso das entregas existe apenas enquanto a página fica aberta.
- A sequência calculada é uma estimativa e não garante a melhor rota em todas as situações.
- Para um produto comercial, será necessário avaliar provedores, limites, privacidade e custos. "Gratuito" não significa uso ilimitado garantido.

## Estrutura

- `index.html`: estrutura da interface
- `styles.css`: aparência e responsividade
- `app.js`: geocodificação, rota, mapa e status das entregas
