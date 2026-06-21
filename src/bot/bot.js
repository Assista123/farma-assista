const { Bot } = require('grammy')

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env file')
}

const bot = new Bot(token)

// Handle all text messages
bot.on('message:text', async (ctx) => {
  const farmerPhone = ctx.from.id.toString()
  const messageText = ctx.message.text
  const farmerName = ctx.from.first_name

  console.log(`Message from ${farmerName} (${farmerPhone}): ${messageText}`)

  // For now just echo back — we'll replace this with conversation engine
  await ctx.reply(`Hi ${farmerName}! You said: ${messageText}`)
})

// Handle errors
bot.catch((err) => {
  console.error('Bot error:', err)
})

module.exports = bot