# Abas do ponto e fotos no estoque mobile

## Alterações
- Organizar a tela individual em duas abas no topo: ponto/justificativas/histórico e itens/solicitações, sem alterar câmera, filas offline, pedidos ou devoluções.
- Manter o conteúdo carregado e responsivo ao trocar de aba, incluindo o histórico recente do próprio funcionário pelo link individual.
- No estoque mobile, esconder os atalhos administrativos do topo e manter somente título, localização e uma busca unificada por nome, código, obra ou responsável.
- Adicionar miniatura em cada card mobile; ao tocar, abrir a foto ampliada e permitir enviar uma nova foto pelo celular.
- Preservar integralmente filtros, tabela e ações atuais no computador.

## Detalhes técnicos
- Reutilizar os componentes de abas, diálogos, armazenamento de fotos e atualizações do inventário já existentes.
- A busca mobile combinará dados do item com obra e responsável, sem alterar os filtros desktop.
- A atualização da foto gravará a URL no item e invalidará os dados compartilhados para aparecer imediatamente nas demais telas.
- O histórico do funcionário será exposto somente após validação do token individual, sem liberar a tabela de pontos diretamente.
- Validar em celular e computador, além do carregamento sem erros.
