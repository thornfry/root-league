
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
                },"game_seats": {
                  Row: {
                    "faction": string,"game_id": string,"person_id": string,"seat": number
                  }
                  ComputedFields: never
                  Insert: {
                    "faction": string,"game_id": string,"person_id": string,"seat": number
                  }
                  Update: {
                    "faction"?: string,"game_id"?: string,"person_id"?: string,"seat"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_seats_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_outcome"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "game_seats_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_seats_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "game_no": number,"id": string,"map_index": number,"season_id": string,"void": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "game_no": number,"id"?: string,"map_index": number,"season_id": string,"void"?: boolean
                  }
                  Update: {
                    "game_no"?: number,"id"?: string,"map_index"?: number,"season_id"?: string,"void"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season_stage"
      referencedColumns: ["season_id"]
    },{
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
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
                },"picks": {
                  Row: {
                    "first_pick": string,"game_id": string,"person_id": string,"second_pick": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "first_pick": string,"game_id": string,"person_id": string,"second_pick"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "first_pick"?: string,"game_id"?: string,"person_id"?: string,"second_pick"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "picks_first_pick_fkey"
      columns: ["first_pick"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_outcome"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "picks_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_second_pick_fkey"
      columns: ["second_pick"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
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
                },"settlements": {
                  Row: {
                    "at": string,"game_id": string,"settled_by": string | null,"winners": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"game_id": string,"settled_by"?: string | null,"winners": (string)[]
                  }
                  Update: {
                    "at"?: string,"game_id"?: string,"settled_by"?: string | null,"winners"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "game_outcome"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "settlements_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_settled_by_fkey"
      columns: ["settled_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "game_id": string,"person_id": string,"updated_at": string,"winners": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"person_id": string,"updated_at"?: string,"winners": (string)[]
                  }
                  Update: {
                    "game_id"?: string,"person_id"?: string,"updated_at"?: string,"winners"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_outcome"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "submissions_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
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
            "game_outcome": {
                  Row: {
                    "game_id": string,"season_id": string,"state": string | null,"winners": (string)[] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season_stage"
      referencedColumns: ["season_id"]
    },{
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"leaderboard": {
                  Row: {
                    "display_name": string,"person_id": string,"points": number | null,"rank": number | null,"season_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season_stage"
      referencedColumns: ["season_id"]
    },{
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"pickem_scores": {
                  Row: {
                    "first_points": number | null,"game_id": string,"person_id": string,"points": number | null,"season_id": string,"second_points": number | null,"state": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season_stage"
      referencedColumns: ["season_id"]
    },{
      foreignKeyName: "games_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_outcome"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "picks_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"roster_public": {
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
                },"standings": {
                  Row: {
                    "display_name": string,"games_left": number | null,"games_played": number | null,"person_id": string,"rank": number | null,"season_id": string,"wins": number | null
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
"export_league_state":
{ Args: { "p_season_id": string }; Returns: Json
                           },
"fixit_delete":
{ Args: { "p_key": Json,"p_table": string }; Returns: Json
                           },
"fixit_delete_preview":
{ Args: { "p_key": Json,"p_table": string }; Returns: Json
                           },
"fixit_insert":
{ Args: { "p_row": Json,"p_table": string }; Returns: Json
                           },
"fixit_update":
{ Args: { "p_changes": Json,"p_key": Json,"p_table": string }; Returns: Json
                           },
"fixit_warnings":
{ Args: { "p_key": Json,"p_table": string }; Returns: Json
                           },
"import_league_state":
{ Args: { "p_files": Json,"p_preview"?: boolean,"p_season_id": string }; Returns: Json
                           },
"join_league":
{ Args: { "p_season_id": string }; Returns: undefined
                           },
"leave_league":
{ Args: { "p_season_id": string }; Returns: undefined
                           },
"link_person":
{ Args: { "p_seeded_person": string,"p_sign_in_person": string }; Returns: {
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
"publish_pairings":
{ Args: { "p_games": Json,"p_order": (string)[],"p_season_id": string,"p_seed": string }; Returns: undefined
                           },
"reopen_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"replace_player":
{ Args: { "p_from": string,"p_game_id"?: string,"p_season_id": string,"p_to": string }; Returns: Json
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
"save_pick":
{ Args: { "p_first": string,"p_game_id": string,"p_second"?: string }; Returns: undefined
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
"season_lock_lists":
{ Args: { "p_season_id": string }; Returns: {
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
"season_unlock_lists":
{ Args: { "p_season_id": string }; Returns: {
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
"settle_game":
{ Args: { "p_game_id": string,"p_winners": (string)[] }; Returns: undefined
                           },
"submit_result":
{ Args: { "p_game_id": string,"p_winners": (string)[] }; Returns: undefined
                           },
"void_game":
{ Args: { "p_game_id": string,"p_void": boolean }; Returns: undefined
                           },
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
