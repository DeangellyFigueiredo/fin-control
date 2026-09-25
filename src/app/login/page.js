import LoginForm from '@/components/LoginForm';
import { destinoSeguro } from '@/lib/safeNext';

export default async function LoginPage({ searchParams }) {
  // Lidos no servidor: os links de cadastro e de troca de senha só aparecem
  // quando o código correspondente está configurado, evitando um caminho
  // que sempre daria erro.
  const allowRegistration = Boolean(process.env.INVITE_CODE);
  const allowReset = Boolean(process.env.RESET_CODE);

  // Para onde voltar depois de entrar, como o link de um convite de viagem.
  // Validado aqui e de novo no formulário: o valor vem da URL.
  const { next } = await searchParams;
  const destino = destinoSeguro(next);

  return <LoginForm allowRegistration={allowRegistration} allowReset={allowReset} next={destino} />;
}
