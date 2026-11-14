// Vocabulário de tags de cliente. Não existe "tag de unidade" (H16, Bloco
// Tags de 2026-11-14): a cliente é da rede, e uma "Unidade: X" gravada é uma
// tag comum.
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
