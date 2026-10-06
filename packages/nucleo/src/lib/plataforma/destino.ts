/**
 * Onde mora cada parte da PLATAFORMA (2026-10-06): dois apps, cada um no seu
 * host —
 *  - o SISTEMA (`apps/sistema`, admin.bellarisos.com): a administração do
 *    negócio (redes, planos, cobrança, equipe, auditoria). Só ADMIN.
 *  - o SUPORTE (`apps/suporte`, suporte.bellarisos.com): o atendimento
 *    (chamados, diagnóstico, "entrar como"). SUPORTE e ADMIN.
 * Quem é ADMIN entra nos dois, uma sessão em cada (cookie é do host). A
 * clínica (`apps/web`) recusa a marca da plataforma.
 *
 * A marca vem de `app_metadata.plataforma`; quem barra de verdade é o proxy
 * de cada app e `getPlatformContext` em cada página e action.
 */
export type HostDaPlataforma = 'sistema' | 'suporte'

type Ambiente = Record<string, string | undefined>

/** A marca entra neste host? */
export function aceitaNoHost(host: HostDaPlataforma, marca: string | null | undefined): boolean {
  if (marca === 'ADMIN') return true
  return host === 'suporte' && marca === 'SUPORTE'
}

/**
 * O que o login (e a porta) de um host diz a quem não é dele — `null` para
 * quem é. A clínica tem a sua mensagem (a da equipe da plataforma que entrou
 * no lugar errado), em `apps/web`.
 */
export function recusaDoHost(host: HostDaPlataforma, marca: string | null | undefined): string | null {
  if (marca !== 'ADMIN' && marca !== 'SUPORTE') {
    return 'Este acesso é só da equipe do BellarisOS. A clínica entra pelo app.'
  }
  if (!aceitaNoHost(host, marca)) return 'O Sistema é só da administração. Entre pelo suporte.'
  return null
}

/**
 * O endereço público do host, do ambiente (`SISTEMA_URL`, `SUPORTE_URL`) —
 * nunca do pedido: o standalone monta `req.url` com o endereço em que escuta
 * (§6 do CLAUDE.md). Sem a variável, falha alto.
 */
export function urlDoHost(host: HostDaPlataforma, env: Ambiente = process.env): string {
  const nome = host === 'sistema' ? 'SISTEMA_URL' : 'SUPORTE_URL'
  const url = env[nome]
  if (!url) throw new Error(`${nome} não está definida`)
  return url.replace(/\/+$/, '')
}

/** O endereço da clínica (`CLINICA_URL`), para o que a plataforma manda para lá. */
export function urlDaClinica(env: Ambiente = process.env): string {
  const url = env.CLINICA_URL ?? env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('CLINICA_URL não está definida')
  return url.replace(/\/+$/, '')
}

/**
 * Para onde volta o e-mail de "definir senha" que a plataforma manda: o
 * membro de rede entra pela CLÍNICA; o atendente, pelo host do papel dele. O
 * host de quem clicou não serve — com dois apps, o link sairia no host errado.
 */
export function linkDeDefinirSenha(
  quem: { para: 'membro' } | { para: 'atendente'; papel: 'ADMIN' | 'SUPORTE' },
  env: Ambiente = process.env,
): string {
  const base = quem.para === 'membro' ? urlDaClinica(env) : urlDoHost(quem.papel === 'ADMIN' ? 'sistema' : 'suporte', env)
  return `${base}/auth/confirm?next=/update-password`
}

/** Onde a pessoa da plataforma começa: o ADMIN no sistema, o SUPORTE no suporte. */
export function inicioDaPlataforma(marca: string | null | undefined, env: Ambiente = process.env): string {
  return `${urlDoHost(marca === 'ADMIN' ? 'sistema' : 'suporte', env)}/`
}
