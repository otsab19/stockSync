import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import webpush from 'web-push';

// Configure Web Push with VAPID keys (Mocked keys for boilerplate)
try {
  webpush.setVapidDetails(
    'mailto:your-email@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BMk_c9OOh5T-1755N9-gCqR1q2gZ99d_X13a_9L-f2F1G8E0_4rP3o3A0K2z_V5Y-wT4C3z-h8rY_v7d-oA4D0U', // Dummy key to pass build
    process.env.VAPID_PRIVATE_KEY || 'dummy_private_key_that_is_long_enough_for_build'
  );
} catch (e) {
  console.warn('Web push VAPID keys not configured properly for build.');
}

export async function GET(request: Request) {
  // Optional: Verify standard cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    // 1. Fetch all portfolio snapshots
    const { data: snapshots, error: snapshotError } = await supabase
      .from('portfolio_snapshots')
      .select('*');

    if (snapshotError) throw snapshotError;

    // 2. Loop through users/snapshots (Simplified for boilerplate)
    for (const snapshot of (snapshots as any[]) || []) {
      // In a real scenario, you'd fetch the live price here.
      // We are mocking a live price fetch:
      const live_pl = snapshot.current_pl_gbp + (Math.random() * 60 - 30); // Random flux

      const difference = Math.abs(live_pl - snapshot.last_alerted_pl);

      // Check if the P/L difference is >= £25
      if (difference >= 25) {
        // Fetch push subscriptions for this user
        const { data: subscriptions } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', snapshot.user_id);

        if (subscriptions) {
          const payload = JSON.stringify({
            title: 'Stock Alert',
            body: `${snapshot.ticker} P/L shifted by £${difference.toFixed(2)}!`,
          });

          for (const sub of (subscriptions as any[]) || []) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                  },
                },
                payload
              );
            } catch (pushError) {
              console.error('Push notification failed:', pushError);
            }
          }
        }

        // Update the snapshot with the newly alerted P/L
        await (supabase
          .from('portfolio_snapshots')
          .update({ last_alerted_pl: live_pl, updated_at: new Date().toISOString() } as never) as any)
          .eq('id', snapshot.id);
      }
    }

    return NextResponse.json({ success: true, message: 'Checked alerts successfully.' });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
