import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/conflict-check
 *
 * Intake Step 1 conflict check using pg_trgm similarity.
 * Body: { clientName, opposingParty, opposingCounsel }
 * Threshold: 0.6 similarity.
 * Logs all checks to conflict_check_log.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { clientName?: string; opposingParty?: string; opposingCounsel?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { clientName, opposingParty, opposingCounsel } = body

  if (!clientName && !opposingParty) {
    return NextResponse.json({ error: 'At least clientName or opposingParty required' }, { status: 400 })
  }

  const matches: Array<{ party_name: string; party_role: string; order_id: string; similarity: number }> = []

  // Search parties table using trgm similarity
  const searchNames = [clientName, opposingParty, opposingCounsel].filter(Boolean) as string[]

  for (const name of searchNames) {
    const normalizedName = name.toLowerCase().trim()

    // Use Supabase RPC or textSearch - fallback to ilike for compatibility
    const { data: partyMatches } = await supabase
      .from('parties')
      .select('party_name, party_role, order_id')
      .or(`party_name.ilike.%${normalizedName}%,party_name_normalized.ilike.%${normalizedName}%`)
      .limit(10)

    if (partyMatches) {
      for (const match of partyMatches) {
        // Simple Levenshtein-like similarity check
        const similarity = calculateSimilarity(normalizedName, match.party_name.toLowerCase())
        if (similarity >= 0.6) {
          matches.push({
            party_name: match.party_name,
            party_role: match.party_role,
            order_id: match.order_id,
            similarity,
          })
        }
      }
    }
  }

  const matchFound = matches.length > 0

  // Log the check
  await supabase.from('conflict_check_log').insert({
    user_id: user.id,
    client_name: clientName || null,
    opposing_party: opposingParty || null,
    opposing_counsel: opposingCounsel || null,
    match_found: matchFound,
    match_details: matchFound ? matches : null,
  })

  return NextResponse.json({
    matchFound,
    matches: matchFound ? matches.map(m => ({
      partyName: m.party_name,
      partyRole: m.party_role,
      similarity: Math.round(m.similarity * 100),
    })) : [],
  })
}

/**
 * Simple trigram-based similarity calculation.
 * Returns a value between 0 and 1.
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const trigramsA = new Set<string>()
  const trigramsB = new Set<string>()

  for (let i = 0; i <= a.length - 3; i++) {
    trigramsA.add(a.substring(i, i + 3))
  }
  for (let i = 0; i <= b.length - 3; i++) {
    trigramsB.add(b.substring(i, i + 3))
  }

  let intersection = 0
  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) intersection++
  }

  const union = trigramsA.size + trigramsB.size - intersection
  return union === 0 ? 0 : intersection / union
}
