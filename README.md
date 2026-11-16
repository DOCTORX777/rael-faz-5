# Rael faz 5!

Convite digital inspirado no impresso feito pela mãe do Rael, com lista de presença e painel privado da Paloma. As Netlify Functions usam Node.js 22 e armazenam as respostas no Netlify Blobs.

## Abrir o convite

Toque em **Abrir o convite** ou arraste a capa na horizontal. A dobra revela um campinho ilustrado. Toque na bola, arraste-a para escolher a força e o lado do chute ou ative o botão pelo teclado. A capivara defende cada quarto chute e o troféu aparece após três gols. **Fechar o convite** recolhe o campinho. A tecla **Esc** também fecha quando o foco está dentro do jogo. A data, o local e **Confirmar presença** ficam disponíveis com a capa fechada.

A dobra usa transformações CSS. A bola usa Three.js 0.160.0, servido em public/vendor/ e importado quando o convite abre em um navegador com WebGL. A renderização pausa fora da tela e com a aba oculta. Equipamentos sem WebGL usam a bola impressa com animação em CSS. Com movimento reduzido, o placar responde sem animar o chute e as ilustrações ficam paradas.

## Rodar no Windows

No PowerShell, abra a pasta do projeto com Node.js 22.13 ou superior da série 22.

~~~powershell
npm.cmd ci
Copy-Item .env.example .env
notepad .env
npm.cmd test
npm.cmd run dev
~~~

Preencha apenas a senha local em ADMIN_PASSWORD. O convite fica em http://localhost:8888/ e o painel em http://localhost:8888/admin/. Para mudar de porta, use npm.cmd run dev -- --port 8898. O .env e as respostas locais em .netlify/ ficam fora do Git.

## Como a Paloma usa o painel

1. Em /admin/, entre com o usuário **Paloma** e a senha definida em ADMIN_PASSWORD.
2. Em **Respostas**, toque no nome para ver a data, o recado e todo o grupo, com tipo e idade quando informados. A busca aceita o nome de quem respondeu ou de um acompanhante. **Só crianças** mostra os grupos com crianças.
3. Em **Lista de convidados**, cada pessoa confirmada ocupa uma linha. Use **Imprimir lista** para a portaria. **Só crianças** nessa visão mostra apenas as crianças. Buscas e filtros definem o conteúdo exibido e exportado.
4. **Possível duplicata** aponta nomes iguais ou com pequena diferença de grafia em respostas distintas. Abra os grupos e confira. **Marcar como duplicada** retira a resposta dos totais e da lista de pessoas. **Voltar a contar** reverte a decisão. **Excluir resposta** pede confirmação e apaga o registro.
5. **CSV por resposta** inclui recados, acompanhantes, presente e a marcação de ignorada. **CSV por pessoa** segue a lista de pessoas. Os arquivos usam UTF-8 com BOM para abrir com acentos no Excel. **Presentes escolhidos** soma os itens das respostas confirmadas que contam para a festa. O painel atualiza a cada 60 segundos enquanto estiver visível. **Atualizar** consulta imediatamente.
6. Use **Sair** para encerrar a sessão.

Quem responde e confirma presença conta como um adulto. Em registros antigos, os nomes ausentes aparecem como “Acompanhante sem nome”. Se a categoria também estiver ausente, a pessoa entra no total esperado e fica sem classificação. Os registros antigos permanecem no mesmo armazenamento.

## Envio e correção pelo convidado

- O mesmo link aceita várias famílias no mesmo aparelho. Cada novo envio recebe um ID próprio, inclusive se o nome e a lista forem iguais a outro envio.
- Cada envio aceita até 50 acompanhantes, além de quem responde. A idade da criança é opcional e aceita 0 a 17 anos. O recado aceita até 300 caracteres. O servidor limita o corpo a 64 KiB e os envios válidos a 12 por IP por minuto.
- Após um envio, **Confirmar outra pessoa/família** abre um formulário em branco. **Você já confirmou** mostra o histórico neste aparelho. Use **Editar** ao lado da resposta original para corrigir a presença, o grupo, a ideia de presente ou o recado no mesmo registro.
- O navegador guarda localmente o nome, a resposta e a referência de edição. Nomes dos acompanhantes, idades e recados permanecem no servidor. Se o navegador apagar o histórico, a Paloma pode ajustar a contagem pelo painel.
- Um reenvio da mesma solicitação após falha de rede reutiliza o identificador. Uma nova confirmação usa outro ID.

## Publicar na Netlify

1. Envie o conteúdo desta pasta para um repositório no GitHub, incluindo netlify.toml, a pasta scripts/ e os arquivos de configuração. Importe esse repositório na Netlify e use a raiz como pasta base.
2. Defina **ADMIN_PASSWORD** como variável de ambiente secreta, disponível em **Functions**. Faça um novo deploy após configurar a senha.
3. **SITE_URL** é opcional na Netlify, que fornece **URL** ao build. Para usar outro domínio canônico, configure **SITE_URL** no ambiente de build com a URL pública completa. O script scripts/open-graph.mjs gera og:url e og:image como URLs absolutas e rejeita endereços locais. assets/og.jpg mede 1200 × 630.
4. Abra o convite publicado no celular. Confira a prévia do link no WhatsApp e se o pino do mapa cai no portão correto. Abra o campinho e chute a bola. Confirme um grupo com adulto, criança e um presente opcional. Confira a lista e os totais no painel, imprima a lista de portaria, exporte os dois CSVs e exclua os registros de teste.

## Dados e artes que podem ser preenchidos

- **Local.** Edite VENUE em public/config.js. Deixe lat e lng em 0 enquanto as coordenadas não estiverem confirmadas. Nesse caso, os botões buscam o endereço e o mapa embutido fica oculto. Use números decimais para as coordenadas e escreva uma referência curta em referencia, se houver. Se o endereço mudar, atualize também LOCATION em public/rael-faz-5.ics.
- **Presentes.** Edite public/gifts.json na ordem de exibição. Os seis primeiros também aparecem após confirmar presença. Mantenha o id de um item que já recebeu respostas. O campo arte aponta para o nome do arquivo WebP em public/assets/cena/, sem extensão. A contagem pública é agregada por item.
- **Tamanhos do Rael.** Preencha roupa e calcado no objeto RAEL_SIZES em public/config.js. Valores vazios ficam ocultos.
- **Foto:** substitua public/assets/rael.jpg pela foto do Rael, atualize o texto alternativo e remova data-placeholder da imagem em public/index.html.
- **Horário final:** preencha data-end-time em public/index.html, por exemplo com o texto do horário confirmado, e inclua DTEND em public/rael-faz-5.ics. Com o campo vazio, o convite mostra só o horário de início.
- **Avisos:** preencha o conteúdo dos elementos dd de roupa de troca, protetor solar e estacionamento em public/index.html. O site mostra apenas os avisos com texto.

O site serve Graduate, Barlow Condensed, Caveat e Nunito localmente. As licenças ficam em public/assets/.

### Refazer uma ilustração

Consulte public/assets/cena/PROMPTS.md para o prompt de cada objeto, a ordem das camadas e o estilo. Gere a peça isolada em PNG com transparência. Recorte o excesso de área vazia e exporte em WebP com as dimensões da versão base existente e uma segunda versão @2x com o dobro. Preserve o nome do arquivo. Para a bola, exporte o mapa UV retangular opaco com 2048 × 1024 px. Confira a composição no celular após trocar uma peça e mantenha a soma dos WebP perto ou abaixo de 1,5 MB.

A arte public/assets/bola-impressa.webp foi gerada com ImageGen a partir do convite original como referência de estilo.

### Prompt de geração da bola

> The reference shows a printed Brazilian football birthday invitation. Create ONLY an isolated entire classic stitched pentagon soccer ball as a PNG cutout on completely transparent background. Match the handmade one-ink dark forest green and warm ivory printed linocut in the ball at the lower right of the reference. View slightly off-center from above with the center pentagon, fine engraving grain and hairline seam highlights. Strong paper silhouette that still reads at 56 pixels. No border, no cast shadow, no floating debris, no text, no arrows, no background. Show the entire circular ball with a little transparent padding so it can be placed partly outside a card and reused as a movable game piece.
