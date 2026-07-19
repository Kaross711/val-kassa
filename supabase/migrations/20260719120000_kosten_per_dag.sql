-- Variabele kosten: van "uren per week" naar "uren per dag".
-- Oud model: 1 regel per week (uniek op week_start), berekening deelde het weekbedrag door 7
--            en smeerde het uit over alle 7 dagen. Je kon dus maar 1 keer per week invullen.
-- Nieuw model: 1 regel per dag (uniek op datum). Schrijf je 8 uur op een dag, dan komen
--              die kosten (8 x tarief) op precies die dag erbij. Meerdere dagen in dezelfde
--              week kunnen gewoon naast elkaar. Geen proratering meer.

-- ── Nieuwe tabel: uren per dag ───────────────────────────────────────────────
create table if not exists public.kosten_dagen (
    id             uuid primary key default gen_random_uuid(),
    kostenpost_id  uuid not null references public.kostenposten (id) on delete cascade,
    datum          date not null,
    uren           numeric(10, 2) not null default 0,
    uurtarief      numeric(10, 2) not null default 0,
    created_at     timestamptz not null default now(),
    unique (kostenpost_id, datum)
);

create index if not exists kosten_dagen_post_datum_idx
    on public.kosten_dagen (kostenpost_id, datum);

-- ── Bestaande weekdata overzetten (weekbedrag landt op de maandag van die week) ─
insert into public.kosten_dagen (kostenpost_id, datum, uren, uurtarief, created_at)
select w.kostenpost_id, w.week_start, w.uren, w.uurtarief, w.created_at
from public.kosten_weken w
on conflict (kostenpost_id, datum) do nothing;

-- ── Berekening: per dag exact de geboekte uren x tarief (geen /7 meer) ────────
create or replace function public.get_kosten_voor_periode(p_start date, p_end date)
    returns table (
        kostenpost_id uuid,
        naam          text,
        type          text,
        bedrag        numeric
    )
    language sql
    stable
    security definer
    set search_path = public
as $$
    with dagen as (
        select generate_series(p_start, p_end, interval '1 day')::date as dag
    )
    select
        k.id   as kostenpost_id,
        k.naam as naam,
        k.type as type,
        coalesce(sum(
            case
                when k.type = 'vast' then
                    -- vaste kosten blijven per week: geldend weekbedrag / 7 per dag
                    coalesce((
                        select p.bedrag_per_week
                        from public.kosten_periodes p
                        where p.kostenpost_id = k.id
                          and p.geldig_vanaf <= dg.dag
                        order by p.geldig_vanaf desc
                        limit 1
                    ), 0) / 7.0
                else
                    -- variabele kosten: exact de uren van die dag x tarief (geen proratering)
                    coalesce((
                        select d.uren * d.uurtarief
                        from public.kosten_dagen d
                        where d.kostenpost_id = k.id
                          and d.datum = dg.dag
                    ), 0)
            end
        ), 0) as bedrag
    from public.kostenposten k
    cross join dagen dg
    where k.actief
    group by k.id, k.naam, k.type;
$$;

-- ── RLS + rechten (zelfde model als de rest) ─────────────────────────────────
alter table public.kosten_dagen enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kosten_dagen' and policyname = 'kosten_dagen_all') then
        create policy kosten_dagen_all on public.kosten_dagen for all to anon, authenticated using (true) with check (true);
    end if;
end $$;

grant all on public.kosten_dagen to anon, authenticated;

-- Oude weektabel is niet meer nodig (data is overgezet naar kosten_dagen).
drop table if exists public.kosten_weken;
