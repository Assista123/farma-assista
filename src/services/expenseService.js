const supabase = require('../config/database')

// Log an expense
async function logExpense(data) {
  try {
    const { data: expense, error } = await supabase
      .from('expenses')
      .insert([{
        farmer_id: data.farmer_id,
        flock_id: data.flock_id || null,
        date: data.date,
        category: data.category,
        custom_category_name: data.custom_category_name || null,
        amount_naira: data.amount_naira,
        description: data.description || null,
        total_farm_birds: data.total_farm_birds || null
      }])
      .select()
      .single()

    if (error) throw error

    return expense
  } catch (err) {
    console.error('Error logging expense:', err.message)
    return null
  }
}

// Get expense summary for a flock or farm
async function getExpenseSummary(farmerId, flockId = null) {
  try {
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('farmer_id', farmerId)

    if (flockId) {
      query = query.eq('flock_id', flockId)
    }

    const { data, error } = await query.order('date', { ascending: false })

    if (error) throw error

    if (!data || data.length === 0) {
      return {
        total: 0,
        by_category: {},
        transactions: []
      }
    }

    const total = data.reduce(
      (sum, e) => sum + parseFloat(e.amount_naira || 0), 0
    )

    const byCategory = {}
    data.forEach(e => {
      const cat = e.category === 'CUSTOM'
        ? e.custom_category_name || 'Custom'
        : e.category
      byCategory[cat] = (byCategory[cat] || 0) + parseFloat(e.amount_naira || 0)
    })

    return {
      total,
      by_category: byCategory,
      transactions: data
    }
  } catch (err) {
    console.error('Error getting expense summary:', err.message)
    return null
  }
}

module.exports = {
  logExpense,
  getExpenseSummary
}