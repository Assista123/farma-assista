const supabase = require('../config/database')

// Calculate FCR for a broiler flock
async function calculateBroilerFCR(flockId, startDate) {
  try {
    // Total feed consumed
    const { data: consumption, error: conError } = await supabase
      .from('feed_consumption_logs')
      .select('quantity_kg')
      .eq('flock_id', flockId)

    if (conError) throw conError

    const totalFeedKg = (consumption || []).reduce(
      (sum, c) => sum + parseFloat(c.quantity_kg || 0), 0
    )

    if (totalFeedKg === 0) return null

    // Latest average weight
    const { data: weights, error: weightError } = await supabase
      .from('weight_logs')
      .select('average_weight_kg, bird_age_days')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (weightError || !weights) return null

    // Get flock current bird count
    const { data: flock, error: flockError } = await supabase
      .from('flocks')
      .select('current_bird_count, initial_bird_count')
      .eq('id', flockId)
      .single()

    if (flockError) throw flockError

    const initialWeightKg = 0.04 // 40g day old chick
    const currentAvgWeight = parseFloat(weights.average_weight_kg)
    const weightGained = (currentAvgWeight - initialWeightKg) * flock.current_bird_count

    if (weightGained <= 0) return null

    const fcr = totalFeedKg / weightGained

    return {
      fcr: parseFloat(fcr.toFixed(2)),
      total_feed_kg: totalFeedKg,
      current_avg_weight_kg: currentAvgWeight,
      weight_gained_kg: parseFloat(weightGained.toFixed(2)),
      bird_age_days: weights.bird_age_days
    }
  } catch (err) {
    console.error('Error calculating broiler FCR:', err.message)
    return null
  }
}

// Calculate FCR for a layer flock
async function calculateLayerFCR(flockId) {
  try {
    const { data: consumption, error: conError } = await supabase
      .from('feed_consumption_logs')
      .select('quantity_kg')
      .eq('flock_id', flockId)

    if (conError) throw conError

    const totalFeedKg = (consumption || []).reduce(
      (sum, c) => sum + parseFloat(c.quantity_kg || 0), 0
    )

    if (totalFeedKg === 0) return null

    const { data: production, error: prodError } = await supabase
      .from('egg_production_logs')
      .select('eggs_collected')
      .eq('flock_id', flockId)

    if (prodError) throw prodError

    const totalEggs = (production || []).reduce(
      (sum, p) => sum + parseInt(p.eggs_collected || 0), 0
    )

    if (totalEggs === 0) return null

    const fcr = (totalFeedKg / totalEggs) * 10

    return {
      fcr: parseFloat(fcr.toFixed(2)),
      total_feed_kg: totalFeedKg,
      total_eggs: totalEggs
    }
  } catch (err) {
    console.error('Error calculating layer FCR:', err.message)
    return null
  }
}

// Calculate profitability for a flock
async function calculateProfitability(flockId, farmerId) {
  try {
    // Revenue — bird sales
    const { data: birdSales, error: birdError } = await supabase
      .from('bird_sales_logs')
      .select('total_amount_naira')
      .eq('flock_id', flockId)

    if (birdError) throw birdError

    // Revenue — egg sales
    const { data: eggSales, error: eggError } = await supabase
      .from('egg_sales_logs')
      .select('total_amount_naira')
      .eq('flock_id', flockId)

    if (eggError) throw eggError

    // Feed cost
    const { data: feedPurchases, error: feedError } = await supabase
      .from('feed_purchases')
      .select('cost_naira')
      .eq('flock_id', flockId)

    if (feedError) throw feedError

    // Direct expenses
    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('amount_naira, total_farm_birds')
      .eq('flock_id', flockId)

    if (expError) throw expError

    // Farm-wide expenses — need to allocate proportionally
    const { data: farmExpenses, error: farmExpError } = await supabase
      .from('expenses')
      .select('amount_naira, total_farm_birds')
      .eq('farmer_id', farmerId)
      .is('flock_id', null)

    if (farmExpError) throw farmExpError

    // Get flock bird count for allocation
    const { data: flock, error: flockError } = await supabase
      .from('flocks')
      .select('current_bird_count, initial_bird_count')
      .eq('id', flockId)
      .single()

    if (flockError) throw flockError

    // Consumable usage costs
    const { data: consumables, error: conError } = await supabase
      .from('consumable_usage_logs')
      .select('cost_naira')
      .eq('flock_id', flockId)

    if (conError) throw conError

    // Drug costs
    const { data: drugs, error: drugError } = await supabase
      .from('drug_logs')
      .select('cost_naira')
      .eq('flock_id', flockId)

    if (drugError) throw drugError

    // Calculate totals
    const birdRevenue = (birdSales || []).reduce(
      (sum, s) => sum + parseFloat(s.total_amount_naira || 0), 0
    )
    const eggRevenue = (eggSales || []).reduce(
      (sum, s) => sum + parseFloat(s.total_amount_naira || 0), 0
    )
    const feedCost = (feedPurchases || []).reduce(
      (sum, f) => sum + parseFloat(f.cost_naira || 0), 0
    )
    const directExpenses = (expenses || []).reduce(
      (sum, e) => sum + parseFloat(e.amount_naira || 0), 0
    )
    const consumableCost = (consumables || []).reduce(
      (sum, c) => sum + parseFloat(c.cost_naira || 0), 0
    )
    const drugCost = (drugs || []).reduce(
      (sum, d) => sum + parseFloat(d.cost_naira || 0), 0
    )

    // Proportional farm-wide expense allocation
    let allocatedFarmExpenses = 0
    for (const exp of (farmExpenses || [])) {
      if (exp.total_farm_birds && exp.total_farm_birds > 0) {
        const ratio = flock.current_bird_count / exp.total_farm_birds
        allocatedFarmExpenses += parseFloat(exp.amount_naira || 0) * ratio
      }
    }

    const totalRevenue = birdRevenue + eggRevenue
    const totalExpenses = feedCost + directExpenses + consumableCost +
      drugCost + allocatedFarmExpenses
    const profitLoss = totalRevenue - totalExpenses

    return {
      revenue: {
        bird_sales: birdRevenue,
        egg_sales: eggRevenue,
        total: totalRevenue
      },
      expenses: {
        feed: feedCost,
        drugs: drugCost,
        consumables: consumableCost,
        direct: directExpenses,
        allocated_farm: parseFloat(allocatedFarmExpenses.toFixed(2)),
        total: parseFloat(totalExpenses.toFixed(2))
      },
      profit_loss: parseFloat(profitLoss.toFixed(2)),
      is_profit: profitLoss >= 0
    }
  } catch (err) {
    console.error('Error calculating profitability:', err.message)
    return null
  }
}

// Get mortality summary for a flock
async function getMortalityReport(flockId) {
  try {
    const { data, error } = await supabase
      .from('mortality_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })

    if (error) throw error

    if (!data || data.length === 0) {
      return {
        total_deaths: 0,
        total_loss_naira: 0,
        by_cause: {},
        by_age_category: {}
      }
    }

    const totalDeaths = data.reduce((sum, m) => sum + parseInt(m.count || 0), 0)
    const totalLoss = data.reduce(
      (sum, m) => sum + parseFloat(m.actual_loss_naira || 0), 0
    )

    const byCause = {}
    const byAgeCategory = {}

    data.forEach(m => {
      const cause = m.custom_cause || m.suspected_cause || 'UNKNOWN'
      byCause[cause] = (byCause[cause] || 0) + parseInt(m.count || 0)

      const cat = m.age_category || 'UNKNOWN'
      byAgeCategory[cat] = (byAgeCategory[cat] || 0) + parseInt(m.count || 0)
    })

    return {
      total_deaths: totalDeaths,
      total_loss_naira: parseFloat(totalLoss.toFixed(2)),
      by_cause: byCause,
      by_age_category: byAgeCategory,
      recent_events: data.slice(0, 5)
    }
  } catch (err) {
    console.error('Error getting mortality report:', err.message)
    return null
  }
}

module.exports = {
  calculateBroilerFCR,
  calculateLayerFCR,
  calculateProfitability,
  getMortalityReport
}