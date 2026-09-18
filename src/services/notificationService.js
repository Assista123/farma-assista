const supabase = require('../config/database')
const { getActiveFlocks, getBirdAgeDays } = require('./flockService')
const { getFeedSummary, getDailyUsageRate } = require('./feedService')
const { getUpcomingVaccinations } = require('./vaccinationService')
const { checkConsecutiveWetLitter } = require('./litterService')
const { getActiveWithdrawals } = require('./drugService')

// ── 24-HOUR WINDOW CHECK ──────────────────────────────────────
async function isWithin24Hours(farmerId) {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .select('last_message_at')
      .eq('id', farmerId)
      .single()

    if (error || !data?.last_message_at) return false

    const hoursSince = (Date.now() - new Date(data.last_message_at)) / (1000 * 60 * 60)
    return hoursSince < 24
  } catch (err) {
    console.error('Error checking 24hr window:', err.message)
    return false
  }
}

// ── LOG NOTIFICATION ─────────────────────────────────────────
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

// ── GET PREFERENCES ──────────────────────────────────────────
async function getPreferences(farmerId) {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('farmer_id', farmerId)
      .single()

    if (error && error.code === 'PGRST116') {
      return {
        daily_checkin: true,
        stock_alerts: true,
        health_alerts: true,
        performance_alerts: true,
        preferred_time: '08:00:00'
      }
    }

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error getting preferences:', err.message)
    return null
  }
}

// ── GET ACTIVE FARMERS ───────────────────────────────────────
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

// ── BUILD DAILY CHECK-IN MESSAGE ─────────────────────────────
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

    // Vaccination alerts
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

    // Low stock alerts
    let stockAlerts = []
    for (const flock of flocks) {
      const feedSummary = await getFeedSummary(flock.id)
      const dailyRate = await getDailyUsageRate(flock.id)
      if (feedSummary && dailyRate > 0) {
        const daysRemaining = Math.floor(feedSummary.current_stock_kg / dailyRate)
        if (daysRemaining <= 3) {
          stockAlerts.push(`• ${flock.flock_name}: ~${daysRemaining} days of feed remaining`)
        }
      }
    }
    if (stockAlerts.length > 0) {
      message += `📦 Low stock alert:\n${stockAlerts.join('\n')}\n\n`
    }

    // Withdrawal period alerts
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

    // Flock summary
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

// ── CHECK ALERTS (VACCINATION + LITTER) ──────────────────────
async function checkAlerts(farmer, bot) {
  try {
    const { data: flocks, error } = await supabase
      .from('flocks')
      .select('*')
      .eq('farmer_id', farmer.id)
      .eq('is_active', true)
      .gt('current_bird_count', 0)

    if (error || !flocks || flocks.length === 0) return

    for (const flock of flocks) {
      // Wet litter alert
      const wetDays = await checkConsecutiveWetLitter(flock.id)
      if (wetDays >= 3) {
        const message =
          `⚠️ Wet Litter Alert — ${flock.flock_name}\n\n` +
          `Your litter has been wet for ${wetDays} consecutive days.\n\n` +
          `This significantly increases risk of Coccidiosis and Respiratory Disease.\n\n` +
          `Please change litter and improve ventilation immediately.`

        await bot.api.sendMessage(farmer.phone_number, message)
        await logNotification(farmer.id, 'ALERT', 'WET_LITTER', message)
      }

      // Vaccination due tomorrow
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

        // 👈 Attach inline quick-resolve button
        await bot.api.sendMessage(farmer.phone_number, message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Mark Done', callback_data: `vax_done_${vacc.id}` }]
            ]
          }
        })
        await logNotification(farmer.id, 'ALERT', 'VACCINATION_REMINDER', message)
      }
    }
  } catch (err) {
    console.error('Error checking alerts:', err.message)
  }
}

// ── SEND DAILY MORNING CHECK-IN ──────────────────────────────
async function sendDailyCheckins(bot) {
  console.log('Sending morning check-ins...')
  const farmers = await getActiveFarmers()

  for (const farmer of farmers) {
    try {
      const prefs = await getPreferences(farmer.id)
      if (!prefs || !prefs.daily_checkin) continue

      if (!await isWithin24Hours(farmer.id)) {
        console.log(`Skipping morning check-in for ${farmer.name} — outside 24hr window`)
        continue
      }

      const message = await buildDailyCheckin(farmer)
      if (!message) continue

      await bot.api.sendMessage(farmer.phone_number, message)
      await logNotification(farmer.id, 'DAILY_CHECKIN', 'MORNING', message)
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Morning check-in error for ${farmer.phone_number}:`, err.message)
    }
  }

  console.log(`Morning check-ins sent to ${farmers.length} farmers`)
}

// ── SEND AFTERNOON NUDGE (1PM) ───────────────────────────────
async function sendMiddayNudge(bot) {
  console.log('Sending afternoon nudge...')
  const farmers = await getActiveFarmers()
  const today = new Date().toISOString().split('T')[0]

  for (const farmer of farmers) {
    try {
      if (!await isWithin24Hours(farmer.id)) {
        console.log(`Skipping afternoon nudge for ${farmer.name} — outside 24hr window`)
        continue
      }

      // Check if farmer has logged anything today
      const { data: logs } = await supabase
        .from('feed_consumption_logs')
        .select('id')
        .eq('farmer_id', farmer.id)
        .gte('created_at', today)
        .limit(1)

      if (logs && logs.length > 0) continue

      const message =
        `👋 ${farmer.name}, afternoon check-in!\n\n` +
        `You haven't logged anything today yet.\n\n` +
        `Don't forget to log your feed and check on your birds. 🐔`

      await bot.api.sendMessage(farmer.phone_number, message)
      await logNotification(farmer.id, 'ALERT', 'AFTERNOON_NUDGE', message)
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Afternoon nudge error for ${farmer.phone_number}:`, err.message)
    }
  }
}

// ── SEND EVENING NUDGE (6PM) ─────────────────────────────────
async function sendEveningNudge(bot) {
  console.log('Sending evening nudge...')
  const farmers = await getActiveFarmers()
  const today = new Date().toISOString().split('T')[0]

  for (const farmer of farmers) {
    try {
      if (!await isWithin24Hours(farmer.id)) {
        console.log(`Skipping evening nudge for ${farmer.name} — outside 24hr window`)
        continue
      }

      const { data: logs } = await supabase
        .from('feed_consumption_logs')
        .select('id')
        .eq('farmer_id', farmer.id)
        .gte('created_at', today)
        .limit(1)

      if (logs && logs.length > 0) continue

      const message =
        `🌙 ${farmer.name}, evening check-in!\n\n` +
        `End your day right — log today's feed and any observations.\n\n` +
        `It only takes 2 minutes. 🐔`

      await bot.api.sendMessage(farmer.phone_number, message)
      await logNotification(farmer.id, 'ALERT', 'EVENING_NUDGE', message)
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Evening nudge error for ${farmer.phone_number}:`, err.message)
    }
  }
}

// ── SEND DIAGNOSIS FOLLOW-UPS ────────────────────────────────
async function sendDiagnosisFollowups(bot) {
  try {
    const { getPendingFollowups } = require('./healthService')
    const followups = await getPendingFollowups()

    for (const followup of followups) {
      const farmer = followup.flocks?.farmers
      if (!farmer) continue

      if (!await isWithin24Hours(farmer.id)) {
        console.log(`Skipping diagnosis followup for ${farmer.name} — outside 24hr window`)
        continue
      }

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

// ── THRESHOLD CHECKS ─────────────────────────────────────────
async function runThresholdChecks(bot) {
  console.log('Running threshold checks...')
  const farmers = await getActiveFarmers()

  for (const farmer of farmers) {
    try {
      const prefs = await getPreferences(farmer.id)
      if (!prefs || !prefs.health_alerts) continue

      if (!await isWithin24Hours(farmer.id)) {
        console.log(`Skipping threshold check for ${farmer.name} — outside 24hr window`)
        continue
      }

      await checkAlerts(farmer, bot)
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Threshold check error for ${farmer.phone_number}:`, err.message)
    }
  }
}

module.exports = {
  sendDailyCheckins,
  sendMiddayNudge,
  sendEveningNudge,
  runThresholdChecks,
  logNotification,
  buildDailyCheckin,
  sendDiagnosisFollowups,
  getActiveFarmers
}