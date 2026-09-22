'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SUBTITLES = {
  login: 'Acesse seu controle financeiro',
  register: 'Crie sua conta',
  reset: 'Troque sua senha',
};

const SUBMIT_LABELS = {
  login: 'Entrar',
  register: 'Criar conta',
  reset: 'Trocar senha',
};

export default function LoginForm({ allowRegistration = false, allowReset = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [resetCode, setResetCode] = useState('');
  const router = useRouter();

  const isRegister = mode === 'register';
  const isReset = mode === 'reset';

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setSuccess('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const endpoint = {
        login: '/api/auth/login',
        register: '/api/auth/register',
        reset: '/api/auth/reset',
      }[mode];
      const body = {
        login: { email, password },
        register: { email, password, name, invite },
        reset: { email, password, code: resetCode },
      }[mode];

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao processar');
        return;
      }

      // A troca não abre sessão: volta para o login com o email já
      // preenchido, e a pessoa entra com a senha nova.
      if (isReset) {
        setMode('login');
        setPassword('');
        setResetCode('');
        setSuccess('Senha trocada. Entre com a nova senha.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="card login-card animate-in">
        <div className="login-title">FinControl</div>
        <div className="login-subtitle">{SUBTITLES[mode]}</div>

        {error && <div className="login-error">{error}</div>}
        {success && <div className="login-success">{success}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">Código de convite</label>
              <input
                type="text"
                className="form-input"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="Peça o código a quem te convidou"
                required
              />
            </div>
          )}

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>

          {isReset && (
            <div className="form-group">
              <label className="form-label">Código de troca de senha</label>
              <input
                type="text"
                className="form-input"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="Peça o código a quem administra o app"
                autoComplete="off"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{isReset ? 'Nova senha' : 'Senha'}</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'login' ? 6 : 8}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Aguarde...' : SUBMIT_LABELS[mode]}
          </button>
        </form>

        {mode === 'login' && allowReset && (
          <div style={{ marginTop: '16px', fontSize: '0.85rem' }}>
            <button className="link-button" onClick={() => switchMode('reset')}>Esqueci minha senha</button>
          </div>
        )}

        {(allowRegistration || isReset) && (
          <div style={{ marginTop: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {mode === 'login' ? (
              <>Não tem conta? <button className="link-button" onClick={() => switchMode('register')}>Criar conta</button></>
            ) : (
              <>{isReset ? 'Lembrou a senha?' : 'Já tem conta?'} <button className="link-button" onClick={() => switchMode('login')}>Entrar</button></>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
