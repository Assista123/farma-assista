const supabase = require('../config/database')

// Check if a farmer exists by their Telegram ID
async function getFarmerByPhone(phoneNumber) {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single()

    if (error && error.code === 'PGRST116') {
      // PGRST116 means no rows found — farmer doesn't exist yet
      return null
    }

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error getting farmer:', err.message)
    return null
  }
}

// Create a new farmer
async function createFarmer(farmerData) {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .insert([{
        phone_number: farmerData.phone_number,
        name: farmerData.name,
        farm_name: farmerData.farm_name,
        state: farmerData.state,
        lga: farmerData.lga,
        is_active: true
      }])
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error creating farmer:', err.message)
    return null
  }
}

// Get farmer's active flocks
async function getActiveFlocks(farmerId) {
  try {
    const { data, error } = await supabase
      .from('flocks')
      .select('id, flock_name, type, breed, current_bird_count, start_date')
      .eq('farmer_id', farmerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting flocks:', err.message)
    return []
  }
}

// Update farmer profile
async function updateFarmer(farmerId, updates) {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .update(updates)
      .eq('id', farmerId)
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error updating farmer:', err.message)
    return null
  }
}

module.exports = {
  getFarmerByPhone,
  createFarmer,
  getActiveFlocks,
  updateFarmer
}