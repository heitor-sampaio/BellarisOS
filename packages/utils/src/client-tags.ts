// Vocabulário de tags de cliente + tags de UNIDADE (Unidade: <nome>).
// Fonte única — substitui as listas hardcoded divergentes em client-form/client-profile.

export const CLIENT_TAGS = [
  'VIP',
  'Indicação',
  'Retorno',
  'Alergias',
  'Gestante',
  'Idoso',
  'Plano',
  'Desconto',
] as const

export type ClientTag = (typeof CLIENT_TAGS)[number]

// -- Tags de unidade -----------------------------------------------------------
// A unidade que o cliente frequenta é uma TAG (métrica), não uma regra de negócio.
// Auto-derivada dos agendamentos (trigger) e editável manualmente.

export const UNIT_TAG_PREFIX = 'Unidade: '

export function unitTag(branchName: string): string {
  return `${UNIT_TAG_PREFIX}${branchName}`
}

export function isUnitTag(tag: string): boolean {
  return tag.startsWith(UNIT_TAG_PREFIX)
}

export function unitTagName(tag: string): string {
  return isUnitTag(tag) ? tag.slice(UNIT_TAG_PREFIX.length) : tag
}
