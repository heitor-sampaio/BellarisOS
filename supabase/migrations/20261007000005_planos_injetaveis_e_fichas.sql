-- Duas funcionalidades novas no catálogo dos planos (2026-10-07, pedido do
-- Heitor): o planejador de injetáveis e a personalização de fichas de
-- atendimento. chaves novas do catálogo: ["injetaveis", "fichas"]
--
-- Até hoje as duas estavam com todo mundo (eram parte do prontuário e das
-- configurações). Decisão: os planos e os retratos que já existem GANHAM as
-- duas — nada some para ninguém; quem quiser tirar, tira no plano. Retrato
-- nulo (sem plano = tudo liberado) fica como está.

update public.platform_plans p
   set recursos = jsonb_set(p.recursos, '{funcionalidades}',
         (p.recursos -> 'funcionalidades') || (
           select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements_text('["injetaveis", "fichas"]'::jsonb) c
            where not ((p.recursos -> 'funcionalidades') ? c)))
 where p.recursos is not null and jsonb_typeof(p.recursos -> 'funcionalidades') = 'array';

update public.tenant_subscriptions s
   set recursos = jsonb_set(s.recursos, '{funcionalidades}',
         (s.recursos -> 'funcionalidades') || (
           select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements_text('["injetaveis", "fichas"]'::jsonb) c
            where not ((s.recursos -> 'funcionalidades') ? c)))
 where s.recursos is not null and jsonb_typeof(s.recursos -> 'funcionalidades') = 'array';
