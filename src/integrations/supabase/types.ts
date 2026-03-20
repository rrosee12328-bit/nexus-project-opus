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
      admin_activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          summary: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          summary: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          category: string
          client_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string | null
          id: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          client_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          file_type?: string | null
          id?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string | null
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      business_overhead: {
        Row: {
          amount: number
          category: string
          created_at: string
          details: string | null
          id: string
          name: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          details?: string | null
          id?: string
          name: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          details?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      client_costs: {
        Row: {
          amount: number
          category: string
          client_id: string
          created_at: string
          details: string | null
          id: string
          is_monthly: boolean
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          client_id: string
          created_at?: string
          details?: string | null
          id?: string
          is_monthly?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          client_id?: string
          created_at?: string
          details?: string | null
          id?: string
          is_monthly?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_costs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          attendees: string[]
          client_id: string
          content: string | null
          created_at: string
          created_by: string
          due_date: string | null
          file_path: string | null
          id: string
          meeting_date: string | null
          status: string | null
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          attendees?: string[]
          client_id: string
          content?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          file_path?: string | null
          id?: string
          meeting_date?: string | null
          status?: string | null
          title: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          attendees?: string[]
          client_id?: string
          content?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          file_path?: string | null
          id?: string
          meeting_date?: string | null
          status?: string | null
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_steps: {
        Row: {
          category: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          sort_order: number
          step_key: string
          title: string
        }
        Insert: {
          category?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          step_key: string
          title: string
        }
        Update: {
          category?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          step_key?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          notes: string | null
          payment_month: number
          payment_year: number
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_month: number
          payment_year: number
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_month?: number
          payment_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          balance_due: number | null
          created_at: string
          email: string | null
          id: string
          monthly_fee: number | null
          name: string
          notes: string | null
          phone: string | null
          pipeline_stage: string | null
          setup_fee: number | null
          setup_paid: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["client_status"]
          type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance_due?: number | null
          created_at?: string
          email?: string | null
          id?: string
          monthly_fee?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string | null
          setup_fee?: number | null
          setup_paid?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance_due?: number | null
          created_at?: string
          email?: string | null
          id?: string
          monthly_fee?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string | null
          setup_fee?: number | null
          setup_paid?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          expense_month: number
          expense_year: number
          id: string
          notes: string | null
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expense_month: number
          expense_year?: number
          id?: string
          notes?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_month?: number
          expense_year?: number
          id?: string
          notes?: string | null
          type?: string
        }
        Relationships: []
      }
      investments: {
        Row: {
          amount: number
          created_at: string
          id: string
          investment_date: string | null
          notes: string | null
          owner_name: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          investment_date?: string | null
          notes?: string | null
          owner_name: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          investment_date?: string | null
          notes?: string | null
          owner_name?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          client_id: string
          content: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_templates: {
        Row: {
          client_type: string
          created_at: string
          id: string
          is_default: boolean
          onboarding_steps: Json
          phases: string[]
          project_description: string
          project_name: string
          updated_at: string
        }
        Insert: {
          client_type: string
          created_at?: string
          id?: string
          is_default?: boolean
          onboarding_steps?: Json
          phases?: string[]
          project_description?: string
          project_name: string
          updated_at?: string
        }
        Update: {
          client_type?: string
          created_at?: string
          id?: string
          is_default?: boolean
          onboarding_steps?: Json
          phases?: string[]
          project_description?: string
          project_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_activity_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          project_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          project_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_attachments: {
        Row: {
          created_at: string
          created_by: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          project_id: string
          title: string
          type: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          project_id: string
          title: string
          type?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          project_id?: string
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          completed_at: string | null
          id: string
          notes: string | null
          phase: Database["public"]["Enums"]["project_phase"]
          project_id: string
          sort_order: number
          started_at: string | null
          status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          phase: Database["public"]["Enums"]["project_phase"]
          project_id: string
          sort_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          phase?: Database["public"]["Enums"]["project_phase"]
          project_id?: string
          sort_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          created_at: string
          current_phase: Database["public"]["Enums"]["project_phase"]
          description: string | null
          id: string
          name: string
          progress: number
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_date: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          current_phase?: Database["public"]["Enums"]["project_phase"]
          description?: string | null
          id?: string
          name: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          current_phase?: Database["public"]["Enums"]["project_phase"]
          description?: string | null
          id?: string
          name?: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          id: string
          recipient_email: string
          recipient_user_id: string | null
          reference_id: string
          reminder_type: string
          sent_at: string
        }
        Insert: {
          id?: string
          recipient_email: string
          recipient_user_id?: string | null
          reference_id: string
          reminder_type: string
          sent_at?: string
        }
        Update: {
          id?: string
          recipient_email?: string
          recipient_user_id?: string | null
          reference_id?: string
          reminder_type?: string
          sent_at?: string
        }
        Relationships: []
      }
      sops: {
        Row: {
          category: Database["public"]["Enums"]["sop_category"]
          content: string
          created_at: string
          id: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["sop_category"]
          content?: string
          created_at?: string
          id?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["sop_category"]
          content?: string
          created_at?: string
          id?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          created_at: string
          created_by: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          task_id: string
          title: string
          type: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          task_id: string
          title: string
          type?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          task_id?: string
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          daily_focus: boolean
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          sort_order: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          daily_focus?: boolean
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          daily_focus?: boolean
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          category: Database["public"]["Enums"]["time_entry_category"]
          created_at: string
          day_of_week: string
          description: string
          end_time: string
          entry_date: string
          hours: number
          id: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["time_entry_category"]
          created_at?: string
          day_of_week?: string
          description?: string
          end_time: string
          entry_date?: string
          hours?: number
          id?: string
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["time_entry_category"]
          created_at?: string
          day_of_week?: string
          description?: string
          end_time?: string
          entry_date?: string
          hours?: number
          id?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_client_id_for_user: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "ops" | "client"
      client_status: "active" | "onboarding" | "closed" | "prospect" | "lead"
      project_phase:
        | "discovery"
        | "design"
        | "development"
        | "review"
        | "launch"
        | "deploy"
      project_status: "not_started" | "in_progress" | "completed" | "on_hold"
      sop_category:
        | "onboarding"
        | "operations"
        | "development"
        | "design"
        | "communication"
        | "finance"
        | "general"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "review" | "done"
      time_entry_category:
        | "client_work"
        | "sales"
        | "admin"
        | "vektiss"
        | "break"
        | "meeting"
        | "other"
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
      app_role: ["admin", "ops", "client"],
      client_status: ["active", "onboarding", "closed", "prospect", "lead"],
      project_phase: [
        "discovery",
        "design",
        "development",
        "review",
        "launch",
        "deploy",
      ],
      project_status: ["not_started", "in_progress", "completed", "on_hold"],
      sop_category: [
        "onboarding",
        "operations",
        "development",
        "design",
        "communication",
        "finance",
        "general",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "review", "done"],
      time_entry_category: [
        "client_work",
        "sales",
        "admin",
        "vektiss",
        "break",
        "meeting",
        "other",
      ],
    },
  },
} as const
