# Motion Granted

**AI-Powered Legal Motion Drafting Service for Solo Practitioners & Small Law Firms**

Motion Granted is a professional legal motion drafting platform that leverages Claude AI to automate motion document generation while maintaining human oversight and revision capabilities.

**Website:** motiongranted.com
**Support:** support@motiongranted.com | (225) 555-0100

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Key Workflows](#key-workflows)
- [Deployment](#deployment)

---

## Overview

Motion Granted provides a complete workflow management system for handling legal briefs, motions, and court filings. The platform includes:

- **8-Step Order Intake Wizard** - Guided motion request submission
- **AI-Powered Motion Generation** - Claude Sonnet 4 generates drafts from case facts
- **Admin Dashboard** - Order queue, client management, and automation controls
- **Revision Workflow** - Built-in revision request and approval system
- **Real-time Status Tracking** - Live order updates via Supabase Realtime

### Pricing Tiers

| Tier | Type | Price Range | Turnaround |
|------|------|-------------|------------|
| Tier 1 | Procedural Motions | $350-$650 | 3-5 days |
| Tier 2 | Exceptions & Substantive | $750-$1,400 | 5-7 days |
| Tier 3 | Heavy Lift (Complex) | $1,700-$3,200+ | 7-14 days |

**Rush Options:** +25% (72hr) | +50% (48hr)

---

## Tech Stack

### Frontend
- **Next.js 16** (React 19, TypeScript 5.9)
- **Radix UI** - Accessible component library
- **Tailwind CSS v4** - Styling
- **React Hook Form + Zod** - Form handling & validation
- **Zustand** - State management
- **TanStack React Query** - Data fetching

### Backend
- **Next.js API Routes** - Server-side logic
- **Supabase** - PostgreSQL database & authentication
- **Inngest** - Background job queue with checkpointing
- **Anthropic Claude** - AI motion generation

### External Services
- **Stripe** - Payment processing
- **Resend** - Transactional emails
- **pdf-lib / mammoth** - Document processing (PDF & DOCX)

### Deployment
- **Vercel** - Hosting platform
- **Supabase** - Database & storage hosting

---

## Features

### Client/Lawyer Portal

1. **Order Creation Wizard**
   - Motion type selection (categorized by complexity)
   - Turnaround time selection
   - Case information entry (jurisdiction, court, case number)
   - Party management with automatic conflict checking
   - Case summary (facts, procedural history)
   - Special drafting instructions
   - Document upload (PDF, DOCX, images - up to 50MB)
   - Order review & secure payment

2. **Dashboard**
   - View all submitted orders with status tracking
   - Real-time deadline warnings
   - Financial overview (total spent, pending orders)
   - PDF download for completed motions
   - Revision request capability

3. **AI Chat**
   - Interactive refinement with Claude AI
   - Document analysis and suggestions

### Admin Portal

1. **Order Management**
   - Priority queue (deadline-ordered)
   - Status updates and assignment
   - Document review and approval

2. **Automation Controls**
   - Superprompt template configuration
   - Clerk auto-assignment settings
   - Quality assurance automation
   - Conflict checking automation

3. **Analytics**
   - Revenue reporting
   - Order volume tracking
   - Clerk performance metrics

---

## Project Structure

```
/app                          # Next.js App Router
├── (auth)/                    # Login, register, password reset
├── (marketing)/               # Public pages (home, FAQs, pricing)
├── (dashboard)/               # Client dashboard
│   ├── dashboard/             # Dashboard home
│   ├── orders/                # Order management
│   │   ├── new/               # 8-step order wizard
│   │   └── [id]/              # Order details
│   └── settings/              # Account settings
├── (admin)/                   # Admin portal (role-gated)
│   ├── admin/                 # Admin dashboard
│   ├── clients/               # Client management
│   ├── orders/                # Admin order view
│   ├── queue/                 # Job queue status
│   ├── automation/            # Automation config
│   └── superprompt/           # Template management
└── api/                       # API routes
    ├── chat/                  # Claude AI endpoints
    ├── orders/                # Order CRUD
    ├── documents/             # File upload/processing
    ├── workflow/              # Motion generation engine
    ├── webhooks/              # Stripe webhooks
    └── health/                # Health checks

/components                    # React components
├── ui/                        # Radix UI wrappers
├── orders/                    # Order components
│   └── intake-form/           # Wizard step components
├── admin/                     # Admin components
└── shared/                    # Shared UI components

/lib                          # Core business logic
├── workflow/                  # Motion generation engine
│   ├── workflow-engine.ts     # Main orchestrator
│   ├── superprompt.ts         # AI generation
│   ├── citation-verifier.ts   # Legal citation validation
│   ├── pdf-generator.ts       # PDF output
│   └── quality-validator.ts   # QA checks
├── automation/                # AI automation
│   ├── claude.ts              # Claude API wrapper
│   ├── conflict-checker.ts    # Conflict detection
│   └── clerk-assigner.ts      # Auto-assignment
├── inngest/                   # Job queue
├── supabase/                  # Database utilities
└── constants.ts               # App constants

/config                        # Configuration
├── site.ts                    # Site metadata
├── motion-types.ts            # Motion definitions & pricing
└── intake-form.ts             # Form validation schemas

/supabase                      # Database setup
├── schema.sql                 # Base schema
└── migrations/                # Schema migrations (001-012)

/docs                          # Documentation
└── ORDER_FLOW_DIAGRAM.md      # Architecture diagrams
```

---

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- Supabase account (free tier works)
- Stripe account (test mode for development)
- Resend account
- Anthropic API key (for AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Motion-Granted-Production
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your credentials (see [Environment Variables](#environment-variables))

4. **Set up the database**
   - Create a new Supabase project
   - Run the SQL files in order:
     1. `supabase/schema.sql`
     2. `supabase/migrations/001_automation_tables.sql` through `012_add_queue_columns.sql`
     3. `supabase/setup-storage.sql`

5. **Start the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

### Development Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

---

## Environment Variables

Create a `.env.local` file with these variables:

### Required

```bash
# Supabase (Database & Auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe (Payments)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Resend (Email)
RESEND_API_KEY=re_xxxxx
```

### Recommended

```bash
# Claude AI (Motion Generation)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### Optional

```bash
# App Configuration
NEXT_PUBLIC_APP_URL=https://motiongranted.com
CRON_SECRET=your-random-secret-string
```

---

## Database Schema

### Main Tables

| Table | Description |
|-------|-------------|
| `profiles` | User accounts (clients, clerks, admins) |
| `clerks` | Clerk availability & workload tracking |
| `orders` | Motion orders with pricing, status, deadlines |
| `parties` | Parties involved in cases (for conflict checking) |
| `documents` | Uploaded file metadata & storage paths |
| `workflows` | Motion generation phase tracking |
| `superprompt_templates` | Lawyer-specific AI templates |
| `automation_logs` | Audit trail for automation actions |
| `conversations` | AI chat history |

### Order Status Flow

```
pending_payment → paid → in_review → assigned →
in_progress → ready_for_review → completed
                    ↓
              revision_requested → in_progress
```

### Security

- Row-Level Security (RLS) policies enforce access control
- Users can only see their own orders
- Admins have elevated permissions via role checks

---

## Key Workflows

### Order Processing Pipeline

1. **Order Submitted** - Client completes 8-step wizard
2. **Payment Processed** - Stripe webhook confirms payment
3. **Conflict Check** - AI analyzes parties for conflicts
4. **Clerk Assignment** - Auto-assigned based on workload
5. **Motion Generation** - Claude AI drafts the motion
6. **Citation Verification** - Legal citations validated
7. **Quality Assurance** - Automated checks against templates
8. **Review & Delivery** - Admin review, then client delivery

### Background Jobs (Inngest)

- **Order Processing** - End-to-end automation with checkpoints
- **Email Notifications** - Queued email delivery
- **Report Generation** - Daily/weekly analytics
- **Cleanup Tasks** - Expired data removal

### AI Integration

- **Claude Sonnet 4** powers all AI features
- **Rate Limited** - Max 5 concurrent API calls
- **Checkpointed** - Jobs resume after failures
- **Quality Validated** - Output checked against templates

---

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Configuration Notes

- **Max Duration:** API routes support up to 5-minute execution
- **Body Size:** 100MB limit for document uploads
- **Serverless:** Optimized for Vercel serverless functions

### Stripe Webhooks

Configure webhook endpoint in Stripe dashboard:
```
https://yourdomain.com/api/webhooks/stripe
```

For local development, use Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Support

- **Email:** support@motiongranted.com
- **Phone:** (225) 555-0100
- **Documentation:** See `/docs` folder for additional diagrams

---

## License

Proprietary - All rights reserved.
