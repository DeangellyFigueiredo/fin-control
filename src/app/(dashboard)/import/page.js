'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/Icon';
import { formatBRL, formatDateShort } from '@/lib/utils';

/**
 * Importação de extrato e fatura, em dois passos.
 *
 * Passo 1 lê o arquivo e mostra o que entendeu, com as duplicatas já
 * desmarcadas. Passo 2 grava. A separação é de propósito: importar é a
 * operação mais fácil de errar feio e a mais chata de desfazer à mão.
 */
export default function ImportPage() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accountId, setAccountId] = useState('');

  const [nomeArquivo, setNomeArquivo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [inverterSinal, setInverterSinal] = useState(false);

  const [previa, setPrevia] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/accounts').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([a, c]) => {
      const contas = Array.isArray(a) ? a : [];
      setAccounts(contas);
      setCategories(Array.isArray(c) ? c : []);
      if (contas.length === 1) setAccountId(contas[0].id);
    });
  }, []);

  const lerArquivo = async (file) => {
    if (!file) return;
    setErro('');
    setPronto(null);
    setNomeArquivo(file.name);

    // Extrato de banco brasileiro costuma vir em latin-1; ler como UTF-8
    // transforma "AÇOUGUE" em "A�OUGUE". Se aparecer o caractere de
    // substituição, relê com a outra tabela.
    const buffer = await file.arrayBuffer();
    let texto = new TextDecoder('utf-8').decode(buffer);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buffer);

    setConteudo(texto);
    analisar(texto, inverterSinal);
  };

  const analisar = async (texto, inverter) => {
    setCarregando(true);
    setErro('');

    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteudo: texto, inverterSinal: inverter }),
    });

    setCarregando(false);
    const dados = await res.json();

    if (!res.ok) {
      setPrevia(null);
      return setErro(dados.error || 'Não foi possível ler o arquivo');
    }

    setPrevia(dados);
    // Duplicata vem desmarcada: o caminho fácil é o certo.
    setMarcadas(new Set(dados.linhas.filter(l => !l.duplicada).map(l => l.i)));
  };

  const alternar = (i) => {
    setMarcadas(prev => {
      const proxima = new Set(prev);
      if (proxima.has(i)) proxima.delete(i); else proxima.add(i);
      return proxima;
    });
  };

  const mudarCategoria = (i, categoryId) => {
    setPrevia(p => ({
      ...p,
      linhas: p.linhas.map(l => (l.i === i
        ? { ...l, categoryId: categoryId || null, origemCategoria: categoryId ? 'manual' : null, ruleId: null }
        : l)),
    }));
  };

  const importar = async () => {
    setErro('');
    if (!accountId) return setErro('Escolha a conta de destino');

    const linhas = previa.linhas.filter(l => marcadas.has(l.i));
    if (!linhas.length) return setErro('Nenhuma linha marcada');

    setGravando(true);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmar: linhas, bankAccountId: accountId }),
    });
    setGravando(false);

    const dados = await res.json();
    if (!res.ok) return setErro(dados.error || 'Não foi possível importar');

    setPronto(dados.importadas);
    setPrevia(null);
    setConteudo('');
    setNomeArquivo('');
    if (inputRef.current) inputRef.current.value = '';
    window.dispatchEvent(new CustomEvent('fincontrol:transacao-salva'));
  };

  const totalMarcado = previa
    ? previa.linhas.filter(l => marcadas.has(l.i))
      .reduce((s, l) => s + (l.type === 'INCOME' ? l.amount : -l.amount), 0)
    : 0;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Importar extrato</h1>
          <p className="page-subtitle">CSV ou OFX do banco e da fatura do cartão</p>
        </div>
      </div>

      {pronto !== null && (
        <div className="import-ok">
          <Icon name="concluir" size={16} /> {pronto} {pronto === 1 ? 'lançamento importado' : 'lançamentos importados'}.
          {' '}Eles entraram como retroativos, então as projeções não se mexeram.
        </div>
      )}

      <div className="card">
        <div className="import-drop">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.ofx,.txt,text/csv,text/plain"
            onChange={e => lerArquivo(e.target.files?.[0])}
            id="arquivo"
          />
          <label htmlFor="arquivo" className="btn btn-secondary">
            <Icon name="importar" size={15} /> Escolher arquivo
          </label>
          <span className="import-file">{nomeArquivo || 'Nenhum arquivo escolhido'}</span>
        </div>

        <p className="form-hint">
          O parser descobre sozinho o separador, o formato da data e onde está o
          valor — não precisa exportar num formato específico. Funciona com
          extrato de conta e com fatura de cartão.
        </p>

        {conteudo && (
          <label className="switch-label" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={inverterSinal}
              onChange={e => { setInverterSinal(e.target.checked); analisar(conteudo, e.target.checked); }}
            />
            Inverter entradas e saídas (fatura que vem com tudo positivo)
          </label>
        )}
      </div>

      {carregando && <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>}
      {erro && <div className="form-error" style={{ marginTop: 16 }}>{erro}</div>}

      {previa && (
        <>
          <div className="stat-cards">
            <div className="card stat-card balance">
              <div className="stat-label">Linhas lidas</div>
              <div className="stat-value">{previa.total}</div>
              <div className="stat-change">formato {previa.formato.toUpperCase()}</div>
            </div>
            <div className="card stat-card income">
              <div className="stat-label">Categorizadas</div>
              <div className="stat-value positive">{previa.categorizadas}</div>
              <div className="stat-change">
                de {previa.total} — as outras entram sem categoria
              </div>
            </div>
            <div className="card stat-card expense">
              <div className="stat-label">Já existem</div>
              <div className="stat-value">{previa.duplicadas}</div>
              <div className="stat-change">desmarcadas, para não duplicar</div>
            </div>
            <div className="card stat-card variation">
              <div className="stat-label">Saldo do que está marcado</div>
              <div className={`stat-value ${totalMarcado >= 0 ? 'positive' : 'negative'}`}>
                {formatBRL(totalMarcado)}
              </div>
              <div className="stat-change">{marcadas.size} de {previa.total} marcadas</div>
            </div>
          </div>

          <div className="card panel">
            <div className="panel-header">
              <div className="panel-title">Confira antes de gravar</div>
              <div className="import-actions">
                <select
                  className="form-select"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                >
                  <option value="">Conta de destino…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button
                  className="btn btn-primary"
                  onClick={importar}
                  disabled={gravando || !marcadas.size}
                >
                  {gravando ? 'Importando...' : `Importar ${marcadas.size}`}
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="table import-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={marcadas.size === previa.linhas.length}
                        onChange={e => setMarcadas(e.target.checked
                          ? new Set(previa.linhas.map(l => l.i))
                          : new Set())}
                        aria-label="Marcar todas"
                      />
                    </th>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.linhas.map(linha => (
                    <tr key={linha.i} className={linha.duplicada ? 'dup' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={marcadas.has(linha.i)}
                          onChange={() => alternar(linha.i)}
                          aria-label={`Importar ${linha.description}`}
                        />
                      </td>
                      <td>{formatDateShort(linha.date)}</td>
                      <td>
                        {linha.description}
                        {linha.duplicada && <span className="parcel-badge">já existe</span>}
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={linha.categoryId || ''}
                          onChange={e => mudarCategoria(linha.i, e.target.value)}
                        >
                          <option value="">Sem categoria</option>
                          {categories
                            .filter(c => c.type === linha.type)
                            .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className={`amount ${linha.type === 'INCOME' ? 'amount-income' : 'amount-expense'}`}>
                        {linha.type === 'INCOME' ? '+' : '−'} {formatBRL(linha.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
