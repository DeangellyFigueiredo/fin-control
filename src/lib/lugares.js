/**
 * Cidades para o campo de parada do roteiro, sem API de geocoding: não há
 * chave, custo nem rede. Coordenadas do centro da cidade, aproximadas a
 * duas casas (~1 km). Fora da lista, o campo aceita lat/lng colados do
 * Google Maps. Ver docs/rfc/0003-roteiro.md.
 */

const L = (nome, uf, lat, lng) => ({ nome, uf, lat, lng });

export const LUGARES = [
  // Santa Catarina
  L('Itapema', 'SC', -27.09, -48.61),
  L('Balneário Camboriú', 'SC', -26.99, -48.63),
  L('Bombinhas', 'SC', -27.14, -48.51),
  L('Porto Belo', 'SC', -27.16, -48.55),
  L('Itajaí', 'SC', -26.91, -48.66),
  L('Penha', 'SC', -26.77, -48.65),
  L('Brusque', 'SC', -27.10, -48.92),
  L('Blumenau', 'SC', -26.92, -49.07),
  L('Pomerode', 'SC', -26.74, -49.18),
  L('Jaraguá do Sul', 'SC', -26.49, -49.07),
  L('Joinville', 'SC', -26.30, -48.85),
  L('São Francisco do Sul', 'SC', -26.24, -48.64),
  L('Governador Celso Ramos', 'SC', -27.32, -48.56),
  L('Florianópolis', 'SC', -27.60, -48.55),
  L('Palhoça', 'SC', -27.64, -48.67),
  L('Rancho Queimado', 'SC', -27.67, -49.02),
  L('Garopaba', 'SC', -28.03, -48.62),
  L('Imbituba', 'SC', -28.24, -48.67),
  L('Laguna', 'SC', -28.48, -48.78),
  L('Tubarão', 'SC', -28.47, -49.01),
  L('Criciúma', 'SC', -28.68, -49.37),
  L('Urubici', 'SC', -28.01, -49.59),
  L('Bom Jardim da Serra', 'SC', -28.34, -49.63),
  L('São Joaquim', 'SC', -28.29, -49.93),
  L('Lages', 'SC', -27.82, -50.33),
  L('Treze Tílias', 'SC', -27.00, -51.41),
  L('Chapecó', 'SC', -27.10, -52.62),
  L('Praia Grande', 'SC', -29.19, -49.95),

  // Rio Grande do Sul
  L('Torres', 'RS', -29.33, -49.73),
  L('Cambará do Sul', 'RS', -29.05, -50.14),
  L('São Francisco de Paula', 'RS', -29.45, -50.58),
  L('Gramado', 'RS', -29.38, -50.87),
  L('Canela', 'RS', -29.36, -50.81),
  L('Nova Petrópolis', 'RS', -29.38, -51.11),
  L('Caxias do Sul', 'RS', -29.17, -51.18),
  L('Farroupilha', 'RS', -29.22, -51.35),
  L('Flores da Cunha', 'RS', -29.03, -51.18),
  L('Antônio Prado', 'RS', -28.86, -51.28),
  L('Bento Gonçalves', 'RS', -29.17, -51.52),
  L('Pinto Bandeira', 'RS', -29.10, -51.45),
  L('Garibaldi', 'RS', -29.26, -51.53),
  L('Carlos Barbosa', 'RS', -29.30, -51.50),
  L('Monte Belo do Sul', 'RS', -29.16, -51.63),
  L('Veranópolis', 'RS', -28.94, -51.55),
  L('Bom Jesus', 'RS', -28.67, -50.43),
  L('Vacaria', 'RS', -28.51, -50.93),
  L('Passo Fundo', 'RS', -28.26, -52.41),
  L('Novo Hamburgo', 'RS', -29.68, -51.13),
  L('Porto Alegre', 'RS', -30.03, -51.23),
  L('Capão da Canoa', 'RS', -29.75, -50.01),
  L('Tramandaí', 'RS', -29.98, -50.13),
  L('Santa Maria', 'RS', -29.69, -53.81),
  L('Pelotas', 'RS', -31.77, -52.34),
  L('Rio Grande', 'RS', -32.03, -52.10),

  // Paraná
  L('Curitiba', 'PR', -25.43, -49.27),
  L('Morretes', 'PR', -25.48, -48.83),
  L('Antonina', 'PR', -25.43, -48.71),
  L('Paranaguá', 'PR', -25.52, -48.51),
  L('Matinhos', 'PR', -25.82, -48.54),
  L('Guaratuba', 'PR', -25.88, -48.57),
  L('Lapa', 'PR', -25.77, -49.72),
  L('Ponta Grossa', 'PR', -25.09, -50.16),
  L('Londrina', 'PR', -23.31, -51.16),
  L('Foz do Iguaçu', 'PR', -25.55, -54.59),
];

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Cidades que começam com o texto primeiro, depois as que o contêm. */
export function buscarLugar(texto, limite = 6) {
  const t = normalizar(texto);
  if (!t) return [];
  const comeca = [];
  const contem = [];
  for (const l of LUGARES) {
    const n = normalizar(l.nome);
    if (n.startsWith(t)) comeca.push(l);
    else if (n.includes(t)) contem.push(l);
  }
  return [...comeca, ...contem].slice(0, limite);
}

/**
 * "-29.38, -50.87" colado do Google Maps, com vírgula ou espaço entre os
 * dois números. Devolve `{ lat, lng }` ou null.
 */
export function lerCoordenadas(texto) {
  const m = String(texto || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Nome do estado, para buscar a cidade certa ("Itapema, Santa Catarina"). */
export const NOME_DA_UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

/** A cidade da lista com esse nome (e UF, se vier), ignorando acento e caixa. */
export function lugarExato(nome, uf) {
  const n = normalizar(nome);
  const u = String(uf || '').toUpperCase();
  return LUGARES.find(l => normalizar(l.nome) === n && (!u || l.uf === u)) || null;
}
