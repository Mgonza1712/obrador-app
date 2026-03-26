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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assemblies: {
        Row: {
          buffer_pct: number
          category: string | null
          cogs: number | null
          id: string
          is_active: boolean
          margin_pct: number | null
          margin_target_pct: number
          notes: string | null
          sale_price: number | null
          tenant_id: string | null
          title: string
          updated_at: string | null
          venue_id: string | null
          yield_qty: number | null
          yield_unit: string | null
        }
        Insert: {
          buffer_pct?: number
          category?: string | null
          cogs?: number | null
          id?: string
          is_active?: boolean
          margin_pct?: number | null
          margin_target_pct?: number
          notes?: string | null
          sale_price?: number | null
          tenant_id?: string | null
          title: string
          updated_at?: string | null
          venue_id?: string | null
          yield_qty?: number | null
          yield_unit?: string | null
        }
        Update: {
          buffer_pct?: number
          category?: string | null
          cogs?: number | null
          id?: string
          is_active?: boolean
          margin_pct?: number | null
          margin_target_pct?: number
          notes?: string | null
          sale_price?: number | null
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
          venue_id?: string | null
          yield_qty?: number | null
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "erp_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          assembly_id: string | null
          component_id: string | null
          display_quantity: number | null
          display_unit: string | null
          id: string
          quantity: number
          sort_order: number
          sub_assembly_id: string | null
          unit: string | null
          waste_pct: number
        }
        Insert: {
          assembly_id?: string | null
          component_id?: string | null
          display_quantity?: number | null
          display_unit?: string | null
          id?: string
          quantity: number
          sort_order?: number
          sub_assembly_id?: string | null
          unit?: string | null
          waste_pct?: number
        }
        Update: {
          assembly_id?: string | null
          component_id?: string | null
          display_quantity?: number | null
          display_unit?: string | null
          id?: string
          quantity?: number
          sort_order?: number
          sub_assembly_id?: string | null
          unit?: string | null
          waste_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_sub_assembly_id_fkey"
            columns: ["sub_assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_sub_assembly_id_fkey"
            columns: ["sub_assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_sub_assembly_id_fkey"
            columns: ["sub_assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          current_cogs: number | null
          id: string
          master_item_id: string | null
          name: string
          tenant_id: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          current_cogs?: number | null
          id?: string
          master_item_id?: string | null
          name: string
          tenant_id?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          current_cogs?: number | null
          id?: string
          master_item_id?: string | null
          name?: string
          tenant_id?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "components_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "bom_lines_expanded"
            referencedColumns: ["master_item_id"]
          },
          {
            foreignKeyName: "components_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "erp_master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_alerts: {
        Row: {
          alert_type: string
          assembly_id: string | null
          created_at: string | null
          id: string
          is_read: boolean
          master_item_id: string | null
          message: string | null
          new_value: number | null
          old_value: number | null
          pct_change: number | null
          tenant_id: string | null
          threshold_used: number | null
        }
        Insert: {
          alert_type: string
          assembly_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean
          master_item_id?: string | null
          message?: string | null
          new_value?: number | null
          old_value?: number | null
          pct_change?: number | null
          tenant_id?: string | null
          threshold_used?: number | null
        }
        Update: {
          alert_type?: string
          assembly_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean
          master_item_id?: string | null
          message?: string | null
          new_value?: number | null
          old_value?: number | null
          pct_change?: number | null
          tenant_id?: string | null
          threshold_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_alerts_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_alerts_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_alerts_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_alerts_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "bom_lines_expanded"
            referencedColumns: ["master_item_id"]
          },
          {
            foreignKeyName: "cost_alerts_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "erp_master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_chat_memory: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      erp_documents: {
        Row: {
          ai_interpretation: Json | null
          created_at: string | null
          doc_type: string
          document_date: string | null
          document_number: string | null
          drive_url: string | null
          id: string
          parent_invoice_id: string | null
          provider_id: string | null
          reconciliation_delta: number | null
          reconciliation_status: string | null
          referenced_delivery_notes: string[] | null
          status: string | null
          tenant_id: string | null
          total_amount: number | null
          venue_id: string | null
        }
        Insert: {
          ai_interpretation?: Json | null
          created_at?: string | null
          doc_type: string
          document_date?: string | null
          document_number?: string | null
          drive_url?: string | null
          id?: string
          parent_invoice_id?: string | null
          provider_id?: string | null
          reconciliation_delta?: number | null
          reconciliation_status?: string | null
          referenced_delivery_notes?: string[] | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
          venue_id?: string | null
        }
        Update: {
          ai_interpretation?: Json | null
          created_at?: string | null
          doc_type?: string
          document_date?: string | null
          document_number?: string | null
          drive_url?: string | null
          id?: string
          parent_invoice_id?: string | null
          provider_id?: string | null
          reconciliation_delta?: number | null
          reconciliation_status?: string | null
          referenced_delivery_notes?: string[] | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_documents_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "erp_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_documents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "erp_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_documents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "erp_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_item_aliases: {
        Row: {
          cantidad_por_unidad: number | null
          conversion_multiplier: number | null
          formato: string | null
          id: string
          master_item_id: string | null
          provider_id: string | null
          raw_name: string
          unidad_precio: string | null
          unidades_por_pack: number | null
        }
        Insert: {
          cantidad_por_unidad?: number | null
          conversion_multiplier?: number | null
          formato?: string | null
          id?: string
          master_item_id?: string | null
          provider_id?: string | null
          raw_name: string
          unidad_precio?: string | null
          unidades_por_pack?: number | null
        }
        Update: {
          cantidad_por_unidad?: number | null
          conversion_multiplier?: number | null
          formato?: string | null
          id?: string
          master_item_id?: string | null
          provider_id?: string | null
          raw_name?: string
          unidad_precio?: string | null
          unidades_por_pack?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_item_aliases_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "bom_lines_expanded"
            referencedColumns: ["master_item_id"]
          },
          {
            foreignKeyName: "erp_item_aliases_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "erp_master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_item_aliases_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "erp_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_master_items: {
        Row: {
          base_unit: string
          category: string | null
          created_at: string | null
          id: string
          official_name: string
          tenant_id: string | null
        }
        Insert: {
          base_unit: string
          category?: string | null
          created_at?: string | null
          id?: string
          official_name: string
          tenant_id?: string | null
        }
        Update: {
          base_unit?: string
          category?: string | null
          created_at?: string | null
          id?: string
          official_name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_master_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_price_history: {
        Row: {
          cost_per_base_unit: number | null
          cost_per_packaged_unit: number | null
          effective_date: string | null
          id: string
          is_preferred: boolean
          master_item_id: string | null
          provider_id: string | null
          status: string | null
          unit_price: number
          venue_id: string | null
        }
        Insert: {
          cost_per_base_unit?: number | null
          cost_per_packaged_unit?: number | null
          effective_date?: string | null
          id?: string
          is_preferred?: boolean
          master_item_id?: string | null
          provider_id?: string | null
          status?: string | null
          unit_price: number
          venue_id?: string | null
        }
        Update: {
          cost_per_base_unit?: number | null
          cost_per_packaged_unit?: number | null
          effective_date?: string | null
          id?: string
          is_preferred?: boolean
          master_item_id?: string | null
          provider_id?: string | null
          status?: string | null
          unit_price?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_price_history_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "bom_lines_expanded"
            referencedColumns: ["master_item_id"]
          },
          {
            foreignKeyName: "erp_price_history_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "erp_master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_price_history_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "erp_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_price_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "erp_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_providers: {
        Row: {
          channel: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean
          is_trusted: boolean
          merged_into: string | null
          name: string
          notes: string | null
          phone: string | null
          shared_pricing: boolean
          tenant_id: string | null
        }
        Insert: {
          channel?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_trusted?: boolean
          merged_into?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          shared_pricing?: boolean
          tenant_id?: string | null
        }
        Update: {
          channel?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_trusted?: boolean
          merged_into?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          shared_pricing?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_providers_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "erp_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_purchase_lines: {
        Row: {
          ai_interpretation: Json | null
          document_id: string | null
          id: string
          line_total_cost: number
          master_item_id: string | null
          quantity: number
          raw_name: string | null
          unit_price: number | null
        }
        Insert: {
          ai_interpretation?: Json | null
          document_id?: string | null
          id?: string
          line_total_cost: number
          master_item_id?: string | null
          quantity: number
          raw_name?: string | null
          unit_price?: number | null
        }
        Update: {
          ai_interpretation?: Json | null
          document_id?: string | null
          id?: string
          line_total_cost?: number
          master_item_id?: string | null
          quantity?: number
          raw_name?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_purchase_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "erp_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_lines_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "bom_lines_expanded"
            referencedColumns: ["master_item_id"]
          },
          {
            foreignKeyName: "erp_purchase_lines_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "erp_master_items"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_tenants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          subscription_plan: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          subscription_plan?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          subscription_plan?: string | null
        }
        Relationships: []
      }
      erp_venues: {
        Row: {
          created_at: string | null
          id: string
          name: string
          tenant_id: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          tenant_id?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_venues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          tenant_id: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          role?: string | null
          tenant_id?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          tenant_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "erp_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_daily: {
        Row: {
          id: string
          raw_ticket_z: Json | null
          sale_date: string
          total_revenue: number | null
          venue_id: string | null
        }
        Insert: {
          id?: string
          raw_ticket_z?: Json | null
          sale_date: string
          total_revenue?: number | null
          venue_id?: string | null
        }
        Update: {
          id?: string
          raw_ticket_z?: Json | null
          sale_date?: string
          total_revenue?: number | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "erp_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_items: {
        Row: {
          assembly_id: string | null
          id: string
          quantity_sold: number | null
          sales_daily_id: string | null
          total_item_revenue: number | null
        }
        Insert: {
          assembly_id?: string | null
          id?: string
          quantity_sold?: number | null
          sales_daily_id?: string | null
          total_item_revenue?: number | null
        }
        Update: {
          assembly_id?: string | null
          id?: string
          quantity_sold?: number | null
          sales_daily_id?: string | null
          total_item_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_items_sales_daily_id_fkey"
            columns: ["sales_daily_id"]
            isOneToOne: false
            referencedRelation: "sales_daily"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          assembly_id: string | null
          final_image_url: string | null
          id: string
          steps_json: Json | null
        }
        Insert: {
          assembly_id?: string | null
          final_image_url?: string | null
          id?: string
          steps_json?: Json | null
        }
        Update: {
          assembly_id?: string | null
          final_image_url?: string | null
          id?: string
          steps_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sops_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          factor: number
          from_unit: string
          to_unit: string
        }
        Insert: {
          factor: number
          from_unit: string
          to_unit: string
        }
        Update: {
          factor?: number
          from_unit?: string
          to_unit?: string
        }
        Relationships: []
      }
    }
    Views: {
      assemblies_with_financials: {
        Row: {
          buffer_pct: number | null
          category: string | null
          cogs: number | null
          id: string | null
          ingredient_count: number | null
          is_active: boolean | null
          margin_pct: number | null
          margin_status: string | null
          margin_target_pct: number | null
          notes: string | null
          sale_price: number | null
          tenant_id: string | null
          title: string | null
          unread_alerts_count: number | null
          updated_at: string | null
          venue_id: string | null
          yield_qty: number | null
          yield_unit: string | null
        }
        Insert: {
          buffer_pct?: number | null
          category?: string | null
          cogs?: number | null
          id?: string | null
          ingredient_count?: never
          is_active?: boolean | null
          margin_pct?: number | null
          margin_status?: never
          margin_target_pct?: number | null
          notes?: string | null
          sale_price?: number | null
          tenant_id?: string | null
          title?: string | null
          unread_alerts_count?: never
          updated_at?: string | null
          venue_id?: string | null
          yield_qty?: number | null
          yield_unit?: string | null
        }
        Update: {
          buffer_pct?: number | null
          category?: string | null
          cogs?: number | null
          id?: string | null
          ingredient_count?: never
          is_active?: boolean | null
          margin_pct?: number | null
          margin_status?: never
          margin_target_pct?: number | null
          notes?: string | null
          sale_price?: number | null
          tenant_id?: string | null
          title?: string | null
          unread_alerts_count?: never
          updated_at?: string | null
          venue_id?: string | null
          yield_qty?: number | null
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "erp_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines_expanded: {
        Row: {
          assembly_id: string | null
          base_unit: string | null
          component_id: string | null
          component_name: string | null
          id: string | null
          ingredient_category: string | null
          line_cost: number | null
          line_type: string | null
          master_item_id: string | null
          master_item_name: string | null
          quantity: number | null
          sort_order: number | null
          sub_assembly_cogs: number | null
          sub_assembly_id: string | null
          sub_assembly_line_cost: number | null
          sub_assembly_name: string | null
          unit: string | null
          unit_cost: number | null
          waste_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_sub_assembly_id_fkey"
            columns: ["sub_assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_sub_assembly_id_fkey"
            columns: ["sub_assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies_with_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_sub_assembly_id_fkey"
            columns: ["sub_assembly_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_top_platos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_catalogo_precios: {
        Row: {
          categoria: string | null
          es_proveedor_preferido: boolean | null
          fecha_actualizacion: string | null
          local: string | null
          nombre_en_factura: string | null
          precio_botella_o_unidad: number | null
          precio_bulto: number | null
          precio_por_litro_kg: number | null
          producto: string | null
          proveedor: string | null
          tamano_unidad_ml_g: number | null
          tipo_bulto: string | null
          unidad_medida_base: string | null
          unidades_por_bulto: number | null
        }
        Relationships: []
      }
      vw_dashboard_inflacion: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          ingredient_name: string | null
          master_item_id: string | null
          message: string | null
          new_value: number | null
          old_value: number | null
          pct_change: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_alerts_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "bom_lines_expanded"
            referencedColumns: ["master_item_id"]
          },
          {
            foreignKeyName: "cost_alerts_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "erp_master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_dashboard_top_platos: {
        Row: {
          category: string | null
          cogs: number | null
          id: string | null
          margin_pct: number | null
          margin_target_pct: number | null
          qty_sold_30d: number | null
          rentabilidad_absoluta_30d: number | null
          revenue_30d: number | null
          sale_price: number | null
          tenant_id: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "erp_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_tenant_id: { Args: never; Returns: string }
      calculate_assembly_cogs: {
        Args: { p_assembly_id: string }
        Returns: number
      }
      get_component_unit_cost: {
        Args: { p_master_item_id: string }
        Returns: number
      }
      get_user_org_id: { Args: never; Returns: string }
      normalize_to_base_unit: {
        Args: { p_base_unit: string; p_quantity: number; p_unit: string }
        Returns: number
      }
      procesar_factura_completa: {
        Args: {
          p_file_url: string
          p_json_payload: Json
          p_modo?: string
          p_tenant_name: string
        }
        Returns: Json
      }
      propagate_cogs_from_item: {
        Args: { p_master_item_id: string }
        Returns: undefined
      }
      refresh_assembly_financials: {
        Args: { p_assembly_id: string }
        Returns: undefined
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
  public: {
    Enums: {},
  },
} as const
