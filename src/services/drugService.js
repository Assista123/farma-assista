const supabase = require('../config/database')

// Log drug administration
async function logDrug(data) {
  try {
    // Calculate withdrawal end date
    let withdrawalEndDate = null
    if (data.withdrawal_period_days) {
      const endDate = new Date(data.date)
      endDate.setDate(endDate.getDate() + data.withdrawal_period_days)
      withdrawalEndDate = endDate.toISOString().split('T')[0]
    }

    const { data: log, error } = await supabase
      .from('drug_logs')
      .insert([{
        flock_id: data.flock_id,
        stock_id: data.stock_id || null,
        date: data.date,
        drug_name: data.drug_name,
        condition_treated: data.condition_treated || null,
        dosage_given: data.dosage_given || null,
        withdrawal_period_days: data.withdrawal_period_days || null,
        withdrawal_end_date: withdrawalEndDate,
        quantity_used: data.quantity_used || null,
        unit: data.unit || null,
        cost_naira: data.cost_naira || null,
        notes: data.notes || null
      }])
      .select()
      .single()

    if (error) throw error

    return log
  } catch (err) {
    console.error('Error logging drug:', err.message)
    return null
  }
}

// Get active withdrawal periods for a flock
async function getActiveWithdrawals(flockId) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('drug_logs')
      .select('*')
      .eq('flock_id', flockId)
      .gte('withdrawal_end_date', today)
      .order('withdrawal_end_date', { ascending: true })

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting withdrawals:', err.message)
    return []
  }
}

// Get drug history for a flock
async function getDrugHistory(flockId) {
  try {
    const { data, error } = await supabase
      .from('drug_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(10)

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting drug history:', err.message)
    return []
  }
}

module.exports = {
  logDrug,
  getActiveWithdrawals,
  getDrugHistory
}