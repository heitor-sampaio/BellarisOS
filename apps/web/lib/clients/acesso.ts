import 'server-only'
import { randomBytes } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { tagDasFichasDoLogin } from '@/lib/cached-queries'
import { erroDoAuth, SENHA_FRACA } from '@/lib/erro-do-auth'
import { origemPublicaDe } from '@/lib/origem'
import type { DocumentoDoAcesso } from './documento-do-acesso'

export { documentoDoAcesso, type DocumentoDoAcesso } from './documento-do-acesso'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O ACESSO do cliente ao app/portal (§5): login = e-mail, senha inicial = o
 * CPF — ou, sem CPF, o número do documento da ficha (passaporte, RNE; decisão
 * 1 do Heitor, 2026-11-05: era "sem CPF, sem acesso ao app por enquanto"). O
 * núcleo que a tela "Cadastrar cliente" e o Copilot dividem (2026-10-08). Não
 * confere o MÓDULO (quem chama confere).
 *
 * A mesma pessoa pode ser cliente de várias redes com um login só
 * (2026-10-19): se o e-mail já tem conta de CLIENTE e uma ficha dela (de outra
 * rede) tem o mesmo CPF — ou, sem CPF, o mesmo passaporte/RNE —, a ficha
 * desta rede é LIGADA a essa conta; a senha continua a que ela já usa
 * (`login_de_cliente_para_ligar_doc`).
 *
 * O documento RECUSADO como senha (a proteção contra senha vazada do Auth;
 * decisão do Heitor, 24/11, à R1 da 27ª — "E-mail para criar a senha"): o
 * login nasce com uma senha aleatória forte que ninguém recebe (provisória,
 * como toda senha dada por outra pessoa), a ficha é ligada, e a cliente recebe
 * o e-mail para criar a própria senha — o caminho do "esqueci a senha"
 * (`/auth/confirm` → `/update-password`). A tela diz à equipe que foi isso.
 */

export type LoginDoCliente =
  /**
   * `novo`: o login nasceu agora (rollback apaga). Senão é a conta que ela já tinha — nunca se apaga.
   * `senhaPorEmail`: o documento foi recusado como senha; ligada a ficha, sai o e-mail para criar a senha.
   */
  | { authId: string; novo: boolean; senhaPorEmail?: true }
  | { error: string }

const RECUSA: Record<string, string> = {
  equipe:        'Este e-mail já está em uso por outra conta.',
  cpf:           'Este e-mail já tem uma conta no BellarisOS com outro CPF. Confira o e-mail e o CPF da cliente.',
  documento:     'Este e-mail já tem uma conta no BellarisOS com outro documento. Confira o e-mail e o documento da cliente.',
  ja_nesta_rede: 'Esta pessoa já tem acesso ao app por outra ficha desta rede.',
}

/** O que aconteceu com o e-mail para criar a senha (só quando o documento foi recusado). */
export type EmailParaCriarSenha = 'enviado' | 'falhou'

/**
 * O login da cliente: o que ela já tem (de outra rede, com o mesmo
 * documento) ou um novo. E-mail de equipe, documento que não bate ou login já
 * desta rede → a mensagem para a tela, e nada criado.
 */
export async function criarLoginDoCliente(
  admin: Admin, tenantId: string, email: string, doc: DocumentoDoAcesso,
): Promise<LoginDoCliente> {
  const cpf = doc.tipo === 'CPF' ? doc.numero.replace(/\D/g, '') : null
  const existente = await ler(admin.rpc('login_de_cliente_para_ligar_doc', {
    p_email: email, p_tenant: tenantId, p_cpf: cpf,
    p_documento_tipo: doc.tipo === 'CPF' ? null : doc.tipo,
    p_documento_numero: doc.tipo === 'CPF' ? null : doc.numero,
  }), 'conferir se o e-mail já tem conta') as { auth_id: string; motivo: string }[] | null
  const conta = existente?.[0]
  if (conta) {
    if (conta.motivo === 'ligar') return { authId: conta.auth_id, novo: false }
    return { error: RECUSA[conta.motivo] ?? RECUSA.equipe! }
  }

  // A senha inicial é o documento (o CPF só com os dígitos; o passaporte e o
  // RNE como estão na ficha): provisória, troca-se no primeiro acesso (o proxy).
  const senha = cpf ?? doc.numero
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { senha_provisoria: true } })
  if (error || !data?.user) {
    // Entre a conferência e a criação, outro caminho criou o login.
    const ja = /already|registered|exists/i.test(error?.message ?? '')
    if (ja) return { error: RECUSA.equipe! }
    // O Auth fala inglês, e a tela mostrava "Password is known to be weak…"
    // cru (D12, 2026-10-29). A senha inicial é o documento: a fraca é ele.
    console.error('[acesso] criar o login da cliente:', error?.code, error?.message)
    const texto = erroDoAuth(error)
    if (texto !== SENHA_FRACA) return { error: texto }
    // O documento recusado (24/11, R1 da 27ª): uma senha que ninguém recebe,
    // e a cliente cria a dela pelo e-mail, depois de a ficha ligar.
    // `senha_por_email`: a ficha diz que o acesso espera a pessoa criar a
    // senha (A4 da 31ª; `lib/clients/acesso-pendente.ts`).
    const aleatoria = randomBytes(24).toString('base64url')
    const segunda = await admin.auth.admin.createUser({ email, password: aleatoria, email_confirm: true, app_metadata: { senha_provisoria: true, senha_por_email: true } })
    if (segunda.error || !segunda.data?.user) {
      console.error('[acesso] criar o login da cliente (senha aleatória):', segunda.error?.code, segunda.error?.message)
      return { error: /already|registered|exists/i.test(segunda.error?.message ?? '') ? RECUSA.equipe! : erroDoAuth(segunda.error) }
    }
    return { authId: segunda.data.user.id, novo: true, senhaPorEmail: true }
  }
  return { authId: data.user.id, novo: true }
}

/**
 * Depois de a ficha gravar com o `auth_id`: no login NOVO, as claims do
 * cliente (role CLIENT, client_id); no que ela já tinha, nada muda no token (a
 * claim é só a marca "é cliente") — só a lista de fichas do login, que o
 * portal lê, expira na hora. Com o documento recusado como senha
 * (`senhaPorEmail`), sai o e-mail para ela criar a senha.
 */
export async function ligarLoginAoCliente(
  admin: Admin, login: { authId: string; novo: boolean; senhaPorEmail?: true }, clientId: string, email: string,
): Promise<{ emailParaCriarSenha?: EmailParaCriarSenha }> {
  if (login.novo) {
    await gravar(admin.rpc('set_client_claims', { p_auth_id: login.authId, p_client_id: clientId }), 'gravar os dados de acesso do cliente')
  }
  revalidateTag(tagDasFichasDoLogin(login.authId), { expire: 0 })
  if (!login.senhaPorEmail) return {}
  return { emailParaCriarSenha: await mandarEmailParaCriarSenha(admin, email) }
}

/**
 * O e-mail de "Defina sua senha" (o template de recuperação,
 * `supabase/templates/redefinir-senha.html`, que leva o `token_hash` a
 * `/auth/confirm`). Pelo cliente de serviço, não pelo da sessão: o fluxo PKCE
 * guardaria o verificador no navegador de quem cadastrou, e o link não
 * abriria no celular dela. Falhou (o limite de envios), a ficha e o login
 * ficam, e a tela diz o caminho do "Esqueci a senha".
 */
async function mandarEmailParaCriarSenha(admin: Admin, email: string): Promise<EmailParaCriarSenha> {
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origemPublicaDe(await headers())}/auth/confirm?next=/update-password`,
  })
  if (error) console.error('[acesso] o e-mail para criar a senha:', error.code, error.message)
  return error ? 'falhou' : 'enviado'
}

/** Desfaz o login que nasceu órfão (a ficha não gravou). A conta que ela já tinha fica. */
export async function desfazerLogin(admin: Admin, login: { authId: string; novo: boolean }): Promise<void> {
  if (!login.novo) return
  await admin.auth.admin.deleteUser(login.authId).catch(() => {})
}

/**
 * Dá acesso a quem JÁ é cliente da rede e ainda não tem: grava o e-mail (e o
 * CPF, quando é ele o documento) na ficha, cria (ou acha) o login e o liga.
 * Ficha que já tem acesso é recusada. O passaporte/RNE já está na ficha.
 */
export async function darAcessoAoCliente(
  admin: Admin, ctx: TenantContext, clientId: string, email: string, doc: DocumentoDoAcesso,
): Promise<{ ok: true; contaLigada: boolean; emailParaCriarSenha?: EmailParaCriarSenha } | { error: string }> {
  const ficha = await ler(admin.from('clients').select('id, auth_id')
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente') as { id: string; auth_id: string | null } | null
  if (!ficha) return { error: 'Cliente não encontrado.' }
  if (ficha.auth_id) return { error: 'Este cliente já tem acesso ao app.' }

  const login = await criarLoginDoCliente(admin, ctx.tenantId!, email, doc)
  if ('error' in login) return login
  let enviado: { emailParaCriarSenha?: EmailParaCriarSenha } = {}
  try {
    // Com a guarda: duas tentativas ao mesmo tempo não ligam dois logins.
    const ligadas = await gravar(admin.from('clients')
      .update({
        auth_id: login.authId, email,
        ...(doc.tipo === 'CPF' ? { document: doc.numero.replace(/\D/g, '') } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId).eq('tenant_id', ctx.tenantId!).is('auth_id', null).select('id'), 'ligar o acesso ao cliente') as { id: string }[] | null
    if (!ligadas?.length) {
      await desfazerLogin(admin, login)
      return { error: 'Este cliente acabou de ganhar acesso por outro caminho.' }
    }
    enviado = await ligarLoginAoCliente(admin, login, clientId, email)
  } catch (e) {
    await desfazerLogin(admin, login)
    throw e
  }
  // `contaLigada`: a conta que ela já tinha (outra rede) — a senha é a dela, não o documento (J-22).
  return { ok: true, contaLigada: !login.novo, ...enviado }
}
