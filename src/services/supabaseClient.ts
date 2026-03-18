import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = REDACTED_URL;
const SUPABASE_ANON_KEY = REDACTED_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
