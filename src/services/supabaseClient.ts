import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bffvnokgxqvlusfpbxkl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZnZub2tneHF2bHVzZnBieGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzcyNjEsImV4cCI6MjA4ODgxMzI2MX0.5C899KP87euOagVkbyEeY280oqnxm3apl3FsLu9HfdQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
