const supabase = require('../config/database')

// Create a new flock
async function createFlock(flockData) {
  try {
    const { data, error } = await supabase
      .from('flocks')
      .insert([{
        farmer_id: flockData.farmer_id,
        flock_name: flockData.flock_name,
        type: flockData.type,
        breed: flockData.breed || null,
        initial_bird_count: flockData.initial_bird_count,
        current_bird_count: flockData.initial_bird_count,
        start_date: flockData.start_date,
        is_active: true
      }])
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error creating flock:', err.message)
    return null
  }
}

// Get a single flock by ID
async function getFlockById(flockId) {
  try {
    const { data, error } = await supabase
      .from('flocks')
      .select('*')
      .eq('id', flockId)
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error getting flock:', err.message)
    return null
  }
}

// Get all active flocks for a farmer
async function getActiveFlocks(farmerId) {
  try {
    const { data, error } = await supabase
      .from('flocks')
      .select('*')
      .eq('farmer_id', farmerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting active flocks:', err.message)
    return []
  }
}

// Update flock bird count
async function updateBirdCount(flockId, newCount) {
  try {
    const { data, error } = await supabase
      .from('flocks')
      .update({
        current_bird_count: newCount
      })
      .eq('id', flockId)
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error updating bird count:', err.message)
    return null
  }
}

// Close a flock cycle
async function closeFlock(flockId) {
  try {
    const { data, error } = await supabase
      .from('flocks')
      .update({
        is_active: false,
        end_date: new Date().toISOString().split('T')[0]
      })
      .eq('id', flockId)
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error closing flock:', err.message)
    return null
  }
}

// Calculate bird age in days
function getBirdAgeDays(startDate) {
  const start = new Date(startDate)
  const today = new Date()
  const diffTime = Math.abs(today - start)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

// Get age category based on flock type and age
function getAgeCategory(flockType, ageDays) {
  if (flockType === 'BROILER') {
    if (ageDays <= 14) return 'BROODING'
    if (ageDays <= 28) return 'GROWING'
    return 'FINISHING'
  }
  if (flockType === 'LAYER') {
    if (ageDays <= 21) return 'BROODING'
    return 'LAYING'
  }
  return 'BROODING'
}

module.exports = {
  createFlock,
  getFlockById,
  getActiveFlocks,
  updateBirdCount,
  closeFlock,
  getBirdAgeDays,
  getAgeCategory
}