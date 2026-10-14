# Concluir correções de Mochilas e pedidos

## Implementação
- Estabilizar o primeiro carregamento de Mochilas com estados claros de carregamento/erro, datas seguras e atualizações restritas aos dados afetados.
- Tornar a limpeza da mochila resiliente a falhas parciais, atualizando a tela mesmo quando algum item não puder ser devolvido.
- Destacar a janela vigente de entrega na tela do funcionário e impedir aprovação administrativa antes do horário disponível.
- Preservar o horário original dos pedidos feitos offline para calcular corretamente a entrega quando sincronizarem.

## Validação
- Conferir Mochilas e Pedidos no navegador, incluindo carregamento inicial e horário bloqueado.
- Executar os testes automáticos disponíveis e revisar erros de execução.

## Detalhes técnicos
- Manter a assinatura pública completa de `create_material_request_by_token` e suas permissões atuais.
- Usar o `createdAt` já armazenado na fila IndexedDB como horário original do pedido, sem criar uma segunda assinatura ambígua.
