import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signToken, setSessionCookie } from '@/lib/auth';

export async function POST(request) {
  // O app é de usuário único: contas, transações e cartões não são
  // separados por usuário, então qualquer conta criada enxerga os mesmos
  // dados. Por isso o cadastro fica fechado, a não ser que seja liberado
  // de propósito para criar a primeira conta.
  if (process.env.ALLOW_REGISTRATION !== 'true') {
    return NextResponse.json({ error: 'Cadastro desabilitado' }, { status: 403 });
  }

  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name || null },
    });

    const token = await signToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
