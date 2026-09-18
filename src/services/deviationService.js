const supabase = require('../config/database')

/**
 * Check feed consumption deviation against the last 7 entries.
 *
 * @param {string} flockId - The flock to check
 * @param {number} currentConsumptionKg - The consumption just logged
 * @param {string} excludeRecordId - The ID of the record just saved (to exclude from history)
 * @returns {object|null} deviation object if anomaly detected, null otherwise
 */
async function checkFeedDeviation(flockId, currentConsumptionKg, excludeRecordId) {
  try {
    const { data: recentLogs, error } = await supabase
      .from('feed_consumption_logs')
      .select('id, quantity_kg, date')
      .eq('flock_id', flockId)
      .neq('id', excludeRecordId)
      .order('created_at', { ascending: false })
      .limit(7)

    if (error) {
      console.error('Feed deviation DB error:', error.message)
      return null
    }

    if (!recentLogs || recentLogs.length < 3) {
      console.log('Feed deviation: Not enough history to check (need at least 3 prior entries).')
      return null
    }

    const total = recentLogs.reduce((sum, l) => sum + parseFloat(l.quantity_kg), 0)
    const avg = total / recentLogs.length

    // Guard against division by zero or near-zero averages
    if (avg < 0.5) {
      console.log('Feed deviation: Average too low to derive meaningful signal.')
      return null
    }

    const dropPercent = ((avg - currentConsumptionKg) / avg) * 100
    const spikePercent = ((currentConsumptionKg - avg) / avg) * 100

    console.log(
      `Feed Deviation Check → Avg: ${avg.toFixed(1)}kg, ` +
      `Current: ${currentConsumptionKg}kg, ` +
      `Drop: ${dropPercent.toFixed(1)}%, ` +
      `Spike: ${spikePercent.toFixed(1)}%`
    )

    // Drop alert — 25% or more below average
    if (dropPercent >= 25) {
      return {
        type: 'FEED_DROP',
        avg: avg.toFixed(1),
        current: currentConsumptionKg,
        dropPercent: dropPercent.toFixed(1),
        direction: 'down'
      }
    }

    // Spike alert — 40% or more above average
    // (spikes are less common but can indicate water supply issues
    //  causing overconsumption, or a logging error worth flagging)
    if (spikePercent >= 40) {
      return {
        type: 'FEED_SPIKE',
        avg: avg.toFixed(1),
        current: currentConsumptionKg,
        spikePercent: spikePercent.toFixed(1),
        direction: 'up'
      }
    }

    return null
  } catch (err) {
    console.error('Unexpected error in checkFeedDeviation:', err.message)
    return null
  }
}

/**
 * Check egg production deviation against the last 7 entries.
 *
 * @param {string} flockId - The flock to check
 * @param {number} currentEggs - The egg count just logged
 * @param {string} excludeRecordId - The ID of the record just saved (to exclude from history)
 * @returns {object|null} deviation object if anomaly detected, null otherwise
 */
async function checkEggDeviation(flockId, currentEggs, excludeRecordId) {
  try {
    const { data: recentLogs, error } = await supabase
      .from('egg_production_logs')
      .select('id, eggs_collected, date')
      .eq('flock_id', flockId)
      .neq('id', excludeRecordId)
      .order('created_at', { ascending: false })
      .limit(7)

    if (error) {
      console.error('Egg deviation DB error:', error.message)
      return null
    }

    if (!recentLogs || recentLogs.length < 3) {
      console.log('Egg deviation: Not enough history to check (need at least 3 prior entries).')
      return null
    }

    const total = recentLogs.reduce((sum, l) => sum + parseInt(l.eggs_collected), 0)
    const avg = total / recentLogs.length

    // Guard against near-zero averages (very early layer flocks)
    if (avg < 5) {
      console.log('Egg deviation: Average too low to derive meaningful signal.')
      return null
    }

    const dropPercent = ((avg - currentEggs) / avg) * 100
    const spikePercent = ((currentEggs - avg) / avg) * 100

    console.log(
      `Egg Deviation Check → Avg: ${avg.toFixed(1)}, ` +
      `Current: ${currentEggs}, ` +
      `Drop: ${dropPercent.toFixed(1)}%, ` +
      `Spike: ${spikePercent.toFixed(1)}%`
    )

    // Drop alert — 25% or more below average
    // (raised from 20% to reduce false positives on natural day-to-day variance)
    if (dropPercent >= 25) {
      return {
        type: 'EGG_DROP',
        avg: avg.toFixed(1),
        current: currentEggs,
        dropPercent: dropPercent.toFixed(1),
        direction: 'down'
      }
    }

    // Spike alert — 30% or more above average
    // (sudden spike in egg count can indicate a missed previous day's collection)
    if (spikePercent >= 30) {
      return {
        type: 'EGG_SPIKE',
        avg: avg.toFixed(1),
        current: currentEggs,
        spikePercent: spikePercent.toFixed(1),
        direction: 'up'
      }
    }

    return null
  } catch (err) {
    console.error('Unexpected error in checkEggDeviation:', err.message)
    return null
  }
}

module.exports = {
  checkFeedDeviation,
  checkEggDeviation
}