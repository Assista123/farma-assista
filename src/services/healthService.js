const supabase = require('../config/database')

// Save a diagnosis log
async function saveDiagnosisLog(data) {
  try {
    const { data: log, error } = await supabase
      .from('health_diagnosis_logs')
      .insert([{
        flock_id: data.flock_id,
        date: data.date,
        bird_age_days: data.bird_age_days,
        symptoms_reported: data.symptoms_reported,
        dropping_color: data.dropping_color,
        dropping_texture: data.dropping_texture,
        diagnosis_result: data.diagnosis_result,
        recommended_drugs: data.recommended_drugs,
        severity: data.severity,
        vet_escalated: data.vet_escalated,
        followup_date: data.followup_date,
        outcome: 'PENDING'
      }])
      .select()
      .single()

    if (error) throw error
    return log
  } catch (err) {
    console.error('Error saving diagnosis log:', err.message)
    return null
  }
}

// Get diagnosis history for a flock
async function getDiagnosisHistory(flockId) {
  try {
    const { data, error } = await supabase
      .from('health_diagnosis_logs')
      .select('*')
      .eq('flock_id', flockId)
      .order('date', { ascending: false })
      .limit(10)

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error getting diagnosis history:', err.message)
    return []
  }
}

// Update diagnosis outcome
async function updateDiagnosisOutcome(diagnosisId, outcome) {
  try {
    const { data, error } = await supabase
      .from('health_diagnosis_logs')
      .update({
        outcome,
        outcome_updated_at: new Date().toISOString()
      })
      .eq('id', diagnosisId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error updating diagnosis outcome:', err.message)
    return null
  }
}

// Get all conditions from database
async function getAllConditions() {
  try {
    const { data, error } = await supabase
      .from('conditions')
      .select('*')

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error getting conditions:', err.message)
    return []
  }
}

// Get pending follow-ups (diagnoses due for follow-up today)
async function getPendingFollowups() {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('health_diagnosis_logs')
      .select(`
        *,
        flocks (
          flock_name,
          farmer_id,
          farmers (
            phone_number,
            name
          )
        )
      `)
      .eq('followup_date', today)
      .eq('outcome', 'PENDING')

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error getting pending followups:', err.message)
    return []
  }
}

module.exports = {
  saveDiagnosisLog,
  getDiagnosisHistory,
  updateDiagnosisOutcome,
  getAllConditions,
  getPendingFollowups
}