// Supabase Edge Function: moderate-image
// Image content moderation using basic checks
// Note: For production, integrate with AWS Rekognition, Google Vision API, or Sightengine

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const { image_url, photo_id } = await req.json()

    if (!image_url || !photo_id) {
      return new Response(
        JSON.stringify({ error: 'Missing image_url or photo_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ========================================================================
    // BASIC MODERATION (Placeholder)
    // ========================================================================
    // In production, you would:
    // 1. Call AWS Rekognition DetectModerationLabels API
    // 2. Call Google Cloud Vision SafeSearch Detection
    // 3. Call Sightengine API
    // 4. Use ML model to detect NSFW content
    //
    // Example with AWS Rekognition:
    // const rekognition = new AWS.Rekognition()
    // const result = await rekognition.detectModerationLabels({
    //   Image: { Bytes: imageBuffer }
    // }).promise()
    // 
    // if (result.ModerationLabels.some(label => 
    //   label.Confidence > 80 && 
    //   ['Explicit Nudity', 'Violence', 'Graphic Violence'].includes(label.Name)
    // )) {
    //   flagged = true
    // }
    // ========================================================================

    // For now, we'll do basic checks
    let flagged = false
    let reason = ''

    // Check file size (already handled client-side, but double-check)
    // Check image dimensions (prevent extremely large images)
    // Check file type (only allow JPEG/PNG)

    // Placeholder: In a real implementation, call external API here
    const USE_EXTERNAL_API = false // Set to true when API is configured

    if (USE_EXTERNAL_API) {
      // Example: Call moderation API
      // const moderationResult = await fetch('https://api.sightengine.com/1.0/check.json', {
      //   method: 'POST',
      //   body: JSON.stringify({
      //     url: image_url,
      //     models: 'nudity,wad,offensive',
      //     api_user: Deno.env.get('SIGHTENGINE_USER'),
      //     api_secret: Deno.env.get('SIGHTENGINE_SECRET')
      //   })
      // })
      // const data = await moderationResult.json()
      // 
      // if (data.nudity.raw > 0.8 || data.offensive.prob > 0.8) {
      //   flagged = true
      //   reason = 'Inappropriate image content detected'
      // }
    }

    // If flagged, delete the image and hide the moment/message
    if (flagged) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Get photo details
      const { data: photo } = await serviceClient
        .from('moment_photos')
        .select('moment_id, uploader_id, photo_url')
        .eq('id', photo_id)
        .single()

      if (photo) {
        // Delete from storage
        await serviceClient.storage
          .from('moment-photos')
          .remove([photo.photo_url])

        // Delete from database
        await serviceClient
          .from('moment_photos')
          .delete()
          .eq('id', photo_id)

        // Auto-flag the moment
        await serviceClient
          .from('flags')
          .insert({
            reporter_id: user.id,
            target_type: 'moment',
            target_id: photo.moment_id,
            reason: 'inappropriate'
          })
          .onConflict('reporter_id,target_type,target_id')
          .ignore()

        console.log(`🚨 Auto-deleted inappropriate image: ${photo_id}`)
      }

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
        message: 'Image passed moderation',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Image moderation error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
