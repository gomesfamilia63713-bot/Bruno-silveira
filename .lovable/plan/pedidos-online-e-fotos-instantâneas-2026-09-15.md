# Pedidos online e fotos instantâneas

## Objetivo
Garantir envio imediato de pedidos/devoluções quando a conexão estiver realmente disponível e mostrar a foto mais recente do ponto assim que ela chegar.

## Implementação
- Tentar o envio de pedidos e devoluções diretamente sempre; usar a fila local somente para falhas reais de conexão e manter erros de validação visíveis.
- Ao reconectar, esvaziar a fila imediatamente e atualizar estoque, itens sob responsabilidade e contador de pendências.
- Manter o nome de cada funcionário como acesso direto à ficha individual.
- Destacar a foto mais recente no início da ficha e atualizar registros e URLs da foto em tempo real quando um novo ponto for salvo.
- Preservar o histórico completo, os links individuais e o funcionamento offline existente.

## Validação
- Verificar envio online sem entrada na fila e recuperação offline ao reconectar.
- Abrir uma ficha pelo nome e confirmar a atualização automática da foto mais recente.
- Validar as telas de funcionários e ponto em execução, sem erros.
