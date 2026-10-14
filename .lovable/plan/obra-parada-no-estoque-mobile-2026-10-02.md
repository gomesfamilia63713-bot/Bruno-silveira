# Obra parada no estoque mobile

## Alterações
- Exibir `caracteristicas` imediatamente abaixo do nome nos cards mobile, com texto menor e contraste secundário.
- Incluir “Obra Parada / Sem expediente no local” na seleção do modal mobile.
- Ao escolher essa condição, ocultar o responsável e exigir uma justificativa; nas obras normais, manter o responsável obrigatório.
- Mostrar no card o estado de obra parada e sua justificativa, preservando a tabela e o fluxo desktop.

## Persistência e segurança
- Acrescentar campos próprios à alocação para condição de obra parada e justificativa, sem apagar a obra física atual do item.
- Estender a rotina atômica administrativa de remanejamento para validar no banco: obra e responsável em fluxo normal; justificativa e responsável vazio em obra parada.
- Limpar a condição e a justificativa ao retornar o item para uma obra normal, mantendo auditoria e atualização instantânea entre telas.

## Validação
- Testar no celular os dois caminhos: remanejamento normal e obra parada.
- Confirmar fechamento do modal, mensagem de sucesso, atualização imediata do card e persistência após recarregar.
- Verificar que o fluxo de computador permanece inalterado e que o projeto continua sem erros.
