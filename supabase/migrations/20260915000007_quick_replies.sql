-- Respostas rápidas: o texto que a recepção repete o dia inteiro.
--
-- Diferente de template (`message_templates`): template é HSM, precisa da
-- aprovação da Meta e existe para furar a janela de 24h. Resposta rápida é
-- texto comum, vale em qualquer canal e não passa por ninguém — é só um atalho
-- de digitação.
--
-- Da REDE, não de cada pessoa: o valor está em todo mundo responder preço e
-- horário do mesmo jeito. Quem tem `crm: MANAGE` mantém a biblioteca.
CREATE TABLE IF NOT EXISTS public.quick_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Rótulo curto que aparece na lista e serve de busca.
  title      text NOT NULL,
  content    text NOT NULL,

  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dois atalhos com o mesmo nome tornam a lista impossível de usar: quem
-- escolhe não tem como saber qual é qual.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_replies_titulo
  ON public.quick_replies (tenant_id, lower(title));

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quick_replies_tenant ON public.quick_replies;
CREATE POLICY quick_replies_tenant ON public.quick_replies
  USING ((tenant_id)::text = jwt_claim('tenant_id'));

COMMENT ON TABLE public.quick_replies IS
  'Atalhos de texto do atendimento, compartilhados pela rede. Sem relação com os templates HSM da Meta.';
