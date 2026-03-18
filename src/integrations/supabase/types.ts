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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          friend_code: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          friend_code?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          friend_code?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          id: string
          from_user_id: string
          to_user_id: string
          status: Database["public"]["Enums"]["friend_request_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_user_id: string
          to_user_id: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_user_id?: string
          to_user_id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          user_id: string
          friend_user_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          friend_user_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          friend_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      pulse_events: {
        Row: {
          id: string
          user_id: string
          action: Database["public"]["Enums"]["pulse_action"]
          goal_title: string
          stake: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: Database["public"]["Enums"]["pulse_action"]
          goal_title: string
          stake?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: Database["public"]["Enums"]["pulse_action"]
          goal_title?: string
          stake?: number
          created_at?: string
        }
        Relationships: []
      }
      judge_requests: {
        Row: {
          id: string
          requester_user_id: string
          judge_user_id: string
          status: Database["public"]["Enums"]["judge_request_status"]
          goal_payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requester_user_id: string
          judge_user_id: string
          status?: Database["public"]["Enums"]["judge_request_status"]
          goal_payload: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requester_user_id?: string
          judge_user_id?: string
          status?: Database["public"]["Enums"]["judge_request_status"]
          goal_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      goal_resolve_tokens: {
        Row: {
          id: string
          goal_id: string
          outcome: string
          judge_user_id: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          goal_id: string
          outcome: "completed" | "failed"
          judge_user_id?: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          goal_id?: string
          outcome?: "completed" | "failed"
          judge_user_id?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      send_friend_request_by_code: {
        Args: { p_to_friend_code: string }
        Returns: { request_id: string; to_user_id: string }[]
      }
      accept_friend_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      ignore_friend_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      create_judge_request: {
        Args: { p_judge_user_id: string; p_goal_payload: Json }
        Returns: string
      }
      accept_judge_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      ignore_judge_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      cancel_judge_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      friend_request_status: "pending" | "accepted" | "ignored"
      pulse_action: "created" | "completed" | "failed" | "staked"
      judge_request_status: "pending" | "accepted" | "ignored" | "cancelled"
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
