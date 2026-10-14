# Sincronização automática por conectividade

## Objetivo
Garantir que a tela de ponto envie imediatamente todos os registros pendentes quando o celular recuperar internet, por Wi‑Fi ou dados móveis.

## Implementação
- Criar um único sincronizador da tela de ponto, guiado por `navigator.onLine` e pelos eventos `online`/`offline`.
- No evento `online`, esvaziar em segundo plano e em paralelo as filas IndexedDB de pontos com foto/áudio e de pedidos/devoluções.
- Repetir a tentativa ao abrir/focar a tela e em intervalo de segurança enquanto houver conexão, sem execuções duplicadas.
- Atualizar imediatamente os contadores de pendências, o estado Online/Offline e os dados de estoque/responsabilidade após cada sincronização.
- Preservar registros com erro de validação para revisão e manter na fila somente falhas temporárias de conexão.

## Validação
- Simular offline, registrar ponto/pedido/devolução e confirmar armazenamento local.
- Restaurar a conexão e confirmar envio automático sem botão manual.
- Verificar que fotos e áudios seguem junto ao ponto e que os contadores chegam a zero sem duplicações.
