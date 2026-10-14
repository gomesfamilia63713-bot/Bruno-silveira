# Concluir insumos e lançamentos múltiplos

## Implementação
- Melhorar a área de materiais das obras abertas com seleção rápida, foco imediato na quantidade e histórico semanal detalhado por data e hora.
- Permitir adicionar várias tarefas de produção a uma lista temporária e salvar todas em uma única ação, preservando funcionários, rateios, horários, descrição e obra aberta.
- Manter as correções já aplicadas na sincronização e atualização das fotos de ponto.

## Validação
- Verificar os fluxos no navegador em tela ampla e celular.
- Executar a checagem automática de tipos e confirmar que as páginas abrem sem erros.

## Detalhes técnicos
- Reutilizar `obra_extras` como histórico temporal, criando uma nova linha por atualização em vez de sobrescrever registros anteriores.
- Salvar cada tarefa de produção com seu próprio snapshot de participantes e rateios; em caso de falha parcial, manter na lista apenas o que ainda não foi salvo.
