import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signToken, setSessionCookie } from '@/lib/auth';

/**
 * O cadastro é aberto a quem tem o código de convite, definido em
 * INVITE_CODE. Sem a variável, ninguém se cadastra — evita que uma URL
 * pública vire porta de entrada para contas indesejadas.
 */
export async function POST(request) {
  const inviteCode = process.env.INVITE_CODE;

  if (!inviteCode) {
    return NextResponse.json({ error: 'Cadastro desabilitado' }, { status: 403 });
  }

  try {
    const { email, password, name, invite } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    if (String(invite || '').trim() !== inviteCode) {
      return NextResponse.json({ error: 'Código de convite inválido' }, { status: 403 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, password: hashed, name: name || null },
    });

    // Sem dados ainda: o passo a passo inicial monta tudo, inclusive as
    // categorias, que agora são por usuário.
    const token = await signToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
