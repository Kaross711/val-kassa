-- Kosten-beheer met geschiedenis (geen terugwerkende kracht)
-- 1 kostenpost = definitie; bedragen worden per periode ("geldig vanaf") of per week bewaard.
-- Zo blijven historische periodes correct als je later een bedrag wijzigt of stopzet.

-- ── Kostenposten (definities) ────────────────────────────────────────────────
create table if not exists public.kostenposten (
    id          uuid primary key default gen_random_uuid(),
    naam        text not null,
    type        text not null default 'vast' check (type in ('vast', 'variabel')),
    -- standaard uurtarief voor variabele posten (uren x tarief per week)
    uurtarief   numeric(10, 2),
    actief      boolean not null default true,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

-- ── Vaste kosten: bedrag per week met "geldig vanaf" (versie-geschiedenis) ────
create table if not exists public.kosten_periodes (
    id               uuid primary key default gen_random_uuid(),
    kostenpost_id    uuid not null references public.kostenposten (id) on delete cascade,
    bedrag_per_week  numeric(10, 2) not null default 0,
    geldig_vanaf     date not null,
    created_at       timestamptz not null default now(),
    unique (kostenpost_id, geldig_vanaf)
);

create index if not exists kosten_periodes_post_datum_idx
    on public.kosten_periodes (kostenpost_id, geldig_vanaf desc);

-- ── Variabele kosten: per week uren invoeren (tarief als momentopname) ────────
create table if not exists public.kosten_weken (
    id             uuid primary key default gen_random_uuid(),
    kostenpost_id  uuid not null references public.kostenposten (id) on delete cascade,
    week_start     date not null,            -- maandag van de week
    uren           numeric(10, 2) not null default 0,
    uurtarief      numeric(10, 2) not null default 0,
    created_at     timestamptz not null default now(),
    unique (kostenpost_id, week_start)
);

create index if not exists kosten_weken_post_week_idx
    on public.kosten_weken (kostenpost_id, week_start);

-- ── Berekening: kosten voor een periode, dag-voor-dag geprorateerd ───────────
-- Voor elke dag in [p_start, p_end] wordt het geldende weekbedrag / 7 genomen.
-- Vast   : het meest recente 'geldig vanaf' bedrag op of vóór die dag (0 als niets geldt).
-- Variabel: het bedrag (uren x tarief) van de week waar die dag in valt (0 als geen invoer).
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
                    coalesce((
                        select p.bedrag_per_week
                        from public.kosten_periodes p
                        where p.kostenpost_id = k.id
                          and p.geldig_vanaf <= dg.dag
                        order by p.geldig_vanaf desc
                        limit 1
                    ), 0) / 7.0
                else
                    coalesce((
                        select w.uren * w.uurtarief
                        from public.kosten_weken w
                        where w.kostenpost_id = k.id
                          and w.week_start <= dg.dag
                          and dg.dag < w.week_start + 7
                        limit 1
                    ), 0) / 7.0
            end
        ), 0) as bedrag
    from public.kostenposten k
    cross join dagen dg
    where k.actief
    group by k.id, k.naam, k.type;
$$;

-- ── RLS: intern kassasysteem, toegang via anon-key (zelfde model als de rest) ─
alter table public.kostenposten    enable row level security;
alter table public.kosten_periodes enable row level security;
alter table public.kosten_weken    enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kostenposten' and policyname = 'kostenposten_all') then
        create policy kostenposten_all on public.kostenposten for all to anon, authenticated using (true) with check (true);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kosten_periodes' and policyname = 'kosten_periodes_all') then
        create policy kosten_periodes_all on public.kosten_periodes for all to anon, authenticated using (true) with check (true);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kosten_weken' and policyname = 'kosten_weken_all') then
        create policy kosten_weken_all on public.kosten_weken for all to anon, authenticated using (true) with check (true);
    end if;
end $$;

grant all on public.kostenposten    to anon, authenticated;
grant all on public.kosten_periodes to anon, authenticated;
grant all on public.kosten_weken    to anon, authenticated;
grant execute on function public.get_kosten_voor_periode(date, date) to anon, authenticated;
