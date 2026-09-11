# Tela Bombeiros

Plataforma de **transmissao de tela ao vivo** com **central de monitoramento**.

- Qualquer pessoa abre uma sala e comeca a compartilhar a tela.
- Ao abrir a sala, o sistema gera um **link de convite** para mandar a quem vai assistir.
- O **administrador** tem painel proprio: ve as salas ativas, assiste varias ao mesmo tempo na
  central de monitoramento, encerra salas, revoga convites e edita a identidade visual do site.

## Como rodar

```bash
npm install
cp .env.example .env   # preencha MONGODB_URI, SESSION_SECRET e ADMIN_PASSWORD
npm start
```

Abra `http://localhost:3000`.

Testes: `npm test` (nao precisa de banco).

## Variaveis de ambiente

| Variavel | Para que serve |
| --- | --- |
| `MONGODB_URI` | Conexao do MongoDB Atlas. Obrigatoria. |
| `SESSION_SECRET` | Segredo do cookie de sessao. Troque por um valor longo e aleatorio. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Login do administrador. |
| `ADMIN_PASSWORD_HASH` | Alternativa mais segura (hash bcrypt); tem prioridade sobre `ADMIN_PASSWORD`. |
| `PUBLIC_URL` | Endereco publico do site, usado para montar os links de convite. |
| `STUN_URLS` | Servidores STUN, separados por virgula. |
| `TURN_URLS` | Servidores TURN, separados por virgula. |
| `TURN_SECRET` / `TURN_TTL` | Credencial TURN efemera (coturn "use-auth-secret"). |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Credencial TURN fixa (Open Relay, Metered e afins). |

### Sobre o TURN

Sem TURN, quem estiver atras de NAT ou firewall restritivo **nao consegue conectar** - o video
simplesmente nunca aparece. O sistema avisa no log quando sobe sem TURN configurado. Basta um dos
dois formatos de credencial: `TURN_SECRET` (servidor proprio) ou `TURN_USERNAME` + `TURN_CREDENTIAL`
(provedor pronto). As credenciais nunca ficam no HTML: saem por `/api/ice-servers`, geradas na hora e
so para quem tem sessao identificada.

## Deploy no Render

1. Crie um Web Service apontando para este repositorio.
2. Build command: `npm install` - Start command: `npm start`.
3. Preencha as variaveis de ambiente da tabela acima (inclusive `PUBLIC_URL`).

O disco do Render e efemero: **arquivos enviados pelo painel somem a cada atualizacao do sistema**.
Por isso logo, imagem de fundo e video podem ser configurados de duas formas - upload ou link externo.
Para algo permanente, prefira o link externo.

## Como funciona por dentro

### Papeis e sessao

Um navegador so pode ter **um papel por vez**: administrador, transmissor ou espectador. O papel e
sempre resolvido no servidor a partir da sessao (cookie) - nunca aceito como campo vindo do cliente -
e toda identificacao limpa explicitamente os papeis anteriores (`lib/sessionRoles.js`). Sem isso,
testar o link de espectador no mesmo navegador em que o admin esta logado quebraria a transmissao em
silencio.

### Sinalizacao WebRTC

- O **transmissor sempre cria a oferta**; espectador e admin sempre respondem. Nunca inverte.
- **Uma `RTCPeerConnection` por par transmissor-espectador**. Se a conexao de um cair, as outras
  seguem intactas.
- **Entrada tardia**: espectador que chega depois e apresentado ao transmissor na hora, que abre uma
  conexao nova so para ele.
- **Fila de ICE candidates**: candidates que chegam antes da `remoteDescription` ficam na fila e sao
  aplicados depois - nunca descartados.
- **Backoff de renegociacao** no servidor (`lib/renegotiation.js`): 5 tentativas em 2 minutos por par;
  passou disso, o servidor para de repassar e sinaliza que precisa de intervencao manual.
- **Watchdog de video congelado** (`public/js/rtc.js`): `connectionState === "connected"` nao prova
  nada. A cada 5s o receptor le `pc.getStats()` e so mostra "ao vivo" quando `framesDecoded` /
  `bytesReceived` do `inbound-rtp` de video realmente avancam. Tres checagens sem progresso (~15s)
  disparam um pedido de renegociacao sozinho.

### Central de monitoramento

Um **unico socket** do admin assiste **varias salas ao mesmo tempo**. O `socket.id` do admin e usado
como identificador de espectador em cada sala, e como esse mesmo id passa a existir em varias salas,
toda mensagem de sinalizacao do admin carrega o `roomId` explicito. No cliente ha uma
`RTCPeerConnection` por sala observada, indexada por `roomId`. O admin entra como
`isAdminMonitor: true` e por isso fica **fora da contagem de espectadores** do painel.

### Estado ao vivo

`lib/liveState.js` guarda presenca e status da transmissao **so na memoria do processo**: e situacao
de agora, nao historico. Um restart apaga sem prejuizo. Cada mudanca emite um evento que atualiza o
painel do admin por socket - nunca por polling.

### Identidade visual

Existem dois niveis, e o de baixo sempre sobrepoe o de cima:

1. **Do site**, editavel pelo admin: cores, nome, frase, logo, fundo, video, efeitos e a
   **quantidade de fagulhas** (barra de 0 a 100 no painel).
2. **Da sala**, editavel pelo dono da sala no botao "Identidade visual": cores, logo e imagem de
   fundo, validos **apenas naquela sala**.

Campo vazio na sala significa "usar o do site". Ao salvar, o servidor emite `room:branding` para o
canal da sala e **todo mundo que ja esta conectado muda de aparencia na hora**, sem recarregar. A
mesclagem (`mergeBranding` em `lib/branding.js`) nunca altera o objeto global - e isso que impede a
aparencia de uma sala de vazar para outra.

O painel do admin mantem a identidade do site mesmo enquanto monitora salas, porque um so painel nao
pode assumir a aparencia de varias salas ao mesmo tempo.

### Cartao de compartilhamento

As marcas Open Graph da pagina inicial sao injetadas **no servidor** (`lib/socialCard.js`), porque
robo de Discord, WhatsApp e Telegram nao executa JavaScript. Titulo e descricao saem do nome e da
frase do site; a imagem sai de `shareImageUrl` (ou do logo, se vazia); a cor da marca vira o
`theme-color`, que o Discord usa na barra lateral do cartao.

Paginas de sala nao recebem essas marcas de proposito: o nome da sala nao deve aparecer em previa de
mensagem quando o link de convite e colado num grupo.

Tamanho recomendado da imagem do cartao: **1200x630**.

### Remover um espectador

O dono da sala pode desconectar um espectador pela lista. A sessao dele fica bloqueada **naquela
sala** (em memoria, `liveState.blockSession`) para ele nao voltar recarregando a pagina. Nao e
banimento permanente: reinicio do servidor limpa, e outro navegador com o mesmo link entra de novo.
Para remocao definitiva, revogue o link de convite.

### Tokens

Do token do transmissor e de cada convite so o **hash sha256** vai para o banco, igual senha. O valor
puro aparece uma unica vez, na hora que o link e criado. Perder o link exige gerar outro - o que nao
derruba quem ja esta conectado.

## Estrutura

```
server.js              Express + Socket.io + sessao
lib/                   sessao/papeis, tokens, estado ao vivo, TURN, backoff, sinalizacao
models/                Room, Branding
routes/                paginas, API de salas, API do admin
public/                frontend sem build (HTML/CSS/JS puro)
  shared/              tema, luz do cursor, fagulhas, utilitarios
  js/                  rtc.js (WebRTC), transmitter.js, viewer.js, admin.js
test/                  node --test, sem banco
```
