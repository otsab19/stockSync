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
          t212_api_secret: string | null
          etoro_api_key: string | null
          etoro_api_secret: string | null
          created_at: string
        }
        Insert: {
          id: string
          t212_api_key?: string | null
          t212_api_secret?: string | null
          etoro_api_key?: string | null
          etoro_api_secret?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          t212_api_key?: string | null
          t212_api_secret?: string | null
          etoro_api_key?: string | null
          etoro_api_secret?: string | null
          created_at?: string
        }
      }
      broker_connections: {
        Row: {
          id: string
          user_id: string
          broker: 't212' | 'etoro'
          source_type: 'manual_csv' | 'broker_api'
          sync_mode: 'manual' | 'scheduled'
          sync_status: 'never_synced' | 'ready' | 'running' | 'succeeded' | 'failed'
          is_enabled: boolean
          last_synced_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          broker: 't212' | 'etoro'
          source_type: 'manual_csv' | 'broker_api'
          sync_mode?: 'manual' | 'scheduled'
          sync_status?: 'never_synced' | 'ready' | 'running' | 'succeeded' | 'failed'
          is_enabled?: boolean
          last_synced_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          broker?: 't212' | 'etoro'
          source_type?: 'manual_csv' | 'broker_api'
          sync_mode?: 'manual' | 'scheduled'
          sync_status?: 'never_synced' | 'ready' | 'running' | 'succeeded' | 'failed'
          is_enabled?: boolean
          last_synced_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sync_runs: {
        Row: {
          id: string
          user_id: string
          connection_id: string | null
          broker: 't212' | 'etoro'
          trigger: 'manual' | 'scheduled'
          source_type: 'manual_csv' | 'broker_api'
          status: 'running' | 'succeeded' | 'failed'
          positions_imported: number
          error_message: string | null
          started_at: string
          finished_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          connection_id?: string | null
          broker: 't212' | 'etoro'
          trigger: 'manual' | 'scheduled'
          source_type: 'manual_csv' | 'broker_api'
          status?: 'running' | 'succeeded' | 'failed'
          positions_imported?: number
          error_message?: string | null
          started_at?: string
          finished_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          connection_id?: string | null
          broker?: 't212' | 'etoro'
          trigger?: 'manual' | 'scheduled'
          source_type?: 'manual_csv' | 'broker_api'
          status?: 'running' | 'succeeded' | 'failed'
          positions_imported?: number
          error_message?: string | null
          started_at?: string
          finished_at?: string | null
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
      llm_analyses: {
        Row: {
          id: string
          user_id: string
          ticker: string
          company_name: string
          broker: string | null
          analysis_date: string
          provider: string
          model: string
          recommendation: string
          confidence: number | null
          horizon: string | null
          thesis: string | null
          risks: string | null
          prompt: string | null
          raw_output: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ticker: string
          company_name?: string
          broker?: string | null
          analysis_date?: string
          provider?: string
          model: string
          recommendation?: string
          confidence?: number | null
          horizon?: string | null
          thesis?: string | null
          risks?: string | null
          prompt?: string | null
          raw_output?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ticker?: string
          company_name?: string
          broker?: string | null
          analysis_date?: string
          provider?: string
          model?: string
          recommendation?: string
          confidence?: number | null
          horizon?: string | null
          thesis?: string | null
          risks?: string | null
          prompt?: string | null
          raw_output?: Json
          created_at?: string
          updated_at?: string
        }
      }
      llm_analysis_targets: {
        Row: {
          id: string
          user_id: string
          ticker: string
          company_name: string
          broker: string
          status: 'pending' | 'running' | 'analyzed' | 'paused'
          priority: number
          notes: string | null
          last_analyzed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ticker: string
          company_name?: string
          broker?: string
          status?: 'pending' | 'running' | 'analyzed' | 'paused'
          priority?: number
          notes?: string | null
          last_analyzed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ticker?: string
          company_name?: string
          broker?: string
          status?: 'pending' | 'running' | 'analyzed' | 'paused'
          priority?: number
          notes?: string | null
          last_analyzed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      order_requests: {
        Row: {
          id: string
          user_id: string
          broker: 't212' | 'etoro'
          instrument_id: string
          ticker: string
          company_name: string
          side: 'buy' | 'sell'
          order_type: 'market' | 'limit' | 'stop' | 'stop_limit'
          input_mode: 'quantity' | 'value'
          quantity: number | null
          value: number | null
          limit_price: number | null
          stop_price: number | null
          stop_loss_price: number | null
          take_profit_price: number | null
          time_validity: 'DAY' | 'GOOD_TILL_CANCEL' | null
          leverage: number
          status: 'draft' | 'pending_confirmation' | 'submitted' | 'accepted' | 'rejected' | 'failed' | 'cancelled'
          idempotency_key: string
          broker_order_id: string | null
          raw_request: Json
          raw_response: Json | null
          error_message: string | null
          created_at: string
          updated_at: string
          submitted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          broker: 't212' | 'etoro'
          instrument_id: string
          ticker: string
          company_name?: string
          side: 'buy' | 'sell'
          order_type: 'market' | 'limit' | 'stop' | 'stop_limit'
          input_mode: 'quantity' | 'value'
          quantity?: number | null
          value?: number | null
          limit_price?: number | null
          stop_price?: number | null
          stop_loss_price?: number | null
          take_profit_price?: number | null
          time_validity?: 'DAY' | 'GOOD_TILL_CANCEL' | null
          leverage?: number
          status?: 'draft' | 'pending_confirmation' | 'submitted' | 'accepted' | 'rejected' | 'failed' | 'cancelled'
          idempotency_key: string
          broker_order_id?: string | null
          raw_request?: Json
          raw_response?: Json | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          submitted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          broker?: 't212' | 'etoro'
          instrument_id?: string
          ticker?: string
          company_name?: string
          side?: 'buy' | 'sell'
          order_type?: 'market' | 'limit' | 'stop' | 'stop_limit'
          input_mode?: 'quantity' | 'value'
          quantity?: number | null
          value?: number | null
          limit_price?: number | null
          stop_price?: number | null
          stop_loss_price?: number | null
          take_profit_price?: number | null
          time_validity?: 'DAY' | 'GOOD_TILL_CANCEL' | null
          leverage?: number
          status?: 'draft' | 'pending_confirmation' | 'submitted' | 'accepted' | 'rejected' | 'failed' | 'cancelled'
          idempotency_key?: string
          broker_order_id?: string | null
          raw_request?: Json
          raw_response?: Json | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          submitted_at?: string | null
        }
      }
    }
  }
}
