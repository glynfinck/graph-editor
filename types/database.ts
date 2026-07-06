export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      graph_edges: {
        Row: {
          attributes: Json
          graph_id: string
          id: string
          name: string | null
          source: string
          target: string
          weight: number | null
        }
        Insert: {
          attributes?: Json
          graph_id: string
          id?: string
          name?: string | null
          source: string
          target: string
          weight?: number | null
        }
        Update: {
          attributes?: Json
          graph_id?: string
          id?: string
          name?: string | null
          source?: string
          target?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graph_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graphs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_graph_id_source_fkey"
            columns: ["graph_id", "source"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["graph_id", "id"]
          },
          {
            foreignKeyName: "graph_edges_graph_id_target_fkey"
            columns: ["graph_id", "target"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["graph_id", "id"]
          },
        ]
      }
      graph_likes: {
        Row: {
          created_at: string
          graph_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          graph_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          graph_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_likes_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graph_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_likes_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graphs"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_nodes: {
        Row: {
          attributes: Json
          graph_id: string
          id: string
          name: string
          x: number
          y: number
        }
        Insert: {
          attributes?: Json
          graph_id: string
          id?: string
          name: string
          x: number
          y: number
        }
        Update: {
          attributes?: Json
          graph_id?: string
          id?: string
          name?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "graph_nodes_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graph_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_nodes_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graphs"
            referencedColumns: ["id"]
          },
        ]
      }
      graphs: {
        Row: {
          created_at: string
          description: string
          directed: boolean
          id: string
          is_public: boolean
          is_sample: boolean
          name: string
          owner_id: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          directed?: boolean
          id?: string
          is_public?: boolean
          is_sample?: boolean
          name: string
          owner_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          directed?: boolean
          id?: string
          is_public?: boolean
          is_sample?: boolean
          name?: string
          owner_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          body: string
          created_at: string
          id: string
          is_official: boolean
          is_published: boolean
          owner_id: string | null
          project_id: string | null
          published_at: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_official?: boolean
          is_published?: boolean
          owner_id?: string | null
          project_id?: string | null
          published_at?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_official?: boolean
          is_published?: boolean
          owner_id?: string | null
          project_id?: string | null
          published_at?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          content: string
          created_at: string
          id: string
          path: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          path: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          path?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_graphs: {
        Row: {
          created_at: string
          graph_id: string
          position: number
          project_id: string
        }
        Insert: {
          created_at?: string
          graph_id: string
          position?: number
          project_id: string
        }
        Update: {
          created_at?: string
          graph_id?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_graphs_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graph_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_graphs_graph_id_fkey"
            columns: ["graph_id"]
            isOneToOne: false
            referencedRelation: "graphs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_graphs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_graph_id: string | null
          created_at: string
          description: string
          forked_from_post_id: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          active_graph_id?: string | null
          created_at?: string
          description?: string
          forked_from_post_id?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          active_graph_id?: string | null
          created_at?: string
          description?: string
          forked_from_post_id?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_active_graph_id_fkey"
            columns: ["active_graph_id"]
            isOneToOne: false
            referencedRelation: "graph_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_active_graph_id_fkey"
            columns: ["active_graph_id"]
            isOneToOne: false
            referencedRelation: "graphs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_forked_from_post_id_fkey"
            columns: ["forked_from_post_id"]
            isOneToOne: false
            referencedRelation: "post_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_forked_from_post_id_fkey"
            columns: ["forked_from_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      graph_summaries: {
        Row: {
          created_at: string | null
          description: string | null
          directed: boolean | null
          edge_count: number | null
          id: string | null
          is_public: boolean | null
          is_sample: boolean | null
          like_count: number | null
          name: string | null
          node_count: number | null
          owner_id: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          directed?: boolean | null
          edge_count?: never
          id?: string | null
          is_public?: boolean | null
          is_sample?: boolean | null
          like_count?: never
          name?: string | null
          node_count?: never
          owner_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          directed?: boolean | null
          edge_count?: never
          id?: string | null
          is_public?: boolean | null
          is_sample?: boolean | null
          like_count?: never
          name?: string | null
          node_count?: never
          owner_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      post_summaries: {
        Row: {
          body: string | null
          comment_count: number | null
          created_at: string | null
          id: string | null
          is_official: boolean | null
          is_published: boolean | null
          like_count: number | null
          owner_id: string | null
          project_id: string | null
          published_at: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          comment_count?: never
          created_at?: string | null
          id?: string | null
          is_official?: boolean | null
          is_published?: boolean | null
          like_count?: never
          owner_id?: string | null
          project_id?: string | null
          published_at?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          comment_count?: never
          created_at?: string | null
          id?: string | null
          is_official?: boolean | null
          is_published?: boolean | null
          like_count?: never
          owner_id?: string | null
          project_id?: string | null
          published_at?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      explore_graphs: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_sort?: string
          p_tag?: string
        }
        Returns: {
          created_at: string
          description: string
          directed: boolean
          edge_count: number
          id: string
          is_public: boolean
          is_sample: boolean
          like_count: number
          name: string
          node_count: number
          owner_id: string
          tags: string[]
          total_count: number
          updated_at: string
        }[]
      }
      explore_posts: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_sort?: string
          p_tag?: string
        }
        Returns: {
          body: string
          comment_count: number
          created_at: string
          id: string
          is_official: boolean
          is_published: boolean
          like_count: number
          owner_id: string
          project_id: string
          published_at: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      graph_previews: {
        Args: {
          p_graph_ids: string[]
          p_max_edges?: number
          p_max_nodes?: number
        }
        Returns: {
          directed: boolean
          edges: Json
          graph_id: string
          nodes: Json
        }[]
      }
      post_fork_counts: {
        Args: { p_post_ids: string[] }
        Returns: {
          fork_count: number
          post_id: string
        }[]
      }
      replace_graph_doc: {
        Args: { p_edges: Json; p_graph_id: string; p_nodes: Json }
        Returns: boolean
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

