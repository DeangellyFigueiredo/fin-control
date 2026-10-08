'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import { Foto } from './fotos';

/**
 * Campo de foto dos formulários de parada e atividade (RFC 0004). Duas
 * origens: uma página da Wikipedia (foto com crédito e licença) ou um link
 * colado. O valor é `{ wikiTitle, photoUrl, photoCredit, photoSourceUrl }`.
 */
export default function FotoCampo({ valor, onChange, buscaInicial = '' }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [link, setLink] = useState(valor.photoUrl && !valor.wikiTitle ? valor.photoUrl : '');

  const atual = valor.photoUrl ? { url: valor.photoUrl, credito: valor.photoCredit, fonte: valor.photoSourceUrl } : null;

  const procurar = async () => {
    if (!busca.trim()) return;
    setErro('');
    setBuscando(true);
    const res = await fetch(`/api/externo/wiki?busca=${encodeURIComponent(busca.trim())}`).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    setBuscando(false);
    if (!data) return setErro('Wikipedia indisponível agora. Cole um link de foto, se tiver.');
    setResultados(data.paginas);
  };

  // A busca traz só a miniatura; o crédito vem da página, pedida ao escolher
  const escolher = async (p) => {
    setErro('');
    const res = await fetch(`/api/externo/wiki?titulo=${encodeURIComponent(p.titulo)}`).catch(() => null);
    const pagina = res?.ok ? await res.json() : null;
    if (!pagina?.encontrado) return setErro('Não deu para carregar essa página agora. Tente de novo.');
    onChange({
      wikiTitle: pagina.titulo,
      photoUrl: pagina.foto?.url || null,
      photoCredit: pagina.foto?.credito || null,
      photoSourceUrl: pagina.foto?.fonte || pagina.url,
    });
    setResultados(null);
    setLink('');
  };

  const colar = (url) => {
    setLink(url);
    const valido = /^https:\/\/\S+$/.test(url.trim());
    onChange({
      wikiTitle: null,
      photoUrl: valido ? url.trim() : null,
      photoCredit: null,
      photoSourceUrl: valido ? url.trim() : null,
    });
  };

  const remover = () => {
    onChange({ wikiTitle: null, photoUrl: null, photoCredit: null, photoSourceUrl: null });
    setLink('');
  };

  return (
    <fieldset className="roteiro-fieldset">
      <legend>Foto</legend>

      {atual && (
        <div className="foto-campo-atual">
          <Foto foto={atual} className="foto-previa" />
          <div>
            {valor.wikiTitle && <p className="quick-add-note" style={{ margin: 0 }}>Wikipedia: {valor.wikiTitle}</p>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={remover}>Tirar a foto</button>
          </div>
        </div>
      )}

      <div className="foto-campo-busca">
        <input
          className="form-input" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Nome do lugar" aria-label="Buscar foto na Wikipedia"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); procurar(); } }}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={procurar} disabled={buscando || !busca.trim()}>
          {buscando ? 'Buscando…' : 'Buscar na Wikipedia'}
        </button>
      </div>
      {erro && <p className="quick-add-note" style={{ margin: 0 }}>{erro}</p>}

      {resultados && (
        resultados.length === 0 ? (
          <p className="quick-add-note" style={{ margin: 0 }}>Nada encontrado. Tente outro nome ou cole um link.</p>
        ) : (
          <ul className="foto-campo-resultados">
            {resultados.map(p => (
              <li key={p.titulo}>
                <button type="button" onClick={() => escolher(p)}>
                  {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="foto-campo-sem"><Icon name="local" /></span>}
                  <span>
                    <strong>{p.titulo}</strong>
                    <small>{p.resumo.slice(0, 110)}{p.resumo.length > 110 ? '…' : ''}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      <input
        className="form-input" type="url" value={link} onChange={e => colar(e.target.value)}
        placeholder="ou cole o link de uma foto (https://...)" aria-label="Link da foto"
      />
    </fieldset>
  );
}
