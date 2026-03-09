export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      access_passes: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_tx: {
        Row: {
          created_at: string | null
          delta: number
          idempotency_key: string
          kind: string
          ref: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delta?: number
          idempotency_key: string
          kind: string
          ref?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delta?: number
          idempotency_key?: string
          kind?: string
          ref?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      credits_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          completed_at: string | null
          completed_nodes: number
          created_at: string
          current_stage: string
          eta_seconds: number | null
          id: string
          progress_percent: number
          session_id: string
          status: string
          story_id: string
          total_nodes: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_nodes?: number
          created_at?: string
          current_stage?: string
          eta_seconds?: number | null
          id?: string
          progress_percent?: number
          session_id: string
          status?: string
          story_id: string
          total_nodes?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_nodes?: number
          created_at?: string
          current_stage?: string
          eta_seconds?: number | null
          id?: string
          progress_percent?: number
          session_id?: string
          status?: string
          story_id?: string
          total_nodes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      image_style_profiles: {
        Row: {
          cfg: number
          genres: string[]
          height: number
          id: string
          key: string
          model_id: string
          negative_prompt: string
          prompt_prefix: string
          steps: number
          upscale: boolean
          width: number
        }
        Insert: {
          cfg?: number
          genres?: string[]
          height?: number
          id?: string
          key: string
          model_id: string
          negative_prompt?: string
          prompt_prefix?: string
          steps?: number
          upscale?: boolean
          width?: number
        }
        Update: {
          cfg?: number
          genres?: string[]
          height?: number
          id?: string
          key?: string
          model_id?: string
          negative_prompt?: string
          prompt_prefix?: string
          steps?: number
          upscale?: boolean
          width?: number
        }
        Relationships: []
      }
      library_items: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_items_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string | null
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adult_verified: boolean
          created_at: string
          credits: number
          display_name: string | null
          gender: string | null
          id: string
          plan: Database["public"]["Enums"]["app_plan"]
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adult_verified?: boolean
          created_at?: string
          credits?: number
          display_name?: string | null
          gender?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["app_plan"]
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adult_verified?: boolean
          created_at?: string
          credits?: number
          display_name?: string | null
          gender?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["app_plan"]
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      public_games: {
        Row: {
          creator_id: string
          like_count: number | null
          play_count: number | null
          published_at: string | null
          story_id: string
        }
        Insert: {
          creator_id: string
          like_count?: number | null
          play_count?: number | null
          published_at?: string | null
          story_id: string
        }
        Update: {
          creator_id?: string
          like_count?: number | null
          play_count?: number | null
          published_at?: string | null
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_games_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: true
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      public_novels: {
        Row: {
          cover_url: string | null
          creator_id: string
          id: string
          like_count: number | null
          published_at: string | null
          session_id: string
          story_id: string
          synopsis: string | null
          title: string
          view_count: number | null
        }
        Insert: {
          cover_url?: string | null
          creator_id: string
          id?: string
          like_count?: number | null
          published_at?: string | null
          session_id: string
          story_id: string
          synopsis?: string | null
          title: string
          view_count?: number | null
        }
        Update: {
          cover_url?: string | null
          creator_id?: string
          id?: string
          like_count?: number | null
          published_at?: string | null
          session_id?: string
          story_id?: string
          synopsis?: string | null
          title?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_novels_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_novels_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          created_at: string
          id: string
          payment_ref: string
          reason: string | null
          status: Database["public"]["Enums"]["refund_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_ref: string
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_ref?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          user_id?: string
        }
        Relationships: []
      }
      replay_daily_limits: {
        Row: {
          count: number | null
          day: string
          user_id: string
        }
        Insert: {
          count?: number | null
          day: string
          user_id: string
        }
        Update: {
          count?: number | null
          day?: string
          user_id?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          config: Json | null
          cover_url: string | null
          created_at: string
          deleted_at: string | null
          genre: string
          id: string
          is_public: boolean | null
          protagonist_name: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          synopsis: string | null
          title: string
          user_id: string
        }
        Insert: {
          config?: Json | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          genre: string
          id?: string
          is_public?: boolean | null
          protagonist_name?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          synopsis?: string | null
          title: string
          user_id: string
        }
        Update: {
          config?: Json | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          genre?: string
          id?: string
          is_public?: boolean | null
          protagonist_name?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          synopsis?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      story_nodes: {
        Row: {
          choices: Json | null
          created_at: string
          id: string
          image_prompt: string | null
          image_url: string | null
          node_id: string | null
          scene_text: string
          session_id: string | null
          step: number
          story_id: string | null
          variant: string
        }
        Insert: {
          choices?: Json | null
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          node_id?: string | null
          scene_text: string
          session_id?: string | null
          step: number
          story_id?: string | null
          variant?: string
        }
        Update: {
          choices?: Json | null
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          node_id?: string | null
          scene_text?: string
          session_id?: string | null
          step?: number
          story_id?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_nodes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_nodes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sessions: {
        Row: {
          ad_required: boolean
          ad_shown: boolean
          choices_count: number
          created_at: string
          current_node_id: string | null
          duration_min: number
          endings_count: number
          finished: boolean
          id: string
          state: Json
          step: number
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_required?: boolean
          ad_shown?: boolean
          choices_count?: number
          created_at?: string
          current_node_id?: string | null
          duration_min?: number
          endings_count?: number
          finished?: boolean
          id?: string
          state?: Json
          step?: number
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_required?: boolean
          ad_shown?: boolean
          choices_count?: number
          created_at?: string
          current_node_id?: string | null
          duration_min?: number
          endings_count?: number
          finished?: boolean
          id?: string
          state?: Json
          step?: number
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sessions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: Database["public"]["Enums"]["app_plan"]
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["app_plan"]
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["app_plan"]
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_plan: "free" | "basic" | "pro"
      app_role_v2: "user" | "subadmin" | "admin"
      refund_status: "pending" | "approved" | "rejected"
      source_type: "simple" | "custom" | "external"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_plan: ["free", "basic", "pro"],
      app_role_v2: ["user", "subadmin", "admin"],
      refund_status: ["pending", "approved", "rejected"],
      source_type: ["simple", "custom", "external"],
    },
  },
} as const
