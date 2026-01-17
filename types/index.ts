export type UserRole = 'client' | 'clerk' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  bar_number: string;
  states_licensed: string[];
  firm_name: string | null;
  firm_address: string | null;
  firm_phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Clerk {
  id: string;
  availability_status: 'available' | 'busy' | 'unavailable';
  current_workload: number;
  max_workload: number;
}

export interface Order {
  id: string;
  order_number: string;
  client_id: string;
  clerk_id: string | null;
  motion_type: string;
  motion_tier: number;
  base_price: number;
  turnaround: 'standard' | 'rush_72' | 'rush_48';
  rush_surcharge: number;
  total_price: number;
  filing_deadline: string;
  expected_delivery: string;
  jurisdiction: string;
  court_division: string | null;
  case_number: string;
  case_caption: string;
  statement_of_facts: string;
  procedural_history: string;
  instructions: string;
  related_entities: string | null;
  status: OrderStatus;
  stripe_payment_intent_id: string | null;
  stripe_payment_status: string | null;
  conflict_flagged: boolean;
  conflict_cleared: boolean;
  conflict_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'submitted'
  | 'under_review'
  | 'assigned'
  | 'in_progress'
  | 'draft_delivered'
  | 'revision_requested'
  | 'revision_delivered'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface Party {
  id: string;
  order_id: string;
  party_name: string;
  party_name_normalized: string;
  party_role: string;
  created_at: string;
}

export interface Document {
  id: string;
  order_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  document_type: string;
  uploaded_by: string;
  is_deliverable: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  order_id: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
}

export interface RevisionRequest {
  id: string;
  order_id: string;
  instructions: string;
  document_url: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
}

export interface ChangeOrder {
  id: string;
  order_id: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'declined' | 'paid';
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface OrderWithRelations extends Order {
  client?: Profile;
  clerk?: Clerk & { profile?: Profile };
  parties?: Party[];
  documents?: Document[];
  messages?: Message[];
  revision_requests?: RevisionRequest[];
}

// Re-export automation types
export * from './automation';
