/**
 * Onde mora cada parte da PLATAFORMA (2026-10-06): dois apps, cada um no seu
 * host —
 *  - o SISTEMA (`apps/sistema`, admin.bellarisos.com): a administração do
 *    negócio (redes, planos, cobrança, equipe, auditoria). Só ADMIN.
 *  - o SUPORTE (`apps/suporte`, suporte.bellarisos.com): o atendimento
 *    (chamados, diagnóstico, "entrar como"). SUPORTE e ADMIN.
 * Quem é ADMIN entra nos dois, uma sessão em cada (cookie é do host). O
 * GERENTE (2026-10-07) entra só no sistema, e só VÊ. A clínica (`apps/web`)
 * recusa a marca da plataforma.
 *
 * A marca vem de `app_metadata.plataforma`; quem barra de verdade é o proxy
 * de cada app e `getPlatformContext` em cada página e action.
 */
export type HostDaPlataforma = 'sistema' | 'suporte'

type Ambiente = Record<string, string | undefined>

/**
 * O que cada papel ALCANÇA (2026-10-07):
 *  - `administrar`: gravar no sistema (redes, planos, cobrança, equipe) — só ADMIN;
 *  - `ver-sistema`: abrir as telas do sistema — ADMIN e GERENTE;
 *  - `atender`: o suporte (chamados, "entrar como") — SUPORTE e ADMIN.
 * Papel novo não alcança nada até ser posto aqui.
 */
export type AlcanceDaPlataforma = 'administrar' | 'ver-sistema' | 'atender'
export function papelAlcanca(papel: string | null | undefined, alcance: AlcanceDaPlataforma): boolean {
  if (alcance === 'administrar') return papel === 'ADMIN'
  if (alcance === 'ver-sistema') return papel === 'ADMIN' || papel === 'GERENTE'
  return papel === 'ADMIN' || papel === 'SUPORTE'
}

/** A marca entra neste host? */
export function aceitaNoHost(host: HostDaPlataforma, marca: string | null | undefined): boolean {
  return papelAlcanca(marca, host === 'sistema' ? 'ver-sistema' : 'atender')
}

/**
 * O que o login (e a porta) de um host diz a quem não é dele — `null` para
 * quem é. A clínica tem a sua mensagem (a da equipe da plataforma que entrou
 * no lugar errado), em `apps/web`.
 */
export function recusaDoHost(host: HostDaPlataforma, marca: string | null | undefined): string | null {
  if (marca !== 'ADMIN' && marca !== 'SUPORTE' && marca !== 'GERENTE') {
    return 'Este acesso é só da equipe do BellarisOS. A clínica entra pelo app.'
  }
  if (aceitaNoHost(host, marca)) return null
  return host === 'sistema'
    ? 'O Sistema é só da administração. Entre pelo suporte.'
    : 'O suporte é só do atendimento. Entre pelo sistema.'
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
  quem: { para: 'membro' } | { para: 'atendente'; papel: 'ADMIN' | 'SUPORTE' | 'GERENTE' },
  env: Ambiente = process.env,
): string {
  const base = quem.para === 'membro' ? urlDaClinica(env) : urlDoHost(quem.papel === 'SUPORTE' ? 'suporte' : 'sistema', env)
  return `${base}/auth/confirm?next=/update-password`
}

/** Onde a pessoa da plataforma começa: o ADMIN e o GERENTE no sistema, o SUPORTE no suporte. */
export function inicioDaPlataforma(marca: string | null | undefined, env: Ambiente = process.env): string {
  return `${urlDoHost(marca === 'ADMIN' || marca === 'GERENTE' ? 'sistema' : 'suporte', env)}/`
}
