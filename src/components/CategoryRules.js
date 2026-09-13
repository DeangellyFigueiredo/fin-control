'use client';

import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/Icon';

/**
 * As regras de categorização, à vista.
 *
 * Categorização automática só é confiável se for auditável: se um lançamento
 * caiu em Transporte, tem que existir uma linha aqui dizendo por quê, e um
 * botão para apagá-la. É o que separa uma regra de um palpite.
 */
export default function CategoryRules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [erro, setErro] = useState('');

  const buscar = useCallback(async () => {
    const [r, c] = await Promise.all([
      fetch('/api/category-rules').then(x => x.json()),
      fetch('/api/categories').then(x => x.json()),
    ]);
    setRules(Array.isArray(r) ? r : []);
    setCategories(Array.isArray(c) ? c : []);
    setCarregando(false);
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  const criar = async (e) => {
    e.preventDefault();
    setErro('');

    const res = await fetch('/api/category-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, categoryId }),
    });

    if (!res.ok) return setErro((await res.json()).error || 'Não foi possível criar');

    setPattern('');
    setCategoryId('');
    buscar();
  };

  const remover = async (rule) => {
    await fetch(`/api/category-rules?id=${rule.id}`, { method: 'DELETE' });
    buscar();
  };

  return (
    <div className="card panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Categorização automática</div>
          <div className="panel-subtitle">
            Toda vez que você corrige a categoria de um lançamento, o app aprende aqui
          </div>
        </div>
      </div>

      <form className="rule-form" onSubmit={criar}>
        <input
          className="form-input"
          placeholder="Trecho da descrição (ex: UBER)"
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          required
        />
        <select
          className="form-select"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          required
        >
          <option value="">Categoria…</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type === 'INCOME' ? 'entrada' : 'saída'})
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary btn-sm">
          <Icon name="adicionar" size={14} /> Criar
        </button>
      </form>

      {erro && <div className="form-error">{erro}</div>}

      {carregando ? (
        <div className="skeleton" style={{ height: 80 }} />
      ) : rules.length === 0 ? (
        <p className="setting-hint">
          Nenhuma regra sua ainda. O app já reconhece sozinho as lojas mais comuns
          (Uber, iFood, Netflix, postos, farmácias); estas aqui são as que ele
          aprende com as suas correções, e elas ganham das embutidas.
        </p>
      ) : (
        <ul className="rule-list">
          {rules.map(rule => (
            <li key={rule.id}>
              <code>{rule.pattern}</code>
              <span className="rule-arrow">→</span>
              <span className="rule-cat">
                <span className="dot" style={{ background: rule.category?.color }} />
                {rule.category?.name}
              </span>
              {rule.hits > 0 && (
                <em className="rule-hits">
                  {rule.hits} {rule.hits === 1 ? 'acerto' : 'acertos'}
                </em>
              )}
              <button
                className="btn-icon"
                onClick={() => remover(rule)}
                aria-label={`Apagar regra ${rule.pattern}`}
              >
                <Icon name="remover" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
