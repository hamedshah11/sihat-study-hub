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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          created_at: string | null
          current_semester_id: string | null
          id: string
          name: string
          program_id: string | null
          start_date: string | null
        }
        Insert: {
          created_at?: string | null
          current_semester_id?: string | null
          id?: string
          name: string
          program_id?: string | null
          start_date?: string | null
        }
        Update: {
          created_at?: string | null
          current_semester_id?: string | null
          id?: string
          name?: string
          program_id?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_current_semester_id_fkey"
            columns: ["current_semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_progress: {
        Row: {
          attempts: number | null
          chapter_id: string
          completed_at: string | null
          last_attempt_at: string | null
          mastery_score: number | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          chapter_id: string
          completed_at?: string | null
          last_attempt_at?: string | null
          mastery_score?: number | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          chapter_id?: string
          completed_at?: string | null
          last_attempt_at?: string | null
          mastery_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          status: string | null
          subject_id: string | null
          summary_md: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          status?: string | null
          subject_id?: string | null
          summary_md?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          status?: string | null
          subject_id?: string | null
          summary_md?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_reviews: {
        Row: {
          difficulty: number | null
          elapsed_days: number | null
          flashcard_id: string
          lapses: number | null
          last_review: string | null
          next_review_at: string | null
          reps: number | null
          scheduled_days: number | null
          stability: number | null
          state: string | null
          user_id: string
        }
        Insert: {
          difficulty?: number | null
          elapsed_days?: number | null
          flashcard_id: string
          lapses?: number | null
          last_review?: string | null
          next_review_at?: string | null
          reps?: number | null
          scheduled_days?: number | null
          stability?: number | null
          state?: string | null
          user_id: string
        }
        Update: {
          difficulty?: number | null
          elapsed_days?: number | null
          flashcard_id?: string
          lapses?: number | null
          last_review?: string | null
          next_review_at?: string | null
          reps?: number | null
          scheduled_days?: number | null
          stability?: number | null
          state?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back: string
          card_type: string | null
          chapter_id: string | null
          created_at: string | null
          front: string
          hint: string | null
          id: string
          status: string | null
        }
        Insert: {
          back: string
          card_type?: string | null
          chapter_id?: string | null
          created_at?: string | null
          front: string
          hint?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          back?: string
          card_type?: string | null
          chapter_id?: string | null
          created_at?: string | null
          front?: string
          hint?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string | null
          expires_at: string | null
          max_uses: number | null
          used_count: number | null
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string | null
          expires_at?: string | null
          max_uses?: number | null
          used_count?: number | null
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string | null
          expires_at?: string | null
          max_uses?: number | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          batch_id: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          role: string | null
          student_type: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          role?: string | null
          student_type?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string | null
          student_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string | null
          id: string
          name: string
          total_semesters: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          total_semesters?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          total_semesters?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          chapter_id: string | null
          correct_index: number
          created_at: string | null
          difficulty: string | null
          explanation: string | null
          id: string
          options: Json
          prompt: string
          status: string | null
        }
        Insert: {
          chapter_id?: string | null
          correct_index: number
          created_at?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          options: Json
          prompt: string
          status?: string | null
        }
        Update: {
          chapter_id?: string | null
          correct_index?: number
          created_at?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          options?: Json
          prompt?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json | null
          attempted_at: string | null
          chapter_id: string | null
          id: string
          score: number
          total_questions: number
          user_id: string | null
        }
        Insert: {
          answers?: Json | null
          attempted_at?: string | null
          chapter_id?: string | null
          id?: string
          score: number
          total_questions: number
          user_id?: string | null
        }
        Update: {
          answers?: Json | null
          attempted_at?: string | null
          chapter_id?: string | null
          id?: string
          score?: number
          total_questions?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          created_at: string | null
          id: string
          name: string
          number: number
          program_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          number: number
          program_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          number?: number
          program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semesters_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          current_streak: number | null
          freezes_available: number | null
          last_active_date: string | null
          longest_streak: number | null
          user_id: string
        }
        Insert: {
          current_streak?: number | null
          freezes_available?: number | null
          last_active_date?: string | null
          longest_streak?: number | null
          user_id: string
        }
        Update: {
          current_streak?: number | null
          freezes_available?: number | null
          last_active_date?: string | null
          longest_streak?: number | null
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          name: string
          semester_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name: string
          semester_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name?: string
          semester_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_messages: {
        Row: {
          chapter_id: string | null
          content: string
          created_at: string | null
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          chapter_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          chapter_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tutor_messages_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          amount: number
          id: string
          occurred_at: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          id?: string
          occurred_at?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          id?: string
          occurred_at?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
