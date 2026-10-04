/**
 * Onde cada pessoa da PLATAFORMA começa. São dois portais:
 *  - `/sistema` — a administração do negócio (redes, planos, cobrança,
 *    equipe, auditoria). Só ADMIN.
 *  - `/suporte` — o atendimento (chamados, diagnóstico, "entrar como").
 *    SUPORTE e ADMIN.
 * A marca vem de `app_metadata.plataforma`; quem barra de verdade é
 * `getPlatformContext` em cada página e action.
 */
export function inicioDaPlataforma(marca: string | null | undefined): string {
  return marca === 'ADMIN' ? '/sistema' : '/suporte'
}

/** O caminho é de um dos portais da plataforma? */
export function ehPortalDaPlataforma(pathname: string): boolean {
  return pathname === '/suporte' || pathname.startsWith('/suporte/')
    || pathname === '/sistema' || pathname.startsWith('/sistema/')
}

/** O caminho é do portal só de ADMIN? */
export function ehPortalDoSistema(pathname: string): boolean {
  return pathname === '/sistema' || pathname.startsWith('/sistema/')
}
