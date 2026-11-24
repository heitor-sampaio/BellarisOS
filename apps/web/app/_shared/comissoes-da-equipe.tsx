import { can, vistaPessoal } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { totaisDoResumoDasComissoes } from '@/lib/metrics/comissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { TenantContext } from '@estetica-os/types'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { AbasDoFinanceiro } from '@/components/shared/abas-do-financeiro'
import { FinanceiroComissoes } from '@/components/shared/financeiro-comissoes'
import { periodosRecentes, periodoDaChave } from '@/lib/comissoes/periodo'
import { fusoDaRede, fusosDasUnidades } from '@/lib/unidades/fuso-da-unidade'
import {
  configDeComissaoDaRede, resumoDasComissoes, extratoDasComissoes, fechamentosRecentes,
} from '@/lib/comissoes/leitura'

/**
 * Financeiro → Comissões, o corpo dos dois portais. A página da rede passa as
 * unidades da rede (e o filtro); a da unidade, só a dela. O período é o do
 * fechamento que a rede escolheu (Configurações → Comissões).
 *
 * Abre com o Financeiro em Ver (as de todos, nas unidades ao alcance) ou como
 * VISTA PESSOAL — quem atende sem o Financeiro vê só a própria linha
 * ("Minhas comissões") e não fecha.
 */
export async function ComissoesDaEquipe({ ctx, unidades, unidadeAtual, basePath, voltarPara, periodoPedido, abas }: {
  ctx:           TenantContext
  /** As unidades ao alcance desta tela (no portal da unidade, uma). */
  unidades:      { id: string; name: string; ativa?: boolean }[]
  /** Recorte da rede por uma unidade. */
  unidadeAtual?: string
  basePath:      string
  voltarPara:    string
  periodoPedido?: string
  /**
   * FI6: a aba Comissões do Financeiro — o `/financeiro` do portal e o título
   * dele. Na vista pessoal não há as outras abas (o Financeiro dela é esta
   * tela), e fica sem a barra.
   */
  abas?: { base: string; titulo: string }
}) {
  const config = await configDeComissaoDaRede(ctx.tenantId!)
  const agora = new Date()
  // O fechamento no relógio da rede (D12 do levantamento das regras).
  const fuso = await fusoDaRede(ctx.tenantId)
  const periodos = periodosRecentes(config.periodo, agora, 12, fuso)
  const periodo = periodoDaChave(periodoPedido, config.periodo, fuso) ?? periodos[0]!
  // O período pedido pode ser mais antigo que a lista: entra nela.
  const lista = periodos.some(p => p.chave === periodo.chave) ? periodos : [...periodos, periodo]

  const doFiltro = unidadeAtual && unidades.some(u => u.id === unidadeAtual) ? [unidadeAtual] : unidades.map(u => u.id)
  const soAsProprias = can(ctx, 'financial', 'VIEW') ? null : vistaPessoal(ctx, 'financial')
  // Sem o Financeiro e sem a vista pessoal, nada (a página já barra).
  if (!soAsProprias && !can(ctx, 'financial', 'VIEW')) throw semAcesso()
  const recorte = {
    tenantId: ctx.tenantId!, branchIds: doFiltro, inicio: periodo.inicio, fim: periodo.fim,
    profissionalId: soAsProprias,
  }
  const [resumoLido, extrato, fechamentos] = await Promise.all([
    resumoDasComissoes(recorte),
    extratoDasComissoes(recorte),
    fechamentosRecentes(ctx.tenantId!, doFiltro, soAsProprias),
  ])
  // Quem foi desativado segue com a comissão dele, MARCADO (A43 da 6ª
  // simulação: a Nina desativada aparecia como qualquer outra) — "(inativo)",
  // a marca do filtro "Responsável" do quadro (H6).
  const ids = [...new Set(resumoLido.map(r => r.professionalId))]
  const inativos = new Set(ids.length
    ? ((await ler(createAdminClient().from('users').select('id').eq('tenant_id', ctx.tenantId!).eq('is_active', false).in('id', ids),
        'ver quem foi desativado')) ?? []).map(u => u.id as string)
    : [])
  const marcar = (id: string, nome: string) => (inativos.has(id) ? `${nome} (inativo)` : nome)
  const resumo = resumoLido.map(r => ({ ...r, professionalName: marcar(r.professionalId, r.professionalName) }))

  // Os totais somam as LINHAS do resumo, que já vêm agregadas no banco (uma
  // por profissional e unidade) — a soma é a de lib/metrics (C46/C-17 da F68).
  const totais = totaisDoResumoDasComissoes(resumo)

  const comAbas = !!abas && !soAsProprias
  return (
    <>
      <RealtimeRefresher tables={['comissoes_sinais']} />
      {comAbas && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>{abas.titulo}</h1>
          <AbasDoFinanceiro base={abas.base} atual="comissoes" manter={{ unidade: unidadeAtual }} />
        </div>
      )}
      <FinanceiroComissoes
        dentroDasAbas={comAbas}
        titulo={soAsProprias ? 'Minhas comissões' : 'Comissões'}
        basePath={basePath}
        voltarPara={voltarPara}
        periodos={lista.map(p => ({ chave: p.chave, rotulo: p.rotulo }))}
        periodoAtual={periodo.chave}
        // A32 da 10ª: o período que ainda corre — o "Fechar e pagar" paga até AGORA, não até o fim dele.
        periodoEmCurso={periodo.fim.getTime() > agora.getTime()}
        unidades={unidades.length > 1 ? unidades : undefined}
        unidadeAtual={unidadeAtual}
        resumo={resumo}
        totais={totais}
        extrato={extrato}
        fechamentos={fechamentos}
        podeFechar={can(ctx, 'financial', 'MANAGE')}
        soAsProprias={!!soAsProprias}
        fusoDaRede={fuso}
        // D7 da 26ª: cada lançamento (tela e CSV) no relógio da unidade dele.
        fusosDasUnidades={await fusosDasUnidades(ctx.tenantId)}
      />
    </>
  )
}
