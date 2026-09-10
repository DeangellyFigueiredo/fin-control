import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  // Lido no servidor: o link de cadastro só aparece quando existe um código
  // de convite configurado, evitando um caminho que sempre daria erro.
  const allowRegistration = Boolean(process.env.INVITE_CODE);

  return <LoginForm allowRegistration={allowRegistration} />;
}
