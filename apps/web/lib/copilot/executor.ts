import 'server-only'
import { toJSONSchema } from 'zod/v4'
import type { TenantContext } from '@estetica-os/types'
import { can, temRecurso } from '@/lib/auth'
import { ehSemAcesso } from '@/lib/sem-acesso'
import { mensagemDoErro, ler, gravar } from '@/lib/db'
import { FERRAMENTAS } from '@/lib/copilot/ferramentas'
import type { ContextoDaFerramenta, Ferramenta } from '@/lib/copilot/ferramentas/tipos'
import type { FerramentaParaOModelo } from '@/lib/copilot/openai'
import type { Cartao, ResultadoDaAcao, ResumoDaAcao, StatusDaAcao } from '@/lib/copilot/tipos'
import { gravarMensagem } from '@/lib/copilot/conversa'

/**
 * O executor das ferramentas — a trava ÚNICA do Copilot.
 *
 * 1. O modelo só RECEBE as ferramentas que o cargo pode usar
 *    (`ferramentasDoCargo`): módulo e nível, funcionalidade do plano e a trava
 *    a mais da ferramenta. O que ele não vê, ele não pede.
 * 2. Pedir não basta: `executarChamada` confere de novo, valida os argumentos
 *    pelo schema e nunca deixa rede ou unidade virem do modelo (a ferramenta
 *    usa o `ctx`).
 * 3. Gravação não grava: PREPARA (`copilot_acoes`, status pendente) e a tela
 *    mostra o cartão. Só o "Confirmar" (`decidirAcao`) grava — e confere tudo
 *    de novo, porque entre preparar e confirmar o mundo pode ter mudado.
 *
 * Recusa de permissão volta ao modelo como texto ("sem permissão"), nunca como
 * exceção: ele explica à pessoa em vez de a conversa quebrar.
 */

/** O contexto com que o Copilot age: o da pessoa, com a marca no nome. */
export function contextoDoCopilot(ctx: TenantContext): TenantContext {
  return { ...ctx, userName: `${ctx.userName || 'Equipe'} (via Copilot)` }
}

export function ferramentaLiberada(ctx: TenantContext, f: Ferramenta): boolean {
  if (f.modulo && !can(ctx, f.modulo, f.nivel ?? 'VIEW')) return false
  if (f.recurso && !temRecurso(ctx, f.recurso)) return false
  if (f.pode && !f.pode(ctx)) return false
  return true
}

export function ferramentasDoCargo(ctx: TenantContext): Ferramenta[] {
  return FERRAMENTAS.filter(f => ferramentaLiberada(ctx, f))
}

/** O catálogo no formato do modelo (o schema zod vira JSON Schema). */
export function paraOModelo(lista: Ferramenta[]): FerramentaParaOModelo[] {
  return lista.map(f => {
    const { $schema: _, ...parametros } = toJSONSchema(f.parametros, { io: 'input' }) as Record<string, unknown>
    void _
    return {
      type: 'function',
      name: f.nome,
      description: f.tipo === 'escrita'
        ? `${f.descricao} GRAVAÇÃO: não grava na hora — prepara um cartão que a pessoa confirma.`
        : f.descricao,
      parameters: parametros,
      strict: false,
    }
  })
}

export interface ResultadoDaChamada {
  /** O que volta ao modelo (vira `function_call_output`). */
  paraOModelo: unknown
  cartao?: Cartao
}

export async function executarChamada(
  c: ContextoDaFerramenta & { conversaId: string },
  chamada: { nome: string; argumentos: string },
): Promise<ResultadoDaChamada> {
  const ferramenta = ferramentasDoCargo(c.ctx).find(f => f.nome === chamada.nome)
  if (!ferramenta) {
    return { paraOModelo: { erro: 'Esta ferramenta não está liberada para o cargo desta pessoa (ou não existe). Diga isso a ela.' } }
  }

  let bruto: unknown
  try { bruto = chamada.argumentos ? JSON.parse(chamada.argumentos) : {} } catch {
    return { paraOModelo: { erro: 'Argumentos inválidos (JSON malformado).' } }
  }
  const args = ferramenta.parametros.safeParse(bruto)
  if (!args.success) {
    return { paraOModelo: { erro: 'Argumentos inválidos.', detalhes: args.error.issues.map(i => `${i.path.join('.') || 'argumentos'}: ${i.message}`) } }
  }

  try {
    if (ferramenta.tipo === 'leitura') {
      const r = await ferramenta.executar(c, args.data)
      return { paraOModelo: r.dados, cartao: r.cartao }
    }

    const preparo = await ferramenta.preparar(c, args.data)
    if ('erro' in preparo) return { paraOModelo: { erro: preparo.erro } }

    const acao = await gravar(c.admin.from('copilot_acoes').insert({
      conversa_id: c.conversaId,
      tenant_id:   c.ctx.tenantId!,
      user_id:     c.ctx.internalUserId!,
      ferramenta:  ferramenta.nome,
      // Os ARGUMENTOS ficam: o "Confirmar" prepara de novo com eles (o mundo
      // pode ter mudado) e só então grava.
      payload:     { args: args.data },
      resumo:      preparo.resumo,
    }).select('id').single(), 'preparar a ação do Copilot') as { id: string }

    return {
      paraOModelo: {
        status: 'aguardando_confirmacao',
        acao: preparo.resumo,
        instrucao: 'Nada foi gravado ainda. Um cartão com Confirmar/Cancelar apareceu para a pessoa. Diga em uma frase o que vai ser feito e peça para ela confirmar no cartão. Não diga que já fez.',
      },
      cartao: { tipo: 'acao', acaoId: acao.id, resumo: preparo.resumo, status: 'pendente' },
    }
  } catch (e) {
    if (ehSemAcesso(e as { message?: string; digest?: string })) {
      return { paraOModelo: { erro: 'Sem permissão: o cargo desta pessoa não libera isso.' } }
    }
    console.error(`[copilot] ferramenta ${ferramenta.nome}:`, e)
    return { paraOModelo: { erro: `Falhou: ${mensagemDoErro(e)}` } }
  }
}

interface LinhaDaAcao {
  id: string; conversa_id: string; ferramenta: string; payload: { args: unknown }
  resumo: ResumoDaAcao; status: StatusDaAcao; resultado: ResultadoDaAcao | null; expira_em: string
}

/**
 * "Confirmar" ou "Cancelar" o cartão. Só a PRÓPRIA pessoa decide a ação dela.
 * Confirmar reivindica a linha (pendente → executando numa escrita só): o
 * clique duplo, ou duas abas, gravam uma vez.
 */
export async function decidirAcao(
  c: Omit<ContextoDaFerramenta, 'ctx'> & { ctx: TenantContext },
  acaoId: string,
  decisao: 'confirmar' | 'cancelar',
): Promise<{ status: StatusDaAcao; resultado?: ResultadoDaAcao | null; error?: string }> {
  const { admin } = c
  const ctx = contextoDoCopilot(c.ctx)
  const atual = await ler(admin.from('copilot_acoes')
    .select('id, conversa_id, ferramenta, payload, resumo, status, resultado, expira_em')
    .eq('id', acaoId).eq('tenant_id', ctx.tenantId!).eq('user_id', ctx.internalUserId!)
    .maybeSingle(), 'ler a ação do Copilot') as LinhaDaAcao | null
  if (!atual) return { status: 'falhou', error: 'Ação não encontrada.' }

  if (decisao === 'cancelar') {
    const cancelada = await ler(admin.from('copilot_acoes')
      .update({ status: 'cancelada', decidida_em: new Date().toISOString() })
      .eq('id', acaoId).eq('status', 'pendente').select('id'), 'cancelar a ação') as { id: string }[] | null
    if (!cancelada?.length) return { status: atual.status, resultado: atual.resultado }
    await gravarMensagem(admin, {
      conversaId: atual.conversa_id, tenantId: ctx.tenantId!, papel: 'nota',
      conteudo: { texto: `A pessoa CANCELOU a ação "${atual.resumo.titulo}". Nada foi gravado.` },
    })
    return { status: 'cancelada' }
  }

  const agora = new Date().toISOString()
  const reivindicada = await ler(admin.from('copilot_acoes')
    .update({ status: 'executando', decidida_em: agora })
    .eq('id', acaoId).eq('status', 'pendente').gt('expira_em', agora)
    .select('id'), 'reivindicar a ação') as { id: string }[] | null

  if (!reivindicada?.length) {
    if (atual.status === 'pendente') {
      // Pendente e não reivindicada: venceu.
      await admin.from('copilot_acoes').update({ status: 'vencida' }).eq('id', acaoId).eq('status', 'pendente')
      return { status: 'vencida', error: 'Este cartão venceu. Peça de novo ao Copilot.' }
    }
    return { status: atual.status, resultado: atual.resultado }
  }

  const terminar = async (status: StatusDaAcao, resultado: ResultadoDaAcao) => {
    await gravar(admin.from('copilot_acoes').update({ status, resultado }).eq('id', acaoId).select('id'), 'registrar o resultado da ação')
    await gravarMensagem(admin, {
      conversaId: atual.conversa_id, tenantId: ctx.tenantId!, papel: 'nota',
      conteudo: {
        texto: status === 'feita'
          ? `A pessoa CONFIRMOU e foi gravado: "${atual.resumo.titulo}". ${resultado.mensagem}`
          : `A pessoa confirmou "${atual.resumo.titulo}", mas NÃO foi gravado: ${resultado.mensagem}`,
      },
    })
    return { status, resultado }
  }

  const ferramenta = ferramentasDoCargo(ctx).find(f => f.nome === atual.ferramenta)
  if (!ferramenta || ferramenta.tipo !== 'escrita') {
    return terminar('falhou', { mensagem: 'O seu cargo não libera mais esta ação.' })
  }
  const args = ferramenta.parametros.safeParse(atual.payload?.args)
  if (!args.success) return terminar('falhou', { mensagem: 'A ação guardada é inválida.' })

  const cf: ContextoDaFerramenta = { ctx, admin, pagina: c.pagina, slugDoPortal: c.slugDoPortal }
  try {
    const preparo = await ferramenta.preparar(cf, args.data)
    if ('erro' in preparo) return terminar('falhou', { mensagem: preparo.erro })
    const r = await ferramenta.efetivar(cf, preparo.payload)
    if ('erro' in r) return terminar('falhou', { mensagem: r.erro })
    return terminar('feita', r)
  } catch (e) {
    if (ehSemAcesso(e as { message?: string; digest?: string })) {
      return terminar('falhou', { mensagem: 'O seu cargo não libera esta ação.' })
    }
    console.error(`[copilot] efetivar ${ferramenta.nome}:`, e)
    return terminar('falhou', { mensagem: mensagemDoErro(e) })
  }
}
