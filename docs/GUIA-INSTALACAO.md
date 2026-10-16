# Cortex IA — guia de instalação

Guia para instalar o Cortex IA num computador Windows, sem precisar de terminal.

## O que é

O Cortex IA é um painel da empresa que roda num computador do escritório, com faturamento, lucro, metas, fluxo de caixa, vendedores e alertas, e um modo TV para as telas do escritório. Todos os dados ficam nesse computador; nada vai para a internet.

A instalação leva cerca de 15 minutos. Ele já vem com uma empresa fictícia para testar antes de colocar os dados reais.

## O que precisa

| Item | Detalhe |
| --- | --- |
| Computador | Windows 10 ou 11, que fique ligado no horário de trabalho |
| Memória | 4 GB de RAM livres (16 GB no total se for usar a IA) |
| Node.js | Versão LTS, gratuito, em [nodejs.org](https://nodejs.org/pt/download) |
| Internet | Só durante a instalação; depois funciona offline |
| Navegador | Chrome ou Edge |

## Instalação

1. Instale o **Node.js** em [nodejs.org](https://nodejs.org/pt/download): baixe a versão **LTS** e avance o instalador sem mudar nada.
2. Abra [github.com/LorenzoCostap/cortex-ia](https://github.com/LorenzoCostap/cortex-ia) e clique em **Code › Download ZIP**.
3. Clique com o botão direito no ZIP › **Extrair tudo** e escolha uma pasta fixa, por exemplo `C:\Cortex`. Não deixe em Downloads: se a pasta for movida ou apagada, o sistema para de abrir.
4. Na pasta extraída, dê **dois cliques em `instalar.bat`**.
    - Se o Windows mostrar “O Windows protegeu o computador”, clique em **Mais informações › Executar assim mesmo**.
    - Ele pergunta se o computador fica ligado numa TV. Responda **S** só se for o PC da TV (abre o modo TV em tela cheia ao ligar).
5. Espere a mensagem **“Pronto! O Cortex está instalado”**. O navegador abre sozinho.

A partir daí o Cortex abre sozinho sempre que o Windows liga, e ficam dois atalhos na Área de trabalho: **Cortex IA** (painel) e **Cortex IA - Modo TV**.

## Primeiro acesso

Entre em **http://localhost:3210** (ou no atalho **Cortex IA**) com a conta de demonstração:

| Campo | Valor |
| --- | --- |
| Organização | `grupo-valmar` |
| E-mail | `marina@grupovalmar.com.br` |
| Senha | `cortex2026` |

Depois, deixe o sistema com a cara da empresa e sem a senha padrão:

1. **Configurações › Organização**: troque o nome da empresa e o identificador de login (ex.: `minhaempresa`). Salve.
2. **Administração › Convidar usuário**: crie o seu usuário com o papel **Administrador**. O sistema mostra uma senha temporária; no primeiro login ele obriga a criar uma senha própria.
3. Saia, entre com o seu usuário e, em **Administração**, use **Desativar acesso** na conta de demonstração (Marina) e nos outros usuários de exemplo.
4. Convide as demais pessoas. Papéis: **Administrador** (tudo), **Gestor** (tudo menos configurações e usuários), **Analista** (consulta e relatórios), **Visualizador** (só painel e vendas). O que cada papel vê pode ser ajustado em **Administração › Permissões**.

## Colocar os dados da empresa

Os dados entram por planilha (.xlsx ou .csv) em **Importação e backup › Importar planilha**. Na primeira importação, os dados fictícios são apagados e substituídos pelos da empresa.

Na pasta [`exemplos`](../exemplos/) do Cortex há quatro planilhas no formato certo para usar de modelo, importadas nesta ordem:

| Planilha | Colunas obrigatórias | Recomendadas |
| --- | --- | --- |
| 1. Vendas (uma linha por item vendido) | Data, Cliente, Produto, Quantidade, Valor | **Custo unitário**, Pedido, Categoria, Vendedor, Região |
| 2. Despesas | Data, Categoria, Valor | Descrição |
| 3. Contas a pagar e receber | Tipo (pagar/receber), Parceiro, Vencimento, Valor | Pago em |
| 4. Metas | Mês, Meta | Vendedor ou Categoria |

Os nomes das colunas não precisam ser iguais: o Cortex reconhece variações (“Qtde”, “Vl Total”, “Razão social”) e mostra o mapeamento e as linhas com erro antes de importar. Sem o **custo unitário**, o custo da mercadoria é estimado em 70% do preço e o lucro fica aproximado, então vale incluir essa coluna.

Para não importar à mão toda vez, aponte em **Importação automática** a pasta onde o sistema da empresa salva as exportações; o Cortex importa sozinho os arquivos novos, sem duplicar pedidos.

## TVs do escritório

Instale o Cortex em **um computador só** e abra nas outras telas pelo navegador; assim todas mostram os mesmos dados.

1. No computador onde o Cortex está instalado, descubra o IP (no PowerShell: `ipconfig`, linha “Endereço IPv4”, ex.: `192.168.0.10`).
2. Na TV ou no outro PC, abra `http://192.168.0.10:3210/tv` e entre com um usuário (um Visualizador basta). Na primeira vez o Windows pode pedir para liberar o Node.js no firewall: permita em **rede privada**.
3. Em **Configurações › Modo TV › TVs cadastradas**, dê um nome para cada TV e escolha as telas dela; use o botão **Copiar link** de cada uma.
4. Para um recado no topo das TVs (reunião, meta do dia), use **Aviso nas TVs** no menu lateral, com prazo para sumir sozinho.

## Inteligência artificial (opcional)

Sem IA, o Cortex já responde às perguntas frequentes (queda do faturamento, produtos, clientes, margem, caixa, vendedores) com respostas automáticas. A IA serve para perguntas livres e roda **no próprio computador**, pelo programa gratuito Ollama: sem mensalidade e sem enviar dados para fora.

1. No computador do Cortex, instale o Ollama em [ollama.com/download](https://ollama.com/download).
2. No PowerShell, baixe o modelo uma vez (cerca de 4,7 GB): `ollama pull qwen2.5:7b`
3. Abra o **Assistente** no Cortex: o selo do topo fica verde, “Ollama · qwen2.5:7b · local”.

Precisa de uns 8 GB de RAM livres; sem placa de vídeo, cada resposta leva de 20 s a 1 min. Em computador mais simples, use `qwen2.5:3b` e troque o nome do modelo em **Configurações › Cortex AI**.

Se a empresa não permitir IA, desligue **Usar inteligência artificial** em **Configurações › Cortex AI**: o Cortex deixa de procurar o Ollama e o Assistente vira “Perguntas rápidas”, só com respostas automáticas.

## Dia a dia e problemas comuns

O **backup** é automático todo dia de madrugada, na pasta `data\backups`. Em **Importação e backup** dá para mudar o destino (um pendrive ou HD externo é o ideal) e restaurar uma cópia.

| Problema | O que fazer |
| --- | --- |
| O instalador avisa que o Node.js não está instalado ou é antigo | Instale a versão LTS em nodejs.org e rode o `instalar.bat` de novo |
| “Abra o arquivo fora do ZIP” | Extraia o ZIP (botão direito › Extrair tudo) e rode o `instalar.bat` da pasta extraída |
| Falha ao instalar as dependências | Confira a internet ou o proxy/antivírus da empresa e rode de novo |
| O atalho não abre nada | Use o atalho **Iniciar Cortex IA** na Área de trabalho; o motivo fica em `data\cortex.log` |
| A TV não abre pelo IP | Confira se o PC do Cortex está ligado e se o firewall liberou o Node.js na rede privada |
| Assistente diz “IA offline” | O Ollama está fechado: abra pelo menu Iniciar (ou desligue a IA, se não for usar) |

Para remover: dê dois cliques em `desinstalar.bat` (os dados da pasta `data` são mantidos) e depois apague a pasta.

Dúvidas ou problemas: falar com o Lorenzo.
