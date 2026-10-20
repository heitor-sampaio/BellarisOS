-- A anamnese geral de campos fixos → o formato da ficha de pré-atendimento
-- (2026-10-20, etapa 2). Roda DEPOIS do deploy do código que lê os dois
-- formatos (f2a807e): antes dele, a tela de então não entenderia o novo.
--
-- `anamnese_do_legado` (20261020000002) converte com a ficha atual da rede da
-- cliente; o que já está no formato novo (tem `versao`) não muda.

update public.medical_records mr
   set general_anamnesis = public.anamnese_do_legado(mr.general_anamnesis, c.tenant_id),
       updated_at = now()
  from public.clients c
 where c.id = mr.client_id
   and mr.general_anamnesis is not null
   and jsonb_typeof(mr.general_anamnesis) = 'object'
   and not (mr.general_anamnesis ? 'versao');
