import type { AppModule, PermissionLevel } from '@estetica-os/types'

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
    // O Atendimento logo depois da Agenda (o Heitor, 2026-11-18: "Agenda é
    // agenda e atendimento é atendimento").
    modules: ['agenda', 'atendimento', 'clients', 'loyalty', 'medical_records'],
  },
  {
    key:     'vendas',
    label:   'Comercial',
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
    hint:    'Consultar e pedir gravações conversando, num chat sobre todas as telas',
    modules: ['copilot'],
  },
]

// ─── O que cada nível libera, em português de quem monta o cargo ────────────────

const SEM_ACESSO = 'Não aparece para esta pessoa.'

export const LEVEL_COPY: Record<AppModule, Partial<Record<PermissionLevel, string>>> = {
  // A Agenda é agenda (o Heitor, 2026-11-18: "Agenda é agenda e atendimento é
  // atendimento"): iniciar e concluir saíram daqui e são do Atendimento. Sai o
  // D20 ("a Agenda em Ver inicia e conclui").
  agenda: {
    // Sem escopo no cargo (o Heitor, 2026-11-23): quem atende vê a Minha agenda (a vista pessoal).
    NONE:   'Não aparece para esta pessoa — a menos que ela atenda: aí vê a Minha agenda, só com os horários dela, sem mexer.',
    VIEW:   'Abre a agenda e vê os horários marcados. Não marca nem remarca horário: isso é Gerenciar.',
    MANAGE: 'Tudo do Ver, mais marcar, confirmar, marcar a chegada, remarcar, cancelar, marcar falta e trocar quem atende no horário.',
  },
  // O Heitor, 2026-11-18: "Só inicia e conclui atendimento quem tem gerenciar no
  // atendimento." Cada passo, um módulo (2026-11-23, UM1–UM3). E os injetáveis
  // (2026-11-23: "o mapa de injetaveis é pra quem realiza atendimento").
  atendimento: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre a tela do atendimento e os planos de tratamento, sem iniciar nem concluir.',
    MANAGE: 'Tudo do Ver, e inicia, conclui e desiste do atendimento no meio, lança os insumos usados, monta o plano de tratamento, na avaliação ou depois, e, com o Prontuário em Ver, planeja os injetáveis e registra a aplicação deles. A evolução, as fotos e a ficha de saúde são do Prontuário em Gerenciar.',
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
    VIEW:   'Lê, no Prontuário, a ficha de saúde, a evolução, as fotos do atendimento, os anexos clínicos (exames, laudos, receitas) e os planejamentos e as aplicações de injetáveis.',
    MANAGE: 'Tudo do Ver, mais preencher a ficha de saúde e a evolução, tirar as fotos do atendimento, anexar exames e laudos, acrescentar anotação ao atendimento concluído e liberar a parte clínica em pedidos de LGPD. O início e o fim do atendimento e o plano de tratamento não pedem o Prontuário: são do Atendimento.',
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
    // A vista pessoal (2026-11-23): quem atende ou tem comissão no nome dela vê as Minhas comissões.
    NONE:   'Não aparece para esta pessoa — a menos que ela atenda ou tenha comissão no nome dela: aí vê as Minhas comissões, só as dela.',
    VIEW:   'Vê faturamento, despesas, extrato de lançamentos e comissões.',
    MANAGE: 'Tudo do Ver, mais lançar receita e despesa, estornar e conceder crédito ao cliente.',
  },
  cashier: {
    // A1 da 22ª: o Financeiro em Gerenciar também abre o PDV (PDV1, `podeReceber`).
    NONE:   'Não aparece para esta pessoa — a menos que o cargo tenha o Financeiro em Gerenciar, que também abre o PDV: vende, recebe e faz o Fechamento do dia.',
    // A15 da 11ª: o PDV abre o "Fechamento do dia" no menu — a linha diz.
    MANAGE: 'Abre o PDV: faz a venda nova (procedimento, pacote, produto e crédito), recebe a comanda do atendimento e do plano de tratamento e as parcelas que a cliente veio pagar, e faz o Fechamento do dia (o que entrou, por forma de pagamento). Não lança despesa, não estorna e não vê o financeiro da unidade — isso é Financeiro.',
  },
  crm: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o funil de oportunidades, abre os cards e lê as conversas com os contatos (WhatsApp, Instagram, Messenger).',
    MANAGE: 'Tudo do Ver, mais criar e mover oportunidades e responder as conversas. Agendar pelo CRM pede também a Agenda em Gerenciar. Montar funis, etapas e motivos de perda é Configurações.',
  },
  marketing: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o painel de anúncios: quanto foi investido, retorno e as oportunidades que vieram de cada campanha.',
    MANAGE: 'Tudo do Ver, mais criar, ativar, pausar e arquivar as campanhas de notificação.',
  },
  reports: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre os relatórios que o cargo libera (as abas marcadas abaixo: financeiro, vendas, oportunidades, agenda, clientes, procedimentos, quem atende, estoque…). Valem as unidades da pessoa: quem tem “A rede inteira” vê a rede toda.',
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

// ─── Módulos que só existem no portal da rede ────────────────────────────────
// Quem tem unidade fixa é redirecionado de /admin (app/admin/layout.tsx), então
// esses acessos não valem nada para essa pessoa. Já aconteceu com `forms` e
// `reports`, que ganharam tela na unidade; estes três são de rede por natureza.

// Desde 18/11 a configuração da rede toda é só da Admin da rede (o Heitor:
// "só pela conta admin"; `mexeNaConfigDaRede`).
export const NETWORK_ONLY_NOTE = 'Só funciona para quem tem “A rede inteira”, e criar e mudar é só da Admin da rede.'

export const NETWORK_ONLY: readonly AppModule[] = ['marketing', 'automations', 'roles', 'settings']

/**
 * A nota de abrangência de um módulo de rede. Configurações é a exceção (H7, o
 * Heitor, 2026-11-01: "gerente de uma unidade só mexe no que é da unidade"):
 * quem tem unidade fixa usa a aba Unidade — a nota "só funciona para quem tem
 * abrangência de rede" era falsa ali (A10 da 10ª simulação). O resto, desde
 * 18/11, é só da Admin da rede ("só pela conta admin").
 */
export function notaDeAbrangencia(modulo: AppModule): string {
  if (modulo === 'settings') {
    return 'Quem não é a Admin da rede mexe só na aba Unidade (os dados, o horário e as salas das unidades dela): as integrações, os funis, as fichas, os modelos de documento e o resto são da rede toda, e só a Admin da rede muda.'
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
  marketing:   'É da rede toda: as telas ficam no portal da rede e valem só para quem tem “A rede inteira”; criar e mudar é só da Admin da rede.',
  automations: 'É da rede toda: as automações ficam no portal da rede e valem só para quem tem “A rede inteira”; criar e mudar é só da Admin da rede.',
}

// ─── Cargos sensíveis ────────────────────────────────────────────────────────
// Dois caminhos de auto-elevação. O aviso é uma linha na própria opção, não um
// banner: quem está montando o cargo precisa saber, não levar susto.

export const SENSITIVE_NOTE: Partial<Record<AppModule, string>> = {
  roles: 'Quem tem isto pode conceder a si mesmo qualquer outro acesso.',
  team:  'Permite atribuir a alguém um cargo mais poderoso que o próprio.',
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
  // A5 da 24ª (princípio 3): o Fechamento do dia vem junto, e a linha diz de onde.
  if (niveis.cashier === 'MANAGE') {
    return 'Vende no PDV (procedimento, pacote, produto e crédito) e faz o Fechamento do dia: os dois vêm do PDV.'
  }
  if (niveis.financial === 'MANAGE') {
    return 'Vende no PDV (procedimento, pacote, produto e crédito) e faz o Fechamento do dia: os dois vêm do Financeiro em Gerenciar.'
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
 * O que falta escolher para salvar o cargo, dito junto do "Salvar acessos"
 * (A27 da 18ª simulação; princípio 3): a tela rolava até o módulo, e o retorno
 * era só o laranja pequeno no módulo. Sem escopo no cargo (2026-11-23), o que
 * pode faltar é só o relatório.
 */
export function textoDoQueFaltaNoCargo(): string {
  return 'Falta escolher ao menos um relatório em Relatórios (ou deixe Relatórios em "Sem acesso").'
}

/**
 * De onde vem a entrada Documentos do resumo do cargo (A24 da 21ª simulação;
 * princípio 3): ver e colher os documentos da cliente é de quem tem Clientes em
 * Ver (a regra de 16/11, `lib/documentos/acesso.ts`) — o resumo listava
 * "Documentos" num cargo sem os Modelos de documento, sem dizer por quê.
 */
export function documentosNoResumo(niveis: Partial<Record<'clients' | 'documents', string>>): string | null {
  if (!niveis.clients || niveis.clients === 'NONE') return null
  return 'Documentos vem de Clientes em “Ver”: ver e colher os documentos da cliente. Criar e editar os modelos é de quem tem Modelos de documento.'
}

/**
 * A1 da 22ª simulação (princípio 3): a linha do PDV na matriz mostrava "Sem
 * acesso" num cargo que abre o PDV, a Nova venda e o Fechamento — porque tem
 * o Financeiro em Gerenciar (PDV1, `podeReceber`). A linha diz, à vista.
 * Nulo quando o PDV está ligado ou o Financeiro não está em Gerenciar.
 */
export function pdvAbertoPeloFinanceiro(niveis: Partial<Record<'cashier' | 'financial', string>>): string | null {
  if ((niveis.cashier ?? 'NONE') !== 'NONE' || niveis.financial !== 'MANAGE') return null
  return 'Aberto pelo Financeiro em Gerenciar'
}

/**
 * A1 da 23ª simulação (princípio 3): com o PDV em "Sem acesso" e o Financeiro
 * em Gerenciar, o seletor da linha ficava em "Sem acesso" — o botão marcado
 * contradizia o que vale. A linha mostra o nível que VALE ("Gerenciar"),
 * travado, com o porquê (`pdvAbertoPeloFinanceiro`). O que se grava não muda:
 * o PDV segue em "Sem acesso" no cargo, e volta a valer se o Financeiro descer.
 */
export function nivelDoPdvPeloFinanceiro(niveis: Partial<Record<'cashier' | 'financial', string>>): 'MANAGE' | null {
  return pdvAbertoPeloFinanceiro(niveis) ? 'MANAGE' : null
}

/**
 * De onde vem a entrada Tratamentos do resumo do cargo (A2 da 22ª; princípio
 * 3, como Documentos na A24 da 21ª). Os planos são do Atendimento (UM3,
 * 2026-11-23): o menu a mostra a quem tem o Atendimento (a régua da página,
 * `lib/menu.ts`).
 */
export function tratamentosNoResumo(niveis: Partial<Record<'atendimento' | 'agenda' | 'medical_records' | 'cashier' | 'financial', string>>): string | null {
  if ((niveis.atendimento ?? 'NONE') === 'NONE') return null
  return 'Tratamentos vem do Atendimento em “Ver”: os planos de tratamento das clientes, para acompanhar.'
}

/**
 * Quem inicia e conclui, no resumo do cargo (A2 da 23ª, A1 da 24ª; princípio
 * 3). Desde 2026-11-18 é o Atendimento (o Heitor: "Só inicia e conclui
 * atendimento quem tem gerenciar no atendimento"): em Ver, só vê; sem o
 * Prontuário em Gerenciar, conclui sem o clínico. Nulo sem o Atendimento, ou
 * com ele e o Prontuário em Gerenciar.
 */
export function conclusaoNoResumo(
  niveis: Partial<Record<'atendimento' | 'agenda' | 'medical_records', string>>,
): string | null {
  const nivel = niveis.atendimento ?? 'NONE'
  if (nivel === 'NONE') return null
  if (nivel !== 'MANAGE') return 'Vê os atendimentos, sem iniciar nem concluir: iniciar e concluir pedem o Atendimento em Gerenciar.'
  if (niveis.medical_records !== 'MANAGE') return 'Inicia e conclui os atendimentos. A evolução, as fotos e a ficha de saúde pedem o Prontuário em Gerenciar.'
  return null
}
