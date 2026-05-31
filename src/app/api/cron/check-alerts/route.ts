import { NextResponse } from 'next/server';
import { createAlertJobRepository } from '@/lib/alerts/factory';
import { getConfiguredBackend } from '@/lib/backend/config';

export async function GET(request: Request) {
  if (getConfiguredBackend() === 'browser') {
    const repository = createAlertJobRepository()
    const result = await repository.runAlertCheck()

    return NextResponse.json(result, { status: 200 })
  }

  // Optional: Verify standard cron secret
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'Setup required', message: 'CRON_SECRET is not configured.' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const repository = createAlertJobRepository()
  const result = await repository.runAlertCheck()

  const status = result.success
    ? 200
    : result.error === 'Unauthorized'
      ? 401
      : result.error === 'Setup required'
          ? 503
          : 500

  return NextResponse.json(result, { status })
}
