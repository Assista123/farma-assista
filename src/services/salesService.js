const supabase = require('../config/database')

// Log bird sale
async function logBirdSale(data) {
  try {
    const { data: sale, error } = await supabase
      .from('bird_sales_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        bird_count: data.bird_count,
        unit_price_naira: data.unit_price_naira,
        total_amount_naira: data.total_amount_naira,
        buyer_name: data.buyer_name || null
      }])
      .select()
      .single()

    if (error) throw error

    return sale
  } catch (err) {
    console.error('Error logging bird sale:', err.message)
    return null
  }
}

// Log egg sale
async function logEggSale(data) {
  try {
    const { data: sale, error } = await supabase
      .from('egg_sales_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        egg_count: data.egg_count,
        unit_price_naira: data.unit_price_naira,
        total_amount_naira: data.total_amount_naira,
        buyer_name: data.buyer_name || null
      }])
      .select()
      .single()

    if (error) throw error

    return sale
  } catch (err) {
    console.error('Error logging egg sale:', err.message)
    return null
  }
}

// Get sales summary for a flock
async function getSalesSummary(flockId) {
  try {
    const { data: birdSales, error: birdError } = await supabase
      .from('bird_sales_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })

    if (birdError) throw birdError

    const { data: eggSales, error: eggError } = await supabase
      .from('egg_sales_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })

    if (eggError) throw eggError

    const totalBirdRevenue = (birdSales || []).reduce(
      (sum, s) => sum + parseFloat(s.total_amount_naira || 0), 0
    )
    const totalEggRevenue = (eggSales || []).reduce(
      (sum, s) => sum + parseFloat(s.total_amount_naira || 0), 0
    )
    const totalBirdsSold = (birdSales || []).reduce(
      (sum, s) => sum + parseInt(s.bird_count || 0), 0
    )
    const totalEggsSold = (eggSales || []).reduce(
      (sum, s) => sum + parseInt(s.egg_count || 0), 0
    )

    return {
      total_bird_revenue: totalBirdRevenue,
      total_egg_revenue: totalEggRevenue,
      total_revenue: totalBirdRevenue + totalEggRevenue,
      total_birds_sold: totalBirdsSold,
      total_eggs_sold: totalEggsSold,
      bird_sales: birdSales || [],
      egg_sales: eggSales || []
    }
  } catch (err) {
    console.error('Error getting sales summary:', err.message)
    return null
  }
}

module.exports = {
  logBirdSale,
  logEggSale,
  getSalesSummary
}