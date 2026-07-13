export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      application_checklist: {
        Row: {
          application_id: string
          due_date: string | null
          id: string
          status: Database["public"]["Enums"]["checklist_status"]
          task_name: string
        }
        Insert: {
          application_id: string
          due_date?: string | null
          id?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          task_name: string
        }
        Update: {
          application_id?: string
          due_date?: string | null
          id?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_checklist_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_tasks: {
        Row: {
          category: Database["public"]["Enums"]["application_task_category"]
          description: string | null
          due_offset_days: number | null
          id: string
          name: string
          program_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["application_task_category"]
          description?: string | null
          due_offset_days?: number | null
          id?: string
          name: string
          program_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["application_task_category"]
          description?: string | null
          due_offset_days?: number | null
          id?: string
          name?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_tasks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "application_tasks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "application_tasks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          decision: string | null
          decision_at: string | null
          decision_conditions: string | null
          id: string
          notes: string | null
          platform: string | null
          portal_url: string | null
          profile_id: string
          program_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision?: string | null
          decision_at?: string | null
          decision_conditions?: string | null
          id?: string
          notes?: string | null
          platform?: string | null
          portal_url?: string | null
          profile_id: string
          program_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision?: string | null
          decision_at?: string | null
          decision_conditions?: string | null
          id?: string
          notes?: string | null
          platform?: string | null
          portal_url?: string | null
          profile_id?: string
          program_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "applications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "applications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_raw_courses: {
        Row: {
          a_level_min_numeric: number | null
          additional_entry_requirements: string | null
          additional_fee_info: string | null
          assessment_methods: string | null
          average_salary_after_15m: string | null
          campus: string | null
          contextual_admissions: string | null
          course_name: string
          course_summary: string | null
          created_at: string
          currency: string | null
          duration: string | null
          duration_years: number | null
          employment_after_course: string | null
          english_requirements: string | null
          entry_requirements_overview: string | null
          field: string | null
          historic_entry_grades: string | null
          id: string
          intake_months: string[] | null
          language: string | null
          level: string | null
          metadata: Json | null
          min_alevel: string | null
          min_ib: string | null
          mode: string | null
          modules: string | null
          name: string | null
          open_days: string | null
          provider_apply_url: string | null
          provider_course_url: string | null
          start_date: string | null
          student_outcomes: string | null
          student_satisfaction: string | null
          study_level: string | null
          subject_requirements: string | null
          subsequent_year_entry_requirements: string | null
          tuition: number | null
          tuition_fees_home: string | null
          tuition_fees_international: string | null
          ucas_code: string | null
          ucas_points: string | null
          university_id: string
          url: string | null
        }
        Insert: {
          a_level_min_numeric?: number | null
          additional_entry_requirements?: string | null
          additional_fee_info?: string | null
          assessment_methods?: string | null
          average_salary_after_15m?: string | null
          campus?: string | null
          contextual_admissions?: string | null
          course_name: string
          course_summary?: string | null
          created_at?: string
          currency?: string | null
          duration?: string | null
          duration_years?: number | null
          employment_after_course?: string | null
          english_requirements?: string | null
          entry_requirements_overview?: string | null
          field?: string | null
          historic_entry_grades?: string | null
          id?: string
          intake_months?: string[] | null
          language?: string | null
          level?: string | null
          metadata?: Json | null
          min_alevel?: string | null
          min_ib?: string | null
          mode?: string | null
          modules?: string | null
          name?: string | null
          open_days?: string | null
          provider_apply_url?: string | null
          provider_course_url?: string | null
          start_date?: string | null
          student_outcomes?: string | null
          student_satisfaction?: string | null
          study_level?: string | null
          subject_requirements?: string | null
          subsequent_year_entry_requirements?: string | null
          tuition?: number | null
          tuition_fees_home?: string | null
          tuition_fees_international?: string | null
          ucas_code?: string | null
          ucas_points?: string | null
          university_id: string
          url?: string | null
        }
        Update: {
          a_level_min_numeric?: number | null
          additional_entry_requirements?: string | null
          additional_fee_info?: string | null
          assessment_methods?: string | null
          average_salary_after_15m?: string | null
          campus?: string | null
          contextual_admissions?: string | null
          course_name?: string
          course_summary?: string | null
          created_at?: string
          currency?: string | null
          duration?: string | null
          duration_years?: number | null
          employment_after_course?: string | null
          english_requirements?: string | null
          entry_requirements_overview?: string | null
          field?: string | null
          historic_entry_grades?: string | null
          id?: string
          intake_months?: string[] | null
          language?: string | null
          level?: string | null
          metadata?: Json | null
          min_alevel?: string | null
          min_ib?: string | null
          mode?: string | null
          modules?: string | null
          name?: string | null
          open_days?: string | null
          provider_apply_url?: string | null
          provider_course_url?: string | null
          start_date?: string | null
          student_outcomes?: string | null
          student_satisfaction?: string | null
          study_level?: string | null
          subject_requirements?: string | null
          subsequent_year_entry_requirements?: string | null
          tuition?: number | null
          tuition_fees_home?: string | null
          tuition_fees_international?: string | null
          ucas_code?: string | null
          ucas_points?: string | null
          university_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "archive_raw_universities"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_raw_universities: {
        Row: {
          acceptance_rate: number | null
          city: string | null
          country: string
          created_at: string
          currency: string | null
          id: string
          intl_tuition_high: number | null
          intl_tuition_low: number | null
          metadata: Json | null
          name: string
          rank_overall: number | null
          rank_source: string | null
          region: string | null
          requires_test: boolean | null
          website: string | null
        }
        Insert: {
          acceptance_rate?: number | null
          city?: string | null
          country: string
          created_at?: string
          currency?: string | null
          id?: string
          intl_tuition_high?: number | null
          intl_tuition_low?: number | null
          metadata?: Json | null
          name: string
          rank_overall?: number | null
          rank_source?: string | null
          region?: string | null
          requires_test?: boolean | null
          website?: string | null
        }
        Update: {
          acceptance_rate?: number | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string | null
          id?: string
          intl_tuition_high?: number | null
          intl_tuition_low?: number | null
          metadata?: Json | null
          name?: string
          rank_overall?: number | null
          rank_source?: string | null
          region?: string | null
          requires_test?: boolean | null
          website?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          average_rent_outside_campus_gbp_per_month: number | null
          cost_of_life: Database["public"]["Enums"]["cost_of_life_enum"] | null
          country: string
          created_at: string
          id: string
          name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          average_rent_outside_campus_gbp_per_month?: number | null
          cost_of_life?: Database["public"]["Enums"]["cost_of_life_enum"] | null
          country: string
          created_at?: string
          id?: string
          name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          average_rent_outside_campus_gbp_per_month?: number | null
          cost_of_life?: Database["public"]["Enums"]["cost_of_life_enum"] | null
          country?: string
          created_at?: string
          id?: string
          name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      counsellor_notes: {
        Row: {
          author_profile_id: string
          body: string
          created_at: string
          id: string
          note_type: string
          student_profile_id: string
        }
        Insert: {
          author_profile_id: string
          body: string
          created_at?: string
          id?: string
          note_type?: string
          student_profile_id: string
        }
        Update: {
          author_profile_id?: string
          body?: string
          created_at?: string
          id?: string
          note_type?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counsellor_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsellor_notes_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deadlines: {
        Row: {
          created_at: string
          deadline_date: string | null
          id: string
          intake: string | null
          is_rolling: boolean | null
          name: string
          program_id: string
          source_id: string | null
          timezone: string | null
        }
        Insert: {
          created_at?: string
          deadline_date?: string | null
          id?: string
          intake?: string | null
          is_rolling?: boolean | null
          name: string
          program_id: string
          source_id?: string | null
          timezone?: string | null
        }
        Update: {
          created_at?: string
          deadline_date?: string | null
          id?: string
          intake?: string | null
          is_rolling?: boolean | null
          name?: string
          program_id?: string
          source_id?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "deadlines_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "deadlines_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          application_id: string
          id: string
          name: string
          storage_path: string
          type: string | null
          uploaded_at: string
        }
        Insert: {
          application_id: string
          id?: string
          name: string
          storage_path: string
          type?: string | null
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          id?: string
          name?: string
          storage_path?: string
          type?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      help_meetings: {
        Row: {
          counsellor_profile_id: string
          created_at: string
          duration_minutes: number
          id: string
          location: string | null
          request_id: string
          scheduled_for: string
          status: string
          status_changed_by: string | null
          student_profile_id: string
          title: string
        }
        Insert: {
          counsellor_profile_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          location?: string | null
          request_id: string
          scheduled_for: string
          status?: string
          status_changed_by?: string | null
          student_profile_id: string
          title: string
        }
        Update: {
          counsellor_profile_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          location?: string | null
          request_id?: string
          scheduled_for?: string
          status?: string
          status_changed_by?: string | null
          student_profile_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_meetings_counsellor_profile_id_fkey"
            columns: ["counsellor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_meetings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_meetings_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_messages: {
        Row: {
          author_profile_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          request_id: string
        }
        Insert: {
          author_profile_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          request_id: string
        }
        Update: {
          author_profile_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      help_notes: {
        Row: {
          author_profile_id: string
          body: string
          created_at: string
          id: string
          request_id: string
        }
        Insert: {
          author_profile_id: string
          body: string
          created_at?: string
          id?: string
          request_id: string
        }
        Update: {
          author_profile_id?: string
          body?: string
          created_at?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_notes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      help_requests: {
        Row: {
          accepted_at: string | null
          application_id: string | null
          body: string
          created_at: string
          id: string
          initiated_by: string
          program: string | null
          resolved_at: string | null
          status: string
          student_profile_id: string
          subject: string
          university: string | null
        }
        Insert: {
          accepted_at?: string | null
          application_id?: string | null
          body: string
          created_at?: string
          id?: string
          initiated_by?: string
          program?: string | null
          resolved_at?: string | null
          status?: string
          student_profile_id: string
          subject: string
          university?: string | null
        }
        Update: {
          accepted_at?: string | null
          application_id?: string | null
          body?: string
          created_at?: string
          id?: string
          initiated_by?: string
          program?: string | null
          resolved_at?: string | null
          status?: string
          student_profile_id?: string
          subject?: string
          university?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          href: string | null
          id: string
          kind: string
          profile_id: string
          read_at: string | null
          title: string
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind: string
          profile_id: string
          read_at?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          profile_id?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_contacted: string | null
          parent_name: string
          phone: string | null
          relationship: string | null
          status: string
          student_profile_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_contacted?: string | null
          parent_name: string
          phone?: string | null
          relationship?: string | null
          status?: string
          student_profile_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_contacted?: string | null
          parent_name?: string
          phone?: string | null
          relationship?: string | null
          status?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_contacts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_messages: {
        Row: {
          body: string
          contact_id: string
          created_at: string
          id: string
          read_at: string | null
          sender: string
          template: string | null
        }
        Insert: {
          body: string
          contact_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender: string
          template?: string | null
        }
        Update: {
          body?: string
          contact_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender?: string
          template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "parent_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string | null
          role: string
          time_zone: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string | null
          role?: string
          time_zone?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string | null
          role?: string
          time_zone?: string | null
        }
        Relationships: []
      }
      program_requirements: {
        Row: {
          curriculum: string | null
          language_tests: Json | null
          min_act: number | null
          min_gpa: number | null
          min_ib_total: number | null
          min_sat: number | null
          other_requirements: string | null
          program_id: string
          required_subjects: string[] | null
        }
        Insert: {
          curriculum?: string | null
          language_tests?: Json | null
          min_act?: number | null
          min_gpa?: number | null
          min_ib_total?: number | null
          min_sat?: number | null
          other_requirements?: string | null
          program_id: string
          required_subjects?: string[] | null
        }
        Update: {
          curriculum?: string | null
          language_tests?: Json | null
          min_act?: number | null
          min_gpa?: number | null
          min_ib_total?: number | null
          min_sat?: number | null
          other_requirements?: string | null
          program_id?: string
          required_subjects?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "program_requirements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "program_requirements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "program_requirements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          a_level_min_numeric: number | null
          additional_entry_requirements: string | null
          additional_fee_info: string | null
          admission_test: string | null
          assessment_methods: string | null
          average_rent_outside_campus_gbp_per_month_override: number | null
          average_salary_after_15m: string | null
          average_starting_salary_gbp_override: number | null
          campus: string | null
          contextual_admissions: string | null
          cost_of_life_override:
            | Database["public"]["Enums"]["cost_of_life_enum"]
            | null
          course_name: string
          course_online_page: string | null
          course_summary: string | null
          created_at: string
          currency: string | null
          duration: string | null
          duration_years: number | null
          employment_after_course: string | null
          english_requirements: string | null
          english_score_requirement: string | null
          entry_requirements_overview: string | null
          field: string | null
          gender_ratio_pct: number | null
          historic_entry_grades: string | null
          id: string
          intake_months: string[] | null
          intake_size: number | null
          international_students_ratio_pct_override: number | null
          interview: string | null
          language: string | null
          level: string | null
          metadata: Json | null
          min_a_level_score: string | null
          min_alevel: string | null
          min_ib: string | null
          min_ib_score: number | null
          mode: string | null
          modules: string | null
          name: string | null
          nss_score_pct_override: number | null
          open_days: string | null
          placement_year: boolean | null
          placement_year_detail: string | null
          preferred_subjects: string | null
          preferred_subjects_json: Json | null
          provider_apply_url: string | null
          provider_course_url: string | null
          start_date: string | null
          student_dorm_cost_gbp_per_year_override: number | null
          student_outcomes: string | null
          student_satisfaction: string | null
          student_to_staff_ratio_override: number | null
          study_abroad_option: string | null
          study_level: string | null
          subject_requirements: string | null
          subsequent_year_entry_requirements: string | null
          top_industries: string | null
          tuition: number | null
          tuition_fees_home: string | null
          tuition_fees_international: string | null
          ucas_code: string | null
          ucas_deadline: string | null
          ucas_points: string | null
          university_id: string
          university_life_override: string | null
          updated_at: string
          url: string | null
          yearly_international_tuition_fee_gbp: number | null
        }
        Insert: {
          a_level_min_numeric?: number | null
          additional_entry_requirements?: string | null
          additional_fee_info?: string | null
          admission_test?: string | null
          assessment_methods?: string | null
          average_rent_outside_campus_gbp_per_month_override?: number | null
          average_salary_after_15m?: string | null
          average_starting_salary_gbp_override?: number | null
          campus?: string | null
          contextual_admissions?: string | null
          cost_of_life_override?:
            | Database["public"]["Enums"]["cost_of_life_enum"]
            | null
          course_name: string
          course_online_page?: string | null
          course_summary?: string | null
          created_at?: string
          currency?: string | null
          duration?: string | null
          duration_years?: number | null
          employment_after_course?: string | null
          english_requirements?: string | null
          english_score_requirement?: string | null
          entry_requirements_overview?: string | null
          field?: string | null
          gender_ratio_pct?: number | null
          historic_entry_grades?: string | null
          id?: string
          intake_months?: string[] | null
          intake_size?: number | null
          international_students_ratio_pct_override?: number | null
          interview?: string | null
          language?: string | null
          level?: string | null
          metadata?: Json | null
          min_a_level_score?: string | null
          min_alevel?: string | null
          min_ib?: string | null
          min_ib_score?: number | null
          mode?: string | null
          modules?: string | null
          name?: string | null
          nss_score_pct_override?: number | null
          open_days?: string | null
          placement_year?: boolean | null
          placement_year_detail?: string | null
          preferred_subjects?: string | null
          preferred_subjects_json?: Json | null
          provider_apply_url?: string | null
          provider_course_url?: string | null
          start_date?: string | null
          student_dorm_cost_gbp_per_year_override?: number | null
          student_outcomes?: string | null
          student_satisfaction?: string | null
          student_to_staff_ratio_override?: number | null
          study_abroad_option?: string | null
          study_level?: string | null
          subject_requirements?: string | null
          subsequent_year_entry_requirements?: string | null
          top_industries?: string | null
          tuition?: number | null
          tuition_fees_home?: string | null
          tuition_fees_international?: string | null
          ucas_code?: string | null
          ucas_deadline?: string | null
          ucas_points?: string | null
          university_id: string
          university_life_override?: string | null
          updated_at?: string
          url?: string | null
          yearly_international_tuition_fee_gbp?: number | null
        }
        Update: {
          a_level_min_numeric?: number | null
          additional_entry_requirements?: string | null
          additional_fee_info?: string | null
          admission_test?: string | null
          assessment_methods?: string | null
          average_rent_outside_campus_gbp_per_month_override?: number | null
          average_salary_after_15m?: string | null
          average_starting_salary_gbp_override?: number | null
          campus?: string | null
          contextual_admissions?: string | null
          cost_of_life_override?:
            | Database["public"]["Enums"]["cost_of_life_enum"]
            | null
          course_name?: string
          course_online_page?: string | null
          course_summary?: string | null
          created_at?: string
          currency?: string | null
          duration?: string | null
          duration_years?: number | null
          employment_after_course?: string | null
          english_requirements?: string | null
          english_score_requirement?: string | null
          entry_requirements_overview?: string | null
          field?: string | null
          gender_ratio_pct?: number | null
          historic_entry_grades?: string | null
          id?: string
          intake_months?: string[] | null
          intake_size?: number | null
          international_students_ratio_pct_override?: number | null
          interview?: string | null
          language?: string | null
          level?: string | null
          metadata?: Json | null
          min_a_level_score?: string | null
          min_alevel?: string | null
          min_ib?: string | null
          min_ib_score?: number | null
          mode?: string | null
          modules?: string | null
          name?: string | null
          nss_score_pct_override?: number | null
          open_days?: string | null
          placement_year?: boolean | null
          placement_year_detail?: string | null
          preferred_subjects?: string | null
          preferred_subjects_json?: Json | null
          provider_apply_url?: string | null
          provider_course_url?: string | null
          start_date?: string | null
          student_dorm_cost_gbp_per_year_override?: number | null
          student_outcomes?: string | null
          student_satisfaction?: string | null
          student_to_staff_ratio_override?: number | null
          study_abroad_option?: string | null
          study_level?: string | null
          subject_requirements?: string | null
          subsequent_year_entry_requirements?: string | null
          top_industries?: string | null
          tuition?: number | null
          tuition_fees_home?: string | null
          tuition_fees_international?: string | null
          ucas_code?: string | null
          ucas_deadline?: string | null
          ucas_points?: string | null
          university_id?: string
          university_life_override?: string | null
          updated_at?: string
          url?: string | null
          yearly_international_tuition_fee_gbp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_v2_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_results: {
        Row: {
          actual_country: string
          actual_program: string
          actual_university: string
          algorithm_notes: string | null
          algorithm_result: string | null
          batch_label: string
          chance_percent: number | null
          created_at: string | null
          id: string
          profile_name: string
          profile_snapshot: Json | null
          programme_type: string
          run_id: string
          score_breakdown: Json | null
          student_band: string | null
          student_ib_equivalent: number | null
          student_score: number | null
          validation_pass: boolean | null
        }
        Insert: {
          actual_country: string
          actual_program: string
          actual_university: string
          algorithm_notes?: string | null
          algorithm_result?: string | null
          batch_label: string
          chance_percent?: number | null
          created_at?: string | null
          id?: string
          profile_name: string
          profile_snapshot?: Json | null
          programme_type: string
          run_id?: string
          score_breakdown?: Json | null
          student_band?: string | null
          student_ib_equivalent?: number | null
          student_score?: number | null
          validation_pass?: boolean | null
        }
        Update: {
          actual_country?: string
          actual_program?: string
          actual_university?: string
          algorithm_notes?: string | null
          algorithm_result?: string | null
          batch_label?: string
          chance_percent?: number | null
          created_at?: string | null
          id?: string
          profile_name?: string
          profile_snapshot?: Json | null
          programme_type?: string
          run_id?: string
          score_breakdown?: Json | null
          student_band?: string | null
          student_ib_equivalent?: number | null
          student_score?: number | null
          validation_pass?: boolean | null
        }
        Relationships: []
      }
      sources: {
        Row: {
          health: Database["public"]["Enums"]["source_health"]
          id: string
          last_scraped_at: string | null
          name: string
          notes: string | null
          url: string | null
        }
        Insert: {
          health?: Database["public"]["Enums"]["source_health"]
          id?: string
          last_scraped_at?: string | null
          name: string
          notes?: string | null
          url?: string | null
        }
        Update: {
          health?: Database["public"]["Enums"]["source_health"]
          id?: string
          last_scraped_at?: string | null
          name?: string
          notes?: string | null
          url?: string | null
        }
        Relationships: []
      }
      student_academic_input: {
        Row: {
          a_level_predicted_grades: Json | null
          career_aspiration: string | null
          desired_start_date: string | null
          ee_subject: string | null
          ee_summary: string | null
          ee_title: string | null
          english_required: boolean | null
          english_score_overall: number | null
          english_status: Database["public"]["Enums"]["english_status"] | null
          english_test_type:
            | Database["public"]["Enums"]["english_test_type"]
            | null
          graduation_year: number | null
          ib_core_points: number | null
          ib_ee_grade: Database["public"]["Enums"]["ib_grade"] | null
          ib_math_pathway: Database["public"]["Enums"]["ib_math_pathway"] | null
          ib_tok_grade: Database["public"]["Enums"]["ib_grade"] | null
          ib_total_points: number | null
          intended_clusters:
            | Database["public"]["Enums"]["intended_cluster"][]
            | null
          language_of_instruction:
            | Database["public"]["Enums"]["language_of_instruction"]
            | null
          profile_id: string
          programme_type: Database["public"]["Enums"]["programme_type"] | null
          school_city: string | null
          school_country: string | null
          school_name: string | null
          school_type: Database["public"]["Enums"]["school_type"] | null
          secondary_clusters:
            | Database["public"]["Enums"]["intended_cluster"][]
            | null
          updated_at: string
        }
        Insert: {
          a_level_predicted_grades?: Json | null
          career_aspiration?: string | null
          desired_start_date?: string | null
          ee_subject?: string | null
          ee_summary?: string | null
          ee_title?: string | null
          english_required?: boolean | null
          english_score_overall?: number | null
          english_status?: Database["public"]["Enums"]["english_status"] | null
          english_test_type?:
            | Database["public"]["Enums"]["english_test_type"]
            | null
          graduation_year?: number | null
          ib_core_points?: number | null
          ib_ee_grade?: Database["public"]["Enums"]["ib_grade"] | null
          ib_math_pathway?:
            | Database["public"]["Enums"]["ib_math_pathway"]
            | null
          ib_tok_grade?: Database["public"]["Enums"]["ib_grade"] | null
          ib_total_points?: number | null
          intended_clusters?:
            | Database["public"]["Enums"]["intended_cluster"][]
            | null
          language_of_instruction?:
            | Database["public"]["Enums"]["language_of_instruction"]
            | null
          profile_id: string
          programme_type?: Database["public"]["Enums"]["programme_type"] | null
          school_city?: string | null
          school_country?: string | null
          school_name?: string | null
          school_type?: Database["public"]["Enums"]["school_type"] | null
          secondary_clusters?:
            | Database["public"]["Enums"]["intended_cluster"][]
            | null
          updated_at?: string
        }
        Update: {
          a_level_predicted_grades?: Json | null
          career_aspiration?: string | null
          desired_start_date?: string | null
          ee_subject?: string | null
          ee_summary?: string | null
          ee_title?: string | null
          english_required?: boolean | null
          english_score_overall?: number | null
          english_status?: Database["public"]["Enums"]["english_status"] | null
          english_test_type?:
            | Database["public"]["Enums"]["english_test_type"]
            | null
          graduation_year?: number | null
          ib_core_points?: number | null
          ib_ee_grade?: Database["public"]["Enums"]["ib_grade"] | null
          ib_math_pathway?:
            | Database["public"]["Enums"]["ib_math_pathway"]
            | null
          ib_tok_grade?: Database["public"]["Enums"]["ib_grade"] | null
          ib_total_points?: number | null
          intended_clusters?:
            | Database["public"]["Enums"]["intended_cluster"][]
            | null
          language_of_instruction?:
            | Database["public"]["Enums"]["language_of_instruction"]
            | null
          profile_id?: string
          programme_type?: Database["public"]["Enums"]["programme_type"] | null
          school_city?: string | null
          school_country?: string | null
          school_name?: string | null
          school_type?: Database["public"]["Enums"]["school_type"] | null
          secondary_clusters?:
            | Database["public"]["Enums"]["intended_cluster"][]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_academic_input_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_activities: {
        Row: {
          category: string
          created_at: string
          duration: string | null
          highlight: string | null
          id: string
          level: string | null
          profile_id: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          duration?: string | null
          highlight?: string | null
          id?: string
          level?: string | null
          profile_id: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          duration?: string | null
          highlight?: string | null
          id?: string
          level?: string | null
          profile_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_activities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_admissions_tests: {
        Row: {
          created_at: string
          id: string
          percentile: number | null
          profile_id: string
          score_numeric: number | null
          status: Database["public"]["Enums"]["admissions_status"] | null
          test_type: Database["public"]["Enums"]["admissions_test_type"] | null
        }
        Insert: {
          created_at?: string
          id?: string
          percentile?: number | null
          profile_id: string
          score_numeric?: number | null
          status?: Database["public"]["Enums"]["admissions_status"] | null
          test_type?: Database["public"]["Enums"]["admissions_test_type"] | null
        }
        Update: {
          created_at?: string
          id?: string
          percentile?: number | null
          profile_id?: string
          score_numeric?: number | null
          status?: Database["public"]["Enums"]["admissions_status"] | null
          test_type?: Database["public"]["Enums"]["admissions_test_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "student_admissions_tests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_documents: {
        Row: {
          created_at: string
          doc_type: string
          document_name: string
          due_date: string | null
          id: string
          notes: string | null
          status: string
          student_profile_id: string
          uploaded_at: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          document_name: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          student_profile_id: string
          uploaded_at?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          document_name?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          student_profile_id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_lifestyle_preference: {
        Row: {
          act_score: number | null
          ambition_statement: string | null
          campus_size:
            | Database["public"]["Enums"]["campus_size_preference"]
            | null
          commitment_level: string | null
          desired_location_type:
            | Database["public"]["Enums"]["location_type"]
            | null
          epq_subject: string | null
          epq_title: string | null
          extracurricular_interests: string[] | null
          intl_experience: string[] | null
          key_activities: string[] | null
          leadership_roles: string[] | null
          other_extracurriculars: string | null
          profile_id: string
          sat_score: number | null
          teaching_style: Database["public"]["Enums"]["teaching_style"] | null
          updated_at: string
          work_experience: boolean | null
          work_experience_summary: string | null
        }
        Insert: {
          act_score?: number | null
          ambition_statement?: string | null
          campus_size?:
            | Database["public"]["Enums"]["campus_size_preference"]
            | null
          commitment_level?: string | null
          desired_location_type?:
            | Database["public"]["Enums"]["location_type"]
            | null
          epq_subject?: string | null
          epq_title?: string | null
          extracurricular_interests?: string[] | null
          intl_experience?: string[] | null
          key_activities?: string[] | null
          leadership_roles?: string[] | null
          other_extracurriculars?: string | null
          profile_id: string
          sat_score?: number | null
          teaching_style?: Database["public"]["Enums"]["teaching_style"] | null
          updated_at?: string
          work_experience?: boolean | null
          work_experience_summary?: string | null
        }
        Update: {
          act_score?: number | null
          ambition_statement?: string | null
          campus_size?:
            | Database["public"]["Enums"]["campus_size_preference"]
            | null
          commitment_level?: string | null
          desired_location_type?:
            | Database["public"]["Enums"]["location_type"]
            | null
          epq_subject?: string | null
          epq_title?: string | null
          extracurricular_interests?: string[] | null
          intl_experience?: string[] | null
          key_activities?: string[] | null
          leadership_roles?: string[] | null
          other_extracurriculars?: string | null
          profile_id?: string
          sat_score?: number | null
          teaching_style?: Database["public"]["Enums"]["teaching_style"] | null
          updated_at?: string
          work_experience?: boolean | null
          work_experience_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_lifestyle_preference_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_matches: {
        Row: {
          breakdown: Json | null
          created_at: string
          id: string
          profile_id: string
          program_id: string
          score: number | null
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string
          id?: string
          profile_id: string
          program_id: string
          score?: number | null
        }
        Update: {
          breakdown?: Json | null
          created_at?: string
          id?: string
          profile_id?: string
          program_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_matches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_matches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "student_matches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "course_scoring_v1"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "student_matches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      student_personal_information: {
        Row: {
          age: number | null
          current_location_city: string | null
          email: string | null
          first_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          last_name: string | null
          nationality: string | null
          phone: string | null
          profile_id: string
          resident_country: string | null
          time_zone: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          current_location_city?: string | null
          email?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          last_name?: string | null
          nationality?: string | null
          phone?: string | null
          profile_id: string
          resident_country?: string | null
          time_zone?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          current_location_city?: string | null
          email?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          last_name?: string | null
          nationality?: string | null
          phone?: string | null
          profile_id?: string
          resident_country?: string | null
          time_zone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_personal_information_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_scores: {
        Row: {
          breakdown: Json | null
          eligibility_flags: string[] | null
          profile_id: string
          readiness_flags: string[] | null
          student_band: string | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          breakdown?: Json | null
          eligibility_flags?: string[] | null
          profile_id: string
          readiness_flags?: string[] | null
          student_band?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          breakdown?: Json | null
          eligibility_flags?: string[] | null
          profile_id?: string
          readiness_flags?: string[] | null
          student_band?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_scores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subjects: {
        Row: {
          created_at: string
          grade_value: string | null
          id: string
          level: Database["public"]["Enums"]["subject_level"] | null
          profile_id: string
          subject_name: string | null
        }
        Insert: {
          created_at?: string
          grade_value?: string | null
          id?: string
          level?: Database["public"]["Enums"]["subject_level"] | null
          profile_id: string
          subject_name?: string | null
        }
        Update: {
          created_at?: string
          grade_value?: string | null
          id?: string
          level?: Database["public"]["Enums"]["subject_level"] | null
          profile_id?: string
          subject_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_subjects_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          acceptance_rate: number | null
          acceptance_rate_pct: number | null
          average_rent_outside_campus_gbp_per_month_override: number | null
          average_starting_salary_gbp: number | null
          city: string | null
          city_id: string | null
          city_life: string | null
          climate: string | null
          cost_of_life_override:
            | Database["public"]["Enums"]["cost_of_life_enum"]
            | null
          country: string
          created_at: string
          cultural_social_environment: string | null
          currency: string | null
          graduate_employment_rate_pct: number | null
          guardian_rank: number | null
          id: string
          international_students_ratio_pct: number | null
          intl_tuition_high: number | null
          intl_tuition_low: number | null
          metadata: Json | null
          name: string
          nss_score_pct: number | null
          number_of_students: number | null
          qs_uk_rank: number | null
          rank_overall: number | null
          rank_source: string | null
          recognition_score: number | null
          region: string | null
          requires_test: boolean | null
          safety_index: string | null
          student_dorm_cost_gbp_per_year: number | null
          student_to_staff_ratio: number | null
          times_sunday_rank: number | null
          transport_accessibility: string | null
          university_life: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          acceptance_rate?: number | null
          acceptance_rate_pct?: number | null
          average_rent_outside_campus_gbp_per_month_override?: number | null
          average_starting_salary_gbp?: number | null
          city?: string | null
          city_id?: string | null
          city_life?: string | null
          climate?: string | null
          cost_of_life_override?:
            | Database["public"]["Enums"]["cost_of_life_enum"]
            | null
          country: string
          created_at?: string
          cultural_social_environment?: string | null
          currency?: string | null
          graduate_employment_rate_pct?: number | null
          guardian_rank?: number | null
          id?: string
          international_students_ratio_pct?: number | null
          intl_tuition_high?: number | null
          intl_tuition_low?: number | null
          metadata?: Json | null
          name: string
          nss_score_pct?: number | null
          number_of_students?: number | null
          qs_uk_rank?: number | null
          rank_overall?: number | null
          rank_source?: string | null
          recognition_score?: number | null
          region?: string | null
          requires_test?: boolean | null
          safety_index?: string | null
          student_dorm_cost_gbp_per_year?: number | null
          student_to_staff_ratio?: number | null
          times_sunday_rank?: number | null
          transport_accessibility?: string | null
          university_life?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          acceptance_rate?: number | null
          acceptance_rate_pct?: number | null
          average_rent_outside_campus_gbp_per_month_override?: number | null
          average_starting_salary_gbp?: number | null
          city?: string | null
          city_id?: string | null
          city_life?: string | null
          climate?: string | null
          cost_of_life_override?:
            | Database["public"]["Enums"]["cost_of_life_enum"]
            | null
          country?: string
          created_at?: string
          cultural_social_environment?: string | null
          currency?: string | null
          graduate_employment_rate_pct?: number | null
          guardian_rank?: number | null
          id?: string
          international_students_ratio_pct?: number | null
          intl_tuition_high?: number | null
          intl_tuition_low?: number | null
          metadata?: Json | null
          name?: string
          nss_score_pct?: number | null
          number_of_students?: number | null
          qs_uk_rank?: number | null
          rank_overall?: number | null
          rank_source?: string | null
          recognition_score?: number | null
          region?: string | null
          requires_test?: boolean | null
          safety_index?: string | null
          student_dorm_cost_gbp_per_year?: number | null
          student_to_staff_ratio?: number | null
          times_sunday_rank?: number | null
          transport_accessibility?: string | null
          university_life?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "universities_v2_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      course_scoring_v1: {
        Row: {
          a_level_min_numeric: number | null
          acceptance_rate_pct: number | null
          admission_test: string | null
          average_rent_outside_campus_gbp_per_month: number | null
          average_starting_salary_gbp: number | null
          city: string | null
          city_life: string | null
          climate: string | null
          cost_of_life: Database["public"]["Enums"]["cost_of_life_enum"] | null
          course: string | null
          course_id: string | null
          course_online_page: string | null
          course_selectivity_score: number | null
          course_tier: number | null
          cultural_social_environment: string | null
          degree_type: string | null
          duration: string | null
          english_score_requirement: string | null
          field_of_study: string | null
          gender_ratio_pct: number | null
          graduate_employment_rate_pct: number | null
          intake_size: number | null
          international_students_ratio_pct: number | null
          interview: string | null
          level: string | null
          min_a_level_score: string | null
          min_ib_score: number | null
          nss_score_pct: number | null
          number_of_students: number | null
          placement_year: boolean | null
          placement_year_detail: string | null
          preferred_subjects: string | null
          program_currency: string | null
          program_id: string | null
          program_language: string | null
          program_mode: string | null
          program_tuition: number | null
          program_url: string | null
          safety_index: string | null
          student_dorm_cost_gbp_per_year: number | null
          student_to_staff_ratio: number | null
          study_abroad_option: string | null
          top_industries: string | null
          total_course_score: number | null
          transport_accessibility: string | null
          ucas_code: string | null
          ucas_deadline: string | null
          university: string | null
          university_country: string | null
          university_id: string | null
          university_life: string | null
          university_rank_overall: number | null
          university_rank_source: string | null
          university_requires_test: boolean | null
          university_score: number | null
          yearly_international_tuition_fee_gbp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_v2_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_role: { Args: never; Returns: string }
      can_act_as_counsellor: { Args: never; Returns: boolean }
      counsellor_notification_targets: { Args: never; Returns: string[] }
      is_counsellor: { Args: never; Returns: boolean }
      is_demo_account: { Args: never; Returns: boolean }
      profile_display_name: {
        Args: { p_fallback: string; p_profile_id: string }
        Returns: string
      }
      safe_int: { Args: { input: string; max_len?: number }; Returns: number }
      search_filter_options: { Args: never; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      admissions_status: "taken" | "booked" | "missing"
      admissions_test_type:
        | "LNAT"
        | "UCAT"
        | "TMUA"
        | "MAT"
        | "STEP"
        | "ESAT"
        | "TSA"
        | "NONE"
      application_status:
        | "planning"
        | "in_progress"
        | "submitted"
        | "decision"
        | "enrolled"
      application_task_category:
        | "test"
        | "essay"
        | "reference"
        | "visa"
        | "finance"
        | "portal"
      campus_size_preference: "small" | "medium" | "large" | "no_preference"
      campus_type: "urban" | "suburban" | "rural" | "online"
      checklist_status: "todo" | "doing" | "done"
      cost_of_life_enum: "HIGH" | "MEDIUM" | "LOW"
      delivery_type: "in_person" | "online" | "hybrid"
      english_status:
        | "met"
        | "exceeds"
        | "exceptional"
        | "booked"
        | "missing"
        | "failed"
      english_test_type: "IELTS" | "TOEFL" | "DUOLINGO" | "WAIVER" | "NONE"
      gender_type: "female" | "male" | "non_binary" | "prefer_not_to_say"
      ib_grade: "A" | "B" | "C" | "D" | "E"
      ib_math_pathway: "AA_HL" | "AA_SL" | "AI_HL" | "AI_SL"
      intended_cluster:
        | "computer_science"
        | "maths"
        | "engineering"
        | "life_sciences_biochem"
        | "medicine_dentistry"
        | "economics_quant"
        | "business_non_quant"
        | "law"
        | "humanities"
        | "creative"
      language_of_instruction: "english" | "bilingual" | "non_english"
      location_type:
        | "london"
        | "major_city"
        | "smaller_city"
        | "suburban"
        | "no_preference"
      programme_type: "IB" | "A_LEVEL"
      school_type:
        | "international_school"
        | "local_private"
        | "state_public"
        | "boarding"
        | "other"
      setting_type: "public" | "private" | "international" | "other"
      size_type: "small" | "medium" | "large" | "mega"
      source_health: "ok" | "stale" | "error"
      subject_level: "HL" | "SL" | "A_LEVEL"
      teaching_style: "academic" | "practical" | "mixed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      admissions_status: ["taken", "booked", "missing"],
      admissions_test_type: [
        "LNAT",
        "UCAT",
        "TMUA",
        "MAT",
        "STEP",
        "ESAT",
        "TSA",
        "NONE",
      ],
      application_status: [
        "planning",
        "in_progress",
        "submitted",
        "decision",
        "enrolled",
      ],
      application_task_category: [
        "test",
        "essay",
        "reference",
        "visa",
        "finance",
        "portal",
      ],
      campus_size_preference: ["small", "medium", "large", "no_preference"],
      campus_type: ["urban", "suburban", "rural", "online"],
      checklist_status: ["todo", "doing", "done"],
      cost_of_life_enum: ["HIGH", "MEDIUM", "LOW"],
      delivery_type: ["in_person", "online", "hybrid"],
      english_status: [
        "met",
        "exceeds",
        "exceptional",
        "booked",
        "missing",
        "failed",
      ],
      english_test_type: ["IELTS", "TOEFL", "DUOLINGO", "WAIVER", "NONE"],
      gender_type: ["female", "male", "non_binary", "prefer_not_to_say"],
      ib_grade: ["A", "B", "C", "D", "E"],
      ib_math_pathway: ["AA_HL", "AA_SL", "AI_HL", "AI_SL"],
      intended_cluster: [
        "computer_science",
        "maths",
        "engineering",
        "life_sciences_biochem",
        "medicine_dentistry",
        "economics_quant",
        "business_non_quant",
        "law",
        "humanities",
        "creative",
      ],
      language_of_instruction: ["english", "bilingual", "non_english"],
      location_type: [
        "london",
        "major_city",
        "smaller_city",
        "suburban",
        "no_preference",
      ],
      programme_type: ["IB", "A_LEVEL"],
      school_type: [
        "international_school",
        "local_private",
        "state_public",
        "boarding",
        "other",
      ],
      setting_type: ["public", "private", "international", "other"],
      size_type: ["small", "medium", "large", "mega"],
      source_health: ["ok", "stale", "error"],
      subject_level: ["HL", "SL", "A_LEVEL"],
      teaching_style: ["academic", "practical", "mixed"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

