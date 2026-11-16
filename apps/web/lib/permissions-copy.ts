import type { AppModule, PermissionLevel, ScopedModule } from '@estetica-os/types'

/**
 * Textos da tela de cargos — o que cada escolha significa para quem administra
 * a clínica.
 *
 * Vive separado de `lib/permissions.ts` de propósito: aquele arquivo entra no
 * caminho de autorização de toda requisição, e isto aqui é só copy de uma tela.
 *
 * O hint fixo por módulo que existia antes não dizia a diferença entre "Ver" e
 * "Gerenciar" — em Financeiro os dois liam "Lançamentos, relatórios, estorno e
 * comissões", quando a diferença real é poder estornar. Daí a frase ser por
 * (módulo, nível).
 */

// ─── Agrupamento por área do dia a dia ───────────────────────────────────────
// A ordem técnica de APP_MODULES não serve para a tela: deixava `roles` e
// `settings`, os dois mais perigosos, por último e com a mesma tipografia de
// "Estoque".

export type ModuleGroup = {
  key:     string
  label:   string
  hint:    string
  modules: readonly AppModule[]
}

export const MODULE_GROUPS: readonly ModuleGroup[] = [
  {
    key:     'atendimento',
    label:   'Atendimento',
    hint:    'O dia a dia com o cliente na unidade',
    modules: ['agenda', 'clients', 'loyalty', 'medical_records'],
  },
  {
    key:     'vendas',
    label:   'Vendas',
    hint:    'Negociação, fechamento e o que se vende (procedimentos e pacotes)',
    // Procedimentos e pacotes são o que se vende — ficam ao lado do funil, como
    // no menu (decisão do Heitor, 2026-09-30; antes era Gestão).
    modules: ['crm', 'procedures'],
  },
  {
    key:     'marketing',
    label:   'Marketing',
    hint:    'Captação: campanhas, notificações e templates',
    // Automações ficavam fora de todo grupo — e por isso fora da tela: nenhum
    // cargo conseguia ligá-las (até 2026-10-08).
    modules: ['marketing', 'automations'],
  },
  {
    key:     'dinheiro',
    label:   'Dinheiro e estoque',
    hint:    'O que entra, o que sai e o que tem em casa',
    modules: ['cashier', 'financial', 'stock'],
  },
  {
    key:     'gestao',
    label:   'Gestão e configuração',
    hint:    'Números da rede, fichas e quem pode o quê',
    // A Auditoria não está aqui: é só da Admin da rede (o Heitor, 2026-11-16:
    // "Auditoria é só admin"), não se dá a cargo nenhum (MODULOS_SO_DA_ADMIN).
    // Os modelos de documento ao lado dos de ficha (o Heitor, 2026-11-16: a
    // permissão de Documentos é a dos MODELOS; colher a assinatura não pede).
    modules: ['reports', 'team', 'forms', 'documents', 'roles', 'settings'],
  },
  {
    key:     'copilot',
    label:   'Copilot',
    hint:    'A secretária virtual, num chat sobre todas as telas',
    modules: ['copilot'],
  },
]

// ─── O que cada nível libera, em português de quem monta o cargo ────────────────

const SEM_ACESSO = 'Não aparece para esta pessoa.'

export const LEVEL_COPY: Record<AppModule, Partial<Record<PermissionLevel, string>>> = {
  agenda: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre a agenda, inicia e conclui atendimentos e escreve as anotações da sessão.',
    MANAGE: 'Tudo do Ver, mais marcar, remarcar, cancelar, marcar falta, fazer check-in e trocar quem atende no horário.',
  },
  clients: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre a lista de clientes e a ficha completa: histórico, compras, pagamentos e os documentos que a cliente assina, e colhe a assinatura deles.',
    MANAGE: 'Tudo do Ver, mais cadastrar cliente novo, editar dados, anexar documentos e inativar cliente.',
  },
  loyalty: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o saldo e o extrato de pontos do cliente.',
    MANAGE: 'Tudo do Ver, mais creditar e debitar pontos à mão, com motivo. Ligar o programa e definir as regras é Configurações.',
  },
  medical_records: {
    NONE:   SEM_ACESSO,
    VIEW:   'Lê, no Prontuário, a ficha de saúde, a evolução, as fotos do atendimento e os anexos clínicos (exames, laudos, receitas).',
    MANAGE: 'Tudo do Ver, mais preencher a ficha de saúde e a evolução, tirar as fotos do atendimento, anexar exames e laudos, acrescentar anotação ao atendimento concluído e liberar a parte clínica em pedidos de LGPD. Montar o plano de tratamento não pede o Prontuário: é de quem atende.',
  },
  // O Heitor, 2026-11-16: "A permissão de gerenciar documentos serve para
  // alguém poder criar/editar/excluir os modelos de documentos." Ver os
  // documentos da cliente é de quem vê a cliente; colher é de quem está na tela.
  documents: {
    NONE:   'Não mexe nos modelos de documento. Vê os documentos da cliente e colhe a assinatura do mesmo jeito (isso vem de Clientes, da Agenda e do PDV).',
    MANAGE: 'Cria, edita e desativa os modelos de documento (termos, contratos e os outros que a cliente assina, em Configurações → Documentos) e dispensa um documento obrigatório da cliente, com motivo. Colher a assinatura não pede esta permissão: é de quem está com a cliente — na ficha, no atendimento ou no PDV.',
  },
  procedures: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê a tabela de procedimentos e preços e os pacotes.',
    // D1 da 12ª: não promete a venda — vender no PDV é de quem recebe (podeReceber).
    MANAGE: 'Tudo do Ver, mais criar, precificar e organizar os procedimentos, as categorias e os pacotes. Vender é no PDV, de quem tem o PDV.',
  },
  stock: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê produtos, saldo por unidade, alertas de estoque baixo e histórico de movimentação.',
    MANAGE: 'Tudo do Ver, mais cadastrar produto (as categorias, as marcas e os fornecedores), dar entrada e baixa, ajustar inventário e transferir entre unidades — nas unidades da pessoa.',
  },
  financial: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê faturamento, despesas, extrato de lançamentos e comissões.',
    MANAGE: 'Tudo do Ver, mais lançar receita e despesa, estornar e conceder crédito ao cliente.',
  },
  cashier: {
    NONE:   SEM_ACESSO,
    // A15 da 11ª: o PDV abre o "Fechamento do dia" no menu — a linha diz.
    MANAGE: 'Abre o PDV: faz a venda nova (procedimento, pacote, produto e crédito), recebe a comanda do atendimento e do plano de tratamento e as parcelas que a cliente veio pagar, e faz o Fechamento do dia (o que entrou, por forma de pagamento). Não lança despesa, não estorna e não vê o financeiro da unidade — isso é Financeiro.',
  },
  crm: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o funil de oportunidades, abre os cards e lê as conversas com os contatos (WhatsApp, Instagram, Messenger).',
    MANAGE: 'Tudo do Ver, mais criar e mover oportunidades, responder as conversas e agendar direto pelo CRM. Montar funis, etapas e motivos de perda é Configurações.',
  },
  marketing: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o painel de anúncios: quanto foi investido, retorno e as oportunidades que vieram de cada campanha.',
    MANAGE: 'Tudo do Ver, mais criar, ativar, pausar e arquivar as campanhas de notificação.',
  },
  reports: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre os relatórios que o cargo libera (as abas marcadas abaixo: financeiro, vendas, oportunidades, agenda, clientes, procedimentos, quem atende, estoque…). O alcance decide se é a rede toda ou uma unidade por vez.',
  },
  team: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê quem trabalha nas unidades, com o cargo, as unidades de cada um e a situação.',
    MANAGE: 'Tudo do Ver, mais cadastrar e editar pessoas, definir o cargo, as unidades e onde cada uma atende, e desativar quem sai. Quem é Admin da rede só outra Admin da rede altera.',
  },
  forms: {
    NONE:   SEM_ACESSO,
    MANAGE: 'Monta as fichas de atendimento (as que quem atende preenche) e a ficha de saúde. Preencher a ficha é Prontuário.',
  },
  roles: {
    NONE:   SEM_ACESSO,
    MANAGE: 'Cria cargos e define o que cada um acessa — inclusive o próprio.',
  },
  settings: {
    NONE:   SEM_ACESSO,
    // A10 da 10ª: as Integrações vêm junto, e a tela tem de dizer.
    MANAGE: 'Cadastra e edita unidades e salas, as integrações (conecta o WhatsApp e as contas de anúncio, na aba Integrações), monta os funis do CRM (etapas e motivos de perda) e trata os pedidos de LGPD.',
  },
  automations: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre as automações e vê o que cada uma fez — sem poder mudar nem ligar.',
    MANAGE: 'Tudo do Ver, mais montar o fluxo, escolher o que ele faz e ligar ou desligar. Automação ligada manda mensagem e mexe no CRM sozinha.',
  },
  // Só da Admin da rede (MODULOS_SO_DA_ADMIN): fora da matriz de Cargos.
  audit: {
    NONE:   SEM_ACESSO,
  },
  copilot: {
    NONE:   'O Copilot não aparece para esta pessoa.',
    VIEW:   'Conversa com o Copilot para consultar — agenda, clientes, números — só do que o cargo já enxerga. Não prepara gravação nenhuma.',
    MANAGE: 'Tudo do Ver, mais pedir gravações (agendar, cadastrar, lançar…), sempre com o cartão de confirmação. Cada gravação ainda exige o módulo dela em Gerenciar.',
  },
}

// ─── Alcance ("Enxerga") ─────────────────────────────────────────────────────
// Nota extra só onde "só os próprios" tem consequência que o rótulo curto não
// entrega. No financeiro, por exemplo, o alcance próprio não filtra a tela: ela
// se reduz à lista de comissões.

export const SCOPE_NOTE: Partial<Record<ScopedModule, string>> = {
  reports:   'Uma unidade por vez: quem não tem “A rede inteira” vê só as unidades dela, uma de cada vez; quem tem escolhe a unidade e vê uma de cada vez. O consolidado da rede fica indisponível.',
  financial: 'Com alcance próprio a tela vira só "minhas comissões": some faturamento, despesas e extrato — e não dá para lançar, mesmo com Gerenciar.',
  // D20 (o Heitor, 2026-11-11): Ver inicia e conclui; Gerenciar confirma,
  // marca a chegada, cancela, marca a falta, remarca e troca a profissional;
  // com "só os meus", tudo isso só nos dela (F65).
  agenda:    'Com "só os meus", a pessoa mexe só nos atendimentos dela. Em Ver, inicia e conclui. Em Gerenciar, também marca a chegada, cancela e marca a falta dos dela. Confirmar a presença fica com quem tem "todos" e Gerenciar.',
}

// ─── Módulos que só existem no portal da rede ────────────────────────────────
// Quem tem unidade fixa é redirecionado de /admin (app/admin/layout.tsx), então
// esses acessos não valem nada para essa pessoa. Já aconteceu com `forms` e
// `reports`, que ganharam tela na unidade; estes três são de rede por natureza.

export const NETWORK_ONLY_NOTE = 'Só funciona para quem tem “A rede inteira”.'

export const NETWORK_ONLY: readonly AppModule[] = ['marketing', 'automations', 'roles', 'settings']

/**
 * A nota de abrangência de um módulo de rede. Configurações é a exceção (H7, o
 * Heitor, 2026-11-01: "gerente de uma unidade só mexe no que é da unidade"):
 * quem tem unidade fixa usa a aba Unidade — a nota "só funciona para quem tem
 * abrangência de rede" era falsa ali (A10 da 10ª simulação).
 */
export function notaDeAbrangencia(modulo: AppModule): string {
  if (modulo === 'settings') {
    return 'Quem não tem “A rede inteira” mexe só na aba Unidade (os dados, o horário e as salas das unidades dela): as integrações, os funis, as fichas, os modelos de documento e o resto são da rede toda e ficam com quem tem “A rede inteira”.'
  }
  return NETWORK_ONLY_NOTE
}

/**
 * Campanhas e Automações ficam SÓ no portal da rede (D-2, decisão do Heitor,
 * 2026-10-29: "a automação é da clínica, mesmo que o alvo seja a unidade").
 * A linha do módulo diz isso sempre — ligado ou não —, para quem monta o cargo
 * de alguém da unidade não esperar uma tela que ela não vai ter.
 */
export const SO_NA_REDE_NOTE: Partial<Record<AppModule, string>> = {
  marketing:   'É da rede toda: as telas ficam no portal da rede e valem só para quem tem “A rede inteira”.',
  automations: 'É da rede toda: as automações ficam no portal da rede e valem só para quem tem “A rede inteira”.',
}

// ─── Cargos sensíveis ────────────────────────────────────────────────────────
// Dois caminhos de auto-elevação. O aviso é uma linha na própria opção, não um
// banner: quem está montando o cargo precisa saber, não levar susto.

export const SENSITIVE_NOTE: Partial<Record<AppModule, string>> = {
  roles: 'Quem tem isto pode conceder a si mesmo qualquer outro acesso.',
  team:  'Permite atribuir a alguém um cargo mais poderoso que o próprio.',
}

/**
 * "Não vê as próprias comissões…" no resumo do cargo (A48 da 7ª) só para quem
 * PODE ter comissão — quem atende (Agenda, Prontuário) ou vende (CRM,
 * Recebimentos) — e está sem o Financeiro. A16 da 11ª simulação: a Estoquista
 * (só o Estoque) lia o aviso sem nem atender. Princípio 3.
 */
export function avisaSemMinhasComissoes(niveis: Partial<Record<'agenda' | 'medical_records' | 'crm' | 'cashier' | 'financial', string>>): boolean {
  if ((niveis.financial ?? 'NONE') !== 'NONE') return false
  return (['agenda', 'medical_records', 'crm', 'cashier'] as const).some(m => (niveis[m] ?? 'NONE') !== 'NONE')
}

/**
 * O “Vender” da ficha (pacote, procedimento pré-pago, produto, crédito) é de
 * quem RECEBE — Recebimentos, ou o Financeiro em Gerenciar (`podeReceber`,
 * lib/auth.ts). D1 da 12ª simulação: a Rita, com Procedimentos e CRM em
 * Gerenciar, lia “fechar a venda do pacote” e não via o botão. O resumo do cargo
 * diz a regra (princípio 3); quem vende segue decidido pelo cargo (princípio 1).
 * Nulo para quem nem vende nem mexe no comercial.
 */
export function quemVendeNoResumo(niveis: Partial<Record<'procedures' | 'crm' | 'clients' | 'cashier' | 'financial', string>>): string | null {
  if (niveis.cashier === 'MANAGE' || niveis.financial === 'MANAGE') {
    return 'Vende no PDV (procedimento, pacote, produto e crédito).'
  }
  if ((['procedures', 'crm', 'clients'] as const).some(m => niveis[m] === 'MANAGE')) {
    return 'Não vende no PDV: vender é de quem tem o PDV (ou o Financeiro em Gerenciar).'
  }
  return null
}

/** O texto da tela de Pacotes (D1 da 12ª): onde se vende, e quem vende. */
export const TEXTO_DA_VENDA_DO_PACOTE =
  'A venda é no PDV, em “Nova venda” (escolha Pacote). O PDV aparece a quem tem o PDV no cargo (ou o Financeiro em Gerenciar).'

/**
 * O Copilot no resumo do cargo (A17 da 17ª simulação; princípio 3): o resumo
 * lê o menu, e o Copilot não é entrada de menu — é o botão no canto da tela.
 * Nulo quando o cargo não o tem.
 */
export function copilotNoResumo(nivel: PermissionLevel | undefined): string | null {
  if (!nivel || nivel === 'NONE') return null
  return nivel === 'MANAGE'
    ? 'E o Copilot (o botão no canto da tela), para consultar e pedir gravações.'
    : 'E o Copilot (o botão no canto da tela), para consultar.'
}

/**
 * O mesmo aviso no CADASTRO de quem atende (A18 da 17ª simulação; princípio 3):
 * o cargo escolhido não tem o Financeiro, e a pessoa não verá as próprias
 * comissões — o resumo do cargo e a comissão na lista da Equipe já diziam.
 */
export const SEM_MINHAS_COMISSOES_NO_CADASTRO =
  'Com este cargo, a pessoa não verá as próprias comissões: falta o Financeiro em “Ver”, só os próprios. Para ver, ajuste o cargo em Configurações → Cargos.'

/**
 * O que falta escolher para salvar o cargo, dito junto do "Salvar acessos"
 * (A27 da 18ª simulação; princípio 3): a tela rolava até o módulo, e o retorno
 * era só o laranja pequeno "Escolha o que este cargo enxerga aqui." nele.
 * `modulos`: os rótulos dos módulos ligados sem o alcance escolhido.
 */
export function textoDoQueFaltaNoCargo(modulos: string[], faltaRelatorio: boolean): string {
  const lista = modulos.length <= 1 ? modulos.join('') : `${modulos.slice(0, -1).join(', ')} e ${modulos[modulos.length - 1]}`
  const partes = [
    modulos.length ? `o que o cargo enxerga em ${lista}` : null,
    faltaRelatorio ? 'ao menos um relatório em Relatórios (ou deixe Relatórios em "Sem acesso")' : null,
  ].filter(Boolean)
  return `Falta escolher ${partes.join(', e ')}.`
}
