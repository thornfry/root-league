
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_config": {
                  Row: {
                    "key": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"value": string
                  }
                  Update: {
                    "key"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"edit_log": {
                  Row: {
                    "action": string,"actor_person_id": string | null,"at": string,"id": number,"new": Json | null,"old": Json | null,"row_key": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_person_id"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"row_key"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_person_id"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"row_key"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"people": {
                  Row: {
                    "auth_user_id": string | null,"discord_id": string | null,"display_name": string,"id": string,"seed_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"discord_id"?: string | null,"display_name": string,"id"?: string,"seed_key"?: string | null
                  }
                  Update: {
                    "auth_user_id"?: string | null,"discord_id"?: string | null,"display_name"?: string,"id"?: string,"seed_key"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"roster": {
                  Row: {
                    "joined_at": string,"list": string,"list_flagged": boolean,"list_submitted": boolean,"person_id": string,"player_number": number | null,"position": number,"ranked_factions": (string)[],"season_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "joined_at"?: string,"list": string,"list_flagged"?: boolean,"list_submitted"?: boolean,"person_id": string,"player_number"?: number | null,"position": number,"ranked_factions"?: (string)[],"season_id": string
                  }
                  Update: {
                    "joined_at"?: string,"list"?: string,"list_flagged"?: boolean,"list_submitted"?: boolean,"person_id"?: string,"player_number"?: number | null,"position"?: number,"ranked_factions"?: (string)[],"season_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season_stage"
      referencedColumns: ["season_id"]
    },{
      foreignKeyName: "roster_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "capacity": number | null,"created_at": string,"faction_pool": (string)[] | null,"games_each": number | null,"id": string,"is_current": boolean,"lists_lock_at": string | null,"maps": (string)[] | null,"min_list_length": number | null,"name": string,"seed": string | null,"slug": string,"started_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number | null,"created_at"?: string,"faction_pool"?: (string)[] | null,"games_each"?: number | null,"id"?: string,"is_current"?: boolean,"lists_lock_at"?: string | null,"maps"?: (string)[] | null,"min_list_length"?: number | null,"name": string,"seed"?: string | null,"slug": string,"started_at"?: string | null
                  }
                  Update: {
                    "capacity"?: number | null,"created_at"?: string,"faction_pool"?: (string)[] | null,"games_each"?: number | null,"id"?: string,"is_current"?: boolean,"lists_lock_at"?: string | null,"maps"?: (string)[] | null,"min_list_length"?: number | null,"name"?: string,"seed"?: string | null,"slug"?: string,"started_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"whitelist": {
                  Row: {
                    "added_at": string,"added_by": string | null,"discord_id": string,"is_admin": boolean,"label": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"discord_id": string,"is_admin"?: boolean,"label"?: string | null
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"discord_id"?: string,"is_admin"?: boolean,"label"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whitelist_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "roster_public": {
                  Row: {
                    "display_name": string,"is_me": boolean | null,"joined_at": string | null,"list": string | null,"list_flagged": boolean | null,"list_in": boolean,"person_id": string,"position": number | null,"ranked_factions": (string)[] | null,"season_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "roster_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season_stage"
      referencedColumns: ["season_id"]
    },{
      foreignKeyName: "roster_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"season_stage": {
                  Row: {
                    "season_id": string,"stage": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "season_id"?: string | null,"stage"?: never
                         }
                        Update: {
                           "season_id"?: string | null,"stage"?: never
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "ensure_person":
{ Args: Record<PropertyKey, never>; Returns: {
              "auth_user_id": string | null,
"discord_id": string | null,
"display_name": string,
"id": string,
"seed_key": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "people"
        isOneToOne: true
        isSetofReturn: false
      } },
"join_league":
{ Args: { "p_season_id": string }; Returns: undefined
                           },
"leave_league":
{ Args: { "p_season_id": string }; Returns: undefined
                           },
"roster_add":
{ Args: { "p_display_name": string,"p_list"?: string,"p_season_id": string }; Returns: string
                           },
"roster_move":
{ Args: { "p_person_id": string,"p_season_id": string,"p_to_list": string,"p_to_position"?: number }; Returns: undefined
                           },
"roster_remove":
{ Args: { "p_person_id": string,"p_season_id": string }; Returns: undefined
                           },
"roster_set_list":
{ Args: { "p_factions": (string)[],"p_person_id": string,"p_season_id": string }; Returns: undefined
                           },
"roster_swap":
{ Args: { "p_person_a": string,"p_person_b": string,"p_season_id": string }; Returns: undefined
                           },
"save_ranked_list":
{ Args: { "p_factions": (string)[],"p_season_id": string }; Returns: undefined
                           },
"season_create":
{ Args: { "p_name": string }; Returns: {
              "capacity": number | null,
"created_at": string,
"faction_pool": (string)[] | null,
"games_each": number | null,
"id": string,
"is_current": boolean,
"lists_lock_at": string | null,
"maps": (string)[] | null,
"min_list_length": number | null,
"name": string,
"seed": string | null,
"slug": string,
"started_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "seasons"
        isOneToOne: true
        isSetofReturn: false
      } },
"season_save":
{ Args: { "p_capacity"?: number,"p_faction_pool"?: (string)[],"p_games_each"?: number,"p_lists_lock_at"?: string,"p_maps"?: (string)[],"p_min_list_length"?: number,"p_name": string,"p_season_id": string }; Returns: {
              "capacity": number | null,
"created_at": string,
"faction_pool": (string)[] | null,
"games_each": number | null,
"id": string,
"is_current": boolean,
"lists_lock_at": string | null,
"maps": (string)[] | null,
"min_list_length": number | null,
"name": string,
"seed": string | null,
"slug": string,
"started_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "seasons"
        isOneToOne: true
        isSetofReturn: false
      } },
"whitelist_add":
{ Args: { "p_discord_id": string,"p_label"?: string }; Returns: {
              "added_at": string,
"added_by": string | null,
"discord_id": string,
"is_admin": boolean,
"label": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "whitelist"
        isOneToOne: true
        isSetofReturn: false
      } },
"whitelist_add_many":
{ Args: { "p_entries": Json }; Returns: number
                           },
"whitelist_label":
{ Args: { "p_discord_id": string,"p_label": string }; Returns: {
              "added_at": string,
"added_by": string | null,
"discord_id": string,
"is_admin": boolean,
"label": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "whitelist"
        isOneToOne: true
        isSetofReturn: false
      } },
"whitelist_remove":
{ Args: { "p_discord_id": string }; Returns: undefined
                           },
"whitelist_set_admin":
{ Args: { "p_discord_id": string,"p_is_admin": boolean }; Returns: {
              "added_at": string,
"added_by": string | null,
"discord_id": string,
"is_admin": boolean,
"label": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "whitelist"
        isOneToOne: true
        isSetofReturn: false
      } },
"whoami":
{ Args: Record<PropertyKey, never>; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
