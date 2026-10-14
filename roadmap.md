# Tarefas

## EPI em Ferramentas
- [ ] Padronizar EPI com os controles compartilhados de estoque no celular e computador
- [ ] Centralizar EPIs existentes e classificar automaticamente novos registros sem duplicar ferramentas
- [ ] Validar remanejamento, conferência, lote e atualização remota de EPI
- [x] Criar cadastro com CA, característica, saldo inicial, validade e fotos
- [x] Registrar entrega por funcionário com baixa atômica e sincronização
- [x] Descartar com liberação de código e histórico de durabilidade
- [x] Validar cadastro, entrega, descarte e fotos no celular e computador

## Lançamento de produção por voz
- [x] Adicionar microfone com reconhecimento pt-BR, parada e transcrição editável (eventos simulados; microfone físico não verificado)
- [x] Integrar interpretação da fala ao formulário, sem salvamento automático e com erros visíveis
- [x] Validar revisão manual, salvamento e atualização entre duas sessões; habilitar Realtime dos participantes
- [x] Substituir interpretação paga por regras locais: números e unidades testados; preenchimento com cadastros reais e fala simulada em pt-BR validado sem chamadas de IA (microfone físico não verificado)

- [x] Corrigir o aviso travado em “Sincronizando dados”.
- [x] Atualizar automaticamente as fotos de ponto na ficha do funcionário.
- [x] Adicionar histórico semanal de insumos nas obras abertas.
- [x] Permitir salvar múltiplas tarefas na Produção.
- [x] Exigir destino Obra ou Mochila nos pedidos do funcionário.
- [x] Registrar o destino na baixa do estoque e evitar movimentação duplicada na aprovação.
## Correções críticas integradas
- [x] Estabilizar ponto online/offline e fotos na ficha
- [x] Remover card Ficha da lista geral de funcionários
- [x] Consolidar destino Obra/Mochila com débito e rastreabilidade
- [x] Garantir devolução idempotente sem inflar estoque

## Pedidos online e fotos instantâneas
- [x] Tentar pedidos e devoluções online antes de usar a fila offline
- [x] Sincronizar a fila imediatamente ao recuperar a conexão
- [x] Destacar e atualizar em tempo real a foto mais recente na ficha
- [x] Manter o nome do funcionário como acesso direto à ficha individual

## Produção e justificativa de ponto
- [x] Consolidar produção individual por m³, m² e m
- [x] Gravar justificativa por áudio com transcrição e fila offline
- [x] Exibir áudio e transcrição no histórico de 30 dias
- [x] Validar os fluxos no celular e no painel Admin

## Acesso à ficha do funcionário
- [x] Abrir a ficha ao clicar no nome na faixa de funcionários ou no cartão individual
- [x] Estabilizar o relógio da tela de ponto durante a abertura

## Sincronização automática por conectividade
- [x] Unificar o envio das filas de ponto, foto, áudio, pedidos e devoluções
- [x] Sincronizar imediatamente nos eventos online e ao retomar o aplicativo
- [x] Atualizar contadores e dados de estoque após a sincronização

## Mochilas e horários de entrega
- [x] Estabilizar o primeiro carregamento da aba Mochilas sem depender do cache
- [x] Atualizar a mochila mesmo quando uma devolução em lote falhar parcialmente
- [x] Destacar a janela vigente de entrega para o funcionário
- [x] Preservar o horário original de pedidos offline e bloquear aprovação antecipada
- [x] Liberar a função completa de pedidos e devoluções para o link individual

## Estabilidade e atualização do aplicativo
- [x] Remover scripts e estilos antigos do cache duradouro
- [x] Aplicar automaticamente cada nova versão publicada
- [x] Recuperar uma única vez falhas de carregamento de módulos
- [x] Preservar os links individuais e o funcionamento offline

## Carregamento inicial sem cache antigo
- [x] Versionar automaticamente o shell a cada publicação
- [x] Unificar a proteção contra recargas duplicadas
- [x] Recuperar importações dinâmicas sem tela branca
- [x] Validar o primeiro acesso e a navegação principal

## Envio do ponto ao painel administrativo
- [x] Corrigir o envio online da foto e o registro atômico do ponto
- [x] Preservar o ponto na fila offline quando o envio falhar temporariamente
- [x] Confirmar a atualização da foto na ficha administrativa

## Conferência mobile de estoque
- [x] Simplificar os cards de celular para nome, código, obra e responsável
- [x] Confirmar vistoria e remover o item dos alertas compartilhados
- [x] Permitir remanejamento e saída pelo fluxo móvel existente
- [x] Validar a conferência no celular e preservar a tabela do computador

## Simplificação visual mobile do estoque
- [x] Ocultar totais, pesquisa, filtros e cadastro rápido no celular
- [x] Compactar os cards mobile mantendo as ações essenciais
- [x] Validar o estoque no celular e confirmar os controles completos no computador

## Abas do ponto e fotos no estoque mobile
- [x] Separar ponto/histórico e itens/solicitações em duas abas
- [x] Exibir histórico recente com validação do link individual
- [x] Criar busca mobile por nome, código, obra e responsável
- [x] Adicionar miniatura, ampliação e atualização de foto nos cards mobile
- [x] Validar ponto e estoque no celular e no computador

## Correção do remanejamento mobile
- [x] Salvar obra e responsável de forma atômica no banco
- [x] Fechar o modal e atualizar os cards após confirmação
- [x] Validar o fluxo mobile de remanejamento

## Lista diária de produção
- [x] Substituir o gráfico pela lista de registros do dia
- [x] Adicionar seleção de data no topo da lista
- [x] Exibir serviço, funcionário, obra e quantidade executada
- [x] Validar a lista no celular e no computador

## Obra parada no estoque mobile
- [x] Exibir característica logo abaixo do nome no card mobile
- [x] Adicionar opção Obra Parada com justificativa obrigatória
- [x] Persistir condição e justificativa no remanejamento atômico
- [x] Exibir a justificativa no card e validar o fluxo mobile

## Alocação simplificada no estoque mobile
- [x] Mostrar somente quantidade, obra e responsável para itens no Estoque Central
- [x] Preencher automaticamente os dados técnicos da movimentação
- [x] Validar alocação unitária e de lote no celular

## Ciclo de vida e sincronização do inventário
- [x] Sincronizar estoque, alertas, manutenção, conferência e descarte entre dispositivos
- [x] Exigir justificativa para retirar um item da manutenção no celular e computador
- [x] Registrar entrada em operação e descarte, liberando o código do item descartado
- [x] Substituir a exclusão de obra pela transferência integral com histórico
- [x] Validar os quatro fluxos no celular e no computador

## Códigos únicos e fotos de ativos
- [x] Bloquear novas duplicações no banco sem alterar códigos ativos existentes
- [x] Validar códigos no cadastro, edição e importações com mensagem clara
- [x] Compartilhar miniatura e atualização de foto entre estoque e ativos
- [x] Conferir bloqueio e fotos no celular e computador
- [ ] Aplicar UNIQUE diretamente em items.codigo: aguarda correção dos dois itens ativos com código 17.2

## Estoque mobile e alertas compartilhados
- [x] Persistir conferência e limpar alertas entre dispositivos via Realtime
- [x] Destacar características abaixo do nome em todas as listagens de itens
- [x] Adicionar Obras no Estoque mobile com Atualizar e Confirmar compartilhados
- [x] Validar celular, computador, Obras e remoção persistente de alertas em sessões simultâneas
- [ ] Garantir ausência de atraso entre dispositivos: depende da entrega dos eventos e conexão; no teste o alerta remoto desapareceu em cerca de 10 segundos, portanto não há garantia de instantaneidade absoluta.
