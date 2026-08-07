require('dotenv').config()
const { Bot } = require('grammy')
const {
  sendDailyCheckins,
  runThresholdChecks,
  buildDailyCheckin
} = require('../services/notificationService')

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN)

async function testNotifications() {
  console.log('Testing notification service...')

  // Test 1 — Build a check-in message without sending
  const supabase = require('../config/database')
  const { data: farmers } = await supabase
    .from('farmers')
    .select('*')
    .limit(1)

  if (!farmers || farmers.length === 0) {
    console.log('No farmers found in database')
    return
  }

  const farmer = farmers[0]
  console.log(`Testing with farmer: ${farmer.name}`)

  const message = await buildDailyCheckin(farmer)
  console.log('\n--- Daily Check-in Message Preview ---')
  console.log(message)
  console.log('--------------------------------------\n')

  // Test 2 — Actually send to your Telegram
  const answer = process.argv[2]
  if (answer === '--send') {
    console.log('Sending test message to your Telegram...')
    await bot.api.sendMessage(farmer.phone_number, message)
    console.log('Message sent! Check your Telegram.')
  } else {
    console.log('To actually send the message run:')
    console.log('node src/utils/testNotifications.js --send')
  }

  console.log('Notification test complete')
  process.exit(0)
}

testNotifications().catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})