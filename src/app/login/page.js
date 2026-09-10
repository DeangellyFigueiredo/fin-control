import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  // Lido no servidor: o link de cadastro só aparece quando o cadastro está
  // realmente liberado, evitando um caminho que sempre daria erro.
  const allowRegistration = process.env.ALLOW_REGISTRATION === 'true';

  return <LoginForm allowRegistration={allowRegistration} />;
}
