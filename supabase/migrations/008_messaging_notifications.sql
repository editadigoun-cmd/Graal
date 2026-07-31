-- 008: messagerie interne & notifications

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  nom text,
  type text not null default 'DIRECT' check (type in ('DIRECT', 'GROUPE', 'EQUIPE')),
  equipe_id uuid references public.equipes(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  contenu text,
  type text not null default 'text' check (type in ('text', 'image', 'audio', 'fichier')),
  piece_jointe_path text,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages(conversation_id, created_at);

create table public.message_lectures (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lu_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

insert into storage.buckets (id, name, public)
values ('messagerie', 'messagerie', false)
on conflict (id) do nothing;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  titre text not null,
  corps text,
  lue boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notifications_profile_idx on public.notifications(profile_id, lue);
