'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';

const TIPOS = [
  { id: 'PF', label: 'Pessoal', hint: 'Seu dinheiro: salário, casa, cartão, metas' },
  { id: 'PJ', label: 'Empresa', hint: 'Faturamento, imposto, contador, pró-labore' },
];

export default function WalletsPage() {
  const [wallets, setWallets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'PJ', color: '#0984e3' });
  const [editando, setEditando] = useState(null);
  const [apagando, setApagando] = useState(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const buscar = useCallback(async () => {
    const d = await fetch('/api/wallets').then(r => r.json());
    setWallets(d.wallets || []);
    setActiveId(d.activeId || null);
    setCarregando(false);
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  const criar = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const res = await fetch('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSalvando(false);

    if (!res.ok) return setErro((await res.json()).error || 'Não foi possível criar');

    setCriando(false);
    setForm({ name: '', kind: 'PJ', color: '#0984e3' });
    buscar();
  };

  const salvarEdicao = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const res = await fetch('/api/wallets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editando.id, name: editando.name, color: editando.color }),
    });
    setSalvando(false);

    if (!res.ok) return setErro((await res.json()).error || 'Não foi possível salvar');

    setEditando(null);
    buscar();
  };

  const tornarPadrao = async (w) => {
    await fetch('/api/wallets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, isDefault: true }),
    });
    buscar();
  };

  const apagar = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const res = await fetch(
      `/api/wallets?id=${apagando.id}&confirm=${encodeURIComponent(confirmacao)}`,
      { method: 'DELETE' },
    );
    setSalvando(false);

    if (!res.ok) return setErro((await res.json()).error || 'Não foi possível apagar');

    setApagando(null);
    setConfirmacao('');
    // Se a apagada era a ativa, o token ainda aponta para ela
    if (apagando.id === activeId) window.location.href = '/';
    else buscar();
  };

  const trocar = async (id) => {
    const res = await fetch('/api/wallets/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: id }),
    });
    if (res.ok) window.location.href = '/';
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Carteiras</h1>
          <p className="page-subtitle">Conjuntos de finanças que você olha separados</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setErro(''); setCriando(true); }}>
          <Icon name="adicionar" size={14} /> Nova carteira
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p className="setting-hint" style={{ margin: 0 }}>
          Cada carteira tem as próprias contas, cartões, lançamentos, categorias,
          metas e investimentos — nada atravessa de uma para a outra. O que é
          preferência sua (tema, esconder valores, cores do calendário) vale nas
          duas, porque não muda quando você troca de chapéu.
        </p>
      </div>

      {carregando ? (
        <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>
      ) : (
        <div className="wallet-list">
          {wallets.map(w => (
            <div key={w.id} className={`card wallet-card ${w.id === activeId ? 'active' : ''}`}>
              <div className="wallet-card-head">
                <span className="dot dot-lg" style={{ background: w.color }} />
                <div>
                  <div className="wallet-card-name">
                    {w.name}
                    {w.id === activeId && <span className="parcel-badge">aberta agora</span>}
                    {w.isDefault && <span className="parcel-badge">padrão</span>}
                  </div>
                  <div className="wallet-card-kind">
                    {TIPOS.find(t => t.id === w.kind)?.label || w.kind}
                  </div>
                </div>
              </div>

              <div className="wallet-card-actions">
                {w.id !== activeId && (
                  <button className="btn btn-secondary btn-sm" onClick={() => trocar(w.id)}>
                    Abrir
                  </button>
                )}
                {!w.isDefault && (
                  <button className="btn btn-secondary btn-sm" onClick={() => tornarPadrao(w)}>
                    Tornar padrão
                  </button>
                )}
                <button
                  className="btn-icon"
                  onClick={() => { setErro(''); setEditando({ ...w }); }}
                  aria-label={`Editar ${w.name}`}
                >
                  <Icon name="editar" size={15} />
                </button>
                {wallets.length > 1 && (
                  <button
                    className="btn-icon"
                    onClick={() => { setErro(''); setConfirmacao(''); setApagando(w); }}
                    aria-label={`Apagar ${w.name}`}
                  >
                    <Icon name="remover" size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {criando && (
        <Modal onClose={() => setCriando(false)} labelledBy="titulo-carteira">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title" id="titulo-carteira">Nova carteira</h2>
              <button className="modal-close" onClick={() => setCriando(false)} aria-label="Fechar">
                <Icon name="fechar" />
              </button>
            </div>

            <form onSubmit={criar}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input
                  className="form-input" required autoFocus maxLength={40}
                  placeholder="Minha Empresa"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tipo</label>
                <div className="onb-choices">
                  {TIPOS.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`onb-choice ${form.kind === t.id ? 'active' : ''}`}
                      onClick={() => setForm({
                        ...form, kind: t.id,
                        color: t.id === 'PJ' ? '#0984e3' : '#6c5ce7',
                      })}
                    >
                      <span className="onb-choice-label">{t.label}</span>
                      <span className="onb-choice-hint">{t.hint}</span>
                    </button>
                  ))}
                </div>
                <p className="form-hint">
                  Muda só as categorias que já vêm prontas. O tipo não pode ser
                  alterado depois, porque as categorias já terão sido criadas.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Cor</label>
                <input
                  type="color" className="form-input" style={{ height: 42, padding: 4 }}
                  value={form.color}
                  onChange={e => setForm({ ...form, color: e.target.value })}
                />
              </div>

              {erro && <div className="form-error">{erro}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCriando(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Criando...' : 'Criar carteira'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {editando && (
        <Modal onClose={() => setEditando(null)} labelledBy="titulo-editar">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title" id="titulo-editar">Editar carteira</h2>
              <button className="modal-close" onClick={() => setEditando(null)} aria-label="Fechar">
                <Icon name="fechar" />
              </button>
            </div>

            <form onSubmit={salvarEdicao}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input
                  className="form-input" required autoFocus maxLength={40}
                  value={editando.name}
                  onChange={e => setEditando({ ...editando, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cor</label>
                <input
                  type="color" className="form-input" style={{ height: 42, padding: 4 }}
                  value={editando.color}
                  onChange={e => setEditando({ ...editando, color: e.target.value })}
                />
              </div>

              {erro && <div className="form-error">{erro}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {apagando && (
        <Modal onClose={() => setApagando(null)} labelledBy="titulo-apagar">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title" id="titulo-apagar">Apagar {apagando.name}</h2>
              <button className="modal-close" onClick={() => setApagando(null)} aria-label="Fechar">
                <Icon name="fechar" />
              </button>
            </div>

            <form onSubmit={apagar}>
              <div className="ledger-alert">
                Isso apaga <strong>tudo</strong> que está nesta carteira: contas,
                cartões, lançamentos, recorrentes, parcelas, metas e investimentos.
                Não tem como desfazer.
              </div>

              <div className="form-group">
                <label className="form-label">
                  Para confirmar, digite <strong>{apagando.name}</strong>
                </label>
                <input
                  className="form-input" required autoFocus autoComplete="off"
                  value={confirmacao}
                  onChange={e => setConfirmacao(e.target.value)}
                />
              </div>

              {erro && <div className="form-error">{erro}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setApagando(null)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={salvando || confirmacao !== apagando.name}
                >
                  {salvando ? 'Apagando...' : 'Apagar para sempre'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
