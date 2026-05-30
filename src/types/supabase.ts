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
