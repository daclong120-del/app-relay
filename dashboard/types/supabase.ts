// Generated Supabase Database TypeScript Definitions for Release Ops

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      release_ops_play_accounts: {
        Row: {
          id: string;
          account_name: string;
          developer_id: string | null;
          email: string | null;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_name: string;
          developer_id?: string | null;
          email?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_name?: string;
          developer_id?: string | null;
          email?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      release_ops_apps: {
        Row: {
          id: string;
          package_name: string;
          app_name: string;
          play_account_id: string | null;
          target_sdk: number | null;
          policy_readiness: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          package_name: string;
          app_name: string;
          play_account_id?: string | null;
          target_sdk?: number | null;
          policy_readiness?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          package_name?: string;
          app_name?: string;
          play_account_id?: string | null;
          target_sdk?: number | null;
          policy_readiness?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      release_ops_releases: {
        Row: {
          id: string;
          app_id: string;
          version_name: string;
          version_code: number;
          track: string;
          status: string;
          rollout_percentage: number;
          release_notes: string | null;
          health_guard: Json;
          readiness_gate: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          app_id: string;
          version_name: string;
          version_code: number;
          track?: string;
          status?: string;
          rollout_percentage?: number;
          release_notes?: string | null;
          health_guard?: Json;
          readiness_gate?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          app_id?: string;
          version_name?: string;
          version_code?: number;
          track?: string;
          status?: string;
          rollout_percentage?: number;
          release_notes?: string | null;
          health_guard?: Json;
          readiness_gate?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      release_ops_workers: {
        Row: {
          id: string;
          worker_name: string;
          status: string;
          max_parallel_jobs: number;
          last_heartbeat: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          worker_name: string;
          status?: string;
          max_parallel_jobs?: number;
          last_heartbeat?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          worker_name?: string;
          status?: string;
          max_parallel_jobs?: number;
          last_heartbeat?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      release_ops_jobs: {
        Row: {
          id: string;
          job_type: string;
          status: string;
          priority: number;
          release_id: string | null;
          app_id: string | null;
          worker_id: string | null;
          lease_until: string | null;
          heartbeat_at: string | null;
          attempt_count: number;
          max_attempts: number;
          idempotency_key: string | null;
          payload: Json;
          result: Json;
          error_message: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_type: string;
          status?: string;
          priority?: number;
          release_id?: string | null;
          app_id?: string | null;
          worker_id?: string | null;
          lease_until?: string | null;
          heartbeat_at?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          idempotency_key?: string | null;
          payload?: Json;
          result?: Json;
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_type?: string;
          status?: string;
          priority?: number;
          release_id?: string | null;
          app_id?: string | null;
          worker_id?: string | null;
          lease_until?: string | null;
          heartbeat_at?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          idempotency_key?: string | null;
          payload?: Json;
          result?: Json;
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      release_ops_job_events: {
        Row: {
          id: string;
          job_id: string;
          level: string;
          stage: string;
          message: string;
          progress: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          level?: string;
          stage: string;
          message: string;
          progress?: number;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          level?: string;
          stage?: string;
          message?: string;
          progress?: number;
          metadata?: Json;
          created_at?: string;
        };
      };
      release_ops_artifacts: {
        Row: {
          id: string;
          release_id: string | null;
          job_id: string | null;
          app_id: string | null;
          file_name: string;
          checksum: string | null;
          storage_path: string;
          artifact_type: string;
          content_type: string;
          size_bytes: number;
          expires_at: string | null;
          deleted_at: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          release_id?: string | null;
          job_id?: string | null;
          app_id?: string | null;
          file_name: string;
          checksum?: string | null;
          storage_path: string;
          artifact_type?: string;
          content_type?: string;
          size_bytes?: number;
          expires_at?: string | null;
          deleted_at?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          release_id?: string | null;
          job_id?: string | null;
          app_id?: string | null;
          file_name?: string;
          checksum?: string | null;
          storage_path?: string;
          artifact_type?: string;
          content_type?: string;
          size_bytes?: number;
          expires_at?: string | null;
          deleted_at?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      release_ops_audits: {
        Row: {
          id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          actor_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          actor_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          actor_id?: string | null;
          details?: Json;
          created_at?: string;
        };
      };
    };
    Functions: {
      release_ops_claim_job: {
        Args: {
          p_worker_id: string;
          p_capabilities?: string[];
          p_lease_seconds?: number;
        };
        Returns: Database['public']['Tables']['release_ops_jobs']['Row'][];
      };
      release_ops_start_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
        };
        Returns: boolean;
      };
      release_ops_complete_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_result?: Json;
        };
        Returns: boolean;
      };
      release_ops_fail_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_error_message: string;
          p_can_retry?: boolean;
        };
        Returns: boolean;
      };
      release_ops_cancel_job: {
        Args: {
          p_job_id: string;
          p_cancelled_by?: string;
        };
        Returns: boolean;
      };
    };
  };
}
