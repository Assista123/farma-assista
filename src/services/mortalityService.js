const supabase = require('../config/database')

// Log a mortality event
async function logMortality(data) {
  try {
    const { data: mortality, error } = await supabase
      .from('mortality_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        count: data.count,
        bird_age_days: data.bird_age_days,
        age_category: data.age_category,
        suspected_cause: data.suspected_cause,
        custom_cause: data.custom_cause || null,
        bird_count_before_event: data.bird_count_before_event,
        cost_per_bird_at_death: data.cost_per_bird_at_death,
        actual_loss_naira: data.actual_loss_naira
      }])
      .select()
      .single()

    if (error) throw error

    return mortality
  } catch (err) {
    console.error('Error logging mortality:', err.message)
    return null
  }
}

// Get mortality summary for a flock
async function getMortalitySummary(flockId) {
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
        by_age_category: {},
        by_cause: {},
        recent_events: []
      }
    }

    const totalDeaths = data.reduce((sum, m) => sum + m.count, 0)
    const totalLoss = data.reduce(
      (sum, m) => sum + parseFloat(m.actual_loss_naira || 0), 0
    )

    // Group by age category
    const byAgeCategory = {}
    data.forEach(m => {
      const cat = m.age_category || 'UNKNOWN'
      byAgeCategory[cat] = (byAgeCategory[cat] || 0) + m.count
    })

    // Group by cause
    const byCause = {}
    data.forEach(m => {
      const cause = m.suspected_cause || 'UNKNOWN'
      byCause[cause] = (byCause[cause] || 0) + m.count
    })

    return {
      total_deaths: totalDeaths,
      total_loss_naira: totalLoss,
      by_age_category: byAgeCategory,
      by_cause: byCause,
      recent_events: data.slice(0, 5)
    }
  } catch (err) {
    console.error('Error getting mortality summary:', err.message)
    return null
  }
}

// Get total expenses for a flock up to a specific date
async function getTotalExpensesToDate(flockId, toDate) {
  try {
    const { data: feedCost, error: feedError } = await supabase
      .from('feed_purchases')
      .select('cost_naira')
      .eq('flock_id', flockId)
      .lte('date', toDate)

    if (feedError) throw feedError

    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('amount_naira')
      .eq('flock_id', flockId)
      .lte('date', toDate)

    if (expError) throw expError

    const { data: consumables, error: conError } = await supabase
      .from('consumable_usage_logs')
      .select('cost_naira')
      .eq('flock_id', flockId)
      .lte('date', toDate)

    if (conError) throw conError

    const feedTotal = (feedCost || []).reduce(
      (sum, f) => sum + parseFloat(f.cost_naira || 0), 0
    )
    const expTotal = (expenses || []).reduce(
      (sum, e) => sum + parseFloat(e.amount_naira || 0), 0
    )
    const conTotal = (consumables || []).reduce(
      (sum, c) => sum + parseFloat(c.cost_naira || 0), 0
    )

    return feedTotal + expTotal + conTotal
  } catch (err) {
    console.error('Error getting total expenses:', err.message)
    return 0
  }
}

module.exports = {
  logMortality,
  getMortalitySummary,
  getTotalExpensesToDate
}