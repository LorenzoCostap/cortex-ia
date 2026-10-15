// Integração com o Ollama (IA local) usando "tool calling":
// a IA escolhe qual função de métricas chamar, o Node calcula, e a IA só explica o resultado.
import * as M from './metrics.js';
import { cashflow } from './cashflow.js';
import { chartFromTool, chartForIntent } from './charts.js';
import { todayStr, refMonth, monthEnd, addMonths, monthStart, monthLabel, isIso, weekRange, addDays } from './dates.js';
import { answerIntent, detectIntent, helpAnswer } from './answers.js';

async function fetchJson(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Ollama respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function ollamaStatus(ai) {
  const started = Date.now();
  try {
    const tags = await fetchJson(`${ai.url.replace(/\/$/, '')}/api/tags`, null, 2500);
    const models = (tags.models || []).map((m) => m.name);
    const hasModel = models.some((m) => m === ai.model || m === `${ai.model}:latest` || m.split(':')[0] === ai.model);
    return { online: true, models, hasModel, model: ai.model, latencyMs: Date.now() - started };
  } catch (e) {
    return { online: false, models: [], hasModel: false, model: ai.model, error: e.name === 'AbortError' ? 'Tempo esgotado ao conectar.' : e.message };
  }
}

export async function ollamaSpeed(ai) {
  const r = await fetchJson(`${ai.url.replace(/\/$/, '')}/api/generate`, { model: ai.model, prompt: 'Responda apenas: ok', stream: false, options: { num_predict: 24 } }, 120000);
  const tps = r.eval_count && r.eval_duration ? r.eval_count / (r.eval_duration / 1e9) : null;
  return { tokensPerSecond: tps ? Math.round(tps) : null };
}

const P = (desc) => ({ type: 'string', description: desc });
const PERIOD = { inicio: P('Data inicial AAAA-MM-DD'), fim: P('Data final AAAA-MM-DD') };
const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const TOOLS = [
  fn('resumo_periodo', 'Faturamento, pedidos, ticket médio, despesas, lucro e margens de um período.', PERIOD, ['inicio', 'fim']),
  fn('comparar_periodos', 'Compara dois períodos: variação dos indicadores, clientes e produtos que mais caíram/subiram e rupturas de estoque. Use para perguntas do tipo "por que caiu".', { inicio_a: P('Início do período principal'), fim_a: P('Fim do período principal'), inicio_b: P('Início do período de comparação'), fim_b: P('Fim do período de comparação') }, ['inicio_a', 'fim_a', 'inicio_b', 'fim_b']),
  fn('top_produtos', 'Produtos ordenados por receita no período, com participação, margem, variação e curva ABC.', { ...PERIOD, limite: { type: 'integer', description: 'Quantos produtos (padrão 5)' } }, ['inicio', 'fim']),
  fn('clientes_em_queda', 'Clientes que compraram abaixo da sua média dos 3 meses anteriores ao período.', { ...PERIOD, limite: { type: 'integer' } }, ['inicio', 'fim']),
  fn('margem_periodo', 'Margem bruta, margem líquida e despesas por categoria no período.', PERIOD, ['inicio', 'fim']),
  fn('vendas_por_categoria', 'Receita por categoria de produto no período.', PERIOD, ['inicio', 'fim']),
  fn('serie_mensal', 'Receita, despesas, lucro e meta mês a mês (últimos N meses até o mês de referência).', { meses: { type: 'integer', description: 'Quantidade de meses (padrão 12)' } }),
  fn('relatorio_semanal', 'Dados para o relatório executivo da última semana completa comparada à anterior.'),
  fn('indicadores_atencao', 'Lista de alertas atuais: contas vencidas, clientes parados, produtos em queda, meta em risco, margem.'),
  fn('contas', 'Contas a pagar ou a receber em aberto (vencidas e a vencer).', { tipo: { type: 'string', enum: ['pagar', 'receber'] }, dias: { type: 'integer', description: 'Janela de vencimento em dias (padrão 30)' } }, ['tipo']),
  fn('meta_do_mes', 'Progresso da meta de faturamento do mês atual (em andamento).'),
  fn('fluxo_de_caixa', 'Saldo de caixa projetado para os próximos 30, 60 ou 90 dias: entradas, saídas, menor saldo e quando fica abaixo do mínimo.', { dias: { type: 'integer', enum: [30, 60, 90] } })
];

function runTool(org, name, args = {}) {
  const ref = refMonth();
  const okP = (f, t) => (isIso(f) && isIso(t) && f <= t ? [f, t] : [ref, monthEnd(ref)]);
  switch (name) {
    case 'resumo_periodo': { const [f, t] = okP(args.inicio, args.fim); return M.periodSummary(org, f, t); }
    case 'comparar_periodos': {
      const [fa, ta] = okP(args.inicio_a, args.fim_a);
      const prev = M.previousPeriod(fa, ta);
      const [fb, tb] = isIso(args.inicio_b) && isIso(args.fim_b) ? [args.inicio_b, args.fim_b] : [prev.from, prev.to];
      return M.comparePeriods(org, { from: fa, to: ta }, { from: fb, to: tb });
    }
    case 'top_produtos': { const [f, t] = okP(args.inicio, args.fim); return M.topProducts(org, f, t, Math.min(+args.limite || 5, 20)); }
    case 'clientes_em_queda': { const [f, t] = okP(args.inicio, args.fim); return M.customersDeclining(org, f, t, Math.min(+args.limite || 5, 15)); }
    case 'margem_periodo': { const [f, t] = okP(args.inicio, args.fim); const s = M.periodSummary(org, f, t); return { ...s, despesasPorCategoria: M.expensesByCategory(org, f, t) }; }
    case 'vendas_por_categoria': { const [f, t] = okP(args.inicio, args.fim); return M.categoryBreakdown(org, f, t); }
    case 'serie_mensal': return M.monthlySeries(org, ref, Math.min(+args.meses || 12, 24));
    case 'relatorio_semanal': return M.weeklyReport(org);
    case 'indicadores_atencao': return M.attentionIndicators(org);
    case 'contas': return M.bills(org, args.tipo === 'receber' ? 'receber' : 'pagar', { days: Math.min(+args.dias || 30, 365) });
    case 'meta_do_mes': return M.goalProgress(org);
    case 'fluxo_de_caixa': { const c = cashflow(org, args.dias || 90); return { ...c, moves: c.moves.filter((m) => !m.estimate).slice(0, 15) }; }
    default: return { erro: `Ferramenta desconhecida: ${name}` };
  }
}

function systemPrompt(orgName) {
  const today = todayStr();
  const ref = refMonth(today), prev = addMonths(ref, -1);
  const lastWeek = weekRange(addDays(weekRange(today).start, -1));
  return `Você é o Cortex, assistente de análise de negócios da empresa ${orgName}. Responda SEMPRE em português do Brasil, de forma direta e executiva.

Regras:
- Nunca invente números e nunca faça contas de cabeça: use as ferramentas para obter todos os valores.
- Se a pergunta não puder ser respondida com as ferramentas disponíveis, diga isso claramente.
- Formate dinheiro como R$ 12.345 e percentuais como 12,3%.
- Estrutura: 1 frase com a conclusão, depois no máximo 4 tópicos curtos com os números, e se fizer sentido 1 recomendação prática começando com "Recomendação:".
- Use **negrito** só para nomes e números principais. Não use tabelas nem títulos.

Datas de referência (hoje é ${today}):
- "Este mês"/"neste mês"/"no período" sem outra indicação = último mês fechado: ${monthLabel(ref)} (${ref} a ${monthEnd(ref)}). Diga isso na resposta.
- Mês anterior a ele: ${monthLabel(prev)} (${prev} a ${monthEnd(prev)}).
- Mês corrente, ainda em andamento: ${monthStart(today)} a ${today}.
- Última semana completa: ${lastWeek.start} a ${lastWeek.end}.`;
}

/**
 * Responde a uma pergunta. onEvent recebe {type:'step'|'tool'|'answer'|'error', ...}.
 * Retorna { answer, tools, mode: 'ia'|'automatico', rows? }.
 */
export async function ask({ org, orgName, ai, question, history = [] }, onEvent = () => {}) {
  onEvent({ type: 'step', text: 'Verificando a IA local' });
  const status = await ollamaStatus(ai);

  if (!status.online || !status.hasModel) {
    const intent = detectIntent(question);
    onEvent({ type: 'step', text: status.online ? `Modelo ${ai.model} não encontrado — usando respostas automáticas` : 'IA local offline — usando respostas automáticas' });
    const res = intent ? answerIntent(org, intent) : helpAnswer();
    for (const t of res.tools) onEvent({ type: 'tool', name: t });
    return { answer: res.answer, tools: res.tools, rows: res.rows, chart: intent ? chartForIntent(org, intent) : null, mode: 'automatico', notice: status.online ? `O modelo "${ai.model}" não está instalado. Rode: ollama pull ${ai.model}` : 'O Ollama não está rodando. Inicie com: ollama serve' };
  }

  const messages = [{ role: 'system', content: systemPrompt(orgName) }, ...history.slice(-6), { role: 'user', content: question }];
  const tools = [];
  let chart = null;
  const url = `${ai.url.replace(/\/$/, '')}/api/chat`;
  for (let round = 0; round < 5; round++) {
    onEvent({ type: 'step', text: round === 0 ? 'Entendendo a pergunta' : 'Analisando os dados' });
    const r = await fetchJson(url, { model: ai.model, messages, tools: TOOLS, stream: false, options: { temperature: 0.2 } }, 180000);
    const msg = r.message || {};
    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        const name = call.function?.name;
        let args = call.function?.arguments || {};
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        onEvent({ type: 'tool', name });
        tools.push(name);
        let result;
        try { result = runTool(org, name, args); } catch (e) { result = { erro: e.message }; }
        chart = chartFromTool(name, result) || chart;
        messages.push({ role: 'tool', tool_name: name, content: JSON.stringify(result) });
      }
      continue;
    }
    onEvent({ type: 'step', text: 'Escrevendo a resposta' });
    return { answer: (msg.content || '').trim() || 'Não consegui gerar uma resposta. Tente reformular a pergunta.', tools, chart, mode: 'ia' };
  }
  return { answer: 'A análise ficou longa demais. Tente uma pergunta mais específica.', tools, mode: 'ia' };
}

/** Reescreve uma resposta automática em linguagem natural curta (usada nos insights da TV). */
export async function rephrase(ai, question, data) {
  const r = await fetchJson(`${ai.url.replace(/\/$/, '')}/api/chat`, {
    model: ai.model, stream: false, options: { temperature: 0.3 },
    messages: [
      { role: 'system', content: 'Você escreve legendas curtas para uma TV de escritório. Responda em português do Brasil, em no máximo 2 frases (até 220 caracteres), sem markdown, usando apenas os números fornecidos.' },
      { role: 'user', content: `Pergunta: ${question}\nDados calculados:\n${data}` }
    ]
  }, 90000);
  return (r.message?.content || '').replace(/\*\*/g, '').trim();
}
