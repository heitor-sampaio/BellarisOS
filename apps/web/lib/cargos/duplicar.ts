/**
 * O nome do cargo duplicado (A15 da 15ª simulação, 2026-11-17: o cargo novo
 * partia do zero, e quem queria "a Recepção, só que sem o Financeiro" marcava
 * a matriz inteira de novo). "Cópia de X"; se esse nome já existe na rede,
 * "Cópia de X (2)", "(3)"… — o nome do cargo é único na rede. Pura.
 */
export function nomeDaCopia(rotulo: string, existentes: string[]): string {
  const ocupados = new Set(existentes.map(chaveDoCargo))
  const base = `Cópia de ${rotulo.trim()}`
  if (!ocupados.has(chaveDoCargo(base))) return base
  for (let n = 2; ; n++) {
    const nome = `${base} (${n})`
    if (!ocupados.has(chaveDoCargo(nome))) return nome
  }
}

/** A chave do cargo (`tenant_roles.key`, única na rede): sem acento, maiúscula, `_` no lugar do resto. */
export function chaveDoCargo(rotulo: string): string {
  return rotulo
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}
