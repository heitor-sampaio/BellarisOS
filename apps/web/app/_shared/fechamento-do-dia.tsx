import type { TenantContext } from '@estetica-os/types'
import { podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getFechamentoDoDia, getAvisosDoFechamento } from '@/lib/metrics'
import { diaDoFechamento, janelaDoDia, diaAindaAberto } from '@/lib/financeiro/fechamento'
import { linhasDaConferencia, type LinhaRegistrada } from '@/lib/financeiro/conferencia-do-fechamento'
import { normalizarHorario } from '@/lib/agenda/horario'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { comandasDoPdv } from '@/lib/pdv/comandas'
import { FusoProvider } from '@/components/shared/fuso'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { FechamentoDoDiaTela, type FechamentoFeito } from '@/components/shared/fechamento-do-dia-tela'
import { CabecalhoDoPdv } from '@/components/shared/pdv/pdv-tela'
import { getEstornosDoDia, getFechamentoPorQuemRecebeu, getFechamentoPorBandeira, type MovimentoDaUnidade } from '@/lib/metrics/fechamento-extra'

/**
 * O fechamento do dia, DENTRO do PDV (CX4 do plano de adaptação — a revisão
 * do Heitor, 2026-11-13): `/<portal>/pdv?fechar=1`, com o cabeçalho do PDV.
 * Sem abertura de caixa (2026-10-21): uma linha por forma de pagamento — o que
 * o sistema registrou × o que foi conferido —, o fundo de troco opcional na
 * linha do dinheiro, e quem fechou. A página da unidade passa a dela; a da
 * rede, a escolhida (`?unidade=`). Os avisos são dois (CX5); as taxas, a venda
 * sem taxa, a operadora e o CSV moram no Financeiro (CX6).
 */
export async function FechamentoDoDia({ ctx, unidades, unidadeId, diaPedido, basePath, daRede = null }: {
  ctx:       TenantContext
  unidades:  { id: string; name: string }[]
  unidadeId: string
  diaPedido?: string
  /** O endereço do PDV no portal (`/<slug>/pdv` ou `/admin/pdv`). */
  basePath:  string
  /** A45 da 8ª: o dia de cada unidade e o da rede (o portal da rede, com duas ou mais). */
  daRede?:   { unidades: MovimentoDaUnidade[]; total: { entradas: number; saidas: number; lancamentos: number } } | null
}) {
  // O dia e a janela no relógio da UNIDADE (F62): o pagamento das 23:30 de
  // Manaus é do dia de Manaus, não do seguinte em Brasília.
  const fuso = await fusoDaUnidade(ctx.tenantId, unidadeId)
  const agora = new Date()
  const hoje = diaDoFechamento(undefined, agora, fuso)
  const dia = diaDoFechamento(diaPedido, agora, fuso)
  const janela = janelaDoDia(dia, agora, fuso)!
  const janelaDeHoje = janelaDoDia(hoje, agora, fuso)!
  const args = { tenantId: ctx.tenantId!, branchId: unidadeId, from: janela.from, to: janela.to }
  const [resumo, resumoDeHoje, feitos, unidade, estornos, porQuemRecebeu, bandeiras, abertas] = await Promise.all([
    getFechamentoDoDia({ ...args, dia }),
    // O cabeçalho do PDV diz o que entrou HOJE (o dia aberto pode ser outro).
    dia === hoje ? null : getFechamentoDoDia({ ...args, from: janelaDeHoje.from, to: janelaDeHoje.to, dia: hoje }),
    ler(createAdminClient().from('fechamentos_do_dia')
      .select('id, esperado_dinheiro, contado_dinheiro, diferenca, conferido, resumo, observacao, fechado_por_nome, fechado_em')
      .eq('tenant_id', ctx.tenantId!).eq('branch_id', unidadeId).eq('dia', dia)
      .order('fechado_em', { ascending: false }).limit(20), 'carregar os fechamentos do dia'),
    // O horário da unidade: fechar HOJE antes do fim do expediente avisa (A50).
    ler(createAdminClient().from('branches').select('horario').eq('id', unidadeId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'ler o horário da unidade') as Promise<{ horario: unknown } | null>,
    // A42 da 8ª: o que foi estornado no dia (a venda e o estorno se anulam no resumo).
    getEstornosDoDia(args),
    // A40 da 11ª: com duas pessoas no balcão, cada uma precisa saber o que entrega.
    getFechamentoPorQuemRecebeu(args),
    // A44 da 12ª: o cartão do dia por bandeira (a conciliação com a operadora).
    getFechamentoPorBandeira(args),
    // CX5: as comandas abertas da unidade — o mesmo número do PDV.
    comandasDoPdv({ tenantId: ctx.tenantId!, branchId: unidadeId, situacao: 'ABERTAS', de: janelaDeHoje.from, ate: janelaDeHoje.to }),
  ])
  // Quem informou o fundo de troco do dia (ven-03), para a tela dizer.
  const fundo = resumo.fundoDeTroco != null
    ? await ler(createAdminClient().from('fundos_de_troco').select('informado_por_nome, informado_em')
        .eq('tenant_id', ctx.tenantId!).eq('branch_id', unidadeId).eq('dia', dia).maybeSingle(), 'ler o fundo de troco') as { informado_por_nome: string | null; informado_em: string } | null
    : null
  const atendeAte = diaAindaAberto(dia, normalizarHorario(unidade?.horario ?? null), agora, fuso)

  const gravados = (feitos ?? []) as Record<string, unknown>[]
  const ultimo = gravados[0]
  // CX5: o movimento depois do ÚLTIMO fechamento (feche de novo).
  const avisos = await getAvisosDoFechamento({ ...args, desde: ultimo ? String(ultimo.fechado_em) : null })

  // CX4: uma linha por forma — o registrado, o conferido e a diferença do último fechamento.
  const linhas = linhasDaConferencia({
    formas: resumo.formas, esperadoDinheiro: resumo.esperadoDinheiro,
    ultimo: ultimo ? {
      contado:   Number(ultimo.contado_dinheiro),
      diferenca: Number(ultimo.diferenca),
      conferido: (ultimo.conferido as Record<string, number> | null) ?? null,
      resumo:    Array.isArray(ultimo.resumo) ? (ultimo.resumo as LinhaRegistrada[]).map(l => ({ ...l, saldo: Number(l.saldo) })) : null,
    } : null,
  })

  const recebe = podeReceber(ctx)
  return (
    <>
      <RealtimeRefresher tables={['financeiro_sinais', 'appointments']} />
      <FusoProvider fuso={fuso}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CabecalhoDoPdv basePath={basePath} unidadeId={unidadeId} naRede={unidades.length > 1} vista="fechar"
            recebidoHoje={(resumoDeHoje ?? resumo).total.entradas} abertas={abertas.length}
            podeReceber={recebe} />
          <FechamentoDoDiaTela
            basePath={basePath}
            dia={dia}
            unidades={unidades}
            unidadeId={unidadeId}
            resumo={resumo}
            linhas={linhas}
            feitos={gravados.map(f => ({
              id:        String(f.id),
              esperado:  Number(f.esperado_dinheiro),
              contado:   Number(f.contado_dinheiro),
              diferenca: Number(f.diferenca),
              observacao: (f.observacao as string | null) ?? null,
              quem:      (f.fechado_por_nome as string | null) ?? null,
              quando:    String(f.fechado_em),
            }) satisfies FechamentoFeito)}
            // Fecha quem recebe e vê a unidade inteira (D6); a página já conferiu o ver.
            podeFechar={recebe}
            estornos={estornos}
            porQuemRecebeu={porQuemRecebeu}
            bandeiras={bandeiras}
            daRede={daRede}
            comandasAbertas={abertas.length}
            avisos={avisos}
            atendeAte={atendeAte}
            fundoInformado={fundo ? { quem: fundo.informado_por_nome, quando: fundo.informado_em } : null}
          />
        </div>
      </FusoProvider>
    </>
  )
}
