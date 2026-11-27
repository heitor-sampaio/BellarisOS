/**
 * A3 da 38ª simulação (plataforma:AD-13, princípio 3; decisão do Claude, 27/11):
 * salvar o procedimento apagava e recriava as ligações dele (quem realiza, as
 * salas, os insumos, as unidades, os preços por unidade) mesmo sem mudança — e a
 * Auditoria dizia "Apagou 3" / "Criou 3 profissionais do procedimento" de algo
 * que ninguém mexeu. A gravação passa a ser só a diferença: o que saiu, o que
 * entrou e, na ligação com valor, a que mudou de valor.
 */
export interface DiferencaDasLigacoes<T> {
  apagar: T[]
  criar:  T[]
  mudar:  T[]
}

/** O mesmo valor, com o numérico do banco (que o PostgREST devolve como texto) igual ao número do formulário. */
function mesmoValor(a: unknown, b: unknown): boolean {
  const vazio = (v: unknown) => v === null || v === undefined || v === ''
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b)
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return String(a) === String(b)
}

/**
 * As ligações que mudam: `chave` identifica a ligação dentro do procedimento
 * (o `user_id`, o `room_id`, o `product_id`, o `branch_id`); `campos`, os valores
 * dela que, mudando, pedem a atualização (a quantidade e o custo do insumo).
 * A desejada repetida vale uma vez (a última).
 */
export function diferencaDasLigacoes<T extends Record<string, unknown>>(
  existentes: readonly T[], desejadas: readonly T[], chave: keyof T & string, campos: readonly (keyof T & string)[] = [],
): DiferencaDasLigacoes<T> {
  const porChave = new Map(existentes.map(e => [String(e[chave]), e]))
  const queridas = new Map(desejadas.map(d => [String(d[chave]), d]))
  const apagar = [...porChave.entries()].filter(([k]) => !queridas.has(k)).map(([, e]) => e)
  const criar: T[] = []
  const mudar: T[] = []
  for (const [k, d] of queridas) {
    const e = porChave.get(k)
    if (!e) criar.push(d)
    else if (campos.some(c => !mesmoValor(e[c], d[c]))) mudar.push(d)
  }
  return { apagar, criar, mudar }
}
