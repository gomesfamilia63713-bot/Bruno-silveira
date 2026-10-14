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
      employees: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          role_other: string | null
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          role_other?: string | null
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          role_other?: string | null
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      epi_events: {
        Row: {
          actor_id: string
          ca: string | null
          caracteristicas: string | null
          created_at: string
          employee_id: string | null
          employee_name: string | null
          event_type: string
          id: string
          item_code: string | null
          item_id: string
          item_name: string
          notes: string | null
          occurred_at: string
          quantity: number
          received_at: string
        }
        Insert: {
          actor_id: string
          ca?: string | null
          caracteristicas?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          event_type: string
          id?: string
          item_code?: string | null
          item_id: string
          item_name: string
          notes?: string | null
          occurred_at: string
          quantity: number
          received_at: string
        }
        Update: {
          actor_id?: string
          ca?: string | null
          caracteristicas?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          event_type?: string
          id?: string
          item_code?: string | null
          item_id?: string
          item_name?: string
          notes?: string | null
          occurred_at?: string
          quantity?: number
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "epi_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_current_location"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "epi_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_code_reservations: {
        Row: {
          codigo: string
        }
        Insert: {
          codigo: string
        }
        Update: {
          codigo?: string
        }
        Relationships: []
      }
      item_lifecycle_history: {
        Row: {
          actor_id: string | null
          event_type: string
          id: string
          item_code: string | null
          item_id: string
          item_name: string
          justification: string | null
          metadata: Json
          obra_id: string | null
          occurred_at: string
          operation_started_at: string | null
          quantity: number
        }
        Insert: {
          actor_id?: string | null
          event_type: string
          id?: string
          item_code?: string | null
          item_id: string
          item_name: string
          justification?: string | null
          metadata?: Json
          obra_id?: string | null
          occurred_at?: string
          operation_started_at?: string | null
          quantity?: number
        }
        Update: {
          actor_id?: string | null
          event_type?: string
          id?: string
          item_code?: string | null
          item_id?: string
          item_name?: string
          justification?: string | null
          metadata?: Json
          obra_id?: string | null
          occurred_at?: string
          operation_started_at?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_lifecycle_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_current_location"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_lifecycle_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_lifecycle_history_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          alert_resolved_at: string | null
          caracteristicas: string | null
          category: string | null
          codigo: string | null
          condition: string | null
          created_at: string
          created_by: string | null
          discarded_at: string | null
          epi_ca: string | null
          epi_expires_at: string | null
          epi_received_at: string | null
          id: string
          image_url: string | null
          kind: string
          location: string
          maintenance_exit_justification: string | null
          name: string
          notes: string | null
          price: number | null
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          alert_resolved_at?: string | null
          caracteristicas?: string | null
          category?: string | null
          codigo?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          discarded_at?: string | null
          epi_ca?: string | null
          epi_expires_at?: string | null
          epi_received_at?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          location?: string
          maintenance_exit_justification?: string | null
          name: string
          notes?: string | null
          price?: number | null
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          alert_resolved_at?: string | null
          caracteristicas?: string | null
          category?: string | null
          codigo?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          discarded_at?: string | null
          epi_ca?: string | null
          epi_expires_at?: string | null
          epi_received_at?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          location?: string
          maintenance_exit_justification?: string | null
          name?: string
          notes?: string | null
          price?: number | null
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      material_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          available_at: string
          client_id: string | null
          created_at: string
          employee_id: string
          id: string
          inventory_applied: boolean
          items: Json
          kind: string
          notes: string | null
          obra_id: string | null
          obra_name: string | null
          requested_at: string
          returned_at: string | null
          status: Database["public"]["Enums"]["material_request_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          available_at?: string
          client_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          inventory_applied?: boolean
          items?: Json
          kind?: string
          notes?: string | null
          obra_id?: string | null
          obra_name?: string | null
          requested_at?: string
          returned_at?: string | null
          status?: Database["public"]["Enums"]["material_request_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          available_at?: string
          client_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          inventory_applied?: boolean
          items?: Json
          kind?: string
          notes?: string | null
          obra_id?: string | null
          obra_name?: string | null
          requested_at?: string
          returned_at?: string | null
          status?: Database["public"]["Enums"]["material_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          obra: string | null
          person_name: string | null
          quantity: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          obra?: string | null
          person_name?: string | null
          quantity: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          obra?: string | null
          person_name?: string | null
          quantity?: number
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_current_location"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_extras: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          obra_id: string
          price: number | null
          purchase_date: string | null
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          obra_id: string
          price?: number | null
          purchase_date?: string | null
          quantity?: number
          unit?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          obra_id?: string
          price?: number | null
          purchase_date?: string | null
          quantity?: number
          unit?: string
        }
        Relationships: []
      }
      obra_items: {
        Row: {
          allocation_status: string
          created_at: string
          created_by: string | null
          holder_employee_id: string | null
          id: string
          item_id: string
          notes: string | null
          obra_id: string | null
          origin_label: string | null
          pause_justification: string | null
          quantity: number
        }
        Insert: {
          allocation_status?: string
          created_at?: string
          created_by?: string | null
          holder_employee_id?: string | null
          id?: string
          item_id: string
          notes?: string | null
          obra_id?: string | null
          origin_label?: string | null
          pause_justification?: string | null
          quantity?: number
        }
        Update: {
          allocation_status?: string
          created_at?: string
          created_by?: string | null
          holder_employee_id?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          obra_id?: string | null
          origin_label?: string | null
          pause_justification?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "obra_items_holder_employee_id_fkey"
            columns: ["holder_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_current_location"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "obra_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_items_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          created_at: string
          created_by: string | null
          free_notes: string | null
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          free_notes?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          free_notes?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_entries: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          effort_amount: number
          effort_unit: string
          employee_id: string | null
          entry_date: string
          hora_fim: string | null
          hora_inicio: string | null
          hours: number | null
          id: string
          notes: string | null
          obra_id: string | null
          quantity: number
          specification: string | null
          total_value: number
          unit: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          effort_amount?: number
          effort_unit?: string
          employee_id?: string | null
          entry_date?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          hours?: number | null
          id?: string
          notes?: string | null
          obra_id?: string | null
          quantity: number
          specification?: string | null
          total_value?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          effort_amount?: number
          effort_unit?: string
          employee_id?: string | null
          entry_date?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          hours?: number | null
          id?: string
          notes?: string | null
          obra_id?: string | null
          quantity?: number
          specification?: string | null
          total_value?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "production_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entry_participants: {
        Row: {
          created_at: string
          employee_id: string
          entry_id: string
          hours_share: number
          id: string
          included_in_rateio: boolean
          quantity_share: number
          role_snapshot: string | null
          valor_individual: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          entry_id: string
          hours_share?: number
          id?: string
          included_in_rateio?: boolean
          quantity_share?: number
          role_snapshot?: string | null
          valor_individual?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          entry_id?: string
          hours_share?: number
          id?: string
          included_in_rateio?: boolean
          quantity_share?: number
          role_snapshot?: string | null
          valor_individual?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_entry_participants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entry_participants_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "production_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      rateio_categories: {
        Row: {
          created_at: string
          id: string
          includes_helper: boolean
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          includes_helper?: boolean
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          includes_helper?: boolean
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      rentals: {
        Row: {
          created_at: string
          created_by: string | null
          daily_rate: number | null
          end_at: string | null
          id: string
          item_name: string
          notes: string | null
          obra_id: string | null
          start_at: string
          status: string
          supplier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          end_at?: string | null
          id?: string
          item_name: string
          notes?: string | null
          obra_id?: string | null
          start_at?: string
          status?: string
          supplier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          end_at?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          obra_id?: string | null
          start_at?: string
          status?: string
          supplier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement_log: {
        Row: {
          actor_id: string | null
          created_at: string
          destination: string | null
          id: string
          item_id: string
          kind: string
          notes: string | null
          obra_id: string | null
          quantity: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          item_id: string
          kind: string
          notes?: string | null
          obra_id?: string | null
          quantity: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          item_id?: string
          kind?: string
          notes?: string | null
          obra_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_current_location"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_log_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          actor_id: string | null
          category: string
          created_at: string
          id: string
          item_id: string | null
          message: string
          metadata: Json | null
          obra_id: string | null
          quantity: number | null
        }
        Insert: {
          actor_id?: string | null
          category: string
          created_at?: string
          id?: string
          item_id?: string | null
          message: string
          metadata?: Json | null
          obra_id?: string | null
          quantity?: number | null
        }
        Update: {
          actor_id?: string | null
          category?: string
          created_at?: string
          id?: string
          item_id?: string | null
          message?: string
          metadata?: Json | null
          obra_id?: string | null
          quantity?: number | null
        }
        Relationships: []
      }
      time_punches: {
        Row: {
          cep: string | null
          city: string | null
          client_id: string | null
          created_at: string
          employee_id: string
          id: string
          justification: string | null
          justification_audio_duration_s: number | null
          justification_audio_path: string | null
          justification_audio_transcript: string | null
          latitude: number | null
          longitude: number | null
          neighborhood: string | null
          photo_path: string | null
          punched_at: string
          street: string | null
          type: string
        }
        Insert: {
          cep?: string | null
          city?: string | null
          client_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          justification?: string | null
          justification_audio_duration_s?: number | null
          justification_audio_path?: string | null
          justification_audio_transcript?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          photo_path?: string | null
          punched_at?: string
          street?: string | null
          type: string
        }
        Update: {
          cep?: string | null
          city?: string | null
          client_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          justification?: string | null
          justification_audio_duration_s?: number | null
          justification_audio_path?: string | null
          justification_audio_transcript?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          photo_path?: string | null
          punched_at?: string
          street?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      whatsapp_recipients: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          is_group: boolean
          label: string
          target: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_group?: boolean
          label?: string
          target: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_group?: boolean
          label?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      item_current_location: {
        Row: {
          allocated_obras: string | null
          item_id: string | null
        }
        Insert: {
          allocated_obras?: never
          item_id?: string | null
        }
        Update: {
          allocated_obras?: never
          item_id?: string | null
        }
        Relationships: []
      }
      items_in_use: {
        Row: {
          in_use: number | null
          item_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obra_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_current_location"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "obra_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      users_with_roles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          roles: string[] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: never
          email?: string | null
          roles?: never
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: never
          email?: string | null
          roles?: never
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_return_material_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      allocate_stock_to_obra:
        | {
            Args: {
              _item_id: string
              _notes?: string
              _obra_id: string
              _quantity: number
            }
            Returns: string
          }
        | {
            Args: {
              _holder_employee_id?: string
              _item_id: string
              _notes?: string
              _obra_id: string
              _quantity: number
            }
            Returns: string
          }
      approve_material_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      confirm_inventory_inspection: {
        Args: { _item_id: string }
        Returns: undefined
      }
      create_material_request_by_token:
        | {
            Args: {
              _items: Json
              _kind: string
              _notes?: string
              _token: string
            }
            Returns: string
          }
        | {
            Args: {
              _destination?: string
              _items: Json
              _kind: string
              _notes?: string
              _obra_id?: string
              _token: string
            }
            Returns: string
          }
      employee_by_token: {
        Args: { _token: string }
        Returns: {
          active: boolean
          id: string
          name: string
        }[]
      }
      employee_journey_by_token: {
        Args: { _from: string; _to: string; _token: string }
        Returns: {
          day: string
          extra_hours: number
          regular_hours: number
          worked_hours: number
        }[]
      }
      employee_journey_summary: {
        Args: { _employee_id: string; _from: string; _to: string }
        Returns: {
          day: string
          extra_hours: number
          regular_hours: number
          worked_hours: number
        }[]
      }
      ensure_my_employee: {
        Args: never
        Returns: {
          id: string
          name: string
          token: string
        }[]
      }
      finalize_obra: { Args: { _obra_id: string }; Returns: undefined }
      handle_movimentacao_estoque: {
        Args: {
          _employee_id?: string
          _item_id: string
          _kind: string
          _notes?: string
          _obra_id: string
          _quantity: number
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_items_by_token: {
        Args: { _token: string }
        Returns: {
          item_id: string
          name: string
          obra_item_id: string
          obra_name: string
          origin_label: string
          quantity: number
          taken_at: string
          unit: string
        }[]
      }
      my_items_with_details_by_token: {
        Args: { _token: string }
        Returns: {
          caracteristicas: string
          item_id: string
          name: string
          obra_item_id: string
          obra_name: string
          origin_label: string
          quantity: number
          taken_at: string
          unit: string
        }[]
      }
      open_obras_by_employee_token: {
        Args: { _token: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      receive_stock_from_obra: {
        Args: { _item_id: string; _obra_id: string; _quantity?: number }
        Returns: undefined
      }
      record_epi_event: {
        Args: {
          _employee_id?: string
          _event_id: string
          _event_type: string
          _item_id: string
          _notes?: string
          _occurred_at: string
          _quantity: number
        }
        Returns: string
      }
      register_punch_by_token:
        | {
            Args: {
              _cep?: string
              _city?: string
              _client_id?: string
              _justification?: string
              _latitude?: number
              _longitude?: number
              _neighborhood?: string
              _photo_path?: string
              _punched_at: string
              _street?: string
              _token: string
              _type: string
            }
            Returns: string
          }
        | {
            Args: {
              _cep?: string
              _city?: string
              _client_id?: string
              _justification?: string
              _justification_audio_duration_s?: number
              _justification_audio_path?: string
              _justification_audio_transcript?: string
              _latitude?: number
              _longitude?: number
              _neighborhood?: string
              _photo_path?: string
              _punched_at: string
              _street?: string
              _token: string
              _type: string
            }
            Returns: string
          }
      return_stock_by_employee_token: {
        Args: { _obra_item_id: string; _quantity: number; _token: string }
        Returns: undefined
      }
      return_stock_from_obra_item: {
        Args: { _obra_item_id: string; _quantity: number }
        Returns: undefined
      }
      set_item_holder: {
        Args: { _item_id: string; _new_holder_employee_id: string }
        Returns: undefined
      }
      stock_catalog_public: {
        Args: never
        Returns: {
          category: string
          codigo: string
          id: string
          kind: string
          name: string
          quantity: number
          unit: string
        }[]
      }
      stock_catalog_with_details: {
        Args: never
        Returns: {
          caracteristicas: string
          category: string
          codigo: string
          id: string
          kind: string
          name: string
          quantity: number
          unit: string
        }[]
      }
      transfer_item_between_obras: {
        Args: { _item_id: string; _new_obra_id: string }
        Returns: undefined
      }
      transfer_obra_resources: {
        Args: { _source_obra_id: string; _target_obra_id?: string }
        Returns: number
      }
      update_item_assignment:
        | {
            Args: {
              _item_id: string
              _new_holder_employee_id: string
              _new_obra_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _allocation_status: string
              _item_id: string
              _new_holder_employee_id: string
              _new_obra_id: string
              _pause_justification: string
            }
            Returns: undefined
          }
      worked_hours_for_day: {
        Args: { _day: string; _employee_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "viewer"
      material_request_status:
        | "pendente"
        | "aprovado"
        | "em_uso"
        | "devolvido"
        | "rejeitado"
      movement_type: "in" | "out"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "viewer"],
      material_request_status: [
        "pendente",
        "aprovado",
        "em_uso",
        "devolvido",
        "rejeitado",
      ],
      movement_type: ["in", "out"],
    },
  },
} as const
