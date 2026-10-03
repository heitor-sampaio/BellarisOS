#!/usr/bin/env node
/**
 * Cria o PRIMEIRO admin da plataforma (a equipe do BellarisOS que atende as
 * redes). Os seguintes são cadastrados pela tela, em /suporte/equipe.
 *
 *   node scripts/plataforma-primeiro-admin.mjs <email> "<Nome>"
 *
 * Lê `.env.local` (precisa de NEXT_PUBLIC_SUPABASE_URL e
 * SUPABASE_SERVICE_ROLE_KEY). O login nasce SEM senha e com a marca
 * `app_metadata.plataforma = 'ADMIN'`; o script imprime o link de definir a
 * senha (vale uma vez). No primeiro acesso, /suporte/verificacao pede o
 * cadastro do autenticador — a verificação em duas etapas é obrigatória.
 *
 * Fica fora das migrations porque é dado (e-mail de uma pessoa), não schema.
 * E-mail de membro de rede é recusado: a mesma pessoa não pode ser as duas.
 */
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env.local') } catch { /* variáveis já no ambiente */ }

const [email, ...resto] = process.argv.slice(2)
const nome = resto.join(' ').trim()
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nome) {
  console.error('Uso: node scripts/plataforma-primeiro-admin.mjs <email> "<Nome>"')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !chave) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(url, chave, { auth: { persistSession: false } })
const emailNormal = email.trim().toLowerCase()

const { data: daRede } = await db.from('users').select('id').eq('email', emailNormal).limit(1)
if (daRede?.length) {
  console.error('Este e-mail é de um membro de rede. Use outro para a plataforma.')
  process.exit(1)
}
const { data: jaTem } = await db.from('platform_staff').select('id').eq('email', emailNormal).limit(1)
if (jaTem?.length) {
  console.error('Este e-mail já está na equipe da plataforma.')
  process.exit(1)
}

const { data: criado, error } = await db.auth.admin.createUser({
  email: emailNormal, email_confirm: true, app_metadata: { plataforma: 'ADMIN' },
})
if (error || !criado?.user) {
  console.error('O Auth recusou o cadastro:', error?.message ?? 'sem usuário')
  process.exit(1)
}

const { error: eStaff } = await db.from('platform_staff').insert({
  auth_id: criado.user.id, name: nome, email: emailNormal, papel: 'ADMIN',
})
if (eStaff) {
  await db.auth.admin.deleteUser(criado.user.id)
  console.error('Não consegui gravar na equipe:', eStaff.message)
  process.exit(1)
}

const app = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bellarisos.com').replace(/\/$/, '')
const { data: link, error: eLink } = await db.auth.admin.generateLink({
  type: 'recovery', email: emailNormal,
  options: { redirectTo: `${app}/auth/confirm?next=/update-password` },
})
console.log(`Admin da plataforma criado: ${nome} <${emailNormal}>`)
if (eLink || !link?.properties?.action_link) {
  console.log('Não consegui gerar o link de senha:', eLink?.message, '— use "Esqueci minha senha" no login.')
} else {
  console.log('Defina a senha por este link (vale uma vez):')
  console.log(link.properties.action_link)
}
console.log('Depois, entre em /login: o /suporte pede o cadastro do autenticador.')
