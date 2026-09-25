/** @type {import('next').NextConfig} */
const nextConfig = {
  // O link de convite de viagem carrega o token na URL, e o login também,
  // dentro do `next`. Sem esta política, o token iria no cabeçalho Referer
  // de qualquer recurso ou link externo aberto a partir dessas páginas.
  async headers() {
    const semReferer = [{ key: 'Referrer-Policy', value: 'no-referrer' }];
    return [
      { source: '/trips/invite/:token*', headers: semReferer },
      { source: '/login', headers: semReferer },
    ];
  },
};

export default nextConfig;
