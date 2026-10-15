import { useState } from 'react';
import { api } from '../api.js';
import { Icon, Modal, Spinner, useAsync, useToast } from './ui.jsx';

const DURATIONS = [['30', '30 minutos'], ['60', '1 hora'], ['120', '2 horas'], ['eod', 'Até o fim do dia'], ['0', 'Sem prazo (até remover)']];
const hm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function NoticeModal({ onClose }) {
  const toast = useToast();
  const q = useAsync(() => api('/tv/notice'), []);
  const [text, setText] = useState('');
  const [dur, setDur] = useState('60');
  const [all, setAll] = useState(true);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState('');
  const cur = q.data?.notice && (!q.data.notice.until || new Date(q.data.notice.until) > new Date()) ? q.data.notice : null;
  const devices = q.data?.devices || [];

  const publish = async (e) => {
    e.preventDefault();
    if (!text.trim() || (!all && !sel.length)) return;
    setBusy('pub');
    try {
      await api('/tv/notice', { method: 'PUT', body: { text, minutes: dur === 'eod' ? 0 : +dur, endOfDay: dur === 'eod', devices: all ? [] : sel } });
      toast('Aviso publicado', { text: q.data.screens ? `Aparece agora em ${q.data.screens} tela(s) conectada(s).` : 'Nenhuma TV conectada agora — aparece quando abrirem.' });
      onClose();
    } catch (err) { toast('Não foi possível publicar', { kind: 'err', text: err.message }); setBusy(''); }
  };
  const remove = async () => {
    setBusy('del');
    try { await api('/tv/notice', { method: 'DELETE' }); toast('Aviso removido'); q.reload(); } catch (err) { toast('Erro', { kind: 'err', text: err.message }); }
    setBusy('');
  };

  return (
    <Modal title="Aviso nas TVs" onClose={onClose}>
      {cur && (
        <div className="alert info" style={{ alignItems: 'center' }}>
          <Icon name="megaphone" color="var(--violet-text)" />
          <span style={{ flex: 1 }}><strong>No ar:</strong> {cur.text}<br /><span style={{ fontSize: 12, opacity: 0.8 }}>{cur.by}{cur.until ? ` · até ${hm(cur.until)}` : ' · sem prazo'}</span></span>
          <button className="btn sm" onClick={remove} disabled={!!busy}>{busy === 'del' ? <Spinner /> : 'Remover'}</button>
        </div>
      )}
      <form onSubmit={publish} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">{cur ? 'Substituir por' : 'Mensagem'}
          <textarea className="input" rows={2} maxLength={160} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Reunião comercial hoje às 15h na sala 2" autoFocus style={{ resize: 'vertical', minHeight: 64, paddingTop: 10 }} />
          <span className="dim" style={{ fontSize: 12, alignSelf: 'flex-end' }}>{text.length}/160</span>
        </label>
        <label className="field">Duração<select className="select" value={dur} onChange={(e) => setDur(e.target.value)}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={{ fontSize: 14, marginBottom: 8 }}>Onde mostrar</legend>
          <label className="check"><input type="radio" name="where" checked={all} onChange={() => setAll(true)} />Todas as TVs</label>
          <label className="check"><input type="radio" name="where" checked={!all} disabled={!devices.length} onChange={() => setAll(false)} />Só em algumas{!devices.length && <span className="dim" style={{ fontSize: 12 }}>— cadastre as TVs em Configurações › Modo TV</span>}</label>
          {!all && devices.map((d) => <label key={d.id} className="check" style={{ marginLeft: 26 }}><input type="checkbox" checked={sel.includes(d.id)} onChange={(e) => setSel(e.target.checked ? [...sel, d.id] : sel.filter((x) => x !== d.id))} />{d.name}</label>)}
        </fieldset>
        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!!busy || !text.trim() || (!all && !sel.length)}>{busy === 'pub' ? <Spinner color="#fff" /> : 'Publicar na TV'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function NoticeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)} style={{ justifyContent: 'center' }}><Icon name="megaphone" size={16} color="var(--muted)" />Aviso nas TVs</button>
      {open && <NoticeModal onClose={() => setOpen(false)} />}
    </>
  );
}
