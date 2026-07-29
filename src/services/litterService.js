const supabase = require('../config/database')

// Log litter condition
async function logLitterCondition(data) {
  try {
    const { data: log, error } = await supabase
      .from('litter_condition_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        moisture_level: data.moisture_level,
        caking: data.caking,
        odour_level: data.odour_level,
        sawdust_added: data.sawdust_added,
        notes: data.notes || null
      }])
      .select()
      .single()

    if (error) throw error

    return log
  } catch (err) {
    console.error('Error logging litter condition:', err.message)
    return null
  }
}

// Get recent litter logs for a flock
async function getRecentLitterLogs(flockId, days = 7) {
  try {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    const fromDateStr = fromDate.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('litter_condition_logs')
      .select('*')
      .eq('flock_id', flockId)
      .gte('date', fromDateStr)
      .order('date', { ascending: false })

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting litter logs:', err.message)
    return []
  }
}

// Check for consecutive wet litter days
async function checkConsecutiveWetLitter(flockId) {
  try {
    const { data, error } = await supabase
      .from('litter_condition_logs')
      .select('date, moisture_level')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(5)

    if (error) throw error
    if (!data || data.length < 3) return 0

    let consecutiveWetDays = 0
    for (const log of data) {
      if (log.moisture_level === 'WET' || log.moisture_level === 'VERY_WET') {
        consecutiveWetDays++
      } else {
        break
      }
    }

    return consecutiveWetDays
  } catch (err) {
    console.error('Error checking wet litter:', err.message)
    return 0
  }
}

module.exports = {
  logLitterCondition,
  getRecentLitterLogs,
  checkConsecutiveWetLitter
}