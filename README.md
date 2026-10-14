# CORTEX IA

Dashboard empresarial que roda **no próprio computador** — com login por organização, indicadores financeiros e de vendas, modo TV para o escritório e um assistente de IA local (Ollama) que responde perguntas sobre os números da empresa.

> Começa com uma empresa fictícia (Grupo Valmar) para testar. Na primeira importação de planilha os dados de demonstração são substituídos pelos seus.

## Requisitos

- [Node.js](https://nodejs.org) 20 ou mais novo
- (Opcional) [Ollama](https://ollama.com) para a IA responder perguntas livres

## Como rodar

```bash
npm install
npm start
```

Abra **http://localhost:3210** e entre com:

| Organização | E-mail | Senha |
|---|---|---|
| `grupo-valmar` | `marina@grupovalmar.com.br` | `cortex2026` |

Na primeira execução o Cortex cria o banco (`data/cortex.db`) com 13 meses de dados fictícios.

### Modo TV

- Neste computador: `npm run tv` (abre o Chrome/Edge em tela cheia) ou acesse `http://localhost:3210/tv`.
- Em outra TV/PC da mesma rede: use o endereço “Na rede (TVs)” que aparece no terminal + `/tv`.

As telas giram sozinhas (30 s a 5 min, configurável) e o widget do Cortex AI passa pelas perguntas frequentes. No Assistente, o botão **Enviar para a TV** mostra a resposta em destaque nas telas conectadas.

### IA local (Ollama)

```bash
ollama pull qwen2.5:7b
ollama serve
```

O modelo e o endereço podem ser trocados em **Configurações**. Sem o Ollama, as 7 perguntas frequentes continuam funcionando com respostas automáticas.

**Como a IA funciona:** ela nunca faz contas. O modelo escolhe uma “ferramenta” (`comparar_periodos`, `top_produtos`, `clientes_em_queda`…), o Node calcula os números no SQLite e a IA só explica o resultado.

## Seus dados

- **Importação e backup › Importar planilha:** envie `.xlsx` ou `.csv` de vendas, despesas, contas a pagar/receber ou metas. O Cortex detecta o tipo, sugere o mapeamento das colunas, mostra as linhas com erro e só então importa. Baixe os modelos na mesma tela.
- **Importação automática:** aponte uma pasta (por exemplo, onde o ERP exporta) e o Cortex importa sozinho os arquivos novos. Pedidos com o mesmo número não são duplicados.
- **Backup:** automático todo dia (horário e pasta configuráveis — use um pendrive ou HD externo), manual em um clique e restauração pela mesma tela.
- **Metas:** por mês, por vendedor e por categoria, com previsão de fechamento do mês no ritmo atual.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Compila a interface (na 1ª vez) e sobe o servidor |
| `npm run dev` | Modo desenvolvimento (Vite + servidor com reload) |
| `npm run tv` | Abre o modo TV em tela cheia |
| `npm run seed` | Recria os dados de demonstração |
| `npm run org:create -- --slug minha-empresa --name "Minha Empresa" --admin "Nome" --email voce@empresa.com --password senha1234` | Cria outra organização com login próprio |
| `npm test` | Testes (inclui a IA com um Ollama simulado) |

## Estrutura

```
server/        Express + SQLite (better-sqlite3)
  metrics.js   todos os cálculos (faturamento, margem, curva ABC, metas…)
  ai.js        Ollama com tool calling
  answers.js   respostas automáticas das perguntas frequentes
  services.js  insights, relatórios, agendamentos e canal ao vivo da TV
client/        React + Vite (telas do app e modo TV)
data/          banco local (não vai para o Git)
```

Variáveis opcionais: `PORT` (padrão 3210), `HOST` (padrão `0.0.0.0`, para as TVs da rede acessarem), `CORTEX_DATA_DIR`.
