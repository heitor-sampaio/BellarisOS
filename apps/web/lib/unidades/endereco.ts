/**
 * O endereço (slug) da unidade — ÚNICO no sistema inteiro (2026-10-19,
 * decisão do Heitor; índice `branches_slug_unico`).
 *
 * Era único só dentro da rede, e a cliente de duas clínicas com uma unidade
 * "centro" cada tinha o mesmo endereço para as duas. Quem cria a unidade não
 * vê erro nenhum: o endereço é o nome; ocupado (por outra clínica, ou por uma
 * rota do sistema), o nome com a clínica no fim; depois, numerado.
 */

/**
 * Os endereços do topo do app que NÃO podem ser de unidade: as rotas fixas
 * (uma unidade "admin" seria sombreada pelo /admin) e o que mora em `public/`.
 * Pasta nova em `app/` entra aqui — `tests/endereco-da-unidade.test.ts` trava.
 */
export const ENDERECOS_RESERVADOS: readonly string[] = [
  // app/
  'admin', 'api', 'assinar', 'auth', 'conta-suspensa', 'pre-atendimento', 'privacidade', 'verificar',
  // app/(auth) e app/(setup)
  'login', 'register', 'reset-password', 'update-password', 'setup',
  // o proxy e o Next
  'schedule', '_next',
  // public/
  'fontes-documento',
]

/** O texto → endereço: minúsculo, sem acento, só letras, números e hífen. */
export function slugDoTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Os candidatos, na ordem: o nome, o nome com a clínica, numerados. */
export function candidatosDeEndereco(base: string, nomeDaClinica: string): string[] {
  const clinica = slugDoTexto(nomeDaClinica)
  const lista = [base]
  if (clinica && clinica !== base) lista.push(`${base}-${clinica}`)
  for (let n = 2; n <= 50; n++) lista.push(`${base}-${n}`)
  return lista.filter(c => !ENDERECOS_RESERVADOS.includes(c))
}

/** O primeiro candidato livre (`ocupados`: os que já existem no banco). */
export function escolherEndereco(base: string, nomeDaClinica: string, ocupados: ReadonlySet<string>): string | null {
  return candidatosDeEndereco(base, nomeDaClinica).find(c => !ocupados.has(c)) ?? null
}
