
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bffvnokgxqvlusfpbxkl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZnZub2tneHF2bHVzZnBieGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzcyNjEsImV4cCI6MjA4ODgxMzI2MX0.5C899KP87euOagVkbyEeY280oqnxm3apl3FsLu9HfdQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching order:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Order columns:', Object.keys(data[0]));
  } else {
    console.log('No orders found to check columns.');
  }
}

checkSchema();
