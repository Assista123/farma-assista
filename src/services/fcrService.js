const supabase = require('../config/database')
const { getFeedSummary } = require('./feedService')
const { getFlockById } = require('./flockService')

async function calculateFlockFCR(flockId) {
  try {
    // 1. Get flock details to know current bird count and initial data
    const flock = await getFlockById(flockId)
    if (!flock || !flock.is_active) return null

    // 2. Get total feed consumed using existing feedService
    const feedSummary = await getFeedSummary(flockId)
    const totalConsumedKg = feedSummary ? feedSummary.total_consumed_kg : 0

    if (totalConsumedKg <= 0) {
      return { fcr: null, reason: 'NO_FEED_CONSUMED' }
    }

    // 3. Fetch the latest weight log for this flock to get current average weight
    const { data: weightLogs, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(1)

    if (error) throw error

    if (!weightLogs || weightLogs.length === 0) {
      return { fcr: null, reason: 'NO_WEIGHT_LOGS' }
    }

    const latestWeight = weightLogs[0]
    const avgWeightKg = parseFloat(latestWeight.average_weight_kg || 0)
    const currentBirdCount = flock.current_bird_count || flock.initial_bird_count

    // Estimated starting weight of a day-old chick is approx 0.04 kg (40g)
    const startingBirdWeightKg = 0.04 

    // Total Biomass = (Current Bird Count × Current Average Weight)
    const currentTotalBiomassKg = currentBirdCount * avgWeightKg
    
    // Initial Biomass = (Initial Bird Count × Starting Weight)
    const initialTotalBiomassKg = flock.initial_bird_count * startingBirdWeightKg

    // Total Weight Gain = Current Total Biomass - Initial Total Biomass
    const totalWeightGainKg = currentTotalBiomassKg - initialTotalBiomassKg

    if (totalWeightGainKg <= 0) {
      return { fcr: null, reason: 'INSUFFICIENT_WEIGHT_GAIN' }
    }

    // Calculate FCR
    const fcr = totalConsumedKg / totalWeightGainKg

    return {
      fcr: parseFloat(fcr.toFixed(2)),
      total_consumed_kg: totalConsumedKg,
      total_weight_gain_kg: parseFloat(totalWeightGainKg.toFixed(2)),
      avg_weight_kg: avgWeightKg,
      current_bird_count: currentBirdCount
    }

  } catch (err) {
    console.error('Error calculating FCR:', err.message)
    return null
  }
}

module.exports = {
  calculateFlockFCR
}