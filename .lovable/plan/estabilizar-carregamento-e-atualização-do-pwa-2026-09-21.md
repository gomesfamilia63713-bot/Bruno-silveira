# Estabilizar carregamento e atualização do PWA

## Implementação
- Ajustar o cache do aplicativo para que arquivos versionados sejam renovados a cada publicação, sem alterar os links individuais dos funcionários.
- Registrar atualizações em segundo plano e ativá-las automaticamente quando o novo conteúdo estiver pronto.
- Detectar falhas de carregamento de módulos e fazer uma única recuperação segura, evitando telas brancas e ciclos de recarga.
- Manter o modo offline e as filas locais de ponto, fotos, áudios, pedidos e devoluções.

## Validação
- Conferir a inicialização e a navegação entre Painel e Mochilas na prévia.
- Simular uma falha de módulo e confirmar a recuperação única.
- Revisar o registro do aplicativo para garantir que ele permaneça desativado na prévia e ativo somente na versão publicada.

## Detalhes técnicos
- Usar o ciclo de atualização suportado pelo plugin PWA, sem Service Worker artesanal.
- Usar estratégia de rede primeiro para navegações e impedir cache duradouro de scripts e estilos antigos.
- Preservar `start_url`, `id`, `scope` e os tokens `?u=` já distribuídos.
