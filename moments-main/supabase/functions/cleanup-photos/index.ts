// ============================================================================
// Cleanup Photos - Edge Function
// ============================================================================
// Runs daily to delete:
// 1. Moment photos from moments that ended >2 days ago
// 2. Profile photos from users inactive for >60 days

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async () => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let momentPhotosDeleted = 0;
    let profilePhotosDeleted = 0;
    let errors = 0;

    // ========================================================================
    // 1. Delete moment photos from moments ended >2 days ago
    // ========================================================================
    
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // Get moments that ended >2 days ago
    const { data: oldMoments, error: momentsError } = await supabase
      .from('moments')
      .select('id')
      .lt('ends_at', twoDaysAgo);

    if (momentsError) {
      console.error('Error fetching old moments:', momentsError);
      errors++;
    } else if (oldMoments && oldMoments.length > 0) {
      const momentIds = oldMoments.map(m => m.id);

      // Get photos from these moments
      const { data: photosToDelete, error: photosError } = await supabase
        .from('moment_photos')
        .select('id, photo_url')
        .in('moment_id', momentIds);

      if (photosError) {
        console.error('Error fetching moment photos:', photosError);
        errors++;
      } else if (photosToDelete && photosToDelete.length > 0) {
        // Delete from storage
        const filePaths = photosToDelete.map(p => p.photo_url);
        const { error: storageError } = await supabase.storage
          .from('moment-photos')
          .remove(filePaths);

        if (storageError && !storageError.message.includes('not found')) {
          console.error('Storage deletion error:', storageError);
          errors++;
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('moment_photos')
          .delete()
          .in('moment_id', momentIds);

        if (dbError) {
          console.error('DB deletion error:', dbError);
          errors++;
        } else {
          momentPhotosDeleted = photosToDelete.length;
        }
      }
    }

    // ========================================================================
    // 2. Delete profile photos from inactive users (>60 days)
    // ========================================================================
    
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // Find users with profile photos who haven't created moments in 60 days
    const { data: inactiveUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id, profile_photo_url')
      .not('profile_photo_url', 'is', null)
      .lt('profile_photo_uploaded_at', sixtyDaysAgo);

    if (usersError) {
      console.error('Error fetching inactive users:', usersError);
      errors++;
    } else if (inactiveUsers && inactiveUsers.length > 0) {
      for (const user of inactiveUsers) {
        // Check if user has created any moments in last 60 days
        const { data: recentMoments } = await supabase
          .from('moments')
          .select('id')
          .eq('creator_id', user.id)
          .gte('created_at', sixtyDaysAgo)
          .limit(1);

        // If no recent moments, delete profile photo
        if (!recentMoments || recentMoments.length === 0) {
          try {
            // Extract filename from URL
            const filename = user.profile_photo_url.split('/').pop();
            if (filename) {
              // Delete from storage
              const { error: storageError } = await supabase.storage
                .from('avatars')
                .remove([`${user.id}/profile.jpg`]);

              if (storageError && !storageError.message.includes('not found')) {
                console.error(`Storage deletion error for user ${user.id}:`, storageError);
                errors++;
                continue;
              }
            }

            // Clear URL from database
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ 
                profile_photo_url: null,
                profile_photo_uploaded_at: null
              })
              .eq('id', user.id);

            if (updateError) {
              console.error(`Profile update error for user ${user.id}:`, updateError);
              errors++;
            } else {
              profilePhotosDeleted++;
            }
          } catch (err) {
            console.error(`Error processing user ${user.id}:`, err);
            errors++;
          }
        }
      }
    }

    // ========================================================================
    // 3. Return results
    // ========================================================================

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Photo cleanup completed',
        momentPhotosDeleted,
        profilePhotosDeleted,
        errors,
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

