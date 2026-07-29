const supabase = require('../config/database')

// Log egg production
async function logEggProduction(data) {
  try {
    const avgEggWeight = data.egg_weight_1_g && data.egg_weight_2_g && data.egg_weight_3_g
      ? parseFloat(((data.egg_weight_1_g + data.egg_weight_2_g + data.egg_weight_3_g) / 3).toFixed(2))
      : null

    const { data: log, error } = await supabase
      .from('egg_production_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        bird_age_days: data.bird_age_days,
        eggs_collected: data.eggs_collected,
        broken_eggs: data.broken_eggs || 0,
        egg_weight_1_g: data.egg_weight_1_g || null,
        egg_weight_2_g: data.egg_weight_2_g || null,
        egg_weight_3_g: data.egg_weight_3_g || null,
        average_egg_weight_g: avgEggWeight,
        egg_size_concern: data.egg_size_concern || 'NORMAL'
      }])
      .select()
      .single()

    if (error) throw error

    return log
  } catch (err) {
    console.error('Error logging egg production:', err.message)
    return null
  }
}

// Get egg production summary for a flock
async function getEggProductionSummary(flockId) {
  try {
    const { data, error } = await supabase
      .from('egg_production_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })

    if (error) throw error

    if (!data || data.length === 0) {
      return {
        total_eggs_collected: 0,
        total_broken_eggs: 0,
        average_daily_production: 0,
        recent_logs: []
      }
    }

    const totalEggs = data.reduce((sum, l) => sum + parseInt(l.eggs_collected || 0), 0)
    const totalBroken = data.reduce((sum, l) => sum + parseInt(l.broken_eggs || 0), 0)
    const avgDaily = (totalEggs / data.length).toFixed(1)

    return {
      total_eggs_collected: totalEggs,
      total_broken_eggs: totalBroken,
      average_daily_production: parseFloat(avgDaily),
      recent_logs: data.slice(0, 7)
    }
  } catch (err) {
    console.error('Error getting egg production summary:', err.message)
    return null
  }
}

// Get lay rate for a flock
async function getLayRate(flockId, currentBirdCount) {
  try {
    const { data, error } = await supabase
      .from('egg_production_logs')
      .select('eggs_collected')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(7)

    if (error) throw error
    if (!data || data.length === 0) return null

    const avgEggs = data.reduce(
      (sum, l) => sum + parseInt(l.eggs_collected || 0), 0
    ) / data.length

    const layRate = ((avgEggs / currentBirdCount) * 100).toFixed(1)
    return parseFloat(layRate)
  } catch (err) {
    console.error('Error getting lay rate:', err.message)
    return null
  }
}

module.exports = {
  logEggProduction,
  getEggProductionSummary,
  getLayRate
}