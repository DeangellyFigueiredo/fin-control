import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * Troca de senha por código, no mesmo molde do convite: quem tiver o valor
 * de RESET_CODE redefine a senha de um email. É um código separado do
 * convite de propósito — se fosse o mesmo, qualquer convidado poderia
 * trocar a senha de outra pessoa. Sem a variável, a troca fica fechada.
 */
export async function POST(request) {
  const resetCode = process.env.RESET_CODE;

  if (!resetCode) {
    return NextResponse.json({ error: 'Troca de senha desabilitada' }, { status: 403 });
  }

  try {
    const { email, code, password } = await request.json();

    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Email, código e nova senha são obrigatórios' }, { status: 400 });
    }

    // Email e código errados dão a mesma resposta, para a tela não servir
    // de consulta de quais emails têm conta.
    const invalid = NextResponse.json({ error: 'Email ou código inválido' }, { status: 403 });

    if (String(code).trim() !== resetCode) {
      return invalid;
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) {
      return invalid;
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
