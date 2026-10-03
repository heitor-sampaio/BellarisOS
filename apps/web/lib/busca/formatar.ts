import { formatBRL } from '@estetica-os/utils'
import { telefoneLegivel } from '@/lib/busca/texto'
import type { ResultadoDaBusca, TipoDoServidor } from '@/lib/busca/tipos'

/** Uma linha de `busca_universal`, como o banco a devolve. */
export interface LinhaDaBusca {
  tipo:      string
  id:        string
  titulo:    string | null
  subtitulo: string | null
  extra:     Record<string, unknown> | null
}

const TIPOS_DO_BANCO: ReadonlySet<string> = new Set<TipoDoServidor>([
  'cliente', 'oportunidade', 'agendamento', 'membro', 'procedimento', 'pacote', 'produto',
])

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

const juntar = (partes: (string | null | undefined)[]): string | null => {
  const ok = partes.filter((p): p is string => !!p)
  return ok.length > 0 ? ok.join(' · ') : null
}

/** "qua, 08/10 às 14:30", no fuso da clínica. */
export function quandoLegivel(iso: string): string {
  const d = new Date(iso)
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d).replace('.', '')
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d)
  return `${dia} às ${hora}`
}

const DESFECHO: Record<string, string> = { WON: 'ganha', LOST: 'perdida' }

/**
 * Uma linha do banco → um resultado com o texto pronto para a tela. Tipo que o
 * banco devolver e a tela não conhecer fica de fora (não vira um item mudo).
 */
export function resultadoDaLinha(l: LinhaDaBusca): ResultadoDaBusca | null {
  if (!TIPOS_DO_BANCO.has(l.tipo)) return null
  const tipo = l.tipo as TipoDoServidor
  const x = l.extra ?? {}
  const titulo = texto(l.titulo) ?? 'Sem nome'

  switch (tipo) {
    case 'cliente':
      return { tipo, id: l.id, titulo, subtitulo: juntar([telefoneLegivel(l.subtitulo), texto(x.email)]) }

    case 'oportunidade': {
      const desfecho = DESFECHO[texto(x.desfecho) ?? '']
      return {
        tipo, id: l.id, titulo,
        subtitulo: juntar([
          texto(l.subtitulo) ? `${texto(l.subtitulo)}${desfecho ? ` (${desfecho})` : ''}` : desfecho ?? null,
          texto(x.dono) ?? 'sem dono',
        ]),
        funilId: texto(x.funilId),
      }
    }

    case 'agendamento': {
      const quando = texto(x.quando)
      return {
        tipo, id: l.id, titulo,
        subtitulo: juntar([
          quando ? quandoLegivel(quando) : null,
          texto(l.subtitulo),
          texto(x.profissional),
          texto(x.unidade),
        ]),
      }
    }

    case 'membro':
      return {
        tipo, id: l.id, titulo,
        subtitulo: juntar([
          texto(l.subtitulo),
          texto(x.unidade) ?? 'Rede',
          x.ativo === false ? 'desativado' : null,
        ]),
      }

    case 'procedimento': {
      const preco = numero(x.preco)
      const duracao = numero(x.duracao)
      return {
        tipo, id: l.id, titulo,
        subtitulo: juntar([
          texto(l.subtitulo),
          preco !== null ? formatBRL(preco) : null,
          duracao ? `${duracao} min` : null,
        ]),
      }
    }

    case 'pacote': {
      const preco = numero(x.preco)
      const sessoes = numero(x.sessoes)
      return {
        tipo, id: l.id, titulo,
        subtitulo: juntar([
          sessoes ? `${sessoes} ${sessoes === 1 ? 'sessão' : 'sessões'}` : null,
          preco !== null ? formatBRL(preco) : null,
        ]),
      }
    }

    case 'produto':
      return {
        tipo, id: l.id, titulo,
        subtitulo: juntar([texto(x.sku) ? `SKU ${texto(x.sku)}` : null, texto(l.subtitulo)]),
      }

    case 'conversa':
      return null
  }
}

const CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', email: 'E-mail', manual: 'Manual',
}

/** O subtítulo de uma conversa: canal, caixa e o começo da última mensagem. */
export function subtituloDaConversa(c: {
  channel: string | null; caixa: string | null; last_message: string | null
}): string | null {
  const ultima = texto(c.last_message)
  return juntar([
    CANAL[c.channel ?? ''] ?? c.channel,
    c.caixa,
    ultima ? (ultima.length > 60 ? `${ultima.slice(0, 57)}…` : ultima) : null,
  ])
}
