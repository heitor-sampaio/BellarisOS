import 'server-only'
import { toJSONSchema } from 'zod/v4'
import type { TenantContext } from '@estetica-os/types'
import { can, temRecurso } from '@/lib/auth'
import { ehSemAcesso } from '@/lib/sem-acesso'
import { mensagemDoErro, ler, gravar, tentar } from '@/lib/db'
import { FERRAMENTAS } from '@/lib/copilot/ferramentas'
import type { ContextoDaFerramenta, Ferramenta } from '@/lib/copilot/ferramentas/tipos'
import type { FerramentaParaOModelo } from '@/lib/copilot/openai'
import type { Cartao, ResultadoDaAcao, ResumoDaAcao, StatusDaAcao } from '@/lib/copilot/tipos'
import { gravarMensagem } from '@/lib/copilot/conversa'
import { comViaDoCopilot } from '@estetica-os/nucleo/lib/supabase/via-da-escrita'

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
  // O cargo tem o Copilot (Ver liga a ferramenta: consultar e agir). Cada
  // consulta e cada gravação pedem só a permissão da AÇÃO, como na tela — o
  // Copilot é o canal, não o passo ("nenhuma ação pede dois", o Heitor,
  // 2026-11-23; docs/catalogo/copilot.md, Q02 da revisão de 24/11).
  if (!can(ctx, 'copilot', 'VIEW')) return false
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

/**
 * A33 da 22ª (princípio 7): a lista saía duas vezes — no texto e no cartão de
 * links logo abaixo. Com um cartão de vários itens, o modelo fica sabendo que
 * a lista já está na tela.
 */
function comAvisoDoCartao(dados: unknown, cartao: Cartao | undefined): unknown {
  if (cartao?.tipo !== 'links' || cartao.itens.length < 2) return dados
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return dados
  return {
    ...dados,
    cartaoNaTela: `A tela já mostra um cartão${cartao.titulo ? ` "${cartao.titulo}"` : ''} com ${cartao.itens.length} itens e os links: não repita a lista no texto — diga o total, o período e o que pede atenção.`,
  }
}

/**
 * D10 da 32ª (princípio 3): a consulta feita com um cartão ainda esperando o
 * "Confirmar" não acha o que ele vai gravar — e o modelo dizia "não há nenhum
 * agendamento". O recado vai junto dos dados.
 */
async function comOCartaoEsperando(c: ContextoDaFerramenta & { conversaId: string }, dados: unknown): Promise<unknown> {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return dados
  let esperando: { resumo: ResumoDaAcao | null }[] = []
  try {
    const { data } = await c.admin.from('copilot_acoes').select('resumo')
      .eq('conversa_id', c.conversaId).eq('tenant_id', c.ctx.tenantId!).eq('status', 'pendente')
      .gt('expira_em', new Date().toISOString())
    esperando = (data as { resumo: ResumoDaAcao | null }[] | null) ?? []
  } catch { return dados }
  const titulos = esperando.map(a => a.resumo?.titulo).filter((t): t is string => !!t)
  if (!titulos.length) return dados
  return {
    ...dados,
    cartaoEsperando: `O cartão ${titulos.map(t => `"${t}"`).join(', ')} ainda não foi confirmado: o que ele grava ainda não existe e não aparece nesta consulta. Não diga que não existe nem prepare outro cartão igual — diga que falta confirmar no cartão.`,
  }
}

/**
 * A nota que o turno seguinte lê depois do "Confirmar" (D10 da 32ª): o
 * "CONFIRMOU" se lia como a situação "Confirmado" do agendamento, e o Copilot
 * procurava os confirmados, não achava o que acabara de gravar e oferecia o
 * cartão de novo. Pura.
 */
export function notaDaDecisao(titulo: string, status: 'feita' | 'falhou', mensagem: string): string {
  return status === 'feita'
    ? `A pessoa aprovou o cartão (o botão Confirmar) e já está gravado: "${titulo}". ${mensagem} O “Confirmar” do cartão não é a situação de nenhum registro (um agendamento gravado assim fica “Agendado”). Não prepare o mesmo cartão de novo; se ela pedir para ver, consulte sem filtrar pela situação.`
    : `A pessoa confirmou "${titulo}", mas NÃO foi gravado: ${mensagem}`
}

export async function executarChamada(
  c: ContextoDaFerramenta & { conversaId: string },
  chamada: { nome: string; argumentos: string },
): Promise<ResultadoDaChamada> {
  const ferramenta = ferramentasDoCargo(c.ctx).find(f => f.nome === chamada.nome)
  if (!ferramenta) {
    return { paraOModelo: { erro: 'Esta ferramenta não está liberada pelas permissões desta pessoa (ou não existe). Diga isso a ela.' } }
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
      return { paraOModelo: await comOCartaoEsperando(c, comAvisoDoCartao(r.dados, r.cartao)), cartao: r.cartao }
    }

    const preparo = await ferramenta.preparar(c, args.data)
    // A27 da 21ª: o modelo dizia "Confira e confirme no cartão abaixo" sem cartão nenhum.
    if ('erro' in preparo) return { paraOModelo: { erro: preparo.erro, instrucao: 'Nenhum cartão apareceu: diga o erro à pessoa (e o que falta), sem falar em cartão.' } }

    const acao = await gravar(c.admin.from('copilot_acoes').insert({
      conversa_id: c.conversaId,
      tenant_id:   c.ctx.tenantId!,
      user_id:     c.ctx.internalUserId!,
      ferramenta:  ferramenta.nome,
      // Os ARGUMENTOS ficam: o "Confirmar" prepara de novo com eles (o mundo
      // pode ter mudado) e só então grava.
      payload:     { args: args.data, preparado: preparo.payload },
      resumo:      preparo.resumo,
    }).select('id').single(), 'preparar a ação do Copilot') as { id: string }

    return {
      paraOModelo: {
        status: 'aguardando_confirmacao',
        acao: resumoParaOModelo(preparo.resumo),
        instrucao: preparo.resumo.escolhas?.length
          ? 'Nada foi gravado ainda. Um cartão com OPÇÕES apareceu para a pessoa (veja o aviso e as escolhas do resumo). Diga em uma frase o que o aviso diz e peça para ela escolher no cartão. Não diga que já fez.'
          // A27 da 21ª: o mesmo do prompt — a frase dada, e nada de oferecer outro cartão.
          : 'Nada foi gravado ainda. Um cartão com Confirmar/Cancelar apareceu para a pessoa. Responda só “Confira e confirme no cartão abaixo.”, sem repetir os dados do cartão e sem perguntar se ela quer outro. Não diga que já fez.',
      },
      cartao: { tipo: 'acao', acaoId: acao.id, resumo: preparo.resumo, status: 'pendente' },
    }
  } catch (e) {
    if (ehSemAcesso(e as { message?: string; digest?: string })) {
      return { paraOModelo: { erro: 'Sem permissão: as permissões desta pessoa não liberam isso.' } }
    }
    console.error(`[copilot] ferramenta ${ferramenta.nome}:`, e)
    return { paraOModelo: { erro: `Falhou: ${mensagemDoErro(e)}` } }
  }
}

interface LinhaDaAcao {
  id: string; conversa_id: string; ferramenta: string; payload: { args: unknown; preparado?: unknown }
  resumo: ResumoDaAcao; status: StatusDaAcao; resultado: ResultadoDaAcao | null; expira_em: string
  decidida_em: string | null
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
  /** A opção escolhida no cartão com escolhas (`ResumoDaAcao.escolhas`). */
  escolha?: string | null,
): Promise<{ status: StatusDaAcao; resultado?: ResultadoDaAcao | null; error?: string }> {
  const { admin } = c
  const ctx = contextoDoCopilot(c.ctx)
  const atual = await ler(admin.from('copilot_acoes')
    .select('id, conversa_id, ferramenta, payload, resumo, status, resultado, expira_em, decidida_em')
    .eq('id', acaoId).eq('tenant_id', ctx.tenantId!).eq('user_id', ctx.internalUserId!)
    .maybeSingle(), 'ler a ação do Copilot') as LinhaDaAcao | null
  if (!atual) return { status: 'falhou', error: 'Ação não encontrada.' }

  // O cartão com escolhas só se confirma com UMA delas (r2-cli-01).
  if (decisao === 'confirmar' && atual.resumo.escolhas?.length && !atual.resumo.escolhas.some(e => e.chave === escolha)) {
    return { status: atual.status, error: 'Escolha uma das opções do cartão.' }
  }

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

  const agora = new Date()
  // Presa em "executando" (o processo caiu no meio): depois de 5 minutos, falhou.
  if (atual.status === 'executando' && atual.decidida_em && agora.getTime() - new Date(atual.decidida_em).getTime() > 5 * 60_000) {
    await tentar(admin.from('copilot_acoes')
      .update({ status: 'falhou', resultado: { mensagem: 'A gravação não terminou. Confira na tela e, se faltou, peça de novo.' } })
      .eq('id', acaoId).eq('status', 'executando'), 'encerrar a ação presa')
    return { status: 'falhou', resultado: { mensagem: 'A gravação não terminou. Confira na tela e, se faltou, peça de novo.' } }
  }

  const reivindicada = await ler(admin.from('copilot_acoes')
    .update({ status: 'executando', decidida_em: agora.toISOString() })
    .eq('id', acaoId).eq('status', 'pendente').gt('expira_em', agora.toISOString())
    .select('id'), 'reivindicar a ação') as { id: string }[] | null

  if (!reivindicada?.length) {
    // Não reivindicou: ou venceu (pelo relógio), ou outro clique já levou.
    if (new Date(atual.expira_em).getTime() <= agora.getTime()) {
      await tentar(admin.from('copilot_acoes').update({ status: 'vencida' }).eq('id', acaoId).eq('status', 'pendente'), 'marcar a ação vencida')
      return { status: 'vencida', error: 'Este cartão venceu. Peça de novo ao Copilot.' }
    }
    const agoraLida = await ler(admin.from('copilot_acoes').select('status, resultado')
      .eq('id', acaoId).maybeSingle(), 'reler a ação') as { status: StatusDaAcao; resultado: ResultadoDaAcao | null } | null
    return { status: agoraLida?.status ?? atual.status, resultado: agoraLida?.resultado ?? atual.resultado }
  }

  // O RESULTADO se calcula no try; o registro dele, fora: uma falha ao anotar
  // não pode virar "falhou" de algo que foi gravado.
  const resultado = await efetivarAcao(c, ctx, atual, escolha ?? undefined)

  // Registrar o resultado NÃO pode lançar: a gravação já aconteceu (ou não), e
  // a pessoa precisa saber. Uma nova tentativa; falhando as duas, fica no log e
  // a ação aparece "executando" até a varredura dos 5 minutos.
  const registrar = () => tentar(admin.from('copilot_acoes')
    .update({ status: resultado.status, resultado: resultado.resultado }).eq('id', acaoId), 'registrar o resultado da ação')
  if (!(await registrar())) await registrar()
  await tentar(admin.from('copilot_mensagens').insert({
    conversa_id: atual.conversa_id, tenant_id: ctx.tenantId!, papel: 'nota',
    conteudo: {
      texto: notaDaDecisao(atual.resumo.titulo, resultado.status, resultado.resultado.mensagem),
    },
  }), 'anotar o resultado na conversa')
  return resultado
}

/** O JSON com as chaves em ordem: o jsonb do banco reordena as chaves do que guardou. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

async function efetivarAcao(
  c: Omit<ContextoDaFerramenta, 'ctx'>,
  ctx: TenantContext,
  atual: LinhaDaAcao,
  escolha?: string,
): Promise<{ status: 'feita' | 'falhou'; resultado: ResultadoDaAcao }> {
  const falhou = (mensagem: string) => ({ status: 'falhou' as const, resultado: { mensagem } })
  const ferramenta = ferramentasDoCargo(ctx).find(f => f.nome === atual.ferramenta)
  if (!ferramenta || ferramenta.tipo !== 'escrita') return falhou('Sua permissão não libera mais esta ação.')
  const args = ferramenta.parametros.safeParse(atual.payload?.args)
  if (!args.success) return falhou('A ação guardada é inválida.')

  const cf: ContextoDaFerramenta = { ctx, admin: c.admin, pagina: c.pagina, slugDoPortal: c.slugDoPortal }
  try {
    // Prepara de NOVO: o mundo pode ter mudado (o horário foi ocupado).
    const preparo = await ferramenta.preparar(cf, args.data)
    if ('erro' in preparo) return falhou(preparo.erro)
    // E grava o que a pessoa VIU: se o preparo de agora resolveu outra coisa
    // (outra cliente com o mesmo nome, outro valor), não grava.
    // O texto E os ids: dois homônimos dão o mesmo resumo e outro registro.
    if (canonico(preparo.resumo) !== canonico(atual.resumo)
      || (atual.payload?.preparado !== undefined && canonico(preparo.payload) !== canonico(atual.payload.preparado))) {
      return falhou('A situação mudou desde o cartão. Peça de novo ao Copilot para conferir.')
    }
    // Só a GRAVAÇÃO leva a marca "pelo Copilot" à Auditoria (CP1): o que o
    // cliente de serviço escreve aqui dentro — também pelos núcleos que abrem o
    // próprio cliente — sai com `x-bellaris-via: copilot`, em nome de quem pediu.
    const r = await comViaDoCopilot(() => ferramenta.efetivar(cf, preparo.payload, escolha))
    if ('erro' in r) return falhou(r.erro)
    return { status: 'feita', resultado: r }
  } catch (e) {
    if (ehSemAcesso(e as { message?: string; digest?: string })) return falhou('Sua permissão não libera esta ação.')
    console.error(`[copilot] efetivar ${ferramenta.nome}:`, e)
    return falhou(mensagemDoErro(e))
  }
}

/**
 * O resumo do cartão como volta ao MODELO: o CPF mascarado (só os dois
 * dígitos do fim). A pessoa vê inteiro no cartão; a OpenAI não precisa ler de
 * novo um documento para dizer "confirme no cartão" (revisão de 2026-10-08).
 */
export function resumoParaOModelo(resumo: ResumoDaAcao): ResumoDaAcao {
  return {
    ...resumo,
    linhas: resumo.linhas.map(l => l.rotulo === 'CPF'
      ? { ...l, valor: l.valor.replace(/\d{3}\.?\d{3}\.?\d{3}-?(\d{2})/g, '***.***.***-$1') }
      : l),
  }
}
