const cron = require('node-cron')
const {
  sendDailyCheckins,
  runThresholdChecks,
  sendDiagnosisFollowups
} = require('./services/notificationService')

function startScheduler(bot) {
  console.log('Scheduler started')

  // Daily check-in at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('Running daily check-ins...')
    try {
      await sendDailyCheckins(bot)
    } catch (err) {
      console.error('Daily checkin error:', err.message)
    }
  }, { timezone: 'Africa/Lagos' })

  // Midday nudge at 12:00 PM for farmers who haven't logged today
  cron.schedule('0 12 * * *', async () => {
    console.log('Running midday nudge...')
    try {
      await sendMiddayNudge(bot)
    } catch (err) {
      console.error('Midday nudge error:', err.message)
    }
  }, { timezone: 'Africa/Lagos' })

  // Diagnosis follow-ups at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running diagnosis follow-ups...')
    try {
      await sendDiagnosisFollowups(bot)
    } catch (err) {
      console.error('Diagnosis followup error:', err.message)
    }
  }, { timezone: 'Africa/Lagos' })

  // Threshold checks every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('Running threshold checks...')
    try {
      await runThresholdChecks(bot)
    } catch (err) {
      console.error('Threshold check error:', err.message)
    }
  }, { timezone: 'Africa/Lagos' })

  console.log('Scheduled jobs:')
  console.log('  Daily check-ins: 8:00 AM (Africa/Lagos)')
  console.log('  Midday nudge: 12:00 PM (Africa/Lagos)')
  console.log('  Diagnosis follow-ups: 9:00 AM (Africa/Lagos)')
  console.log('  Threshold checks: Every 30 minutes')
}

async function sendMiddayNudge(bot) {
  const { getActiveFarmers, logNotification } = require('./services/notificationService')
  const supabase = require('./config/database')
  const farmers = await getActiveFarmers()
  const today = new Date().toISOString().split('T')[0]

  for (const farmer of farmers) {
    try {
      // Check if farmer has logged anything today
      const { data: logs } = await supabase
        .from('feed_consumption_logs')
        .select('id')
        .eq('created_at', today)
        .limit(1)

      if (logs && logs.length > 0) continue // Already logged today

      const message =
        `👋 ${farmer.name}, just checking in!\n\n` +
        `You haven't logged anything today yet.\n\n` +
        `Don't forget to log your feed and check on your birds. 🐔`

      await bot.api.sendMessage(farmer.phone_number, message)
      await logNotification(farmer.id, 'ALERT', 'MIDDAY_NUDGE', message)

      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      console.error(`Midday nudge error for ${farmer.phone_number}:`, err.message)
    }
  }
}

module.exports = { startScheduler }