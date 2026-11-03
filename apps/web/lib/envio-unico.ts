import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O envio que chega duas vezes grava uma vez só (D10 da 5ª simulação,
 * 2026-11-01: um "Cadastrar cliente" criou duas fichas "Valdir Duplicado" com
 * 0,7 s de diferença). O mecanismo é UM para o sistema:
 *
 * - a TELA gera uma chave por envio de formulário (`useEnvioUnico`,
 *   `lib/use-envio-unico.ts`) e a manda no campo `_envio` (FormData) ou no
 *   `envio` do objeto;
 * - a ACTION embrulha a gravação em `umaVez`, que reivindica a chave na
 *   tabela `envios_unicos` (chave primária: rede + ação + chave) ANTES de
 *   gravar. A segunda chegada da mesma chave espera a primeira e recebe o
 *   MESMO resultado, sem gravar de novo; a que volta sem gravar (erro, aviso,
 *   pergunta) solta a chave, e o próximo envio — a resposta da pessoa — grava.
 * - Sem chave (o Copilot, uma action chamada por outro caminho), a action
 *   pode travar pelo CONTEÚDO: `chaveDoConteudo` deriva a chave do que
 *   identifica o cadastro (o nome e o telefone da ficha) e `validade` diz por
 *   quanto tempo dois envios iguais são o mesmo.
 *
 * Edição que regrava os mesmos valores já é idempotente e não precisa disto;
 * o que precisa é o que ACUMULA (criar, lançar, mover estoque, dar pontos).
 * Onde está aplicado: `docs/regras/convencoes.md`.
 */

export const CAMPO_DO_ENVIO = '_envio'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A chave que a tela mandou (o campo `_envio` do formulário, ou o texto), ou nula. */
export function chaveDoEnvio(origem: FormData | string | null | undefined): string | null {
  const v = origem instanceof FormData ? origem.get(CAMPO_DO_ENVIO) : origem
  return typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null
}

/** Uma chave (no formato de uuid) derivada do conteúdo: as mesmas partes dão a mesma chave. */
export function chaveDoConteudo(...partes: (string | null | undefined)[]): string {
  const h = createHash('sha256').update(partes.map(p => (p ?? '').trim().toLowerCase()).join('\u0001')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** A segunda chegada que esperou e a primeira ainda não terminou. */
export const ENVIO_OCUPADO = 'Este envio ainda está sendo gravado. Confira em instantes antes de enviar de novo.'

export interface OpcoesDoEnvio<R> {
  /** O resultado GRAVOU (é guardado e devolvido ao reenvio)? Por padrão: não tem `error`. */
  gravou?: (r: R) => boolean
  /** O que devolver se a outra chegada ainda grava depois da espera. Por padrão, `{ error: ENVIO_OCUPADO }`. */
  ocupada?: () => R
  /** Por quanto tempo o `feito` vale (intervalo do Postgres, ex.: '60 seconds'). Sem ele, para sempre. */
  validade?: string
  /** Quanto esperar a outra chegada terminar (ms). */
  esperaMs?: number
  /**
   * Só ENFILEIRAR: a segunda chegada espera a primeira terminar e então faz de
   * novo (o "feito" nunca é devolvido). É o cadastro da cliente sem a chave da
   * tela (r2-cli-01): a segunda chegada acha a ficha que a primeira gravou e
   * pergunta "Já existe a ficha de X". Uma validade negativa, e não zero: o
   * `atualizado_em` é gravado com o relógio do servidor do app, que pode estar
   * adiante do relógio do banco.
   */
  soEnfileirar?: boolean
}

type Reivindicacao = { situacao: 'sua' | 'feito' | 'ocupada'; resultado?: unknown }

const temErro = (r: unknown) => !!r && typeof r === 'object' && 'error' in r && !!(r as { error?: unknown }).error

/**
 * Faz `fazer` uma vez por chave. Sem chave, só faz (o caminho antigo continua
 * valendo). A falha ao reivindicar não grava às cegas: lança, como toda
 * leitura do banco (`ler`).
 */
export async function umaVez<R>(
  tenantId: string, acao: string, chave: string | null, fazer: () => Promise<R>, opcoes: OpcoesDoEnvio<R> = {},
): Promise<R> {
  if (!chave || !UUID.test(chave)) return fazer()
  const admin = createAdminClient()
  const gravou = opcoes.gravou ?? ((r: R) => !temErro(r))
  const ate = Date.now() + (opcoes.esperaMs ?? 20_000)

  for (;;) {
    const r = await ler(admin.rpc('envio_reivindicar', {
      p_tenant: tenantId, p_acao: acao, p_chave: chave, p_validade: opcoes.soEnfileirar ? '-1 day' : opcoes.validade ?? null,
    }), 'conferir se este envio já foi gravado') as Reivindicacao
    if (r.situacao === 'feito') return r.resultado as R
    if (r.situacao === 'sua') break
    if (Date.now() > ate) return opcoes.ocupada ? opcoes.ocupada() : ({ error: ENVIO_OCUPADO } as R)
    await new Promise(ok => setTimeout(ok, 250))
  }

  const marcar = async (estado: 'feito' | 'livre', resultado: unknown) => {
    const { error } = await admin.from('envios_unicos')
      .update({ estado, resultado, atualizado_em: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('acao', acao).eq('chave', chave)
    // A gravação já aconteceu (ou não): falhar aqui não a desfaz. Fica no log;
    // a chave presa em `gravando` se solta sozinha em 2 minutos.
    if (error) console.error('[envio-unico]', acao, estado, error.message)
  }

  let resultado: R
  try {
    resultado = await fazer()
  } catch (e) {
    await marcar('livre', null)
    throw e
  }
  if (gravou(resultado)) await marcar('feito', JSON.parse(JSON.stringify(resultado ?? null)))
  else await marcar('livre', null)
  return resultado
}
