# StockSync PWA - Core Outputs

## 1. Ideal Directory Structure

```text
/
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/
│   │   │   │   └── check-alerts/
│   │   │   │       └── route.ts
│   │   │   └── portfolio/
│   │   │       └── route.ts
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   └── ui/ (Shadcn components: card, table, badge, form, dialog)
│   ├── types/
│   │   └── supabase.ts
│   └── utils/
│       └── supabase/
│           ├── client.ts
│           └── server.ts
├── next.config.js
├── package.json
└── tailwind.config.ts
```

## 2. Supabase Database Types (`src/types/supabase.ts`)

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          t212_api_key: string | null
          etoro_api_key: string | null
          created_at: string
        }
        Insert: {
          id: string
          t212_api_key?: string | null
          etoro_api_key?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          t212_api_key?: string | null
          etoro_api_key?: string | null
          created_at?: string
        }
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
      }
      portfolio_snapshots: {
        Row: {
          id: string
          user_id: string
          ticker: string
          broker: 't212' | 'etoro'
          current_pl_gbp: number
          last_alerted_pl: number
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ticker: string
          broker: 't212' | 'etoro'
          current_pl_gbp: number
          last_alerted_pl: number
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ticker?: string
          broker?: 't212' | 'etoro'
          current_pl_gbp?: number
          last_alerted_pl?: number
          updated_at?: string
        }
      }
    }
  }
}
```

## 3. Primary Dashboard Page (`src/app/dashboard/page.tsx`)

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, DollarSign, AlertCircle } from "lucide-react";

// Mock data for the chart
const chartData = [
  { name: "Jan", value: 4000 },
  { name: "Feb", value: 3000 },
  { name: "Mar", value: 5000 },
  { name: "Apr", value: 4500 },
  { name: "May", value: 6000 },
  { name: "Jun", value: 5500 },
];

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPortfolio() {
      try {
        const res = await fetch("/api/portfolio");
        const data = await res.json();
        setPortfolio(data);
      } catch (error) {
        console.error("Failed to fetch portfolio:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchPortfolio();
  }, []);

  const totalValue = portfolio.reduce((acc, item) => acc + (item.shares * item.livePrice), 0);
  const totalPL = portfolio.reduce((acc, item) => acc + item.totalPL, 0);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">£{totalValue.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total P/L</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalPL >= 0 ? '+' : ''}£{totalPL.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Value Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Portfolio Table */}
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Broker</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Avg Price</TableHead>
                <TableHead className="text-right">Live Price</TableHead>
                <TableHead className="text-right">Total P/L</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : (
                portfolio.map((position, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{position.ticker}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{position.broker.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{position.shares}</TableCell>
                    <TableCell className="text-right">£{position.avgPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{position.livePrice.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${position.totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {position.totalPL >= 0 ? '+' : ''}£{position.totalPL.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={position.totalPL >= 0 ? "default" : "destructive"}>
                        {position.totalPL >= 0 ? "Profit" : "Loss"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

## 4. Unified Portfolio Fetcher API Route (`src/app/api/portfolio/route.ts`)

```typescript
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
```