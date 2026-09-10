# Convencoes deste projeto

- O dono do projeto **nao programa** e opera tudo pela interface web. Toda mudanca e feita aqui.
- **Nunca commitar ou dar push sem pedido explicito.** Quando for pedido, commitar e pushar na hora.
- Respostas ao dono em **portugues**, focadas no efeito pratico - detalhes de implementacao so quando
  ele pedir.
- Comentarios no codigo **so quando explicam um "porque" nao obvio**, em portugues.
- **Sempre rodar `npm test`** antes de dar uma tarefa como concluida.

## Regras tecnicas que nao podem ser quebradas

1. O papel da sessao (admin / transmissor / espectador) e **sempre** resolvido no servidor pela
   sessao. Nunca aceitar papel, roomId de espectador ou identidade vindos do cliente. Toda
   identificacao limpa os papeis anteriores (`setRole` em `lib/sessionRoles.js`).
2. O transmissor **sempre** cria a oferta; espectador e admin sempre respondem.
3. Uma `RTCPeerConnection` **por par** transmissor-espectador. Nunca compartilhar conexao.
4. ICE candidates que chegam antes da `remoteDescription` vao para a fila, nunca sao descartados.
5. Nunca confiar em `connectionState === "connected"` para dizer "ao vivo": vale o watchdog de
   `getStats()` com progresso real de `framesDecoded` / `bytesReceived`.
6. Toda mensagem de sinalizacao que envolve o admin carrega `roomId` explicito (um socket dele
   atende varias salas).
7. O admin monitorando entra como `isAdminMonitor: true` e e **invisivel**: nao aparece em nenhuma
   contagem, lista, rotulo ou campo serializado que chegue ao transmissor ou aos espectadores. Para
   o transmissor vai apenas `hidden: true` com rotulo neutro, o minimo para abrir a conexao WebRTC.
8. Tokens: so o hash sha256 vai para o banco. Nunca persistir o valor puro.
9. Credenciais TURN nunca no HTML - so por `/api/ice-servers`, com sessao identificada.
10. Este projeto **nao tem** nada de prova, exame, questoes, fiscal, aluno ou cronometro de prova.
