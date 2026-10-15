import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Modal, Spinner, ErrorBox, useAsync, useToast } from '../components/ui.jsx';
import { initials, relTime, ROLE_LABEL } from '../format.js';

const MOD_LABEL = { dashboard: 'Dashboard', assistente: 'Assistente Cortex AI', vendas: 'Vendas e indicadores', equipe: 'Equipe comercial', metas: 'Metas', fluxo: 'Fluxo de caixa', alertas: 'Alertas e resumo diário', avisos: 'Avisos nas TVs', importacao: 'Importação de dados', relatorios: 'Relatórios', historico: 'Histórico', configuracoes: 'Configurações', administracao: 'Administração' };
const STATUS = { ativo: ['Ativo', 'var(--green-text)'], pendente: ['Convite pendente', 'var(--amber-text)'], desativado: ['Desativado', 'var(--muted)'] };

function PasswordModal({ title, name, password, onClose }) {
  const toast = useToast();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted" style={{ lineHeight: 1.6 }}>Passe estes dados para <strong style={{ color: 'var(--text)' }}>{name}</strong>. A senha temporária só aparece agora.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--side)', border: '1px solid var(--line-2)' }}>
        <code className="mono" style={{ flex: 1, fontSize: 16, color: 'var(--violet-text-2)' }}>{password}</code>
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(password); toast('Senha copiada'); }}><Icon name="copy" size={14} />Copiar</button>
      </div>
      <button className="btn primary" onClick={onClose}>Pronto</button>
    </Modal>
  );
}

export default function Admin() {
  const toast = useToast();
  const d = useAsync(() => api('/users'), []);
  const [perms, setPerms] = useState(null);
  const [security, setSecurity] = useState(null);
  const [invite, setInvite] = useState(null);
  const [pw, setPw] = useState(null);
  const [menu, setMenu] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (d.data) { setPerms(d.data.permissions); setSecurity(d.data.security); } }, [d.data]);
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, []);

  if (d.error) return <><PageHead eyebrow="Usuários, papéis e telas" title="Administração e permissões" /><ErrorBox error={d.error} onRetry={d.reload} /></>;
  if (!d.data || !perms) return <><PageHead eyebrow="Usuários, papéis e telas" title="Administração e permissões" /><div className="card"><div className="skel" style={{ height: 320 }} /></div></>;

  const patch = async (u, body, msg) => {
    try { await api(`/users/${u.id}`, { method: 'PATCH', body }); toast(msg); d.reload(); } catch (e) { toast('Não foi possível alterar', { kind: 'err', text: e.message }); }
  };
  const reset = async (u) => {
    try { const r = await api(`/users/${u.id}/reset-password`, { method: 'POST' }); setPw({ title: 'Senha redefinida', name: u.name, password: r.tempPassword }); } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
  };
  const sendInvite = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api('/users', { method: 'POST', body: invite });
      setPw({ title: 'Usuário convidado', name: invite.name, password: r.tempPassword });
      setInvite(null); d.reload();
    } catch (err) { toast('Não foi possível convidar', { kind: 'err', text: err.message }); }
    setSaving(false);
  };
  const savePerms = async () => {
    setSaving(true);
    try { await api('/permissions', { method: 'PUT', body: { permissions: perms, security } }); toast('Permissões salvas', { text: 'Valem a partir do próximo carregamento de página de cada usuário.' }); d.reload(); }
    catch (e) { toast('Erro ao salvar', { kind: 'err', text: e.message }); }
    setSaving(false);
  };
  const permsDirty = JSON.stringify(perms) !== JSON.stringify(d.data.permissions) || JSON.stringify(security) !== JSON.stringify(d.data.security);
  const active = d.data.users.filter((u) => u.status !== 'desativado').length;

  return (
    <>
      <PageHead eyebrow="Usuários, papéis e telas" title="Administração e permissões">
        <button className="btn primary" onClick={() => setInvite({ name: '', email: '', role: 'analista' })}><Icon name="plus" size={16} color="#fff" width={2} />Convidar usuário</button>
      </PageHead>

      <section className="card" aria-labelledby="us" style={{ paddingBottom: 8 }}>
        <div className="card-head"><h2 id="us" className="card-title">Usuários</h2><span className="dim" style={{ fontSize: 13 }}>{active} ativo(s) de {d.data.users.length}</span></div>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 760 }}>
            <thead><tr><th>Nome</th><th>Papel</th><th>Último acesso</th><th>Status</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {d.data.users.map((u) => {
                const me = u.id === d.data.me;
                return (
                  <tr key={u.id}>
                    <td><span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="avatar" style={me ? {} : { background: 'var(--card-3)', color: 'var(--text-2)' }}>{initials(u.name)}</span><span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span>{u.name}{me && <span className="dim"> (você)</span>}</span><span className="dim" style={{ fontSize: 12 }}>{u.email}</span></span></span></td>
                    <td>
                      <label className="sr" htmlFor={`role-${u.id}`}>Papel de {u.name}</label>
                      <select id={`role-${u.id}`} className="select" style={{ minHeight: 36, width: 'auto' }} value={u.role} disabled={me} onChange={(e) => patch(u, { role: e.target.value }, `${u.name} agora é ${ROLE_LABEL[e.target.value]}`)}>
                        {d.data.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="muted">{u.last_login ? relTime(u.last_login) : '—'}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: STATUS[u.status][1] }}><span className="pill-dot" style={{ background: STATUS[u.status][1] }} />{STATUS[u.status][0]}</span></td>
                    <td style={{ textAlign: 'right', position: 'relative' }}>
                      <button className="btn icon sm ghost" aria-label={`Ações para ${u.name}`} aria-haspopup="menu" aria-expanded={menu === u.id} onClick={(e) => { e.stopPropagation(); setMenu(menu === u.id ? null : u.id); }}><Icon name="dots" size={18} width={3} color="var(--muted)" /></button>
                      {menu === u.id && (
                        <div role="menu" style={{ position: 'absolute', right: 12, top: 48, zIndex: 5, minWidth: 210, padding: 6, borderRadius: 10, background: 'var(--card-3)', border: '1px solid var(--line-2)', boxShadow: '0 12px 32px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                          <button role="menuitem" className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => reset(u)}><Icon name="key" size={15} />Gerar nova senha</button>
                          {!me && (u.status === 'desativado'
                            ? <button role="menuitem" className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => patch(u, { status: 'ativo' }, `${u.name} reativado`)}><Icon name="check" size={15} />Reativar</button>
                            : <button role="menuitem" className="btn ghost sm" style={{ justifyContent: 'flex-start', color: 'var(--red-text)' }} onClick={() => patch(u, { status: 'desativado' }, `${u.name} desativado`)}><Icon name="x" size={15} />Desativar acesso</button>)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '2 1 560px' }} aria-labelledby="pm">
          <div><h2 id="pm" className="card-title">Papéis e permissões</h2><p className="card-sub">Defina o que cada papel pode acessar. O administrador sempre tem acesso total.</p></div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 560 }}>
              <thead><tr><th>Módulo</th>{d.data.roles.map((r) => <th key={r} style={{ textAlign: 'center' }}>{ROLE_LABEL[r]}</th>)}</tr></thead>
              <tbody>
                {d.data.modules.map((m) => (
                  <tr key={m}>
                    <th scope="row" style={{ fontWeight: 400, fontSize: 14, color: 'var(--text)', borderBottom: '1px solid var(--line-soft)' }}>{MOD_LABEL[m]}</th>
                    {d.data.roles.map((r) => (
                      <td key={r} style={{ textAlign: 'center', padding: 6 }}>
                        <label style={{ display: 'inline-flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', cursor: r === 'admin' ? 'not-allowed' : 'pointer' }}>
                          <input type="checkbox" aria-label={`${MOD_LABEL[m]} — ${ROLE_LABEL[r]}`} checked={!!perms[m]?.[r]} disabled={r === 'admin'} onChange={(e) => setPerms((p) => ({ ...p, [m]: { ...p[m], [r]: e.target.checked } }))} style={{ width: 18, height: 18, accentColor: 'var(--violet-h)' }} />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card tight" aria-labelledby="dv">
            <h2 id="dv" className="card-title">Telas conectadas</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, background: 'var(--card-2)' }}>
              <Icon name="tv" size={20} color={d.data.tvScreens ? 'var(--violet-text)' : 'var(--dim)'} />
              <span style={{ flex: 1 }}>{d.data.tvScreens ? `${d.data.tvScreens} tela(s) no modo TV agora` : 'Nenhuma tela no modo TV agora'}</span>
              <span className="pill-dot" style={{ background: d.data.tvScreens ? 'var(--green)' : 'var(--dim)' }} />
            </div>
            <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>Para ligar uma TV: abra no navegador dela o endereço “Na rede” que aparece no terminal do Cortex, seguido de <span className="mono">/tv</span>, e entre com um usuário.</p>
          </section>
          <section className="card tight" aria-labelledby="sg">
            <h2 id="sg" className="card-title">Segurança</h2>
            <label className="check"><input type="checkbox" checked={!!security.strongPassword} onChange={(e) => setSecurity({ ...security, strongPassword: e.target.checked })} />Exigir senha com letras e números</label>
            <label className="field">Encerrar sessão após
              <select className="select" value={security.sessionHours} onChange={(e) => setSecurity({ ...security, sessionHours: +e.target.value })}>
                {[8, 12, 24, 72].map((h) => <option key={h} value={h}>{h} horas</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={!!security.hideMoney} onChange={(e) => setSecurity({ ...security, hideMoney: e.target.checked })} />Ocultar valores em R$ na TV</label>
          </section>
          <button className="btn primary" disabled={!permsDirty || saving} onClick={savePerms}>{saving ? <><Spinner color="#fff" />Salvando…</> : 'Salvar permissões e segurança'}</button>
        </div>
      </div>

      {invite && (
        <Modal title="Convidar usuário" onClose={() => setInvite(null)}>
          <form onSubmit={sendInvite} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="field">Nome<input className="input" required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} autoFocus /></label>
            <label className="field">E-mail<input className="input" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></label>
            <label className="field">Papel<select className="select" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>{d.data.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
            <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>O Cortex gera uma senha temporária. Como tudo roda localmente, nenhum e-mail é enviado — você repassa os dados para a pessoa.</p>
            <div className="toolbar" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setInvite(null)}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? <Spinner color="#fff" /> : 'Convidar'}</button></div>
          </form>
        </Modal>
      )}
      {pw && <PasswordModal {...pw} onClose={() => setPw(null)} />}
    </>
  );
}
