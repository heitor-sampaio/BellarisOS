/**
 * O nome do cargo duplicado (A15 da 15ª simulação, 2026-11-17: o cargo novo
 * partia do zero, e quem queria "a Recepção, só que sem o Financeiro" marcava
 * a matriz inteira de novo). "Cópia de X"; se esse nome já existe na rede,
 * "Cópia de X (2)", "(3)"… — o nome do cargo é único na rede. Pura.
 */
export function nomeDaCopia(rotulo: string, existentes: string[], chaves: string[] = []): string {
  const ocupados = new Set([...existentes.map(chaveDoCargo), ...chaves])
  const base = `Cópia de ${rotulo.trim()}`
  if (!ocupados.has(chaveDoCargo(base))) return base
  for (let n = 2; ; n++) {
    const nome = `${base} (${n})`
    if (!ocupados.has(chaveDoCargo(nome))) return nome
  }
}

/**
 * O nome e a chave da cópia (D1 da 32ª, 2026-11-26): o cargo renomeado guarda a
 * chave do nome de nascença ("Cópia de X" virou "Recepção sem caixa" com a
 * chave COPIA_DE_X), e o 2º "Duplicar" saía com a mesma chave (23505, "Já existe
 * um cargo com esse nome."). O nome escolhido tem a chave livre entre os
 * rótulos E as chaves da rede. Pura.
 */
export function copiaDoCargo(rotulo: string, existentes: { label: string; key: string }[]): { label: string; key: string } {
  const label = nomeDaCopia(rotulo, existentes.map(r => r.label), existentes.map(r => r.key))
  return { label, key: chaveDoCargo(label) }
}

/**
 * A chave do cargo NOVO (o "Novo cargo"; a mesma colisão do D1 da 32ª,
 * 2026-11-26): o cargo renomeado guarda a chave do nome de nascença, e criar um
 * cargo com o nome que gera essa chave recusava com "Já existe um cargo com esse
 * nome." sem existir o nome (princípio 3). Recusa só quando o RÓTULO já existe
 * (sem diferença de acento e maiúscula); senão, a chave do nome, ou com o
 * sufixo _2, _3… — a primeira livre entre as chaves da rede. Pura.
 */
export function chaveDoCargoNovo(rotulo: string, existentes: { label: string; key: string }[]): { key: string } | { error: string } {
  const base = chaveDoCargo(rotulo)
  if (existentes.some(r => chaveDoCargo(r.label) === base)) return { error: 'Já existe um cargo com esse nome.' }
  const chaves = new Set(existentes.map(r => r.key))
  if (!chaves.has(base)) return { key: base }
  for (let n = 2; ; n++) {
    const key = `${base}_${n}`
    if (!chaves.has(key)) return { key }
  }
}

/**
 * O nome já é de OUTRO cargo da rede (sem diferença de acento e maiúscula)? É a
 * recusa do renomear — o rótulo não é único no banco, e o 23505 que o
 * `updateRole` traduzia nunca disparava (decisão do Claude, 26/11, princípio 3).
 */
export function nomeJaUsado(rotulo: string, cargoId: string, existentes: { id: string; label: string }[]): boolean {
  const base = chaveDoCargo(rotulo)
  return existentes.some(r => r.id !== cargoId && chaveDoCargo(r.label) === base)
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
