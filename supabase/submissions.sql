-- Design Wallet — salary and portfolio submissions (2026-11-01)
-- Run this ONCE, whole, in the Supabase SQL editor. It is idempotent.
--
-- Replaces the Apps Script + private spreadsheet behind /salary/submit/,
-- /salary/ (community figures), /submit-portfolio/ and the approved entries on
-- /wall-of-portfolios/. Karthik's call, 2026-11-01: submissions go to Supabase
-- only, never a Google Sheet. The sheet had been readable — and editable — by
-- anyone with its link (DECISIONS §20).
--
-- ⚠️ PERSONAL DATA, shaped like `subscribers`, not like the catalogue tables.
-- The publishable key gets NO privileges on either table. A visitor may only:
--   submit_salary(p)      one salary row, validated here, lands 'pending'
--   submit_portfolio(p)   one portfolio row, validated here, lands 'pending'
--   salary_community()    percentiles for groups of MIN_REPORTS or more
--   approved_portfolios   a view of approved entries, WITHOUT the email
--
-- APPROVING: Table Editor → salary_submissions / portfolio_submissions → set
-- `status` to 'approved'. Nothing unreviewed reaches a page (the same opt-in
-- rule the sheet had, 2026-09-16). For a portfolio, also paste `profile_image`
-- and `thumbnail` URLs if you have them; both are optional on the card.
--
-- The option ids below must match salary/data/benchmarks.json, exactly as the
-- Apps Script's lists did. Add a role, city or company type there and here.

-- ── Salary ───────────────────────────────────────────────────────────────

create table if not exists public.salary_submissions (
    id                bigint generated always as identity primary key,
    created_at        timestamptz not null default now(),
    role              text not null,
    level             text not null,
    years_experience  numeric(4,1) not null,
    -- Exactly one of city / country, as on the dashboard: an Indian employer
    -- means "which city", a foreign one means "which country".
    city              text,
    country           text,
    work_mode         text not null,
    employer_location text not null,
    company_type      text not null,
    company_size      text not null,
    fixed_ctc_lpa     numeric(6,2) not null,
    -- null = "NIL" (prefer not to say)
    variable_lpa      numeric(6,2),
    has_esops         text not null,
    salary_year       int not null,
    gender            text not null,
    source            text not null default 'community',
    status            text not null default 'pending',

    constraint salary_status check (status in ('pending', 'approved', 'rejected')),
    constraint salary_role check (role in ('product-designer', 'ux-researcher', 'design-systems-designer',
        'visual-designer', 'brand-designer', '3d-designer', 'motion-designer', 'graphic-designer',
        'illustrator', 'animator', 'video-editor')),
    constraint salary_level check (level in ('intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp')),
    constraint salary_location check (
        (employer_location = 'india' and country is null and city is not null and city in ('bangalore', 'mumbai', 'delhi-ncr',
            'hyderabad', 'pune', 'chennai', 'ahmedabad', 'kolkata', 'chandigarh', 'kochi', 'jaipur',
            'coimbatore', 'indore'))
        or (employer_location = 'foreign' and city is null and country is not null and country in ('united-states', 'australia',
            'united-kingdom', 'netherlands', 'singapore', 'germany', 'uae', 'canada'))
    ),
    constraint salary_work_mode check (work_mode in ('onsite', 'hybrid', 'remote')),
    constraint salary_company_type check (company_type in ('product', 'enterprise', 'it-services', 'freelance', 'agency')),
    constraint salary_company_size check (company_size in ('1-10', '11-50', '51-200', '201-1000', '1000+', 'NIL')),
    constraint salary_esops check (has_esops in ('Yes', 'No', 'NIL')),
    constraint salary_gender check (gender in ('Woman', 'Man', 'Non-binary', 'NIL')),
    constraint salary_years check (years_experience between 0 and 45),
    constraint salary_ctc check (fixed_ctc_lpa between 0.5 and 200),
    constraint salary_variable check (variable_lpa is null or variable_lpa between 0 and 200),
    constraint salary_year_range check (salary_year between 2000 and 2100)
);

alter table public.salary_submissions enable row level security;
revoke all on public.salary_submissions from anon, authenticated;

-- Deliberately no user id: the form promises an ANONYMOUS submission, so the
-- row must not be traceable to an account, even by us.
create or replace function public.submit_salary(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_employer text := trim(p ->> 'employerLocation');
    v_variable text := trim(coalesce(p ->> 'variableOrBonusLpa', ''));
    v_year     int;
begin
    -- Flood guard across all visitors, as the Apps Script had: 20 a minute.
    if (select count(*) from public.salary_submissions
        where created_at > now() - interval '1 minute') >= 20 then
        raise exception 'too many submissions right now' using errcode = '54000';
    end if;

    v_year := nullif(trim(p ->> 'salaryEffectiveFrom'), '')::int;
    if v_year is null or v_year > extract(year from now())::int then
        raise exception 'salary year out of range' using errcode = '22023';
    end if;

    -- Every other rule is a table constraint, so a bad value fails the insert
    -- with check_violation (23514) and nothing is stored.
    insert into public.salary_submissions (
        role, level, years_experience, city, country, work_mode, employer_location,
        company_type, company_size, fixed_ctc_lpa, variable_lpa, has_esops,
        salary_year, gender
    ) values (
        trim(p ->> 'role'),
        trim(p ->> 'level'),
        (p ->> 'yearsOfExperience')::numeric,
        case when v_employer = 'foreign' then null else nullif(trim(p ->> 'city'), '') end,
        case when v_employer = 'foreign' then nullif(trim(p ->> 'country'), '') else null end,
        trim(p ->> 'workMode'),
        v_employer,
        trim(p ->> 'companyType'),
        trim(p ->> 'companySize'),
        (p ->> 'annualFixedCtcLpa')::numeric,
        case when v_variable ~* '^nil$' then null else v_variable::numeric end,
        trim(p ->> 'hasEsops'),
        v_year,
        trim(p ->> 'gender')
    );
end;
$$;

revoke all on function public.submit_salary(jsonb) from public;
grant execute on function public.submit_salary(jsonb) to anon, authenticated;

-- The community figures /salary/ lays over the research estimates. Same rules
-- and same JSON shape as the Apps Script's buildCommunity(), so salary.js's
-- applyCommunity() needs no change:
--   approved rows, salary year within the last 2, in-range CTC;
--   outliers beyond 1.5×IQR dropped once a group has 8 or more;
--   a group published only at MIN_REPORTS (5) — never a raw row.
-- (Postgres caps a regex repetition at 255, so lengths are checked with
-- char_length, never \S{1,500}.)
-- Every cell is [p25, p50, p75, n, "c"]. percentile_cont interpolates exactly
-- as the script's percentile() did.
create or replace function public.salary_community()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with tiers (city, tier) as (
        values ('bangalore', 'tier-1'), ('mumbai', 'tier-1'), ('delhi-ncr', 'tier-1'),
               ('hyderabad', 'tier-1'), ('pune', 'tier-1'), ('chennai', 'tier-1'),
               ('ahmedabad', 'tier-2'), ('kolkata', 'tier-2'), ('chandigarh', 'tier-2'),
               ('kochi', 'tier-2'), ('jaipur', 'tier-2'), ('coimbatore', 'tier-2'),
               ('indore', 'tier-2')
    ),
    approved as (
        select s.*, s.role || '|' || s.level as pair, t.tier
        from public.salary_submissions s
        left join tiers t on t.city = s.city
        where s.status = 'approved'
          and s.salary_year >= extract(year from now())::int - 2
    ),
    -- "National" means the Indian market: a foreign-employer row is published
    -- under `country` instead, or it would drag every Indian figure upward.
    keyed (bucket, key, ctc) as (
        select 'national', pair, fixed_ctc_lpa from approved where city is not null
        union all select 'tier', pair || '|' || tier, fixed_ctc_lpa from approved where city is not null
        union all select 'cells', pair || '|' || city, fixed_ctc_lpa from approved where city is not null
        union all select 'country', pair || '|' || country, fixed_ctc_lpa from approved where city is null
        union all select 'workmode', pair || '|' || work_mode, fixed_ctc_lpa from approved
        union all select 'employer', pair || '|' || employer_location, fixed_ctc_lpa from approved
        union all select 'company', pair || '|' || company_type, fixed_ctc_lpa from approved
    ),
    quartiles as (
        select bucket, key, count(*) as n,
               percentile_cont(0.25) within group (order by ctc) as q1,
               percentile_cont(0.75) within group (order by ctc) as q3
        from keyed group by bucket, key
    ),
    kept as (
        select k.bucket, k.key, k.ctc
        from keyed k join quartiles q using (bucket, key)
        where q.n < 8 or k.ctc between q.q1 - 1.5 * (q.q3 - q.q1) and q.q3 + 1.5 * (q.q3 - q.q1)
    ),
    cells as (
        select bucket, key, jsonb_build_array(
                   round(percentile_cont(0.25) within group (order by ctc)::numeric, 1),
                   round(percentile_cont(0.50) within group (order by ctc)::numeric, 1),
                   round(percentile_cont(0.75) within group (order by ctc)::numeric, 1),
                   count(*), 'c') as cell
        from kept group by bucket, key
        having count(*) >= 5
    ),
    buckets (bucket) as (
        values ('national'), ('tier'), ('cells'), ('workmode'), ('employer'), ('company'), ('country')
    )
    select jsonb_build_object(
               'updated_at', now(),
               'submission_count', (select count(*) from approved),
               'min_reports', 5
           ) || coalesce((
               select jsonb_object_agg(b.bucket, coalesce(
                   (select jsonb_object_agg(c.key, c.cell) from cells c where c.bucket = b.bucket),
                   '{}'::jsonb))
               from buckets b
           ), '{}'::jsonb);
$$;

revoke all on function public.salary_community() from public;
grant execute on function public.salary_community() to anon, authenticated;

-- ── Portfolios ───────────────────────────────────────────────────────────

create table if not exists public.portfolio_submissions (
    id            bigint generated always as identity primary key,
    created_at    timestamptz not null default now(),
    full_name     text not null,
    email         text not null,
    portfolio_url text not null,
    designer_role text not null,
    location      text not null,
    primary_tools text[] not null default '{}',
    description   text not null,
    permission    boolean not null,
    status        text not null default 'pending',
    -- Filled in by hand at approval time. Both optional: a card falls back to
    -- a lettered avatar and a title-only thumbnail.
    profile_image text,
    thumbnail     text,

    constraint portfolio_status check (status in ('pending', 'approved', 'rejected')),
    constraint portfolio_name check (char_length(full_name) between 1 and 80),
    constraint portfolio_email check (char_length(email) between 6 and 254
        and email ~ '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]{2,}$'),
    constraint portfolio_url_shape check (char_length(portfolio_url) <= 500 and portfolio_url ~* '^https?://\S+$'),
    constraint portfolio_role check (designer_role in ('Product Designer', 'UI Designer', 'UX Designer',
        'Brand Designer', 'Graphic Designer', 'Motion Designer', 'Web Designer', '3D Designer',
        'Illustrator', 'Creative Developer', 'Multi-disciplinary Designer')),
    constraint portfolio_location check (char_length(location) between 1 and 80),
    constraint portfolio_tools check (primary_tools <@ array['Figma', 'Framer', 'Webflow', 'Photoshop',
        'Illustrator', 'Blender', 'After Effects', 'Spline', 'Cinema4D', 'Rive', 'Other']::text[]),
    constraint portfolio_description check (char_length(description) between 1 and 2000),
    constraint portfolio_permission check (permission),
    constraint portfolio_images check (
        (profile_image is null or (char_length(profile_image) <= 500 and profile_image ~* '^https://\S+$'))
        and (thumbnail is null or (char_length(thumbnail) <= 500 and thumbnail ~* '^https://\S+$')))
);

alter table public.portfolio_submissions enable row level security;
revoke all on public.portfolio_submissions from anon, authenticated;

create or replace function public.submit_portfolio(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select count(*) from public.portfolio_submissions
        where created_at > now() - interval '1 minute') >= 20 then
        raise exception 'too many submissions right now' using errcode = '54000';
    end if;

    insert into public.portfolio_submissions (
        full_name, email, portfolio_url, designer_role, location,
        primary_tools, description, permission
    ) values (
        trim(p ->> 'fullName'),
        lower(trim(p ->> 'email')),
        trim(p ->> 'portfolioUrl'),
        trim(p ->> 'designerRole'),
        trim(p ->> 'location'),
        coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'primaryTools', '[]'::jsonb))), '{}'),
        trim(p ->> 'portfolioDescription'),
        coalesce((p ->> 'permission')::boolean, false)
    );
end;
$$;

revoke all on function public.submit_portfolio(jsonb) from public;
grant execute on function public.submit_portfolio(jsonb) to anon, authenticated;

-- What /wall-of-portfolios/ reads. Approved rows only, and NO email: the page
-- has no use for it. Owner-rights view, like public_portfolios in schema.sql —
-- revoke first, then grant, or the view stays writable (schema.sql explains).
create or replace view public.approved_portfolios as
    select full_name, portfolio_url, designer_role, location, description,
           profile_image, thumbnail
    from public.portfolio_submissions
    where status = 'approved';

revoke all on public.approved_portfolios from anon, authenticated;
grant select on public.approved_portfolios to anon, authenticated;

-- ── For you, in the SQL editor ───────────────────────────────────────────
--
--   select * from public.salary_submissions    where status = 'pending' order by created_at;
--   select * from public.portfolio_submissions where status = 'pending' order by created_at;
--   select public.salary_community();   -- what /salary/ will show
