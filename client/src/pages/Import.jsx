import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Modal, Spinner, useAsync, useToast } from '../components/ui.jsx';
import { num } from '../format.js';

const TEMPLATES = {
  'vendas.csv': ['data;cliente;produto;categoria;quantidade;valor_unitario;custo_unitario', '02/09/2026;Mercado Exemplo;Café torrado 500 g;Mercearia;24;18,90;12,40'],
  'despesas.csv': ['data;categoria;descricao;valor', '05/09/2026;Pessoal;Salários e encargos;34000,00'],
  'contas.csv': ['tipo;parceiro;vencimento;valor;pago_em', 'pagar;Fornecedor Exemplo;20/10/2026;5000,00;', 'receber;Cliente Exemplo;25/10/2026;3200,00;'],
  'metas.csv': ['mes;meta_faturamento', '10/2026;450000,00']
};

function download(name) {
  const blob = new Blob(['﻿' + TEMPLATES[name].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `modelo_${name}`; a.click();
}

export default function Import() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const st = useAsync(() => api('/data/status'), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await api('/data/reset-demo', { method: 'POST' });
      toast('Dados de demonstração gerados', { text: 'O dashboard já mostra os novos números.' });
      setConfirm(false); st.reload(); refresh();
    } catch (e) { toast('Não foi possível gerar os dados', { kind: 'err', text: e.message }); }
    setBusy(false);
  };

  const steps = ['Enviar arquivos', 'Mapear colunas', 'Validar', 'Importar'];
  return (
    <>
      <PageHead eyebrow="Planilhas Excel e CSV" title="Importação de dados" />
      {me.org.isDemo && (
        <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>Você está usando <strong>dados de demonstração</strong> da empresa fictícia. Ao importar suas planilhas, eles serão substituídos.</span></div>
      )}

      <ol aria-label="Etapas da importação" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {steps.map((s, i) => (
          <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--line)' }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--card-3)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{i + 1}</span>
            <span className="muted">{s}</span>
          </li>
        ))}
      </ol>

      <div className="row">
        <section style={{ flex: '2 1 480px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 24px', borderRadius: 14, border: '1.5px dashed var(--line-2)', background: 'var(--side)', textAlign: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--violet-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="upload" size={24} color="var(--violet-text)" /></span>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>Importação de planilhas chega na próxima etapa</h2>
          <p className="muted" style={{ maxWidth: 440, lineHeight: 1.6 }}>Já dá para baixar os modelos abaixo e ir preparando as planilhas da empresa. Quando a importação estiver pronta, é só arrastar os arquivos aqui.</p>
          <div className="toolbar" style={{ justifyContent: 'center' }}>
            {Object.keys(TEMPLATES).map((t) => <button key={t} className="btn sm" onClick={() => download(t)}><Icon name="download" size={15} color="var(--muted)" />Modelo {t.replace('.csv', '')}</button>)}
          </div>
        </section>

        <section className="card" style={{ flex: '1 1 300px' }} aria-labelledby="base">
          <h2 id="base" className="card-title"><Icon name="database" size={16} color="var(--violet-text)" />Base de dados atual</h2>
          {!st.data ? <div className="skel" style={{ height: 120 }} /> : (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px 14px', fontSize: 14 }}>
              <dt className="muted">Pedidos</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.orders)}</dd>
              <dt className="muted">Clientes</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.customers)}</dd>
              <dt className="muted">Produtos</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.products)}</dd>
              <dt className="muted">Lançamentos de despesa</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.expenses)}</dd>
              <dt className="muted">Origem</dt><dd style={{ margin: 0, color: st.data.isDemo ? 'var(--amber-text)' : 'var(--green-text)' }}>{st.data.isDemo ? 'Demonstração' : 'Importada'}</dd>
            </dl>
          )}
          <button className="btn" style={{ marginTop: 'auto' }} onClick={() => setConfirm(true)}><Icon name="refresh" size={16} color="var(--muted)" />Gerar dados de demonstração</button>
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>Cria 13 meses de vendas, despesas, contas e metas de uma distribuidora fictícia, terminando hoje.</p>
        </section>
      </div>

      {confirm && (
        <Modal title="Gerar dados de demonstração?" onClose={() => !busy && setConfirm(false)}>
          <p className="muted" style={{ lineHeight: 1.6 }}>Todas as vendas, clientes, produtos, despesas, contas, metas e relatórios desta organização serão <strong style={{ color: 'var(--text)' }}>apagados</strong> e substituídos por dados fictícios. Usuários e configurações continuam iguais.</p>
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirm(false)} disabled={busy}>Cancelar</button>
            <button className="btn primary" onClick={reset} disabled={busy}>{busy ? <><Spinner color="#fff" />Gerando…</> : 'Apagar e gerar'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
