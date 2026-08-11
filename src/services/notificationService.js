const supabase = require('../config/database')
const { getActiveFlocks, getBirdAgeDays } = require('./flockService')
const { getFeedSummary, getDailyUsageRate } = require('./feedService')
const { getUpcomingVaccinations } = require('./vaccinationService')
const { checkConsecutiveWetLitter } = require('./litterService')
const { getActiveWithdrawals } = require('./drugService')

// Log a notification to the database
async function logNotification(farmerId, type, subtype, message) {
  try {
    const { error } = await supabase
      .from('notification_logs')
      .insert([{
        farmer_id: farmerId,
        type,
        subtype,
        message_content: message,
        sent_at: new Date().toISOString(),
        delivered: true,
        read: false,
        farmer_responded: false
      }])

    if (error) throw error
  } catch (err) {
    console.error('Error logging notification:', err.message)
  }
}

// Get notification preferences for a farmer
async function getPreferences(farmerId) {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('farmer_id', farmerId)
      .single()

    if (error && error.code === 'PGRST116') {
      // No preferences set — return defaults
      return {
        daily_checkin: true,
        stock_alerts: true,
        health_alerts: true,
        performance_alerts: true,
        preferred_time: '06:00:00'
      }
    }

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error getting preferences:', err.message)
    return null
  }
}

// Get all active farmers
async function getActiveFarmers() {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .select('*')
      .eq('is_active', true)

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error getting active farmers:', err.message)
    return []
  }
}

// Build daily check-in message for a farmer
async function buildDailyCheckin(farmer) {
  try {
    const { data: flocks, error } = await supabase
      .from('flocks')
      .select('*')
      .eq('farmer_id', farmer.id)
      .eq('is_active', true)
      .gt('current_bird_count', 0)

    if (error || !flocks || flocks.length === 0) {
      return `Good morning ${farmer.name}! 🌅\n\nWelcome to Farma Assista. Add your first flock to start tracking.`
    }

    let message = `Good morning ${farmer.name}! 🌅\n\n`

    // Check upcoming vaccinations for ALL flocks
    let vaccinationAlerts = []
    for (const flock of flocks) {
      const upcoming = await getUpcomingVaccinations(flock.id)
      const dueToday = upcoming.filter(v => {
        const daysUntil = Math.ceil(
          (new Date(v.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24)
        )
        return daysUntil <= 1
      })

      for (const vacc of dueToday) {
        vaccinationAlerts.push(
          `• ${flock.flock_name}: ${vacc.vaccination_schedules?.vaccine_name}`
        )
      }
    }

    if (vaccinationAlerts.length > 0) {
      message += `💉 Vaccination due today:\n${vaccinationAlerts.join('\n')}\n\n`
    }

    // Check low stock for ALL flocks
    let stockAlerts = []
    for (const flock of flocks) {
      const feedSummary = await getFeedSummary(flock.id)
      const dailyRate = await getDailyUsageRate(flock.id)

      if (feedSummary && dailyRate > 0) {
        const daysRemaining = Math.floor(feedSummary.current_stock_kg / dailyRate)
        if (daysRemaining <= 3) {
          stockAlerts.push(
            `• ${flock.flock_name}: ~${daysRemaining} days of feed remaining`
          )
        }
      }
    }

    if (stockAlerts.length > 0) {
      message += `📦 Low stock alert:\n${stockAlerts.join('\n')}\n\n`
    }

    // Check withdrawal periods for ALL flocks
    let withdrawalAlerts = []
    for (const flock of flocks) {
      const withdrawals = await getActiveWithdrawals(flock.id)
      const today = new Date().toISOString().split('T')[0]
      for (const w of withdrawals) {
        if (w.withdrawal_end_date === today) {
          withdrawalAlerts.push(
            `• ${flock.flock_name}: ${w.drug_name} withdrawal ends today — safe to sell!`
          )
        }
      }
    }

    if (withdrawalAlerts.length > 0) {
      message += `✅ Withdrawal periods ending today:\n${withdrawalAlerts.join('\n')}\n\n`
    }

    // Summary for ALL flocks
    message += `Your flocks today:\n`
    for (const flock of flocks) {
      const ageDays = getBirdAgeDays(flock.start_date)
      message += `• ${flock.flock_name} — ${ageDays} days old, ${flock.current_bird_count} birds\n`
    }

    message += `\nReady to log today's feed? 🌾`

    return message
  } catch (err) {
    console.error('Error building daily checkin:', err.message)
    return null
  }
}

// Check for alerts that need to be sent
async function checkAlerts(farmer, bot) {
  try {
    const { data: flocks, error } = await supabase
      .from('flocks')
      .select('*')
      .eq('farmer_id', farmer.id)
      .eq('is_active', true)

    if (error || !flocks || flocks.length === 0) return

    for (const flock of flocks) {
      // Check wet litter alert
      const wetDays = await checkConsecutiveWetLitter(flock.id)
      if (wetDays >= 3) {
        const message =
          `⚠️ Wet Litter Alert — ${flock.flock_name}\n\n` +
          `Your litter has been wet for ${wetDays} consecutive days.\n\n` +
          `This significantly increases risk of:\n` +
          `• Coccidiosis\n` +
          `• Respiratory disease\n\n` +
          `Please change litter and improve ventilation immediately.`

        await bot.api.sendMessage(farmer.phone_number, message)
        await logNotification(farmer.id, 'ALERT', 'WET_LITTER', message)
      }

      // Check upcoming vaccinations
      const upcoming = await getUpcomingVaccinations(flock.id)
      const dueTomorrow = upcoming.filter(v => {
        const daysUntil = Math.ceil(
          (new Date(v.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24)
        )
        return daysUntil === 1
      })

      for (const vacc of dueTomorrow) {
        const schedule = vacc.vaccination_schedules
        const message =
          `💉 Vaccination Reminder — ${flock.flock_name}\n\n` +
          `Tomorrow is the recommended day for:\n` +
          `${schedule.vaccine_name}\n\n` +
          `How to give it: ${schedule.plain_instructions}\n\n` +
          `Importance: ${schedule.importance}`

        await bot.api.sendMessage(farmer.phone_number, message)
        await logNotification(farmer.id, 'ALERT', 'VACCINATION_REMINDER', message)
      }
    }
  } catch (err) {
    console.error('Error checking alerts:', err.message)
  }
}

// Send daily check-in to all farmers
async function sendDailyCheckins(bot) {
  console.log('Sending daily check-ins...')
  const farmers = await getActiveFarmers()

  for (const farmer of farmers) {
    try {
      const prefs = await getPreferences(farmer.id)
      if (!prefs || !prefs.daily_checkin) continue

      const message = await buildDailyCheckin(farmer)
      if (!message) continue

      await bot.api.sendMessage(farmer.phone_number, message)
      await logNotification(farmer.id, 'DAILY_CHECKIN', null, message)

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Error sending checkin to ${farmer.phone_number}:`, err.message)
    }
  }

  console.log(`Daily check-ins sent to ${farmers.length} farmers`)
}

// Run threshold checks for all farmers
async function runThresholdChecks(bot) {
  console.log('Running threshold checks...')
  const farmers = await getActiveFarmers()

  for (const farmer of farmers) {
    try {
      const prefs = await getPreferences(farmer.id)
      if (!prefs || !prefs.health_alerts) continue

      await checkAlerts(farmer, bot)

      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Error checking alerts for ${farmer.phone_number}:`, err.message)
    }
  }
}

// Send diagnosis follow-up messages
async function sendDiagnosisFollowups(bot) {
  try {
    const { getPendingFollowups } = require('./healthService')
    const followups = await getPendingFollowups()

    for (const followup of followups) {
      const farmer = followup.flocks?.farmers
      if (!farmer) continue

      const message =
        `👋 Health Follow-up — ${followup.flocks.flock_name}\n\n` +
        `A week ago we flagged possible ${followup.diagnosis_result} in your flock.\n\n` +
        `How are your birds doing now?`

      await bot.api.sendMessage(farmer.phone_number, message, {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Much better' }, { text: '🟡 Still the same' }],
            [{ text: '⚠️ Getting worse' }, { text: '💀 Lost more birds' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      })

      await logNotification(farmer.id, 'FOLLOWUP', 'HEALTH_DIAGNOSIS_FOLLOWUP', message)

      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } catch (err) {
    console.error('Error sending diagnosis followups:', err.message)
  }
}

module.exports = {
  sendDailyCheckins,
  runThresholdChecks,
  logNotification,
  buildDailyCheckin,
  sendDiagnosisFollowups,
  getActiveFarmers
}