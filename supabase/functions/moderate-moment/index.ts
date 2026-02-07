// Supabase Edge Function: moderate-moment
// Optional: Auto-moderate moment titles on creation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configurable banned keywords (case-insensitive)
const BANNED_KEYWORDS = [
  'drug',
  'weapon',
  'illegal',
  'scam',
  // Add more as needed
]

// Suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /\b(free\s+money|get\s+rich|click\s+here)\b/i,
  /\b(buy|sell|discount|promo)\b/i, // Commercial spam
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { moment_id, title } = await req.json()

    if (!moment_id || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing moment_id or title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Moderation checks
    let flagged = false
    let reason = ''

    // Check banned keywords
    const lowerTitle = title.toLowerCase()
    for (const keyword of BANNED_KEYWORDS) {
      if (lowerTitle.includes(keyword)) {
        flagged = true
        reason = `Banned keyword detected: ${keyword}`
        break
      }
    }

    // Check suspicious patterns
    if (!flagged) {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(title)) {
          flagged = true
          reason = 'Suspicious pattern detected'
          break
        }
      }
    }

    // If flagged, hide the moment
    if (flagged) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { error: updateError } = await serviceClient
        .from('moments')
        .update({ status: 'hidden' })
        .eq('id', moment_id)

      if (updateError) {
        console.error('Failed to hide moment:', updateError)
      } else {
        console.log(`🚨 Auto-hidden moment ${moment_id}: ${reason}`)
      }

      return new Response(
        JSON.stringify({
          flagged: true,
          reason,
          action: 'hidden',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Passed moderation
    return new Response(
      JSON.stringify({
        flagged: false,
        message: 'Moment passed moderation',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Moderation error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

