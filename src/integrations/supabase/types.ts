export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_lockouts: {
        Row: {
          failed_attempts: number;
          last_failed_at: string | null;
          locked_until: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          failed_attempts?: number;
          last_failed_at?: string | null;
          locked_until?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          failed_attempts?: number;
          last_failed_at?: string | null;
          locked_until?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      activities: {
        Row: {
          actor_id: string | null;
          created_at: string;
          data: Json;
          id: string;
          object_id: string | null;
          object_type: string;
          organization_id: string | null;
          summary: string | null;
          target_id: string | null;
          target_type: string | null;
          verb: string;
          workspace_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          object_id?: string | null;
          object_type: string;
          organization_id?: string | null;
          summary?: string | null;
          target_id?: string | null;
          target_type?: string | null;
          verb: string;
          workspace_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          object_id?: string | null;
          object_type?: string;
          organization_id?: string | null;
          summary?: string | null;
          target_id?: string | null;
          target_type?: string | null;
          verb?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      addresses: {
        Row: {
          address_type: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          is_primary: boolean;
          label: string | null;
          latitude: number | null;
          longitude: number | null;
          postal_code: string | null;
          region: string | null;
          street1: string | null;
          street2: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          address_type?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          is_primary?: boolean;
          label?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          postal_code?: string | null;
          region?: string | null;
          street1?: string | null;
          street2?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          address_type?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          is_primary?: boolean;
          label?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          postal_code?: string | null;
          region?: string | null;
          street1?: string | null;
          street2?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "addresses_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_availability: {
        Row: {
          auto_away_minutes: number;
          created_at: string;
          current_load: number;
          departments: string[];
          id: string;
          languages: string[];
          last_active_at: string;
          last_assigned_at: string | null;
          max_concurrent: number;
          presence: Database["public"]["Enums"]["agent_presence"];
          skills: string[];
          status_message: string | null;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          auto_away_minutes?: number;
          created_at?: string;
          current_load?: number;
          departments?: string[];
          id?: string;
          languages?: string[];
          last_active_at?: string;
          last_assigned_at?: string | null;
          max_concurrent?: number;
          presence?: Database["public"]["Enums"]["agent_presence"];
          skills?: string[];
          status_message?: string | null;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          auto_away_minutes?: number;
          created_at?: string;
          current_load?: number;
          departments?: string[];
          id?: string;
          languages?: string[];
          last_active_at?: string;
          last_assigned_at?: string | null;
          max_concurrent?: number;
          presence?: Database["public"]["Enums"]["agent_presence"];
          skills?: string[];
          status_message?: string | null;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_availability_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_skills: {
        Row: {
          created_at: string;
          current_load: number | null;
          handles_vip: boolean | null;
          id: string;
          is_available: boolean | null;
          languages: string[] | null;
          max_concurrent: number | null;
          skills: string[] | null;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          current_load?: number | null;
          handles_vip?: boolean | null;
          id?: string;
          is_available?: boolean | null;
          languages?: string[] | null;
          max_concurrent?: number | null;
          skills?: string[] | null;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          current_load?: number | null;
          handles_vip?: boolean | null;
          id?: string;
          is_available?: boolean | null;
          languages?: string[] | null;
          max_concurrent?: number | null;
          skills?: string[] | null;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ai_audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          changes: Json | null;
          created_at: string;
          id: string;
          metadata: Json | null;
          target: string | null;
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          target?: string | null;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          target?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ai_automation_config: {
        Row: {
          auto_apply_threshold: number | null;
          automation_type: Database["public"]["Enums"]["ai_automation_type"];
          config: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          require_confirmation: boolean;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        Insert: {
          auto_apply_threshold?: number | null;
          automation_type: Database["public"]["Enums"]["ai_automation_type"];
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          require_confirmation?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          auto_apply_threshold?: number | null;
          automation_type?: Database["public"]["Enums"]["ai_automation_type"];
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          require_confirmation?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ai_automation_suggestions: {
        Row: {
          applied_at: string | null;
          applied_result: Json | null;
          automation_type: Database["public"]["Enums"]["ai_automation_type"];
          confidence: number | null;
          created_at: string;
          created_by_ai: boolean;
          entity_id: string | null;
          entity_type: string;
          error_message: string | null;
          expires_at: string | null;
          id: string;
          model: string | null;
          payload: Json;
          rationale: string | null;
          requires_confirmation: boolean;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["ai_suggestion_status"];
          suggested_by: string | null;
          summary: string | null;
          title: string;
          tokens_used: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          applied_at?: string | null;
          applied_result?: Json | null;
          automation_type: Database["public"]["Enums"]["ai_automation_type"];
          confidence?: number | null;
          created_at?: string;
          created_by_ai?: boolean;
          entity_id?: string | null;
          entity_type: string;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          model?: string | null;
          payload?: Json;
          rationale?: string | null;
          requires_confirmation?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["ai_suggestion_status"];
          suggested_by?: string | null;
          summary?: string | null;
          title: string;
          tokens_used?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          applied_at?: string | null;
          applied_result?: Json | null;
          automation_type?: Database["public"]["Enums"]["ai_automation_type"];
          confidence?: number | null;
          created_at?: string;
          created_by_ai?: boolean;
          entity_id?: string | null;
          entity_type?: string;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          model?: string | null;
          payload?: Json;
          rationale?: string | null;
          requires_confirmation?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["ai_suggestion_status"];
          suggested_by?: string | null;
          summary?: string | null;
          title?: string;
          tokens_used?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ai_conversation_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          detected_language: string | null;
          id: string;
          language: string | null;
          latency_ms: number | null;
          metadata: Json;
          model: string | null;
          provider: string | null;
          role: string;
          status: string;
          tokens_in: number | null;
          tokens_out: number | null;
          tool_calls: Json | null;
          workspace_id: string;
        };
        Insert: {
          content?: string;
          conversation_id: string;
          created_at?: string;
          detected_language?: string | null;
          id?: string;
          language?: string | null;
          latency_ms?: number | null;
          metadata?: Json;
          model?: string | null;
          provider?: string | null;
          role: string;
          status?: string;
          tokens_in?: number | null;
          tokens_out?: number | null;
          tool_calls?: Json | null;
          workspace_id: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          detected_language?: string | null;
          id?: string;
          language?: string | null;
          latency_ms?: number | null;
          metadata?: Json;
          model?: string | null;
          provider?: string | null;
          role?: string;
          status?: string;
          tokens_in?: number | null;
          tokens_out?: number | null;
          tool_calls?: Json | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversation_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_conversation_messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversations: {
        Row: {
          config: Json;
          created_at: string;
          customer_id: string | null;
          id: string;
          last_message_at: string | null;
          message_count: number;
          metadata: Json;
          status: string;
          title: string;
          updated_at: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          message_count?: number;
          metadata?: Json;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          message_count?: number;
          metadata?: Json;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_feature_config: {
        Row: {
          config: Json;
          enabled: boolean;
          fallback_provider_ids: string[];
          feature: string;
          id: string;
          max_tokens: number | null;
          model: string | null;
          provider_id: string | null;
          system_prompt: string | null;
          temperature: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          enabled?: boolean;
          fallback_provider_ids?: string[];
          feature: string;
          id?: string;
          max_tokens?: number | null;
          model?: string | null;
          provider_id?: string | null;
          system_prompt?: string | null;
          temperature?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          enabled?: boolean;
          fallback_provider_ids?: string[];
          feature?: string;
          id?: string;
          max_tokens?: number | null;
          model?: string | null;
          provider_id?: string | null;
          system_prompt?: string | null;
          temperature?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_feature_config_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "ai_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_feature_config_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_models: {
        Row: {
          capabilities: Json;
          context_window: number | null;
          created_at: string;
          display_name: string;
          enabled: boolean;
          id: string;
          input_cost_per_1k: number | null;
          is_default: boolean;
          max_output_tokens: number | null;
          model_id: string;
          output_cost_per_1k: number | null;
          provider_id: string;
          sort_order: number;
        };
        Insert: {
          capabilities?: Json;
          context_window?: number | null;
          created_at?: string;
          display_name: string;
          enabled?: boolean;
          id?: string;
          input_cost_per_1k?: number | null;
          is_default?: boolean;
          max_output_tokens?: number | null;
          model_id: string;
          output_cost_per_1k?: number | null;
          provider_id: string;
          sort_order?: number;
        };
        Update: {
          capabilities?: Json;
          context_window?: number | null;
          created_at?: string;
          display_name?: string;
          enabled?: boolean;
          id?: string;
          input_cost_per_1k?: number | null;
          is_default?: boolean;
          max_output_tokens?: number | null;
          model_id?: string;
          output_cost_per_1k?: number | null;
          provider_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "ai_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_prompt_settings: {
        Row: {
          default_language: string | null;
          default_length: string;
          default_model: string;
          default_tone: string;
          fallback_message: string;
          org_prompt: string | null;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
          workspace_prompt: string | null;
        };
        Insert: {
          default_language?: string | null;
          default_length?: string;
          default_model?: string;
          default_tone?: string;
          fallback_message?: string;
          org_prompt?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
          workspace_prompt?: string | null;
        };
        Update: {
          default_language?: string | null;
          default_length?: string;
          default_model?: string;
          default_tone?: string;
          fallback_message?: string;
          org_prompt?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
          workspace_prompt?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_prompt_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_prompts: {
        Row: {
          category: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          key: string;
          name: string;
          system_prompt: string | null;
          template: string;
          updated_at: string;
          variables: string[];
          version: number;
          workspace_id: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          name: string;
          system_prompt?: string | null;
          template: string;
          updated_at?: string;
          variables?: string[];
          version?: number;
          workspace_id: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          name?: string;
          system_prompt?: string | null;
          template?: string;
          updated_at?: string;
          variables?: string[];
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_prompts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_provider_health: {
        Row: {
          consecutive_failures: number;
          last_check_at: string | null;
          last_error: string | null;
          last_success_at: string | null;
          latency_ms: number | null;
          provider_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          consecutive_failures?: number;
          last_check_at?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          latency_ms?: number | null;
          provider_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          consecutive_failures?: number;
          last_check_at?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          latency_ms?: number | null;
          provider_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_provider_health_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: true;
            referencedRelation: "ai_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_providers: {
        Row: {
          api_key_secret_name: string | null;
          api_key_last4: string | null;
          base_url: string | null;
          config: Json;
          credential_source: string;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          id: string;
          is_default: boolean;
          kind: Database["public"]["Enums"]["ai_provider_kind"];
          name: string;
          organization_id: string | null;
          priority: number;
          updated_at: string;
          vault_secret_id: string | null;
          workspace_id: string;
        };
        Insert: {
          api_key_secret_name?: string | null;
          api_key_last4?: string | null;
          base_url?: string | null;
          config?: Json;
          credential_source?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          is_default?: boolean;
          kind: Database["public"]["Enums"]["ai_provider_kind"];
          name: string;
          organization_id?: string | null;
          priority?: number;
          updated_at?: string;
          vault_secret_id?: string | null;
          workspace_id: string;
        };
        Update: {
          api_key_secret_name?: string | null;
          api_key_last4?: string | null;
          base_url?: string | null;
          config?: Json;
          credential_source?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          is_default?: boolean;
          kind?: Database["public"]["Enums"]["ai_provider_kind"];
          name?: string;
          organization_id?: string | null;
          priority?: number;
          updated_at?: string;
          vault_secret_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_providers_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_request_logs: {
        Row: {
          completion_tokens: number | null;
          cost_usd: number | null;
          created_at: string;
          error_message: string | null;
          error_type: string | null;
          feature: string | null;
          http_status: number | null;
          id: string;
          latency_ms: number | null;
          metadata: Json;
          model: string | null;
          operation: Database["public"]["Enums"]["ai_operation"];
          prompt_tokens: number | null;
          provider_id: string | null;
          provider_kind: Database["public"]["Enums"]["ai_provider_kind"] | null;
          request_preview: Json | null;
          response_preview: Json | null;
          status: Database["public"]["Enums"]["ai_request_status"];
          total_tokens: number | null;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          completion_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          error_message?: string | null;
          error_type?: string | null;
          feature?: string | null;
          http_status?: number | null;
          id?: string;
          latency_ms?: number | null;
          metadata?: Json;
          model?: string | null;
          operation?: Database["public"]["Enums"]["ai_operation"];
          prompt_tokens?: number | null;
          provider_id?: string | null;
          provider_kind?: Database["public"]["Enums"]["ai_provider_kind"] | null;
          request_preview?: Json | null;
          response_preview?: Json | null;
          status: Database["public"]["Enums"]["ai_request_status"];
          total_tokens?: number | null;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          completion_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          error_message?: string | null;
          error_type?: string | null;
          feature?: string | null;
          http_status?: number | null;
          id?: string;
          latency_ms?: number | null;
          metadata?: Json;
          model?: string | null;
          operation?: Database["public"]["Enums"]["ai_operation"];
          prompt_tokens?: number | null;
          provider_id?: string | null;
          provider_kind?: Database["public"]["Enums"]["ai_provider_kind"] | null;
          request_preview?: Json | null;
          response_preview?: Json | null;
          status?: Database["public"]["Enums"]["ai_request_status"];
          total_tokens?: number | null;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_request_logs_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "ai_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_settings: {
        Row: {
          allowed_roles: string[];
          audit_enabled: boolean;
          config: Json;
          created_at: string;
          daily_request_limit: number | null;
          daily_token_limit: number | null;
          default_model: string | null;
          default_provider_id: string | null;
          log_prompts: boolean;
          log_responses: boolean;
          max_tokens: number;
          moderation_blocklist: string[];
          moderation_categories: string[];
          moderation_enabled: boolean;
          monthly_cost_limit_usd: number | null;
          monthly_request_limit: number | null;
          monthly_token_limit: number | null;
          organization_prompt: string | null;
          per_user_daily_limit: number | null;
          redact_pii: boolean;
          retention_days: number;
          system_prompt: string | null;
          temperature: number;
          training_opt_out: boolean;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
          workspace_prompt: string | null;
        };
        Insert: {
          allowed_roles?: string[];
          audit_enabled?: boolean;
          config?: Json;
          created_at?: string;
          daily_request_limit?: number | null;
          daily_token_limit?: number | null;
          default_model?: string | null;
          default_provider_id?: string | null;
          log_prompts?: boolean;
          log_responses?: boolean;
          max_tokens?: number;
          moderation_blocklist?: string[];
          moderation_categories?: string[];
          moderation_enabled?: boolean;
          monthly_cost_limit_usd?: number | null;
          monthly_request_limit?: number | null;
          monthly_token_limit?: number | null;
          organization_prompt?: string | null;
          per_user_daily_limit?: number | null;
          redact_pii?: boolean;
          retention_days?: number;
          system_prompt?: string | null;
          temperature?: number;
          training_opt_out?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
          workspace_prompt?: string | null;
        };
        Update: {
          allowed_roles?: string[];
          audit_enabled?: boolean;
          config?: Json;
          created_at?: string;
          daily_request_limit?: number | null;
          daily_token_limit?: number | null;
          default_model?: string | null;
          default_provider_id?: string | null;
          log_prompts?: boolean;
          log_responses?: boolean;
          max_tokens?: number;
          moderation_blocklist?: string[];
          moderation_categories?: string[];
          moderation_enabled?: boolean;
          monthly_cost_limit_usd?: number | null;
          monthly_request_limit?: number | null;
          monthly_token_limit?: number | null;
          organization_prompt?: string | null;
          per_user_daily_limit?: number | null;
          redact_pii?: boolean;
          retention_days?: number;
          system_prompt?: string | null;
          temperature?: number;
          training_opt_out?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
          workspace_prompt?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_settings_default_provider_id_fkey";
            columns: ["default_provider_id"];
            isOneToOne: false;
            referencedRelation: "ai_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_tool_executions: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          id: string;
          input: Json;
          output: Json | null;
          success: boolean;
          tool_name: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          input?: Json;
          output?: Json | null;
          success?: boolean;
          tool_name: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          input?: Json;
          output?: Json | null;
          success?: boolean;
          tool_name?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ai_usage_daily: {
        Row: {
          completion_tokens: number;
          cost_usd: number;
          day: string;
          errors: number;
          model: string;
          prompt_tokens: number;
          provider_id: string;
          requests: number;
          total_tokens: number;
          workspace_id: string;
        };
        Insert: {
          completion_tokens?: number;
          cost_usd?: number;
          day: string;
          errors?: number;
          model?: string;
          prompt_tokens?: number;
          provider_id: string;
          requests?: number;
          total_tokens?: number;
          workspace_id: string;
        };
        Update: {
          completion_tokens?: number;
          cost_usd?: number;
          day?: string;
          errors?: number;
          model?: string;
          prompt_tokens?: number;
          provider_id?: string;
          requests?: number;
          total_tokens?: number;
          workspace_id?: string;
        };
        Relationships: [];
      };
      api_gateway_logs: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          error: string | null;
          id: string;
          ip: unknown;
          latency_ms: number | null;
          method: string;
          organization_id: string | null;
          path: string;
          status_code: number | null;
          user_agent: string | null;
          version: string;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          ip?: unknown;
          latency_ms?: number | null;
          method: string;
          organization_id?: string | null;
          path: string;
          status_code?: number | null;
          user_agent?: string | null;
          version?: string;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          ip?: unknown;
          latency_ms?: number | null;
          method?: string;
          organization_id?: string | null;
          path?: string;
          status_code?: number | null;
          user_agent?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_gateway_logs_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          expires_at: string | null;
          hashed_key: string;
          id: string;
          ip_allowlist: string[] | null;
          last_used_at: string | null;
          name: string;
          organization_id: string;
          prefix: string;
          revoked_at: string | null;
          rotated_from: string | null;
          scopes: string[];
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          expires_at?: string | null;
          hashed_key: string;
          id?: string;
          ip_allowlist?: string[] | null;
          last_used_at?: string | null;
          name: string;
          organization_id: string;
          prefix: string;
          revoked_at?: string | null;
          rotated_from?: string | null;
          scopes?: string[];
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          expires_at?: string | null;
          hashed_key?: string;
          id?: string;
          ip_allowlist?: string[] | null;
          last_used_at?: string | null;
          name?: string;
          organization_id?: string;
          prefix?: string;
          revoked_at?: string | null;
          rotated_from?: string | null;
          scopes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_keys_rotated_from_fkey";
            columns: ["rotated_from"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      assignment_rules: {
        Row: {
          created_at: string;
          id: string;
          inbox_id: string | null;
          is_active: boolean;
          max_open_per_agent: number | null;
          priority: number | null;
          queue_id: string | null;
          required_languages: string[] | null;
          required_skills: string[] | null;
          round_robin_cursor: number;
          strategy: string;
          updated_at: string;
          vip_only: boolean | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          inbox_id?: string | null;
          is_active?: boolean;
          max_open_per_agent?: number | null;
          priority?: number | null;
          queue_id?: string | null;
          required_languages?: string[] | null;
          required_skills?: string[] | null;
          round_robin_cursor?: number;
          strategy?: string;
          updated_at?: string;
          vip_only?: boolean | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          inbox_id?: string | null;
          is_active?: boolean;
          max_open_per_agent?: number | null;
          priority?: number | null;
          queue_id?: string | null;
          required_languages?: string[] | null;
          required_skills?: string[] | null;
          round_robin_cursor?: number;
          strategy?: string;
          updated_at?: string;
          vip_only?: boolean | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignment_rules_inbox_id_fkey";
            columns: ["inbox_id"];
            isOneToOne: false;
            referencedRelation: "inboxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignment_rules_queue_id_fkey";
            columns: ["queue_id"];
            isOneToOne: false;
            referencedRelation: "support_queues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignment_rules_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          attached_by: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          file_id: string;
          id: string;
          workspace_id: string;
        };
        Insert: {
          attached_by?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          file_id: string;
          id?: string;
          workspace_id: string;
        };
        Update: {
          attached_by?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          file_id?: string;
          id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_id: string | null;
          changes: Json | null;
          created_at: string;
          id: string;
          ip_address: unknown;
          metadata: Json;
          organization_id: string | null;
          resource_id: string | null;
          resource_type: string;
          user_agent: string | null;
          workspace_id: string | null;
        };
        Insert: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          organization_id?: string | null;
          resource_id?: string | null;
          resource_type: string;
          user_agent?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["audit_action"];
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          organization_id?: string | null;
          resource_id?: string | null;
          resource_type?: string;
          user_agent?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      automations: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          graph: Json;
          id: string;
          last_run_at: string | null;
          last_run_status: string | null;
          name: string;
          runs_count: number;
          status: Database["public"]["Enums"]["automation_status"];
          steps: Json;
          trigger_config: Json;
          trigger_type: string;
          updated_at: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          graph?: Json;
          id?: string;
          last_run_at?: string | null;
          last_run_status?: string | null;
          name: string;
          runs_count?: number;
          status?: Database["public"]["Enums"]["automation_status"];
          steps?: Json;
          trigger_config?: Json;
          trigger_type: string;
          updated_at?: string;
          version?: number;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          graph?: Json;
          id?: string;
          last_run_at?: string | null;
          last_run_status?: string | null;
          name?: string;
          runs_count?: number;
          status?: Database["public"]["Enums"]["automation_status"];
          steps?: Json;
          trigger_config?: Json;
          trigger_type?: string;
          updated_at?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      backup_jobs: {
        Row: {
          backup_type: Database["public"]["Enums"]["backup_type"];
          checksum: string | null;
          completed_at: string | null;
          compressed_size_bytes: number;
          created_at: string;
          created_by: string | null;
          destination: Database["public"]["Enums"]["backup_destination"];
          destination_config: Json;
          duration_ms: number | null;
          encryption_algorithm: string;
          encryption_key_id: string | null;
          error: string | null;
          id: string;
          is_encrypted: boolean;
          manifest: Json;
          metadata: Json;
          parent_backup_id: string | null;
          point_in_time: string | null;
          restore_point_lsn: string | null;
          schedule_id: string | null;
          scope: Database["public"]["Enums"]["backup_scope"];
          size_bytes: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["backup_status"];
          storage_path: string | null;
          trigger: string;
          updated_at: string;
          verification_details: Json;
          verified: boolean;
          verified_at: string | null;
          workspace_id: string;
        };
        Insert: {
          backup_type?: Database["public"]["Enums"]["backup_type"];
          checksum?: string | null;
          completed_at?: string | null;
          compressed_size_bytes?: number;
          created_at?: string;
          created_by?: string | null;
          destination?: Database["public"]["Enums"]["backup_destination"];
          destination_config?: Json;
          duration_ms?: number | null;
          encryption_algorithm?: string;
          encryption_key_id?: string | null;
          error?: string | null;
          id?: string;
          is_encrypted?: boolean;
          manifest?: Json;
          metadata?: Json;
          parent_backup_id?: string | null;
          point_in_time?: string | null;
          restore_point_lsn?: string | null;
          schedule_id?: string | null;
          scope?: Database["public"]["Enums"]["backup_scope"];
          size_bytes?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["backup_status"];
          storage_path?: string | null;
          trigger?: string;
          updated_at?: string;
          verification_details?: Json;
          verified?: boolean;
          verified_at?: string | null;
          workspace_id: string;
        };
        Update: {
          backup_type?: Database["public"]["Enums"]["backup_type"];
          checksum?: string | null;
          completed_at?: string | null;
          compressed_size_bytes?: number;
          created_at?: string;
          created_by?: string | null;
          destination?: Database["public"]["Enums"]["backup_destination"];
          destination_config?: Json;
          duration_ms?: number | null;
          encryption_algorithm?: string;
          encryption_key_id?: string | null;
          error?: string | null;
          id?: string;
          is_encrypted?: boolean;
          manifest?: Json;
          metadata?: Json;
          parent_backup_id?: string | null;
          point_in_time?: string | null;
          restore_point_lsn?: string | null;
          schedule_id?: string | null;
          scope?: Database["public"]["Enums"]["backup_scope"];
          size_bytes?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["backup_status"];
          storage_path?: string | null;
          trigger?: string;
          updated_at?: string;
          verification_details?: Json;
          verified?: boolean;
          verified_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "backup_jobs_parent_backup_id_fkey";
            columns: ["parent_backup_id"];
            isOneToOne: false;
            referencedRelation: "backup_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      backup_notifications: {
        Row: {
          backup_id: string | null;
          body: string | null;
          created_at: string;
          data: Json;
          id: string;
          is_read: boolean;
          schedule_id: string | null;
          severity: string;
          title: string;
          workspace_id: string;
        };
        Insert: {
          backup_id?: string | null;
          body?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          is_read?: boolean;
          schedule_id?: string | null;
          severity?: string;
          title: string;
          workspace_id: string;
        };
        Update: {
          backup_id?: string | null;
          body?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          is_read?: boolean;
          schedule_id?: string | null;
          severity?: string;
          title?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "backup_notifications_backup_id_fkey";
            columns: ["backup_id"];
            isOneToOne: false;
            referencedRelation: "backup_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "backup_notifications_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "backup_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      backup_restore_operations: {
        Row: {
          affected_tables: string[];
          backup_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          id: string;
          point_in_time: string | null;
          preview_summary: Json;
          restore_mode: string;
          restored_rows: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["backup_status"];
          target_workspace_id: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          affected_tables?: string[];
          backup_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          point_in_time?: string | null;
          preview_summary?: Json;
          restore_mode?: string;
          restored_rows?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["backup_status"];
          target_workspace_id?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          affected_tables?: string[];
          backup_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          point_in_time?: string | null;
          preview_summary?: Json;
          restore_mode?: string;
          restored_rows?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["backup_status"];
          target_workspace_id?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "backup_restore_operations_backup_id_fkey";
            columns: ["backup_id"];
            isOneToOne: false;
            referencedRelation: "backup_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      backup_schedules: {
        Row: {
          backup_type: Database["public"]["Enums"]["backup_type"];
          created_at: string;
          created_by: string | null;
          cron_expression: string;
          description: string | null;
          destination: Database["public"]["Enums"]["backup_destination"];
          destination_config: Json;
          encryption_key_id: string | null;
          id: string;
          is_active: boolean;
          is_encrypted: boolean;
          keep_last_n: number;
          last_run_at: string | null;
          last_status: Database["public"]["Enums"]["backup_status"] | null;
          name: string;
          next_run_at: string | null;
          notify_emails: string[];
          notify_on_failure: boolean;
          notify_on_success: boolean;
          retention_days: number;
          scope: Database["public"]["Enums"]["backup_scope"];
          timezone: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          backup_type?: Database["public"]["Enums"]["backup_type"];
          created_at?: string;
          created_by?: string | null;
          cron_expression?: string;
          description?: string | null;
          destination?: Database["public"]["Enums"]["backup_destination"];
          destination_config?: Json;
          encryption_key_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_encrypted?: boolean;
          keep_last_n?: number;
          last_run_at?: string | null;
          last_status?: Database["public"]["Enums"]["backup_status"] | null;
          name: string;
          next_run_at?: string | null;
          notify_emails?: string[];
          notify_on_failure?: boolean;
          notify_on_success?: boolean;
          retention_days?: number;
          scope?: Database["public"]["Enums"]["backup_scope"];
          timezone?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          backup_type?: Database["public"]["Enums"]["backup_type"];
          created_at?: string;
          created_by?: string | null;
          cron_expression?: string;
          description?: string | null;
          destination?: Database["public"]["Enums"]["backup_destination"];
          destination_config?: Json;
          encryption_key_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_encrypted?: boolean;
          keep_last_n?: number;
          last_run_at?: string | null;
          last_status?: Database["public"]["Enums"]["backup_status"] | null;
          name?: string;
          next_run_at?: string | null;
          notify_emails?: string[];
          notify_on_failure?: boolean;
          notify_on_success?: boolean;
          retention_days?: number;
          scope?: Database["public"]["Enums"]["backup_scope"];
          timezone?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      bi_calc_queue: {
        Row: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          kind: string;
          last_error: Json | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: Json;
          priority: number;
          run_at: string;
          started_at: string | null;
          status: string;
          target_id: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          kind: string;
          last_error?: Json | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: Json;
          priority?: number;
          run_at?: string;
          started_at?: string | null;
          status?: string;
          target_id?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          last_error?: Json | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: Json;
          priority?: number;
          run_at?: string;
          started_at?: string | null;
          status?: string;
          target_id?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_calc_queue_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_dashboards: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_default: boolean;
          layout: Json;
          name: string;
          tags: string[];
          updated_at: string;
          visibility: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_default?: boolean;
          layout?: Json;
          name: string;
          tags?: string[];
          updated_at?: string;
          visibility?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_default?: boolean;
          layout?: Json;
          name?: string;
          tags?: string[];
          updated_at?: string;
          visibility?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_dashboards_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_forecasts: {
        Row: {
          accuracy: Json | null;
          computed_at: string;
          expires_at: string;
          historical: Json;
          horizon_days: number;
          id: string;
          method: string;
          metric_key: string;
          projection: Json;
          workspace_id: string;
        };
        Insert: {
          accuracy?: Json | null;
          computed_at?: string;
          expires_at?: string;
          historical?: Json;
          horizon_days?: number;
          id?: string;
          method?: string;
          metric_key: string;
          projection?: Json;
          workspace_id: string;
        };
        Update: {
          accuracy?: Json | null;
          computed_at?: string;
          expires_at?: string;
          historical?: Json;
          horizon_days?: number;
          id?: string;
          method?: string;
          metric_key?: string;
          projection?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_forecasts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_kpi_snapshots: {
        Row: {
          computed_at: string;
          delta_pct: number | null;
          granularity: string;
          id: string;
          kpi_id: string;
          meta: Json;
          period_end: string;
          period_start: string;
          previous_value: number | null;
          value: number;
          workspace_id: string;
        };
        Insert: {
          computed_at?: string;
          delta_pct?: number | null;
          granularity?: string;
          id?: string;
          kpi_id: string;
          meta?: Json;
          period_end: string;
          period_start: string;
          previous_value?: number | null;
          value: number;
          workspace_id: string;
        };
        Update: {
          computed_at?: string;
          delta_pct?: number | null;
          granularity?: string;
          id?: string;
          kpi_id?: string;
          meta?: Json;
          period_end?: string;
          period_start?: string;
          previous_value?: number | null;
          value?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_kpi_snapshots_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "bi_kpis";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bi_kpi_snapshots_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_kpis: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          direction: string;
          enabled: boolean;
          formula: Json;
          id: string;
          key: string;
          name: string;
          refresh_interval_s: number;
          target: number | null;
          unit: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          direction?: string;
          enabled?: boolean;
          formula?: Json;
          id?: string;
          key: string;
          name: string;
          refresh_interval_s?: number;
          target?: number | null;
          unit?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          direction?: string;
          enabled?: boolean;
          formula?: Json;
          id?: string;
          key?: string;
          name?: string;
          refresh_interval_s?: number;
          target?: number | null;
          unit?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_kpis_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_metric_cache: {
        Row: {
          computed_at: string;
          expires_at: string;
          hit_count: number;
          id: string;
          metric_key: string;
          params_hash: string;
          value: Json;
          workspace_id: string;
        };
        Insert: {
          computed_at?: string;
          expires_at: string;
          hit_count?: number;
          id?: string;
          metric_key: string;
          params_hash: string;
          value: Json;
          workspace_id: string;
        };
        Update: {
          computed_at?: string;
          expires_at?: string;
          hit_count?: number;
          id?: string;
          metric_key?: string;
          params_hash?: string;
          value?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_metric_cache_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_report_runs: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          duration_ms: number | null;
          error: Json | null;
          finished_at: string | null;
          format: string | null;
          id: string;
          output_url: string | null;
          report_id: string | null;
          row_count: number | null;
          scheduled_id: string | null;
          started_at: string;
          status: string;
          triggered_by: string;
          workspace_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: Json | null;
          finished_at?: string | null;
          format?: string | null;
          id?: string;
          output_url?: string | null;
          report_id?: string | null;
          row_count?: number | null;
          scheduled_id?: string | null;
          started_at?: string;
          status?: string;
          triggered_by?: string;
          workspace_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: Json | null;
          finished_at?: string | null;
          format?: string | null;
          id?: string;
          output_url?: string | null;
          report_id?: string | null;
          row_count?: number | null;
          scheduled_id?: string | null;
          started_at?: string;
          status?: string;
          triggered_by?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_report_runs_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "bi_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bi_report_runs_scheduled_id_fkey";
            columns: ["scheduled_id"];
            isOneToOne: false;
            referencedRelation: "bi_scheduled_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bi_report_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_reports: {
        Row: {
          calculated_fields: Json;
          category: string;
          chart_type: string;
          columns: Json;
          created_at: string;
          created_by: string | null;
          data_source: string;
          date_range: Json;
          description: string | null;
          filters: Json;
          group_by: Json;
          id: string;
          is_favorite: boolean;
          is_template: boolean;
          metrics: Json;
          name: string;
          sort: Json;
          updated_at: string;
          visibility: string;
          workspace_id: string;
        };
        Insert: {
          calculated_fields?: Json;
          category?: string;
          chart_type?: string;
          columns?: Json;
          created_at?: string;
          created_by?: string | null;
          data_source: string;
          date_range?: Json;
          description?: string | null;
          filters?: Json;
          group_by?: Json;
          id?: string;
          is_favorite?: boolean;
          is_template?: boolean;
          metrics?: Json;
          name: string;
          sort?: Json;
          updated_at?: string;
          visibility?: string;
          workspace_id: string;
        };
        Update: {
          calculated_fields?: Json;
          category?: string;
          chart_type?: string;
          columns?: Json;
          created_at?: string;
          created_by?: string | null;
          data_source?: string;
          date_range?: Json;
          description?: string | null;
          filters?: Json;
          group_by?: Json;
          id?: string;
          is_favorite?: boolean;
          is_template?: boolean;
          metrics?: Json;
          name?: string;
          sort?: Json;
          updated_at?: string;
          visibility?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_reports_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_scheduled_reports: {
        Row: {
          created_at: string;
          created_by: string | null;
          cron: string;
          delivery: string;
          enabled: boolean;
          format: string;
          frequency: string | null;
          id: string;
          last_run_at: string | null;
          last_status: string | null;
          name: string;
          next_run_at: string | null;
          recipients: string[];
          report_id: string;
          timezone: string;
          updated_at: string;
          webhook_url: string | null;
          whatsapp_recipients: string[];
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          cron: string;
          delivery?: string;
          enabled?: boolean;
          format?: string;
          frequency?: string | null;
          id?: string;
          last_run_at?: string | null;
          last_status?: string | null;
          name: string;
          next_run_at?: string | null;
          recipients?: string[];
          report_id: string;
          timezone?: string;
          updated_at?: string;
          webhook_url?: string | null;
          whatsapp_recipients?: string[];
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          cron?: string;
          delivery?: string;
          enabled?: boolean;
          format?: string;
          frequency?: string | null;
          id?: string;
          last_run_at?: string | null;
          last_status?: string | null;
          name?: string;
          next_run_at?: string | null;
          recipients?: string[];
          report_id?: string;
          timezone?: string;
          updated_at?: string;
          webhook_url?: string | null;
          whatsapp_recipients?: string[];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_scheduled_reports_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "bi_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bi_scheduled_reports_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      bi_widgets: {
        Row: {
          config: Json;
          created_at: string;
          dashboard_id: string;
          data_source: string;
          id: string;
          position: Json;
          refresh_interval_s: number;
          size: Json;
          sort_order: number;
          subtitle: string | null;
          title: string;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          dashboard_id: string;
          data_source: string;
          id?: string;
          position?: Json;
          refresh_interval_s?: number;
          size?: Json;
          sort_order?: number;
          subtitle?: string | null;
          title: string;
          type: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          dashboard_id?: string;
          data_source?: string;
          id?: string;
          position?: Json;
          refresh_interval_s?: number;
          size?: Json;
          sort_order?: number;
          subtitle?: string | null;
          title?: string;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bi_widgets_dashboard_id_fkey";
            columns: ["dashboard_id"];
            isOneToOne: false;
            referencedRelation: "bi_dashboards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bi_widgets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_automation_config: {
        Row: {
          auto_reactivate_on_payment: boolean;
          auto_suspend_after_grace: boolean;
          channels: string[];
          created_at: string;
          grace_period_days: number;
          id: string;
          invoice_due_reminder_days: number;
          max_payment_retries: number;
          notify_invoice_due: boolean;
          notify_invoice_generated: boolean;
          notify_payment_failed: boolean;
          notify_payment_succeeded: boolean;
          notify_quota_warning: boolean;
          notify_subscription_expired: boolean;
          notify_subscription_renewed: boolean;
          notify_trial_ending: boolean;
          notify_upgrade_recommendation: boolean;
          notify_usage_limit_reached: boolean;
          organization_id: string;
          payment_retry_hours: number[];
          quota_warning_threshold_pct: number;
          trial_ending_warning_days: number;
          updated_at: string;
        };
        Insert: {
          auto_reactivate_on_payment?: boolean;
          auto_suspend_after_grace?: boolean;
          channels?: string[];
          created_at?: string;
          grace_period_days?: number;
          id?: string;
          invoice_due_reminder_days?: number;
          max_payment_retries?: number;
          notify_invoice_due?: boolean;
          notify_invoice_generated?: boolean;
          notify_payment_failed?: boolean;
          notify_payment_succeeded?: boolean;
          notify_quota_warning?: boolean;
          notify_subscription_expired?: boolean;
          notify_subscription_renewed?: boolean;
          notify_trial_ending?: boolean;
          notify_upgrade_recommendation?: boolean;
          notify_usage_limit_reached?: boolean;
          organization_id: string;
          payment_retry_hours?: number[];
          quota_warning_threshold_pct?: number;
          trial_ending_warning_days?: number;
          updated_at?: string;
        };
        Update: {
          auto_reactivate_on_payment?: boolean;
          auto_suspend_after_grace?: boolean;
          channels?: string[];
          created_at?: string;
          grace_period_days?: number;
          id?: string;
          invoice_due_reminder_days?: number;
          max_payment_retries?: number;
          notify_invoice_due?: boolean;
          notify_invoice_generated?: boolean;
          notify_payment_failed?: boolean;
          notify_payment_succeeded?: boolean;
          notify_quota_warning?: boolean;
          notify_subscription_expired?: boolean;
          notify_subscription_renewed?: boolean;
          notify_trial_ending?: boolean;
          notify_upgrade_recommendation?: boolean;
          notify_usage_limit_reached?: boolean;
          organization_id?: string;
          payment_retry_hours?: number[];
          quota_warning_threshold_pct?: number;
          trial_ending_warning_days?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_automation_config_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_customers: {
        Row: {
          billing_address: Json;
          created_at: string;
          currency: string;
          email: string | null;
          id: string;
          is_default: boolean;
          metadata: Json;
          name: string | null;
          organization_id: string;
          provider: string;
          provider_customer_id: string;
          tax_id: string | null;
          updated_at: string;
        };
        Insert: {
          billing_address?: Json;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          is_default?: boolean;
          metadata?: Json;
          name?: string | null;
          organization_id: string;
          provider: string;
          provider_customer_id: string;
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          billing_address?: Json;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          is_default?: boolean;
          metadata?: Json;
          name?: string | null;
          organization_id?: string;
          provider?: string;
          provider_customer_id?: string;
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_document_history: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          document_id: string;
          id: string;
          organization_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          document_id: string;
          id?: string;
          organization_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          document_id?: string;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_document_history_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "billing_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_document_history_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_document_templates: {
        Row: {
          accent_color: string | null;
          company_address: Json | null;
          company_email: string | null;
          company_logo_url: string | null;
          company_name: string | null;
          company_phone: string | null;
          company_tax_id: string | null;
          company_website: string | null;
          created_at: string;
          currency: string | null;
          document_type: Database["public"]["Enums"]["billing_document_type"];
          font_family: string | null;
          footer_note: string | null;
          id: string;
          is_default: boolean;
          locale: string | null;
          metadata: Json;
          name: string;
          next_number: number | null;
          number_padding: number | null;
          number_prefix: string | null;
          organization_id: string;
          primary_color: string | null;
          terms: string | null;
          updated_at: string;
        };
        Insert: {
          accent_color?: string | null;
          company_address?: Json | null;
          company_email?: string | null;
          company_logo_url?: string | null;
          company_name?: string | null;
          company_phone?: string | null;
          company_tax_id?: string | null;
          company_website?: string | null;
          created_at?: string;
          currency?: string | null;
          document_type?: Database["public"]["Enums"]["billing_document_type"];
          font_family?: string | null;
          footer_note?: string | null;
          id?: string;
          is_default?: boolean;
          locale?: string | null;
          metadata?: Json;
          name: string;
          next_number?: number | null;
          number_padding?: number | null;
          number_prefix?: string | null;
          organization_id: string;
          primary_color?: string | null;
          terms?: string | null;
          updated_at?: string;
        };
        Update: {
          accent_color?: string | null;
          company_address?: Json | null;
          company_email?: string | null;
          company_logo_url?: string | null;
          company_name?: string | null;
          company_phone?: string | null;
          company_tax_id?: string | null;
          company_website?: string | null;
          created_at?: string;
          currency?: string | null;
          document_type?: Database["public"]["Enums"]["billing_document_type"];
          font_family?: string | null;
          footer_note?: string | null;
          id?: string;
          is_default?: boolean;
          locale?: string | null;
          metadata?: Json;
          name?: string;
          next_number?: number | null;
          number_padding?: number | null;
          number_prefix?: string | null;
          organization_id?: string;
          primary_color?: string | null;
          terms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_document_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_documents: {
        Row: {
          amount_paid_cents: number;
          amount_refunded_cents: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_address: Json | null;
          customer_email: string | null;
          customer_name: string | null;
          customer_tax_id: string | null;
          discount_cents: number;
          due_at: string | null;
          id: string;
          invoice_id: string | null;
          issued_at: string | null;
          line_items: Json;
          locale: string;
          metadata: Json;
          notes: string | null;
          number: string;
          organization_id: string;
          parent_document_id: string | null;
          payment_id: string | null;
          pdf_url: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["billing_document_status"];
          subtotal_cents: number;
          tax_breakdown: Json;
          tax_cents: number;
          template_id: string | null;
          total_cents: number;
          type: Database["public"]["Enums"]["billing_document_type"];
          updated_at: string;
        };
        Insert: {
          amount_paid_cents?: number;
          amount_refunded_cents?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_address?: Json | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_tax_id?: string | null;
          discount_cents?: number;
          due_at?: string | null;
          id?: string;
          invoice_id?: string | null;
          issued_at?: string | null;
          line_items?: Json;
          locale?: string;
          metadata?: Json;
          notes?: string | null;
          number: string;
          organization_id: string;
          parent_document_id?: string | null;
          payment_id?: string | null;
          pdf_url?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["billing_document_status"];
          subtotal_cents?: number;
          tax_breakdown?: Json;
          tax_cents?: number;
          template_id?: string | null;
          total_cents?: number;
          type: Database["public"]["Enums"]["billing_document_type"];
          updated_at?: string;
        };
        Update: {
          amount_paid_cents?: number;
          amount_refunded_cents?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_address?: Json | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_tax_id?: string | null;
          discount_cents?: number;
          due_at?: string | null;
          id?: string;
          invoice_id?: string | null;
          issued_at?: string | null;
          line_items?: Json;
          locale?: string;
          metadata?: Json;
          notes?: string | null;
          number?: string;
          organization_id?: string;
          parent_document_id?: string | null;
          payment_id?: string | null;
          pdf_url?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["billing_document_status"];
          subtotal_cents?: number;
          tax_breakdown?: Json;
          tax_cents?: number;
          template_id?: string | null;
          total_cents?: number;
          type?: Database["public"]["Enums"]["billing_document_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_documents_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "billing_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_documents_parent_document_id_fkey";
            columns: ["parent_document_id"];
            isOneToOne: false;
            referencedRelation: "billing_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_documents_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: {
          created_at: string;
          error: string | null;
          event_type: string;
          id: string;
          invoice_id: string | null;
          organization_id: string | null;
          payload: Json;
          processed_at: string | null;
          provider: string;
          provider_event_id: string | null;
          subscription_id: string | null;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event_type: string;
          id?: string;
          invoice_id?: string | null;
          organization_id?: string | null;
          payload?: Json;
          processed_at?: string | null;
          provider: string;
          provider_event_id?: string | null;
          subscription_id?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event_type?: string;
          id?: string;
          invoice_id?: string | null;
          organization_id?: string | null;
          payload?: Json;
          processed_at?: string | null;
          provider?: string;
          provider_event_id?: string | null;
          subscription_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_invoice_items: {
        Row: {
          amount_cents: number;
          created_at: string;
          description: string;
          id: string;
          invoice_id: string;
          metadata: Json;
          meter_code: string | null;
          period_end: string | null;
          period_start: string | null;
          quantity: number;
          unit_amount_cents: number;
        };
        Insert: {
          amount_cents?: number;
          created_at?: string;
          description: string;
          id?: string;
          invoice_id: string;
          metadata?: Json;
          meter_code?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          quantity?: number;
          unit_amount_cents?: number;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          description?: string;
          id?: string;
          invoice_id?: string;
          metadata?: Json;
          meter_code?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          quantity?: number;
          unit_amount_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "billing_invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "billing_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_invoices: {
        Row: {
          amount_due_cents: number;
          amount_paid_cents: number;
          coupon_id: string | null;
          created_at: string;
          currency: string;
          discount_cents: number;
          due_at: string | null;
          hosted_url: string | null;
          id: string;
          issued_at: string | null;
          metadata: Json;
          number: string | null;
          organization_id: string;
          paid_at: string | null;
          pdf_url: string | null;
          period_end: string | null;
          period_start: string | null;
          provider: string | null;
          provider_invoice_id: string | null;
          status: Database["public"]["Enums"]["billing_invoice_status"];
          subscription_id: string | null;
          subtotal_cents: number;
          tax_cents: number;
          tax_rate_id: string | null;
          total_cents: number;
          updated_at: string;
          voided_at: string | null;
        };
        Insert: {
          amount_due_cents?: number;
          amount_paid_cents?: number;
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          discount_cents?: number;
          due_at?: string | null;
          hosted_url?: string | null;
          id?: string;
          issued_at?: string | null;
          metadata?: Json;
          number?: string | null;
          organization_id: string;
          paid_at?: string | null;
          pdf_url?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          provider?: string | null;
          provider_invoice_id?: string | null;
          status?: Database["public"]["Enums"]["billing_invoice_status"];
          subscription_id?: string | null;
          subtotal_cents?: number;
          tax_cents?: number;
          tax_rate_id?: string | null;
          total_cents?: number;
          updated_at?: string;
          voided_at?: string | null;
        };
        Update: {
          amount_due_cents?: number;
          amount_paid_cents?: number;
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          discount_cents?: number;
          due_at?: string | null;
          hosted_url?: string | null;
          id?: string;
          issued_at?: string | null;
          metadata?: Json;
          number?: string | null;
          organization_id?: string;
          paid_at?: string | null;
          pdf_url?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          provider?: string | null;
          provider_invoice_id?: string | null;
          status?: Database["public"]["Enums"]["billing_invoice_status"];
          subscription_id?: string | null;
          subtotal_cents?: number;
          tax_cents?: number;
          tax_rate_id?: string | null;
          total_cents?: number;
          updated_at?: string;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_invoices_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_invoices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_invoices_tax_rate_id_fkey";
            columns: ["tax_rate_id"];
            isOneToOne: false;
            referencedRelation: "tax_rates";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_notifications: {
        Row: {
          body: string | null;
          channel: string;
          created_at: string;
          dedupe_key: string | null;
          error: string | null;
          id: string;
          kind: Database["public"]["Enums"]["billing_notification_kind"];
          organization_id: string;
          payload: Json;
          recipient: string | null;
          related_invoice_id: string | null;
          related_subscription_id: string | null;
          scheduled_for: string;
          sent_at: string | null;
          status: Database["public"]["Enums"]["billing_notification_status"];
          subject: string | null;
        };
        Insert: {
          body?: string | null;
          channel?: string;
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["billing_notification_kind"];
          organization_id: string;
          payload?: Json;
          recipient?: string | null;
          related_invoice_id?: string | null;
          related_subscription_id?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["billing_notification_status"];
          subject?: string | null;
        };
        Update: {
          body?: string | null;
          channel?: string;
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["billing_notification_kind"];
          organization_id?: string;
          payload?: Json;
          recipient?: string | null;
          related_invoice_id?: string | null;
          related_subscription_id?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["billing_notification_status"];
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_notifications_related_invoice_id_fkey";
            columns: ["related_invoice_id"];
            isOneToOne: false;
            referencedRelation: "billing_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_notifications_related_subscription_id_fkey";
            columns: ["related_subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_payment_attempts: {
        Row: {
          amount_cents: number;
          created_at: string;
          currency: string;
          failure_code: string | null;
          failure_message: string | null;
          id: string;
          invoice_id: string | null;
          metadata: Json;
          next_retry_at: string | null;
          organization_id: string;
          provider: string;
          provider_intent_id: string | null;
          provider_payment_id: string | null;
          refunded_amount_cents: number;
          refunded_at: string | null;
          retry_count: number;
          status: Database["public"]["Enums"]["billing_payment_attempt_status"];
          subscription_id: string | null;
          succeeded_at: string | null;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          currency?: string;
          failure_code?: string | null;
          failure_message?: string | null;
          id?: string;
          invoice_id?: string | null;
          metadata?: Json;
          next_retry_at?: string | null;
          organization_id: string;
          provider: string;
          provider_intent_id?: string | null;
          provider_payment_id?: string | null;
          refunded_amount_cents?: number;
          refunded_at?: string | null;
          retry_count?: number;
          status?: Database["public"]["Enums"]["billing_payment_attempt_status"];
          subscription_id?: string | null;
          succeeded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          currency?: string;
          failure_code?: string | null;
          failure_message?: string | null;
          id?: string;
          invoice_id?: string | null;
          metadata?: Json;
          next_retry_at?: string | null;
          organization_id?: string;
          provider?: string;
          provider_intent_id?: string | null;
          provider_payment_id?: string | null;
          refunded_amount_cents?: number;
          refunded_at?: string | null;
          retry_count?: number;
          status?: Database["public"]["Enums"]["billing_payment_attempt_status"];
          subscription_id?: string | null;
          succeeded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_payment_attempts_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "billing_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_payment_attempts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_payment_attempts_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_revenue_snapshots: {
        Row: {
          active_subscriptions: number;
          arr_cents: number;
          churn_rate: number;
          churned_subscriptions: number;
          created_at: string;
          currency: string;
          gross_revenue_cents: number;
          id: string;
          metadata: Json;
          mrr_cents: number;
          net_revenue_cents: number;
          new_subscriptions: number;
          organization_id: string | null;
          refunds_cents: number;
          snapshot_date: string;
          trialing_subscriptions: number;
        };
        Insert: {
          active_subscriptions?: number;
          arr_cents?: number;
          churn_rate?: number;
          churned_subscriptions?: number;
          created_at?: string;
          currency?: string;
          gross_revenue_cents?: number;
          id?: string;
          metadata?: Json;
          mrr_cents?: number;
          net_revenue_cents?: number;
          new_subscriptions?: number;
          organization_id?: string | null;
          refunds_cents?: number;
          snapshot_date: string;
          trialing_subscriptions?: number;
        };
        Update: {
          active_subscriptions?: number;
          arr_cents?: number;
          churn_rate?: number;
          churned_subscriptions?: number;
          created_at?: string;
          currency?: string;
          gross_revenue_cents?: number;
          id?: string;
          metadata?: Json;
          mrr_cents?: number;
          net_revenue_cents?: number;
          new_subscriptions?: number;
          organization_id?: string | null;
          refunds_cents?: number;
          snapshot_date?: string;
          trialing_subscriptions?: number;
        };
        Relationships: [
          {
            foreignKeyName: "billing_revenue_snapshots_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_tax_exemptions: {
        Row: {
          certificate_url: string | null;
          country: string | null;
          created_at: string;
          customer_id: string | null;
          id: string;
          organization_id: string;
          reason: string;
          region: string | null;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          certificate_url?: string | null;
          country?: string | null;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          organization_id: string;
          reason: string;
          region?: string | null;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: {
          certificate_url?: string | null;
          country?: string | null;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          organization_id?: string;
          reason?: string;
          region?: string | null;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_tax_exemptions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "billing_customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_tax_exemptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      birthday_reminder_log: {
        Row: {
          channel: string;
          contact_id: string;
          id: string;
          lead_offset_days: number;
          owner_id: string | null;
          reminder_date: string;
          sent_at: string;
          workspace_id: string;
        };
        Insert: {
          channel: string;
          contact_id: string;
          id?: string;
          lead_offset_days: number;
          owner_id?: string | null;
          reminder_date: string;
          sent_at?: string;
          workspace_id: string;
        };
        Update: {
          channel?: string;
          contact_id?: string;
          id?: string;
          lead_offset_days?: number;
          owner_id?: string | null;
          reminder_date?: string;
          sent_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "birthday_reminder_log_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      birthday_reminder_settings: {
        Row: {
          created_at: string;
          email_enabled: boolean;
          enabled: boolean;
          inapp_enabled: boolean;
          lead_days: number[];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          email_enabled?: boolean;
          enabled?: boolean;
          inapp_enabled?: boolean;
          lead_days?: number[];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          email_enabled?: boolean;
          enabled?: boolean;
          inapp_enabled?: boolean;
          lead_days?: number[];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "birthday_reminder_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_appointments: {
        Row: {
          answers: Json;
          cancellation_reason: string | null;
          contact_id: string | null;
          created_at: string;
          customer_email: string | null;
          customer_name: string;
          customer_phone: string | null;
          customer_timezone: string;
          end_at: string;
          event_type_id: string | null;
          external_calendar_events: Json;
          external_event_ids: Json;
          host_id: string;
          id: string;
          join_url: string | null;
          location_details: Json;
          location_kind: string | null;
          manage_token: string;
          meeting_notes: string | null;
          meeting_password: string | null;
          meeting_provider_account_id: string | null;
          recording_enabled: boolean;
          recording_url: string | null;
          reschedule_of: string | null;
          source_channel: string;
          source_conversation_id: string | null;
          start_at: string;
          status: string;
          updated_at: string;
          waiting_room_enabled: boolean;
          workspace_id: string;
        };
        Insert: {
          answers?: Json;
          cancellation_reason?: string | null;
          contact_id?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          customer_timezone?: string;
          end_at: string;
          event_type_id?: string | null;
          external_calendar_events?: Json;
          external_event_ids?: Json;
          host_id: string;
          id?: string;
          join_url?: string | null;
          location_details?: Json;
          location_kind?: string | null;
          manage_token?: string;
          meeting_notes?: string | null;
          meeting_password?: string | null;
          meeting_provider_account_id?: string | null;
          recording_enabled?: boolean;
          recording_url?: string | null;
          reschedule_of?: string | null;
          source_channel?: string;
          source_conversation_id?: string | null;
          start_at: string;
          status?: string;
          updated_at?: string;
          waiting_room_enabled?: boolean;
          workspace_id: string;
        };
        Update: {
          answers?: Json;
          cancellation_reason?: string | null;
          contact_id?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          customer_timezone?: string;
          end_at?: string;
          event_type_id?: string | null;
          external_calendar_events?: Json;
          external_event_ids?: Json;
          host_id?: string;
          id?: string;
          join_url?: string | null;
          location_details?: Json;
          location_kind?: string | null;
          manage_token?: string;
          meeting_notes?: string | null;
          meeting_password?: string | null;
          meeting_provider_account_id?: string | null;
          recording_enabled?: boolean;
          recording_url?: string | null;
          reschedule_of?: string | null;
          source_channel?: string;
          source_conversation_id?: string | null;
          start_at?: string;
          status?: string;
          updated_at?: string;
          waiting_room_enabled?: boolean;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_appointments_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "booking_event_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_appointments_reschedule_of_fkey";
            columns: ["reschedule_of"];
            isOneToOne: false;
            referencedRelation: "booking_appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_availability_overrides: {
        Row: {
          created_at: string;
          end_time: string | null;
          host_id: string;
          id: string;
          is_blocked: boolean;
          override_date: string;
          reason: string | null;
          start_time: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          end_time?: string | null;
          host_id: string;
          id?: string;
          is_blocked?: boolean;
          override_date: string;
          reason?: string | null;
          start_time?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          end_time?: string | null;
          host_id?: string;
          id?: string;
          is_blocked?: boolean;
          override_date?: string;
          reason?: string | null;
          start_time?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      booking_availability_schedules: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          owner_id: string;
          timezone: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          owner_id: string;
          timezone?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          owner_id?: string;
          timezone?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      booking_availability_slots: {
        Row: {
          created_at: string;
          day_of_week: number;
          end_time: string;
          id: string;
          schedule_id: string;
          start_time: string;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          end_time: string;
          id?: string;
          schedule_id: string;
          start_time: string;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          end_time?: string;
          id?: string;
          schedule_id?: string;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_availability_slots_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "booking_availability_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_event_type_hosts: {
        Row: {
          created_at: string;
          event_type_id: string;
          host_id: string;
          id: string;
          priority: number;
          schedule_id: string | null;
          strategy: string;
        };
        Insert: {
          created_at?: string;
          event_type_id: string;
          host_id: string;
          id?: string;
          priority?: number;
          schedule_id?: string | null;
          strategy?: string;
        };
        Update: {
          created_at?: string;
          event_type_id?: string;
          host_id?: string;
          id?: string;
          priority?: number;
          schedule_id?: string | null;
          strategy?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_event_type_hosts_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "booking_event_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_event_type_hosts_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "booking_availability_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_event_types: {
        Row: {
          availability_rules: Json;
          buffer_after_minutes: number;
          buffer_before_minutes: number;
          category: string;
          color: string | null;
          confirmation_message: string | null;
          created_at: string;
          currency: string | null;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          is_group: boolean;
          location_details: Json;
          location_kind: string;
          max_advance_days: number;
          max_participants: number;
          min_notice_minutes: number;
          name: string;
          owner_id: string;
          preparation_minutes: number;
          price: number | null;
          questions: Json;
          redirect_url: string | null;
          reminder_policy: Json;
          slug: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          availability_rules?: Json;
          buffer_after_minutes?: number;
          buffer_before_minutes?: number;
          category?: string;
          color?: string | null;
          confirmation_message?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          is_group?: boolean;
          location_details?: Json;
          location_kind?: string;
          max_advance_days?: number;
          max_participants?: number;
          min_notice_minutes?: number;
          name: string;
          owner_id: string;
          preparation_minutes?: number;
          price?: number | null;
          questions?: Json;
          redirect_url?: string | null;
          reminder_policy?: Json;
          slug: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          availability_rules?: Json;
          buffer_after_minutes?: number;
          buffer_before_minutes?: number;
          category?: string;
          color?: string | null;
          confirmation_message?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          is_group?: boolean;
          location_details?: Json;
          location_kind?: string;
          max_advance_days?: number;
          max_participants?: number;
          min_notice_minutes?: number;
          name?: string;
          owner_id?: string;
          preparation_minutes?: number;
          price?: number | null;
          questions?: Json;
          redirect_url?: string | null;
          reminder_policy?: Json;
          slug?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      booking_notification_rules: {
        Row: {
          channels: string[];
          conditions: Json;
          created_at: string;
          event_type_id: string | null;
          id: string;
          is_active: boolean;
          kind: string;
          name: string;
          offset_minutes: number;
          send_to: string;
          template_ids: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          channels?: string[];
          conditions?: Json;
          created_at?: string;
          event_type_id?: string | null;
          id?: string;
          is_active?: boolean;
          kind: string;
          name: string;
          offset_minutes?: number;
          send_to?: string;
          template_ids?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          channels?: string[];
          conditions?: Json;
          created_at?: string;
          event_type_id?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name?: string;
          offset_minutes?: number;
          send_to?: string;
          template_ids?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_notification_rules_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "booking_event_types";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_notification_templates: {
        Row: {
          body: string;
          channel: string;
          created_at: string;
          created_by: string | null;
          event_type_id: string | null;
          id: string;
          is_active: boolean;
          is_default: boolean;
          kind: string;
          subject: string | null;
          updated_at: string;
          variables: Json;
          workspace_id: string;
        };
        Insert: {
          body: string;
          channel: string;
          created_at?: string;
          created_by?: string | null;
          event_type_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          kind: string;
          subject?: string | null;
          updated_at?: string;
          variables?: Json;
          workspace_id: string;
        };
        Update: {
          body?: string;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          event_type_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          kind?: string;
          subject?: string | null;
          updated_at?: string;
          variables?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_notification_templates_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "booking_event_types";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_pages: {
        Row: {
          brand_color: string | null;
          created_at: string;
          description: string | null;
          event_type_ids: string[];
          id: string;
          is_active: boolean;
          logo_url: string | null;
          slug: string;
          theme: Json;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          brand_color?: string | null;
          created_at?: string;
          description?: string | null;
          event_type_ids?: string[];
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          slug: string;
          theme?: Json;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          brand_color?: string | null;
          created_at?: string;
          description?: string | null;
          event_type_ids?: string[];
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          slug?: string;
          theme?: Json;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      booking_push_subscriptions: {
        Row: {
          contact_id: string | null;
          created_at: string;
          endpoint: string;
          id: string;
          keys: Json;
          last_seen_at: string;
          user_agent: string | null;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          endpoint: string;
          id?: string;
          keys: Json;
          last_seen_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          endpoint?: string;
          id?: string;
          keys?: Json;
          last_seen_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      booking_reminders: {
        Row: {
          appointment_id: string;
          attempts: number;
          channel: string;
          created_at: string;
          id: string;
          kind: string;
          last_error: string | null;
          recipient: string;
          rendered_body: string | null;
          rendered_subject: string | null;
          rule_id: string | null;
          send_at: string;
          sent_at: string | null;
          status: string;
          template_id: string | null;
          workspace_id: string;
        };
        Insert: {
          appointment_id: string;
          attempts?: number;
          channel: string;
          created_at?: string;
          id?: string;
          kind?: string;
          last_error?: string | null;
          recipient?: string;
          rendered_body?: string | null;
          rendered_subject?: string | null;
          rule_id?: string | null;
          send_at: string;
          sent_at?: string | null;
          status?: string;
          template_id?: string | null;
          workspace_id: string;
        };
        Update: {
          appointment_id?: string;
          attempts?: number;
          channel?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          last_error?: string | null;
          recipient?: string;
          rendered_body?: string | null;
          rendered_subject?: string | null;
          rule_id?: string | null;
          send_at?: string;
          sent_at?: string | null;
          status?: string;
          template_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_reminders_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "booking_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_reminders_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "booking_notification_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_reminders_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "booking_notification_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_waitlist: {
        Row: {
          created_at: string;
          customer_email: string | null;
          customer_name: string;
          customer_phone: string | null;
          desired_end_at: string | null;
          desired_start_at: string | null;
          event_type_id: string;
          id: string;
          notes: string | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          customer_email?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          desired_end_at?: string | null;
          desired_start_at?: string | null;
          event_type_id: string;
          id?: string;
          notes?: string | null;
          status?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          desired_end_at?: string | null;
          desired_start_at?: string | null;
          event_type_id?: string;
          id?: string;
          notes?: string | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_waitlist_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "booking_event_types";
            referencedColumns: ["id"];
          },
        ];
      };
      business_hours: {
        Row: {
          holidays: Json;
          offline_message: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          weekly_schedule: Json;
          workspace_id: string;
        };
        Insert: {
          holidays?: Json;
          offline_message?: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          weekly_schedule?: Json;
          workspace_id: string;
        };
        Update: {
          holidays?: Json;
          offline_message?: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          weekly_schedule?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_hours_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_accounts: {
        Row: {
          account_email: string;
          calendar_id: string | null;
          color: string | null;
          connection_key_ciphertext: string | null;
          created_at: string;
          display_name: string | null;
          enabled: boolean;
          ics_url: string | null;
          id: string;
          is_primary: boolean;
          last_sync_error: string | null;
          last_synced_at: string | null;
          metadata: Json;
          provider: string;
          scopes: string[] | null;
          status: string;
          sync_direction: string;
          sync_token: string | null;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          account_email: string;
          calendar_id?: string | null;
          color?: string | null;
          connection_key_ciphertext?: string | null;
          created_at?: string;
          display_name?: string | null;
          enabled?: boolean;
          ics_url?: string | null;
          id?: string;
          is_primary?: boolean;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          metadata?: Json;
          provider: string;
          scopes?: string[] | null;
          status?: string;
          sync_direction?: string;
          sync_token?: string | null;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          account_email?: string;
          calendar_id?: string | null;
          color?: string | null;
          connection_key_ciphertext?: string | null;
          created_at?: string;
          display_name?: string | null;
          enabled?: boolean;
          ics_url?: string | null;
          id?: string;
          is_primary?: boolean;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          metadata?: Json;
          provider?: string;
          scopes?: string[] | null;
          status?: string;
          sync_direction?: string;
          sync_token?: string | null;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_busy_cache: {
        Row: {
          account_id: string;
          end_at: string;
          external_id: string | null;
          fetched_at: string;
          host_id: string;
          id: string;
          start_at: string;
          title: string | null;
          workspace_id: string;
        };
        Insert: {
          account_id: string;
          end_at: string;
          external_id?: string | null;
          fetched_at?: string;
          host_id: string;
          id?: string;
          start_at: string;
          title?: string | null;
          workspace_id: string;
        };
        Update: {
          account_id?: string;
          end_at?: string;
          external_id?: string | null;
          fetched_at?: string;
          host_id?: string;
          id?: string;
          start_at?: string;
          title?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_busy_cache_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "calendar_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_entries: {
        Row: {
          all_day: boolean;
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          end_at: string;
          id: string;
          is_blocking: boolean;
          kind: Database["public"]["Enums"]["calendar_entry_kind"];
          metadata: Json;
          owner_id: string | null;
          rrule: string | null;
          scope: Database["public"]["Enums"]["calendar_entry_scope"];
          start_at: string;
          team_id: string | null;
          timezone: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          all_day?: boolean;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_at: string;
          id?: string;
          is_blocking?: boolean;
          kind: Database["public"]["Enums"]["calendar_entry_kind"];
          metadata?: Json;
          owner_id?: string | null;
          rrule?: string | null;
          scope?: Database["public"]["Enums"]["calendar_entry_scope"];
          start_at: string;
          team_id?: string | null;
          timezone?: string;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          all_day?: boolean;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_at?: string;
          id?: string;
          is_blocking?: boolean;
          kind?: Database["public"]["Enums"]["calendar_entry_kind"];
          metadata?: Json;
          owner_id?: string | null;
          rrule?: string | null;
          scope?: Database["public"]["Enums"]["calendar_entry_scope"];
          start_at?: string;
          team_id?: string | null;
          timezone?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      calendar_sync_log: {
        Row: {
          account_id: string | null;
          created_at: string;
          direction: string;
          id: string;
          message: string | null;
          operation: string;
          payload: Json | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          account_id?: string | null;
          created_at?: string;
          direction: string;
          id?: string;
          message?: string | null;
          operation: string;
          payload?: Json | null;
          status: string;
          workspace_id: string;
        };
        Update: {
          account_id?: string | null;
          created_at?: string;
          direction?: string;
          id?: string;
          message?: string | null;
          operation?: string;
          payload?: Json | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_sync_log_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "calendar_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_ab_variants: {
        Row: {
          campaign_id: string;
          clicked_count: number;
          created_at: string;
          delivered_count: number;
          failed_count: number;
          id: string;
          is_winner: boolean;
          media_url: string | null;
          message_body: string | null;
          name: string;
          read_count: number;
          replied_count: number;
          sent_count: number;
          template_id: string | null;
          template_variables: Json;
          updated_at: string;
          weight: number;
          workspace_id: string;
        };
        Insert: {
          campaign_id: string;
          clicked_count?: number;
          created_at?: string;
          delivered_count?: number;
          failed_count?: number;
          id?: string;
          is_winner?: boolean;
          media_url?: string | null;
          message_body?: string | null;
          name: string;
          read_count?: number;
          replied_count?: number;
          sent_count?: number;
          template_id?: string | null;
          template_variables?: Json;
          updated_at?: string;
          weight?: number;
          workspace_id: string;
        };
        Update: {
          campaign_id?: string;
          clicked_count?: number;
          created_at?: string;
          delivered_count?: number;
          failed_count?: number;
          id?: string;
          is_winner?: boolean;
          media_url?: string | null;
          message_body?: string | null;
          name?: string;
          read_count?: number;
          replied_count?: number;
          sent_count?: number;
          template_id?: string | null;
          template_variables?: Json;
          updated_at?: string;
          weight?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_ab_variants_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_ab_variants_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_dispatch_queue: {
        Row: {
          attempts: number;
          campaign_id: string;
          contact_id: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          media_url: string | null;
          message_body: string | null;
          phone_number: string | null;
          priority: number;
          processed_at: string | null;
          recipient_id: string | null;
          run_at: string;
          status: string;
          template_id: string | null;
          template_variables: Json;
          variant_id: string | null;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          campaign_id: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          media_url?: string | null;
          message_body?: string | null;
          phone_number?: string | null;
          priority?: number;
          processed_at?: string | null;
          recipient_id?: string | null;
          run_at?: string;
          status?: string;
          template_id?: string | null;
          template_variables?: Json;
          variant_id?: string | null;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          campaign_id?: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          media_url?: string | null;
          message_body?: string | null;
          phone_number?: string | null;
          priority?: number;
          processed_at?: string | null;
          recipient_id?: string | null;
          run_at?: string;
          status?: string;
          template_id?: string | null;
          template_variables?: Json;
          variant_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_dispatch_queue_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_dispatch_queue_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_dispatch_queue_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "campaign_recipients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_dispatch_queue_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "campaign_ab_variants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_dispatch_queue_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_events: {
        Row: {
          campaign_id: string;
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          recipient_id: string | null;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          recipient_id?: string | null;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          recipient_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_events_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "campaign_recipients";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_recipients: {
        Row: {
          campaign_id: string;
          clicked_at: string | null;
          contact_id: string;
          created_at: string;
          delivered_at: string | null;
          error_code: string | null;
          error_message: string | null;
          failed_at: string | null;
          id: string;
          message_id: string | null;
          opted_out_at: string | null;
          read_at: string | null;
          replied_at: string | null;
          sent_at: string | null;
          status: string;
          variant: string | null;
        };
        Insert: {
          campaign_id: string;
          clicked_at?: string | null;
          contact_id: string;
          created_at?: string;
          delivered_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          failed_at?: string | null;
          id?: string;
          message_id?: string | null;
          opted_out_at?: string | null;
          read_at?: string | null;
          replied_at?: string | null;
          sent_at?: string | null;
          status?: string;
          variant?: string | null;
        };
        Update: {
          campaign_id?: string;
          clicked_at?: string | null;
          contact_id?: string;
          created_at?: string;
          delivered_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          failed_at?: string | null;
          id?: string;
          message_id?: string | null;
          opted_out_at?: string | null;
          read_at?: string | null;
          replied_at?: string | null;
          sent_at?: string | null;
          status?: string;
          variant?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_recipients_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_templates: {
        Row: {
          category: string | null;
          channel: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_shared: boolean;
          media_url: string | null;
          message_body: string | null;
          name: string;
          tags: string[];
          updated_at: string;
          usage_count: number;
          variables: Json;
          wa_template_id: string | null;
          workspace_id: string;
        };
        Insert: {
          category?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_shared?: boolean;
          media_url?: string | null;
          message_body?: string | null;
          name: string;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          variables?: Json;
          wa_template_id?: string | null;
          workspace_id: string;
        };
        Update: {
          category?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_shared?: boolean;
          media_url?: string | null;
          message_body?: string | null;
          name?: string;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          variables?: Json;
          wa_template_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigns: {
        Row: {
          ab_test: Json | null;
          approval_status: string;
          approved_at: string | null;
          approved_by: string | null;
          archived_at: string | null;
          audience_snapshot: Json;
          audience_tags: string[];
          channel: string;
          clicked_count: number;
          completed_at: string | null;
          contact_list_id: string | null;
          created_at: string;
          created_by: string | null;
          delivered_count: number;
          description: string | null;
          failed_count: number;
          goal: string | null;
          id: string;
          is_recurring: boolean;
          media_url: string | null;
          message_body: string;
          name: string;
          opted_out_count: number;
          read_count: number;
          recurrence_rule: Json | null;
          replied_count: number;
          respect_opt_out: boolean;
          scheduled_at: string | null;
          segment_id: string | null;
          send_window: Json | null;
          sent_count: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["campaign_status"];
          template_id: string | null;
          template_variables: Json;
          throttle_per_minute: number;
          timezone: string;
          total_recipients: number;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          ab_test?: Json | null;
          approval_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          audience_snapshot?: Json;
          audience_tags?: string[];
          channel?: string;
          clicked_count?: number;
          completed_at?: string | null;
          contact_list_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivered_count?: number;
          description?: string | null;
          failed_count?: number;
          goal?: string | null;
          id?: string;
          is_recurring?: boolean;
          media_url?: string | null;
          message_body: string;
          name: string;
          opted_out_count?: number;
          read_count?: number;
          recurrence_rule?: Json | null;
          replied_count?: number;
          respect_opt_out?: boolean;
          scheduled_at?: string | null;
          segment_id?: string | null;
          send_window?: Json | null;
          sent_count?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["campaign_status"];
          template_id?: string | null;
          template_variables?: Json;
          throttle_per_minute?: number;
          timezone?: string;
          total_recipients?: number;
          type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          ab_test?: Json | null;
          approval_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          audience_snapshot?: Json;
          audience_tags?: string[];
          channel?: string;
          clicked_count?: number;
          completed_at?: string | null;
          contact_list_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivered_count?: number;
          description?: string | null;
          failed_count?: number;
          goal?: string | null;
          id?: string;
          is_recurring?: boolean;
          media_url?: string | null;
          message_body?: string;
          name?: string;
          opted_out_count?: number;
          read_count?: number;
          recurrence_rule?: Json | null;
          replied_count?: number;
          respect_opt_out?: boolean;
          scheduled_at?: string | null;
          segment_id?: string | null;
          send_window?: Json | null;
          sent_count?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["campaign_status"];
          template_id?: string | null;
          template_variables?: Json;
          throttle_per_minute?: number;
          timezone?: string;
          total_recipients?: number;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaigns_contact_list_id_fkey";
            columns: ["contact_list_id"];
            isOneToOne: false;
            referencedRelation: "contact_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaigns_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "customer_segments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaigns_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "wa_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_accounts: {
        Row: {
          access_token_secret_name: string | null;
          app_secret_name: string | null;
          business_id: string | null;
          created_at: string;
          created_by: string | null;
          display_name: string;
          external_account_id: string | null;
          id: string;
          inbox_id: string | null;
          is_default: boolean;
          last_verified_at: string | null;
          metadata: Json;
          phone_number: string | null;
          phone_number_id: string | null;
          provider: Database["public"]["Enums"]["messaging_provider"];
          status: Database["public"]["Enums"]["channel_account_status"];
          status_reason: string | null;
          updated_at: string;
          verify_token: string | null;
          waba_id: string | null;
          webhook_signature_algo: string;
          workspace_id: string;
        };
        Insert: {
          access_token_secret_name?: string | null;
          app_secret_name?: string | null;
          business_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          external_account_id?: string | null;
          id?: string;
          inbox_id?: string | null;
          is_default?: boolean;
          last_verified_at?: string | null;
          metadata?: Json;
          phone_number?: string | null;
          phone_number_id?: string | null;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          status?: Database["public"]["Enums"]["channel_account_status"];
          status_reason?: string | null;
          updated_at?: string;
          verify_token?: string | null;
          waba_id?: string | null;
          webhook_signature_algo?: string;
          workspace_id: string;
        };
        Update: {
          access_token_secret_name?: string | null;
          app_secret_name?: string | null;
          business_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          external_account_id?: string | null;
          id?: string;
          inbox_id?: string | null;
          is_default?: boolean;
          last_verified_at?: string | null;
          metadata?: Json;
          phone_number?: string | null;
          phone_number_id?: string | null;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          status?: Database["public"]["Enums"]["channel_account_status"];
          status_reason?: string | null;
          updated_at?: string;
          verify_token?: string | null;
          waba_id?: string | null;
          webhook_signature_algo?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channel_accounts_inbox_id_fkey";
            columns: ["inbox_id"];
            isOneToOne: false;
            referencedRelation: "inboxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_identities: {
        Row: {
          avatar_url: string | null;
          channel: string;
          contact_id: string;
          created_at: string;
          display_name: string | null;
          external_id: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          metadata: Json;
          updated_at: string;
          verified: boolean;
          workspace_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          channel: string;
          contact_id: string;
          created_at?: string;
          display_name?: string | null;
          external_id: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          metadata?: Json;
          updated_at?: string;
          verified?: boolean;
          workspace_id: string;
        };
        Update: {
          avatar_url?: string | null;
          channel?: string;
          contact_id?: string;
          created_at?: string;
          display_name?: string | null;
          external_id?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          metadata?: Json;
          updated_at?: string;
          verified?: boolean;
          workspace_id?: string;
        };
        Relationships: [];
      };
      chat_widget_events: {
        Row: {
          country: string | null;
          created_at: string;
          event_type: string;
          id: number;
          metadata: Json;
          referrer: string | null;
          session_id: string | null;
          url: string | null;
          user_agent: string | null;
          widget_id: string;
          workspace_id: string;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          event_type: string;
          id?: number;
          metadata?: Json;
          referrer?: string | null;
          session_id?: string | null;
          url?: string | null;
          user_agent?: string | null;
          widget_id: string;
          workspace_id: string;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          event_type?: string;
          id?: number;
          metadata?: Json;
          referrer?: string | null;
          session_id?: string | null;
          url?: string | null;
          user_agent?: string | null;
          widget_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_widget_events_widget_id_fkey";
            columns: ["widget_id"];
            isOneToOne: false;
            referencedRelation: "chat_widgets";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_widgets: {
        Row: {
          allowed_domains: string[];
          chatbot_id: string | null;
          config: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          routing_rules: Json;
          schedule: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          allowed_domains?: string[];
          chatbot_id?: string | null;
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          routing_rules?: Json;
          schedule?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          allowed_domains?: string[];
          chatbot_id?: string | null;
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          routing_rules?: Json;
          schedule?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_widgets_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_deployments: {
        Row: {
          business_hours_only: boolean;
          channel: string;
          channel_account_id: string | null;
          chatbot_id: string;
          config: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          workspace_id: string;
        };
        Insert: {
          business_hours_only?: boolean;
          channel: string;
          channel_account_id?: string | null;
          chatbot_id: string;
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          workspace_id: string;
        };
        Update: {
          business_hours_only?: boolean;
          channel?: string;
          channel_account_id?: string | null;
          chatbot_id?: string;
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_deployments_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_deployments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_flow_versions: {
        Row: {
          chatbot_id: string;
          created_at: string;
          created_by: string | null;
          flow: Json;
          id: string;
          label: string | null;
          published: boolean;
          version: number;
          workspace_id: string;
        };
        Insert: {
          chatbot_id: string;
          created_at?: string;
          created_by?: string | null;
          flow: Json;
          id?: string;
          label?: string | null;
          published?: boolean;
          version: number;
          workspace_id: string;
        };
        Update: {
          chatbot_id?: string;
          created_at?: string;
          created_by?: string | null;
          flow?: Json;
          id?: string;
          label?: string | null;
          published?: boolean;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_flow_versions_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_flow_versions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_kb_sources: {
        Row: {
          article_id: string | null;
          category_id: string | null;
          chatbot_id: string;
          created_at: string;
          id: string;
          workspace_id: string;
        };
        Insert: {
          article_id?: string | null;
          category_id?: string | null;
          chatbot_id: string;
          created_at?: string;
          id?: string;
          workspace_id: string;
        };
        Update: {
          article_id?: string | null;
          category_id?: string | null;
          chatbot_id?: string;
          created_at?: string;
          id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_kb_sources_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_kb_sources_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_messages: {
        Row: {
          ai_intent: string | null;
          ai_kb_hits: Json | null;
          ai_language: string | null;
          ai_sentiment: string | null;
          attachments: Json | null;
          citations: Json | null;
          content: string;
          created_at: string;
          id: string;
          latency_ms: number | null;
          model: string | null;
          provider_kind: string | null;
          read_at: string | null;
          role: string;
          session_id: string;
          tokens_completion: number | null;
          tokens_prompt: number | null;
          workspace_id: string;
        };
        Insert: {
          ai_intent?: string | null;
          ai_kb_hits?: Json | null;
          ai_language?: string | null;
          ai_sentiment?: string | null;
          attachments?: Json | null;
          citations?: Json | null;
          content: string;
          created_at?: string;
          id?: string;
          latency_ms?: number | null;
          model?: string | null;
          provider_kind?: string | null;
          read_at?: string | null;
          role: string;
          session_id: string;
          tokens_completion?: number | null;
          tokens_prompt?: number | null;
          workspace_id: string;
        };
        Update: {
          ai_intent?: string | null;
          ai_kb_hits?: Json | null;
          ai_language?: string | null;
          ai_sentiment?: string | null;
          attachments?: Json | null;
          citations?: Json | null;
          content?: string;
          created_at?: string;
          id?: string;
          latency_ms?: number | null;
          model?: string | null;
          provider_kind?: string | null;
          read_at?: string | null;
          role?: string;
          session_id?: string;
          tokens_completion?: number | null;
          tokens_prompt?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_prompt_tests: {
        Row: {
          chatbot_id: string | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          id: string;
          input: string;
          latency_ms: number | null;
          model: string | null;
          notes: string | null;
          output: string | null;
          prompt_id: string | null;
          rating: number | null;
          success: boolean;
          tokens_in: number | null;
          tokens_out: number | null;
          workspace_id: string;
        };
        Insert: {
          chatbot_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          input: string;
          latency_ms?: number | null;
          model?: string | null;
          notes?: string | null;
          output?: string | null;
          prompt_id?: string | null;
          rating?: number | null;
          success?: boolean;
          tokens_in?: number | null;
          tokens_out?: number | null;
          workspace_id: string;
        };
        Update: {
          chatbot_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          input?: string;
          latency_ms?: number | null;
          model?: string | null;
          notes?: string | null;
          output?: string | null;
          prompt_id?: string | null;
          rating?: number | null;
          success?: boolean;
          tokens_in?: number | null;
          tokens_out?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_prompt_tests_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_prompt_tests_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_prompt_tests_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_prompts: {
        Row: {
          avg_rating: number | null;
          category: string;
          chatbot_id: string | null;
          content: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          is_shared: boolean;
          is_template: boolean;
          language: string | null;
          name: string;
          notes: string | null;
          parent_id: string | null;
          tags: string[];
          updated_at: string;
          usage_count: number;
          variables: Json;
          version: number;
          workspace_id: string;
        };
        Insert: {
          avg_rating?: number | null;
          category?: string;
          chatbot_id?: string | null;
          content: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          is_shared?: boolean;
          is_template?: boolean;
          language?: string | null;
          name: string;
          notes?: string | null;
          parent_id?: string | null;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          variables?: Json;
          version?: number;
          workspace_id: string;
        };
        Update: {
          avg_rating?: number | null;
          category?: string;
          chatbot_id?: string | null;
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          is_shared?: boolean;
          is_template?: boolean;
          language?: string | null;
          name?: string;
          notes?: string | null;
          parent_id?: string | null;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          variables?: Json;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_prompts_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_prompts_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_prompts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_sessions: {
        Row: {
          ai_escalation_reason: string | null;
          ai_intent: string | null;
          ai_language: string | null;
          ai_lead_score: number | null;
          ai_lead_stage: string | null;
          ai_recommendations: Json | null;
          ai_sentiment: string | null;
          ai_sentiment_score: number | null;
          ai_summary: string | null;
          ai_topics: Json | null;
          ai_updated_at: string | null;
          channel: string;
          chatbot_id: string;
          contact_id: string | null;
          conversation_id: string | null;
          created_at: string;
          external_id: string | null;
          flow_state: Json | null;
          handed_off_at: string | null;
          handed_off_to: string | null;
          handoff_reason: string | null;
          id: string;
          last_message_at: string | null;
          message_count: number;
          metadata: Json;
          rated_at: string | null;
          rating: number | null;
          rating_comment: string | null;
          routed_agent_id: string | null;
          routed_department_id: string | null;
          routed_to: string | null;
          status: string;
          visitor_id: string | null;
          workspace_id: string;
        };
        Insert: {
          ai_escalation_reason?: string | null;
          ai_intent?: string | null;
          ai_language?: string | null;
          ai_lead_score?: number | null;
          ai_lead_stage?: string | null;
          ai_recommendations?: Json | null;
          ai_sentiment?: string | null;
          ai_sentiment_score?: number | null;
          ai_summary?: string | null;
          ai_topics?: Json | null;
          ai_updated_at?: string | null;
          channel: string;
          chatbot_id: string;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          external_id?: string | null;
          flow_state?: Json | null;
          handed_off_at?: string | null;
          handed_off_to?: string | null;
          handoff_reason?: string | null;
          id?: string;
          last_message_at?: string | null;
          message_count?: number;
          metadata?: Json;
          rated_at?: string | null;
          rating?: number | null;
          rating_comment?: string | null;
          routed_agent_id?: string | null;
          routed_department_id?: string | null;
          routed_to?: string | null;
          status?: string;
          visitor_id?: string | null;
          workspace_id: string;
        };
        Update: {
          ai_escalation_reason?: string | null;
          ai_intent?: string | null;
          ai_language?: string | null;
          ai_lead_score?: number | null;
          ai_lead_stage?: string | null;
          ai_recommendations?: Json | null;
          ai_sentiment?: string | null;
          ai_sentiment_score?: number | null;
          ai_summary?: string | null;
          ai_topics?: Json | null;
          ai_updated_at?: string | null;
          channel?: string;
          chatbot_id?: string;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          external_id?: string | null;
          flow_state?: Json | null;
          handed_off_at?: string | null;
          handed_off_to?: string | null;
          handoff_reason?: string | null;
          id?: string;
          last_message_at?: string | null;
          message_count?: number;
          metadata?: Json;
          rated_at?: string | null;
          rating?: number | null;
          rating_comment?: string | null;
          routed_agent_id?: string | null;
          routed_department_id?: string | null;
          routed_to?: string | null;
          status?: string;
          visitor_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_sessions_routed_department_id_fkey";
            columns: ["routed_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_sessions_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "livechat_visitors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_sessions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_template_favorites: {
        Row: {
          created_at: string;
          template_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          template_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          template_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_template_favorites_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_template_usage: {
        Row: {
          action: string;
          id: string;
          template_id: string;
          used_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          action?: string;
          id?: string;
          template_id: string;
          used_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          action?: string;
          id?: string;
          template_id?: string;
          used_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_template_usage_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_template_usage_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_template_versions: {
        Row: {
          changelog: string | null;
          config: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          template_id: string;
          version: number;
        };
        Insert: {
          changelog?: string | null;
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          template_id: string;
          version: number;
        };
        Update: {
          changelog?: string | null;
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_template_versions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_templates: {
        Row: {
          category: string;
          config: Json;
          created_at: string;
          description: string | null;
          forked_from_template_id: string | null;
          icon: string;
          id: string;
          is_community: boolean;
          is_featured: boolean;
          is_public_in_workspace: boolean;
          name: string;
          owner_user_id: string;
          share_slug: string | null;
          tags: string[];
          updated_at: string;
          usage_count: number;
          version: number;
          workspace_id: string;
        };
        Insert: {
          category?: string;
          config?: Json;
          created_at?: string;
          description?: string | null;
          forked_from_template_id?: string | null;
          icon?: string;
          id?: string;
          is_community?: boolean;
          is_featured?: boolean;
          is_public_in_workspace?: boolean;
          name: string;
          owner_user_id: string;
          share_slug?: string | null;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          version?: number;
          workspace_id: string;
        };
        Update: {
          category?: string;
          config?: Json;
          created_at?: string;
          description?: string | null;
          forked_from_template_id?: string | null;
          icon?: string;
          id?: string;
          is_community?: boolean;
          is_featured?: boolean;
          is_public_in_workspace?: boolean;
          name?: string;
          owner_user_id?: string;
          share_slug?: string | null;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_templates_forked_from_template_id_fkey";
            columns: ["forked_from_template_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_webhook_deliveries: {
        Row: {
          attempts: number;
          chatbot_id: string | null;
          created_at: string;
          delivered_at: string | null;
          error: string | null;
          event: string;
          id: string;
          payload: Json;
          response_body: string | null;
          response_status: number | null;
          status: string;
          webhook_id: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          chatbot_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error?: string | null;
          event: string;
          id?: string;
          payload: Json;
          response_body?: string | null;
          response_status?: number | null;
          status?: string;
          webhook_id: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          chatbot_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error?: string | null;
          event?: string;
          id?: string;
          payload?: Json;
          response_body?: string | null;
          response_status?: number | null;
          status?: string;
          webhook_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_webhook_deliveries_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_webhooks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbot_webhook_deliveries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbot_webhooks: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          events: string[];
          failure_count: number;
          id: string;
          last_delivered_at: string | null;
          last_error: string | null;
          name: string;
          secret: string;
          updated_at: string;
          url: string;
          workspace_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          events?: string[];
          failure_count?: number;
          id?: string;
          last_delivered_at?: string | null;
          last_error?: string | null;
          name: string;
          secret: string;
          updated_at?: string;
          url: string;
          workspace_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          events?: string[];
          failure_count?: number;
          id?: string;
          last_delivered_at?: string | null;
          last_error?: string | null;
          name?: string;
          secret?: string;
          updated_at?: string;
          url?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbot_webhooks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chatbots: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          department_id: string | null;
          department_prompt: string | null;
          description: string | null;
          disabled_at: string | null;
          disabled_reason: string | null;
          escalation_prompt: string | null;
          fallback_message: string | null;
          flow: Json | null;
          greeting: string | null;
          handoff_enabled: boolean;
          handoff_keywords: string[] | null;
          id: string;
          installed_at: string | null;
          installed_from_template_id: string | null;
          language: string | null;
          max_tokens: number | null;
          model: string | null;
          name: string;
          organization_prompt: string | null;
          personality: string | null;
          provider_id: string | null;
          rag_enabled: boolean;
          rag_match_count: number | null;
          rag_min_similarity: number | null;
          status: string;
          system_prompt: string | null;
          temperature: number | null;
          tone: string | null;
          total_messages: number;
          total_sessions: number;
          uninstalled_reason: string | null;
          updated_at: string;
          welcome_message: string | null;
          widget_config: Json;
          workspace_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id?: string | null;
          department_prompt?: string | null;
          description?: string | null;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          escalation_prompt?: string | null;
          fallback_message?: string | null;
          flow?: Json | null;
          greeting?: string | null;
          handoff_enabled?: boolean;
          handoff_keywords?: string[] | null;
          id?: string;
          installed_at?: string | null;
          installed_from_template_id?: string | null;
          language?: string | null;
          max_tokens?: number | null;
          model?: string | null;
          name: string;
          organization_prompt?: string | null;
          personality?: string | null;
          provider_id?: string | null;
          rag_enabled?: boolean;
          rag_match_count?: number | null;
          rag_min_similarity?: number | null;
          status?: string;
          system_prompt?: string | null;
          temperature?: number | null;
          tone?: string | null;
          total_messages?: number;
          total_sessions?: number;
          uninstalled_reason?: string | null;
          updated_at?: string;
          welcome_message?: string | null;
          widget_config?: Json;
          workspace_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id?: string | null;
          department_prompt?: string | null;
          description?: string | null;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          escalation_prompt?: string | null;
          fallback_message?: string | null;
          flow?: Json | null;
          greeting?: string | null;
          handoff_enabled?: boolean;
          handoff_keywords?: string[] | null;
          id?: string;
          installed_at?: string | null;
          installed_from_template_id?: string | null;
          language?: string | null;
          max_tokens?: number | null;
          model?: string | null;
          name?: string;
          organization_prompt?: string | null;
          personality?: string | null;
          provider_id?: string | null;
          rag_enabled?: boolean;
          rag_match_count?: number | null;
          rag_min_similarity?: number | null;
          status?: string;
          system_prompt?: string | null;
          temperature?: number | null;
          tone?: string | null;
          total_messages?: number;
          total_sessions?: number;
          uninstalled_reason?: string | null;
          updated_at?: string;
          welcome_message?: string | null;
          widget_config?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chatbots_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbots_installed_from_template_id_fkey";
            columns: ["installed_from_template_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chatbots_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_brands: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          logo_url: string | null;
          name: string;
          slug: string | null;
          updated_at: string;
          website: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          name: string;
          slug?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          name?: string;
          slug?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      commerce_cart_items: {
        Row: {
          cart_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          product_id: string | null;
          quantity: number;
          sku: string | null;
          total: number;
          unit_price: number;
        };
        Insert: {
          cart_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          product_id?: string | null;
          quantity?: number;
          sku?: string | null;
          total?: number;
          unit_price?: number;
        };
        Update: {
          cart_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          sku?: string | null;
          total?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "commerce_carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_cart_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_carts: {
        Row: {
          applied_promotions: Json;
          channel: string | null;
          contact_id: string | null;
          conversation_id: string | null;
          coupon_code: string | null;
          created_at: string;
          currency: string;
          discount: number;
          id: string;
          metadata: Json;
          promo_code: string | null;
          shipping: number;
          status: string;
          subtotal: number;
          tax: number;
          total: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          applied_promotions?: Json;
          channel?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          coupon_code?: string | null;
          created_at?: string;
          currency?: string;
          discount?: number;
          id?: string;
          metadata?: Json;
          promo_code?: string | null;
          shipping?: number;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          applied_promotions?: Json;
          channel?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          coupon_code?: string | null;
          created_at?: string;
          currency?: string;
          discount?: number;
          id?: string;
          metadata?: Json;
          promo_code?: string | null;
          shipping?: number;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_carts_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_carts_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_inventory: {
        Row: {
          id: string;
          location: string;
          product_id: string;
          quantity_on_hand: number;
          quantity_reserved: number;
          reorder_point: number | null;
          reorder_quantity: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          id?: string;
          location?: string;
          product_id: string;
          quantity_on_hand?: number;
          quantity_reserved?: number;
          reorder_point?: number | null;
          reorder_quantity?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          id?: string;
          location?: string;
          product_id?: string;
          quantity_on_hand?: number;
          quantity_reserved?: number;
          reorder_point?: number | null;
          reorder_quantity?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          location: string;
          movement_type: string;
          note: string | null;
          product_id: string;
          quantity_delta: number;
          reference_id: string | null;
          reference_type: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string;
          movement_type: string;
          note?: string | null;
          product_id: string;
          quantity_delta: number;
          reference_id?: string | null;
          reference_type?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string;
          movement_type?: string;
          note?: string | null;
          product_id?: string;
          quantity_delta?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      commerce_order_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          description: string | null;
          event_type: string;
          id: string;
          metadata: Json;
          order_id: string;
          workspace_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          description?: string | null;
          event_type: string;
          id?: string;
          metadata?: Json;
          order_id: string;
          workspace_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          description?: string | null;
          event_type?: string;
          id?: string;
          metadata?: Json;
          order_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commerce_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_order_items: {
        Row: {
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          order_id: string;
          product_id: string | null;
          quantity: number;
          sku: string | null;
          total: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          order_id: string;
          product_id?: string | null;
          quantity?: number;
          sku?: string | null;
          total?: number;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          order_id?: string;
          product_id?: string | null;
          quantity?: number;
          sku?: string | null;
          total?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commerce_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_orders: {
        Row: {
          applied_promotions: Json;
          billing_address: Json | null;
          cancelled_at: string | null;
          cart_id: string | null;
          channel: string | null;
          contact_id: string | null;
          conversation_id: string | null;
          created_at: string;
          currency: string;
          delivered_at: string | null;
          discount: number;
          fulfilled_at: string | null;
          fulfillment_status: string;
          id: string;
          metadata: Json;
          notes: string | null;
          order_number: string;
          paid_at: string | null;
          payment_status: string;
          placed_at: string | null;
          refunded_at: string | null;
          returned_at: string | null;
          shipped_at: string | null;
          shipping: number;
          shipping_address: Json | null;
          shipping_provider: string | null;
          status: string;
          subtotal: number;
          tax: number;
          total: number;
          tracking_number: string | null;
          tracking_url: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          applied_promotions?: Json;
          billing_address?: Json | null;
          cancelled_at?: string | null;
          cart_id?: string | null;
          channel?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          currency?: string;
          delivered_at?: string | null;
          discount?: number;
          fulfilled_at?: string | null;
          fulfillment_status?: string;
          id?: string;
          metadata?: Json;
          notes?: string | null;
          order_number: string;
          paid_at?: string | null;
          payment_status?: string;
          placed_at?: string | null;
          refunded_at?: string | null;
          returned_at?: string | null;
          shipped_at?: string | null;
          shipping?: number;
          shipping_address?: Json | null;
          shipping_provider?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          tracking_number?: string | null;
          tracking_url?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          applied_promotions?: Json;
          billing_address?: Json | null;
          cancelled_at?: string | null;
          cart_id?: string | null;
          channel?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          currency?: string;
          delivered_at?: string | null;
          discount?: number;
          fulfilled_at?: string | null;
          fulfillment_status?: string;
          id?: string;
          metadata?: Json;
          notes?: string | null;
          order_number?: string;
          paid_at?: string | null;
          payment_status?: string;
          placed_at?: string | null;
          refunded_at?: string | null;
          returned_at?: string | null;
          shipped_at?: string | null;
          shipping?: number;
          shipping_address?: Json | null;
          shipping_provider?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          tracking_number?: string | null;
          tracking_url?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_orders_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "commerce_carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_orders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_orders_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_payment_link_events: {
        Row: {
          actor_user_id: string | null;
          amount: number | null;
          channel: string | null;
          created_at: string;
          currency: string | null;
          event_type: string;
          id: string;
          metadata: Json;
          payment_link_id: string;
          workspace_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          amount?: number | null;
          channel?: string | null;
          created_at?: string;
          currency?: string | null;
          event_type: string;
          id?: string;
          metadata?: Json;
          payment_link_id: string;
          workspace_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          amount?: number | null;
          channel?: string | null;
          created_at?: string;
          currency?: string | null;
          event_type?: string;
          id?: string;
          metadata?: Json;
          payment_link_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_payment_link_events_payment_link_id_fkey";
            columns: ["payment_link_id"];
            isOneToOne: false;
            referencedRelation: "commerce_payment_links";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_payment_links: {
        Row: {
          allow_partial: boolean;
          amount: number;
          cancelled_at: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          description: string | null;
          expires_at: string | null;
          id: string;
          is_recurring: boolean;
          metadata: Json;
          min_amount: number | null;
          order_id: string | null;
          paid_amount: number;
          paid_at: string | null;
          provider: string;
          provider_reference: string | null;
          recurring_count: number | null;
          recurring_interval: string | null;
          refunded_amount: number;
          status: string;
          token: string;
          updated_at: string;
          url: string | null;
          workspace_id: string;
        };
        Insert: {
          allow_partial?: boolean;
          amount: number;
          cancelled_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          is_recurring?: boolean;
          metadata?: Json;
          min_amount?: number | null;
          order_id?: string | null;
          paid_amount?: number;
          paid_at?: string | null;
          provider?: string;
          provider_reference?: string | null;
          recurring_count?: number | null;
          recurring_interval?: string | null;
          refunded_amount?: number;
          status?: string;
          token: string;
          updated_at?: string;
          url?: string | null;
          workspace_id: string;
        };
        Update: {
          allow_partial?: boolean;
          amount?: number;
          cancelled_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          is_recurring?: boolean;
          metadata?: Json;
          min_amount?: number | null;
          order_id?: string | null;
          paid_amount?: number;
          paid_at?: string | null;
          provider?: string;
          provider_reference?: string | null;
          recurring_count?: number | null;
          recurring_interval?: string | null;
          refunded_amount?: number;
          status?: string;
          token?: string;
          updated_at?: string;
          url?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_payment_links_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_payment_links_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commerce_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_promotion_redemptions: {
        Row: {
          amount_off_cents: number;
          code_used: string | null;
          contact_id: string | null;
          created_at: string;
          currency: string;
          id: string;
          metadata: Json;
          order_id: string | null;
          promotion_id: string;
          workspace_id: string;
        };
        Insert: {
          amount_off_cents?: number;
          code_used?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          metadata?: Json;
          order_id?: string | null;
          promotion_id: string;
          workspace_id: string;
        };
        Update: {
          amount_off_cents?: number;
          code_used?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          metadata?: Json;
          order_id?: string | null;
          promotion_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_promotion_redemptions_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "commerce_promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_promotions: {
        Row: {
          amount_off_cents: number | null;
          applies_to: string;
          auto_apply: boolean;
          bundle_price_cents: number | null;
          bundle_product_ids: string[];
          buy_qty: number | null;
          campaign_id: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_ids: string[];
          customer_scope: string;
          description: string | null;
          discount_type: string;
          ends_at: string | null;
          get_discount_percent: number | null;
          get_product_ids: string[];
          get_qty: number | null;
          id: string;
          is_active: boolean;
          is_stackable: boolean;
          max_discount_cents: number | null;
          metadata: Json;
          min_order_cents: number | null;
          name: string;
          percent_off: number | null;
          priority: number;
          promo_type: string;
          rules: Json;
          segment_ids: string[];
          starts_at: string | null;
          target_ids: string[];
          times_redeemed: number;
          updated_at: string;
          usage_limit: number | null;
          usage_limit_per_customer: number | null;
          workspace_id: string;
        };
        Insert: {
          amount_off_cents?: number | null;
          applies_to?: string;
          auto_apply?: boolean;
          bundle_price_cents?: number | null;
          bundle_product_ids?: string[];
          buy_qty?: number | null;
          campaign_id?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_ids?: string[];
          customer_scope?: string;
          description?: string | null;
          discount_type: string;
          ends_at?: string | null;
          get_discount_percent?: number | null;
          get_product_ids?: string[];
          get_qty?: number | null;
          id?: string;
          is_active?: boolean;
          is_stackable?: boolean;
          max_discount_cents?: number | null;
          metadata?: Json;
          min_order_cents?: number | null;
          name: string;
          percent_off?: number | null;
          priority?: number;
          promo_type?: string;
          rules?: Json;
          segment_ids?: string[];
          starts_at?: string | null;
          target_ids?: string[];
          times_redeemed?: number;
          updated_at?: string;
          usage_limit?: number | null;
          usage_limit_per_customer?: number | null;
          workspace_id: string;
        };
        Update: {
          amount_off_cents?: number | null;
          applies_to?: string;
          auto_apply?: boolean;
          bundle_price_cents?: number | null;
          bundle_product_ids?: string[];
          buy_qty?: number | null;
          campaign_id?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_ids?: string[];
          customer_scope?: string;
          description?: string | null;
          discount_type?: string;
          ends_at?: string | null;
          get_discount_percent?: number | null;
          get_product_ids?: string[];
          get_qty?: number | null;
          id?: string;
          is_active?: boolean;
          is_stackable?: boolean;
          max_discount_cents?: number | null;
          metadata?: Json;
          min_order_cents?: number | null;
          name?: string;
          percent_off?: number | null;
          priority?: number;
          promo_type?: string;
          rules?: Json;
          segment_ids?: string[];
          starts_at?: string | null;
          target_ids?: string[];
          times_redeemed?: number;
          updated_at?: string;
          usage_limit?: number | null;
          usage_limit_per_customer?: number | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      commerce_saved_carts: {
        Row: {
          cart_snapshot: Json;
          contact_id: string | null;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          cart_snapshot?: Json;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          cart_snapshot?: Json;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_saved_carts_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_shipping_rates: {
        Row: {
          created_at: string;
          currency: string;
          estimated_days_max: number | null;
          estimated_days_min: number | null;
          id: string;
          is_active: boolean;
          max_order_total: number | null;
          min_order_total: number | null;
          name: string;
          price: number;
          rate_type: string;
          updated_at: string;
          workspace_id: string;
          zone_id: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          estimated_days_max?: number | null;
          estimated_days_min?: number | null;
          id?: string;
          is_active?: boolean;
          max_order_total?: number | null;
          min_order_total?: number | null;
          name: string;
          price?: number;
          rate_type?: string;
          updated_at?: string;
          workspace_id: string;
          zone_id: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          estimated_days_max?: number | null;
          estimated_days_min?: number | null;
          id?: string;
          is_active?: boolean;
          max_order_total?: number | null;
          min_order_total?: number | null;
          name?: string;
          price?: number;
          rate_type?: string;
          updated_at?: string;
          workspace_id?: string;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_shipping_rates_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "commerce_shipping_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      commerce_shipping_zones: {
        Row: {
          countries: string[];
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          countries?: string[];
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          countries?: string[];
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      commerce_wishlists: {
        Row: {
          contact_id: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          product_id: string | null;
          variant_id: string | null;
          workspace_id: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          workspace_id: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commerce_wishlists_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commerce_wishlists_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      communications: {
        Row: {
          bcc: string[] | null;
          body: string | null;
          cc: string[] | null;
          channel: string;
          created_at: string;
          deleted_at: string | null;
          direction: string | null;
          duration_seconds: number | null;
          entity_id: string;
          entity_type: string;
          from_address: string | null;
          id: string;
          metadata: Json;
          occurred_at: string;
          organization_id: string | null;
          performed_by: string | null;
          provider: string | null;
          provider_message_id: string | null;
          scheduled_at: string | null;
          status: string | null;
          subject: string | null;
          summary: string | null;
          to_address: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          bcc?: string[] | null;
          body?: string | null;
          cc?: string[] | null;
          channel: string;
          created_at?: string;
          deleted_at?: string | null;
          direction?: string | null;
          duration_seconds?: number | null;
          entity_id: string;
          entity_type: string;
          from_address?: string | null;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          organization_id?: string | null;
          performed_by?: string | null;
          provider?: string | null;
          provider_message_id?: string | null;
          scheduled_at?: string | null;
          status?: string | null;
          subject?: string | null;
          summary?: string | null;
          to_address?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          bcc?: string[] | null;
          body?: string | null;
          cc?: string[] | null;
          channel?: string;
          created_at?: string;
          deleted_at?: string | null;
          direction?: string | null;
          duration_seconds?: number | null;
          entity_id?: string;
          entity_type?: string;
          from_address?: string | null;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          organization_id?: string | null;
          performed_by?: string | null;
          provider?: string | null;
          provider_message_id?: string | null;
          scheduled_at?: string | null;
          status?: string | null;
          subject?: string | null;
          summary?: string | null;
          to_address?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communications_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          about: string | null;
          address: Json;
          annual_revenue: number | null;
          assigned_team_id: string | null;
          business_type: string | null;
          company_size: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          custom_fields: Json;
          deleted_at: string | null;
          description: string | null;
          domain: string | null;
          email: string | null;
          id: string;
          industry: string | null;
          is_archived: boolean;
          is_favorite: boolean;
          legal_name: string | null;
          linkedin_url: string | null;
          logo_url: string | null;
          name: string;
          organization_id: string | null;
          owner_id: string | null;
          phone: string | null;
          source: string | null;
          status: string;
          tags: string[] | null;
          timezone: string | null;
          twitter_handle: string | null;
          updated_at: string;
          website: string | null;
          workspace_id: string;
        };
        Insert: {
          about?: string | null;
          address?: Json;
          annual_revenue?: number | null;
          assigned_team_id?: string | null;
          business_type?: string | null;
          company_size?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          is_archived?: boolean;
          is_favorite?: boolean;
          legal_name?: string | null;
          linkedin_url?: string | null;
          logo_url?: string | null;
          name: string;
          organization_id?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          source?: string | null;
          status?: string;
          tags?: string[] | null;
          timezone?: string | null;
          twitter_handle?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id: string;
        };
        Update: {
          about?: string | null;
          address?: Json;
          annual_revenue?: number | null;
          assigned_team_id?: string | null;
          business_type?: string | null;
          company_size?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          is_archived?: boolean;
          is_favorite?: boolean;
          legal_name?: string | null;
          linkedin_url?: string | null;
          logo_url?: string | null;
          name?: string;
          organization_id?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          source?: string | null;
          status?: string;
          tags?: string[] | null;
          timezone?: string | null;
          twitter_handle?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_records: {
        Row: {
          channel: string;
          contact_id: string;
          created_at: string;
          created_by: string | null;
          effective_at: string;
          expires_at: string | null;
          id: string;
          ip_address: string | null;
          notes: string | null;
          proof_url: string | null;
          purpose: string;
          revoked_at: string | null;
          source: string | null;
          status: string;
          updated_at: string;
          user_agent: string | null;
          workspace_id: string;
        };
        Insert: {
          channel?: string;
          contact_id: string;
          created_at?: string;
          created_by?: string | null;
          effective_at?: string;
          expires_at?: string | null;
          id?: string;
          ip_address?: string | null;
          notes?: string | null;
          proof_url?: string | null;
          purpose?: string;
          revoked_at?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
          user_agent?: string | null;
          workspace_id: string;
        };
        Update: {
          channel?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string | null;
          effective_at?: string;
          expires_at?: string | null;
          id?: string;
          ip_address?: string | null;
          notes?: string | null;
          proof_url?: string | null;
          purpose?: string;
          revoked_at?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
          user_agent?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consent_records_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_records_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_list_count_reconciliation_log: {
        Row: {
          created_at: string;
          details: Json;
          id: string;
          lists_scanned: number;
          mismatches_found: number;
          ran_at: string;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          id?: string;
          lists_scanned?: number;
          mismatches_found?: number;
          ran_at?: string;
        };
        Update: {
          created_at?: string;
          details?: Json;
          id?: string;
          lists_scanned?: number;
          mismatches_found?: number;
          ran_at?: string;
        };
        Relationships: [];
      };
      contact_list_members: {
        Row: {
          added_at: string;
          added_by: string | null;
          contact_id: string;
          list_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          contact_id: string;
          list_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          contact_id?: string;
          list_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_list_members_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_list_members_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "contact_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_lists: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          last_computed_at: string | null;
          member_count: number;
          name: string;
          segment_id: string | null;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          last_computed_at?: string | null;
          member_count?: number;
          name: string;
          segment_id?: string | null;
          type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          last_computed_at?: string | null;
          member_count?: number;
          name?: string;
          segment_id?: string | null;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_lists_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "customer_segments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_lists_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_matching_rules: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_country_code: string | null;
          digits_to_match: number | null;
          enabled: boolean;
          id: string;
          label: string | null;
          priority: number;
          strategy: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_country_code?: string | null;
          digits_to_match?: number | null;
          enabled?: boolean;
          id?: string;
          label?: string | null;
          priority?: number;
          strategy: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_country_code?: string | null;
          digits_to_match?: number | null;
          enabled?: boolean;
          id?: string;
          label?: string | null;
          priority?: number;
          strategy?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_matching_rules_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_rematch_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          id: string;
          max_conversations: number;
          scope: string;
          since: string | null;
          started_at: string | null;
          status: string;
          total_matched: number;
          total_relinked: number;
          total_scanned: number;
          total_skipped: number;
          total_unchanged: number;
          unlinked_only: boolean;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          max_conversations?: number;
          scope?: string;
          since?: string | null;
          started_at?: string | null;
          status?: string;
          total_matched?: number;
          total_relinked?: number;
          total_scanned?: number;
          total_skipped?: number;
          total_unchanged?: number;
          unlinked_only?: boolean;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          max_conversations?: number;
          scope?: string;
          since?: string | null;
          started_at?: string | null;
          status?: string;
          total_matched?: number;
          total_relinked?: number;
          total_scanned?: number;
          total_skipped?: number;
          total_unchanged?: number;
          unlinked_only?: boolean;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_rematch_jobs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          address: Json;
          assigned_agent_id: string | null;
          avatar_url: string | null;
          birthday: string | null;
          company_id: string | null;
          converted_from_lead_id: string | null;
          created_at: string;
          custom_fields: Json;
          customer_health_score: number | null;
          customer_lifetime_value: number | null;
          customer_status: string | null;
          deleted_at: string | null;
          department: string | null;
          display_name: string | null;
          do_not_contact: boolean;
          email: string | null;
          emails: Json;
          first_customer_at: string | null;
          first_name: string | null;
          id: string;
          is_archived: boolean;
          is_favorite: boolean;
          job_title: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          lead_status: string | null;
          lifecycle_stage: string;
          locale: string | null;
          name: string | null;
          notes: string | null;
          organization_id: string | null;
          owner_id: string | null;
          phone: string | null;
          phones: Json;
          preferences: Json;
          segments: string[];
          source: string | null;
          status: string;
          tags: string[];
          timezone: string | null;
          updated_at: string;
          website: string | null;
          whatsapp: string | null;
          workspace_id: string;
        };
        Insert: {
          address?: Json;
          assigned_agent_id?: string | null;
          avatar_url?: string | null;
          birthday?: string | null;
          company_id?: string | null;
          converted_from_lead_id?: string | null;
          created_at?: string;
          custom_fields?: Json;
          customer_health_score?: number | null;
          customer_lifetime_value?: number | null;
          customer_status?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          display_name?: string | null;
          do_not_contact?: boolean;
          email?: string | null;
          emails?: Json;
          first_customer_at?: string | null;
          first_name?: string | null;
          id?: string;
          is_archived?: boolean;
          is_favorite?: boolean;
          job_title?: string | null;
          last_name?: string | null;
          last_seen_at?: string | null;
          lead_status?: string | null;
          lifecycle_stage?: string;
          locale?: string | null;
          name?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          phones?: Json;
          preferences?: Json;
          segments?: string[];
          source?: string | null;
          status?: string;
          tags?: string[];
          timezone?: string | null;
          updated_at?: string;
          website?: string | null;
          whatsapp?: string | null;
          workspace_id: string;
        };
        Update: {
          address?: Json;
          assigned_agent_id?: string | null;
          avatar_url?: string | null;
          birthday?: string | null;
          company_id?: string | null;
          converted_from_lead_id?: string | null;
          created_at?: string;
          custom_fields?: Json;
          customer_health_score?: number | null;
          customer_lifetime_value?: number | null;
          customer_status?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          display_name?: string | null;
          do_not_contact?: boolean;
          email?: string | null;
          emails?: Json;
          first_customer_at?: string | null;
          first_name?: string | null;
          id?: string;
          is_archived?: boolean;
          is_favorite?: boolean;
          job_title?: string | null;
          last_name?: string | null;
          last_seen_at?: string | null;
          lead_status?: string | null;
          lifecycle_stage?: string;
          locale?: string | null;
          name?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          phones?: Json;
          preferences?: Json;
          segments?: string[];
          source?: string | null;
          status?: string;
          tags?: string[];
          timezone?: string | null;
          updated_at?: string;
          website?: string | null;
          whatsapp?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_activity: {
        Row: {
          activity_type: string;
          actor_id: string | null;
          conversation_id: string;
          created_at: string;
          data: Json;
          id: string;
          workspace_id: string;
        };
        Insert: {
          activity_type: string;
          actor_id?: string | null;
          conversation_id: string;
          created_at?: string;
          data?: Json;
          id?: string;
          workspace_id: string;
        };
        Update: {
          activity_type?: string;
          actor_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          data?: Json;
          id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_activity_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_activity_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          assigned_team_id: string | null;
          assigned_to: string | null;
          conversation_id: string;
          id: string;
          is_current: boolean;
          reason: string | null;
          unassigned_at: string | null;
          workspace_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          assigned_team_id?: string | null;
          assigned_to?: string | null;
          conversation_id: string;
          id?: string;
          is_current?: boolean;
          reason?: string | null;
          unassigned_at?: string | null;
          workspace_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          assigned_team_id?: string | null;
          assigned_to?: string | null;
          conversation_id?: string;
          id?: string;
          is_current?: boolean;
          reason?: string | null;
          unassigned_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_assignments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_intelligence: {
        Row: {
          analyzed_at: string | null;
          category: string | null;
          conversation_id: string;
          created_at: string;
          emotion: string | null;
          intent: string | null;
          is_spam: boolean;
          key_points: Json;
          language: string | null;
          last_message_at: string | null;
          messages_analyzed: number;
          model: string | null;
          needs_reanalysis: boolean;
          priority: string | null;
          provider_kind: string | null;
          risk_reasons: Json;
          risk_score: number | null;
          satisfaction_prediction: string | null;
          satisfaction_score: number | null;
          search_text: string | null;
          sentiment: string | null;
          sentiment_score: number | null;
          spam_score: number | null;
          summary: string | null;
          tokens_used: number;
          topics: string[];
          updated_at: string;
          urgency: string | null;
          workspace_id: string;
        };
        Insert: {
          analyzed_at?: string | null;
          category?: string | null;
          conversation_id: string;
          created_at?: string;
          emotion?: string | null;
          intent?: string | null;
          is_spam?: boolean;
          key_points?: Json;
          language?: string | null;
          last_message_at?: string | null;
          messages_analyzed?: number;
          model?: string | null;
          needs_reanalysis?: boolean;
          priority?: string | null;
          provider_kind?: string | null;
          risk_reasons?: Json;
          risk_score?: number | null;
          satisfaction_prediction?: string | null;
          satisfaction_score?: number | null;
          search_text?: string | null;
          sentiment?: string | null;
          sentiment_score?: number | null;
          spam_score?: number | null;
          summary?: string | null;
          tokens_used?: number;
          topics?: string[];
          updated_at?: string;
          urgency?: string | null;
          workspace_id: string;
        };
        Update: {
          analyzed_at?: string | null;
          category?: string | null;
          conversation_id?: string;
          created_at?: string;
          emotion?: string | null;
          intent?: string | null;
          is_spam?: boolean;
          key_points?: Json;
          language?: string | null;
          last_message_at?: string | null;
          messages_analyzed?: number;
          model?: string | null;
          needs_reanalysis?: boolean;
          priority?: string | null;
          provider_kind?: string | null;
          risk_reasons?: Json;
          risk_score?: number | null;
          satisfaction_prediction?: string | null;
          satisfaction_score?: number | null;
          search_text?: string | null;
          sentiment?: string | null;
          sentiment_score?: number | null;
          spam_score?: number | null;
          summary?: string | null;
          tokens_used?: number;
          topics?: string[];
          updated_at?: string;
          urgency?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_intelligence_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: true;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_intelligence_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_label_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          conversation_id: string;
          label_id: string;
          workspace_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          conversation_id: string;
          label_id: string;
          workspace_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          conversation_id?: string;
          label_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_label_assignments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_label_assignments_label_id_fkey";
            columns: ["label_id"];
            isOneToOne: false;
            referencedRelation: "conversation_labels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_label_assignments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_labels: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_system: boolean;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_labels_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "conversation_labels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_labels_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_notes: {
        Row: {
          author_id: string | null;
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          is_pinned: boolean;
          mentions: string[];
          pinned_at: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          is_pinned?: boolean;
          mentions?: string[];
          pinned_at?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          is_pinned?: boolean;
          mentions?: string[];
          pinned_at?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_notes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_participants: {
        Row: {
          contact_id: string | null;
          conversation_id: string;
          id: string;
          is_muted: boolean;
          joined_at: string;
          last_read_at: string | null;
          last_typed_at: string | null;
          left_at: string | null;
          role: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          contact_id?: string | null;
          conversation_id: string;
          id?: string;
          is_muted?: boolean;
          joined_at?: string;
          last_read_at?: string | null;
          last_typed_at?: string | null;
          left_at?: string | null;
          role?: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          contact_id?: string | null;
          conversation_id?: string;
          id?: string;
          is_muted?: boolean;
          joined_at?: string;
          last_read_at?: string | null;
          last_typed_at?: string | null;
          left_at?: string | null;
          role?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_read_state: {
        Row: {
          conversation_id: string;
          last_read_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          last_read_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_read_state_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_sla: {
        Row: {
          conversation_id: string;
          created_at: string;
          first_response_at: string | null;
          first_response_breached_at: string | null;
          first_response_due_at: string | null;
          id: string;
          is_paused: boolean;
          next_response_due_at: string | null;
          paused_at: string | null;
          policy_id: string | null;
          resolution_breached_at: string | null;
          resolution_due_at: string | null;
          response_breached_at: string | null;
          started_at: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          first_response_at?: string | null;
          first_response_breached_at?: string | null;
          first_response_due_at?: string | null;
          id?: string;
          is_paused?: boolean;
          next_response_due_at?: string | null;
          paused_at?: string | null;
          policy_id?: string | null;
          resolution_breached_at?: string | null;
          resolution_due_at?: string | null;
          response_breached_at?: string | null;
          started_at?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          first_response_at?: string | null;
          first_response_breached_at?: string | null;
          first_response_due_at?: string | null;
          id?: string;
          is_paused?: boolean;
          next_response_due_at?: string | null;
          paused_at?: string | null;
          policy_id?: string | null;
          resolution_breached_at?: string | null;
          resolution_due_at?: string | null;
          response_breached_at?: string | null;
          started_at?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_sla_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: true;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_sla_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "sla_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_sla_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_transfers: {
        Row: {
          conversation_id: string;
          created_at: string;
          from_user_id: string | null;
          id: string;
          note: string | null;
          performed_by: string;
          reason: string | null;
          session_id: string | null;
          to_department_id: string | null;
          to_user_id: string | null;
          transfer_type: string;
          workspace_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          from_user_id?: string | null;
          id?: string;
          note?: string | null;
          performed_by: string;
          reason?: string | null;
          session_id?: string | null;
          to_department_id?: string | null;
          to_user_id?: string | null;
          transfer_type?: string;
          workspace_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          from_user_id?: string | null;
          id?: string;
          note?: string | null;
          performed_by?: string;
          reason?: string | null;
          session_id?: string | null;
          to_department_id?: string | null;
          to_user_id?: string | null;
          transfer_type?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      conversation_typing: {
        Row: {
          conversation_id: string;
          expires_at: string;
          started_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          conversation_id: string;
          expires_at?: string;
          started_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          conversation_id?: string;
          expires_at?: string;
          started_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_typing_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_typing_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          ai_enabled: boolean;
          ai_summary: string | null;
          assigned_at: string | null;
          assigned_team_id: string | null;
          assigned_to: string | null;
          channel: Database["public"]["Enums"]["inbox_channel"];
          channel_account_id: string | null;
          contact_id: string;
          created_at: string;
          custom_fields: Json;
          deleted_at: string | null;
          department_id: string | null;
          description: string | null;
          escalation_level: number | null;
          external_conversation_id: string | null;
          first_response_at: string | null;
          handoff_state: string;
          id: string;
          inbox_id: string | null;
          is_archived: boolean;
          is_demo: boolean;
          last_message_at: string | null;
          last_message_from: string | null;
          last_message_preview: string | null;
          merged_into_id: string | null;
          metadata: Json;
          parent_ticket_id: string | null;
          priority: Database["public"]["Enums"]["conversation_priority"];
          resolved_at: string | null;
          resolved_by: string | null;
          snoozed_until: string | null;
          status: Database["public"]["Enums"]["conversation_status"];
          subcategory_id: string | null;
          subject: string | null;
          tags: Json;
          ticket_category_id: string | null;
          ticket_number: number | null;
          ticket_type: string | null;
          unread_count: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          ai_enabled?: boolean;
          ai_summary?: string | null;
          assigned_at?: string | null;
          assigned_team_id?: string | null;
          assigned_to?: string | null;
          channel?: Database["public"]["Enums"]["inbox_channel"];
          channel_account_id?: string | null;
          contact_id: string;
          created_at?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          department_id?: string | null;
          description?: string | null;
          escalation_level?: number | null;
          external_conversation_id?: string | null;
          first_response_at?: string | null;
          handoff_state?: string;
          id?: string;
          inbox_id?: string | null;
          is_archived?: boolean;
          is_demo?: boolean;
          last_message_at?: string | null;
          last_message_from?: string | null;
          last_message_preview?: string | null;
          merged_into_id?: string | null;
          metadata?: Json;
          parent_ticket_id?: string | null;
          priority?: Database["public"]["Enums"]["conversation_priority"];
          resolved_at?: string | null;
          resolved_by?: string | null;
          snoozed_until?: string | null;
          status?: Database["public"]["Enums"]["conversation_status"];
          subcategory_id?: string | null;
          subject?: string | null;
          tags?: Json;
          ticket_category_id?: string | null;
          ticket_number?: number | null;
          ticket_type?: string | null;
          unread_count?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          ai_enabled?: boolean;
          ai_summary?: string | null;
          assigned_at?: string | null;
          assigned_team_id?: string | null;
          assigned_to?: string | null;
          channel?: Database["public"]["Enums"]["inbox_channel"];
          channel_account_id?: string | null;
          contact_id?: string;
          created_at?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          department_id?: string | null;
          description?: string | null;
          escalation_level?: number | null;
          external_conversation_id?: string | null;
          first_response_at?: string | null;
          handoff_state?: string;
          id?: string;
          inbox_id?: string | null;
          is_archived?: boolean;
          is_demo?: boolean;
          last_message_at?: string | null;
          last_message_from?: string | null;
          last_message_preview?: string | null;
          merged_into_id?: string | null;
          metadata?: Json;
          parent_ticket_id?: string | null;
          priority?: Database["public"]["Enums"]["conversation_priority"];
          resolved_at?: string | null;
          resolved_by?: string | null;
          snoozed_until?: string | null;
          status?: Database["public"]["Enums"]["conversation_status"];
          subcategory_id?: string | null;
          subject?: string | null;
          tags?: Json;
          ticket_category_id?: string | null;
          ticket_number?: number | null;
          ticket_type?: string | null;
          unread_count?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_profiles_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_inbox_id_fkey";
            columns: ["inbox_id"];
            isOneToOne: false;
            referencedRelation: "inboxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_merged_into_id_fkey";
            columns: ["merged_into_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_parent_ticket_id_fkey";
            columns: ["parent_ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_subcategory_id_fkey";
            columns: ["subcategory_id"];
            isOneToOne: false;
            referencedRelation: "ticket_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_ticket_category_id_fkey";
            columns: ["ticket_category_id"];
            isOneToOne: false;
            referencedRelation: "ticket_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      cookie_consents: {
        Row: {
          categories: Json;
          created_at: string;
          decision: string;
          id: string;
          page_path: string | null;
          policy_version: string;
          referrer: string | null;
          updated_at: string;
          user_agent: string | null;
          user_id: string | null;
          visitor_id: string;
        };
        Insert: {
          categories?: Json;
          created_at?: string;
          decision: string;
          id?: string;
          page_path?: string | null;
          policy_version?: string;
          referrer?: string | null;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          visitor_id: string;
        };
        Update: {
          categories?: Json;
          created_at?: string;
          decision?: string;
          id?: string;
          page_path?: string | null;
          policy_version?: string;
          referrer?: string | null;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          visitor_id?: string;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          amount_off_cents: number | null;
          applies_to_plan_ids: string[];
          code: string;
          created_at: string;
          currency: string;
          description: string | null;
          discount_type: string;
          duration: string;
          duration_in_months: number | null;
          id: string;
          is_active: boolean;
          max_redemptions: number | null;
          name: string;
          percent_off: number | null;
          provider_coupon_ids: Json;
          redeem_by: string | null;
          times_redeemed: number;
          updated_at: string;
        };
        Insert: {
          amount_off_cents?: number | null;
          applies_to_plan_ids?: string[];
          code: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          discount_type?: string;
          duration?: string;
          duration_in_months?: number | null;
          id?: string;
          is_active?: boolean;
          max_redemptions?: number | null;
          name: string;
          percent_off?: number | null;
          provider_coupon_ids?: Json;
          redeem_by?: string | null;
          times_redeemed?: number;
          updated_at?: string;
        };
        Update: {
          amount_off_cents?: number | null;
          applies_to_plan_ids?: string[];
          code?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          discount_type?: string;
          duration?: string;
          duration_in_months?: number | null;
          id?: string;
          is_active?: boolean;
          max_redemptions?: number | null;
          name?: string;
          percent_off?: number | null;
          provider_coupon_ids?: Json;
          redeem_by?: string | null;
          times_redeemed?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_segments: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          entity_type: string;
          icon: string | null;
          id: string;
          is_dynamic: boolean;
          is_favorite: boolean;
          is_shared: boolean;
          name: string;
          position: number;
          rules: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          entity_type: string;
          icon?: string | null;
          id?: string;
          is_dynamic?: boolean;
          is_favorite?: boolean;
          is_shared?: boolean;
          name: string;
          position?: number;
          rules?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          entity_type?: string;
          icon?: string | null;
          id?: string;
          is_dynamic?: boolean;
          is_favorite?: boolean;
          is_shared?: boolean;
          name?: string;
          position?: number;
          rules?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_segments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_tag_assignments: {
        Row: {
          created_at: string;
          created_by: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          tag_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          tag_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          tag_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_tag_assignments_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "crm_tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tag_assignments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_tags: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_ai_generated: boolean;
          is_favorite: boolean;
          is_smart: boolean;
          name: string;
          parent_id: string | null;
          position: number;
          rules: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_ai_generated?: boolean;
          is_favorite?: boolean;
          is_smart?: boolean;
          name: string;
          parent_id?: string | null;
          position?: number;
          rules?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_ai_generated?: boolean;
          is_favorite?: boolean;
          is_smart?: boolean;
          name?: string;
          parent_id?: string | null;
          position?: number;
          rules?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_tags_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "crm_tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tags_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      csat_responses: {
        Row: {
          agent_id: string | null;
          ces_score: number | null;
          comment: string | null;
          contact_id: string | null;
          created_at: string;
          department_id: string | null;
          follow_up_response_id: string | null;
          id: string;
          is_published: boolean;
          metadata: Json;
          nps_score: number | null;
          rating: number | null;
          response_token: string | null;
          responses: Json;
          score_type: string | null;
          sentiment: string | null;
          submitted_at: string;
          survey_id: string | null;
          ticket_id: string | null;
          workspace_id: string;
        };
        Insert: {
          agent_id?: string | null;
          ces_score?: number | null;
          comment?: string | null;
          contact_id?: string | null;
          created_at?: string;
          department_id?: string | null;
          follow_up_response_id?: string | null;
          id?: string;
          is_published?: boolean;
          metadata?: Json;
          nps_score?: number | null;
          rating?: number | null;
          response_token?: string | null;
          responses?: Json;
          score_type?: string | null;
          sentiment?: string | null;
          submitted_at?: string;
          survey_id?: string | null;
          ticket_id?: string | null;
          workspace_id: string;
        };
        Update: {
          agent_id?: string | null;
          ces_score?: number | null;
          comment?: string | null;
          contact_id?: string | null;
          created_at?: string;
          department_id?: string | null;
          follow_up_response_id?: string | null;
          id?: string;
          is_published?: boolean;
          metadata?: Json;
          nps_score?: number | null;
          rating?: number | null;
          response_token?: string | null;
          responses?: Json;
          score_type?: string | null;
          sentiment?: string | null;
          submitted_at?: string;
          survey_id?: string | null;
          ticket_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "csat_responses_follow_up_response_id_fkey";
            columns: ["follow_up_response_id"];
            isOneToOne: false;
            referencedRelation: "csat_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "csat_responses_survey_id_fkey";
            columns: ["survey_id"];
            isOneToOne: false;
            referencedRelation: "csat_surveys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "csat_responses_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      csat_surveys: {
        Row: {
          automation_config: Json;
          branding: Json;
          channel: string;
          created_at: string;
          created_by: string | null;
          delay_minutes: number | null;
          department_id: string | null;
          description: string | null;
          follow_up_question: string | null;
          follow_up_survey_id: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          public_token: string | null;
          question: string;
          questions: Json;
          scale: string;
          send_on: string;
          survey_type: string;
          target_audience: Json;
          template_id: string | null;
          thank_you_message: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          automation_config?: Json;
          branding?: Json;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          delay_minutes?: number | null;
          department_id?: string | null;
          description?: string | null;
          follow_up_question?: string | null;
          follow_up_survey_id?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          public_token?: string | null;
          question?: string;
          questions?: Json;
          scale?: string;
          send_on?: string;
          survey_type?: string;
          target_audience?: Json;
          template_id?: string | null;
          thank_you_message?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          automation_config?: Json;
          branding?: Json;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          delay_minutes?: number | null;
          department_id?: string | null;
          description?: string | null;
          follow_up_question?: string | null;
          follow_up_survey_id?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          public_token?: string | null;
          question?: string;
          questions?: Json;
          scale?: string;
          send_on?: string;
          survey_type?: string;
          target_audience?: Json;
          template_id?: string | null;
          thank_you_message?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "csat_surveys_follow_up_survey_id_fkey";
            columns: ["follow_up_survey_id"];
            isOneToOne: false;
            referencedRelation: "csat_surveys";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_field_definitions: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_value: Json | null;
          deleted_at: string | null;
          description: string | null;
          entity_type: string;
          field_type: string;
          help_text: string | null;
          id: string;
          is_required: boolean;
          is_unique: boolean;
          is_visible: boolean;
          key: string;
          label: string;
          options: Json | null;
          placeholder: string | null;
          position: number;
          relationship_entity: string | null;
          section: string | null;
          updated_at: string;
          validation: Json | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_value?: Json | null;
          deleted_at?: string | null;
          description?: string | null;
          entity_type: string;
          field_type: string;
          help_text?: string | null;
          id?: string;
          is_required?: boolean;
          is_unique?: boolean;
          is_visible?: boolean;
          key: string;
          label: string;
          options?: Json | null;
          placeholder?: string | null;
          position?: number;
          relationship_entity?: string | null;
          section?: string | null;
          updated_at?: string;
          validation?: Json | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_value?: Json | null;
          deleted_at?: string | null;
          description?: string | null;
          entity_type?: string;
          field_type?: string;
          help_text?: string | null;
          id?: string;
          is_required?: boolean;
          is_unique?: boolean;
          is_visible?: boolean;
          key?: string;
          label?: string;
          options?: Json | null;
          placeholder?: string | null;
          position?: number;
          relationship_entity?: string | null;
          section?: string | null;
          updated_at?: string;
          validation?: Json | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_segments: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          filter_definition: Json;
          icon: string | null;
          id: string;
          is_dynamic: boolean;
          last_computed_at: string | null;
          member_count: number;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          filter_definition?: Json;
          icon?: string | null;
          id?: string;
          is_dynamic?: boolean;
          last_computed_at?: string | null;
          member_count?: number;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          filter_definition?: Json;
          icon?: string | null;
          id?: string;
          is_dynamic?: boolean;
          last_computed_at?: string | null;
          member_count?: number;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_segments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      data_retention_policies: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          last_deleted_count: number;
          last_run_at: string | null;
          resource: string;
          retention_days: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_deleted_count?: number;
          last_run_at?: string | null;
          resource: string;
          retention_days: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_deleted_count?: number;
          last_run_at?: string | null;
          resource?: string;
          retention_days?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_line_items: {
        Row: {
          created_at: string;
          deal_id: string;
          description: string | null;
          discount_pct: number;
          id: string;
          name: string;
          product_id: string | null;
          quantity: number;
          sort_order: number;
          subtotal: number;
          tax_rate: number;
          total: number;
          unit_price: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          deal_id: string;
          description?: string | null;
          discount_pct?: number;
          id?: string;
          name: string;
          product_id?: string | null;
          quantity?: number;
          sort_order?: number;
          subtotal?: number;
          tax_rate?: number;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          deal_id?: string;
          description?: string | null;
          discount_pct?: number;
          id?: string;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          sort_order?: number;
          subtotal?: number;
          tax_rate?: number;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_line_items_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_line_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_line_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_pipelines: {
        Row: {
          color: string | null;
          created_at: string;
          default_currency: string;
          deleted_at: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_default: boolean;
          name: string;
          position: number;
          stale_after_days: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          default_currency?: string;
          deleted_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_default?: boolean;
          name: string;
          position?: number;
          stale_after_days?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          default_currency?: string;
          deleted_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_default?: boolean;
          name?: string;
          position?: number;
          stale_after_days?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_pipelines_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_stage_history: {
        Row: {
          amount: number | null;
          created_at: string;
          currency: string | null;
          deal_id: string;
          duration_seconds: number | null;
          from_stage_id: string | null;
          from_status: string | null;
          id: string;
          moved_by: string | null;
          pipeline_id: string | null;
          to_stage_id: string | null;
          to_status: string | null;
          workspace_id: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          deal_id: string;
          duration_seconds?: number | null;
          from_stage_id?: string | null;
          from_status?: string | null;
          id?: string;
          moved_by?: string | null;
          pipeline_id?: string | null;
          to_stage_id?: string | null;
          to_status?: string | null;
          workspace_id: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          deal_id?: string;
          duration_seconds?: number | null;
          from_stage_id?: string | null;
          from_status?: string | null;
          id?: string;
          moved_by?: string | null;
          pipeline_id?: string | null;
          to_stage_id?: string | null;
          to_status?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_from_stage_id_fkey";
            columns: ["from_stage_id"];
            isOneToOne: false;
            referencedRelation: "deal_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "deal_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_to_stage_id_fkey";
            columns: ["to_stage_id"];
            isOneToOne: false;
            referencedRelation: "deal_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_stages: {
        Row: {
          aging_days: number | null;
          automations: Json;
          color: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_lost: boolean;
          is_won: boolean;
          name: string;
          pipeline_id: string;
          position: number;
          probability: number;
          rules: Json;
          stage_type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          aging_days?: number | null;
          automations?: Json;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_lost?: boolean;
          is_won?: boolean;
          name: string;
          pipeline_id: string;
          position?: number;
          probability?: number;
          rules?: Json;
          stage_type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          aging_days?: number | null;
          automations?: Json;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_lost?: boolean;
          is_won?: boolean;
          name?: string;
          pipeline_id?: string;
          position?: number;
          probability?: number;
          rules?: Json;
          stage_type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_stages_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "deal_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          actual_close_date: string | null;
          amount: number;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          custom_fields: Json;
          deleted_at: string | null;
          description: string | null;
          expected_close_date: string | null;
          id: string;
          loss_reason: string | null;
          organization_id: string | null;
          owner_id: string | null;
          pipeline_id: string | null;
          priority: string;
          probability: number;
          source: string | null;
          stage_id: string | null;
          status: string;
          tags: string[] | null;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          actual_close_date?: string | null;
          amount?: number;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          expected_close_date?: string | null;
          id?: string;
          loss_reason?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          pipeline_id?: string | null;
          priority?: string;
          probability?: number;
          source?: string | null;
          stage_id?: string | null;
          status?: string;
          tags?: string[] | null;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          actual_close_date?: string | null;
          amount?: number;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          expected_close_date?: string | null;
          id?: string;
          loss_reason?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          pipeline_id?: string | null;
          priority?: string;
          probability?: number;
          source?: string | null;
          stage_id?: string | null;
          status?: string;
          tags?: string[] | null;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "deal_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "deal_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      department_members: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          priority: number;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          priority?: number;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          priority?: number;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "department_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          color: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          fallback_agent_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fallback_agent_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fallback_agent_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_sequences: {
        Row: {
          kind: string;
          next_value: number;
          pad_width: number;
          prefix: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          kind: string;
          next_value?: number;
          pad_width?: number;
          prefix?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          kind?: string;
          next_value?: number;
          pad_width?: number;
          prefix?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_sequences_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      drip_enrollments: {
        Row: {
          completed_at: string | null;
          contact_id: string;
          context: Json;
          created_at: string;
          current_step: number;
          exit_reason: string | null;
          id: string;
          last_run_at: string | null;
          next_run_at: string | null;
          sequence_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          contact_id: string;
          context?: Json;
          created_at?: string;
          current_step?: number;
          exit_reason?: string | null;
          id?: string;
          last_run_at?: string | null;
          next_run_at?: string | null;
          sequence_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          contact_id?: string;
          context?: Json;
          created_at?: string;
          current_step?: number;
          exit_reason?: string | null;
          id?: string;
          last_run_at?: string | null;
          next_run_at?: string | null;
          sequence_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drip_enrollments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drip_enrollments_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "drip_sequences";
            referencedColumns: ["id"];
          },
        ];
      };
      drip_sequences: {
        Row: {
          completed_count: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          enrolled_count: number;
          exit_conditions: Json;
          id: string;
          name: string;
          respect_opt_out: boolean;
          segment_id: string | null;
          status: string;
          trigger_config: Json;
          trigger_type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          completed_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          enrolled_count?: number;
          exit_conditions?: Json;
          id?: string;
          name: string;
          respect_opt_out?: boolean;
          segment_id?: string | null;
          status?: string;
          trigger_config?: Json;
          trigger_type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          completed_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          enrolled_count?: number;
          exit_conditions?: Json;
          id?: string;
          name?: string;
          respect_opt_out?: boolean;
          segment_id?: string | null;
          status?: string;
          trigger_config?: Json;
          trigger_type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drip_sequences_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "customer_segments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drip_sequences_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      drip_steps: {
        Row: {
          actions: Json;
          condition: Json | null;
          created_at: string;
          delay_seconds: number;
          id: string;
          media_url: string | null;
          message_body: string | null;
          name: string | null;
          sequence_id: string;
          step_order: number;
          step_type: string;
          template_id: string | null;
          updated_at: string;
          variables: Json;
        };
        Insert: {
          actions?: Json;
          condition?: Json | null;
          created_at?: string;
          delay_seconds?: number;
          id?: string;
          media_url?: string | null;
          message_body?: string | null;
          name?: string | null;
          sequence_id: string;
          step_order: number;
          step_type?: string;
          template_id?: string | null;
          updated_at?: string;
          variables?: Json;
        };
        Update: {
          actions?: Json;
          condition?: Json | null;
          created_at?: string;
          delay_seconds?: number;
          id?: string;
          media_url?: string | null;
          message_body?: string | null;
          name?: string | null;
          sequence_id?: string;
          step_order?: number;
          step_type?: string;
          template_id?: string | null;
          updated_at?: string;
          variables?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "drip_steps_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "drip_sequences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drip_steps_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "wa_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      ecommerce_connections: {
        Row: {
          created_at: string;
          created_by: string | null;
          credentials: Json;
          customers_synced: number;
          id: string;
          last_error: string | null;
          last_sync_at: string | null;
          name: string;
          orders_synced: number;
          platform: string;
          products_synced: number;
          status: string;
          store_url: string;
          sync_settings: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          credentials?: Json;
          customers_synced?: number;
          id?: string;
          last_error?: string | null;
          last_sync_at?: string | null;
          name: string;
          orders_synced?: number;
          platform: string;
          products_synced?: number;
          status?: string;
          store_url: string;
          sync_settings?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          credentials?: Json;
          customers_synced?: number;
          id?: string;
          last_error?: string | null;
          last_sync_at?: string | null;
          name?: string;
          orders_synced?: number;
          platform?: string;
          products_synced?: number;
          status?: string;
          store_url?: string;
          sync_settings?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ecommerce_sync_logs: {
        Row: {
          connection_id: string;
          direction: string;
          finished_at: string | null;
          id: string;
          items_failed: number;
          items_processed: number;
          message: string | null;
          resource: string;
          started_at: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          connection_id: string;
          direction?: string;
          finished_at?: string | null;
          id?: string;
          items_failed?: number;
          items_processed?: number;
          message?: string | null;
          resource: string;
          started_at?: string;
          status?: string;
          workspace_id: string;
        };
        Update: {
          connection_id?: string;
          direction?: string;
          finished_at?: string | null;
          id?: string;
          items_failed?: number;
          items_processed?: number;
          message?: string | null;
          resource?: string;
          started_at?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ecommerce_sync_logs_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "ecommerce_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      email_accounts: {
        Row: {
          connected_at: string;
          connected_by: string | null;
          created_at: string;
          display_name: string;
          from_email: string;
          from_name: string | null;
          id: string;
          inbound_address: string | null;
          last_verified_at: string | null;
          metadata: Json;
          provider: string;
          reply_to: string | null;
          status: string;
          status_reason: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          display_name: string;
          from_email: string;
          from_name?: string | null;
          id?: string;
          inbound_address?: string | null;
          last_verified_at?: string | null;
          metadata?: Json;
          provider?: string;
          reply_to?: string | null;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          display_name?: string;
          from_email?: string;
          from_name?: string | null;
          id?: string;
          inbound_address?: string | null;
          last_verified_at?: string | null;
          metadata?: Json;
          provider?: string;
          reply_to?: string | null;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      export_jobs: {
        Row: {
          attempts: number;
          columns: string[];
          created_at: string;
          created_by: string;
          cron: string | null;
          dataset: Database["public"]["Enums"]["export_dataset"];
          description: string | null;
          duration_ms: number | null;
          error: string | null;
          expires_at: string | null;
          file_bucket: string | null;
          file_path: string | null;
          file_size: number | null;
          filters: Json;
          finished_at: string | null;
          format: Database["public"]["Enums"]["export_format"];
          id: string;
          last_run_at: string | null;
          locked_at: string | null;
          locked_by: string | null;
          name: string;
          next_run_at: string | null;
          recurrence: Database["public"]["Enums"]["export_recurrence"];
          report_id: string | null;
          row_count: number | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["export_status"];
          updated_at: string;
          visibility: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          columns?: string[];
          created_at?: string;
          created_by: string;
          cron?: string | null;
          dataset: Database["public"]["Enums"]["export_dataset"];
          description?: string | null;
          duration_ms?: number | null;
          error?: string | null;
          expires_at?: string | null;
          file_bucket?: string | null;
          file_path?: string | null;
          file_size?: number | null;
          filters?: Json;
          finished_at?: string | null;
          format: Database["public"]["Enums"]["export_format"];
          id?: string;
          last_run_at?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          name: string;
          next_run_at?: string | null;
          recurrence?: Database["public"]["Enums"]["export_recurrence"];
          report_id?: string | null;
          row_count?: number | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["export_status"];
          updated_at?: string;
          visibility?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          columns?: string[];
          created_at?: string;
          created_by?: string;
          cron?: string | null;
          dataset?: Database["public"]["Enums"]["export_dataset"];
          description?: string | null;
          duration_ms?: number | null;
          error?: string | null;
          expires_at?: string | null;
          file_bucket?: string | null;
          file_path?: string | null;
          file_size?: number | null;
          filters?: Json;
          finished_at?: string | null;
          format?: Database["public"]["Enums"]["export_format"];
          id?: string;
          last_run_at?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          name?: string;
          next_run_at?: string | null;
          recurrence?: Database["public"]["Enums"]["export_recurrence"];
          report_id?: string | null;
          row_count?: number | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["export_status"];
          updated_at?: string;
          visibility?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      files: {
        Row: {
          bucket: string;
          checksum: string | null;
          created_at: string;
          id: string;
          is_public: boolean;
          metadata: Json;
          mime_type: string | null;
          name: string;
          organization_id: string | null;
          path: string;
          size_bytes: number;
          updated_at: string;
          uploader_id: string;
          workspace_id: string | null;
        };
        Insert: {
          bucket: string;
          checksum?: string | null;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          metadata?: Json;
          mime_type?: string | null;
          name: string;
          organization_id?: string | null;
          path: string;
          size_bytes?: number;
          updated_at?: string;
          uploader_id: string;
          workspace_id?: string | null;
        };
        Update: {
          bucket?: string;
          checksum?: string | null;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          metadata?: Json;
          mime_type?: string | null;
          name?: string;
          organization_id?: string | null;
          path?: string;
          size_bytes?: number;
          updated_at?: string;
          uploader_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "files_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "files_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      gdpr_requests: {
        Row: {
          completed_at: string | null;
          created_at: string;
          due_at: string;
          export_expires_at: string | null;
          export_url: string | null;
          id: string;
          notes: string | null;
          reason: string | null;
          request_type: string;
          requested_at: string;
          requested_by: string | null;
          status: string;
          subject_id: string;
          subject_identifier: string | null;
          subject_type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          due_at?: string;
          export_expires_at?: string | null;
          export_url?: string | null;
          id?: string;
          notes?: string | null;
          reason?: string | null;
          request_type: string;
          requested_at?: string;
          requested_by?: string | null;
          status?: string;
          subject_id: string;
          subject_identifier?: string | null;
          subject_type: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          due_at?: string;
          export_expires_at?: string | null;
          export_url?: string | null;
          id?: string;
          notes?: string | null;
          reason?: string | null;
          request_type?: string;
          requested_at?: string;
          requested_by?: string | null;
          status?: string;
          subject_id?: string;
          subject_identifier?: string | null;
          subject_type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gdpr_requests_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      handoff_events: {
        Row: {
          actor_id: string | null;
          conversation_id: string;
          created_at: string;
          from_department_id: string | null;
          from_user_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["handoff_event_kind"];
          metadata: Json;
          note: string | null;
          reason: string | null;
          to_department_id: string | null;
          to_user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          actor_id?: string | null;
          conversation_id: string;
          created_at?: string;
          from_department_id?: string | null;
          from_user_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["handoff_event_kind"];
          metadata?: Json;
          note?: string | null;
          reason?: string | null;
          to_department_id?: string | null;
          to_user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          actor_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          from_department_id?: string | null;
          from_user_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["handoff_event_kind"];
          metadata?: Json;
          note?: string | null;
          reason?: string | null;
          to_department_id?: string | null;
          to_user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "handoff_events_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoff_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      handoff_queue: {
        Row: {
          assigned_at: string | null;
          assigned_to: string | null;
          conversation_id: string;
          entered_at: string;
          id: string;
          metadata: Json;
          priority: Database["public"]["Enums"]["handoff_priority"];
          reason: string | null;
          requested_by: string | null;
          required_skills: string[];
          status: string;
          target_department_id: string | null;
          target_user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          conversation_id: string;
          entered_at?: string;
          id?: string;
          metadata?: Json;
          priority?: Database["public"]["Enums"]["handoff_priority"];
          reason?: string | null;
          requested_by?: string | null;
          required_skills?: string[];
          status?: string;
          target_department_id?: string | null;
          target_user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          conversation_id?: string;
          entered_at?: string;
          id?: string;
          metadata?: Json;
          priority?: Database["public"]["Enums"]["handoff_priority"];
          reason?: string | null;
          requested_by?: string | null;
          required_skills?: string[];
          status?: string;
          target_department_id?: string | null;
          target_user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "handoff_queue_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoff_queue_target_department_id_fkey";
            columns: ["target_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoff_queue_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      identity_engine_config: {
        Row: {
          ai_confidence_threshold: number;
          ai_matching_enabled: boolean;
          auto_merge_on_email: boolean;
          auto_merge_on_phone: boolean;
          duplicate_scan_window_days: number;
          require_manual_approval: boolean;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        Insert: {
          ai_confidence_threshold?: number;
          ai_matching_enabled?: boolean;
          auto_merge_on_email?: boolean;
          auto_merge_on_phone?: boolean;
          duplicate_scan_window_days?: number;
          require_manual_approval?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          ai_confidence_threshold?: number;
          ai_matching_enabled?: boolean;
          auto_merge_on_email?: boolean;
          auto_merge_on_phone?: boolean;
          duplicate_scan_window_days?: number;
          require_manual_approval?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      identity_merges: {
        Row: {
          created_at: string;
          id: string;
          is_reverted: boolean;
          merge_reason: string | null;
          merged_by: string | null;
          merged_contact_id: string;
          merged_snapshot: Json;
          moved_identity_ids: string[];
          primary_contact_id: string;
          reverted_at: string | null;
          reverted_by: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_reverted?: boolean;
          merge_reason?: string | null;
          merged_by?: string | null;
          merged_contact_id: string;
          merged_snapshot: Json;
          moved_identity_ids?: string[];
          primary_contact_id: string;
          reverted_at?: string | null;
          reverted_by?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_reverted?: boolean;
          merge_reason?: string | null;
          merged_by?: string | null;
          merged_contact_id?: string;
          merged_snapshot?: Json;
          moved_identity_ids?: string[];
          primary_contact_id?: string;
          reverted_at?: string | null;
          reverted_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      inbound_webhook_deliveries: {
        Row: {
          delivery_key: string;
          error_message: string | null;
          id: string;
          payload: Json;
          processed_at: string | null;
          provider: string;
          received_at: string;
          signature_verified: boolean;
          status: string;
          workspace_id: string | null;
        };
        Insert: {
          delivery_key: string;
          error_message?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
          signature_verified?: boolean;
          status?: string;
          workspace_id?: string | null;
        };
        Update: {
          delivery_key?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
          signature_verified?: boolean;
          status?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inbound_webhook_deliveries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      inbox_members: {
        Row: {
          added_at: string;
          inbox_id: string;
          notifications_enabled: boolean;
          role: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          inbox_id: string;
          notifications_enabled?: boolean;
          role?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          inbox_id?: string;
          notifications_enabled?: boolean;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbox_members_inbox_id_fkey";
            columns: ["inbox_id"];
            isOneToOne: false;
            referencedRelation: "inboxes";
            referencedColumns: ["id"];
          },
        ];
      };
      inboxes: {
        Row: {
          auto_assignment_enabled: boolean;
          auto_assignment_strategy: string | null;
          business_hours: Json;
          channel: Database["public"]["Enums"]["inbox_channel"];
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_archived: boolean;
          is_default: boolean;
          name: string;
          provider_config: Json;
          settings: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          auto_assignment_enabled?: boolean;
          auto_assignment_strategy?: string | null;
          business_hours?: Json;
          channel?: Database["public"]["Enums"]["inbox_channel"];
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          name: string;
          provider_config?: Json;
          settings?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          auto_assignment_enabled?: boolean;
          auto_assignment_strategy?: string | null;
          business_hours?: Json;
          channel?: Database["public"]["Enums"]["inbox_channel"];
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          name?: string;
          provider_config?: Json;
          settings?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inboxes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_accounts: {
        Row: {
          access_token_ciphertext: string | null;
          connected_at: string;
          connected_by: string | null;
          created_at: string;
          id: string;
          ig_user_id: string;
          last_verified_at: string | null;
          metadata: Json;
          name: string | null;
          page_id: string | null;
          page_name: string | null;
          profile_picture_url: string | null;
          scopes: string[];
          status: string;
          status_reason: string | null;
          token_expires_at: string | null;
          updated_at: string;
          username: string | null;
          workspace_id: string;
        };
        Insert: {
          access_token_ciphertext?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          id?: string;
          ig_user_id: string;
          last_verified_at?: string | null;
          metadata?: Json;
          name?: string | null;
          page_id?: string | null;
          page_name?: string | null;
          profile_picture_url?: string | null;
          scopes?: string[];
          status?: string;
          status_reason?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          username?: string | null;
          workspace_id: string;
        };
        Update: {
          access_token_ciphertext?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          id?: string;
          ig_user_id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          name?: string | null;
          page_id?: string | null;
          page_name?: string | null;
          profile_picture_url?: string | null;
          scopes?: string[];
          status?: string;
          status_reason?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          username?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_comment_automation_logs: {
        Row: {
          actions_taken: Json;
          automation_id: string;
          comment_id: string | null;
          comment_text: string | null;
          commenter_ig_id: string | null;
          commenter_username: string | null;
          created_at: string;
          error: string | null;
          id: string;
          instagram_account_id: string | null;
          match_reason: string | null;
          matched: boolean;
          matched_keywords: string[];
          post_id: string | null;
          processed_at: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          actions_taken?: Json;
          automation_id: string;
          comment_id?: string | null;
          comment_text?: string | null;
          commenter_ig_id?: string | null;
          commenter_username?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          instagram_account_id?: string | null;
          match_reason?: string | null;
          matched?: boolean;
          matched_keywords?: string[];
          post_id?: string | null;
          processed_at?: string;
          status?: string;
          workspace_id: string;
        };
        Update: {
          actions_taken?: Json;
          automation_id?: string;
          comment_id?: string | null;
          comment_text?: string | null;
          commenter_ig_id?: string | null;
          commenter_username?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          instagram_account_id?: string | null;
          match_reason?: string | null;
          matched?: boolean;
          matched_keywords?: string[];
          post_id?: string | null;
          processed_at?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "instagram_comment_automation_logs_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instagram_comment_automation_logs_instagram_account_id_fkey";
            columns: ["instagram_account_id"];
            isOneToOne: false;
            referencedRelation: "instagram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_oauth_states: {
        Row: {
          created_at: string;
          expires_at: string;
          redirect_uri: string;
          return_to: string | null;
          state: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          redirect_uri: string;
          return_to?: string | null;
          state: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          redirect_uri?: string;
          return_to?: string | null;
          state?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "instagram_oauth_states_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_webhook_events: {
        Row: {
          attachments: Json;
          chatbot_id: string | null;
          created_at: string;
          error: string | null;
          event_type: string;
          id: string;
          instagram_account_id: string | null;
          processed_at: string | null;
          provider_message_id: string | null;
          raw_payload: Json;
          recipient_id: string | null;
          reply_sent: boolean;
          reply_text: string | null;
          sender_id: string | null;
          session_id: string | null;
          signature_valid: boolean;
          status: string;
          text: string | null;
          workspace_id: string | null;
        };
        Insert: {
          attachments?: Json;
          chatbot_id?: string | null;
          created_at?: string;
          error?: string | null;
          event_type?: string;
          id?: string;
          instagram_account_id?: string | null;
          processed_at?: string | null;
          provider_message_id?: string | null;
          raw_payload?: Json;
          recipient_id?: string | null;
          reply_sent?: boolean;
          reply_text?: string | null;
          sender_id?: string | null;
          session_id?: string | null;
          signature_valid?: boolean;
          status?: string;
          text?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          attachments?: Json;
          chatbot_id?: string | null;
          created_at?: string;
          error?: string | null;
          event_type?: string;
          id?: string;
          instagram_account_id?: string | null;
          processed_at?: string | null;
          provider_message_id?: string | null;
          raw_payload?: Json;
          recipient_id?: string | null;
          reply_sent?: boolean;
          reply_text?: string | null;
          sender_id?: string | null;
          session_id?: string | null;
          signature_valid?: boolean;
          status?: string;
          text?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "instagram_webhook_events_instagram_account_id_fkey";
            columns: ["instagram_account_id"];
            isOneToOne: false;
            referencedRelation: "instagram_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instagram_webhook_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_line_items: {
        Row: {
          created_at: string;
          description: string | null;
          discount_pct: number;
          id: string;
          invoice_id: string;
          name: string;
          product_id: string | null;
          quantity: number;
          sort_order: number;
          subtotal: number;
          tax_rate: number;
          total: number;
          unit_price: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          discount_pct?: number;
          id?: string;
          invoice_id: string;
          name: string;
          product_id?: string | null;
          quantity?: number;
          sort_order?: number;
          subtotal?: number;
          tax_rate?: number;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          discount_pct?: number;
          id?: string;
          invoice_id?: string;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          sort_order?: number;
          subtotal?: number;
          tax_rate?: number;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_line_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_line_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount_due: number;
          amount_paid: number;
          billing_address: Json;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          custom_fields: Json;
          deal_id: string | null;
          deleted_at: string | null;
          discount_total: number;
          due_date: string | null;
          external_ref: string | null;
          id: string;
          invoice_number: string;
          issue_date: string;
          notes: string | null;
          organization_id: string | null;
          owner_id: string | null;
          paid_at: string | null;
          public_token: string | null;
          quote_id: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          subtotal: number;
          tax_total: number;
          terms: string | null;
          total: number;
          updated_at: string;
          viewed_at: string | null;
          voided_at: string | null;
          workspace_id: string;
        };
        Insert: {
          amount_due?: number;
          amount_paid?: number;
          billing_address?: Json;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deal_id?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string | null;
          external_ref?: string | null;
          id?: string;
          invoice_number: string;
          issue_date?: string;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          paid_at?: string | null;
          public_token?: string | null;
          quote_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          subtotal?: number;
          tax_total?: number;
          terms?: string | null;
          total?: number;
          updated_at?: string;
          viewed_at?: string | null;
          voided_at?: string | null;
          workspace_id: string;
        };
        Update: {
          amount_due?: number;
          amount_paid?: number;
          billing_address?: Json;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deal_id?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string | null;
          external_ref?: string | null;
          id?: string;
          invoice_number?: string;
          issue_date?: string;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          paid_at?: string | null;
          public_token?: string | null;
          quote_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          subtotal?: number;
          tax_total?: number;
          terms?: string | null;
          total?: number;
          updated_at?: string;
          viewed_at?: string | null;
          voided_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ip_allowlists: {
        Row: {
          applies_to: string;
          cidr: unknown;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          label: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          applies_to?: string;
          cidr: unknown;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          applies_to?: string;
          cidr?: unknown;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ip_allowlists_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_article_events: {
        Row: {
          article_id: string;
          conversation_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["kb_event_type"];
          id: string;
          metadata: Json;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          article_id: string;
          conversation_id?: string | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["kb_event_type"];
          id?: string;
          metadata?: Json;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          article_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["kb_event_type"];
          id?: string;
          metadata?: Json;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_article_events_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "kb_articles";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_article_versions: {
        Row: {
          article_id: string;
          content_md: string;
          created_at: string;
          editor_id: string | null;
          id: string;
          note: string | null;
          summary: string | null;
          title: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          article_id: string;
          content_md: string;
          created_at?: string;
          editor_id?: string | null;
          id?: string;
          note?: string | null;
          summary?: string | null;
          title: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          article_id?: string;
          content_md?: string;
          created_at?: string;
          editor_id?: string | null;
          id?: string;
          note?: string | null;
          summary?: string | null;
          title?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_article_versions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "kb_articles";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_articles: {
        Row: {
          ai_use_count: number;
          archived_at: string | null;
          category_id: string | null;
          content_md: string;
          created_at: string;
          created_by: string | null;
          faq_question: string | null;
          helpful_count: number;
          id: string;
          is_faq: boolean;
          is_training: boolean;
          keywords: string[];
          language: string | null;
          last_indexed_at: string | null;
          needs_reindex: boolean;
          published_at: string | null;
          search_tsv: unknown;
          slug: string;
          source_filename: string | null;
          source_path: string | null;
          source_type: Database["public"]["Enums"]["kb_source_type"];
          status: Database["public"]["Enums"]["kb_article_status"];
          summary: string | null;
          tags: string[];
          title: string;
          translations: Json;
          unhelpful_count: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
          view_count: number;
          workspace_id: string;
        };
        Insert: {
          ai_use_count?: number;
          archived_at?: string | null;
          category_id?: string | null;
          content_md?: string;
          created_at?: string;
          created_by?: string | null;
          faq_question?: string | null;
          helpful_count?: number;
          id?: string;
          is_faq?: boolean;
          is_training?: boolean;
          keywords?: string[];
          language?: string | null;
          last_indexed_at?: string | null;
          needs_reindex?: boolean;
          published_at?: string | null;
          search_tsv?: unknown;
          slug: string;
          source_filename?: string | null;
          source_path?: string | null;
          source_type?: Database["public"]["Enums"]["kb_source_type"];
          status?: Database["public"]["Enums"]["kb_article_status"];
          summary?: string | null;
          tags?: string[];
          title: string;
          translations?: Json;
          unhelpful_count?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          view_count?: number;
          workspace_id: string;
        };
        Update: {
          ai_use_count?: number;
          archived_at?: string | null;
          category_id?: string | null;
          content_md?: string;
          created_at?: string;
          created_by?: string | null;
          faq_question?: string | null;
          helpful_count?: number;
          id?: string;
          is_faq?: boolean;
          is_training?: boolean;
          keywords?: string[];
          language?: string | null;
          last_indexed_at?: string | null;
          needs_reindex?: boolean;
          published_at?: string | null;
          search_tsv?: unknown;
          slug?: string;
          source_filename?: string | null;
          source_path?: string | null;
          source_type?: Database["public"]["Enums"]["kb_source_type"];
          status?: Database["public"]["Enums"]["kb_article_status"];
          summary?: string | null;
          tags?: string[];
          title?: string;
          translations?: Json;
          unhelpful_count?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          view_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_articles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "kb_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_categories: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "kb_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_chunks: {
        Row: {
          article_id: string;
          chunk_index: number;
          content: string;
          created_at: string;
          embedding: string | null;
          embedding_model: string | null;
          id: string;
          tokens: number | null;
          workspace_id: string;
        };
        Insert: {
          article_id: string;
          chunk_index: number;
          content: string;
          created_at?: string;
          embedding?: string | null;
          embedding_model?: string | null;
          id?: string;
          tokens?: number | null;
          workspace_id: string;
        };
        Update: {
          article_id?: string;
          chunk_index?: number;
          content?: string;
          created_at?: string;
          embedding?: string | null;
          embedding_model?: string | null;
          id?: string;
          tokens?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_chunks_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "kb_articles";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_collection_articles: {
        Row: {
          added_at: string;
          article_id: string;
          collection_id: string;
          sort_order: number;
          workspace_id: string;
        };
        Insert: {
          added_at?: string;
          article_id: string;
          collection_id: string;
          sort_order?: number;
          workspace_id: string;
        };
        Update: {
          added_at?: string;
          article_id?: string;
          collection_id?: string;
          sort_order?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_collection_articles_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "kb_articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kb_collection_articles_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "kb_collections";
            referencedColumns: ["id"];
          },
        ];
      };
      kb_collections: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_public: boolean;
          name: string;
          slug: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_public?: boolean;
          name: string;
          slug: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_public?: boolean;
          name?: string;
          slug?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kb_collections_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_qualification: {
        Row: {
          analyzed_at: string | null;
          buying_stage: string | null;
          clv_prediction: number | null;
          created_at: string;
          customer_interest: number | null;
          deal_probability: number | null;
          id: string;
          insights: string[];
          interest_signals: string[];
          lead_id: string;
          lead_priority: string | null;
          lead_score: number | null;
          model: string | null;
          needs_reanalysis: boolean;
          next_best_action: string | null;
          provider_kind: string | null;
          purchase_intent: number | null;
          purchase_intent_label: string | null;
          recommended_actions: Json;
          recommended_follow_up: string | null;
          recommended_follow_up_at: string | null;
          revenue_currency: string | null;
          revenue_prediction: number | null;
          risk_reasons: string[];
          risk_score: number | null;
          score_rationale: string | null;
          temperature: string | null;
          tokens_used: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          analyzed_at?: string | null;
          buying_stage?: string | null;
          clv_prediction?: number | null;
          created_at?: string;
          customer_interest?: number | null;
          deal_probability?: number | null;
          id?: string;
          insights?: string[];
          interest_signals?: string[];
          lead_id: string;
          lead_priority?: string | null;
          lead_score?: number | null;
          model?: string | null;
          needs_reanalysis?: boolean;
          next_best_action?: string | null;
          provider_kind?: string | null;
          purchase_intent?: number | null;
          purchase_intent_label?: string | null;
          recommended_actions?: Json;
          recommended_follow_up?: string | null;
          recommended_follow_up_at?: string | null;
          revenue_currency?: string | null;
          revenue_prediction?: number | null;
          risk_reasons?: string[];
          risk_score?: number | null;
          score_rationale?: string | null;
          temperature?: string | null;
          tokens_used?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          analyzed_at?: string | null;
          buying_stage?: string | null;
          clv_prediction?: number | null;
          created_at?: string;
          customer_interest?: number | null;
          deal_probability?: number | null;
          id?: string;
          insights?: string[];
          interest_signals?: string[];
          lead_id?: string;
          lead_priority?: string | null;
          lead_score?: number | null;
          model?: string | null;
          needs_reanalysis?: boolean;
          next_best_action?: string | null;
          provider_kind?: string | null;
          purchase_intent?: number | null;
          purchase_intent_label?: string | null;
          recommended_actions?: Json;
          recommended_follow_up?: string | null;
          recommended_follow_up_at?: string | null;
          revenue_currency?: string | null;
          revenue_prediction?: number | null;
          risk_reasons?: string[];
          risk_score?: number | null;
          score_rationale?: string | null;
          temperature?: string | null;
          tokens_used?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_qualification_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_qualification_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          company_name: string | null;
          converted_at: string | null;
          converted_company_id: string | null;
          converted_contact_id: string | null;
          converted_deal_id: string | null;
          created_at: string;
          created_by: string | null;
          custom_fields: Json;
          deleted_at: string | null;
          disqualified_at: string | null;
          disqualify_reason: string | null;
          email: string | null;
          first_name: string | null;
          full_name: string | null;
          id: string;
          job_title: string | null;
          last_activity_at: string | null;
          last_name: string | null;
          next_follow_up_at: string | null;
          notes: string | null;
          organization_id: string | null;
          owner_id: string | null;
          phone: string | null;
          qualified_at: string | null;
          rating: string | null;
          score: number;
          score_reason: string | null;
          source: string | null;
          status: string;
          tags: string[] | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          company_name?: string | null;
          converted_at?: string | null;
          converted_company_id?: string | null;
          converted_contact_id?: string | null;
          converted_deal_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          disqualified_at?: string | null;
          disqualify_reason?: string | null;
          email?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          id?: string;
          job_title?: string | null;
          last_activity_at?: string | null;
          last_name?: string | null;
          next_follow_up_at?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          qualified_at?: string | null;
          rating?: string | null;
          score?: number;
          score_reason?: string | null;
          source?: string | null;
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          company_name?: string | null;
          converted_at?: string | null;
          converted_company_id?: string | null;
          converted_contact_id?: string | null;
          converted_deal_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          disqualified_at?: string | null;
          disqualify_reason?: string | null;
          email?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          id?: string;
          job_title?: string | null;
          last_activity_at?: string | null;
          last_name?: string | null;
          next_follow_up_at?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          qualified_at?: string | null;
          rating?: string | null;
          score?: number;
          score_reason?: string | null;
          source?: string | null;
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_converted_company_id_fkey";
            columns: ["converted_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_converted_contact_id_fkey";
            columns: ["converted_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_converted_deal_fkey";
            columns: ["converted_deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      livechat_routing_rules: {
        Row: {
          agent_id: string | null;
          auto_message: string | null;
          chatbot_id: string | null;
          created_at: string;
          custom_conditions: Json;
          department_id: string | null;
          enabled: boolean;
          id: string;
          match_business_hours: boolean | null;
          match_country: string[];
          match_keywords: string[];
          match_language: string[];
          match_pages: string[];
          match_priority: string[];
          match_vip: boolean | null;
          name: string;
          priority: number;
          required_skills: string[];
          route_to: string;
          strategy: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          agent_id?: string | null;
          auto_message?: string | null;
          chatbot_id?: string | null;
          created_at?: string;
          custom_conditions?: Json;
          department_id?: string | null;
          enabled?: boolean;
          id?: string;
          match_business_hours?: boolean | null;
          match_country?: string[];
          match_keywords?: string[];
          match_language?: string[];
          match_pages?: string[];
          match_priority?: string[];
          match_vip?: boolean | null;
          name: string;
          priority?: number;
          required_skills?: string[];
          route_to?: string;
          strategy?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          agent_id?: string | null;
          auto_message?: string | null;
          chatbot_id?: string | null;
          created_at?: string;
          custom_conditions?: Json;
          department_id?: string | null;
          enabled?: boolean;
          id?: string;
          match_business_hours?: boolean | null;
          match_country?: string[];
          match_keywords?: string[];
          match_language?: string[];
          match_pages?: string[];
          match_priority?: string[];
          match_vip?: boolean | null;
          name?: string;
          priority?: number;
          required_skills?: string[];
          route_to?: string;
          strategy?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "livechat_routing_rules_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "livechat_routing_rules_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "livechat_routing_rules_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      livechat_visitor_events: {
        Row: {
          created_at: string;
          event_name: string | null;
          event_type: string;
          id: string;
          properties: Json;
          referrer: string | null;
          session_id: string | null;
          url: string | null;
          visitor_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          event_name?: string | null;
          event_type: string;
          id?: string;
          properties?: Json;
          referrer?: string | null;
          session_id?: string | null;
          url?: string | null;
          visitor_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          event_name?: string | null;
          event_type?: string;
          id?: string;
          properties?: Json;
          referrer?: string | null;
          session_id?: string | null;
          url?: string | null;
          visitor_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "livechat_visitor_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chatbot_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "livechat_visitor_events_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "livechat_visitors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "livechat_visitor_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      livechat_visitors: {
        Row: {
          browser: string | null;
          chatbot_id: string | null;
          city: string | null;
          contact_id: string | null;
          country: string | null;
          device: string | null;
          display_name: string | null;
          email: string | null;
          first_page: string | null;
          first_referrer: string | null;
          first_seen_at: string;
          id: string;
          ip_address: string | null;
          is_vip: boolean;
          language: string | null;
          last_page: string | null;
          last_referrer: string | null;
          last_seen_at: string;
          metadata: Json;
          os: string | null;
          page_views: number;
          phone: string | null;
          priority: string;
          region: string | null;
          timezone: string | null;
          user_agent: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          utm_term: string | null;
          visitor_key: string;
          visits_count: number;
          workspace_id: string;
        };
        Insert: {
          browser?: string | null;
          chatbot_id?: string | null;
          city?: string | null;
          contact_id?: string | null;
          country?: string | null;
          device?: string | null;
          display_name?: string | null;
          email?: string | null;
          first_page?: string | null;
          first_referrer?: string | null;
          first_seen_at?: string;
          id?: string;
          ip_address?: string | null;
          is_vip?: boolean;
          language?: string | null;
          last_page?: string | null;
          last_referrer?: string | null;
          last_seen_at?: string;
          metadata?: Json;
          os?: string | null;
          page_views?: number;
          phone?: string | null;
          priority?: string;
          region?: string | null;
          timezone?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
          visitor_key: string;
          visits_count?: number;
          workspace_id: string;
        };
        Update: {
          browser?: string | null;
          chatbot_id?: string | null;
          city?: string | null;
          contact_id?: string | null;
          country?: string | null;
          device?: string | null;
          display_name?: string | null;
          email?: string | null;
          first_page?: string | null;
          first_referrer?: string | null;
          first_seen_at?: string;
          id?: string;
          ip_address?: string | null;
          is_vip?: boolean;
          language?: string | null;
          last_page?: string | null;
          last_referrer?: string | null;
          last_seen_at?: string;
          metadata?: Json;
          os?: string | null;
          page_views?: number;
          phone?: string | null;
          priority?: string;
          region?: string | null;
          timezone?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
          visitor_key?: string;
          visits_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "livechat_visitors_chatbot_id_fkey";
            columns: ["chatbot_id"];
            isOneToOne: false;
            referencedRelation: "chatbots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "livechat_visitors_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "livechat_visitors_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      login_history: {
        Row: {
          created_at: string;
          device: string | null;
          event: string;
          failure_reason: string | null;
          id: string;
          ip_address: unknown;
          location: string | null;
          metadata: Json;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device?: string | null;
          event: string;
          failure_reason?: string | null;
          id?: string;
          ip_address?: unknown;
          location?: string | null;
          metadata?: Json;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device?: string | null;
          event?: string;
          failure_reason?: string | null;
          id?: string;
          ip_address?: unknown;
          location?: string | null;
          metadata?: Json;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      marketing_leads: {
        Row: {
          company_size: string;
          contact_method: string;
          created_at: string;
          full_name: string;
          id: string;
          message: string | null;
          referrer: string | null;
          source_page: string | null;
          status: string;
          updated_at: string;
          utm: Json;
          whatsapp_number: string | null;
          work_email: string;
        };
        Insert: {
          company_size: string;
          contact_method?: string;
          created_at?: string;
          full_name: string;
          id?: string;
          message?: string | null;
          referrer?: string | null;
          source_page?: string | null;
          status?: string;
          updated_at?: string;
          utm?: Json;
          whatsapp_number?: string | null;
          work_email: string;
        };
        Update: {
          company_size?: string;
          contact_method?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          message?: string | null;
          referrer?: string | null;
          source_page?: string | null;
          status?: string;
          updated_at?: string;
          utm?: Json;
          whatsapp_number?: string | null;
          work_email?: string;
        };
        Relationships: [];
      };
      marketplace_installations: {
        Row: {
          config: Json;
          disabled_at: string | null;
          granted_scopes: Json;
          id: string;
          installed_at: string;
          installed_by: string;
          integration_id: string;
          organization_id: string;
          status: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          config?: Json;
          disabled_at?: string | null;
          granted_scopes?: Json;
          id?: string;
          installed_at?: string;
          installed_by: string;
          integration_id: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          config?: Json;
          disabled_at?: string | null;
          granted_scopes?: Json;
          id?: string;
          installed_at?: string;
          installed_by?: string;
          integration_id?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketplace_installations_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "marketplace_integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      marketplace_integrations: {
        Row: {
          category: string;
          changelog: Json;
          config_schema: Json;
          created_at: string;
          description: string | null;
          docs_url: string | null;
          featured: boolean;
          icon_url: string | null;
          id: string;
          install_count: number;
          name: string;
          rating: number | null;
          recommended: boolean;
          scopes: Json;
          slug: string;
          status: string;
          tagline: string;
          updated_at: string;
          vendor: string | null;
          version: string;
        };
        Insert: {
          category: string;
          changelog?: Json;
          config_schema?: Json;
          created_at?: string;
          description?: string | null;
          docs_url?: string | null;
          featured?: boolean;
          icon_url?: string | null;
          id?: string;
          install_count?: number;
          name: string;
          rating?: number | null;
          recommended?: boolean;
          scopes?: Json;
          slug: string;
          status?: string;
          tagline: string;
          updated_at?: string;
          vendor?: string | null;
          version?: string;
        };
        Update: {
          category?: string;
          changelog?: Json;
          config_schema?: Json;
          created_at?: string;
          description?: string | null;
          docs_url?: string | null;
          featured?: boolean;
          icon_url?: string | null;
          id?: string;
          install_count?: number;
          name?: string;
          rating?: number | null;
          recommended?: boolean;
          scopes?: Json;
          slug?: string;
          status?: string;
          tagline?: string;
          updated_at?: string;
          vendor?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      marketplace_moderation_log: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          moderator_id: string;
          reason: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          moderator_id: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          moderator_id?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      media_access_log: {
        Row: {
          action: string;
          actor_id: string | null;
          attachment_id: string;
          bytes: number | null;
          created_at: string;
          id: string;
          user_agent: string | null;
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          attachment_id: string;
          bytes?: number | null;
          created_at?: string;
          id?: string;
          user_agent?: string | null;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          attachment_id?: string;
          bytes?: number | null;
          created_at?: string;
          id?: string;
          user_agent?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_access_log_attachment_id_fkey";
            columns: ["attachment_id"];
            isOneToOne: false;
            referencedRelation: "message_attachments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_access_log_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_attendance: {
        Row: {
          appointment_id: string;
          created_at: string;
          duration_seconds: number | null;
          external_participant_id: string | null;
          id: string;
          joined_at: string | null;
          left_at: string | null;
          metadata: Json;
          participant_email: string | null;
          participant_name: string | null;
          participant_role: string;
          provider: string | null;
          workspace_id: string;
        };
        Insert: {
          appointment_id: string;
          created_at?: string;
          duration_seconds?: number | null;
          external_participant_id?: string | null;
          id?: string;
          joined_at?: string | null;
          left_at?: string | null;
          metadata?: Json;
          participant_email?: string | null;
          participant_name?: string | null;
          participant_role?: string;
          provider?: string | null;
          workspace_id: string;
        };
        Update: {
          appointment_id?: string;
          created_at?: string;
          duration_seconds?: number | null;
          external_participant_id?: string | null;
          id?: string;
          joined_at?: string | null;
          left_at?: string | null;
          metadata?: Json;
          participant_email?: string | null;
          participant_name?: string | null;
          participant_role?: string;
          provider?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_attendance_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "booking_appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_history: {
        Row: {
          action: string;
          appointment_id: string | null;
          created_at: string;
          error: string | null;
          external_meeting_id: string | null;
          id: string;
          join_url: string | null;
          payload: Json;
          provider: string;
          provider_account_id: string | null;
          workspace_id: string;
        };
        Insert: {
          action: string;
          appointment_id?: string | null;
          created_at?: string;
          error?: string | null;
          external_meeting_id?: string | null;
          id?: string;
          join_url?: string | null;
          payload?: Json;
          provider: string;
          provider_account_id?: string | null;
          workspace_id: string;
        };
        Update: {
          action?: string;
          appointment_id?: string | null;
          created_at?: string;
          error?: string | null;
          external_meeting_id?: string | null;
          id?: string;
          join_url?: string | null;
          payload?: Json;
          provider?: string;
          provider_account_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_history_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "booking_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_history_provider_account_id_fkey";
            columns: ["provider_account_id"];
            isOneToOne: false;
            referencedRelation: "meeting_provider_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_provider_accounts: {
        Row: {
          config: Json;
          created_at: string;
          created_by: string | null;
          credentials_ciphertext: string | null;
          display_name: string;
          id: string;
          is_default: boolean;
          last_error: string | null;
          provider: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          credentials_ciphertext?: string | null;
          display_name: string;
          id?: string;
          is_default?: boolean;
          last_error?: string | null;
          provider: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          credentials_ciphertext?: string | null;
          display_name?: string;
          id?: string;
          is_default?: boolean;
          last_error?: string | null;
          provider?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      message_attachments: {
        Row: {
          created_at: string;
          download_count: number;
          duration_seconds: number | null;
          expires_at: string | null;
          file_id: string | null;
          file_name: string | null;
          height: number | null;
          id: string;
          is_deleted: boolean;
          last_accessed_at: string | null;
          message_id: string;
          metadata: Json;
          mime_type: string | null;
          sha256: string | null;
          size_bytes: number | null;
          storage_bucket: string;
          storage_path: string | null;
          thumbnail_url: string | null;
          uploaded_at: string;
          uploaded_by: string | null;
          url: string | null;
          variants: Json;
          virus_scan_status: string;
          visibility: string;
          width: number | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          download_count?: number;
          duration_seconds?: number | null;
          expires_at?: string | null;
          file_id?: string | null;
          file_name?: string | null;
          height?: number | null;
          id?: string;
          is_deleted?: boolean;
          last_accessed_at?: string | null;
          message_id: string;
          metadata?: Json;
          mime_type?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path?: string | null;
          thumbnail_url?: string | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
          url?: string | null;
          variants?: Json;
          virus_scan_status?: string;
          visibility?: string;
          width?: number | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          download_count?: number;
          duration_seconds?: number | null;
          expires_at?: string | null;
          file_id?: string | null;
          file_name?: string | null;
          height?: number | null;
          id?: string;
          is_deleted?: boolean;
          last_accessed_at?: string | null;
          message_id?: string;
          metadata?: Json;
          mime_type?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path?: string | null;
          thumbnail_url?: string | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
          url?: string | null;
          variants?: Json;
          virus_scan_status?: string;
          visibility?: string;
          width?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_attachments_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_attachments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      message_drafts: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          body?: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_drafts_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_drafts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      message_outbox: {
        Row: {
          attempts: number;
          channel_account_id: string;
          conversation_id: string | null;
          created_at: string;
          delivered_at: string | null;
          external_message_id: string | null;
          failed_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          last_error_code: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          message_id: string | null;
          next_attempt_at: string;
          payload: Json;
          provider: Database["public"]["Enums"]["messaging_provider"];
          read_at: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["outbox_status"];
          to_address: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          channel_account_id: string;
          conversation_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          external_message_id?: string | null;
          failed_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          last_error?: string | null;
          last_error_code?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          message_id?: string | null;
          next_attempt_at?: string;
          payload: Json;
          provider: Database["public"]["Enums"]["messaging_provider"];
          read_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["outbox_status"];
          to_address: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          channel_account_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          external_message_id?: string | null;
          failed_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          last_error?: string | null;
          last_error_code?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          message_id?: string | null;
          next_attempt_at?: string;
          payload?: Json;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          read_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["outbox_status"];
          to_address?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_outbox_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_outbox_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_outbox_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_outbox_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      message_read_receipts: {
        Row: {
          message_id: string;
          read_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          message_id: string;
          read_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          message_id?: string;
          read_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_read_receipts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      message_templates: {
        Row: {
          attachments: Json;
          body: string;
          category: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_favorite: boolean;
          is_shared: boolean;
          language: string | null;
          last_used_at: string | null;
          name: string;
          shortcut: string | null;
          updated_at: string;
          usage_count: number;
          variables: Json;
          workspace_id: string;
        };
        Insert: {
          attachments?: Json;
          body: string;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_favorite?: boolean;
          is_shared?: boolean;
          language?: string | null;
          last_used_at?: string | null;
          name: string;
          shortcut?: string | null;
          updated_at?: string;
          usage_count?: number;
          variables?: Json;
          workspace_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_favorite?: boolean;
          is_shared?: boolean;
          language?: string | null;
          last_used_at?: string | null;
          name?: string;
          shortcut?: string | null;
          updated_at?: string;
          usage_count?: number;
          variables?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      quick_replies: {
        Row: {
          body: string;
          category: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          id: string;
          shortcut: string | null;
          title: string;
          updated_at: string;
          usage_count: number;
          workspace_id: string;
        };
        Insert: {
          body: string;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          shortcut?: string | null;
          title: string;
          updated_at?: string;
          usage_count?: number;
          workspace_id: string;
        };
        Update: {
          body?: string;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          shortcut?: string | null;
          title?: string;
          updated_at?: string;
          usage_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quick_replies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string | null;
          client_temp_id: string | null;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          delivered_at: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          edited_at: string | null;
          external_message_id: string | null;
          failed_reason: string | null;
          from_address: string | null;
          id: string;
          is_demo: boolean;
          is_internal: boolean;
          media_duration_seconds: number | null;
          media_size: number | null;
          media_thumbnail_url: string | null;
          media_type: string | null;
          media_url: string | null;
          message_type: Database["public"]["Enums"]["message_type"];
          metadata: Json;
          provider: Database["public"]["Enums"]["messaging_provider"] | null;
          provider_message_id: string | null;
          read_at: string | null;
          reply_to_id: string | null;
          sent_by: string | null;
          status: Database["public"]["Enums"]["message_status"];
          to_address: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          body?: string | null;
          client_temp_id?: string | null;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          delivered_at?: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          edited_at?: string | null;
          external_message_id?: string | null;
          failed_reason?: string | null;
          from_address?: string | null;
          id?: string;
          is_demo?: boolean;
          is_internal?: boolean;
          media_duration_seconds?: number | null;
          media_size?: number | null;
          media_thumbnail_url?: string | null;
          media_type?: string | null;
          media_url?: string | null;
          message_type?: Database["public"]["Enums"]["message_type"];
          metadata?: Json;
          provider?: Database["public"]["Enums"]["messaging_provider"] | null;
          provider_message_id?: string | null;
          read_at?: string | null;
          reply_to_id?: string | null;
          sent_by?: string | null;
          status?: Database["public"]["Enums"]["message_status"];
          to_address?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          body?: string | null;
          client_temp_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          delivered_at?: string | null;
          direction?: Database["public"]["Enums"]["message_direction"];
          edited_at?: string | null;
          external_message_id?: string | null;
          failed_reason?: string | null;
          from_address?: string | null;
          id?: string;
          is_demo?: boolean;
          is_internal?: boolean;
          media_duration_seconds?: number | null;
          media_size?: number | null;
          media_thumbnail_url?: string | null;
          media_type?: string | null;
          media_url?: string | null;
          message_type?: Database["public"]["Enums"]["message_type"];
          metadata?: Json;
          provider?: Database["public"]["Enums"]["messaging_provider"] | null;
          provider_message_id?: string | null;
          read_at?: string | null;
          reply_to_id?: string | null;
          sent_by?: string | null;
          status?: Database["public"]["Enums"]["message_status"];
          to_address?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey";
            columns: ["reply_to_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      messenger_accounts: {
        Row: {
          access_token_ciphertext: string;
          category: string | null;
          connected_at: string;
          connected_by: string | null;
          created_at: string;
          id: string;
          last_verified_at: string | null;
          metadata: Json;
          page_id: string;
          page_name: string | null;
          profile_picture_url: string | null;
          scopes: string[];
          status: string;
          status_reason: string | null;
          token_expires_at: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          access_token_ciphertext: string;
          category?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          page_id: string;
          page_name?: string | null;
          profile_picture_url?: string | null;
          scopes?: string[];
          status?: string;
          status_reason?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          access_token_ciphertext?: string;
          category?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          page_id?: string;
          page_name?: string | null;
          profile_picture_url?: string | null;
          scopes?: string[];
          status?: string;
          status_reason?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messenger_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      messenger_oauth_states: {
        Row: {
          created_at: string;
          expires_at: string;
          redirect_uri: string;
          return_to: string;
          state: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          redirect_uri: string;
          return_to?: string;
          state: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          redirect_uri?: string;
          return_to?: string;
          state?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messenger_oauth_states_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          deleted_at: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          is_pinned: boolean;
          mentions: string[];
          pinned_at: string | null;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          is_pinned?: boolean;
          mentions?: string[];
          pinned_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          is_pinned?: boolean;
          mentions?: string[];
          pinned_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          category: string;
          email_enabled: boolean;
          id: string;
          in_app_enabled: boolean;
          push_enabled: boolean;
          quiet_hours_end: string | null;
          quiet_hours_start: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          email_enabled?: boolean;
          id?: string;
          in_app_enabled?: boolean;
          push_enabled?: boolean;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          email_enabled?: boolean;
          id?: string;
          in_app_enabled?: boolean;
          push_enabled?: boolean;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          action_url: string | null;
          body: string | null;
          category: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          data: Json;
          id: string;
          organization_id: string | null;
          read_at: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          title: string;
          user_id: string;
        };
        Insert: {
          action_url?: string | null;
          body?: string | null;
          category?: string | null;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          data?: Json;
          id?: string;
          organization_id?: string | null;
          read_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title: string;
          user_id: string;
        };
        Update: {
          action_url?: string | null;
          body?: string | null;
          category?: string | null;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          data?: Json;
          id?: string;
          organization_id?: string | null;
          read_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_access_tokens: {
        Row: {
          client_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          last_used_at: string | null;
          organization_id: string;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          user_id: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          last_used_at?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          user_id?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_used_at?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_access_tokens_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "oauth_clients";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_authorization_codes: {
        Row: {
          client_id: string;
          code_challenge: string | null;
          code_challenge_method: string | null;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          nonce: string | null;
          organization_id: string;
          redirect_uri: string;
          scopes: string[];
          user_id: string;
        };
        Insert: {
          client_id: string;
          code_challenge?: string | null;
          code_challenge_method?: string | null;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          nonce?: string | null;
          organization_id: string;
          redirect_uri: string;
          scopes?: string[];
          user_id: string;
        };
        Update: {
          client_id?: string;
          code_challenge?: string | null;
          code_challenge_method?: string | null;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          nonce?: string | null;
          organization_id?: string;
          redirect_uri?: string;
          scopes?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_authorization_codes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "oauth_clients";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_clients: {
        Row: {
          allowed_grant_types: string[];
          allowed_scopes: string[];
          approved: boolean;
          approved_at: string | null;
          approved_by: string | null;
          client_id: string;
          client_secret_hash: string | null;
          client_type: string;
          created_at: string;
          created_by: string;
          description: string | null;
          homepage_url: string | null;
          id: string;
          is_first_party: boolean;
          logo_url: string | null;
          name: string;
          organization_id: string;
          privacy_url: string | null;
          redirect_uris: string[];
          require_pkce: boolean;
          revoked_at: string | null;
          tos_url: string | null;
          updated_at: string;
        };
        Insert: {
          allowed_grant_types?: string[];
          allowed_scopes?: string[];
          approved?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          client_id: string;
          client_secret_hash?: string | null;
          client_type: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          homepage_url?: string | null;
          id?: string;
          is_first_party?: boolean;
          logo_url?: string | null;
          name: string;
          organization_id: string;
          privacy_url?: string | null;
          redirect_uris?: string[];
          require_pkce?: boolean;
          revoked_at?: string | null;
          tos_url?: string | null;
          updated_at?: string;
        };
        Update: {
          allowed_grant_types?: string[];
          allowed_scopes?: string[];
          approved?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          client_id?: string;
          client_secret_hash?: string | null;
          client_type?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          homepage_url?: string | null;
          id?: string;
          is_first_party?: boolean;
          logo_url?: string | null;
          name?: string;
          organization_id?: string;
          privacy_url?: string | null;
          redirect_uris?: string[];
          require_pkce?: boolean;
          revoked_at?: string | null;
          tos_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      oauth_refresh_tokens: {
        Row: {
          access_token_id: string | null;
          client_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          organization_id: string;
          replaced_by: string | null;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          user_id: string;
        };
        Insert: {
          access_token_id?: string | null;
          client_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          organization_id: string;
          replaced_by?: string | null;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          user_id: string;
        };
        Update: {
          access_token_id?: string | null;
          client_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          organization_id?: string;
          replaced_by?: string | null;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_access_token_id_fkey";
            columns: ["access_token_id"];
            isOneToOne: false;
            referencedRelation: "oauth_access_tokens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oauth_refresh_tokens_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "oauth_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oauth_refresh_tokens_replaced_by_fkey";
            columns: ["replaced_by"];
            isOneToOne: false;
            referencedRelation: "oauth_refresh_tokens";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_user_consents: {
        Row: {
          client_id: string;
          granted_at: string;
          id: string;
          revoked_at: string | null;
          scopes: string[];
          user_id: string;
        };
        Insert: {
          client_id: string;
          granted_at?: string;
          id?: string;
          revoked_at?: string | null;
          scopes?: string[];
          user_id: string;
        };
        Update: {
          client_id?: string;
          granted_at?: string;
          id?: string;
          revoked_at?: string | null;
          scopes?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_user_consents_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "oauth_clients";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          joined_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          address: string | null;
          billing_email: string | null;
          brand_settings: Json;
          business_hours: Json;
          contact_email: string | null;
          created_at: string;
          currency: string;
          id: string;
          industry: string | null;
          language: string;
          logo_url: string | null;
          metadata: Json;
          name: string;
          owner_id: string;
          phone: string | null;
          slug: string;
          timezone: string;
          updated_at: string;
          website: string | null;
          working_days: number[];
        };
        Insert: {
          address?: string | null;
          billing_email?: string | null;
          brand_settings?: Json;
          business_hours?: Json;
          contact_email?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          industry?: string | null;
          language?: string;
          logo_url?: string | null;
          metadata?: Json;
          name: string;
          owner_id: string;
          phone?: string | null;
          slug: string;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
          working_days?: number[];
        };
        Update: {
          address?: string | null;
          billing_email?: string | null;
          brand_settings?: Json;
          business_hours?: Json;
          contact_email?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          industry?: string | null;
          language?: string;
          logo_url?: string | null;
          metadata?: Json;
          name?: string;
          owner_id?: string;
          phone?: string | null;
          slug?: string;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
          working_days?: number[];
        };
        Relationships: [];
      };
      password_policy: {
        Row: {
          created_at: string;
          disallow_common: boolean;
          history_count: number;
          lockout_minutes: number;
          max_failed_attempts: number;
          min_length: number;
          organization_id: string;
          require_2fa: boolean;
          require_lowercase: boolean;
          require_number: boolean;
          require_symbol: boolean;
          require_uppercase: boolean;
          rotation_days: number;
          session_absolute_hours: number;
          session_idle_minutes: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          disallow_common?: boolean;
          history_count?: number;
          lockout_minutes?: number;
          max_failed_attempts?: number;
          min_length?: number;
          organization_id: string;
          require_2fa?: boolean;
          require_lowercase?: boolean;
          require_number?: boolean;
          require_symbol?: boolean;
          require_uppercase?: boolean;
          rotation_days?: number;
          session_absolute_hours?: number;
          session_idle_minutes?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          disallow_common?: boolean;
          history_count?: number;
          lockout_minutes?: number;
          max_failed_attempts?: number;
          min_length?: number;
          organization_id?: string;
          require_2fa?: boolean;
          require_lowercase?: boolean;
          require_number?: boolean;
          require_symbol?: boolean;
          require_uppercase?: boolean;
          rotation_days?: number;
          session_absolute_hours?: number;
          session_idle_minutes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "password_policy_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_gateway_settings: {
        Row: {
          adapter_id: string | null;
          config: Json;
          created_at: string;
          display_label: string | null;
          enabled: boolean;
          is_custom: boolean;
          is_default: boolean;
          mode: string;
          notes: string | null;
          provider_id: string;
          publishable_key: string | null;
          secret_name: string | null;
          supported_methods: string[];
          updated_at: string;
          updated_by: string | null;
          webhook_secret_name: string | null;
          webhook_url: string | null;
        };
        Insert: {
          adapter_id?: string | null;
          config?: Json;
          created_at?: string;
          display_label?: string | null;
          enabled?: boolean;
          is_custom?: boolean;
          is_default?: boolean;
          mode?: string;
          notes?: string | null;
          provider_id: string;
          publishable_key?: string | null;
          secret_name?: string | null;
          supported_methods?: string[];
          updated_at?: string;
          updated_by?: string | null;
          webhook_secret_name?: string | null;
          webhook_url?: string | null;
        };
        Update: {
          adapter_id?: string | null;
          config?: Json;
          created_at?: string;
          display_label?: string | null;
          enabled?: boolean;
          is_custom?: boolean;
          is_default?: boolean;
          mode?: string;
          notes?: string | null;
          provider_id?: string;
          publishable_key?: string | null;
          secret_name?: string | null;
          supported_methods?: string[];
          updated_at?: string;
          updated_by?: string | null;
          webhook_secret_name?: string | null;
          webhook_url?: string | null;
        };
        Relationships: [];
      };
      payment_gateway_webhook_deliveries: {
        Row: {
          created_at: string;
          error_message: string | null;
          event_type: string | null;
          http_status: number | null;
          id: string;
          latency_ms: number | null;
          metadata: Json;
          provider_event_id: string | null;
          provider_id: string;
          received_at: string;
          replay_count: number;
          replay_error: string | null;
          replay_of_id: string | null;
          replay_status: string | null;
          replayed_at: string | null;
          replayed_by: string | null;
          request_id: string | null;
          signature_verified: boolean;
          source_ip: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          event_type?: string | null;
          http_status?: number | null;
          id?: string;
          latency_ms?: number | null;
          metadata?: Json;
          provider_event_id?: string | null;
          provider_id: string;
          received_at?: string;
          replay_count?: number;
          replay_error?: string | null;
          replay_of_id?: string | null;
          replay_status?: string | null;
          replayed_at?: string | null;
          replayed_by?: string | null;
          request_id?: string | null;
          signature_verified?: boolean;
          source_ip?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          event_type?: string | null;
          http_status?: number | null;
          id?: string;
          latency_ms?: number | null;
          metadata?: Json;
          provider_event_id?: string | null;
          provider_id?: string;
          received_at?: string;
          replay_count?: number;
          replay_error?: string | null;
          replay_of_id?: string | null;
          replay_status?: string | null;
          replayed_at?: string | null;
          replayed_by?: string | null;
          request_id?: string | null;
          signature_verified?: boolean;
          source_ip?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          billing_customer_id: string | null;
          brand: string | null;
          created_at: string;
          exp_month: number | null;
          exp_year: number | null;
          id: string;
          is_default: boolean;
          last4: string | null;
          metadata: Json;
          organization_id: string;
          provider: string;
          provider_payment_method_id: string;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          billing_customer_id?: string | null;
          brand?: string | null;
          created_at?: string;
          exp_month?: number | null;
          exp_year?: number | null;
          id?: string;
          is_default?: boolean;
          last4?: string | null;
          metadata?: Json;
          organization_id: string;
          provider: string;
          provider_payment_method_id: string;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          billing_customer_id?: string | null;
          brand?: string | null;
          created_at?: string;
          exp_month?: number | null;
          exp_year?: number | null;
          id?: string;
          is_default?: boolean;
          last4?: string | null;
          metadata?: Json;
          organization_id?: string;
          provider?: string;
          provider_payment_method_id?: string;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_methods_billing_customer_id_fkey";
            columns: ["billing_customer_id"];
            isOneToOne: false;
            referencedRelation: "billing_customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_methods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_id: string | null;
          id: string;
          invoice_id: string | null;
          metadata: Json;
          method: Database["public"]["Enums"]["payment_method"];
          notes: string | null;
          organization_id: string | null;
          paid_at: string | null;
          processor: string | null;
          processor_ref: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          amount: number;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string | null;
          id?: string;
          invoice_id?: string | null;
          metadata?: Json;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          organization_id?: string | null;
          paid_at?: string | null;
          processor?: string | null;
          processor_ref?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          amount?: number;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string | null;
          id?: string;
          invoice_id?: string | null;
          metadata?: Json;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          organization_id?: string | null;
          paid_at?: string | null;
          processor?: string | null;
          processor_ref?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          action: string;
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          resource: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          resource: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          resource?: string;
        };
        Relationships: [];
      };
      personal_access_tokens: {
        Row: {
          created_at: string;
          expires_at: string | null;
          hashed_token: string;
          id: string;
          ip_allowlist: unknown[];
          last_used_at: string | null;
          last_used_ip: unknown;
          name: string;
          prefix: string;
          rate_limit_per_minute: number | null;
          revoked_at: string | null;
          rotated_at: string | null;
          rotated_from: string | null;
          scopes: string[];
          updated_at: string;
          user_id: string;
          workspace_id: string | null;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          hashed_token: string;
          id?: string;
          ip_allowlist?: unknown[];
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name: string;
          prefix: string;
          rate_limit_per_minute?: number | null;
          revoked_at?: string | null;
          rotated_at?: string | null;
          rotated_from?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id: string;
          workspace_id?: string | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          hashed_token?: string;
          id?: string;
          ip_allowlist?: unknown[];
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name?: string;
          prefix?: string;
          rate_limit_per_minute?: number | null;
          revoked_at?: string | null;
          rotated_at?: string | null;
          rotated_from?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "personal_access_tokens_rotated_from_fkey";
            columns: ["rotated_from"];
            isOneToOne: false;
            referencedRelation: "personal_access_tokens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_access_tokens_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      phonebook_contacts: {
        Row: {
          created_at: string;
          id: string;
          mobile_number: string;
          name: string;
          phonebook_id: string;
          updated_at: string;
          variable_1: string | null;
          variable_2: string | null;
          variable_3: string | null;
          variable_4: string | null;
          variable_5: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mobile_number: string;
          name: string;
          phonebook_id: string;
          updated_at?: string;
          variable_1?: string | null;
          variable_2?: string | null;
          variable_3?: string | null;
          variable_4?: string | null;
          variable_5?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mobile_number?: string;
          name?: string;
          phonebook_id?: string;
          updated_at?: string;
          variable_1?: string | null;
          variable_2?: string | null;
          variable_3?: string | null;
          variable_4?: string | null;
          variable_5?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phonebook_contacts_phonebook_id_fkey";
            columns: ["phonebook_id"];
            isOneToOne: false;
            referencedRelation: "phonebooks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phonebook_contacts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      phonebooks: {
        Row: {
          contact_count: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          contact_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          contact_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phonebooks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_templates: {
        Row: {
          category: string | null;
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_builtin: boolean;
          name: string;
          stages: Json;
          updated_at: string;
          workspace_id: string | null;
        };
        Insert: {
          category?: string | null;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_builtin?: boolean;
          name: string;
          stages?: Json;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Update: {
          category?: string | null;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_builtin?: boolean;
          name?: string;
          stages?: Json;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_gateway_prices: {
        Row: {
          checkout_url: string | null;
          created_at: string;
          enabled: boolean;
          external_price_id: string | null;
          external_product_id: string | null;
          id: string;
          last_verified_at: string | null;
          mode: string;
          notes: string | null;
          plan_id: string;
          provider_id: string;
          updated_at: string;
          updated_by: string | null;
          verification_message: string | null;
          verification_status: string | null;
          verified_amount_cents: number | null;
          verified_currency: string | null;
          verified_interval: string | null;
        };
        Insert: {
          checkout_url?: string | null;
          created_at?: string;
          enabled?: boolean;
          external_price_id?: string | null;
          external_product_id?: string | null;
          id?: string;
          last_verified_at?: string | null;
          mode?: string;
          notes?: string | null;
          plan_id: string;
          provider_id: string;
          updated_at?: string;
          updated_by?: string | null;
          verification_message?: string | null;
          verification_status?: string | null;
          verified_amount_cents?: number | null;
          verified_currency?: string | null;
          verified_interval?: string | null;
        };
        Update: {
          checkout_url?: string | null;
          created_at?: string;
          enabled?: boolean;
          external_price_id?: string | null;
          external_product_id?: string | null;
          id?: string;
          last_verified_at?: string | null;
          mode?: string;
          notes?: string | null;
          plan_id?: string;
          provider_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          verification_message?: string | null;
          verification_status?: string | null;
          verified_amount_cents?: number | null;
          verified_currency?: string | null;
          verified_interval?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plan_gateway_prices_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          badge: string | null;
          code: string;
          created_at: string;
          cta_label: string | null;
          currency: string;
          description: string | null;
          features: Json;
          highlight: boolean;
          id: string;
          interval: Database["public"]["Enums"]["plan_interval"];
          is_active: boolean;
          is_custom: boolean;
          is_public: boolean;
          limits: Json;
          monthly_plan_code: string | null;
          name: string;
          price_cents: number;
          sort_order: number;
          tagline: string | null;
          tier: Database["public"]["Enums"]["plan_tier"];
          trial_days: number;
          updated_at: string;
        };
        Insert: {
          badge?: string | null;
          code: string;
          created_at?: string;
          cta_label?: string | null;
          currency?: string;
          description?: string | null;
          features?: Json;
          highlight?: boolean;
          id?: string;
          interval?: Database["public"]["Enums"]["plan_interval"];
          is_active?: boolean;
          is_custom?: boolean;
          is_public?: boolean;
          limits?: Json;
          monthly_plan_code?: string | null;
          name: string;
          price_cents?: number;
          sort_order?: number;
          tagline?: string | null;
          tier?: Database["public"]["Enums"]["plan_tier"];
          trial_days?: number;
          updated_at?: string;
        };
        Update: {
          badge?: string | null;
          code?: string;
          created_at?: string;
          cta_label?: string | null;
          currency?: string;
          description?: string | null;
          features?: Json;
          highlight?: boolean;
          id?: string;
          interval?: Database["public"]["Enums"]["plan_interval"];
          is_active?: boolean;
          is_custom?: boolean;
          is_public?: boolean;
          limits?: Json;
          monthly_plan_code?: string | null;
          name?: string;
          price_cents?: number;
          sort_order?: number;
          tagline?: string | null;
          tier?: Database["public"]["Enums"]["plan_tier"];
          trial_days?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_announcements: {
        Row: {
          audience: string;
          body: string;
          created_at: string;
          created_by: string | null;
          cta_label: string | null;
          cta_url: string | null;
          expires_at: string | null;
          id: string;
          kind: string;
          published_at: string | null;
          severity: string;
          starts_at: string | null;
          title: string;
          translations: Json;
          updated_at: string;
        };
        Insert: {
          audience?: string;
          body: string;
          created_at?: string;
          created_by?: string | null;
          cta_label?: string | null;
          cta_url?: string | null;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          published_at?: string | null;
          severity?: string;
          starts_at?: string | null;
          title: string;
          translations?: Json;
          updated_at?: string;
        };
        Update: {
          audience?: string;
          body?: string;
          created_at?: string;
          created_by?: string | null;
          cta_label?: string | null;
          cta_url?: string | null;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          published_at?: string | null;
          severity?: string;
          starts_at?: string | null;
          title?: string;
          translations?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          changes: Json;
          created_at: string;
          id: string;
          ip_address: unknown;
          resource_id: string | null;
          resource_type: string;
          summary: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          changes?: Json;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          resource_id?: string | null;
          resource_type: string;
          summary?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          changes?: Json;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          resource_id?: string | null;
          resource_type?: string;
          summary?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      platform_support_tickets: {
        Row: {
          assigned_to: string | null;
          category: string;
          created_at: string;
          description: string;
          first_response_at: string | null;
          id: string;
          metadata: Json;
          organization_id: string | null;
          priority: string;
          requester_id: string | null;
          resolved_at: string | null;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          category?: string;
          created_at?: string;
          description: string;
          first_response_at?: string | null;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          priority?: string;
          requester_id?: string | null;
          resolved_at?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          category?: string;
          created_at?: string;
          description?: string;
          first_response_at?: string | null;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          priority?: string;
          requester_id?: string | null;
          resolved_at?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_support_tickets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_backups: {
        Row: {
          config_snapshot: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          installation_id: string | null;
          permissions_snapshot: string[];
          plugin_id: string;
          reason: string | null;
          storage_snapshot: Json;
          version_id: string | null;
          version_string: string;
          workspace_id: string;
        };
        Insert: {
          config_snapshot?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          installation_id?: string | null;
          permissions_snapshot?: string[];
          plugin_id: string;
          reason?: string | null;
          storage_snapshot?: Json;
          version_id?: string | null;
          version_string: string;
          workspace_id: string;
        };
        Update: {
          config_snapshot?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          installation_id?: string | null;
          permissions_snapshot?: string[];
          plugin_id?: string;
          reason?: string | null;
          storage_snapshot?: Json;
          version_id?: string | null;
          version_string?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_backups_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "plugin_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_backups_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_backups_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plugin_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_backups_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_categories: {
        Row: {
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          label: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          label: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          label?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      plugin_compatibility_checks: {
        Row: {
          checked_at: string;
          checked_by: string | null;
          id: string;
          notes: string | null;
          plugin_id: string;
          results: Json;
          status: string;
          target_platform: string;
          target_version: string | null;
          version_id: string | null;
        };
        Insert: {
          checked_at?: string;
          checked_by?: string | null;
          id?: string;
          notes?: string | null;
          plugin_id: string;
          results?: Json;
          status?: string;
          target_platform?: string;
          target_version?: string | null;
          version_id?: string | null;
        };
        Update: {
          checked_at?: string;
          checked_by?: string | null;
          id?: string;
          notes?: string | null;
          plugin_id?: string;
          results?: Json;
          status?: string;
          target_platform?: string;
          target_version?: string | null;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_compatibility_checks_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_compatibility_checks_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plugin_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_downloads: {
        Row: {
          id: string;
          ip_hash: string | null;
          occurred_at: string;
          plugin_id: string;
          user_id: string | null;
          version_id: string | null;
          workspace_id: string | null;
        };
        Insert: {
          id?: string;
          ip_hash?: string | null;
          occurred_at?: string;
          plugin_id: string;
          user_id?: string | null;
          version_id?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          id?: string;
          ip_hash?: string | null;
          occurred_at?: string;
          plugin_id?: string;
          user_id?: string | null;
          version_id?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_downloads_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_downloads_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plugin_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_downloads_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_health_checks: {
        Row: {
          checked_at: string;
          cpu_usage: number | null;
          details: Json;
          error_rate: number | null;
          id: string;
          installation_id: string;
          latency_ms: number | null;
          memory_mb: number | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          checked_at?: string;
          cpu_usage?: number | null;
          details?: Json;
          error_rate?: number | null;
          id?: string;
          installation_id: string;
          latency_ms?: number | null;
          memory_mb?: number | null;
          status: string;
          workspace_id: string;
        };
        Update: {
          checked_at?: string;
          cpu_usage?: number | null;
          details?: Json;
          error_rate?: number | null;
          id?: string;
          installation_id?: string;
          latency_ms?: number | null;
          memory_mb?: number | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_health_checks_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "plugin_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_health_checks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_installations: {
        Row: {
          config: Json;
          granted_permissions: string[];
          id: string;
          installed_at: string;
          installed_by: string;
          last_error: string | null;
          last_health_at: string | null;
          last_health_status: string | null;
          plugin_id: string;
          previous_version_id: string | null;
          status: string;
          storage: Json;
          updated_at: string;
          version_id: string | null;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          granted_permissions?: string[];
          id?: string;
          installed_at?: string;
          installed_by: string;
          last_error?: string | null;
          last_health_at?: string | null;
          last_health_status?: string | null;
          plugin_id: string;
          previous_version_id?: string | null;
          status?: string;
          storage?: Json;
          updated_at?: string;
          version_id?: string | null;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          granted_permissions?: string[];
          id?: string;
          installed_at?: string;
          installed_by?: string;
          last_error?: string | null;
          last_health_at?: string | null;
          last_health_status?: string | null;
          plugin_id?: string;
          previous_version_id?: string | null;
          status?: string;
          storage?: Json;
          updated_at?: string;
          version_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_installations_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_installations_previous_version_id_fkey";
            columns: ["previous_version_id"];
            isOneToOne: false;
            referencedRelation: "plugin_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_installations_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plugin_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_installations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_license_activations: {
        Row: {
          activated_at: string;
          activated_by: string | null;
          deactivated_at: string | null;
          device_fingerprint: string | null;
          id: string;
          installation_id: string | null;
          last_validated_at: string | null;
          license_id: string;
          workspace_id: string;
        };
        Insert: {
          activated_at?: string;
          activated_by?: string | null;
          deactivated_at?: string | null;
          device_fingerprint?: string | null;
          id?: string;
          installation_id?: string | null;
          last_validated_at?: string | null;
          license_id: string;
          workspace_id: string;
        };
        Update: {
          activated_at?: string;
          activated_by?: string | null;
          deactivated_at?: string | null;
          device_fingerprint?: string | null;
          id?: string;
          installation_id?: string | null;
          last_validated_at?: string | null;
          license_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_license_activations_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "plugin_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_license_activations_license_id_fkey";
            columns: ["license_id"];
            isOneToOne: false;
            referencedRelation: "plugin_licenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_license_activations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_licenses: {
        Row: {
          created_at: string;
          currency: string;
          customer_user_id: string | null;
          customer_workspace_id: string | null;
          expires_at: string | null;
          id: string;
          issued_at: string;
          license_key: string;
          license_type: string;
          metadata: Json;
          plugin_id: string;
          price_cents: number;
          publisher_id: string | null;
          revoke_reason: string | null;
          revoked_at: string | null;
          seats: number;
          seats_used: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          customer_user_id?: string | null;
          customer_workspace_id?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          license_key: string;
          license_type?: string;
          metadata?: Json;
          plugin_id: string;
          price_cents?: number;
          publisher_id?: string | null;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          seats?: number;
          seats_used?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          customer_user_id?: string | null;
          customer_workspace_id?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          license_key?: string;
          license_type?: string;
          metadata?: Json;
          plugin_id?: string;
          price_cents?: number;
          publisher_id?: string | null;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          seats?: number;
          seats_used?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_licenses_customer_workspace_id_fkey";
            columns: ["customer_workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_licenses_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_logs: {
        Row: {
          context: Json;
          created_at: string;
          event: string;
          id: string;
          installation_id: string | null;
          level: string;
          message: string | null;
          plugin_id: string;
          workspace_id: string;
        };
        Insert: {
          context?: Json;
          created_at?: string;
          event: string;
          id?: string;
          installation_id?: string | null;
          level: string;
          message?: string | null;
          plugin_id: string;
          workspace_id: string;
        };
        Update: {
          context?: Json;
          created_at?: string;
          event?: string;
          id?: string;
          installation_id?: string | null;
          level?: string;
          message?: string | null;
          plugin_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_logs_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "plugin_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_logs_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_payouts: {
        Row: {
          created_at: string;
          currency: string;
          gateway: string | null;
          gateway_reference: string | null;
          id: string;
          paid_at: string | null;
          period_end: string;
          period_start: string;
          publisher_id: string;
          status: string;
          total_cents: number;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          gateway?: string | null;
          gateway_reference?: string | null;
          id?: string;
          paid_at?: string | null;
          period_end: string;
          period_start: string;
          publisher_id: string;
          status?: string;
          total_cents?: number;
        };
        Update: {
          created_at?: string;
          currency?: string;
          gateway?: string | null;
          gateway_reference?: string | null;
          id?: string;
          paid_at?: string | null;
          period_end?: string;
          period_start?: string;
          publisher_id?: string;
          status?: string;
          total_cents?: number;
        };
        Relationships: [];
      };
      plugin_purchases: {
        Row: {
          amount_cents: number;
          buyer_user_id: string | null;
          buyer_workspace_id: string | null;
          created_at: string;
          currency: string;
          fee_cents: number;
          gateway: string | null;
          gateway_reference: string | null;
          id: string;
          license_id: string | null;
          metadata: Json;
          net_cents: number;
          plugin_id: string;
          publisher_id: string | null;
          purchased_at: string;
          refunded_at: string | null;
          status: string;
          tax_cents: number;
        };
        Insert: {
          amount_cents?: number;
          buyer_user_id?: string | null;
          buyer_workspace_id?: string | null;
          created_at?: string;
          currency?: string;
          fee_cents?: number;
          gateway?: string | null;
          gateway_reference?: string | null;
          id?: string;
          license_id?: string | null;
          metadata?: Json;
          net_cents?: number;
          plugin_id: string;
          publisher_id?: string | null;
          purchased_at?: string;
          refunded_at?: string | null;
          status?: string;
          tax_cents?: number;
        };
        Update: {
          amount_cents?: number;
          buyer_user_id?: string | null;
          buyer_workspace_id?: string | null;
          created_at?: string;
          currency?: string;
          fee_cents?: number;
          gateway?: string | null;
          gateway_reference?: string | null;
          id?: string;
          license_id?: string | null;
          metadata?: Json;
          net_cents?: number;
          plugin_id?: string;
          publisher_id?: string | null;
          purchased_at?: string;
          refunded_at?: string | null;
          status?: string;
          tax_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_purchases_buyer_workspace_id_fkey";
            columns: ["buyer_workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_purchases_license_id_fkey";
            columns: ["license_id"];
            isOneToOne: false;
            referencedRelation: "plugin_licenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_purchases_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_revenue_shares: {
        Row: {
          created_at: string;
          currency: string;
          gross_cents: number;
          id: string;
          payout_id: string | null;
          platform_fee_cents: number;
          plugin_id: string;
          publisher_id: string | null;
          publisher_share_cents: number;
          purchase_id: string;
          share_bps: number;
          status: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          gross_cents?: number;
          id?: string;
          payout_id?: string | null;
          platform_fee_cents?: number;
          plugin_id: string;
          publisher_id?: string | null;
          publisher_share_cents?: number;
          purchase_id: string;
          share_bps?: number;
          status?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          gross_cents?: number;
          id?: string;
          payout_id?: string | null;
          platform_fee_cents?: number;
          plugin_id?: string;
          publisher_id?: string | null;
          publisher_share_cents?: number;
          purchase_id?: string;
          share_bps?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_revenue_shares_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_revenue_shares_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "plugin_purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_reviews: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          plugin_id: string;
          rating: number;
          reviewer_id: string;
          title: string | null;
          workspace_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          plugin_id: string;
          rating: number;
          reviewer_id: string;
          title?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          plugin_id?: string;
          rating?: number;
          reviewer_id?: string;
          title?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_reviews_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_reviews_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_security_scans: {
        Row: {
          id: string;
          issues: Json;
          notes: string | null;
          plugin_id: string;
          scanned_at: string;
          scanned_by: string | null;
          scanner: string;
          score: number | null;
          severity: string | null;
          status: string;
          version_id: string | null;
        };
        Insert: {
          id?: string;
          issues?: Json;
          notes?: string | null;
          plugin_id: string;
          scanned_at?: string;
          scanned_by?: string | null;
          scanner?: string;
          score?: number | null;
          severity?: string | null;
          status?: string;
          version_id?: string | null;
        };
        Update: {
          id?: string;
          issues?: Json;
          notes?: string | null;
          plugin_id?: string;
          scanned_at?: string;
          scanned_by?: string | null;
          scanner?: string;
          score?: number | null;
          severity?: string | null;
          status?: string;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_security_scans_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_security_scans_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "plugin_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_subscriptions: {
        Row: {
          amount_cents: number;
          cancel_at_period_end: boolean;
          cancelled_at: string | null;
          created_at: string;
          currency: string;
          current_period_end: string;
          current_period_start: string;
          gateway: string | null;
          gateway_subscription_id: string | null;
          id: string;
          interval: string;
          interval_count: number;
          license_id: string;
          plugin_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents?: number;
          cancel_at_period_end?: boolean;
          cancelled_at?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end: string;
          current_period_start?: string;
          gateway?: string | null;
          gateway_subscription_id?: string | null;
          id?: string;
          interval?: string;
          interval_count?: number;
          license_id: string;
          plugin_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          cancel_at_period_end?: boolean;
          cancelled_at?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string;
          current_period_start?: string;
          gateway?: string | null;
          gateway_subscription_id?: string | null;
          id?: string;
          interval?: string;
          interval_count?: number;
          license_id?: string;
          plugin_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_subscriptions_license_id_fkey";
            columns: ["license_id"];
            isOneToOne: false;
            referencedRelation: "plugin_licenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_subscriptions_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_trials: {
        Row: {
          converted_license_id: string | null;
          created_at: string;
          id: string;
          plugin_id: string;
          status: string;
          trial_end: string;
          trial_start: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          converted_license_id?: string | null;
          created_at?: string;
          id?: string;
          plugin_id: string;
          status?: string;
          trial_end: string;
          trial_start?: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          converted_license_id?: string | null;
          created_at?: string;
          id?: string;
          plugin_id?: string;
          status?: string;
          trial_end?: string;
          trial_start?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_trials_converted_license_id_fkey";
            columns: ["converted_license_id"];
            isOneToOne: false;
            referencedRelation: "plugin_licenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_trials_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_trials_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_usage_events: {
        Row: {
          event_name: string;
          id: string;
          license_id: string | null;
          metadata: Json;
          occurred_at: string;
          plugin_id: string;
          quantity: number;
          workspace_id: string | null;
        };
        Insert: {
          event_name: string;
          id?: string;
          license_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          plugin_id: string;
          quantity?: number;
          workspace_id?: string | null;
        };
        Update: {
          event_name?: string;
          id?: string;
          license_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          plugin_id?: string;
          quantity?: number;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_usage_events_license_id_fkey";
            columns: ["license_id"];
            isOneToOne: false;
            referencedRelation: "plugin_licenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_usage_events_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plugin_usage_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plugin_versions: {
        Row: {
          changelog: string | null;
          created_at: string;
          entry_url: string | null;
          id: string;
          is_stable: boolean;
          manifest: Json;
          min_app_version: string | null;
          permissions: string[];
          plugin_id: string;
          published_at: string;
          version: string;
        };
        Insert: {
          changelog?: string | null;
          created_at?: string;
          entry_url?: string | null;
          id?: string;
          is_stable?: boolean;
          manifest?: Json;
          min_app_version?: string | null;
          permissions?: string[];
          plugin_id: string;
          published_at?: string;
          version: string;
        };
        Update: {
          changelog?: string | null;
          created_at?: string;
          entry_url?: string | null;
          id?: string;
          is_stable?: boolean;
          manifest?: Json;
          min_app_version?: string | null;
          permissions?: string[];
          plugin_id?: string;
          published_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plugin_versions_plugin_id_fkey";
            columns: ["plugin_id"];
            isOneToOne: false;
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
        ];
      };
      plugins: {
        Row: {
          banner_url: string | null;
          category: string;
          created_at: string;
          currency: string;
          description: string | null;
          homepage_url: string | null;
          icon_url: string | null;
          id: string;
          install_count: number;
          is_featured: boolean;
          is_public: boolean;
          is_verified: boolean;
          moderated_at: string | null;
          moderated_by: string | null;
          name: string;
          price_cents: number;
          pricing_model: string;
          publisher_id: string;
          publisher_name: string | null;
          rating_avg: number;
          rating_count: number;
          rejection_reason: string | null;
          repo_url: string | null;
          screenshots: string[];
          slug: string;
          status: string;
          tagline: string | null;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          banner_url?: string | null;
          category?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          homepage_url?: string | null;
          icon_url?: string | null;
          id?: string;
          install_count?: number;
          is_featured?: boolean;
          is_public?: boolean;
          is_verified?: boolean;
          moderated_at?: string | null;
          moderated_by?: string | null;
          name: string;
          price_cents?: number;
          pricing_model?: string;
          publisher_id: string;
          publisher_name?: string | null;
          rating_avg?: number;
          rating_count?: number;
          rejection_reason?: string | null;
          repo_url?: string | null;
          screenshots?: string[];
          slug: string;
          status?: string;
          tagline?: string | null;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          banner_url?: string | null;
          category?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          homepage_url?: string | null;
          icon_url?: string | null;
          id?: string;
          install_count?: number;
          is_featured?: boolean;
          is_public?: boolean;
          is_verified?: boolean;
          moderated_at?: string | null;
          moderated_by?: string | null;
          name?: string;
          price_cents?: number;
          pricing_model?: string;
          publisher_id?: string;
          publisher_name?: string | null;
          rating_avg?: number;
          rating_count?: number;
          rejection_reason?: string | null;
          repo_url?: string | null;
          screenshots?: string[];
          slug?: string;
          status?: string;
          tagline?: string | null;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      product_attachments: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string | null;
          name: string;
          product_id: string;
          size_bytes: number | null;
          uploaded_by: string | null;
          url: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mime_type?: string | null;
          name: string;
          product_id: string;
          size_bytes?: number | null;
          uploaded_by?: string | null;
          url: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mime_type?: string | null;
          name?: string;
          product_id?: string;
          size_bytes?: number | null;
          uploaded_by?: string | null;
          url?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_attachments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_attachments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      product_bundle_items: {
        Row: {
          bundle_id: string;
          created_at: string;
          discount_pct: number;
          id: string;
          product_id: string;
          quantity: number;
          sort_order: number;
          workspace_id: string;
        };
        Insert: {
          bundle_id: string;
          created_at?: string;
          discount_pct?: number;
          id?: string;
          product_id: string;
          quantity?: number;
          sort_order?: number;
          workspace_id: string;
        };
        Update: {
          bundle_id?: string;
          created_at?: string;
          discount_pct?: number;
          id?: string;
          product_id?: string;
          quantity?: number;
          sort_order?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_bundle_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      product_categories: {
        Row: {
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          parent_id: string | null;
          slug: string | null;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          parent_id?: string | null;
          slug?: string | null;
          sort_order?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string | null;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_categories_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      product_favorites: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_favorites_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_favorites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          barcode: string | null;
          cost: number | null;
          created_at: string;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          options: Json;
          price: number | null;
          product_id: string;
          sale_price: number | null;
          sku: string | null;
          stock_quantity: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          barcode?: string | null;
          cost?: number | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          options?: Json;
          price?: number | null;
          product_id: string;
          sale_price?: number | null;
          sku?: string | null;
          stock_quantity?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          barcode?: string | null;
          cost?: number | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          options?: Json;
          price?: number | null;
          product_id?: string;
          sale_price?: number | null;
          sku?: string | null;
          stock_quantity?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          attributes: Json;
          availability: string;
          barcode: string | null;
          billing_interval: string | null;
          brand_id: string | null;
          category: string | null;
          category_id: string | null;
          cost: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          custom_fields: Json;
          deleted_at: string | null;
          description: string | null;
          gallery: Json;
          id: string;
          image_url: string | null;
          images: Json;
          is_active: boolean;
          is_featured: boolean;
          is_taxable: boolean;
          is_variant: boolean;
          kind: Database["public"]["Enums"]["product_kind"];
          low_stock_threshold: number | null;
          metadata: Json;
          name: string;
          organization_id: string | null;
          parent_product_id: string | null;
          price: number;
          product_type: string;
          retailer_id: string | null;
          sale_price: number | null;
          sku: string | null;
          status: string;
          stock_quantity: number | null;
          tags: string[] | null;
          tax_rate: number;
          track_inventory: boolean;
          unit: string | null;
          updated_at: string;
          variant_attributes: Json;
          videos: Json;
          wa_catalog_error: string | null;
          wa_catalog_status: string;
          wa_catalog_synced_at: string | null;
          wa_visibility: string;
          workspace_id: string;
        };
        Insert: {
          attributes?: Json;
          availability?: string;
          barcode?: string | null;
          billing_interval?: string | null;
          brand_id?: string | null;
          category?: string | null;
          category_id?: string | null;
          cost?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          gallery?: Json;
          id?: string;
          image_url?: string | null;
          images?: Json;
          is_active?: boolean;
          is_featured?: boolean;
          is_taxable?: boolean;
          is_variant?: boolean;
          kind?: Database["public"]["Enums"]["product_kind"];
          low_stock_threshold?: number | null;
          metadata?: Json;
          name: string;
          organization_id?: string | null;
          parent_product_id?: string | null;
          price?: number;
          product_type?: string;
          retailer_id?: string | null;
          sale_price?: number | null;
          sku?: string | null;
          status?: string;
          stock_quantity?: number | null;
          tags?: string[] | null;
          tax_rate?: number;
          track_inventory?: boolean;
          unit?: string | null;
          updated_at?: string;
          variant_attributes?: Json;
          videos?: Json;
          wa_catalog_error?: string | null;
          wa_catalog_status?: string;
          wa_catalog_synced_at?: string | null;
          wa_visibility?: string;
          workspace_id: string;
        };
        Update: {
          attributes?: Json;
          availability?: string;
          barcode?: string | null;
          billing_interval?: string | null;
          brand_id?: string | null;
          category?: string | null;
          category_id?: string | null;
          cost?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          gallery?: Json;
          id?: string;
          image_url?: string | null;
          images?: Json;
          is_active?: boolean;
          is_featured?: boolean;
          is_taxable?: boolean;
          is_variant?: boolean;
          kind?: Database["public"]["Enums"]["product_kind"];
          low_stock_threshold?: number | null;
          metadata?: Json;
          name?: string;
          organization_id?: string | null;
          parent_product_id?: string | null;
          price?: number;
          product_type?: string;
          retailer_id?: string | null;
          sale_price?: number | null;
          sku?: string | null;
          status?: string;
          stock_quantity?: number | null;
          tags?: string[] | null;
          tax_rate?: number;
          track_inventory?: boolean;
          unit?: string | null;
          updated_at?: string;
          variant_attributes?: Json;
          videos?: Json;
          wa_catalog_error?: string | null;
          wa_catalog_status?: string;
          wa_catalog_synced_at?: string | null;
          wa_visibility?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "commerce_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_parent_product_id_fkey";
            columns: ["parent_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          date_format: string;
          department: string | null;
          display_name: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          job_title: string | null;
          language: string;
          last_active_organization_id: string | null;
          last_seen_at: string | null;
          notification_preferences: Json;
          phone: string | null;
          theme: string;
          time_format: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          date_format?: string;
          department?: string | null;
          display_name?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          job_title?: string | null;
          language?: string;
          last_active_organization_id?: string | null;
          last_seen_at?: string | null;
          notification_preferences?: Json;
          phone?: string | null;
          theme?: string;
          time_format?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          date_format?: string;
          department?: string | null;
          display_name?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          job_title?: string | null;
          language?: string;
          last_active_organization_id?: string | null;
          last_seen_at?: string | null;
          notification_preferences?: Json;
          phone?: string | null;
          theme?: string;
          time_format?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_last_active_organization_id_fkey";
            columns: ["last_active_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_logs: {
        Row: {
          channel_account_id: string | null;
          correlation_id: string | null;
          created_at: string;
          data: Json;
          id: string;
          level: string;
          message: string;
          provider: Database["public"]["Enums"]["messaging_provider"] | null;
          scope: string;
          workspace_id: string | null;
        };
        Insert: {
          channel_account_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          level?: string;
          message: string;
          provider?: Database["public"]["Enums"]["messaging_provider"] | null;
          scope: string;
          workspace_id?: string | null;
        };
        Update: {
          channel_account_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          level?: string;
          message?: string;
          provider?: Database["public"]["Enums"]["messaging_provider"] | null;
          scope?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "provider_logs_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_media_cache: {
        Row: {
          channel_account_id: string | null;
          created_at: string;
          error: string | null;
          external_media_id: string;
          fetched_at: string | null;
          id: string;
          mime_type: string | null;
          provider: Database["public"]["Enums"]["messaging_provider"];
          sha256: string | null;
          size_bytes: number | null;
          status: string;
          storage_bucket: string;
          storage_path: string | null;
          updated_at: string;
        };
        Insert: {
          channel_account_id?: string | null;
          created_at?: string;
          error?: string | null;
          external_media_id: string;
          fetched_at?: string | null;
          id?: string;
          mime_type?: string | null;
          provider: Database["public"]["Enums"]["messaging_provider"];
          sha256?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_bucket?: string;
          storage_path?: string | null;
          updated_at?: string;
        };
        Update: {
          channel_account_id?: string | null;
          created_at?: string;
          error?: string | null;
          external_media_id?: string;
          fetched_at?: string | null;
          id?: string;
          mime_type?: string | null;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          sha256?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_bucket?: string;
          storage_path?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_media_cache_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      push_tokens: {
        Row: {
          app_version: string | null;
          created_at: string;
          device_name: string | null;
          disabled: boolean;
          id: string;
          last_seen_at: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          created_at?: string;
          device_name?: string | null;
          disabled?: boolean;
          id?: string;
          last_seen_at?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          device_name?: string | null;
          disabled?: boolean;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      queue_tickets: {
        Row: {
          assigned_at: string | null;
          assigned_to: string | null;
          entered_at: string;
          id: string;
          queue_id: string;
          status: string;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          entered_at?: string;
          id?: string;
          queue_id: string;
          status?: string;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          entered_at?: string;
          id?: string;
          queue_id?: string;
          status?: string;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "queue_tickets_queue_id_fkey";
            columns: ["queue_id"];
            isOneToOne: false;
            referencedRelation: "support_queues";
            referencedColumns: ["id"];
          },
        ];
      };
      quote_line_items: {
        Row: {
          created_at: string;
          description: string | null;
          discount_pct: number;
          id: string;
          name: string;
          product_id: string | null;
          quantity: number;
          quote_id: string;
          sort_order: number;
          subtotal: number;
          tax_rate: number;
          total: number;
          unit_price: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          discount_pct?: number;
          id?: string;
          name: string;
          product_id?: string | null;
          quantity?: number;
          quote_id: string;
          sort_order?: number;
          subtotal?: number;
          tax_rate?: number;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          discount_pct?: number;
          id?: string;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          quote_id?: string;
          sort_order?: number;
          subtotal?: number;
          tax_rate?: number;
          total?: number;
          unit_price?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quote_line_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_line_items_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_line_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      quotes: {
        Row: {
          accepted_at: string | null;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          custom_fields: Json;
          deal_id: string | null;
          deleted_at: string | null;
          discount_total: number;
          id: string;
          notes: string | null;
          organization_id: string | null;
          owner_id: string | null;
          parent_quote_id: string | null;
          public_token: string | null;
          quote_number: string;
          rejected_at: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["quote_status"];
          subtotal: number;
          tax_total: number;
          terms: string | null;
          title: string;
          total: number;
          updated_at: string;
          valid_until: string | null;
          version: number;
          viewed_at: string | null;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deal_id?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          id?: string;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          parent_quote_id?: string | null;
          public_token?: string | null;
          quote_number: string;
          rejected_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal?: number;
          tax_total?: number;
          terms?: string | null;
          title: string;
          total?: number;
          updated_at?: string;
          valid_until?: string | null;
          version?: number;
          viewed_at?: string | null;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_fields?: Json;
          deal_id?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          id?: string;
          notes?: string | null;
          organization_id?: string | null;
          owner_id?: string | null;
          parent_quote_id?: string | null;
          public_token?: string | null;
          quote_number?: string;
          rejected_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal?: number;
          tax_total?: number;
          terms?: string | null;
          title?: string;
          total?: number;
          updated_at?: string;
          valid_until?: string | null;
          version?: number;
          viewed_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey";
            columns: ["parent_quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_buckets: {
        Row: {
          bucket_key: string;
          count: number;
          created_at: string;
          id: string;
          window_seconds: number;
          window_start: string;
          workspace_id: string | null;
        };
        Insert: {
          bucket_key: string;
          count?: number;
          created_at?: string;
          id?: string;
          window_seconds: number;
          window_start: string;
          workspace_id?: string | null;
        };
        Update: {
          bucket_key?: string;
          count?: number;
          created_at?: string;
          id?: string;
          window_seconds?: number;
          window_start?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      release_notes: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          created_by: string | null;
          id: string;
          published_at: string | null;
          title: string;
          translations: Json;
          updated_at: string;
          version: string;
        };
        Insert: {
          body: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          title: string;
          translations?: Json;
          updated_at?: string;
          version: string;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          title?: string;
          translations?: Json;
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      revenue_forecasts: {
        Row: {
          ai_confidence: number | null;
          ai_summary: string | null;
          best_case: number;
          closed_won: number;
          commit_case: number;
          computed_at: string;
          currency: string;
          id: string;
          open_deals_count: number;
          period: Database["public"]["Enums"]["goal_period"];
          period_end: string;
          period_start: string;
          pipeline_id: string | null;
          weighted: number;
          workspace_id: string;
          worst_case: number;
        };
        Insert: {
          ai_confidence?: number | null;
          ai_summary?: string | null;
          best_case?: number;
          closed_won?: number;
          commit_case?: number;
          computed_at?: string;
          currency?: string;
          id?: string;
          open_deals_count?: number;
          period?: Database["public"]["Enums"]["goal_period"];
          period_end: string;
          period_start: string;
          pipeline_id?: string | null;
          weighted?: number;
          workspace_id: string;
          worst_case?: number;
        };
        Update: {
          ai_confidence?: number | null;
          ai_summary?: string | null;
          best_case?: number;
          closed_won?: number;
          commit_case?: number;
          computed_at?: string;
          currency?: string;
          id?: string;
          open_deals_count?: number;
          period?: Database["public"]["Enums"]["goal_period"];
          period_end?: string;
          period_start?: string;
          pipeline_id?: string | null;
          weighted?: number;
          workspace_id?: string;
          worst_case?: number;
        };
        Relationships: [
          {
            foreignKeyName: "revenue_forecasts_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "deal_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "revenue_forecasts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission_id: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_system: boolean;
          key: string;
          name: string;
          organization_id: string | null;
          scope: Database["public"]["Enums"]["role_scope"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          key: string;
          name: string;
          organization_id?: string | null;
          scope?: Database["public"]["Enums"]["role_scope"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          key?: string;
          name?: string;
          organization_id?: string | null;
          scope?: Database["public"]["Enums"]["role_scope"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_activities: {
        Row: {
          all_day: boolean;
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          custom_fields: Json;
          deleted_at: string | null;
          description: string | null;
          duration_minutes: number | null;
          end_at: string | null;
          entity_id: string | null;
          entity_type: string | null;
          external_calendar_id: string | null;
          external_event_id: string | null;
          external_provider: string | null;
          external_synced_at: string | null;
          id: string;
          location: string | null;
          meeting_url: string | null;
          notes: string | null;
          organization_id: string | null;
          outcome: string | null;
          owner_id: string | null;
          parent_activity_id: string | null;
          participants: string[];
          priority: string;
          recurrence: Json | null;
          reminder_at: string | null;
          reminder_sent: boolean;
          start_at: string | null;
          status: string;
          tags: string[];
          title: string;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          all_day?: boolean;
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          external_calendar_id?: string | null;
          external_event_id?: string | null;
          external_provider?: string | null;
          external_synced_at?: string | null;
          id?: string;
          location?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          outcome?: string | null;
          owner_id?: string | null;
          parent_activity_id?: string | null;
          participants?: string[];
          priority?: string;
          recurrence?: Json | null;
          reminder_at?: string | null;
          reminder_sent?: boolean;
          start_at?: string | null;
          status?: string;
          tags?: string[];
          title: string;
          type: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          all_day?: boolean;
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          external_calendar_id?: string | null;
          external_event_id?: string | null;
          external_provider?: string | null;
          external_synced_at?: string | null;
          id?: string;
          location?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          outcome?: string | null;
          owner_id?: string | null;
          parent_activity_id?: string | null;
          participants?: string[];
          priority?: string;
          recurrence?: Json | null;
          reminder_at?: string | null;
          reminder_sent?: boolean;
          start_at?: string | null;
          status?: string;
          tags?: string[];
          title?: string;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_activities_parent_activity_id_fkey";
            columns: ["parent_activity_id"];
            isOneToOne: false;
            referencedRelation: "sales_activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_activities_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_goals: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          ends_on: string;
          id: string;
          is_active: boolean;
          metadata: Json;
          metric: Database["public"]["Enums"]["goal_metric"];
          name: string;
          organization_id: string | null;
          period: Database["public"]["Enums"]["goal_period"];
          pipeline_id: string | null;
          scope: string;
          starts_on: string;
          target_amount: number;
          updated_at: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          ends_on: string;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          metric: Database["public"]["Enums"]["goal_metric"];
          name: string;
          organization_id?: string | null;
          period?: Database["public"]["Enums"]["goal_period"];
          pipeline_id?: string | null;
          scope?: string;
          starts_on: string;
          target_amount?: number;
          updated_at?: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          ends_on?: string;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          metric?: Database["public"]["Enums"]["goal_metric"];
          name?: string;
          organization_id?: string | null;
          period?: Database["public"]["Enums"]["goal_period"];
          pipeline_id?: string | null;
          scope?: string;
          starts_on?: string;
          target_amount?: number;
          updated_at?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_goals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_goals_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "deal_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_goals_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_audiences: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          filter_definition: Json;
          id: string;
          is_favorite: boolean;
          is_shared: boolean;
          last_computed_at: string | null;
          last_used_at: string | null;
          member_count: number;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          filter_definition?: Json;
          id?: string;
          is_favorite?: boolean;
          is_shared?: boolean;
          last_computed_at?: string | null;
          last_used_at?: string | null;
          member_count?: number;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          filter_definition?: Json;
          id?: string;
          is_favorite?: boolean;
          is_shared?: boolean;
          last_computed_at?: string | null;
          last_used_at?: string | null;
          member_count?: number;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      saved_filters: {
        Row: {
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          is_pinned: boolean;
          name: string;
          owner_id: string | null;
          query: Json;
          scope: string;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_pinned?: boolean;
          name: string;
          owner_id?: string | null;
          query?: Json;
          scope?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_pinned?: boolean;
          name?: string;
          owner_id?: string | null;
          query?: Json;
          scope?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_filters_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          color: string | null;
          created_at: string;
          filters: Json;
          icon: string | null;
          id: string;
          is_pinned: boolean;
          is_shared: boolean;
          last_used_at: string | null;
          name: string;
          query: string;
          scope: string | null;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          filters?: Json;
          icon?: string | null;
          id?: string;
          is_pinned?: boolean;
          is_shared?: boolean;
          last_used_at?: string | null;
          name: string;
          query: string;
          scope?: string | null;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          filters?: Json;
          icon?: string | null;
          id?: string;
          is_pinned?: boolean;
          is_shared?: boolean;
          last_used_at?: string | null;
          name?: string;
          query?: string;
          scope?: string | null;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      scheduled_messages: {
        Row: {
          attachments: Json;
          body: string;
          conversation_id: string;
          created_at: string;
          created_by: string | null;
          error: string | null;
          id: string;
          message_type: string;
          metadata: Json;
          scheduled_for: string;
          sent_at: string | null;
          sent_message_id: string | null;
          status: Database["public"]["Enums"]["scheduled_message_status"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          attachments?: Json;
          body: string;
          conversation_id: string;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          message_type?: string;
          metadata?: Json;
          scheduled_for: string;
          sent_at?: string | null;
          sent_message_id?: string | null;
          status?: Database["public"]["Enums"]["scheduled_message_status"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          conversation_id?: string;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          message_type?: string;
          metadata?: Json;
          scheduled_for?: string;
          sent_at?: string | null;
          sent_message_id?: string | null;
          status?: Database["public"]["Enums"]["scheduled_message_status"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      search_history: {
        Row: {
          clicked_entity_id: string | null;
          clicked_entity_type: string | null;
          created_at: string;
          id: string;
          query: string;
          result_count: number;
          scope: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          clicked_entity_id?: string | null;
          clicked_entity_type?: string | null;
          created_at?: string;
          id?: string;
          query: string;
          result_count?: number;
          scope?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          clicked_entity_id?: string | null;
          clicked_entity_type?: string | null;
          created_at?: string;
          id?: string;
          query?: string;
          result_count?: number;
          scope?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      security_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          data: Json;
          event_type: string;
          id: string;
          ip_address: unknown;
          resource_id: string | null;
          resource_type: string | null;
          severity: string;
          user_agent: string | null;
          workspace_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          event_type: string;
          id?: string;
          ip_address?: unknown;
          resource_id?: string | null;
          resource_type?: string | null;
          severity?: string;
          user_agent?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          event_type?: string;
          id?: string;
          ip_address?: unknown;
          resource_id?: string | null;
          resource_type?: string | null;
          severity?: string;
          user_agent?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "security_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      segment_members: {
        Row: {
          added_at: string;
          contact_id: string;
          segment_id: string;
        };
        Insert: {
          added_at?: string;
          contact_id: string;
          segment_id: string;
        };
        Update: {
          added_at?: string;
          contact_id?: string;
          segment_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "segment_members_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "segment_members_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "customer_segments";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          created_at: string;
          device: string | null;
          id: string;
          ip_address: unknown;
          last_seen_at: string;
          location: string | null;
          revoked_at: string | null;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device?: string | null;
          id?: string;
          ip_address?: unknown;
          last_seen_at?: string;
          location?: string | null;
          revoked_at?: string | null;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device?: string | null;
          id?: string;
          ip_address?: unknown;
          last_seen_at?: string;
          location?: string | null;
          revoked_at?: string | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          created_at: string;
          id: string;
          key: string;
          organization_id: string | null;
          scope: Database["public"]["Enums"]["settings_scope"];
          updated_at: string;
          user_id: string | null;
          value: Json;
          workspace_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          key: string;
          organization_id?: string | null;
          scope: Database["public"]["Enums"]["settings_scope"];
          updated_at?: string;
          user_id?: string | null;
          value?: Json;
          workspace_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          key?: string;
          organization_id?: string | null;
          scope?: Database["public"]["Enums"]["settings_scope"];
          updated_at?: string;
          user_id?: string | null;
          value?: Json;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      sla_escalation_rules: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean | null;
          level: number;
          minutes_offset: number;
          name: string;
          notify_supervisor: boolean | null;
          raise_priority: boolean | null;
          reassign_to_department_id: string | null;
          reassign_to_user_id: string | null;
          sla_policy_id: string;
          supervisor_user_ids: string[] | null;
          trigger_type: string;
          updated_at: string;
          workflow_event: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          level?: number;
          minutes_offset?: number;
          name: string;
          notify_supervisor?: boolean | null;
          raise_priority?: boolean | null;
          reassign_to_department_id?: string | null;
          reassign_to_user_id?: string | null;
          sla_policy_id: string;
          supervisor_user_ids?: string[] | null;
          trigger_type?: string;
          updated_at?: string;
          workflow_event?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          level?: number;
          minutes_offset?: number;
          name?: string;
          notify_supervisor?: boolean | null;
          raise_priority?: boolean | null;
          reassign_to_department_id?: string | null;
          reassign_to_user_id?: string | null;
          sla_policy_id?: string;
          supervisor_user_ids?: string[] | null;
          trigger_type?: string;
          updated_at?: string;
          workflow_event?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sla_escalation_rules_sla_policy_id_fkey";
            columns: ["sla_policy_id"];
            isOneToOne: false;
            referencedRelation: "sla_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      sla_events: {
        Row: {
          created_at: string;
          escalation_rule_id: string | null;
          event_type: string;
          id: string;
          level: number | null;
          meta: Json | null;
          sla_policy_id: string | null;
          target: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          escalation_rule_id?: string | null;
          event_type: string;
          id?: string;
          level?: number | null;
          meta?: Json | null;
          sla_policy_id?: string | null;
          target?: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          escalation_rule_id?: string | null;
          event_type?: string;
          id?: string;
          level?: number | null;
          meta?: Json | null;
          sla_policy_id?: string | null;
          target?: string | null;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      sla_holidays: {
        Row: {
          created_at: string;
          holiday_date: string;
          id: string;
          name: string;
          recurring_yearly: boolean | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          holiday_date: string;
          id?: string;
          name: string;
          recurring_yearly?: boolean | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          holiday_date?: string;
          id?: string;
          name?: string;
          recurring_yearly?: boolean | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      sla_policies: {
        Row: {
          business_hours_only: boolean;
          created_at: string;
          created_by: string | null;
          description: string | null;
          first_response_minutes: number | null;
          id: string;
          inbox_ids: string[];
          is_active: boolean;
          name: string;
          priorities: Database["public"]["Enums"]["conversation_priority"][];
          priority_rank: number;
          resolution_minutes: number | null;
          response_minutes: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          business_hours_only?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          first_response_minutes?: number | null;
          id?: string;
          inbox_ids?: string[];
          is_active?: boolean;
          name: string;
          priorities?: Database["public"]["Enums"]["conversation_priority"][];
          priority_rank?: number;
          resolution_minutes?: number | null;
          response_minutes?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          business_hours_only?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          first_response_minutes?: number | null;
          id?: string;
          inbox_ids?: string[];
          is_active?: boolean;
          name?: string;
          priorities?: Database["public"]["Enums"]["conversation_priority"][];
          priority_rank?: number;
          resolution_minutes?: number | null;
          response_minutes?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sla_policies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_accounts: {
        Row: {
          account_sid: string | null;
          auth_token_ciphertext: string | null;
          connected_at: string;
          connected_by: string | null;
          created_at: string;
          display_name: string;
          id: string;
          last_verified_at: string | null;
          metadata: Json;
          phone_digits: string | null;
          phone_number: string;
          provider: string;
          status: string;
          status_reason: string | null;
          updated_at: string;
          webhook_secret: string | null;
          workspace_id: string;
        };
        Insert: {
          account_sid?: string | null;
          auth_token_ciphertext?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          display_name: string;
          id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          phone_digits?: string | null;
          phone_number: string;
          provider?: string;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          webhook_secret?: string | null;
          workspace_id: string;
        };
        Update: {
          account_sid?: string | null;
          auth_token_ciphertext?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          phone_digits?: string | null;
          phone_number?: string;
          provider?: string;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          webhook_secret?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sms_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      social_channels: {
        Row: {
          access_token: string | null;
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          external_id: string | null;
          id: string;
          last_health_check_at: string | null;
          metadata: Json;
          name: string;
          platform: string;
          platform_options: Json;
          refresh_token: string | null;
          refresh_token_expires_at: string | null;
          status: string;
          token_expires_at: string | null;
          token_refresh_error: string | null;
          updated_at: string;
          username: string | null;
          workspace_id: string;
        };
        Insert: {
          access_token?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          external_id?: string | null;
          id?: string;
          last_health_check_at?: string | null;
          metadata?: Json;
          name: string;
          platform: string;
          platform_options?: Json;
          refresh_token?: string | null;
          refresh_token_expires_at?: string | null;
          status?: string;
          token_expires_at?: string | null;
          token_refresh_error?: string | null;
          updated_at?: string;
          username?: string | null;
          workspace_id: string;
        };
        Update: {
          access_token?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          external_id?: string | null;
          id?: string;
          last_health_check_at?: string | null;
          metadata?: Json;
          name?: string;
          platform?: string;
          platform_options?: Json;
          refresh_token?: string | null;
          refresh_token_expires_at?: string | null;
          status?: string;
          token_expires_at?: string | null;
          token_refresh_error?: string | null;
          updated_at?: string;
          username?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      social_post_library: {
        Row: {
          allow_multi_vote: boolean;
          caption: string;
          content_type: Database["public"]["Enums"]["social_content_type"];
          created_at: string;
          created_by: string | null;
          first_comment: string | null;
          id: string;
          link_url: string | null;
          media_kind: Database["public"]["Enums"]["social_media_kind"];
          media_urls: string[];
          name: string;
          poll_duration: number;
          poll_options: string[];
          tags: string[];
          updated_at: string;
          use_count: number;
          workspace_id: string;
        };
        Insert: {
          allow_multi_vote?: boolean;
          caption?: string;
          content_type?: Database["public"]["Enums"]["social_content_type"];
          created_at?: string;
          created_by?: string | null;
          first_comment?: string | null;
          id?: string;
          link_url?: string | null;
          media_kind?: Database["public"]["Enums"]["social_media_kind"];
          media_urls?: string[];
          name: string;
          poll_duration?: number;
          poll_options?: string[];
          tags?: string[];
          updated_at?: string;
          use_count?: number;
          workspace_id: string;
        };
        Update: {
          allow_multi_vote?: boolean;
          caption?: string;
          content_type?: Database["public"]["Enums"]["social_content_type"];
          created_at?: string;
          created_by?: string | null;
          first_comment?: string | null;
          id?: string;
          link_url?: string | null;
          media_kind?: Database["public"]["Enums"]["social_media_kind"];
          media_urls?: string[];
          name?: string;
          poll_duration?: number;
          poll_options?: string[];
          tags?: string[];
          updated_at?: string;
          use_count?: number;
          workspace_id?: string;
        };
        Relationships: [];
      };
      social_post_metrics: {
        Row: {
          channel_id: string | null;
          clicks: number;
          comments: number;
          created_at: string;
          fetched_at: string;
          id: string;
          impressions: number;
          likes: number;
          platform: string;
          post_id: string;
          raw: Json;
          shares: number;
          target_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          channel_id?: string | null;
          clicks?: number;
          comments?: number;
          created_at?: string;
          fetched_at?: string;
          id?: string;
          impressions?: number;
          likes?: number;
          platform: string;
          post_id: string;
          raw?: Json;
          shares?: number;
          target_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          channel_id?: string | null;
          clicks?: number;
          comments?: number;
          created_at?: string;
          fetched_at?: string;
          id?: string;
          impressions?: number;
          likes?: number;
          platform?: string;
          post_id?: string;
          raw?: Json;
          shares?: number;
          target_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_post_metrics_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "social_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_post_metrics_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "social_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_post_metrics_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: true;
            referencedRelation: "social_post_targets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_post_metrics_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      social_post_targets: {
        Row: {
          channel_id: string;
          created_at: string;
          error: string | null;
          external_post_id: string | null;
          id: string;
          metrics: Json;
          next_retry_at: string | null;
          permalink: string | null;
          post_id: string;
          provider_response: Json;
          published_at: string | null;
          retry_count: number;
          scheduled_at: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          error?: string | null;
          external_post_id?: string | null;
          id?: string;
          metrics?: Json;
          next_retry_at?: string | null;
          permalink?: string | null;
          post_id: string;
          provider_response?: Json;
          published_at?: string | null;
          retry_count?: number;
          scheduled_at?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          error?: string | null;
          external_post_id?: string | null;
          id?: string;
          metrics?: Json;
          next_retry_at?: string | null;
          permalink?: string | null;
          post_id?: string;
          provider_response?: Json;
          published_at?: string | null;
          retry_count?: number;
          scheduled_at?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_post_targets_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "social_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_post_targets_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "social_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      social_posts: {
        Row: {
          allow_multi_vote: boolean;
          approval_status: string;
          cancelled_at: string | null;
          cancelled_by: string | null;
          caption: string;
          content_type: Database["public"]["Enums"]["social_content_type"];
          created_at: string;
          created_by: string | null;
          first_comment: string | null;
          id: string;
          last_error: string | null;
          link_url: string | null;
          media_kind: Database["public"]["Enums"]["social_media_kind"];
          media_urls: string[];
          poll_duration: number | null;
          poll_options: string[];
          published_at: string | null;
          retry_count: number;
          scheduled_at: string | null;
          status: string;
          timezone: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          allow_multi_vote?: boolean;
          approval_status?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          caption?: string;
          content_type?: Database["public"]["Enums"]["social_content_type"];
          created_at?: string;
          created_by?: string | null;
          first_comment?: string | null;
          id?: string;
          last_error?: string | null;
          link_url?: string | null;
          media_kind?: Database["public"]["Enums"]["social_media_kind"];
          media_urls?: string[];
          poll_duration?: number | null;
          poll_options?: string[];
          published_at?: string | null;
          retry_count?: number;
          scheduled_at?: string | null;
          status?: string;
          timezone?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          allow_multi_vote?: boolean;
          approval_status?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          caption?: string;
          content_type?: Database["public"]["Enums"]["social_content_type"];
          created_at?: string;
          created_by?: string | null;
          first_comment?: string | null;
          id?: string;
          last_error?: string | null;
          link_url?: string | null;
          media_kind?: Database["public"]["Enums"]["social_media_kind"];
          media_urls?: string[];
          poll_duration?: number | null;
          poll_options?: string[];
          published_at?: string | null;
          retry_count?: number;
          scheduled_at?: string | null;
          status?: string;
          timezone?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      social_profiles: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          handle: string | null;
          id: string;
          platform: string;
          updated_at: string;
          url: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          handle?: string | null;
          id?: string;
          platform: string;
          updated_at?: string;
          url?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          handle?: string | null;
          id?: string;
          platform?: string;
          updated_at?: string;
          url?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_profiles_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at: string | null;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          grace_period_ends_at: string | null;
          id: string;
          metadata: Json;
          organization_id: string;
          plan_id: string;
          provider: string | null;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          seats: number;
          status: Database["public"]["Enums"]["subscription_status"];
          suspended_at: string | null;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          grace_period_ends_at?: string | null;
          id?: string;
          metadata?: Json;
          organization_id: string;
          plan_id: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          seats?: number;
          status?: Database["public"]["Enums"]["subscription_status"];
          suspended_at?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          grace_period_ends_at?: string | null;
          id?: string;
          metadata?: Json;
          organization_id?: string;
          plan_id?: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          seats?: number;
          status?: Database["public"]["Enums"]["subscription_status"];
          suspended_at?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      support_queues: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          inbox_id: string | null;
          is_active: boolean | null;
          max_open_per_agent: number | null;
          name: string;
          priority: number | null;
          required_languages: string[] | null;
          required_skills: string[] | null;
          round_robin_cursor: number | null;
          strategy: string;
          updated_at: string;
          vip_only: boolean | null;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          inbox_id?: string | null;
          is_active?: boolean | null;
          max_open_per_agent?: number | null;
          name: string;
          priority?: number | null;
          required_languages?: string[] | null;
          required_skills?: string[] | null;
          round_robin_cursor?: number | null;
          strategy?: string;
          updated_at?: string;
          vip_only?: boolean | null;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          inbox_id?: string | null;
          is_active?: boolean | null;
          max_open_per_agent?: number | null;
          name?: string;
          priority?: number | null;
          required_languages?: string[] | null;
          required_skills?: string[] | null;
          round_robin_cursor?: number | null;
          strategy?: string;
          updated_at?: string;
          vip_only?: boolean | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_queues_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_queues_inbox_id_fkey";
            columns: ["inbox_id"];
            isOneToOne: false;
            referencedRelation: "inboxes";
            referencedColumns: ["id"];
          },
        ];
      };
      support_ticket_messages: {
        Row: {
          attachments: Json;
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          is_internal: boolean;
          ticket_id: string;
        };
        Insert: {
          attachments?: Json;
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          ticket_id: string;
        };
        Update: {
          attachments?: Json;
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "platform_support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      survey_automations: {
        Row: {
          channel: string;
          created_at: string;
          created_by: string | null;
          delay_minutes: number;
          filters: Json;
          id: string;
          is_active: boolean;
          last_run_at: string | null;
          name: string;
          run_count: number;
          survey_id: string;
          trigger_config: Json;
          trigger_event: string | null;
          trigger_type: string;
          updated_at: string;
          workflow_id: string | null;
          workspace_id: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          delay_minutes?: number;
          filters?: Json;
          id?: string;
          is_active?: boolean;
          last_run_at?: string | null;
          name: string;
          run_count?: number;
          survey_id: string;
          trigger_config?: Json;
          trigger_event?: string | null;
          trigger_type: string;
          updated_at?: string;
          workflow_id?: string | null;
          workspace_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          delay_minutes?: number;
          filters?: Json;
          id?: string;
          is_active?: boolean;
          last_run_at?: string | null;
          name?: string;
          run_count?: number;
          survey_id?: string;
          trigger_config?: Json;
          trigger_event?: string | null;
          trigger_type?: string;
          updated_at?: string;
          workflow_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "survey_automations_survey_id_fkey";
            columns: ["survey_id"];
            isOneToOne: false;
            referencedRelation: "csat_surveys";
            referencedColumns: ["id"];
          },
        ];
      };
      survey_templates: {
        Row: {
          category: string | null;
          created_at: string;
          created_by: string | null;
          default_config: Json;
          description: string | null;
          icon: string | null;
          id: string;
          is_system: boolean;
          name: string;
          questions: Json;
          survey_type: string;
          updated_at: string;
          usage_count: number;
          workspace_id: string | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_config?: Json;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          questions?: Json;
          survey_type?: string;
          updated_at?: string;
          usage_count?: number;
          workspace_id?: string | null;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_config?: Json;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          questions?: Json;
          survey_type?: string;
          updated_at?: string;
          usage_count?: number;
          workspace_id?: string | null;
        };
        Relationships: [];
      };
      sync_cursors: {
        Row: {
          channel_account_id: string | null;
          created_at: string;
          cursor_value: string | null;
          id: string;
          kind: Database["public"]["Enums"]["sync_kind"];
          last_error: string | null;
          last_failure_at: string | null;
          last_job_id: string | null;
          last_success_at: string | null;
          last_synced_at: string | null;
          metadata: Json;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          channel_account_id?: string | null;
          created_at?: string;
          cursor_value?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["sync_kind"];
          last_error?: string | null;
          last_failure_at?: string | null;
          last_job_id?: string | null;
          last_success_at?: string | null;
          last_synced_at?: string | null;
          metadata?: Json;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          channel_account_id?: string | null;
          created_at?: string;
          cursor_value?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["sync_kind"];
          last_error?: string | null;
          last_failure_at?: string | null;
          last_job_id?: string | null;
          last_success_at?: string | null;
          last_synced_at?: string | null;
          metadata?: Json;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_cursors_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_cursors_last_job_id_fkey";
            columns: ["last_job_id"];
            isOneToOne: false;
            referencedRelation: "sync_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_cursors_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_jobs: {
        Row: {
          attempt: number;
          channel_account_id: string | null;
          completed_at: string | null;
          correlation_id: string | null;
          created_at: string;
          cursor_after: string | null;
          cursor_before: string | null;
          duration_ms: number | null;
          error: string | null;
          id: string;
          items_failed: number;
          items_processed: number;
          items_succeeded: number;
          kind: Database["public"]["Enums"]["sync_kind"];
          metadata: Json;
          next_retry_at: string | null;
          parent_job_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["sync_status"];
          trigger_source: string;
          triggered_by: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          attempt?: number;
          channel_account_id?: string | null;
          completed_at?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          cursor_after?: string | null;
          cursor_before?: string | null;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          items_failed?: number;
          items_processed?: number;
          items_succeeded?: number;
          kind: Database["public"]["Enums"]["sync_kind"];
          metadata?: Json;
          next_retry_at?: string | null;
          parent_job_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["sync_status"];
          trigger_source?: string;
          triggered_by?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          attempt?: number;
          channel_account_id?: string | null;
          completed_at?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          cursor_after?: string | null;
          cursor_before?: string | null;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          items_failed?: number;
          items_processed?: number;
          items_succeeded?: number;
          kind?: Database["public"]["Enums"]["sync_kind"];
          metadata?: Json;
          next_retry_at?: string | null;
          parent_job_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["sync_status"];
          trigger_source?: string;
          triggered_by?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_jobs_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_jobs_parent_job_id_fkey";
            columns: ["parent_job_id"];
            isOneToOne: false;
            referencedRelation: "sync_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_jobs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      system_message_templates: {
        Row: {
          body: string;
          channel: string;
          code: string;
          created_at: string;
          enabled: boolean;
          id: string;
          subject: string | null;
          translations: Json;
          updated_at: string;
          variables: Json;
        };
        Insert: {
          body: string;
          channel?: string;
          code: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          subject?: string | null;
          translations?: Json;
          updated_at?: string;
          variables?: Json;
        };
        Update: {
          body?: string;
          channel?: string;
          code?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          subject?: string | null;
          translations?: Json;
          updated_at?: string;
          variables?: Json;
        };
        Relationships: [];
      };
      task_reminder_log: {
        Row: {
          due_at: string;
          id: string;
          kind: string;
          offset_minutes: number;
          sent_at: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          due_at: string;
          id?: string;
          kind: string;
          offset_minutes: number;
          sent_at?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          due_at?: string;
          id?: string;
          kind?: string;
          offset_minutes?: number;
          sent_at?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_reminder_log_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_reminder_settings: {
        Row: {
          created_at: string;
          email_enabled: boolean;
          enabled: boolean;
          inapp_enabled: boolean;
          lead_minutes: number[];
          notify_overdue: boolean;
          overdue_repeat_minutes: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email_enabled?: boolean;
          enabled?: boolean;
          inapp_enabled?: boolean;
          lead_minutes?: number[];
          notify_overdue?: boolean;
          overdue_repeat_minutes?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_enabled?: boolean;
          enabled?: boolean;
          inapp_enabled?: boolean;
          lead_minutes?: number[];
          notify_overdue?: boolean;
          overdue_repeat_minutes?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          custom_fields: Json;
          deleted_at: string | null;
          description: string | null;
          due_at: string | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          organization_id: string | null;
          owner_id: string | null;
          parent_task_id: string | null;
          priority: string;
          reminder_at: string | null;
          status: string;
          tags: string[] | null;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          due_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          organization_id?: string | null;
          owner_id?: string | null;
          parent_task_id?: string | null;
          priority?: string;
          reminder_at?: string | null;
          status?: string;
          tags?: string[] | null;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          deleted_at?: string | null;
          description?: string | null;
          due_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          organization_id?: string | null;
          owner_id?: string | null;
          parent_task_id?: string | null;
          priority?: string;
          reminder_at?: string | null;
          status?: string;
          tags?: string[] | null;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey";
            columns: ["parent_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_rates: {
        Row: {
          code: string;
          country: string | null;
          created_at: string;
          id: string;
          inclusive: boolean;
          is_active: boolean;
          name: string;
          provider_tax_rate_ids: Json;
          rate_percent: number;
          region: string | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          country?: string | null;
          created_at?: string;
          id?: string;
          inclusive?: boolean;
          is_active?: boolean;
          name: string;
          provider_tax_rate_ids?: Json;
          rate_percent: number;
          region?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          country?: string | null;
          created_at?: string;
          id?: string;
          inclusive?: boolean;
          is_active?: boolean;
          name?: string;
          provider_tax_rate_ids?: Json;
          rate_percent?: number;
          region?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      telegram_accounts: {
        Row: {
          bot_id: string;
          bot_name: string | null;
          bot_token_ciphertext: string;
          bot_username: string | null;
          connected_at: string;
          connected_by: string | null;
          created_at: string;
          id: string;
          last_verified_at: string | null;
          metadata: Json;
          status: string;
          status_reason: string | null;
          updated_at: string;
          webhook_secret: string;
          workspace_id: string;
        };
        Insert: {
          bot_id: string;
          bot_name?: string | null;
          bot_token_ciphertext: string;
          bot_username?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          webhook_secret: string;
          workspace_id: string;
        };
        Update: {
          bot_id?: string;
          bot_name?: string | null;
          bot_token_ciphertext?: string;
          bot_username?: string | null;
          connected_at?: string;
          connected_by?: string | null;
          created_at?: string;
          id?: string;
          last_verified_at?: string | null;
          metadata?: Json;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          webhook_secret?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_accounts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_webhook_events: {
        Row: {
          account_id: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          last_retry_at: string | null;
          payload: Json;
          retry_count: number;
          status: string;
          update_id: number | null;
          updated_at: string;
          verified: boolean;
          workspace_id: string | null;
        };
        Insert: {
          account_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          last_retry_at?: string | null;
          payload?: Json;
          retry_count?: number;
          status?: string;
          update_id?: number | null;
          updated_at?: string;
          verified?: boolean;
          workspace_id?: string | null;
        };
        Update: {
          account_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          last_retry_at?: string | null;
          payload?: Json;
          retry_count?: number;
          status?: string;
          update_id?: number | null;
          updated_at?: string;
          verified?: boolean;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_webhook_events_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "telegram_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_webhook_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_quotas: {
        Row: {
          currency: string;
          hard_limit: number | null;
          id: string;
          included: number;
          meter_code: string;
          organization_id: string;
          overage_unit_price_cents: number | null;
          period_end: string;
          period_start: string;
          updated_at: string;
          used: number;
        };
        Insert: {
          currency?: string;
          hard_limit?: number | null;
          id?: string;
          included?: number;
          meter_code: string;
          organization_id: string;
          overage_unit_price_cents?: number | null;
          period_end: string;
          period_start: string;
          updated_at?: string;
          used?: number;
        };
        Update: {
          currency?: string;
          hard_limit?: number | null;
          id?: string;
          included?: number;
          meter_code?: string;
          organization_id?: string;
          overage_unit_price_cents?: number | null;
          period_end?: string;
          period_start?: string;
          updated_at?: string;
          used?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_quotas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      theme_installations: {
        Row: {
          id: string;
          installed_at: string;
          installed_by: string;
          is_active: boolean;
          overrides: Json;
          theme_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          id?: string;
          installed_at?: string;
          installed_by: string;
          is_active?: boolean;
          overrides?: Json;
          theme_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          id?: string;
          installed_at?: string;
          installed_by?: string;
          is_active?: boolean;
          overrides?: Json;
          theme_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "theme_installations_theme_id_fkey";
            columns: ["theme_id"];
            isOneToOne: false;
            referencedRelation: "themes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "theme_installations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      themes: {
        Row: {
          created_at: string;
          description: string | null;
          icon_url: string | null;
          id: string;
          install_count: number;
          is_featured: boolean;
          is_public: boolean;
          is_verified: boolean;
          moderated_at: string | null;
          moderated_by: string | null;
          name: string;
          preview_url: string | null;
          publisher_id: string | null;
          publisher_name: string | null;
          rejection_reason: string | null;
          slug: string;
          status: string;
          tokens: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          icon_url?: string | null;
          id?: string;
          install_count?: number;
          is_featured?: boolean;
          is_public?: boolean;
          is_verified?: boolean;
          moderated_at?: string | null;
          moderated_by?: string | null;
          name: string;
          preview_url?: string | null;
          publisher_id?: string | null;
          publisher_name?: string | null;
          rejection_reason?: string | null;
          slug: string;
          status?: string;
          tokens?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          icon_url?: string | null;
          id?: string;
          install_count?: number;
          is_featured?: boolean;
          is_public?: boolean;
          is_verified?: boolean;
          moderated_at?: string | null;
          moderated_by?: string | null;
          name?: string;
          preview_url?: string | null;
          publisher_id?: string | null;
          publisher_name?: string | null;
          rejection_reason?: string | null;
          slug?: string;
          status?: string;
          tokens?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      ticket_activity: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          from_value: Json | null;
          id: string;
          meta: Json | null;
          ticket_id: string;
          to_value: Json | null;
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          from_value?: Json | null;
          id?: string;
          meta?: Json | null;
          ticket_id: string;
          to_value?: Json | null;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          from_value?: Json | null;
          id?: string;
          meta?: Json | null;
          ticket_id?: string;
          to_value?: Json | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_activity_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_ai_suggestions: {
        Row: {
          created_at: string;
          dismissed: boolean;
          id: string;
          kind: string;
          payload: Json;
          score: number | null;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          dismissed?: boolean;
          id?: string;
          kind: string;
          payload?: Json;
          score?: number | null;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          dismissed?: boolean;
          id?: string;
          kind?: string;
          payload?: Json;
          score?: number | null;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_ai_suggestions_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_asset_links: {
        Row: {
          asset_id: string;
          created_at: string;
          id: string;
          linked_by: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          id?: string;
          linked_by?: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          id?: string;
          linked_by?: string | null;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_asset_links_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "ticket_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_asset_links_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_assets: {
        Row: {
          asset_type: string;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          identifier: string | null;
          location: string | null;
          metadata: Json | null;
          model: string | null;
          name: string;
          notes: string | null;
          purchased_at: string | null;
          status: string | null;
          updated_at: string;
          vendor: string | null;
          warranty_until: string | null;
          workspace_id: string;
        };
        Insert: {
          asset_type?: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          identifier?: string | null;
          location?: string | null;
          metadata?: Json | null;
          model?: string | null;
          name: string;
          notes?: string | null;
          purchased_at?: string | null;
          status?: string | null;
          updated_at?: string;
          vendor?: string | null;
          warranty_until?: string | null;
          workspace_id: string;
        };
        Update: {
          asset_type?: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          identifier?: string | null;
          location?: string | null;
          metadata?: Json | null;
          model?: string | null;
          name?: string;
          notes?: string | null;
          purchased_at?: string | null;
          status?: string | null;
          updated_at?: string;
          vendor?: string | null;
          warranty_until?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ticket_categories: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          default_priority: string | null;
          default_sla_policy_id: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          parent_id: string | null;
          sort_order: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_priority?: string | null;
          default_sla_policy_id?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          parent_id?: string | null;
          sort_order?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_priority?: string | null;
          default_sla_policy_id?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          parent_id?: string | null;
          sort_order?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_categories_default_sla_policy_id_fkey";
            columns: ["default_sla_policy_id"];
            isOneToOne: false;
            referencedRelation: "sla_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "ticket_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_counters: {
        Row: {
          next_number: number;
          workspace_id: string;
        };
        Insert: {
          next_number?: number;
          workspace_id: string;
        };
        Update: {
          next_number?: number;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ticket_crm_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_crm_links_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_escalations: {
        Row: {
          auto: boolean | null;
          created_at: string;
          created_by: string | null;
          escalated_from: string | null;
          escalated_to: string | null;
          escalated_to_team: string | null;
          id: string;
          level: number;
          reason: string | null;
          resolved_at: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          auto?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          escalated_from?: string | null;
          escalated_to?: string | null;
          escalated_to_team?: string | null;
          id?: string;
          level?: number;
          reason?: string | null;
          resolved_at?: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          auto?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          escalated_from?: string | null;
          escalated_to?: string | null;
          escalated_to_team?: string | null;
          id?: string;
          level?: number;
          reason?: string | null;
          resolved_at?: string | null;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_escalations_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          link_type: string;
          linked_ticket_id: string;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          link_type?: string;
          linked_ticket_id: string;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          link_type?: string;
          linked_ticket_id?: string;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_links_linked_ticket_id_fkey";
            columns: ["linked_ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_links_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_macros: {
        Row: {
          actions: Json;
          body: string;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_shared: boolean | null;
          name: string;
          tags: string[] | null;
          updated_at: string;
          usage_count: number | null;
          workspace_id: string;
        };
        Insert: {
          actions?: Json;
          body: string;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_shared?: boolean | null;
          name: string;
          tags?: string[] | null;
          updated_at?: string;
          usage_count?: number | null;
          workspace_id: string;
        };
        Update: {
          actions?: Json;
          body?: string;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_shared?: boolean | null;
          name?: string;
          tags?: string[] | null;
          updated_at?: string;
          usage_count?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_macros_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "ticket_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_mentions: {
        Row: {
          content: string | null;
          created_at: string;
          id: string;
          mentioned_by: string;
          mentioned_user_id: string;
          note_id: string | null;
          read_at: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          id?: string;
          mentioned_by: string;
          mentioned_user_id: string;
          note_id?: string | null;
          read_at?: string | null;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          id?: string;
          mentioned_by?: string;
          mentioned_user_id?: string;
          note_id?: string | null;
          read_at?: string | null;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      ticket_sla_tracking: {
        Row: {
          created_at: string;
          first_response_breached: boolean | null;
          first_response_due_at: string | null;
          id: string;
          last_escalation_level: number | null;
          next_response_due_at: string | null;
          paused: boolean | null;
          paused_at: string | null;
          resolution_breached: boolean | null;
          resolution_due_at: string | null;
          resolution_warning_sent: boolean | null;
          response_warning_sent: boolean | null;
          sla_policy_id: string | null;
          ticket_id: string;
          total_pause_seconds: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          first_response_breached?: boolean | null;
          first_response_due_at?: string | null;
          id?: string;
          last_escalation_level?: number | null;
          next_response_due_at?: string | null;
          paused?: boolean | null;
          paused_at?: string | null;
          resolution_breached?: boolean | null;
          resolution_due_at?: string | null;
          resolution_warning_sent?: boolean | null;
          response_warning_sent?: boolean | null;
          sla_policy_id?: string | null;
          ticket_id: string;
          total_pause_seconds?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          first_response_breached?: boolean | null;
          first_response_due_at?: string | null;
          id?: string;
          last_escalation_level?: number | null;
          next_response_due_at?: string | null;
          paused?: boolean | null;
          paused_at?: string | null;
          resolution_breached?: boolean | null;
          resolution_due_at?: string | null;
          resolution_warning_sent?: boolean | null;
          response_warning_sent?: boolean | null;
          sla_policy_id?: string | null;
          ticket_id?: string;
          total_pause_seconds?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_sla_tracking_sla_policy_id_fkey";
            columns: ["sla_policy_id"];
            isOneToOne: false;
            referencedRelation: "sla_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_sla_tracking_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: true;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_watchers: {
        Row: {
          added_by: string | null;
          created_at: string;
          id: string;
          ticket_id: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          id?: string;
          ticket_id: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          id?: string;
          ticket_id?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_watchers_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      trusted_devices: {
        Row: {
          app_version: string | null;
          device_id: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          model: string | null;
          os: string | null;
          platform: string | null;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          device_id: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          model?: string | null;
          os?: string | null;
          platform?: string | null;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          device_id?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          model?: string | null;
          os?: string | null;
          platform?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      usage_alerts: {
        Row: {
          block_on_exceed: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          last_triggered_at: string | null;
          last_triggered_value: number | null;
          meter_code: string;
          notify_emails: string[];
          notify_in_app: boolean;
          organization_id: string;
          threshold_type: string;
          threshold_value: number;
          updated_at: string;
        };
        Insert: {
          block_on_exceed?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          last_triggered_at?: string | null;
          last_triggered_value?: number | null;
          meter_code: string;
          notify_emails?: string[];
          notify_in_app?: boolean;
          organization_id: string;
          threshold_type?: string;
          threshold_value: number;
          updated_at?: string;
        };
        Update: {
          block_on_exceed?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          last_triggered_at?: string | null;
          last_triggered_value?: number | null;
          meter_code?: string;
          notify_emails?: string[];
          notify_in_app?: boolean;
          organization_id?: string;
          threshold_type?: string;
          threshold_value?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_alerts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_events: {
        Row: {
          created_at: string;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          meter_code: string;
          occurred_at: string;
          organization_id: string;
          quantity: number;
          subscription_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          meter_code: string;
          occurred_at?: string;
          organization_id: string;
          quantity?: number;
          subscription_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          meter_code?: string;
          occurred_at?: string;
          organization_id?: string;
          quantity?: number;
          subscription_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_meters: {
        Row: {
          aggregation: string;
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          metadata: Json;
          name: string;
          unit: string;
          updated_at: string;
        };
        Insert: {
          aggregation?: string;
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          name: string;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          aggregation?: string;
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          name?: string;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_2fa: {
        Row: {
          created_at: string;
          enabled: boolean;
          last_used_at: string | null;
          method: string;
          recovery_codes: string[];
          secret: string | null;
          updated_at: string;
          user_id: string;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          last_used_at?: string | null;
          method?: string;
          recovery_codes?: string[];
          secret?: string | null;
          updated_at?: string;
          user_id: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          last_used_at?: string | null;
          method?: string;
          recovery_codes?: string[];
          secret?: string | null;
          updated_at?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      user_role_assignments: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          organization_id: string | null;
          role_id: string;
          user_id: string;
          workspace_id: string | null;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          organization_id?: string | null;
          role_id: string;
          user_id: string;
          workspace_id?: string | null;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          organization_id?: string | null;
          role_id?: string;
          user_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_role_assignments_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_role_assignments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      user_theme_preferences: {
        Row: {
          created_at: string;
          theme_mode: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          theme_mode?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          theme_mode?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      vcard_revisions: {
        Row: {
          action: string;
          changed_by: string | null;
          changed_fields: string[];
          created_at: string;
          id: string;
          note: string | null;
          snapshot: Json;
          vcard_id: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          action: string;
          changed_by?: string | null;
          changed_fields?: string[];
          created_at?: string;
          id?: string;
          note?: string | null;
          snapshot: Json;
          vcard_id: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          action?: string;
          changed_by?: string | null;
          changed_fields?: string[];
          created_at?: string;
          id?: string;
          note?: string | null;
          snapshot?: Json;
          vcard_id?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vcard_revisions_vcard_id_fkey";
            columns: ["vcard_id"];
            isOneToOne: false;
            referencedRelation: "vcards";
            referencedColumns: ["id"];
          },
        ];
      };
      vcard_views: {
        Row: {
          created_at: string;
          id: string;
          referrer: string | null;
          user_agent: string | null;
          vcard_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          referrer?: string | null;
          user_agent?: string | null;
          vcard_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          referrer?: string | null;
          user_agent?: string | null;
          vcard_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vcard_views_vcard_id_fkey";
            columns: ["vcard_id"];
            isOneToOne: false;
            referencedRelation: "vcards";
            referencedColumns: ["id"];
          },
        ];
      };
      vcards: {
        Row: {
          address: string | null;
          avatar_url: string | null;
          bio: string | null;
          company: string | null;
          contact_id: string | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          is_public: boolean;
          job_title: string | null;
          phone: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_reason: string | null;
          slug: string;
          socials: Json;
          theme: Json;
          updated_at: string;
          version: number;
          view_count: number;
          website: string | null;
          whatsapp: string | null;
          workspace_id: string;
        };
        Insert: {
          address?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          company?: string | null;
          contact_id?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          is_public?: boolean;
          job_title?: string | null;
          phone?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          slug: string;
          socials?: Json;
          theme?: Json;
          updated_at?: string;
          version?: number;
          view_count?: number;
          website?: string | null;
          whatsapp?: string | null;
          workspace_id: string;
        };
        Update: {
          address?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          company?: string | null;
          contact_id?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_public?: boolean;
          job_title?: string | null;
          phone?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          slug?: string;
          socials?: Json;
          theme?: Json;
          updated_at?: string;
          version?: number;
          view_count?: number;
          website?: string | null;
          whatsapp?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      wa_catalog_analytics_daily: {
        Row: {
          add_to_cart: number;
          clicks: number;
          date: string;
          id: string;
          orders: number;
          product_id: string | null;
          revenue: number;
          shares: number;
          views: number;
          workspace_id: string;
        };
        Insert: {
          add_to_cart?: number;
          clicks?: number;
          date: string;
          id?: string;
          orders?: number;
          product_id?: string | null;
          revenue?: number;
          shares?: number;
          views?: number;
          workspace_id: string;
        };
        Update: {
          add_to_cart?: number;
          clicks?: number;
          date?: string;
          id?: string;
          orders?: number;
          product_id?: string | null;
          revenue?: number;
          shares?: number;
          views?: number;
          workspace_id?: string;
        };
        Relationships: [];
      };
      wa_catalog_collection_items: {
        Row: {
          collection_id: string;
          created_at: string;
          id: string;
          product_id: string;
          sort_order: number;
          workspace_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          id?: string;
          product_id: string;
          sort_order?: number;
          workspace_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          id?: string;
          product_id?: string;
          sort_order?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_catalog_collection_items_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "wa_catalog_collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_catalog_collection_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_catalog_collections: {
        Row: {
          cover_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_featured: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
          wa_set_id: string | null;
          workspace_id: string;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_featured?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
          wa_set_id?: string | null;
          workspace_id: string;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_featured?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          wa_set_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      wa_catalog_config: {
        Row: {
          access_token_secret_name: string | null;
          auto_sync: boolean;
          business_id: string | null;
          catalog_id: string | null;
          created_at: string;
          currency: string;
          default_category: string | null;
          id: string;
          last_full_sync_at: string | null;
          last_sync_error: string | null;
          last_sync_status: string | null;
          phone_number_id: string | null;
          sync_images: boolean;
          sync_inventory: boolean;
          sync_prices: boolean;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          access_token_secret_name?: string | null;
          auto_sync?: boolean;
          business_id?: string | null;
          catalog_id?: string | null;
          created_at?: string;
          currency?: string;
          default_category?: string | null;
          id?: string;
          last_full_sync_at?: string | null;
          last_sync_error?: string | null;
          last_sync_status?: string | null;
          phone_number_id?: string | null;
          sync_images?: boolean;
          sync_inventory?: boolean;
          sync_prices?: boolean;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          access_token_secret_name?: string | null;
          auto_sync?: boolean;
          business_id?: string | null;
          catalog_id?: string | null;
          created_at?: string;
          currency?: string;
          default_category?: string | null;
          id?: string;
          last_full_sync_at?: string | null;
          last_sync_error?: string | null;
          last_sync_status?: string | null;
          phone_number_id?: string | null;
          sync_images?: boolean;
          sync_inventory?: boolean;
          sync_prices?: boolean;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      wa_catalog_sync_log: {
        Row: {
          details: Json;
          error: string | null;
          failed: number;
          finished_at: string | null;
          id: string;
          kind: string;
          started_at: string;
          status: string;
          succeeded: number;
          total_items: number;
          triggered_by: string | null;
          workspace_id: string;
        };
        Insert: {
          details?: Json;
          error?: string | null;
          failed?: number;
          finished_at?: string | null;
          id?: string;
          kind: string;
          started_at?: string;
          status?: string;
          succeeded?: number;
          total_items?: number;
          triggered_by?: string | null;
          workspace_id: string;
        };
        Update: {
          details?: Json;
          error?: string | null;
          failed?: number;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          started_at?: string;
          status?: string;
          succeeded?: number;
          total_items?: number;
          triggered_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [];
      };
      wa_handoff_settings: {
        Row: {
          agent_cooldown_seconds: number;
          conversation_cooldown_seconds: number;
          created_at: string;
          enabled: boolean;
          match_language: boolean;
          notify_message: string | null;
          pause_bot_on_handoff: boolean;
          queue_when_unavailable: boolean;
          required_skills: string[];
          respect_max_concurrent: boolean;
          strategy: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          agent_cooldown_seconds?: number;
          conversation_cooldown_seconds?: number;
          created_at?: string;
          enabled?: boolean;
          match_language?: boolean;
          notify_message?: string | null;
          pause_bot_on_handoff?: boolean;
          queue_when_unavailable?: boolean;
          required_skills?: string[];
          respect_max_concurrent?: boolean;
          strategy?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          agent_cooldown_seconds?: number;
          conversation_cooldown_seconds?: number;
          created_at?: string;
          enabled?: boolean;
          match_language?: boolean;
          notify_message?: string | null;
          pause_bot_on_handoff?: boolean;
          queue_when_unavailable?: boolean;
          required_skills?: string[];
          respect_max_concurrent?: boolean;
          strategy?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_handoff_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_qr_webhook_deliveries: {
        Row: {
          error: string | null;
          event_id: string;
          event_type: string;
          id: string;
          payload: Json;
          processed_at: string | null;
          received_at: string;
          session_id: string | null;
          signature: string | null;
          status: string;
          workspace_id: string | null;
        };
        Insert: {
          error?: string | null;
          event_id: string;
          event_type: string;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          received_at?: string;
          session_id?: string | null;
          signature?: string | null;
          status?: string;
          workspace_id?: string | null;
        };
        Update: {
          error?: string | null;
          event_id?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          received_at?: string;
          session_id?: string | null;
          signature?: string | null;
          status?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wa_qr_webhook_deliveries_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_qr_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_qr_webhook_deliveries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_templates: {
        Row: {
          category: string;
          channel_account_id: string;
          components: Json;
          created_at: string;
          created_by: string | null;
          external_template_id: string | null;
          id: string;
          language: string;
          last_synced_at: string | null;
          name: string;
          provider: Database["public"]["Enums"]["messaging_provider"];
          quality_score: string | null;
          rejection_reason: string | null;
          status: Database["public"]["Enums"]["wa_template_status"];
          updated_at: string;
          variables: Json;
          versions: Json;
          workspace_id: string;
        };
        Insert: {
          category: string;
          channel_account_id: string;
          components?: Json;
          created_at?: string;
          created_by?: string | null;
          external_template_id?: string | null;
          id?: string;
          language: string;
          last_synced_at?: string | null;
          name: string;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          quality_score?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["wa_template_status"];
          updated_at?: string;
          variables?: Json;
          versions?: Json;
          workspace_id: string;
        };
        Update: {
          category?: string;
          channel_account_id?: string;
          components?: Json;
          created_at?: string;
          created_by?: string | null;
          external_template_id?: string | null;
          id?: string;
          language?: string;
          last_synced_at?: string | null;
          name?: string;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          quality_score?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["wa_template_status"];
          updated_at?: string;
          variables?: Json;
          versions?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_templates_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          attempt: number;
          created_at: string;
          dead_letter_at: string | null;
          duration_ms: number | null;
          endpoint_id: string;
          error_message: string | null;
          event_id: string;
          event_type: string;
          first_attempted_at: string | null;
          id: string;
          last_attempted_at: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          next_attempt_at: string;
          organization_id: string;
          payload: Json;
          replay_of: string | null;
          response_body: string | null;
          response_headers: Json | null;
          response_status: number | null;
          status: string;
          succeeded_at: string | null;
        };
        Insert: {
          attempt?: number;
          created_at?: string;
          dead_letter_at?: string | null;
          duration_ms?: number | null;
          endpoint_id: string;
          error_message?: string | null;
          event_id: string;
          event_type: string;
          first_attempted_at?: string | null;
          id?: string;
          last_attempted_at?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          organization_id: string;
          payload: Json;
          replay_of?: string | null;
          response_body?: string | null;
          response_headers?: Json | null;
          response_status?: number | null;
          status?: string;
          succeeded_at?: string | null;
        };
        Update: {
          attempt?: number;
          created_at?: string;
          dead_letter_at?: string | null;
          duration_ms?: number | null;
          endpoint_id?: string;
          error_message?: string | null;
          event_id?: string;
          event_type?: string;
          first_attempted_at?: string | null;
          id?: string;
          last_attempted_at?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          organization_id?: string;
          payload?: Json;
          replay_of?: string | null;
          response_body?: string | null;
          response_headers?: Json | null;
          response_status?: number | null;
          status?: string;
          succeeded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_replay_of_fkey";
            columns: ["replay_of"];
            isOneToOne: false;
            referencedRelation: "webhook_deliveries";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoint_secrets: {
        Row: {
          created_at: string;
          endpoint_id: string;
          rotated_at: string | null;
          secret: string;
        };
        Insert: {
          created_at?: string;
          endpoint_id: string;
          rotated_at?: string | null;
          secret: string;
        };
        Update: {
          created_at?: string;
          endpoint_id?: string;
          rotated_at?: string | null;
          secret?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_endpoint_secrets_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: true;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          auto_disabled_at: string | null;
          auto_disabled_reason: string | null;
          consecutive_failures: number;
          created_at: string;
          created_by: string;
          description: string | null;
          events: string[];
          headers: Json;
          id: string;
          last_failure_at: string | null;
          last_status_code: number | null;
          last_success_at: string | null;
          max_retries: number;
          name: string;
          organization_id: string;
          secret_hash: string;
          secret_prefix: string;
          status: string;
          timeout_ms: number;
          updated_at: string;
          url: string;
        };
        Insert: {
          auto_disabled_at?: string | null;
          auto_disabled_reason?: string | null;
          consecutive_failures?: number;
          created_at?: string;
          created_by: string;
          description?: string | null;
          events?: string[];
          headers?: Json;
          id?: string;
          last_failure_at?: string | null;
          last_status_code?: number | null;
          last_success_at?: string | null;
          max_retries?: number;
          name: string;
          organization_id: string;
          secret_hash: string;
          secret_prefix: string;
          status?: string;
          timeout_ms?: number;
          updated_at?: string;
          url: string;
        };
        Update: {
          auto_disabled_at?: string | null;
          auto_disabled_reason?: string | null;
          consecutive_failures?: number;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          events?: string[];
          headers?: Json;
          id?: string;
          last_failure_at?: string | null;
          last_status_code?: number | null;
          last_success_at?: string | null;
          max_retries?: number;
          name?: string;
          organization_id?: string;
          secret_hash?: string;
          secret_prefix?: string;
          status?: string;
          timeout_ms?: number;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          attempts: number;
          channel_account_id: string | null;
          created_at: string;
          dead_letter_at: string | null;
          dedupe_key: string | null;
          event_type: string;
          external_event_id: string | null;
          headers: Json;
          id: string;
          last_error: string | null;
          last_error_kind: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          next_attempt_at: string;
          payload: Json;
          process_error: string | null;
          processed: boolean;
          processed_at: string | null;
          provider: Database["public"]["Enums"]["messaging_provider"];
          received_at: string;
          signature_valid: boolean;
          updated_at: string;
          workspace_id: string | null;
        };
        Insert: {
          attempts?: number;
          channel_account_id?: string | null;
          created_at?: string;
          dead_letter_at?: string | null;
          dedupe_key?: string | null;
          event_type: string;
          external_event_id?: string | null;
          headers?: Json;
          id?: string;
          last_error?: string | null;
          last_error_kind?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          payload: Json;
          process_error?: string | null;
          processed?: boolean;
          processed_at?: string | null;
          provider: Database["public"]["Enums"]["messaging_provider"];
          received_at?: string;
          signature_valid?: boolean;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Update: {
          attempts?: number;
          channel_account_id?: string | null;
          created_at?: string;
          dead_letter_at?: string | null;
          dedupe_key?: string | null;
          event_type?: string;
          external_event_id?: string | null;
          headers?: Json;
          id?: string;
          last_error?: string | null;
          last_error_kind?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          next_attempt_at?: string;
          payload?: Json;
          process_error?: string | null;
          processed?: boolean;
          processed_at?: string | null;
          provider?: Database["public"]["Enums"]["messaging_provider"];
          received_at?: string;
          signature_valid?: boolean;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_events_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_signing_secrets: {
        Row: {
          activated_at: string;
          channel_account_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_primary: boolean;
          retired_at: string | null;
          secret_hash: string;
          secret_prefix: string;
          workspace_id: string;
        };
        Insert: {
          activated_at?: string;
          channel_account_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_primary?: boolean;
          retired_at?: string | null;
          secret_hash: string;
          secret_prefix: string;
          workspace_id: string;
        };
        Update: {
          activated_at?: string;
          channel_account_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_primary?: boolean;
          retired_at?: string | null;
          secret_hash?: string;
          secret_prefix?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_signing_secrets_channel_account_id_fkey";
            columns: ["channel_account_id"];
            isOneToOne: false;
            referencedRelation: "channel_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_signing_secrets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_verify_tokens: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          provider: string;
          token: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          provider?: string;
          token: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          provider?: string;
          token?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      whatsapp_auto_replies: {
        Row: {
          active_hours: Json | null;
          cooldown_seconds: number;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          hit_count: number;
          id: string;
          keywords: string[];
          last_triggered_at: string | null;
          match_case: boolean;
          media_caption: string | null;
          media_url: string | null;
          min_confidence: number;
          name: string;
          priority: number;
          reply_text: string | null;
          reply_type: string;
          session_id: string | null;
          trigger_type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          active_hours?: Json | null;
          cooldown_seconds?: number;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          hit_count?: number;
          id?: string;
          keywords?: string[];
          last_triggered_at?: string | null;
          match_case?: boolean;
          media_caption?: string | null;
          media_url?: string | null;
          min_confidence?: number;
          name: string;
          priority?: number;
          reply_text?: string | null;
          reply_type?: string;
          session_id?: string | null;
          trigger_type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          active_hours?: Json | null;
          cooldown_seconds?: number;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          hit_count?: number;
          id?: string;
          keywords?: string[];
          last_triggered_at?: string | null;
          match_case?: boolean;
          media_caption?: string | null;
          media_url?: string | null;
          min_confidence?: number;
          name?: string;
          priority?: number;
          reply_text?: string | null;
          reply_type?: string;
          session_id?: string | null;
          trigger_type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_auto_replies_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_qr_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_auto_replies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_devices: {
        Row: {
          battery_level: number | null;
          connected_at: string | null;
          created_at: string;
          created_by: string | null;
          device_type: string;
          id: string;
          last_seen_at: string | null;
          metadata: Json;
          name: string;
          phone_number: string | null;
          platform: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          battery_level?: number | null;
          connected_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_type?: string;
          id?: string;
          last_seen_at?: string | null;
          metadata?: Json;
          name: string;
          phone_number?: string | null;
          platform?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          battery_level?: number | null;
          connected_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_type?: string;
          id?: string;
          last_seen_at?: string | null;
          metadata?: Json;
          name?: string;
          phone_number?: string | null;
          platform?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_devices_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_form_submissions: {
        Row: {
          contact_name: string | null;
          contact_wa_id: string | null;
          created_at: string;
          external_message_id: string | null;
          flow_token: string | null;
          form_id: string;
          id: string;
          raw: Json | null;
          received_at: string;
          response_data: Json;
          workspace_id: string;
        };
        Insert: {
          contact_name?: string | null;
          contact_wa_id?: string | null;
          created_at?: string;
          external_message_id?: string | null;
          flow_token?: string | null;
          form_id: string;
          id?: string;
          raw?: Json | null;
          received_at?: string;
          response_data?: Json;
          workspace_id: string;
        };
        Update: {
          contact_name?: string | null;
          contact_wa_id?: string | null;
          created_at?: string;
          external_message_id?: string | null;
          flow_token?: string | null;
          form_id?: string;
          id?: string;
          raw?: Json | null;
          received_at?: string;
          response_data?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_form_submissions_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_forms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_form_submissions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_forms: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          flow_id: string | null;
          flow_json: Json;
          id: string;
          last_published_at: string | null;
          name: string;
          status: string;
          submissions_count: number;
          updated_at: string;
          waba_id: string | null;
          workspace_id: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          flow_id?: string | null;
          flow_json?: Json;
          id?: string;
          last_published_at?: string | null;
          name: string;
          status?: string;
          submissions_count?: number;
          updated_at?: string;
          waba_id?: string | null;
          workspace_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          flow_id?: string | null;
          flow_json?: Json;
          id?: string;
          last_published_at?: string | null;
          name?: string;
          status?: string;
          submissions_count?: number;
          updated_at?: string;
          waba_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_forms_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_qr_session_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          details: Json;
          event_type: string;
          from_status: string | null;
          id: string;
          session_id: string;
          to_status: string | null;
          workspace_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          details?: Json;
          event_type: string;
          from_status?: string | null;
          id?: string;
          session_id: string;
          to_status?: string | null;
          workspace_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          details?: Json;
          event_type?: string;
          from_status?: string | null;
          id?: string;
          session_id?: string;
          to_status?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_qr_session_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_qr_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_qr_session_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_qr_sessions: {
        Row: {
          connected_at: string | null;
          created_at: string;
          created_by: string;
          device_platform: string | null;
          disconnected_at: string | null;
          display_name: string | null;
          error_message: string | null;
          expires_at: string | null;
          id: string;
          last_seen_at: string | null;
          metadata: Json;
          phone_number: string | null;
          qr_expires_at: string | null;
          revoked_at: string | null;
          session_secret_ciphertext: string | null;
          status: string;
          updated_at: string;
          worker_session_id: string | null;
          workspace_id: string;
        };
        Insert: {
          connected_at?: string | null;
          created_at?: string;
          created_by: string;
          device_platform?: string | null;
          disconnected_at?: string | null;
          display_name?: string | null;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          last_seen_at?: string | null;
          metadata?: Json;
          phone_number?: string | null;
          qr_expires_at?: string | null;
          revoked_at?: string | null;
          session_secret_ciphertext?: string | null;
          status?: string;
          updated_at?: string;
          worker_session_id?: string | null;
          workspace_id: string;
        };
        Update: {
          connected_at?: string | null;
          created_at?: string;
          created_by?: string;
          device_platform?: string | null;
          disconnected_at?: string | null;
          display_name?: string | null;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          last_seen_at?: string | null;
          metadata?: Json;
          phone_number?: string | null;
          qr_expires_at?: string | null;
          revoked_at?: string | null;
          session_secret_ciphertext?: string | null;
          status?: string;
          updated_at?: string;
          worker_session_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_qr_sessions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_warmer_messages: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          id: string;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_warmer_messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_warmer_settings: {
        Row: {
          active_from: string;
          active_to: string;
          created_at: string;
          daily_target: number;
          enabled: boolean;
          max_delay_seconds: number;
          min_delay_seconds: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          active_from?: string;
          active_to?: string;
          created_at?: string;
          daily_target?: number;
          enabled?: boolean;
          max_delay_seconds?: number;
          min_delay_seconds?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          active_from?: string;
          active_to?: string;
          created_at?: string;
          daily_target?: number;
          enabled?: boolean;
          max_delay_seconds?: number;
          min_delay_seconds?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_warmer_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      white_label_configs: {
        Row: {
          accent_color: string | null;
          background_color: string | null;
          border_color: string | null;
          foreground_color: string | null;
          border_radius: string | null;
          brand_name: string | null;
          created_at: string;
          custom_css: string | null;
          custom_domain: string | null;
          custom_domain_verified: boolean | null;
          custom_email_footer: string | null;
          custom_js: string | null;
          dark_accent_color: string | null;
          dark_background_color: string | null;
          dark_primary_color: string | null;
          dashboard_accent: string | null;
          dashboard_background: string | null;
          default_color_mode: string | null;
          email_from_name: string | null;
          email_header_color: string | null;
          email_logo_url: string | null;
          email_primary_color: string | null;
          favicon_url: string | null;
          font_family_heading: string | null;
          font_family_mono: string | null;
          font_family_sans: string | null;
          font_size_base: string | null;
          icon_stroke_width: number | null;
          icon_style: string | null;
          id: string;
          is_active: boolean;
          loader_style: string | null;
          loader_url: string | null;
          login_background_url: string | null;
          login_headline: string | null;
          login_layout: string | null;
          login_subheadline: string | null;
          logo_dark_url: string | null;
          logo_url: string | null;
          meta_description: string | null;
          meta_title: string | null;
          primary_color: string | null;
          remove_lovable_branding: boolean;
          secondary_color: string | null;
          sidebar_accent: string | null;
          sidebar_background: string | null;
          sidebar_border: string | null;
          sidebar_foreground: string | null;
          social_facebook: string | null;
          social_instagram: string | null;
          social_linkedin: string | null;
          social_threads: string | null;
          social_tiktok: string | null;
          social_website: string | null;
          social_x: string | null;
          social_youtube: string | null;
          support_email: string | null;
          support_url: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          accent_color?: string | null;
          background_color?: string | null;
          border_color?: string | null;
          foreground_color?: string | null;
          border_radius?: string | null;
          brand_name?: string | null;
          created_at?: string;
          custom_css?: string | null;
          custom_domain?: string | null;
          custom_domain_verified?: boolean | null;
          custom_email_footer?: string | null;
          custom_js?: string | null;
          dark_accent_color?: string | null;
          dark_background_color?: string | null;
          dark_primary_color?: string | null;
          dashboard_accent?: string | null;
          dashboard_background?: string | null;
          default_color_mode?: string | null;
          email_from_name?: string | null;
          email_header_color?: string | null;
          email_logo_url?: string | null;
          email_primary_color?: string | null;
          favicon_url?: string | null;
          font_family_heading?: string | null;
          font_family_mono?: string | null;
          font_family_sans?: string | null;
          font_size_base?: string | null;
          icon_stroke_width?: number | null;
          icon_style?: string | null;
          id?: string;
          is_active?: boolean;
          loader_style?: string | null;
          loader_url?: string | null;
          login_background_url?: string | null;
          login_headline?: string | null;
          login_layout?: string | null;
          login_subheadline?: string | null;
          logo_dark_url?: string | null;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          primary_color?: string | null;
          remove_lovable_branding?: boolean;
          secondary_color?: string | null;
          sidebar_accent?: string | null;
          sidebar_background?: string | null;
          sidebar_border?: string | null;
          sidebar_foreground?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_linkedin?: string | null;
          social_threads?: string | null;
          social_tiktok?: string | null;
          social_website?: string | null;
          social_x?: string | null;
          social_youtube?: string | null;
          support_email?: string | null;
          support_url?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          accent_color?: string | null;
          background_color?: string | null;
          border_color?: string | null;
          foreground_color?: string | null;
          border_radius?: string | null;
          brand_name?: string | null;
          created_at?: string;
          custom_css?: string | null;
          custom_domain?: string | null;
          custom_domain_verified?: boolean | null;
          custom_email_footer?: string | null;
          custom_js?: string | null;
          dark_accent_color?: string | null;
          dark_background_color?: string | null;
          dark_primary_color?: string | null;
          dashboard_accent?: string | null;
          dashboard_background?: string | null;
          default_color_mode?: string | null;
          email_from_name?: string | null;
          email_header_color?: string | null;
          email_logo_url?: string | null;
          email_primary_color?: string | null;
          favicon_url?: string | null;
          font_family_heading?: string | null;
          font_family_mono?: string | null;
          font_family_sans?: string | null;
          font_size_base?: string | null;
          icon_stroke_width?: number | null;
          icon_style?: string | null;
          id?: string;
          is_active?: boolean;
          loader_style?: string | null;
          loader_url?: string | null;
          login_background_url?: string | null;
          login_headline?: string | null;
          login_layout?: string | null;
          login_subheadline?: string | null;
          logo_dark_url?: string | null;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          primary_color?: string | null;
          remove_lovable_branding?: boolean;
          secondary_color?: string | null;
          sidebar_accent?: string | null;
          sidebar_background?: string | null;
          sidebar_border?: string | null;
          sidebar_foreground?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_linkedin?: string | null;
          social_threads?: string | null;
          social_tiktok?: string | null;
          social_website?: string | null;
          social_x?: string | null;
          social_youtube?: string | null;
          support_email?: string | null;
          support_url?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "white_label_configs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_queue: {
        Row: {
          attempts: number;
          automation_id: string;
          created_at: string;
          dead_lettered_at: string | null;
          event_type: string | null;
          id: string;
          idempotency_key: string | null;
          input: Json;
          last_error: Json | null;
          lease_expires_at: string | null;
          leased_by: string | null;
          max_attempts: number;
          priority: number;
          run_at: string;
          run_id: string | null;
          status: string;
          trigger_source: string;
          updated_at: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          automation_id: string;
          created_at?: string;
          dead_lettered_at?: string | null;
          event_type?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input?: Json;
          last_error?: Json | null;
          lease_expires_at?: string | null;
          leased_by?: string | null;
          max_attempts?: number;
          priority?: number;
          run_at?: string;
          run_id?: string | null;
          status?: string;
          trigger_source?: string;
          updated_at?: string;
          version?: number;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          automation_id?: string;
          created_at?: string;
          dead_lettered_at?: string | null;
          event_type?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input?: Json;
          last_error?: Json | null;
          lease_expires_at?: string | null;
          leased_by?: string | null;
          max_attempts?: number;
          priority?: number;
          run_at?: string;
          run_id?: string | null;
          status?: string;
          trigger_source?: string;
          updated_at?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_queue_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_queue_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_run_steps: {
        Row: {
          attempts: number;
          duration_ms: number | null;
          error: Json | null;
          finished_at: string | null;
          id: string;
          input: Json | null;
          node_id: string;
          node_type: string;
          output: Json | null;
          run_id: string;
          sort_order: number;
          started_at: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          duration_ms?: number | null;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          input?: Json | null;
          node_id: string;
          node_type: string;
          output?: Json | null;
          run_id: string;
          sort_order?: number;
          started_at?: string;
          status?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          duration_ms?: number | null;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          input?: Json | null;
          node_id?: string;
          node_type?: string;
          output?: Json | null;
          run_id?: string;
          sort_order?: number;
          started_at?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_run_steps_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_runs: {
        Row: {
          automation_id: string;
          duration_ms: number | null;
          error: Json | null;
          finished_at: string | null;
          id: string;
          input: Json;
          output: Json | null;
          started_at: string;
          status: string;
          trigger_source: string | null;
          version: number;
          workspace_id: string;
        };
        Insert: {
          automation_id: string;
          duration_ms?: number | null;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          input?: Json;
          output?: Json | null;
          started_at?: string;
          status?: string;
          trigger_source?: string | null;
          version?: number;
          workspace_id: string;
        };
        Update: {
          automation_id?: string;
          duration_ms?: number | null;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          input?: Json;
          output?: Json | null;
          started_at?: string;
          status?: string;
          trigger_source?: string | null;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_runs_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_template_favorites: {
        Row: {
          created_at: string;
          template_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          template_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          template_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_template_favorites_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_template_usage: {
        Row: {
          id: string;
          template_id: string;
          used_at: string;
          user_id: string;
          workspace_id: string | null;
        };
        Insert: {
          id?: string;
          template_id: string;
          used_at?: string;
          user_id: string;
          workspace_id?: string | null;
        };
        Update: {
          id?: string;
          template_id?: string;
          used_at?: string;
          user_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_template_usage_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_template_usage_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_templates: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          forked_from_template_id: string | null;
          graph: Json;
          icon: string;
          id: string;
          is_featured: boolean;
          is_public_in_workspace: boolean;
          name: string;
          owner_user_id: string | null;
          share_slug: string | null;
          tags: string[];
          updated_at: string;
          usage_count: number;
          workspace_id: string | null;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          forked_from_template_id?: string | null;
          graph?: Json;
          icon?: string;
          id?: string;
          is_featured?: boolean;
          is_public_in_workspace?: boolean;
          name: string;
          owner_user_id?: string | null;
          share_slug?: string | null;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          workspace_id?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          forked_from_template_id?: string | null;
          graph?: Json;
          icon?: string;
          id?: string;
          is_featured?: boolean;
          is_public_in_workspace?: boolean;
          name?: string;
          owner_user_id?: string | null;
          share_slug?: string | null;
          tags?: string[];
          updated_at?: string;
          usage_count?: number;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_templates_forked_from_template_id_fkey";
            columns: ["forked_from_template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_variables: {
        Row: {
          automation_id: string | null;
          created_at: string;
          created_by: string | null;
          data_type: string;
          description: string | null;
          id: string;
          is_secret: boolean;
          key: string;
          scope: Database["public"]["Enums"]["workflow_variable_scope"];
          updated_at: string;
          value: Json;
          workspace_id: string;
        };
        Insert: {
          automation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_type?: string;
          description?: string | null;
          id?: string;
          is_secret?: boolean;
          key: string;
          scope: Database["public"]["Enums"]["workflow_variable_scope"];
          updated_at?: string;
          value?: Json;
          workspace_id: string;
        };
        Update: {
          automation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_type?: string;
          description?: string | null;
          id?: string;
          is_secret?: boolean;
          key?: string;
          scope?: Database["public"]["Enums"]["workflow_variable_scope"];
          updated_at?: string;
          value?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_variables_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_variables_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_versions: {
        Row: {
          automation_id: string;
          created_at: string;
          created_by: string | null;
          graph: Json;
          id: string;
          trigger_config: Json;
          trigger_type: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          automation_id: string;
          created_at?: string;
          created_by?: string | null;
          graph: Json;
          id?: string;
          trigger_config?: Json;
          trigger_type: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          automation_id?: string;
          created_at?: string;
          created_by?: string | null;
          graph?: Json;
          id?: string;
          trigger_config?: Json;
          trigger_type?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_versions_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_versions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_ai_summaries: {
        Row: {
          created_at: string;
          highlights: Json;
          id: string;
          model: string | null;
          period: string;
          period_end: string;
          period_start: string;
          provider_kind: string | null;
          stats: Json;
          summary: string;
          tokens_used: number;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          highlights?: Json;
          id?: string;
          model?: string | null;
          period: string;
          period_end: string;
          period_start: string;
          provider_kind?: string | null;
          stats?: Json;
          summary: string;
          tokens_used?: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          highlights?: Json;
          id?: string;
          model?: string | null;
          period?: string;
          period_end?: string;
          period_start?: string;
          provider_kind?: string | null;
          stats?: Json;
          summary?: string;
          tokens_used?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_ai_summaries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_auto_invite_rules: {
        Row: {
          created_at: string;
          created_by: string | null;
          domain: string;
          id: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["workspace_role"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          domain: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          domain?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_auto_invite_rules_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["workspace_role"];
          status: Database["public"]["Enums"]["workspace_invite_status"];
          token: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["workspace_role"];
          status?: Database["public"]["Enums"]["workspace_invite_status"];
          token?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["workspace_role"];
          status?: Database["public"]["Enums"]["workspace_invite_status"];
          token?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          id: string;
          last_active_at: string | null;
          role: Database["public"]["Enums"]["workspace_role"];
          status: Database["public"]["Enums"]["member_status"];
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_active_at?: string | null;
          role?: Database["public"]["Enums"]["workspace_role"];
          status?: Database["public"]["Enums"]["member_status"];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_active_at?: string | null;
          role?: Database["public"]["Enums"]["workspace_role"];
          status?: Database["public"]["Enums"]["member_status"];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_payment_gateway_settings: {
        Row: {
          created_at: string;
          enabled: boolean | null;
          id: string;
          is_default: boolean;
          notes: string | null;
          provider_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean | null;
          id?: string;
          is_default?: boolean;
          notes?: string | null;
          provider_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean | null;
          id?: string;
          is_default?: boolean;
          notes?: string | null;
          provider_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_payment_gateway_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          archived_at: string | null;
          avatar_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          notifications_enabled: boolean;
          organization_id: string | null;
          owner_id: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          preferences: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          notifications_enabled?: boolean;
          organization_id?: string | null;
          owner_id: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          preferences?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          notifications_enabled?: boolean;
          organization_id?: string | null;
          owner_id?: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          preferences?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      workspace_invitation_audit: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"] | null;
          actor_id: string | null;
          changes: Json | null;
          created_at: string | null;
          id: string | null;
          invitation_id: string | null;
          workspace_id: string | null;
        };
        Insert: {
          action?: Database["public"]["Enums"]["audit_action"] | null;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string | null;
          id?: string | null;
          invitation_id?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["audit_action"] | null;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string | null;
          id?: string | null;
          invitation_id?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      _wa_cron_post: { Args: { _body?: Json; _path: string }; Returns: number };
      accept_workspace_invitation: { Args: { _token: string }; Returns: string };
      apply_my_auto_invite_rules: {
        Args: never;
        Returns: {
          role: Database["public"]["Enums"]["workspace_role"];
          workspace_id: string;
        }[];
      };
      apply_sla_to_conversation: {
        Args: { _conversation_id: string };
        Returns: string;
      };
      assign_conversation: {
        Args: { _assignee: string; _conversation_id: string };
        Returns: undefined;
      };
      auto_assign_conversation: {
        Args: { _conversation_id: string };
        Returns: string;
      };
      bulk_tag_conversations: {
        Args: { _ids: string[]; _label_ids: string[] };
        Returns: number;
      };
      bulk_update_conversations: {
        Args: { _ids: string[]; _patch: Json };
        Returns: number;
      };
      can_manage_vcard_lifecycle: {
        Args: { _user_id: string; _workspace_id: string };
        Returns: boolean;
      };
      can_self_join_workspace: {
        Args: {
          _role: Database["public"]["Enums"]["workspace_role"];
          _user_id: string;
          _workspace_id: string;
        };
        Returns: boolean;
      };
      channel_account_secrets: {
        Args: { _account_id?: string; _workspace_id: string };
        Returns: {
          access_token_secret_name: string;
          app_secret_name: string;
          id: string;
          verify_token: string;
        }[];
      };
      claim_expired_media: {
        Args: { _limit?: number };
        Returns: {
          id: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      cleanup_rate_limit_buckets: { Args: never; Returns: number };
      cleanup_whatsapp_qr_sessions: { Args: never; Returns: Json };
      contact_list_active_member_count: {
        Args: { _list_id: string };
        Returns: number;
      };
      create_workspace_with_owner: {
        Args: {
          _description?: string;
          _name: string;
          _organization_id?: string;
          _slug: string;
        };
        Returns: {
          archived_at: string | null;
          avatar_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          notifications_enabled: boolean;
          organization_id: string | null;
          owner_id: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          preferences: Json;
          slug: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "workspaces";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      enforce_rate_limit: {
        Args: {
          _bucket_key: string;
          _limit: number;
          _window_seconds?: number;
          _workspace_id?: string;
        };
        Returns: {
          allowed: boolean;
          remaining: number;
          reset_at: string;
        }[];
      };
      ensure_personal_organization: {
        Args: { _email?: string; _user_id: string };
        Returns: string;
      };
      expire_stale_workspace_invitations: { Args: never; Returns: number };
      export_jobs_claim_batch: {
        Args: { _limit?: number; _worker: string };
        Returns: {
          attempts: number;
          columns: string[];
          created_at: string;
          created_by: string;
          cron: string | null;
          dataset: Database["public"]["Enums"]["export_dataset"];
          description: string | null;
          duration_ms: number | null;
          error: string | null;
          expires_at: string | null;
          file_bucket: string | null;
          file_path: string | null;
          file_size: number | null;
          filters: Json;
          finished_at: string | null;
          format: Database["public"]["Enums"]["export_format"];
          id: string;
          last_run_at: string | null;
          locked_at: string | null;
          locked_by: string | null;
          name: string;
          next_run_at: string | null;
          recurrence: Database["public"]["Enums"]["export_recurrence"];
          report_id: string | null;
          row_count: number | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["export_status"];
          updated_at: string;
          visibility: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "export_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_audit_trail: {
        Args: {
          _categories?: string[];
          _limit?: number;
          _since?: string;
          _workspace_id: string;
        };
        Returns: {
          actor_id: string;
          category: string;
          created_at: string;
          data: Json;
          event_type: string;
          id: string;
          ip_address: unknown;
          resource_id: string;
          resource_type: string;
          severity: string;
          user_agent: string;
        }[];
      };
      get_conversation_counts: {
        Args: { _inbox_id?: string; _user_id?: string; _workspace_id: string };
        Returns: Json;
      };
      get_public_payment_link: {
        Args: { _token: string };
        Returns: {
          amount: number;
          currency: string;
          description: string;
          expires_at: string;
          provider: string;
          status: string;
          token: string;
        }[];
      };
      get_public_white_label: {
        Args: { _domain: string };
        Returns: {
          accent_color: string;
          brand_name: string;
          favicon_url: string;
          logo_url: string;
          meta_description: string;
          meta_title: string;
          primary_color: string;
          workspace_id: string;
        }[];
      };
      has_org_role: {
        Args: {
          _org_id: string;
          _roles: Database["public"]["Enums"]["org_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_permission: {
        Args: {
          _organization_id?: string;
          _permission_key: string;
          _user_id: string;
          _workspace_id?: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][];
          _user_id: string;
          _workspace_id: string;
        };
        Returns: boolean;
      };
      heartbeat: { Args: never; Returns: undefined };
      increment_webhook_failure: { Args: { p_id: string }; Returns: undefined };
      is_active_workspace_member: {
        Args: { _user_id: string; _workspace_id: string };
        Returns: boolean;
      };
      is_inbox_member: {
        Args: { _inbox_id: string; _user_id: string };
        Returns: boolean;
      };
      is_org_member: {
        Args: { _org_id: string; _user_id: string };
        Returns: boolean;
      };
      is_super_admin: { Args: { _user_id: string }; Returns: boolean };
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string };
        Returns: boolean;
      };
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string };
        Returns: boolean;
      };
      list_payment_gateway_basics: {
        Args: never;
        Returns: {
          adapter_id: string;
          display_label: string;
          enabled: boolean;
          is_custom: boolean;
          is_default: boolean;
          mode: string;
          provider_id: string;
          publishable_key: string;
          supported_methods: string[];
        }[];
      };
      log_admin_action: {
        Args: {
          _action: string;
          _data?: Json;
          _resource_id?: string;
          _resource_type?: string;
          _workspace_id: string;
        };
        Returns: string;
      };
      log_security_event: {
        Args: {
          _data?: Json;
          _event_type: string;
          _resource_id?: string;
          _resource_type?: string;
          _severity?: string;
          _workspace_id: string;
        };
        Returns: string;
      };
      mark_media_accessed: {
        Args: { _action?: string; _attachment_id: string };
        Returns: undefined;
      };
      match_kb_chunks: {
        Args: {
          p_match_count?: number;
          p_min_similarity?: number;
          p_only_published?: boolean;
          p_query_embedding: string;
          p_workspace_id: string;
        };
        Returns: {
          article_id: string;
          category_id: string;
          chunk_id: string;
          chunk_index: number;
          content: string;
          is_faq: boolean;
          similarity: number;
          slug: string;
          summary: string;
          title: string;
        }[];
      };
      my_permissions: {
        Args: { _organization_id?: string; _workspace_id?: string };
        Returns: string[];
      };
      next_document_number:
        | { Args: { _template_id: string }; Returns: string }
        | { Args: { _kind: string; _ws: string }; Returns: string };
      outbox_claim_batch: {
        Args: { _limit?: number; _worker: string };
        Returns: {
          attempts: number;
          channel_account_id: string;
          conversation_id: string | null;
          created_at: string;
          delivered_at: string | null;
          external_message_id: string | null;
          failed_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          last_error_code: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          message_id: string | null;
          next_attempt_at: string;
          payload: Json;
          provider: Database["public"]["Enums"]["messaging_provider"];
          read_at: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["outbox_status"];
          to_address: string;
          updated_at: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "message_outbox";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      prepare_platform_user_deletion: {
        Args: { _user_id: string };
        Returns: undefined;
      };
      prune_gateway_webhook_deliveries: { Args: never; Returns: number };
      realtime_topic_allowed: { Args: { _topic: string }; Returns: boolean };
      reconcile_contact_list_member_counts: {
        Args: never;
        Returns: {
          details: Json;
          lists_scanned: number;
          mismatches_found: number;
        }[];
      };
      record_login_attempt: {
        Args: {
          _device?: string;
          _event: string;
          _failure_reason?: string;
          _ip?: unknown;
          _user_agent?: string;
          _user_id: string;
        };
        Returns: string;
      };
      regenerate_recovery_codes: { Args: never; Returns: string[] };
      resend_workspace_invitation: { Args: { _id: string }; Returns: string };
      restore_vcard_version: { Args: { _revision_id: string }; Returns: string };
      revoke_all_other_sessions: {
        Args: { _current_session?: string };
        Returns: number;
      };
      rls_harness_list_scoped_tables: {
        Args: never;
        Returns: {
          scope_column: string;
          table_name: string;
        }[];
      };
      run_retention_policies: {
        Args: never;
        Returns: {
          deleted: number;
          policy_id: string;
          resource: string;
        }[];
      };
      search_inbox: {
        Args: {
          _kinds?: string[];
          _limit?: number;
          _q: string;
          _workspace_id: string;
        };
        Returns: {
          conversation_id: string;
          created_at: string;
          id: string;
          kind: string;
          meta: Json;
          score: number;
          snippet: string;
          title: string;
        }[];
      };
      transfer_organization_ownership: {
        Args: { _new_owner_id: string; _org_id: string };
        Returns: undefined;
      };
      transfer_workspace_ownership: {
        Args: { _new_owner_id: string; _workspace_id: string };
        Returns: undefined;
      };
      upsert_ai_usage_daily: {
        Args: {
          p_completion_tokens: number;
          p_cost_usd: number;
          p_day: string;
          p_errors: number;
          p_model: string;
          p_prompt_tokens: number;
          p_provider_id: string;
          p_requests: number;
          p_total_tokens: number;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      webhook_events_claim_batch: {
        Args: { _limit?: number; _worker: string };
        Returns: {
          attempts: number;
          channel_account_id: string | null;
          created_at: string;
          dead_letter_at: string | null;
          dedupe_key: string | null;
          event_type: string;
          external_event_id: string | null;
          headers: Json;
          id: string;
          last_error: string | null;
          last_error_kind: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          next_attempt_at: string;
          payload: Json;
          process_error: string | null;
          processed: boolean;
          processed_at: string | null;
          provider: Database["public"]["Enums"]["messaging_provider"];
          received_at: string;
          signature_valid: boolean;
          updated_at: string;
          workspace_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "webhook_events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      wf_queue_lease: {
        Args: { _batch: number; _lease_seconds: number; _worker: string };
        Returns: {
          attempts: number;
          automation_id: string;
          created_at: string;
          dead_lettered_at: string | null;
          event_type: string | null;
          id: string;
          idempotency_key: string | null;
          input: Json;
          last_error: Json | null;
          lease_expires_at: string | null;
          leased_by: string | null;
          max_attempts: number;
          priority: number;
          run_at: string;
          run_id: string | null;
          status: string;
          trigger_source: string;
          updated_at: string;
          version: number;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "workflow_queue";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      widget_broadcast: {
        Args: { _kind: string; _session_id: string };
        Returns: undefined;
      };
      widget_topic_allowed: { Args: { _topic: string }; Returns: boolean };
      workspace_media_stats: {
        Args: { _workspace_id: string };
        Returns: {
          audio_bytes: number;
          document_bytes: number;
          expiring_soon: number;
          image_bytes: number;
          total_bytes: number;
          total_files: number;
          video_bytes: number;
        }[];
      };
    };
    Enums: {
      agent_presence: "online" | "away" | "busy" | "offline";
      ai_automation_type:
        | "create_task"
        | "suggest_followup"
        | "assign_agent"
        | "move_pipeline_stage"
        | "create_note"
        | "meeting_summary"
        | "crm_notes"
        | "suggest_tags"
        | "generate_labels"
        | "update_customer_status"
        | "recommend_campaign"
        | "detect_upsell";
      ai_operation: "chat" | "stream" | "embed" | "image" | "transcribe" | "tts" | "moderation";
      ai_provider_kind:
        | "lovable"
        | "openai"
        | "gemini"
        | "anthropic"
        | "deepseek"
        | "grok"
        | "openrouter"
        | "ollama"
        | "lmstudio"
        | "custom_openai";
      ai_request_status: "success" | "error" | "rate_limited" | "timeout" | "cancelled";
      ai_suggestion_status: "pending" | "approved" | "applied" | "rejected" | "failed" | "expired";
      app_role: "superadmin" | "support";
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "login"
        | "logout"
        | "invite"
        | "revoke"
        | "export"
        | "access";
      automation_status: "draft" | "active" | "paused";
      backup_destination:
        "lovable_cloud" | "s3" | "gcs" | "azure_blob" | "r2" | "wasabi" | "backblaze" | "local";
      backup_scope: "database" | "storage" | "media" | "config" | "full";
      backup_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "verifying"
        | "verified"
        | "restoring"
        | "restored"
        | "cancelled";
      backup_type: "full" | "incremental";
      billing_document_status: "draft" | "issued" | "sent" | "paid" | "void" | "refunded";
      billing_document_type: "invoice" | "credit_note" | "receipt" | "refund_receipt";
      billing_invoice_status: "draft" | "open" | "paid" | "void" | "uncollectible" | "refunded";
      billing_notification_kind:
        | "invoice.issued"
        | "invoice.paid"
        | "invoice.payment_failed"
        | "invoice.upcoming"
        | "subscription.trial_ending"
        | "subscription.canceled"
        | "subscription.renewed"
        | "quota.approaching"
        | "quota.exceeded"
        | "payment_method.expiring"
        | "payment.succeeded"
        | "invoice.due"
        | "subscription.expired"
        | "usage.limit_reached"
        | "upgrade.recommended";
      billing_notification_status: "pending" | "sent" | "failed" | "skipped";
      billing_payment_attempt_status:
        "pending" | "processing" | "succeeded" | "failed" | "canceled" | "refunded";
      calendar_entry_kind:
        | "working_hours"
        | "break"
        | "vacation"
        | "holiday"
        | "blocked"
        | "custom"
        | "recurring_available"
        | "recurring_unavailable";
      calendar_entry_scope: "personal" | "team" | "organization";
      campaign_status: "draft" | "scheduled" | "running" | "completed" | "paused" | "failed";
      channel_account_status: "pending" | "connected" | "disconnected" | "error" | "suspended";
      conversation_priority: "low" | "normal" | "high" | "urgent";
      conversation_status: "open" | "pending" | "resolved" | "snoozed" | "on_hold" | "closed";
      export_dataset:
        | "report"
        | "crm_contacts"
        | "crm_companies"
        | "crm_deals"
        | "crm_leads"
        | "campaigns"
        | "conversations"
        | "messages"
        | "tasks"
        | "activities";
      export_format: "pdf" | "excel" | "csv" | "json";
      export_recurrence: "once" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
      export_status: "queued" | "running" | "success" | "failed" | "cancelled";
      goal_metric:
        "revenue" | "deals_won" | "deals_created" | "activities" | "calls" | "meetings" | "custom";
      goal_period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
      handoff_event_kind:
        | "transfer_agent"
        | "transfer_department"
        | "takeover"
        | "resume_ai"
        | "queue_enter"
        | "queue_leave"
        | "queue_assigned"
        | "fallback_assigned"
        | "offline_bounced";
      handoff_priority: "low" | "normal" | "high" | "urgent";
      inbox_channel:
        | "whatsapp"
        | "email"
        | "sms"
        | "webchat"
        | "instagram"
        | "messenger"
        | "telegram"
        | "voice"
        | "other"
        | "facebook"
        | "youtube"
        | "linkedin"
        | "tiktok";
      invoice_status:
        "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "void" | "refunded";
      kb_article_status: "draft" | "published" | "archived";
      kb_event_type:
        "view" | "helpful" | "unhelpful" | "suggested" | "answer_generated" | "search_hit";
      kb_source_type:
        "manual" | "markdown" | "pdf" | "docx" | "url" | "import" | "csv" | "txt" | "faq";
      member_status: "active" | "suspended";
      message_direction: "inbound" | "outbound";
      message_status: "queued" | "sent" | "delivered" | "read" | "failed";
      message_type:
        | "text"
        | "image"
        | "video"
        | "audio"
        | "document"
        | "location"
        | "contact"
        | "template"
        | "sticker"
        | "system"
        | "interactive"
        | "poll";
      messaging_provider: "whatsapp_cloud" | "twilio" | "dialog360" | "custom";
      notification_channel: "in_app" | "email" | "push" | "sms";
      notification_status: "unread" | "read" | "archived";
      org_role: "owner" | "admin" | "member" | "billing" | "guest";
      outbox_status:
        "queued" | "processing" | "sent" | "delivered" | "read" | "failed" | "dead_letter";
      payment_method:
        "cash" | "bank_transfer" | "card" | "stripe" | "paypal" | "crypto" | "check" | "other";
      payment_status:
        "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded" | "cancelled";
      plan_interval: "month" | "year" | "lifetime";
      plan_tier:
        "free" | "starter" | "growth" | "enterprise" | "professional" | "business" | "custom";
      product_kind: "product" | "service" | "subscription" | "bundle";
      quote_status: "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired" | "revised";
      role_scope: "platform" | "organization" | "workspace";
      scheduled_message_status: "pending" | "sent" | "cancelled" | "failed";
      settings_scope: "platform" | "organization" | "workspace" | "user";
      social_content_type: "post" | "story" | "reel" | "short" | "poll";
      social_media_kind: "none" | "image" | "video" | "carousel";
      social_target_status:
        "pending" | "queued" | "publishing" | "published" | "failed" | "cancelled";
      subscription_status:
        "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused";
      sync_kind:
        | "templates"
        | "business_profile"
        | "phone_numbers"
        | "media_cleanup"
        | "webhook_drain"
        | "outbox_drain"
        | "scheduled_messages"
        | "contacts_reconcile"
        | "conversations_reconcile"
        | "status_reconcile"
        | "account_health";
      sync_status: "pending" | "running" | "success" | "partial" | "failed";
      wa_template_status: "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled";
      workflow_variable_scope:
        | "global"
        | "workflow"
        | "environment"
        | "contact"
        | "deal"
        | "conversation"
        | "organization"
        | "custom";
      workspace_invite_status: "pending" | "accepted" | "revoked" | "expired";
      workspace_role: "owner" | "admin" | "agent" | "viewer" | "manager";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      agent_presence: ["online", "away", "busy", "offline"],
      ai_automation_type: [
        "create_task",
        "suggest_followup",
        "assign_agent",
        "move_pipeline_stage",
        "create_note",
        "meeting_summary",
        "crm_notes",
        "suggest_tags",
        "generate_labels",
        "update_customer_status",
        "recommend_campaign",
        "detect_upsell",
      ],
      ai_operation: ["chat", "stream", "embed", "image", "transcribe", "tts", "moderation"],
      ai_provider_kind: [
        "lovable",
        "openai",
        "gemini",
        "anthropic",
        "deepseek",
        "grok",
        "openrouter",
        "ollama",
        "lmstudio",
        "custom_openai",
      ],
      ai_request_status: ["success", "error", "rate_limited", "timeout", "cancelled"],
      ai_suggestion_status: ["pending", "approved", "applied", "rejected", "failed", "expired"],
      app_role: ["superadmin", "support"],
      audit_action: [
        "create",
        "update",
        "delete",
        "login",
        "logout",
        "invite",
        "revoke",
        "export",
        "access",
      ],
      automation_status: ["draft", "active", "paused"],
      backup_destination: [
        "lovable_cloud",
        "s3",
        "gcs",
        "azure_blob",
        "r2",
        "wasabi",
        "backblaze",
        "local",
      ],
      backup_scope: ["database", "storage", "media", "config", "full"],
      backup_status: [
        "queued",
        "running",
        "completed",
        "failed",
        "verifying",
        "verified",
        "restoring",
        "restored",
        "cancelled",
      ],
      backup_type: ["full", "incremental"],
      billing_document_status: ["draft", "issued", "sent", "paid", "void", "refunded"],
      billing_document_type: ["invoice", "credit_note", "receipt", "refund_receipt"],
      billing_invoice_status: ["draft", "open", "paid", "void", "uncollectible", "refunded"],
      billing_notification_kind: [
        "invoice.issued",
        "invoice.paid",
        "invoice.payment_failed",
        "invoice.upcoming",
        "subscription.trial_ending",
        "subscription.canceled",
        "subscription.renewed",
        "quota.approaching",
        "quota.exceeded",
        "payment_method.expiring",
        "payment.succeeded",
        "invoice.due",
        "subscription.expired",
        "usage.limit_reached",
        "upgrade.recommended",
      ],
      billing_notification_status: ["pending", "sent", "failed", "skipped"],
      billing_payment_attempt_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "canceled",
        "refunded",
      ],
      calendar_entry_kind: [
        "working_hours",
        "break",
        "vacation",
        "holiday",
        "blocked",
        "custom",
        "recurring_available",
        "recurring_unavailable",
      ],
      calendar_entry_scope: ["personal", "team", "organization"],
      campaign_status: ["draft", "scheduled", "running", "completed", "paused", "failed"],
      channel_account_status: ["pending", "connected", "disconnected", "error", "suspended"],
      conversation_priority: ["low", "normal", "high", "urgent"],
      conversation_status: ["open", "pending", "resolved", "snoozed", "on_hold", "closed"],
      export_dataset: [
        "report",
        "crm_contacts",
        "crm_companies",
        "crm_deals",
        "crm_leads",
        "campaigns",
        "conversations",
        "messages",
        "tasks",
        "activities",
      ],
      export_format: ["pdf", "excel", "csv", "json"],
      export_recurrence: ["once", "daily", "weekly", "monthly", "quarterly", "yearly"],
      export_status: ["queued", "running", "success", "failed", "cancelled"],
      goal_metric: [
        "revenue",
        "deals_won",
        "deals_created",
        "activities",
        "calls",
        "meetings",
        "custom",
      ],
      goal_period: ["daily", "weekly", "monthly", "quarterly", "yearly"],
      handoff_event_kind: [
        "transfer_agent",
        "transfer_department",
        "takeover",
        "resume_ai",
        "queue_enter",
        "queue_leave",
        "queue_assigned",
        "fallback_assigned",
        "offline_bounced",
      ],
      handoff_priority: ["low", "normal", "high", "urgent"],
      inbox_channel: [
        "whatsapp",
        "email",
        "sms",
        "webchat",
        "instagram",
        "messenger",
        "telegram",
        "voice",
        "other",
        "facebook",
        "youtube",
        "linkedin",
        "tiktok",
      ],
      invoice_status: ["draft", "sent", "viewed", "partial", "paid", "overdue", "void", "refunded"],
      kb_article_status: ["draft", "published", "archived"],
      kb_event_type: [
        "view",
        "helpful",
        "unhelpful",
        "suggested",
        "answer_generated",
        "search_hit",
      ],
      kb_source_type: ["manual", "markdown", "pdf", "docx", "url", "import", "csv", "txt", "faq"],
      member_status: ["active", "suspended"],
      message_direction: ["inbound", "outbound"],
      message_status: ["queued", "sent", "delivered", "read", "failed"],
      message_type: [
        "text",
        "image",
        "video",
        "audio",
        "document",
        "location",
        "contact",
        "template",
        "sticker",
        "system",
        "interactive",
        "poll",
      ],
      messaging_provider: ["whatsapp_cloud", "twilio", "dialog360", "custom"],
      notification_channel: ["in_app", "email", "push", "sms"],
      notification_status: ["unread", "read", "archived"],
      org_role: ["owner", "admin", "member", "billing", "guest"],
      outbox_status: ["queued", "processing", "sent", "delivered", "read", "failed", "dead_letter"],
      payment_method: [
        "cash",
        "bank_transfer",
        "card",
        "stripe",
        "paypal",
        "crypto",
        "check",
        "other",
      ],
      payment_status: [
        "pending",
        "succeeded",
        "failed",
        "refunded",
        "partially_refunded",
        "cancelled",
      ],
      plan_interval: ["month", "year", "lifetime"],
      plan_tier: ["free", "starter", "growth", "enterprise", "professional", "business", "custom"],
      product_kind: ["product", "service", "subscription", "bundle"],
      quote_status: ["draft", "sent", "viewed", "accepted", "rejected", "expired", "revised"],
      role_scope: ["platform", "organization", "workspace"],
      scheduled_message_status: ["pending", "sent", "cancelled", "failed"],
      settings_scope: ["platform", "organization", "workspace", "user"],
      social_content_type: ["post", "story", "reel", "short", "poll"],
      social_media_kind: ["none", "image", "video", "carousel"],
      social_target_status: ["pending", "queued", "publishing", "published", "failed", "cancelled"],
      subscription_status: ["trialing", "active", "past_due", "canceled", "incomplete", "paused"],
      sync_kind: [
        "templates",
        "business_profile",
        "phone_numbers",
        "media_cleanup",
        "webhook_drain",
        "outbox_drain",
        "scheduled_messages",
        "contacts_reconcile",
        "conversations_reconcile",
        "status_reconcile",
        "account_health",
      ],
      sync_status: ["pending", "running", "success", "partial", "failed"],
      wa_template_status: ["draft", "pending", "approved", "rejected", "paused", "disabled"],
      workflow_variable_scope: [
        "global",
        "workflow",
        "environment",
        "contact",
        "deal",
        "conversation",
        "organization",
        "custom",
      ],
      workspace_invite_status: ["pending", "accepted", "revoked", "expired"],
      workspace_role: ["owner", "admin", "agent", "viewer", "manager"],
    },
  },
} as const;
