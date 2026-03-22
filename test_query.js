
const { createClient } = require('@supabase/supabase-client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testQuery() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      stores:store_id (name, address),
      addresses:delivery_address_id (receiver_name, address_line, city, receiver_phone),
      rider:rider_id (full_name, phone),
      order_items (*)
    `)
    .limit(5);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Orders found:', data.length);
    data.forEach(order => {
      console.log('Order #', order.order_number);
      console.log('  Status:', order.status);
      console.log('  Rider ID:', order.rider_id);
      console.log('  Rider Join:', order.rider);
      console.log('  Address Join:', order.addresses);
      console.log('  Store Join:', order.stores);
    });
  }
}

testQuery();
