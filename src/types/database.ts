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
      activites_animation: {
        Row: {
          created_at: string
          equipe_id: string
          id: string
          jour: string
          notes: string | null
          superviseur_id: string
          type: Database["public"]["Enums"]["type_animation"]
          vm_id: string | null
        }
        Insert: {
          created_at?: string
          equipe_id: string
          id?: string
          jour?: string
          notes?: string | null
          superviseur_id: string
          type: Database["public"]["Enums"]["type_animation"]
          vm_id?: string | null
        }
        Update: {
          created_at?: string
          equipe_id?: string
          id?: string
          jour?: string
          notes?: string | null
          superviseur_id?: string
          type?: Database["public"]["Enums"]["type_animation"]
          vm_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activites_animation_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_animation_superviseur_id_fkey"
            columns: ["superviseur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_animation_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          entity_label: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          entity_label?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          entity_label?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appel_enregistrements: {
        Row: {
          appel_id: string
          created_at: string
          daily_recording_id: string | null
          duree_secondes: number | null
          id: string
          url: string
        }
        Insert: {
          appel_id: string
          created_at?: string
          daily_recording_id?: string | null
          duree_secondes?: number | null
          id?: string
          url: string
        }
        Update: {
          appel_id?: string
          created_at?: string
          daily_recording_id?: string | null
          duree_secondes?: number | null
          id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "appel_enregistrements_appel_id_fkey"
            columns: ["appel_id"]
            isOneToOne: false
            referencedRelation: "appels_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      appels_programmes: {
        Row: {
          conversation_id: string
          created_at: string
          daily_room_name: string | null
          daily_room_url: string | null
          date_heure: string
          id: string
          motif: string | null
          programme_par: string
          rappel_1h_envoye: boolean
          rappel_30min_envoye: boolean
          rappel_5min_envoye: boolean
          recording_actif: boolean | null
          statut: string
          titre: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          daily_room_name?: string | null
          daily_room_url?: string | null
          date_heure: string
          id?: string
          motif?: string | null
          programme_par: string
          rappel_1h_envoye?: boolean
          rappel_30min_envoye?: boolean
          rappel_5min_envoye?: boolean
          recording_actif?: boolean | null
          statut?: string
          titre: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          daily_room_name?: string | null
          daily_room_url?: string | null
          date_heure?: string
          id?: string
          motif?: string | null
          programme_par?: string
          rappel_1h_envoye?: boolean
          rappel_30min_envoye?: boolean
          rappel_5min_envoye?: boolean
          recording_actif?: boolean | null
          statut?: string
          titre?: string
        }
        Relationships: [
          {
            foreignKeyName: "appels_programmes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appels_programmes_programme_par_fkey"
            columns: ["programme_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cible_specialite_map: {
        Row: {
          cible: string
          equipe_id: string
          specialite: Database["public"]["Enums"]["specialite_client"]
        }
        Insert: {
          cible: string
          equipe_id: string
          specialite: Database["public"]["Enums"]["specialite_client"]
        }
        Update: {
          cible?: string
          equipe_id?: string
          specialite?: Database["public"]["Enums"]["specialite_client"]
        }
        Relationships: [
          {
            foreignKeyName: "cible_specialite_map_cible_fkey"
            columns: ["equipe_id", "cible"]
            isOneToOne: false
            referencedRelation: "quotas_cibles"
            referencedColumns: ["equipe_id", "cible"]
          },
          {
            foreignKeyName: "cible_specialite_map_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          actif: boolean
          categorie: string | null
          centre: string | null
          contacts: string | null
          created_at: string
          frequence_visite_mensuelle: number
          id: string
          jour_heure_habituel: string | null
          nom: string
          observations: string | null
          potentiel: Database["public"]["Enums"]["potentiel_client"]
          secteur: Database["public"]["Enums"]["secteur_code"]
          specialite: Database["public"]["Enums"]["specialite_client"]
          updated_at: string
        }
        Insert: {
          actif?: boolean
          categorie?: string | null
          centre?: string | null
          contacts?: string | null
          created_at?: string
          frequence_visite_mensuelle?: number
          id?: string
          jour_heure_habituel?: string | null
          nom: string
          observations?: string | null
          potentiel: Database["public"]["Enums"]["potentiel_client"]
          secteur: Database["public"]["Enums"]["secteur_code"]
          specialite: Database["public"]["Enums"]["specialite_client"]
          updated_at?: string
        }
        Update: {
          actif?: boolean
          categorie?: string | null
          centre?: string | null
          contacts?: string | null
          created_at?: string
          frequence_visite_mensuelle?: number
          id?: string
          jour_heure_habituel?: string | null
          nom?: string
          observations?: string | null
          potentiel?: Database["public"]["Enums"]["potentiel_client"]
          secteur?: Database["public"]["Enums"]["secteur_code"]
          specialite?: Database["public"]["Enums"]["specialite_client"]
          updated_at?: string
        }
        Relationships: []
      }
      clotures_journalieres: {
        Row: {
          created_at: string
          en_retard: boolean
          heure_cloture: string | null
          id: string
          jour: string
          photo_horodatage: string | null
          photo_latitude: number | null
          photo_longitude: number | null
          photo_path: string | null
          statut: Database["public"]["Enums"]["statut_cloture"]
          vm_id: string
        }
        Insert: {
          created_at?: string
          en_retard?: boolean
          heure_cloture?: string | null
          id?: string
          jour: string
          photo_horodatage?: string | null
          photo_latitude?: number | null
          photo_longitude?: number | null
          photo_path?: string | null
          statut?: Database["public"]["Enums"]["statut_cloture"]
          vm_id: string
        }
        Update: {
          created_at?: string
          en_retard?: boolean
          heure_cloture?: string | null
          id?: string
          jour?: string
          photo_horodatage?: string | null
          photo_latitude?: number | null
          photo_longitude?: number | null
          photo_path?: string | null
          statut?: Database["public"]["Enums"]["statut_cloture"]
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clotures_journalieres_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          equipe_id: string | null
          id: string
          nom: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipe_id?: string | null
          id?: string
          nom?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipe_id?: string | null
          id?: string
          nom?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      derogations_doublon_client: {
        Row: {
          autorise_par: string
          client_id: string
          created_at: string
          id: string
          motif: string | null
          programme_id: string
        }
        Insert: {
          autorise_par: string
          client_id: string
          created_at?: string
          id?: string
          motif?: string | null
          programme_id: string
        }
        Update: {
          autorise_par?: string
          client_id?: string
          created_at?: string
          id?: string
          motif?: string | null
          programme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "derogations_doublon_client_autorise_par_fkey"
            columns: ["autorise_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derogations_doublon_client_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derogations_doublon_client_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_frequence"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "derogations_doublon_client_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes_hebdomadaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derogations_doublon_client_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "v_lignes_avec_statut"
            referencedColumns: ["programme_id"]
          },
        ]
      }
      equipes: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
      fusions_secteurs: {
        Row: {
          actif: boolean
          created_at: string
          cree_par: string
          id: string
          potentiels: Database["public"]["Enums"]["potentiel_client"][]
          semaine_debut: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          cree_par: string
          id?: string
          potentiels: Database["public"]["Enums"]["potentiel_client"][]
          semaine_debut: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          cree_par?: string
          id?: string
          potentiels?: Database["public"]["Enums"]["potentiel_client"][]
          semaine_debut?: string
        }
        Relationships: [
          {
            foreignKeyName: "fusions_secteurs_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gardes: {
        Row: {
          created_at: string
          demarree_at: string
          id: string
          jour: string
          photo_latitude: number | null
          photo_longitude: number | null
          photo_path: string | null
          statut: Database["public"]["Enums"]["statut_garde"]
          terminee_at: string | null
          vm_id: string
        }
        Insert: {
          created_at?: string
          demarree_at?: string
          id?: string
          jour: string
          photo_latitude?: number | null
          photo_longitude?: number | null
          photo_path?: string | null
          statut?: Database["public"]["Enums"]["statut_garde"]
          terminee_at?: string | null
          vm_id: string
        }
        Update: {
          created_at?: string
          demarree_at?: string
          id?: string
          jour?: string
          photo_latitude?: number | null
          photo_longitude?: number | null
          photo_path?: string | null
          statut?: Database["public"]["Enums"]["statut_garde"]
          terminee_at?: string | null
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gardes_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grossistes: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
      imports_portefeuille: {
        Row: {
          created_at: string
          details: Json | null
          fichier_nom: string | null
          id: string
          nb_erreurs: number
          nb_lignes: number
          statut: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          fichier_nom?: string | null
          id?: string
          nb_erreurs?: number
          nb_lignes?: number
          statut?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          fichier_nom?: string | null
          id?: string
          nb_erreurs?: number
          nb_lignes?: number
          statut?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_portefeuille_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      justifications_frequence: {
        Row: {
          client_id: string
          created_at: string
          id: string
          justification: string
          mois: string
          updated_at: string
          vm_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          justification: string
          mois: string
          updated_at?: string
          vm_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          justification?: string
          mois?: string
          updated_at?: string
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "justifications_frequence_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justifications_frequence_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_frequence"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "justifications_frequence_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratoires: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
      mappings_produits_grossistes: {
        Row: {
          code_externe: string
          created_at: string
          grossiste_id: string
          id: string
          produit_id: string
        }
        Insert: {
          code_externe: string
          created_at?: string
          grossiste_id: string
          id?: string
          produit_id: string
        }
        Update: {
          code_externe?: string
          created_at?: string
          grossiste_id?: string
          id?: string
          produit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mappings_produits_grossistes_grossiste_id_fkey"
            columns: ["grossiste_id"]
            isOneToOne: false
            referencedRelation: "grossistes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mappings_produits_grossistes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      message_lectures: {
        Row: {
          lu_at: string
          message_id: string
          profile_id: string
        }
        Insert: {
          lu_at?: string
          message_id: string
          profile_id: string
        }
        Update: {
          lu_at?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_lectures_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_lectures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          contenu: string | null
          conversation_id: string
          created_at: string
          id: string
          piece_jointe_path: string | null
          sender_id: string
          type: string
        }
        Insert: {
          contenu?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          piece_jointe_path?: string | null
          sender_id: string
          type?: string
        }
        Update: {
          contenu?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          piece_jointe_path?: string | null
          sender_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      motifs_non_visite: {
        Row: {
          actif: boolean
          id: string
          libelle: string
          ordre: number
        }
        Insert: {
          actif?: boolean
          id?: string
          libelle: string
          ordre?: number
        }
        Update: {
          actif?: boolean
          id?: string
          libelle?: string
          ordre?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          corps: string | null
          created_at: string
          id: string
          lue: boolean
          metadata: Json
          profile_id: string
          titre: string
          type: string
        }
        Insert: {
          corps?: string | null
          created_at?: string
          id?: string
          lue?: boolean
          metadata?: Json
          profile_id: string
          titre: string
          type: string
        }
        Update: {
          corps?: string | null
          created_at?: string
          id?: string
          lue?: boolean
          metadata?: Json
          profile_id?: string
          titre?: string
          type?: string
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
      objectifs_mensuels_produits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mois: string
          objectif_quantite: number
          produit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mois: string
          objectif_quantite: number
          produit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mois?: string
          objectif_quantite?: number
          produit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectifs_mensuels_produits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectifs_mensuels_produits_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      parametres: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "parametres_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans_activites_mensuels: {
        Row: {
          contenu: Json
          created_at: string
          equipe_id: string
          id: string
          mois: string
          soumis_at: string
          superviseur_id: string
        }
        Insert: {
          contenu?: Json
          created_at?: string
          equipe_id: string
          id?: string
          mois: string
          soumis_at?: string
          superviseur_id: string
        }
        Update: {
          contenu?: Json
          created_at?: string
          equipe_id?: string
          id?: string
          mois?: string
          soumis_at?: string
          superviseur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_activites_mensuels_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_activites_mensuels_superviseur_id_fkey"
            columns: ["superviseur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poids_specialite_visite: {
        Row: {
          equipe_id: string
          poids: number
          specialite: Database["public"]["Enums"]["specialite_client"]
        }
        Insert: {
          equipe_id: string
          poids?: number
          specialite: Database["public"]["Enums"]["specialite_client"]
        }
        Update: {
          equipe_id?: string
          poids?: number
          specialite?: Database["public"]["Enums"]["specialite_client"]
        }
        Relationships: [
          {
            foreignKeyName: "poids_specialite_visite_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      portefeuille: {
        Row: {
          client_id: string
          created_at: string
          id: string
          vm_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          vm_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portefeuille_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portefeuille_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_frequence"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portefeuille_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      produits: {
        Row: {
          actif: boolean
          created_at: string
          equipe_id: string
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          equipe_id: string
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          equipe_id?: string
          id?: string
          nom?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      produits_pilotage: {
        Row: {
          created_at: string
          laboratoire_id: string
          pght: number
          produit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          laboratoire_id: string
          pght: number
          produit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          laboratoire_id?: string
          pght?: number
          produit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_pilotage_laboratoire_id_fkey"
            columns: ["laboratoire_id"]
            isOneToOne: false
            referencedRelation: "laboratoires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_pilotage_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: true
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          actif: boolean
          avatar_url: string | null
          created_at: string
          date_anniversaire: string | null
          email: string | null
          equipe_id: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          secteur: Database["public"]["Enums"]["secteur_code"] | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          actif?: boolean
          avatar_url?: string | null
          created_at?: string
          date_anniversaire?: string | null
          email?: string | null
          equipe_id?: string | null
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          secteur?: Database["public"]["Enums"]["secteur_code"] | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          actif?: boolean
          avatar_url?: string | null
          created_at?: string
          date_anniversaire?: string | null
          email?: string | null
          equipe_id?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          secteur?: Database["public"]["Enums"]["secteur_code"] | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      programme_conformite: {
        Row: {
          cible: string
          created_at: string
          id: string
          programme_id: string
          quantite_programmee: number
          quota_attendu: number
          statut: string
        }
        Insert: {
          cible: string
          created_at?: string
          id?: string
          programme_id: string
          quantite_programmee: number
          quota_attendu: number
          statut: string
        }
        Update: {
          cible?: string
          created_at?: string
          id?: string
          programme_id?: string
          quantite_programmee?: number
          quota_attendu?: number
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "programme_conformite_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes_hebdomadaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_conformite_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "v_lignes_avec_statut"
            referencedColumns: ["programme_id"]
          },
        ]
      }
      programme_lignes: {
        Row: {
          client_id: string
          created_at: string
          id: string
          jour: Database["public"]["Enums"]["jour_semaine"]
          ordre: number
          programme_id: string
          type_visite: Database["public"]["Enums"]["type_visite"]
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          jour: Database["public"]["Enums"]["jour_semaine"]
          ordre?: number
          programme_id: string
          type_visite: Database["public"]["Enums"]["type_visite"]
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          jour?: Database["public"]["Enums"]["jour_semaine"]
          ordre?: number
          programme_id?: string
          type_visite?: Database["public"]["Enums"]["type_visite"]
        }
        Relationships: [
          {
            foreignKeyName: "programme_lignes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_lignes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_frequence"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programme_lignes_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programmes_hebdomadaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_lignes_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "v_lignes_avec_statut"
            referencedColumns: ["programme_id"]
          },
        ]
      }
      programmes_hebdomadaires: {
        Row: {
          created_at: string
          delai_supplementaire_jusqu_a: string | null
          id: string
          mode_pharmacie_uniquement: boolean
          semaine_debut: string
          soumis_at: string | null
          statut: Database["public"]["Enums"]["statut_programme"]
          updated_at: string
          valide_at: string | null
          valide_par: string | null
          vm_id: string
        }
        Insert: {
          created_at?: string
          delai_supplementaire_jusqu_a?: string | null
          id?: string
          mode_pharmacie_uniquement?: boolean
          semaine_debut: string
          soumis_at?: string | null
          statut?: Database["public"]["Enums"]["statut_programme"]
          updated_at?: string
          valide_at?: string | null
          valide_par?: string | null
          vm_id: string
        }
        Update: {
          created_at?: string
          delai_supplementaire_jusqu_a?: string | null
          id?: string
          mode_pharmacie_uniquement?: boolean
          semaine_debut?: string
          soumis_at?: string | null
          statut?: Database["public"]["Enums"]["statut_programme"]
          updated_at?: string
          valide_at?: string | null
          valide_par?: string | null
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programmes_hebdomadaires_valide_par_fkey"
            columns: ["valide_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programmes_hebdomadaires_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotas_cibles: {
        Row: {
          cible: string
          equipe_id: string
          libelle: string
          ordre: number
          quota_hebdomadaire: number
        }
        Insert: {
          cible: string
          equipe_id: string
          libelle: string
          ordre?: number
          quota_hebdomadaire: number
        }
        Update: {
          cible?: string
          equipe_id?: string
          libelle?: string
          ordre?: number
          quota_hebdomadaire?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotas_cibles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      rapports_duo: {
        Row: {
          commentaire: string | null
          connaissance_produits: number
          created_at: string
          id: string
          jour: string
          maitrise_portefeuille: number
          relationnel: number
          superviseur_id: string
          vm_id: string
        }
        Insert: {
          commentaire?: string | null
          connaissance_produits: number
          created_at?: string
          id?: string
          jour?: string
          maitrise_portefeuille: number
          relationnel: number
          superviseur_id: string
          vm_id: string
        }
        Update: {
          commentaire?: string | null
          connaissance_produits?: number
          created_at?: string
          id?: string
          jour?: string
          maitrise_portefeuille?: number
          relationnel?: number
          superviseur_id?: string
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapports_duo_superviseur_id_fkey"
            columns: ["superviseur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_duo_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_hebdomadaire: {
        Row: {
          analyse_generale: string | null
          appreciation_personnelle: string | null
          appreciation_superviseur: string | null
          created_at: string
          id: string
          points_forts: string | null
          recommandations_superviseur: string | null
          semaine_debut: string
          suggestions: string | null
          updated_at: string
          veille_concurrentielle: string | null
          visa_horodatage: string | null
          visa_superviseur_id: string | null
          vm_id: string
        }
        Insert: {
          analyse_generale?: string | null
          appreciation_personnelle?: string | null
          appreciation_superviseur?: string | null
          created_at?: string
          id?: string
          points_forts?: string | null
          recommandations_superviseur?: string | null
          semaine_debut: string
          suggestions?: string | null
          updated_at?: string
          veille_concurrentielle?: string | null
          visa_horodatage?: string | null
          visa_superviseur_id?: string | null
          vm_id: string
        }
        Update: {
          analyse_generale?: string | null
          appreciation_personnelle?: string | null
          appreciation_superviseur?: string | null
          created_at?: string
          id?: string
          points_forts?: string | null
          recommandations_superviseur?: string | null
          semaine_debut?: string
          suggestions?: string | null
          updated_at?: string
          veille_concurrentielle?: string | null
          visa_horodatage?: string | null
          visa_superviseur_id?: string | null
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_hebdomadaire_visa_superviseur_id_fkey"
            columns: ["visa_superviseur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporting_hebdomadaire_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stocks_hebdomadaires: {
        Row: {
          created_by: string | null
          grossiste_id: string
          id: string
          produit_id: string
          quantite: number
          semaine_debut: string
          updated_at: string
        }
        Insert: {
          created_by?: string | null
          grossiste_id: string
          id?: string
          produit_id: string
          quantite?: number
          semaine_debut: string
          updated_at?: string
        }
        Update: {
          created_by?: string | null
          grossiste_id?: string
          id?: string
          produit_id?: string
          quantite?: number
          semaine_debut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocks_hebdomadaires_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocks_hebdomadaires_grossiste_id_fkey"
            columns: ["grossiste_id"]
            isOneToOne: false
            referencedRelation: "grossistes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocks_hebdomadaires_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      superviseur_equipes: {
        Row: {
          equipe_id: string
          superviseur_id: string
        }
        Insert: {
          equipe_id: string
          superviseur_id: string
        }
        Update: {
          equipe_id?: string
          superviseur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "superviseur_equipes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superviseur_equipes_superviseur_id_fkey"
            columns: ["superviseur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ventes_hebdomadaires: {
        Row: {
          created_by: string | null
          grossiste_id: string
          id: string
          produit_id: string
          quantite: number
          semaine_debut: string
          updated_at: string
        }
        Insert: {
          created_by?: string | null
          grossiste_id: string
          id?: string
          produit_id: string
          quantite?: number
          semaine_debut: string
          updated_at?: string
        }
        Update: {
          created_by?: string | null
          grossiste_id?: string
          id?: string
          produit_id?: string
          quantite?: number
          semaine_debut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventes_hebdomadaires_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventes_hebdomadaires_grossiste_id_fkey"
            columns: ["grossiste_id"]
            isOneToOne: false
            referencedRelation: "grossistes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventes_hebdomadaires_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      visite_manquante_motifs: {
        Row: {
          commentaire: string | null
          created_at: string
          cree_par: string
          id: string
          motif_id: string
          programme_ligne_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          cree_par: string
          id?: string
          motif_id: string
          programme_ligne_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          cree_par?: string
          id?: string
          motif_id?: string
          programme_ligne_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visite_manquante_motifs_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_manquante_motifs_motif_id_fkey"
            columns: ["motif_id"]
            isOneToOne: false
            referencedRelation: "motifs_non_visite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_manquante_motifs_programme_ligne_id_fkey"
            columns: ["programme_ligne_id"]
            isOneToOne: true
            referencedRelation: "programme_lignes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_manquante_motifs_programme_ligne_id_fkey"
            columns: ["programme_ligne_id"]
            isOneToOne: true
            referencedRelation: "v_lignes_avec_statut"
            referencedColumns: ["programme_ligne_id"]
          },
        ]
      }
      visite_produits: {
        Row: {
          produit_id: string
          visite_id: string
        }
        Insert: {
          produit_id: string
          visite_id: string
        }
        Update: {
          produit_id?: string
          visite_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visite_produits_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visite_produits_visite_id_fkey"
            columns: ["visite_id"]
            isOneToOne: false
            referencedRelation: "v_lignes_avec_statut"
            referencedColumns: ["visite_id"]
          },
          {
            foreignKeyName: "visite_produits_visite_id_fkey"
            columns: ["visite_id"]
            isOneToOne: false
            referencedRelation: "visites"
            referencedColumns: ["id"]
          },
        ]
      }
      visites: {
        Row: {
          cachet_centre: boolean
          cachet_prospect: boolean
          client_id: string
          commande_obtenue: string | null
          created_at: string
          garde_id: string | null
          horodatage: string
          hors_programme: boolean
          id: string
          jour: string
          latitude: number
          longitude: number
          motif_hors_programme_commentaire: string | null
          motif_hors_programme_id: string | null
          prescriptions_constatees: number
          programme_ligne_id: string | null
          promesses_libre: string | null
          promesses_obtenues: string | null
          statut: Database["public"]["Enums"]["statut_visite"]
          stock_disponible: Database["public"]["Enums"]["stock_niveau"] | null
          type_visite: Database["public"]["Enums"]["type_visite"]
          veille_concurrentielle: string | null
          vm_id: string
        }
        Insert: {
          cachet_centre?: boolean
          cachet_prospect?: boolean
          client_id: string
          commande_obtenue?: string | null
          created_at?: string
          garde_id?: string | null
          horodatage?: string
          hors_programme?: boolean
          id?: string
          jour: string
          latitude: number
          longitude: number
          motif_hors_programme_commentaire?: string | null
          motif_hors_programme_id?: string | null
          prescriptions_constatees?: number
          programme_ligne_id?: string | null
          promesses_libre?: string | null
          promesses_obtenues?: string | null
          statut?: Database["public"]["Enums"]["statut_visite"]
          stock_disponible?: Database["public"]["Enums"]["stock_niveau"] | null
          type_visite: Database["public"]["Enums"]["type_visite"]
          veille_concurrentielle?: string | null
          vm_id: string
        }
        Update: {
          cachet_centre?: boolean
          cachet_prospect?: boolean
          client_id?: string
          commande_obtenue?: string | null
          created_at?: string
          garde_id?: string | null
          horodatage?: string
          hors_programme?: boolean
          id?: string
          jour?: string
          latitude?: number
          longitude?: number
          motif_hors_programme_commentaire?: string | null
          motif_hors_programme_id?: string | null
          prescriptions_constatees?: number
          programme_ligne_id?: string | null
          promesses_libre?: string | null
          promesses_obtenues?: string | null
          statut?: Database["public"]["Enums"]["statut_visite"]
          stock_disponible?: Database["public"]["Enums"]["stock_niveau"] | null
          type_visite?: Database["public"]["Enums"]["type_visite"]
          veille_concurrentielle?: string | null
          vm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_frequence"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "visites_garde_id_fkey"
            columns: ["garde_id"]
            isOneToOne: false
            referencedRelation: "gardes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visites_motif_hors_programme_id_fkey"
            columns: ["motif_hors_programme_id"]
            isOneToOne: false
            referencedRelation: "motifs_non_visite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visites_programme_ligne_id_fkey"
            columns: ["programme_ligne_id"]
            isOneToOne: false
            referencedRelation: "programme_lignes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visites_programme_ligne_id_fkey"
            columns: ["programme_ligne_id"]
            isOneToOne: false
            referencedRelation: "v_lignes_avec_statut"
            referencedColumns: ["programme_ligne_id"]
          },
          {
            foreignKeyName: "visites_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_client_frequence: {
        Row: {
          client_id: string | null
          derniere_visite: string | null
          frequence_respectee: boolean | null
          frequence_visite_mensuelle: number | null
          nom: string | null
          potentiel: Database["public"]["Enums"]["potentiel_client"] | null
          prochaine_visite_due: string | null
          secteur: Database["public"]["Enums"]["secteur_code"] | null
          visites_mois_courant: number | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portefeuille_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hors_programme_journalier: {
        Row: {
          jour: string | null
          nb_hors_programme: number | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visites_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lignes_avec_statut: {
        Row: {
          client_id: string | null
          client_nom: string | null
          date_visite: string | null
          jour: Database["public"]["Enums"]["jour_semaine"] | null
          potentiel: Database["public"]["Enums"]["potentiel_client"] | null
          programme_id: string | null
          programme_ligne_id: string | null
          programme_statut:
            | Database["public"]["Enums"]["statut_programme"]
            | null
          semaine_debut: string | null
          specialite: Database["public"]["Enums"]["specialite_client"] | null
          statut_reel: string | null
          type_visite: Database["public"]["Enums"]["type_visite"] | null
          visite_id: string | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programme_lignes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_lignes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_frequence"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programmes_hebdomadaires_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_score_couverture_vm: {
        Row: {
          nb_gros_portefeuille: number | null
          nb_gros_visites: number | null
          ratio_gros_couverts: number | null
          score_brut: number | null
          score_pondere: number | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visites_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_score_hebdomadaire_pondere: {
        Row: {
          points_prevus: number | null
          points_realises: number | null
          score_pondere_pourcentage: number | null
          semaine_debut: string | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programmes_hebdomadaires_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_taux_realisation_hebdomadaire: {
        Row: {
          cible: string | null
          prevues: number | null
          realisees: number | null
          semaine_debut: string | null
          taux: number | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programmes_hebdomadaires_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_taux_realisation_journalier: {
        Row: {
          conforme: boolean | null
          jour: string | null
          taux_realisation: number | null
          visites_prevues: number | null
          visites_realisees: number | null
          vm_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programmes_hebdomadaires_vm_id_fkey"
            columns: ["vm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      __get_daily_config: {
        Args: never
        Returns: {
          api_key: string
          domain: string
          webhook_secret: string
        }[]
      }
      __get_push_config: {
        Args: never
        Returns: {
          private_key_jwk: string
          subject: string
          trigger_secret: string
        }[]
      }
      accorder_delai_supplementaire_programme: {
        Args: { p_nouvelle_limite: string; p_programme_id: string }
        Returns: undefined
      }
      accorder_derogation_doublon_client: {
        Args: { p_client_id: string; p_motif?: string; p_programme_id: string }
        Returns: string
      }
      benin_now: { Args: never; Returns: string }
      benin_today: { Args: never; Returns: string }
      cible_pour_specialite: {
        Args: {
          p_equipe_id: string
          p_specialite: Database["public"]["Enums"]["specialite_client"]
        }
        Returns: string
      }
      cloturer_journee: {
        Args: {
          p_photo_latitude: number
          p_photo_longitude: number
          p_photo_path: string
        }
        Returns: Json
      }
      coord_plausible: {
        Args: { p_lat: number; p_lon: number }
        Returns: boolean
      }
      current_equipe: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_secteur: {
        Args: never
        Returns: Database["public"]["Enums"]["secteur_code"]
      }
      default_frequence: {
        Args: { p: Database["public"]["Enums"]["potentiel_client"] }
        Returns: number
      }
      definir_fusion_secteurs: {
        Args: {
          p_actif: boolean
          p_potentiels: Database["public"]["Enums"]["potentiel_client"][]
          p_semaine_debut: string
        }
        Returns: string
      }
      definir_mode_pharmacie_uniquement: {
        Args: { p_actif: boolean; p_programme_id: string }
        Returns: undefined
      }
      envoyer_rappels_appels: { Args: never; Returns: undefined }
      forcer_clotures_du_jour: { Args: never; Returns: undefined }
      fusion_active: {
        Args: {
          p_potentiel: Database["public"]["Enums"]["potentiel_client"]
          p_semaine: string
        }
        Returns: boolean
      }
      get_parametre: { Args: { p_key: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_superviseur: { Args: never; Returns: boolean }
      is_vm_in_my_scope: { Args: { target_vm: string }; Returns: boolean }
      jour_offset: {
        Args: { j: Database["public"]["Enums"]["jour_semaine"] }
        Returns: number
      }
      jour_semaine_benin: {
        Args: { d: string }
        Returns: Database["public"]["Enums"]["jour_semaine"]
      }
      parametre_numeric: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      parametre_text: {
        Args: { p_default: string; p_key: string }
        Returns: string
      }
      plan_active_equipe_mois: {
        Args: { p_equipe: string; p_mois: string }
        Returns: boolean
      }
      poids_specialite: {
        Args: {
          p_equipe_id: string
          p_specialite: Database["public"]["Enums"]["specialite_client"]
        }
        Returns: number
      }
      points_potentiel: {
        Args: { p: Database["public"]["Enums"]["potentiel_client"] }
        Returns: number
      }
      potentiel_autorise: {
        Args: {
          p_jour: Database["public"]["Enums"]["jour_semaine"]
          p_potentiel: Database["public"]["Enums"]["potentiel_client"]
        }
        Returns: boolean
      }
      rappel_cloture_journee: { Args: never; Returns: undefined }
      rappel_soumission_programme: { Args: never; Returns: undefined }
      rejeter_programme_hebdomadaire: {
        Args: { p_motif: string; p_programme_id: string }
        Returns: undefined
      }
      score_mensuel_vm: {
        Args: { p_mois: string; p_vm_id: string }
        Returns: {
          discipline_clotures: number
          execution_planning: number
          mois: string
          ponctualite: number
          score_global: number
          taux_couverture: number
          vm_id: string
        }[]
      }
      signaler_non_conformite_journaliere: { Args: never; Returns: undefined }
      signaler_non_respect_frequence: { Args: never; Returns: undefined }
      soumettre_programme_hebdomadaire: {
        Args: { p_programme_id: string }
        Returns: Json
      }
      supervised_equipe_ids: { Args: never; Returns: string[] }
      terminer_garde: {
        Args: {
          p_photo_latitude: number
          p_photo_longitude: number
          p_photo_path: string
        }
        Returns: Json
      }
      valider_programme_hebdomadaire: {
        Args: { p_programme_id: string }
        Returns: undefined
      }
      verifier_enregistrements_appels: { Args: never; Returns: undefined }
      verrouiller_programmes_semaine: { Args: never; Returns: undefined }
    }
    Enums: {
      jour_semaine: "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI"
      potentiel_client: "GROS" | "MOYEN" | "FAIBLE"
      secteur_code: "A" | "B"
      specialite_client:
        | "GENERALISTE"
        | "GYNECOLOGUE"
        | "PEDIATRE"
        | "CARDIOLOGUE"
        | "RHUMATOLOGUE"
        | "ORL"
        | "AUTRE_SPECIALITE"
        | "MATERNITE"
        | "DISPENSAIRE"
        | "PHARMACIE"
      statut_cloture: "EN_ATTENTE" | "CLOTUREE" | "CLOTUREE_FORCEE"
      statut_garde: "EN_COURS" | "TERMINEE"
      statut_programme: "BROUILLON" | "SOUMIS" | "VALIDE" | "VERROUILLE"
      statut_visite: "REALISEE" | "HORS_PROGRAMME" | "NON_FAITE"
      stock_niveau: "RUPTURE" | "FAIBLE" | "CORRECT" | "BON"
      type_animation:
        | "POINT_QUOTIDIEN"
        | "REUNION_LUNDI"
        | "REUNION_MERCREDI"
        | "CHALLENGE"
        | "FORMATION_CONTINUE"
        | "COACHING_TERRAIN"
        | "ARGUMENTAIRE_VM"
      type_visite: "MEDICAL" | "PHARMACIE"
      user_role: "vm" | "superviseur" | "admin"
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
      jour_semaine: ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"],
      potentiel_client: ["GROS", "MOYEN", "FAIBLE"],
      secteur_code: ["A", "B"],
      specialite_client: [
        "GENERALISTE",
        "GYNECOLOGUE",
        "PEDIATRE",
        "CARDIOLOGUE",
        "RHUMATOLOGUE",
        "ORL",
        "AUTRE_SPECIALITE",
        "MATERNITE",
        "DISPENSAIRE",
        "PHARMACIE",
      ],
      statut_cloture: ["EN_ATTENTE", "CLOTUREE", "CLOTUREE_FORCEE"],
      statut_garde: ["EN_COURS", "TERMINEE"],
      statut_programme: ["BROUILLON", "SOUMIS", "VALIDE", "VERROUILLE"],
      statut_visite: ["REALISEE", "HORS_PROGRAMME", "NON_FAITE"],
      stock_niveau: ["RUPTURE", "FAIBLE", "CORRECT", "BON"],
      type_animation: [
        "POINT_QUOTIDIEN",
        "REUNION_LUNDI",
        "REUNION_MERCREDI",
        "CHALLENGE",
        "FORMATION_CONTINUE",
        "COACHING_TERRAIN",
        "ARGUMENTAIRE_VM",
      ],
      type_visite: ["MEDICAL", "PHARMACIE"],
      user_role: ["vm", "superviseur", "admin"],
    },
  },
} as const
