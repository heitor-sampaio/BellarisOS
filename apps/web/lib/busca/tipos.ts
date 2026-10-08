import type { AppModule, ResolvedPermissions } from '@estetica-os/types'
import type { AcaoDaBusca } from '@/lib/busca/acoes'

/**
 * O que a busca universal acha.
 *
 * `pagina` é montada no navegador, a partir do menu (`lib/busca/paginas.ts`);
 * `conversa` vem de `inbox_pagina`, com o alcance do inbox; o resto vem de
 * `busca_universal` (migration 20261003000001).
 */
export type TipoDaBusca =
  | 'acao' | 'pagina' | 'cliente' | 'conversa' | 'oportunidade' | 'agendamento'
  | 'membro' | 'procedimento' | 'pacote' | 'produto'

/** Os tipos que o SERVIDOR procura (página e ação não passam por ele). */
export type TipoDoServidor = Exclude<TipoDaBusca, 'pagina' | 'acao'>

/** Um resultado, já com o texto pronto para a tela. */
export interface ResultadoDaBusca {
  tipo:      TipoDaBusca
  id:        string
  titulo:    string
  subtitulo: string | null
  /** Só a oportunidade: o funil em que o quadro abre. */
  funilId?:  string | null
  /** A página e a ação: o endereço pronto (já com o portal). */
  href?:     string
  /** As ações do registro (o cliente: agendar, vender — lib/busca/acoes.ts). */
  acoes?:    AcaoDaBusca[]
}

export interface GrupoDaBusca {
  tipo:  TipoDaBusca
  itens: ResultadoDaBusca[]
}

/**
 * A ordem dos grupos na tela, e o rótulo de cada um.
 *
 * O que se procura mais (gente) vem primeiro; o catálogo, por último. Páginas
 * ficam no fim: elas aparecem desde a primeira letra, e no topo empurrariam
 * para baixo o cliente que a pessoa está digitando.
 */
export const GRUPOS: readonly { tipo: TipoDaBusca; rotulo: string }[] = [
  { tipo: 'acao',         rotulo: 'Ações' },
  { tipo: 'cliente',      rotulo: 'Clientes' },
  { tipo: 'conversa',     rotulo: 'Conversas' },
  { tipo: 'oportunidade', rotulo: 'Oportunidades' },
  { tipo: 'agendamento',  rotulo: 'Próximos agendamentos' },
  { tipo: 'membro',       rotulo: 'Equipe' },
  { tipo: 'procedimento', rotulo: 'Procedimentos' },
  { tipo: 'pacote',       rotulo: 'Pacotes' },
  { tipo: 'produto',      rotulo: 'Produtos' },
  { tipo: 'pagina',       rotulo: 'Páginas' },
]

/**
 * O módulo que cada tipo exige — o mesmo que abre a tela própria dele. A busca
 * não abre exceção: quem não vê a lista de clientes não acha cliente aqui.
 */
export const MODULO_DO_TIPO: Record<TipoDoServidor, AppModule> = {
  cliente:      'clients',
  conversa:     'crm',
  oportunidade: 'crm',
  agendamento:  'agenda',
  membro:       'team',
  procedimento: 'procedures',
  pacote:       'procedures',
  produto:      'stock',
}

/**
 * A funcionalidade do PLANO que o tipo exige, quando ela é parte de um módulo
 * (lib/planos/recursos.ts). O módulo inteiro fora do plano já saiu das
 * permissões; estas dividem o módulo com outra.
 */
export const RECURSO_DO_TIPO: Partial<Record<TipoDoServidor, string>> = {
  conversa:     'inbox',
  oportunidade: 'oportunidades',
  pacote:       'pacotes',
}

/**
 * O que esta pessoa pode achar pelo servidor. Decide o SERVIDOR, pelo ctx:
 * o módulo do cargo e, quando há, a funcionalidade do plano da rede.
 */
export function tiposPermitidos(
  permissions: ResolvedPermissions,
  noPlano: (chave: string) => boolean = () => true,
): TipoDoServidor[] {
  return (Object.keys(MODULO_DO_TIPO) as TipoDoServidor[])
    .filter(t => (permissions[MODULO_DO_TIPO[t]] ?? 'NONE') !== 'NONE')
    .filter(t => { const r = RECURSO_DO_TIPO[t]; return !r || noPlano(r) })
}

/** Termo mínimo para ir ao servidor (abaixo disso, casaria quase tudo). */
export const TERMO_MINIMO = 2
/** Teto do termo: ninguém procura um parágrafo, e o banco agradece. */
export const TERMO_MAXIMO = 80
/** Quantos de cada tipo. */
export const POR_TIPO = 5
