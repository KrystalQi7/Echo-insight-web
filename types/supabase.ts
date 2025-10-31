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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      card_draws: {
        Row: {
          card_id: number
          drawn_at: string | null
          edit_count: number | null
          id: number
          is_edited: number | null
          last_edited_at: string | null
          response_length: number | null
          user_id: string
          user_response: string | null
        }
        Insert: {
          card_id: number
          drawn_at?: string | null
          edit_count?: number | null
          id?: number
          is_edited?: number | null
          last_edited_at?: string | null
          response_length?: number | null
          user_id: string
          user_response?: string | null
        }
        Update: {
          card_id?: number
          drawn_at?: string | null
          edit_count?: number | null
          id?: number
          is_edited?: number | null
          last_edited_at?: string | null
          response_length?: number | null
          user_id?: string
          user_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_draws_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_draws_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          card_type: string | null
          category: string
          content: string
          created_at: string | null
          id: number
          is_starter: number | null
          mbti_type: string | null
          mood_tags: string | null
          title: string
        }
        Insert: {
          card_type?: string | null
          category: string
          content: string
          created_at?: string | null
          id?: number
          is_starter?: number | null
          mbti_type?: string | null
          mood_tags?: string | null
          title: string
        }
        Update: {
          card_type?: string | null
          category?: string
          content?: string
          created_at?: string | null
          id?: number
          is_starter?: number | null
          mbti_type?: string | null
          mood_tags?: string | null
          title?: string
        }
        Relationships: []
      }
      daily_draws: {
        Row: {
          created_at: string | null
          draw_count: number | null
          draw_date: string
          id: number
          max_draws: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          draw_count?: number | null
          draw_date: string
          id?: number
          max_draws?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          draw_count?: number | null
          draw_date?: string
          id?: number
          max_draws?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_draws_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          id: number
          payload: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          payload?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          payload?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mbti_types: {
        Row: {
          created_at: string | null
          description: string
          id: number
          traits: string
          type_code: string
          type_name: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: number
          traits: string
          type_code: string
          type_name: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: number
          traits?: string
          type_code?: string
          type_name?: string
        }
        Relationships: []
      }
      mood_records: {
        Row: {
          concerns: string | null
          energy_level: string
          id: number
          overall_mood: string
          recorded_at: string | null
          user_id: string
        }
        Insert: {
          concerns?: string | null
          energy_level: string
          id?: number
          overall_mood: string
          recorded_at?: string | null
          user_id: string
        }
        Update: {
          concerns?: string | null
          energy_level?: string
          id?: number
          overall_mood?: string
          recorded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          consecutive_days: number | null
          experience_points: number | null
          id: number
          last_activity_date: string | null
          level: number | null
          starter_actions_done: number | null
          starter_days: number | null
          starter_passed: number | null
          starter_score: number | null
          unlocked_categories: string | null
          user_id: string
        }
        Insert: {
          consecutive_days?: number | null
          experience_points?: number | null
          id?: number
          last_activity_date?: string | null
          level?: number | null
          starter_actions_done?: number | null
          starter_days?: number | null
          starter_passed?: number | null
          starter_score?: number | null
          unlocked_categories?: string | null
          user_id: string
        }
        Update: {
          consecutive_days?: number | null
          experience_points?: number | null
          id?: number
          last_activity_date?: string | null
          level?: number | null
          starter_actions_done?: number | null
          starter_days?: number | null
          starter_passed?: number | null
          starter_score?: number | null
          unlocked_categories?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          mbti_type: string | null
          password: string
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          mbti_type?: string | null
          password: string
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          mbti_type?: string | null
          password?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
