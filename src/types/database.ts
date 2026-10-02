export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Temporary lightweight database type. Runtime access is governed by Supabase;
// generated database types can be regenerated safely later without blocking builds.
export type Database = any
