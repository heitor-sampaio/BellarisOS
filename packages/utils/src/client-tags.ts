export const CLIENT_TAGS = [
  'VIP',
  'Pacote ativo',
  'Indicação',
  'Inativa há 60 dias',
  'Aniversariante',
  'Primeira vez',
  'Fidelidade alta',
] as const

export type ClientTag = (typeof CLIENT_TAGS)[number]
