# Conferência mobile de estoque

## Implementação
- Substituir apenas a visualização de celular do Estoque e Materiais por cards simples com nome, código, obra atual e responsável; manter a tabela de computador intacta.
- Adicionar “Confirmar” para registrar a vistoria, retirar imediatamente o item dos alertas compartilhados e atualizar os dados do estoque em segundo plano.
- Adicionar “Atualizar” com uma ficha mobile para trocar obra e responsável usando as movimentações existentes, além de oferecer a mesma saída de estoque já usada no computador.
- Preservar atualização instantânea entre abas e mensagens claras de sucesso ou erro.

## Validação
- Conferir no celular os cards, a confirmação, a troca de obra/responsável e a saída.
- Conferir em tela ampla que a tabela e suas ações permanecem inalteradas.
- Executar as verificações automáticas do projeto.

## Detalhes técnicos
- Reutilizar as rotinas atômicas existentes para transferência, posse e saída; não criar uma segunda lógica de estoque.
- Registrar a confirmação na auditoria existente e sincronizar os alertas pelo estado compartilhado atual.
