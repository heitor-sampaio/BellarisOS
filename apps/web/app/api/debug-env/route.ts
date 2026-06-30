import { NextResponse } from 'next/server'

// Endpoint temporário para diagnosticar env vars no Railway
// REMOVER após confirmar que tudo está funcionando
export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL:      process.env.NEXT_PUBLIC_SUPABASE_URL       ? '✅ set' : '❌ missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  ? '✅ set' : '❌ missing',
    SUPABASE_SERVICE_ROLE_KEY:     process.env.SUPABASE_SERVICE_ROLE_KEY       ? '✅ set' : '❌ missing',
    DATABASE_URL:                  process.env.DATABASE_URL                    ? '✅ set' : '❌ missing',
    NEXT_PUBLIC_APP_URL:           process.env.NEXT_PUBLIC_APP_URL             ? '✅ set' : '❌ missing',
    NEXT_PUBLIC_META_APP_ID:       process.env.NEXT_PUBLIC_META_APP_ID         ? '✅ set' : '❌ missing',
    NODE_ENV:                      process.env.NODE_ENV,
    // Primeiros 20 chars para confirmar o formato sem expor o valor completo
    ANON_KEY_PREFIX:               process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20) ?? null,
  })
}
