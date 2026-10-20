/**
 * Um termo do sistema explicado no próprio texto (2026-10-20, pedido do
 * Heitor): quem chega ao site ainda não conhece o vocabulário. O termo,
 * sublinhado pontilhado, é um botão; a explicação, um `role="tooltip"` ligado
 * por `aria-describedby`, abre no hover, no foco e no toque — só CSS. Quem a
 * mantém dentro da tela do celular é `AjusteDosTermos` (sem JS, ela abre à
 * direita do termo, como antes).
 *
 * As explicações moram aqui, uma por termo, e só dizem o que o sistema faz.
 */
export const DICAS = {
  'erp-crm': 'CRM é a parte que cuida da cliente e da venda: conversas, funil, campanhas. ERP é a que cuida da operação e do dinheiro: agenda, estoque, financeiro. No BellarisOS, as duas são o mesmo sistema.',
  'whatsapp-oficial': 'O oficial é a API da própria Meta: com modelos de mensagem aprovados e a tarifa por mensagem, cobrada pela Meta. O WhatsApp Web conecta o número que a clínica já usa lendo o QR code, sem tarifa da Meta.',
  'modelos': 'No WhatsApp oficial, falar com quem não mandou mensagem nas últimas 24h só pode ser com um modelo aprovado pela Meta — um lembrete, uma confirmação, uma campanha.',
  'tarifa': 'A Meta cobra as mensagens-modelo do WhatsApp oficial direto no cartão da clínica, na conta dela. O BellarisOS mostra o que foi cobrado no mês.',
  'dre': 'O demonstrativo do resultado: quanto entrou, quanto saiu e quanto sobrou no mês, organizado por categoria.',
  'inbox': 'Uma caixa de entrada só, com as conversas de todos os números da clínica e várias pessoas atendendo.',
  'funil': 'Cada cliente interessada vira um cartão que anda pelas etapas, do primeiro contato até fechar a venda.',
  'silencio': 'Das 21h às 8h (dá para mudar em cada automação), nenhuma mensagem automática sai para a cliente: o que cairia nesse horário espera e sai de manhã. Os avisos para a equipe saem na hora.',
} as const

export type ChaveDaDica = keyof typeof DICAS

export function Termo({ dica, children }: { dica: ChaveDaDica; children: string }) {
  const id = `dica-${dica}`
  return (
    <span className="site-termo">
      <button type="button" className="site-termo-gatilho" aria-describedby={id}>{children}</button>
      <span id={id} role="tooltip" className="site-termo-dica">{DICAS[dica]}</span>
    </span>
  )
}
