const supabase = require('../config/database')

// Generate vaccination schedule for a new flock
async function generateVaccinationSchedule(flockId, flockType, startDate) {
  try {
    // Get all relevant vaccines for this flock type
    const { data: schedules, error } = await supabase
      .from('vaccination_schedules')
      .select('*')
      .in('flock_type', [flockType, 'BOTH'])
      .order('recommended_age_days', { ascending: true })

    if (error) throw error

    if (!schedules || schedules.length === 0) {
      console.log('No vaccination schedules found for flock type:', flockType)
      return []
    }

    // Generate a vaccination log entry for each vaccine
    const start = new Date(startDate)
    const vaccinationLogs = schedules.map(schedule => {
      const scheduledDate = new Date(start)
      scheduledDate.setDate(
        scheduledDate.getDate() + schedule.recommended_age_days
      )

      return {
        flock_id: flockId,
        vaccination_schedule_id: schedule.id,
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        administered: false,
        skipped: false
      }
    })

    // Save all vaccination logs at once
    const { data: logs, error: logError } = await supabase
      .from('vaccination_logs')
      .insert(vaccinationLogs)
      .select()

    if (logError) throw logError

    console.log(`Generated ${logs.length} vaccination reminders for flock`)
    return logs

  } catch (err) {
    console.error('Error generating vaccination schedule:', err.message)
    return []
  }
}

// Get upcoming vaccinations for a flock
async function getUpcomingVaccinations(flockId) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('vaccination_logs')
      .select(`
        *,
        vaccination_schedules (
          vaccine_name,
          disease_protected,
          administration_method,
          plain_instructions,
          importance
        )
      `)
      .eq('flock_id', flockId)
      .eq('administered', false)
      .eq('skipped', false)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(3)

    if (error) throw error

    return data || []
  } catch (err) {
    console.error('Error getting upcoming vaccinations:', err.message)
    return []
  }
}

// Mark vaccination as administered
async function markAdministered(vaccinationLogId) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('vaccination_logs')
      .update({
        administered: true,
        administered_date: today
      })
      .eq('id', vaccinationLogId)
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error marking vaccination:', err.message)
    return null
  }
}

// Mark vaccination as skipped
async function markSkipped(vaccinationLogId, skipReason) {
  try {
    const { data, error } = await supabase
      .from('vaccination_logs')
      .update({
        skipped: true,
        skip_reason: skipReason || null
      })
      .eq('id', vaccinationLogId)
      .select()
      .single()

    if (error) throw error

    return data
  } catch (err) {
    console.error('Error skipping vaccination:', err.message)
    return null
  }
}

module.exports = {
  generateVaccinationSchedule,
  getUpcomingVaccinations,
  markAdministered,
  markSkipped
}