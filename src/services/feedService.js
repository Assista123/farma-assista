const supabase = require('../config/database')

// Log feed purchase
async function logFeedPurchase(data) {
  try {
    const { data: purchase, error } = await supabase
      .from('feed_purchases')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        feed_type: data.feed_type,
        quantity_kg: data.quantity_kg,
        cost_naira: data.cost_naira
      }])
      .select()
      .single()

    if (error) throw error

    return purchase
  } catch (err) {
    console.error('Error logging feed purchase:', err.message)
    return null
  }
}

// Log feed consumption
async function logFeedConsumption(data) {
  try {
    const { data: consumption, error } = await supabase
      .from('feed_consumption_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        feed_type: data.feed_type,
        quantity_kg: data.quantity_kg
      }])
      .select()
      .single()

    if (error) throw error

    return consumption
  } catch (err) {
    console.error('Error logging feed consumption:', err.message)
    return null
  }
}

// Get feed summary for a flock
async function getFeedSummary(flockId) {
  try {
    // Total purchased
    const { data: purchases, error: purchaseError } = await supabase
      .from('feed_purchases')
      .select('quantity_kg, cost_naira')
      .eq('flock_id', flockId)

    if (purchaseError) throw purchaseError

    // Total consumed
    const { data: consumption, error: consumptionError } = await supabase
      .from('feed_consumption_logs')
      .select('quantity_kg')
      .eq('flock_id', flockId)

    if (consumptionError) throw consumptionError

    const totalPurchasedKg = purchases.reduce(
      (sum, p) => sum + parseFloat(p.quantity_kg), 0
    )
    const totalCostNaira = purchases.reduce(
      (sum, p) => sum + parseFloat(p.cost_naira), 0
    )
    const totalConsumedKg = consumption.reduce(
      (sum, c) => sum + parseFloat(c.quantity_kg), 0
    )
    const currentStockKg = totalPurchasedKg - totalConsumedKg

    return {
      total_purchased_kg: totalPurchasedKg,
      total_consumed_kg: totalConsumedKg,
      current_stock_kg: currentStockKg,
      total_cost_naira: totalCostNaira
    }

  } catch (err) {
    console.error('Error getting feed summary:', err.message)
    return null
  }
}

// Get daily usage rate (7 day average)
async function getDailyUsageRate(flockId) {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('feed_consumption_logs')
      .select('quantity_kg')
      .eq('flock_id', flockId)
      .gte('date', sevenDaysAgoStr)

    if (error) throw error

    if (!data || data.length === 0) return 0

    const totalLast7Days = data.reduce(
      (sum, c) => sum + parseFloat(c.quantity_kg), 0
    )

    return totalLast7Days / 7
  } catch (err) {
    console.error('Error getting daily usage rate:', err.message)
    return 0
  }
}

module.exports = {
  logFeedPurchase,
  logFeedConsumption,
  getFeedSummary,
  getDailyUsageRate
}