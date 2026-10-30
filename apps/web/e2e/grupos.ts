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
  'abrangencia-aviso-ao-redirecionar.spec.ts',
  'abrangencia-unidade.spec.ts',
  'agenda-encaixe-avisa.spec.ts',
  'agenda-grade-madrugada.spec.ts',
  'agenda-minha-agenda-data-e-rotulos.spec.ts',
  'agenda-minha-ocupacao.spec.ts',
  'agenda-modal-erro-mantem-campos.spec.ts',
  'agenda-profissional-da-rede.spec.ts',
  'agenda-salas.spec.ts',
  'agenda-so-os-meus-pelo-id.spec.ts',
  'agendar-com-credito.spec.ts',
  'anuncios-integracao.spec.ts',
  'autenticacao.spec.ts',
  'automacoes-ensaio.spec.ts',
  'busca-universal.spec.ts',
  'checkout-de-plano.spec.ts',
  'checkout-grade-de-horarios.spec.ts',
  'clinico-so-com-prontuario.spec.ts',
  'comissoes-calculo.spec.ts',
  'comissoes-configuracao.spec.ts',
  'comissoes-fechamento.spec.ts',
  'configuracoes-textos-e-estados-vazios.spec.ts',
  'configuracoes-unidade-horario-e-cep.spec.ts',
  'clientes-arquivar.spec.ts',
  'conclusao-atomica.spec.ts',
  'telefone-formatado.spec.ts',
  'crm-agendar-liga-oportunidade.spec.ts',
  'contato-propaga.spec.ts',
  'credenciais-fora-da-sessao.spec.ts',
  'documentos-atendimento.spec.ts',
  'documentos-contrato-pagamento.spec.ts',
  'documentos-editor-rico.spec.ts',
  'documentos-link-conversa.spec.ts',
  'documentos-link-publico.spec.ts',
  'documentos-modelos.spec.ts',
  'documentos-portal.spec.ts',
  'documentos-so-os-meus.spec.ts',
  'documentos-verificacao.spec.ts',
  'equipe-comissao-ao-criar.spec.ts',
  'equipe-dona-que-atende.spec.ts',
  'equipe-formulario-limpo.spec.ts',
  'equipe-horario-parte-da-unidade.spec.ts',
  'estoque-chip-da-unidade.spec.ts',
  'estoque-custo-de-consumo.spec.ts',
  'estoque-nunca-gera-despesa.spec.ts',
  'estoque-perda.spec.ts',
  'estoque-tela-consumo-e-lotes.spec.ts',
  'estoque-uso-do-produto.spec.ts',
  'estrutura-endereco-da-unidade.spec.ts',
  'fechamento-escopo-proprio.spec.ts',
  'ficha-cadastro-documento.spec.ts',
  'ficha-cadastro-mesma-pessoa-do-lead.spec.ts',
  'ficha-cadastro-validacao.spec.ts',
  'ficha-pre-atendimento.spec.ts',
  'ficha-pre-atendimento-obrigatoria.spec.ts',
  'financeiro-a-pagar-vencimento.spec.ts',
  'financeiro-a-receber-concluido.spec.ts',
  'financeiro-credito-em-vezes.spec.ts',
  'financeiro-despesa-sem-desconto.spec.ts',
  'financeiro-estorno-motivo.spec.ts',
  'financeiro-estorno-reabre.spec.ts',
  'financeiro-historico-forma-em-portugues.spec.ts',
  'financeiro-parcelas.spec.ts',
  'fidelidade-desconto-no-pagamento.spec.ts',
  'fidelidade-ganho.spec.ts',
  'fidelidade-painel-atualiza.spec.ts',
  'fidelidade-vouchers.spec.ts',
  'inbox-paginado.spec.ts',
  'indicadores-ticket-medio.spec.ts',
  'indicadores-dashboard-da-rede-so-os-meus.spec.ts',
  'notificacoes-so-os-meus.spec.ts',
  'lead-nao-se-apaga.spec.ts',
  'lotes-baixa.spec.ts',
  'pacote-abater-avulso.spec.ts',
  'pacote-agendar.spec.ts',
  'pacotes-venda.spec.ts',
  'portal-cliente-tratamento.spec.ts',
  'portal-cliente-varias-clinicas.spec.ts',
  'pre-pago.spec.ts',
  'quadro-tempo-real.spec.ts',
  'sessao-httponly.spec.ts',
  'suporte-entrada.spec.ts',
  'suporte-impersonar.spec.ts',
  'chamados.spec.ts',
  'sistema-redes.spec.ts',
  'assinaturas-asaas.spec.ts',
  'suporte-clinico.spec.ts',
  'suporte-credenciais.spec.ts',
  'suporte-plataforma.spec.ts',
  'planos-recursos.spec.ts',
  'planos-adicionais.spec.ts',
  'plataforma-gerente.spec.ts',
  'planos-comparativo.spec.ts',
  'vendas-desconto.spec.ts',
  'vendas-produto.spec.ts',
  // A frente do portal da cliente (2026-10-30): cada um na sua rede [e2e].
  'portal-cliente-documento-enviado.spec.ts',
  'portal-cliente-sem-preferencia.spec.ts',
  'portal-cliente-agendar-horarios.spec.ts',
  'portal-cliente-credito-interno.spec.ts',
  'portal-cliente-plano-proposto.spec.ts',
  'portal-cliente-a-clinica.spec.ts',
  'portal-cliente-prazo-na-tela.spec.ts',
  'portal-cliente-documentos-do-agendamento.spec.ts',
  'documentos-assinar-sem-passo-extra.spec.ts',
  'lgpd-portal-pacote-legivel.spec.ts',
  'rotas-com-sessao-levam-ao-destino.spec.ts',
  'crm-responsavel.spec.ts',
  'templates-por-numero.spec.ts',
  'whatsapp-modo-oficial.spec.ts',
  'sdk-da-meta-so-onde-usa.spec.ts',
  'listas-sem-corte.spec.ts',
  'listas-sem-corte-limpeza.spec.ts',
  'crm-funil-padrao.spec.ts',
  'crm-funis-pede-configuracoes.spec.ts',
  'prontuario-acessos.spec.ts',
  'indicadores-dashboard-e-agenda.spec.ts',
  'indicadores-uma-conta-so.spec.ts',
  'indicadores-cada-numero-no-seu-modulo.spec.ts',
  'indicadores-retencao-da-clinica.spec.ts',
  'indicadores-lucro-desconta-insumo.spec.ts',
  'financeiro-a-receber-todos-os-vencimentos.spec.ts',
  'prontuario-evolucao.spec.ts',
  'agenda-chegar-e-iniciar.spec.ts',
  'plano-dica-do-pacote.spec.ts',
  'plano-unidade-de-consumo.spec.ts',
  'ficha-documentos-um-cancelar.spec.ts',
  'atendimento-foto-clinica.spec.ts',
  'atendimento-rascunho.spec.ts',
  'atendimento-finalizar-grava-tudo.spec.ts',
  'atendimento-ficha-do-procedimento.spec.ts',
  'atendimento-ficha-planejador-injetaveis.spec.ts',
  'atendimento-obrigatorias-barram.spec.ts',
  'atendimento-rascunho-da-ficha.spec.ts',
  'atendimento-ficha-e-plano-juntos.spec.ts',
  'atendimento-plano-da-avaliacao-concluida.spec.ts',
  'injetaveis-confirmar-so-no-atendimento.spec.ts',
  'injetaveis-so-os-meus.spec.ts',
  'planejamentos-so-os-meus.spec.ts',
  'relatorios-so-os-meus.spec.ts',
  'permissoes-escopo-sem-modulo.spec.ts',
  'injetaveis-sem-prontuario.spec.ts',
  'whatsapp-nome-do-numero.spec.ts',
  'whatsapp-historico-uazapi.spec.ts',
  'whatsapp-cobranca.spec.ts',
  'acoes-em-lote.spec.ts',
  'importacao-contatos.spec.ts',
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
