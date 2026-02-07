// Supabase Edge Function: moderate-message
// Real-time message moderation with profanity filter

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Comprehensive banned words list (case-insensitive)
const BANNED_WORDS = [
  // Profanity (partial list - expand as needed)
  'fuck', 'shit', 'bitch', 'asshole', 'damn', 'crap', 'bastard',
  // Slurs and hate speech (partial list)
  'nigger', 'faggot', 'retard', 'tranny',
  // Sexual content
  'porn', 'xxx', 'sex', 'nude', 'naked', 'dick', 'cock', 'pussy', 'boobs', 'tits',
  // Drugs
  'cocaine', 'heroin', 'meth', 'weed', 'marijuana', 'drugs',
  // Violence
  'kill', 'murder', 'rape', 'bomb', 'terrorist', 'weapon', 'gun',
  // Scams
  'bitcoin', 'crypto', 'investment', 'money', 'cash', 'paypal', 'venmo',
  // Spam patterns
  'click here', 'free money', 'get rich', 'buy now', 'discount', 'promo',
]

// Suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /\b(http|https|www)\b/i, // URLs
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
  /\$\d+/, // Money amounts
  /\b(telegram|whatsapp|snapchat|instagram|onlyfans)\b/i, // External platforms
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
    const { message_id, content } = await req.json()

    if (!message_id || !content) {
      return new Response(
        JSON.stringify({ error: 'Missing message_id or content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Moderation checks
    let flagged = false
    let reason = ''
    const lowerContent = content.toLowerCase()

    // Check banned words
    for (const word of BANNED_WORDS) {
      if (lowerContent.includes(word)) {
        flagged = true
        reason = `Inappropriate content detected`
        break
      }
    }

    // Check suspicious patterns
    if (!flagged) {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(content)) {
          flagged = true
          reason = 'Suspicious content detected (URLs, phone numbers, or external platforms)'
          break
        }
      }
    }

    // If flagged, delete the message and auto-flag
    if (flagged) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Delete the message
      const { error: deleteError } = await serviceClient
        .from('moment_messages')
        .delete()
        .eq('id', message_id)

      if (deleteError) {
        console.error('Failed to delete message:', deleteError)
      } else {
        console.log(`🚨 Auto-deleted message ${message_id}: ${reason}`)
      }

      // Auto-flag the message
      await serviceClient
        .from('flags')
        .insert({
          reporter_id: user.id,
          target_type: 'message',
          target_id: message_id,
          reason: 'inappropriate'
        })
        .onConflict('reporter_id,target_type,target_id')
        .ignore()

      return new Response(
        JSON.stringify({
          flagged: true,
          reason,
          action: 'deleted',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Passed moderation
    return new Response(
      JSON.stringify({
        flagged: false,
        message: 'Message passed moderation',
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
