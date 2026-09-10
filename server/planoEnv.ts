import type { PlanoServiceEnv } from './planoAuth.js';

export const resolvePlanoServiceEnv = (): PlanoServiceEnv => ({
  supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  asaasEnv: process.env.ASAAS_ENV || 'sandbox',
  asaasApiKey: process.env.ASAAS_API_KEY || '',
  asaasApiKeySandbox: process.env.ASAAS_API_KEY_SANDBOX || '',
});
