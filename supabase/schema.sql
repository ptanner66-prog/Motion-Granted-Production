-- Motion Granted Database Schema
-- Run this in Supabase SQL Editor to set up the database

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  phone text,
  bar_number text not null,
  states_licensed text[] not null,
  firm_name text,
  firm_address text,
  firm_phone text,
  role text not null default 'client' check (role in ('client', 'clerk', 'admin')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clerks extended profile
create table if not exists public.clerks (
  id uuid references public.profiles on delete cascade primary key,
  availability_status text default 'available' check (availability_status in ('available', 'busy', 'unavailable')),
  current_workload int default 0,
  max_workload int default 5
);

-- Create sequence for order numbers
create sequence if not exists order_number_seq start 1;

-- Orders table
create table if not exists public.orders (
  id uuid default uuid_generate_v4() primary key,
  order_number text unique not null,
  client_id uuid references public.profiles not null,
  clerk_id uuid references public.clerks,

  -- Motion details
  motion_type text not null,
  motion_tier int not null,
  base_price decimal(10,2) not null,
  turnaround text not null check (turnaround in ('standard', 'rush_72', 'rush_48')),
  rush_surcharge decimal(10,2) default 0,
  total_price decimal(10,2) not null,

  -- Deadlines
  filing_deadline date not null,
  expected_delivery date not null,

  -- Case info
  jurisdiction text not null,
  court_division text,
  case_number text not null,
  case_caption text not null,

  -- Case details
  statement_of_facts text not null,
  procedural_history text not null,
  instructions text not null,
  related_entities text,

  -- Status
  status text not null default 'submitted' check (status in (
    'submitted', 'under_review', 'assigned', 'in_progress',
    'draft_delivered', 'revision_requested', 'revision_delivered',
    'completed', 'on_hold', 'cancelled'
  )),

  -- Payment
  stripe_payment_intent_id text,
  stripe_payment_status text,

  -- Conflict
  conflict_flagged boolean default false,
  conflict_cleared boolean default false,
  conflict_notes text,

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Parties table (for conflict checking)
create table if not exists public.parties (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders on delete cascade not null,
  party_name text not null,
  party_name_normalized text not null,
  party_role text not null,
  created_at timestamptz default now()
);

-- Create index for conflict checking
create index if not exists idx_parties_normalized on public.parties(party_name_normalized);

-- Documents table
create table if not exists public.documents (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders on delete cascade not null,
  file_name text not null,
  file_type text not null,
  file_size int not null,
  file_url text not null,
  document_type text not null,
  uploaded_by uuid references public.profiles not null,
  is_deliverable boolean default false,
  created_at timestamptz default now()
);

-- Messages table (in-platform communication)
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders on delete cascade not null,
  sender_id uuid references public.profiles not null,
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Revision requests
create table if not exists public.revision_requests (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders on delete cascade not null,
  instructions text not null,
  document_url text,
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  created_at timestamptz default now()
);

-- Change orders (scope changes / additional billing)
create table if not exists public.change_orders (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders on delete cascade not null,
  description text not null,
  amount decimal(10,2) not null,
  status text default 'pending' check (status in ('pending', 'approved', 'declined', 'paid')),
  stripe_payment_intent_id text,
  created_at timestamptz default now()
);

-- Function to generate order number
create or replace function generate_order_number()
returns trigger as $$
begin
  new.order_number := 'MG-' || to_char(now(), 'YYMM') || '-' ||
    lpad(nextval('order_number_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

-- Trigger for order number
drop trigger if exists set_order_number on public.orders;
create trigger set_order_number
  before insert on public.orders
  for each row execute function generate_order_number();

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at_column();

drop trigger if exists update_orders_updated_at on public.orders;
create trigger update_orders_updated_at
  before update on public.orders
  for each row execute function update_updated_at_column();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.parties enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.revision_requests enable row level security;
alter table public.change_orders enable row level security;
alter table public.clerks enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Orders policies
create policy "Clients can view own orders"
  on public.orders for select
  using (auth.uid() = client_id);

create policy "Clients can insert own orders"
  on public.orders for insert
  with check (auth.uid() = client_id);

create policy "Clerks can view assigned orders"
  on public.orders for select
  using (auth.uid() = clerk_id);

create policy "Clerks can update assigned orders"
  on public.orders for update
  using (auth.uid() = clerk_id);

create policy "Admins can view all orders"
  on public.orders for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Parties policies
create policy "Users can view parties for their orders"
  on public.parties for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = parties.order_id
      and (orders.client_id = auth.uid() or orders.clerk_id = auth.uid())
    )
  );

create policy "Clients can insert parties for own orders"
  on public.parties for insert
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_id and orders.client_id = auth.uid()
    )
  );

-- Documents policies
create policy "Users can view documents for their orders"
  on public.documents for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = documents.order_id
      and (orders.client_id = auth.uid() or orders.clerk_id = auth.uid())
    )
  );

create policy "Users can upload documents"
  on public.documents for insert
  with check (auth.uid() = uploaded_by);

-- Messages policies
create policy "Users can view messages for their orders"
  on public.messages for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = messages.order_id
      and (orders.client_id = auth.uid() or orders.clerk_id = auth.uid())
    )
  );

create policy "Users can send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id);

-- Function to handle new user registration
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, bar_number, states_licensed)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    '',
    '{}'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user registration
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
