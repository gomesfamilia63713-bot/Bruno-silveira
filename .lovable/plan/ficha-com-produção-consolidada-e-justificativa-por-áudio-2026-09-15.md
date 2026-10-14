# Ficha com produção consolidada e justificativa por áudio

## Objetivo
- Consolidar na ficha de cada funcionário a produção acumulada por unidade: m³, m² e m.
- Permitir registrar um ponto justificado com texto digitado ou áudio transcrito na tela individual do funcionário.
- Exibir o áudio, a transcrição, data, hora e localização no histórico de 30 dias do Admin, no lugar da foto desse registro.

## Implementação
1. **Produção consolidada**
   - Reutilizar os lançamentos já vinculados ao funcionário.
   - Normalizar variações de unidade e somar separadamente m³, m² e m, sem misturar grandezas.
   - Mostrar três totais claros acima da listagem e manter os lançamentos detalhados abaixo.

2. **Registro justificado no Ponto**
   - Adicionar uma seção específica para “Ponto com justificativa”.
   - Permitir escolher Entrada ou Saída, digitar a justificativa e gravar/parar/reproduzir áudio pelo microfone.
   - Transcrever automaticamente a fala quando houver internet; offline, guardar áudio e dados completos no celular para envio posterior.
   - Exigir uma justificativa textual, digitada ou obtida pela transcrição, antes do registro.
   - Manter câmera e ponto com foto como fluxo normal separado.

3. **Áudio, dados e segurança**
   - Criar armazenamento privado para os áudios e campos no registro de ponto para caminho do áudio e transcrição.
   - Autorizar envio somente por link individual válido e leitura somente no painel autenticado.
   - Criar uma chamada protegida no servidor para transcrição pelo Lovable AI, sem expor credenciais no celular.
   - Validar formato e tamanho do áudio, manter idempotência pelo identificador do registro e preservar a fila offline.

4. **Histórico do Admin**
   - Gerar links temporários para fotos e áudios privados.
   - Para registros justificados por áudio, renderizar player, transcrição/justificativa e metadados; não renderizar espaço de foto.
   - Atualizar automaticamente a ficha quando o registro sincronizar.

5. **Validação**
   - Verificar tipagem e o envio online/offline.
   - Testar no navegador a gravação justificada e a ficha em telas móvel e desktop.
   - Testar a integração real de transcrição com uma amostra de fala antes de concluir.

## Detalhes técnicos
- O áudio será capturado como WAV completo para evitar arquivos incompatíveis em celulares.
- A transcrição usará o modelo padrão de fala para texto e resposta em fluxo contínuo.
- Registros normais continuam com foto carimbada; somente o ponto criado pela seção de justificativa usa áudio no lugar da foto.
