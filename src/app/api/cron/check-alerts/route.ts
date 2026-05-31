import { NextResponse } from 'next/server';
import { createAlertJobRepository } from '@/lib/alerts/factory';
import { getConfiguredBackend } from '@/lib/backend/config';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  if (getConfiguredBackend() === 'browser') {
    const repository = createAlertJobRepository()
    const result = await repository.runAlertCheck()
    return NextResponse.json(result, { status: 200 })
  }

  // Allow access if: valid cron secret OR authenticated user (client polling)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCronAuth) {
    // Check if it's an authenticated user polling from the UI
    const supabase = await createClient()
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const repository = createAlertJobRepository()
  const result = await repository.runAlertCheck()

  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
