'use client';

import { useEffect, useState } from 'react';
import { NOME_DA_UF } from '@/lib/lugares';

/**
 * Fotos dos lugares por URL (RFC 0004). O app guarda e mostra o endereço;
 * a imagem vem direto da Wikimedia (ou do link colado), com crédito.
 */

// Uma busca por chave durante a vida da página: dez cartões da mesma cidade
// fazem uma chamada só
const memoria = new Map();

function buscarUmaVez(chave, url) {
  if (!memoria.has(chave)) {
    memoria.set(chave, fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));
  }
  return memoria.get(chave);
}

export function usePaginaWiki(titulo) {
  const [pagina, setPagina] = useState(null);
  useEffect(() => {
    if (!titulo) { setPagina(null); return; }
    let vivo = true;
    buscarUmaVez(`t:${titulo}`, `/api/externo/wiki?titulo=${encodeURIComponent(titulo)}`)
      .then(p => { if (vivo) setPagina(p?.encontrado ? p : null); });
    return () => { vivo = false; };
  }, [titulo]);
  return pagina;
}

const sem = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Busca a página de uma cidade: o título precisa começar com o nome dela
 * ("Bento Gonçalves (Rio Grande do Sul)" serve). O primeiro resultado com foto
 * não basta: para "Cambará do Sul Rio Grande do Sul" ele é a página do estado.
 * A busca não traz o crédito; quem mostra a foto pede a página, que traz.
 */
function useTituloDaCidade(texto, cidade) {
  const [titulo, setTitulo] = useState(null);
  useEffect(() => {
    if (!texto) { setTitulo(null); return; }
    let vivo = true;
    buscarUmaVez(`b:${texto}`, `/api/externo/wiki?busca=${encodeURIComponent(texto)}`)
      .then(r => {
        if (!vivo) return;
        const certa = r?.paginas?.find(p => p.miniatura && sem(p.titulo).startsWith(sem(cidade)));
        setTitulo(certa?.titulo || null);
      });
    return () => { vivo = false; };
  }, [texto, cidade]);
  return titulo;
}

/**
 * Foto de uma parada ou atividade, na ordem da RFC: a foto salva, a da
 * página da Wikipedia escolhida e, só para cidades, a da página da cidade.
 * A foto automática da cidade não é gravada: vale enquanto ninguém escolher.
 */
export function useFoto(item, { cidade = false } = {}) {
  const salva = item?.photoUrl
    ? { url: item.photoUrl, credito: item.photoCredit, fonte: item.photoSourceUrl }
    : null;
  const busca = cidade && !salva && !item?.wikiTitle && item?.city
    ? `${item.city} ${NOME_DA_UF[item.uf] || ''}`.trim()
    : null;
  const achado = useTituloDaCidade(busca, item?.city);
  const pagina = usePaginaWiki(!salva ? item?.wikiTitle || achado : null);
  return salva || pagina?.foto || null;
}

const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/**
 * A foto com o crédito por cima. Se a imagem não carregar (link quebrado,
 * site que bloqueia), o componente some e o cartão volta ao visual sem foto.
 *
 * `emBotao` troca figure/figcaption por span e o link do crédito por texto:
 * dentro de um <button> (o cartão do bloco), HTML não aceita nenhum dos dois.
 */
export function Foto({ foto, className = '', alt = '', mostrarCredito = true, emBotao = false }) {
  const [quebrou, setQuebrou] = useState(false);
  useEffect(() => setQuebrou(false), [foto?.url]);
  if (!foto?.url || quebrou) return null;

  const credito = foto.credito || (foto.fonte ? `foto: ${dominio(foto.fonte)}` : null);
  const Caixa = emBotao ? 'span' : 'figure';
  const Legenda = emBotao ? 'span' : 'figcaption';
  return (
    <Caixa className={`foto ${className}`}>
      <img src={foto.url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setQuebrou(true)} />
      {mostrarCredito && credito && (
        <Legenda className="foto-credito">
          {foto.fonte && !emBotao
            ? <a href={foto.fonte} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{credito}</a>
            : credito}
        </Legenda>
      )}
    </Caixa>
  );
}
