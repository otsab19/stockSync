import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();

  // 1. Authenticate user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Fetch API keys from profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('t212_api_key, etoro_api_key')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }

  const { t212_api_key, etoro_api_key } = profile;

  try {
    const portfolio = [];

    // 3. Mock fetch to Trading 212
    if (t212_api_key) {
      // Mocked response from https://live.trading212.com/api/v0/equity/portfolio
      portfolio.push(
        { ticker: 'AAPL', broker: 't212', shares: 10, avgPrice: 150, livePrice: 175, totalPL: 250 },
        { ticker: 'TSLA', broker: 't212', shares: 5, avgPrice: 200, livePrice: 180, totalPL: -100 }
      );
    }

    // 4. Mock fetch to eToro
    if (etoro_api_key) {
      // Mocked response from eToro API
      portfolio.push(
        { ticker: 'MSFT', broker: 'etoro', shares: 15, avgPrice: 300, livePrice: 320, totalPL: 300 },
        { ticker: 'GOOGL', broker: 'etoro', shares: 20, avgPrice: 120, livePrice: 140, totalPL: 400 }
      );
    }

    // 5. Standardize and return the unified JSON array
    return NextResponse.json(portfolio);

  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
