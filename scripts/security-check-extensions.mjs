import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPublicExtensions() {
  // Using match_kb_chunks as a proxy to check if helper functions are reachable in public schema
  // since match_kb_chunks uses vector operators.
  // A better check is to query pg_proc via a custom RPC that we know exists or by testing the operators directly.
  
  // We'll use a raw query through the internal read_query RPC which is usually present for internal tools.
  // If not, we fall back to checking if pgvector operators like '<=>' (cosine distance) are in public.
  
  const { data, error } = await supabase.rpc('read_query', {
    sql: `
      SELECT n.nspname as schema_name, p.proname as function_name
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'vector_%' OR 
        p.proname LIKE 'l2_distance%' OR 
        p.proname LIKE 'inner_product%' OR 
        p.proname LIKE 'cosine_distance%' OR
        p.proname LIKE 'similarity%' OR
        p.proname LIKE 'show_trgm%' OR
        p.proname LIKE 'word_similarity%' OR
        p.proname LIKE 'strict_word_similarity%' OR
        p.proname LIKE 'gbt_%'
      );
    `
  });

  // If read_query fails with a specific 'not found' error, it means we don't have a direct SQL runner.
  // In that case, we can't easily audit the schema from the outside without a dedicated RPC.
  // However, we can try to "ping" a known extension function in public.
  
  if (error && error.code === 'PGRST202') {
     // RPC read_query not found. Attempting alternative detection via operator availability in public.
     // If extensions are in public, 'vector_out' or 'similarity' functions will be visible to RPC.
     const { error: vectorError } = await supabase.rpc('vector_out', { '': '[1,2,3]' });
     const { error: trgmError } = await supabase.rpc('similarity', { '': 'a', '': 'b' });
     
     const vectorInPublic = vectorError && vectorError.code !== 'PGRST202';
     const trgmInPublic = trgmError && trgmError.code !== 'PGRST202';
     
     if (vectorInPublic || trgmInPublic) {
        console.error('CRITICAL SECURITY FAILURE: Extension functions detected in public schema via RPC probes!');
        process.exit(1);
     }
     console.log('Security check passed: Probes did not find extension helpers in public.');
     return;
  }

  if (error) {
    console.error('Error checking public schema functions:', error);
    process.exit(1);
  }

  if (data && data.length > 0) {
    console.error('CRITICAL SECURITY FAILURE: Extension helper functions found in public schema!');
    console.table(data);
    process.exit(1);
  }

  console.log('Security check passed: No forbidden extension helpers in public schema.');
}

checkPublicExtensions();
