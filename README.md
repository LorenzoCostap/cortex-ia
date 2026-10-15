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

Na primeira execução o Cortex cria o banco (`data/cortex.db`) com 2 anos de dados fictícios.

### Modo TV

- Neste computador: `npm run tv` (abre o Chrome/Edge em tela cheia) ou acesse `http://localhost:3210/tv`.
- Em outra TV/PC da mesma rede: use o endereço “Na rede (TVs)” que aparece no terminal + `/tv`.

Em **Configurações › Modo TV › TVs cadastradas** dá para dar nome a cada TV e escolher as telas de cada uma; abra o link `/tv?tela=<id>` uma vez no navegador da TV e ela passa a lembrar. O botão **Aviso nas TVs** (menu lateral) publica um recado fixo no topo de todas as TVs ou só de algumas, com prazo.

As telas giram sozinhas (30 s a 5 min, configurável) e o widget do Cortex AI passa pelas perguntas frequentes. No Assistente, o botão **Enviar para a TV** mostra a resposta em destaque nas telas conectadas.

### IA local (Ollama)

```bash
ollama pull qwen2.5:7b
ollama serve
```

O modelo e o endereço podem ser trocados em **Configurações**. Sem o Ollama, as 7 perguntas frequentes continuam funcionando com respostas automáticas.

**Gráficos e voz:** as respostas trazem um mini gráfico quando ajuda (queda, comparação, produtos, clientes, margem, caixa). No Chrome/Edge dá para falar a pergunta pelo microfone (o áudio é transcrito pelo serviço do navegador, então precisa de internet) e ouvir as respostas (vozes do sistema, funciona offline).

**Como a IA funciona:** ela nunca faz contas. O modelo escolhe uma “ferramenta” (`comparar_periodos`, `top_produtos`, `clientes_em_queda`…), o Node calcula os números no SQLite e a IA só explica o resultado.

## Seus dados

- **Importação e backup › Importar planilha:** envie `.xlsx` ou `.csv` de vendas, despesas, contas a pagar/receber ou metas. O Cortex detecta o tipo, sugere o mapeamento das colunas, mostra as linhas com erro e só então importa. Baixe os modelos na mesma tela.
- **Importação automática:** aponte uma pasta (por exemplo, onde o ERP exporta) e o Cortex importa sozinho os arquivos novos. Pedidos com o mesmo número não são duplicados.
- **Backup:** automático todo dia (horário e pasta configuráveis — use um pendrive ou HD externo), manual em um clique e restauração pela mesma tela.
- **Metas:** por mês, por vendedor e por categoria, com previsão de fechamento do mês no ritmo atual.
- **Comparações:** Dashboard e Vendas comparam com o período anterior ou com o mesmo período do ano anterior (botão no topo). O gráfico do Dashboard alterna entre Receita × meta e Receitas × despesas.
- **Clientes:** em Vendas, clique num cliente (ou em “Clientes comprando menos” no Dashboard) para ver compras mês a mês contra o ano anterior, frequência, produtos que caíram, últimos pedidos e a leitura do Cortex.
- **Alertas:** o Cortex vigia clientes fora do ritmo, meta em risco, saldo abaixo do mínimo, contas vencidas e produtos em queda (a cada 15 minutos). O contador aparece no menu; as regras se ligam e desligam na própria tela.
- **Resumo diário por e-mail:** em Alertas, informe uma conta Gmail e uma [senha de app](https://myaccount.google.com/apppasswords) (exige verificação em duas etapas), os destinatários e o horário. O computador precisa estar ligado com o Cortex rodando no horário do envio.
- **Equipe comercial:** ranking dos vendedores contra a meta individual (com o traço de onde deveriam estar hoje), regiões e destaques da semana. Também vira uma tela da TV.
- **Fluxo de caixa:** informe o saldo de hoje e o mínimo de segurança; o Cortex projeta 30, 60 ou 90 dias com as contas a pagar e a receber e a média de vendas das últimas 12 semanas, avisa quando o saldo vai ficar abaixo do mínimo e permite dar baixa nas contas. Com o saldo informado, a TV mostra o saldo projetado.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Compila a interface (na 1ª vez) e sobe o servidor |
| `npm run dev` | Modo desenvolvimento (Vite + servidor com reload) |
| `npm run tv` | Abre o modo TV em tela cheia |
| `npm run seed` | Recria os dados de demonstração |
| `npm run org:create -- --slug minha-empresa --name "Minha Empresa" --admin "Nome" --email voce@empresa.com --password senha1234` | Cria outra organização com login próprio |
| `npm test` | Testes (inclui a IA com um Ollama simulado) |

## Segurança e auditoria

- Usuários convidados (ou com senha redefinida pelo administrador) entram com uma senha temporária e são obrigados a criar a própria senha no primeiro acesso.
- **Histórico › Auditoria** mostra acessos, tentativas de login com senha errada, mudanças de usuários e permissões (com o antes e depois), configurações, importações e avisos na TV, com o IP de cada ação. Exporta em CSV.

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
