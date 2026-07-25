const supabase = require('../config/database')

// Log weight measurement
async function logWeight(data) {
  try {
    const average = (
      data.weight_1_kg +
      data.weight_2_kg +
      data.weight_3_kg +
      data.weight_4_kg +
      data.weight_5_kg
    ) / 5

    const { data: weight, error } = await supabase
      .from('weight_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        bird_age_days: data.bird_age_days,
        weight_1_kg: data.weight_1_kg,
        weight_2_kg: data.weight_2_kg,
        weight_3_kg: data.weight_3_kg,
        weight_4_kg: data.weight_4_kg,
        weight_5_kg: data.weight_5_kg,
        average_weight_kg: parseFloat(average.toFixed(3))
      }])
      .select()
      .single()

    if (error) throw error

    return weight
  } catch (err) {
    console.error('Error logging weight:', err.message)
    return null
  }
}

// Get latest weight for a flock
async function getLatestWeight(flockId) {
  try {
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code === 'PGRST116') return null
    if (error) throw error

    return data
  } catch (err) {
    console.error('Error getting latest weight:', err.message)
    return null
  }
}

// Get weight history for a flock
async function getWeightHistory(flockId) {
  try {
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: true })

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting weight history:', err.message)
    return []
  }
}

// Get breed benchmark for comparison
async function getBreedBenchmark(breed, ageDays) {
  try {
    const ageWeeks = Math.floor(ageDays / 7)
    const lookupBreed = breed || 'Unknown'

    let { data, error } = await supabase
      .from('breed_benchmarks')
      .select('*')
      .eq('flock_type', 'BROILER')
      .eq('breed', lookupBreed)
      .lte('age_week_start', ageWeeks)
      .gte('age_week_end', ageWeeks)
      .limit(1)
      .single()

    // If breed not found fall back to Unknown
    if (error && error.code === 'PGRST116') {
      const fallback = await supabase
        .from('breed_benchmarks')
        .select('*')
        .eq('flock_type', 'BROILER')
        .eq('breed', 'Unknown')
        .lte('age_week_start', ageWeeks)
        .gte('age_week_end', ageWeeks)
        .limit(1)
        .single()

      if (fallback.error) return null
      return fallback.data
    }

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error getting breed benchmark:', err.message)
    return null
  }
}

module.exports = {
  logWeight,
  getLatestWeight,
  getWeightHistory,
  getBreedBenchmark
}