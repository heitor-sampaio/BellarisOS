/**
 * Os dois grupos da suíte completa (2026-09-30): o que pode rodar EM PARALELO e
 * o que roda um por vez.
 *
 * A suíte roda contra o banco da produção, isolada pelo prefixo [e2e]. Um spec
 * só é ISOLADO — e roda ao lado de outros — quando cumpre as quatro regras
 * (conferidas em `tests/e2e-grupos.test.ts`, para a lista não mentir):
 *
 * 1. cria a própria rede (`criarOutraRede`);
 * 2. não lê nem mexe na rede REAL (`tenantId()`, `unidadeQueAtende()`,
 *    `filiaisAtivas()`);
 * 3. não usa a sessão padrão (o `page` do fixture é o admin da rede real) —
 *    entra com membros que ele mesmo cria;
 * 4. não chama cron nem função que passa por TODAS as redes.
 *
 * O resto é COMPARTILHADO: dois deles ao mesmo tempo na rede real (a mesma
 * agenda, o mesmo cadastro) se atropelariam. Migrar um compartilhado para rede
 * própria e trazê-lo para cá é o jeito de a suíte ficar mais curta.
 *
 * No CI os dois grupos rodam JUNTOS (desde 2026-09-30): a varredura de sobras
 * (global-setup) só leva o [e2e] com mais de uma hora, então a de um grupo não
 * apaga os dados do outro no meio do teste. Um isolado continua não podendo
 * depender de a rede real estar quieta, nem de nenhum cron passar — o
 * compartilhado ao lado chama `/api/cron/*`, e o cron de produção também
 * roda neste banco (DEVLOG, "O cron de produção e o banco do E2E").
 */
export const ISOLADOS = [
  'abrangencia-unidade.spec.ts',
  'agendar-com-credito.spec.ts',
  'anuncios-integracao.spec.ts',
  'autenticacao.spec.ts',
  'automacoes-ensaio.spec.ts',
  'busca-universal.spec.ts',
  'checkout-de-plano.spec.ts',
  'clinico-so-com-prontuario.spec.ts',
  'comissoes-calculo.spec.ts',
  'comissoes-configuracao.spec.ts',
  'comissoes-fechamento.spec.ts',
  'conclusao-atomica.spec.ts',
  'contato-propaga.spec.ts',
  'credenciais-fora-da-sessao.spec.ts',
  'documentos-atendimento.spec.ts',
  'documentos-contrato-pagamento.spec.ts',
  'documentos-editor-rico.spec.ts',
  'documentos-link-conversa.spec.ts',
  'documentos-link-publico.spec.ts',
  'documentos-modelos.spec.ts',
  'documentos-portal.spec.ts',
  'documentos-verificacao.spec.ts',
  'financeiro-parcelas.spec.ts',
  'fidelidade-desconto-no-pagamento.spec.ts',
  'fidelidade-ganho.spec.ts',
  'fidelidade-vouchers.spec.ts',
  'inbox-paginado.spec.ts',
  'lead-nao-se-apaga.spec.ts',
  'lotes-baixa.spec.ts',
  'pacote-agendar.spec.ts',
  'pacotes-venda.spec.ts',
  'pre-pago.spec.ts',
  'quadro-tempo-real.spec.ts',
  'suporte-impersonar.spec.ts',
  'chamados.spec.ts',
  'sistema-redes.spec.ts',
  'assinaturas-asaas.spec.ts',
  'suporte-clinico.spec.ts',
  'suporte-credenciais.spec.ts',
  'suporte-plataforma.spec.ts',
  'vendas-desconto.spec.ts',
]

/** As quatro regras sobre o texto de um spec. `null` = isolado; senão, o motivo. */
export function motivoDeNaoSerIsolado(texto: string): string | null {
  if (!/criarOutraRede\(/.test(texto)) return 'não cria a própria rede'
  if (/\b(tenantId|unidadeQueAtende|filiaisAtivas)\(/.test(texto)) return 'lê a rede real'
  if (/async \(\{[^}]*\bpage\b[^}]*\}\)/.test(texto) && !/test\.use\(\{\s*storageState/.test(texto)) {
    return 'usa a sessão padrão (admin da rede real)'
  }
  if (/api\/cron|expirar_pontos|fidelidade_bonus_aniversario|avisos_de_vencimento|varrerSobras|retomarPendentes|dispararAgendas/.test(texto)) {
    return 'chama cron ou função de todas as redes'
  }
  return null
}
