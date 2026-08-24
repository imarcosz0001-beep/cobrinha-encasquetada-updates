# Atualizações — Cobrinha Encasquetada

Canal público de atualização do addon **Cobrinha Encasquetada** para Slither.io.

Este repositório contém:

- `addon-update.json`: versão Estável e notas da atualização;
- `addon-update-beta.json`: versão em teste no canal Beta;
- `Cobrinha-Encasquetada-vNN.zip`: pacote instalável daquela versão.

O addon consulta o manifesto uma única vez ao abrir o jogo. O aviso só aparece quando a versão publicada é superior à instalada.

## Promover um Beta para Estável

Somente colaboradores com permissão de escrita podem usar o botão privado:

1. Abra a aba **Actions** deste repositório.
2. Selecione **Promover Beta para Estável**.
3. Clique em **Run workflow**.
4. Informe a versão Beta exata e digite `PROMOVER`.
5. Confirme em **Run workflow**.

O processo recusa versões antigas, URLs mutáveis, pacotes externos, SHA-256 divergente e ZIP cuja
versão interna não corresponda ao Beta. Quando tudo estiver correto, o mesmo pacote é promovido para
o canal Estável, preservando os dados da versão anterior para retorno manual.

## Instalação manual

1. Baixe o arquivo indicado em `download_url` dentro de `addon-update.json`.
2. Extraia o arquivo em uma pasta permanente.
3. Abra `chrome://extensions`.
4. Ative o **Modo do desenvolvedor**.
5. Use **Carregar sem compactação** e selecione a pasta extraída.
