// ============================================================================
// Cleanup Ephemeral Images - Edge Function
// ============================================================================
// Runs every 5 minutes to delete:
// 1. Chat images older than 5 minutes
// 2. All images from expired moments

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let deletedCount = 0;
    let errorCount = 0;

    // ========================================================================
    // 1. Find ephemeral images to delete
    // ========================================================================
    
    const { data: expiredPhotos, error: fetchError } = await supabase
      .from('moment_photos')
      .select('id, photo_url, moment_id')
      .eq('is_preview', false)
      .or(`uploaded_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()},moment_id.in.(${
        (await supabase
          .from('moments')
          .select('id')
          .lt('ends_at', new Date().toISOString())
        ).data?.map(m => m.id).join(',') || 'null'
      })`);

    if (fetchError) {
      console.error('Error fetching expired photos:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch photos', details: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!expiredPhotos || expiredPhotos.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No ephemeral images to delete',
          deleted: 0 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 2. Delete from storage and database
    // ========================================================================

    for (const photo of expiredPhotos) {
      try {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('moment-photos')
          .remove([photo.photo_url]);

        if (storageError && !storageError.message.includes('not found')) {
          console.error(`Storage deletion error for ${photo.photo_url}:`, storageError);
          errorCount++;
          continue;
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('moment_photos')
          .delete()
          .eq('id', photo.id);

        if (dbError) {
          console.error(`DB deletion error for ${photo.id}:`, dbError);
          errorCount++;
          continue;
        }

        deletedCount++;
      } catch (err) {
        console.error(`Unexpected error deleting photo ${photo.id}:`, err);
        errorCount++;
      }
    }

    // ========================================================================
    // 3. Return results
    // ========================================================================

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Ephemeral image cleanup completed',
        deleted: deletedCount,
        errors: errorCount,
        processed: expiredPhotos.length,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error in cleanup function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

