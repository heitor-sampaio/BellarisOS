import { NextResponse, type NextRequest } from 'next/server'
import type { TenantContext } from '@estetica-os/types'
import { getTenantContext, temRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { origemPublica } from '@/lib/origem'
import { getCachedRede } from '@/lib/cached-queries'
import { ler } from '@/lib/db'
import { copilotConfigurado, perguntarAoModelo, ErroDoModelo, type ItemDaConversa } from '@/lib/copilot/openai'
import { contextoDoCopilot, executarChamada, ferramentasDoCargo, paraOModelo } from '@/lib/copilot/executor'
import { conversaDaPessoa, criarConversa, gravarMensagem, historicoParaOModelo, type ConteudoDoUsuario } from '@/lib/copilot/conversa'
import { instrucoesDoCopilot } from '@/lib/copilot/prompt'
import { cotaEsgotada, registrarUso } from '@/lib/copilot/cota'
import { lerAnexos, paraOModelo as conteudoDosAnexos, transcrever, ErroDeAnexo, type AnexoLido } from '@/lib/copilot/anexos'
import { TEXTO_MAXIMO, type Cartao, type EventoDoCopilot } from '@/lib/copilot/tipos'

/**
 * O chat do Copilot (docs/regras/copilot.md).
 *
 * Route handler, não server action: a resposta vem em STREAMING (SSE), o texto
 * aparecendo enquanto o modelo escreve. Por isso se defende sozinha, como toda
 * rota de /api (o proxy não barra nada aqui):
 *  - sessão de membro da equipe (401 sem ela);
 *  - Origin da própria clínica (403): é um POST que age pela sessão, e os
 *    hosts *.bellarisos.com são o mesmo SITE — o cookie lax iria junto;
 *  - o Copilot no plano da rede, e configurado na instalação;
 *  - fora da sessão de suporte (o custo e a responsabilidade são de quem pede);
 *  - a cota do mês.
 *
 * Cada pedido: grava a fala da pessoa, roda o laço "modelo → ferramentas →
 * modelo" (até VOLTAS_MAXIMAS) e grava a resposta, os cartões e o uso.
 */

export const dynamic = 'force-dynamic'

const VOLTAS_MAXIMAS = 8

function recusa(status: number, mensagem: string) {
  return NextResponse.json({ error: mensagem }, { status })
}

function origemConfere(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  const origem = req.headers.get('origin')
  return !!origem && origem === origemPublica(req)
}

/** `/admin/...` → null (a rede); `/<slug>/...` → o slug do portal da unidade. */
function slugDaPagina(pagina: string): string | null {
  const primeiro = pagina.split('?')[0]!.split('/').filter(Boolean)[0] ?? 'admin'
  return primeiro === 'admin' ? null : primeiro
}

export async function POST(req: NextRequest) {
  let ctxDaPessoa: TenantContext
  try {
    ctxDaPessoa = await getTenantContext()
  } catch {
    return recusa(401, 'Entre no sistema para usar o Copilot.')
  }
  if (!origemConfere(req)) return recusa(403, 'Pedido de outra origem.')
  if (ctxDaPessoa.isClient || !ctxDaPessoa.tenantId || !ctxDaPessoa.internalUserId) return recusa(403, 'O Copilot é da equipe da clínica.')
  if (!temRecurso(ctxDaPessoa, 'copilot')) return recusa(403, 'O Copilot não faz parte do plano da sua clínica.')
  if (ctxDaPessoa.suporte) return recusa(403, 'No modo suporte o Copilot fica desligado.')
  if (!copilotConfigurado()) return recusa(503, 'O Copilot não está configurado nesta instalação.')

  const admin = createAdminClient()
  if (await cotaEsgotada(admin, ctxDaPessoa)) {
    return recusa(429, 'A cota do Copilot deste mês acabou. Ela volta no começo do próximo mês — ou fale com o BellarisOS para ampliar.')
  }

  let form: FormData
  try { form = await req.formData() } catch { return recusa(400, 'Pedido inválido.') }
  const texto = String(form.get('texto') ?? '').trim().slice(0, TEXTO_MAXIMO)
  const pagina = String(form.get('pagina') ?? '/admin').slice(0, 300)
  const conversaPedida = String(form.get('conversaId') ?? '')

  let anexos: AnexoLido[]
  try {
    anexos = await lerAnexos(form.getAll('anexos').filter((a): a is File => a instanceof File))
  } catch (e) {
    return recusa(400, e instanceof ErroDeAnexo ? e.message : 'Anexo inválido.')
  }
  if (!texto && anexos.length === 0) return recusa(400, 'Escreva algo ou mande um anexo.')

  const ctx = contextoDoCopilot(ctxDaPessoa)
  const conversaExistente = conversaPedida ? await conversaDaPessoa(admin, ctx, conversaPedida) : null
  if (conversaPedida && !conversaExistente) return recusa(404, 'Conversa não encontrada.')

  const slugDoPortal = slugDaPagina(pagina)
  const codificador = new TextEncoder()

  const corpo = new ReadableStream<Uint8Array>({
    async start(controle) {
      const enviar = (e: EventoDoCopilot) => {
        try { controle.enqueue(codificador.encode(`data: ${JSON.stringify(e)}\n\n`)) } catch { /* a tela fechou */ }
      }
      let tokensEntrada = 0
      let tokensSaida = 0
      let conversaId: string | null = conversaExistente?.id ?? null
      try {
        // A voz vira texto antes de tudo (a tela mostra o que foi entendido).
        const { transcricao, conteudo, descricao } = await prepararEntrada(anexos)
        if (transcricao) enviar({ tipo: 'transcricao', texto: transcricao })
        const fala = [texto, transcricao].filter(Boolean).join('\n')

        const conversa = conversaExistente ?? await criarConversa(admin, ctx, fala || descricao || 'Anexo')
        conversaId = conversa.id
        enviar({ tipo: 'conversa', id: conversa.id, titulo: conversa.titulo })

        const historico = await historicoParaOModelo(admin, conversa.id)
        const doUsuario: ConteudoDoUsuario = {
          texto,
          anexos: anexos.map(a => ({ nome: a.nome, tipo: a.tipo, caminho: a.caminho ?? undefined })),
          ...(transcricao ? { transcricao } : {}),
        }
        await gravarMensagem(admin, { conversaId: conversa.id, tenantId: ctx.tenantId!, papel: 'user', conteudo: doUsuario })

        const itens: ItemDaConversa[] = [
          ...historico,
          { role: 'user', content: [{ type: 'input_text', text: fala || '(a pessoa mandou só o anexo)' }, ...conteudo] },
        ]

        const [rede, unidade] = await Promise.all([
          getCachedRede(ctx.tenantId!),
          ctx.branchId
            ? ler(admin.from('branches').select('name').eq('id', ctx.branchId).maybeSingle(), 'ler a unidade') as Promise<{ name: string } | null>
            : Promise.resolve(null),
        ])
        const instrucoes = instrucoesDoCopilot(ctx, { rede: rede?.nome ?? null, unidade: unidade?.name ?? null, pagina })
        const disponiveis = ferramentasDoCargo(ctx)
        const ferramentas = paraOModelo(disponiveis)
        const cf = { ctx, admin, pagina, slugDoPortal, conversaId: conversa.id }

        let resposta = ''
        const cartoes: Cartao[] = []
        for (let volta = 0; volta < VOLTAS_MAXIMAS; volta++) {
          const r = await perguntarAoModelo({
            instrucoes, itens, ferramentas,
            aoTexto: delta => { resposta += delta; enviar({ tipo: 'texto', delta }) },
          })
          tokensEntrada += r.tokensEntrada
          tokensSaida += r.tokensSaida
          if (!r.chamadas.length) break

          // Texto que veio junto das chamadas (sem deltas): mantém na resposta.
          if (r.texto && !resposta.endsWith(r.texto)) resposta += r.texto
          if (resposta && !resposta.endsWith('\n')) { resposta += '\n\n'; enviar({ tipo: 'texto', delta: '\n\n' }) }

          itens.push(...r.itens)
          const daVolta: ItemDaConversa[] = r.itens.filter(i => (i as { type?: string }).type === 'function_call')
          for (const chamada of r.chamadas) {
            const disponivel = disponiveis.find(f => f.nome === chamada.nome)
            enviar({ tipo: 'pensando', rotulo: disponivel?.tipo === 'escrita' ? 'Preparando…' : 'Consultando…' })
            const resultado = await executarChamada(cf, chamada)
            if (resultado.cartao) { cartoes.push(resultado.cartao); enviar({ tipo: 'cartao', cartao: resultado.cartao }) }
            const saida: ItemDaConversa = { type: 'function_call_output', call_id: chamada.callId, output: JSON.stringify(resultado.paraOModelo ?? null) }
            itens.push(saida)
            daVolta.push(saida)
          }
          // As chamadas e o que elas leram ficam na conversa: na próxima
          // pergunta o modelo ainda sabe ("agende o primeiro horário").
          await gravarMensagem(admin, { conversaId: conversa.id, tenantId: ctx.tenantId!, papel: 'ferramenta', conteudo: { itens: daVolta } })

          if (volta === VOLTAS_MAXIMAS - 1) {
            const aviso = 'Parei por aqui para não demorar demais. Se faltou algo, peça de novo em partes.'
            resposta += aviso
            enviar({ tipo: 'texto', delta: aviso })
          }
        }

        await gravarMensagem(admin, {
          conversaId: conversa.id, tenantId: ctx.tenantId!, papel: 'assistant',
          conteudo: { texto: resposta.trim(), cartoes }, tokensEntrada, tokensSaida,
        })
      } catch (e) {
        const mensagem = e instanceof ErroDoModelo || e instanceof ErroDeAnexo
          ? e.message
          : 'Algo deu errado do nosso lado. Tente de novo.'
        if (!(e instanceof ErroDoModelo)) console.error('[copilot] pedido:', e)
        enviar({ tipo: 'erro', mensagem })
      } finally {
        if (tokensEntrada + tokensSaida > 0) await registrarUso(admin, ctx.tenantId!, tokensEntrada + tokensSaida)
        void conversaId
        enviar({ tipo: 'fim' })
        controle.close()
      }
    },
  })

  return new Response(corpo, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  })

  async function prepararEntrada(lidos: AnexoLido[]) {
    const voz = lidos.find(a => a.tipo === 'audio')
    const transcricao = voz ? await transcrever(voz) : ''
    return {
      transcricao,
      conteudo: conteudoDosAnexos(lidos.filter(a => a.tipo !== 'audio')),
      descricao: lidos.map(a => a.nome).join(', '),
    }
  }
}
