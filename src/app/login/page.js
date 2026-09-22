import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  // Lidos no servidor: os links de cadastro e de troca de senha só aparecem
  // quando o código correspondente está configurado, evitando um caminho
  // que sempre daria erro.
  const allowRegistration = Boolean(process.env.INVITE_CODE);
  const allowReset = Boolean(process.env.RESET_CODE);

  return <LoginForm allowRegistration={allowRegistration} allowReset={allowReset} />;
}
