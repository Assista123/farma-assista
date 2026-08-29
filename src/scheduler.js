const cron = require('node-cron')
const {
  sendDailyCheckins,
  sendMiddayNudge,
  sendEveningNudge,
  runThresholdChecks,
  sendDiagnosisFollowups
} = require('./services/notificationService')

function startScheduler(bot) {
  console.log('Scheduler started')

  // Morning check-in — 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    try { await sendDailyCheckins(bot) }
    catch (err) { console.error('Morning checkin error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  // Morning vaccination check — 8:30 AM
  cron.schedule('30 8 * * *', async () => {
    try { await runThresholdChecks(bot) }
    catch (err) { console.error('Morning threshold error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  // Diagnosis follow-ups — 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    try { await sendDiagnosisFollowups(bot) }
    catch (err) { console.error('Diagnosis followup error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  // Afternoon nudge — 1:00 PM
  cron.schedule('0 13 * * *', async () => {
    try { await sendMiddayNudge(bot) }
    catch (err) { console.error('Afternoon nudge error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  // Afternoon vaccination check — 1:30 PM
  cron.schedule('30 13 * * *', async () => {
    try { await runThresholdChecks(bot) }
    catch (err) { console.error('Afternoon threshold error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  // Evening nudge — 6:00 PM
  cron.schedule('0 18 * * *', async () => {
    try { await sendEveningNudge(bot) }
    catch (err) { console.error('Evening nudge error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  // Evening vaccination check — 6:30 PM
  cron.schedule('30 18 * * *', async () => {
    try { await runThresholdChecks(bot) }
    catch (err) { console.error('Evening threshold error:', err.message) }
  }, { timezone: 'Africa/Lagos' })

  console.log('Scheduled jobs:')
  console.log('  Morning check-in:          8:00 AM')
  console.log('  Morning vaccination check: 8:30 AM')
  console.log('  Diagnosis follow-ups:      9:00 AM')
  console.log('  Afternoon nudge:           1:00 PM')
  console.log('  Afternoon vaccination:     1:30 PM')
  console.log('  Evening nudge:             6:00 PM')
  console.log('  Evening vaccination:       6:30 PM')
}

module.exports = { startScheduler },