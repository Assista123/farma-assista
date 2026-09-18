const supabase = require('../config/database')

/**
 * Check feed consumption deviation against the last 7 days average.
 * Flags if consumption drops by more than 25%.
 */
async function checkFeedDeviation(flockId, currentConsumptionKg, logDate) {
  try {
    const { data: recentLogs, error } = await supabase
      .from('feed_consumption_logs')
      .select('quantity_kg, date')
      .eq('flock_id', flockId)
      .lt('date', logDate)
      .order('date', { ascending: false })
      .limit(7)

    if (error || !recentLogs || recentLogs.length < 3) return null // Need at least 3 days history

    const total = recentLogs.reduce((sum, l) => sum + parseFloat(l.quantity_kg), 0)
    const avg = total / recentLogs.length

    const dropPercent = ((avg - currentConsumptionKg) / avg) * 100

    if (dropPercent >= 25) {
      return {
        type: 'FEED_DROP',
        avg: avg.toFixed(1),
        current: currentConsumptionKg,
        dropPercent: dropPercent.toFixed(1)
      }
    }
    return null
  } catch (err) {
    console.error('Error checking feed deviation:', err.message)
    return null
  }
}

/**
 * Check egg production deviation against the last 7 days average.
 * Flags if egg collection drops by more than 20%.
 */
async function checkEggDeviation(flockId, currentEggs, logDate) {
  try {
    const { data: recentLogs, error } = await supabase
      .from('egg_production_logs')
      .select('eggs_collected, date')
      .eq('flock_id', flockId)
      .lt('date', logDate)
      .order('date', { ascending: false })
      .limit(7)

    if (error || !recentLogs || recentLogs.length < 3) return null

    const total = recentLogs.reduce((sum, l) => sum + parseInt(l.eggs_collected), 0)
    const avg = total / recentLogs.length

    const dropPercent = ((avg - currentEggs) / avg) * 100

    if (dropPercent >= 20) {
      return {
        type: 'EGG_DROP',
        avg: avg.toFixed(1),
        current: currentEggs,
        dropPercent: dropPercent.toFixed(1)
      }
    }
    return null
  } catch (err) {
    console.error('Error checking egg deviation:', err.message)
    return null
  }
}

module.exports = {
  checkFeedDeviation,
  checkEggDeviation
}