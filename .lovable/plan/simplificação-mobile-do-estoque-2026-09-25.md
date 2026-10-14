# Simplificação mobile do Estoque

## Alterações
- Ocultar no celular os cards de totais, pesquisa, categoria, status, responsável e cadastro rápido.
- Manter esses controles e a tabela atual visíveis e inalterados a partir da versão de computador.
- Compactar os cards mobile para priorizar nome, código, obra e responsável.
- Preservar somente as ações essenciais: confirmar vistoria, atualizar remanejamento e registrar baixa.

## Detalhes técnicos
- Aplicar visibilidade responsiva apenas aos blocos superiores existentes, sem alterar estados, consultas ou regras de estoque.
- Ajustar espaçamentos e hierarquia visual do `MobileInventoryCard`, reutilizando os diálogos e operações atuais.
- Validar em largura de celular e computador para confirmar que os controles desktop continuam disponíveis.
