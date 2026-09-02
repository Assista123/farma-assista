require('dotenv').config()
const express = require('express')
const app = express()
const bot = require('./src/bot/bot')
const { startScheduler } = require('./src/scheduler')
const path = require('path')
const { handleWhatsAppMessage } = require('./src/whatsapp/handler')

// Middleware — must be before all routes
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Farma Assista API is running',
    timestamp: new Date().toISOString()
  })
})

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified successfully')
    res.status(200).send(challenge)
  } else {
    res.sendStatus(403)
  }
})

// WhatsApp webhook incoming messages
app.post('/webhook', async (req, res) => {
  console.log('Webhook POST received:', JSON.stringify(req.body || {}).slice(0, 200))
  res.sendStatus(200)

  const body = req.body
  if (!body || body.object !== 'whatsapp_business_account') return

  body.entry?.forEach(entry => {
    entry.changes?.forEach(change => {
      const messages = change.value?.messages
      if (!messages) return

      messages.forEach(async (message) => {
        if (message.type !== 'text') return

        const from = message.from
        const text = message.text?.body || ''

        console.log(`WhatsApp message from ${from}: "${text}"`)
        await handleWhatsAppMessage(from, text)
      })
    })
  })
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Farma Assista server running on port ${PORT}`)
})

// Start Telegram bot
bot.start()
console.log('Farma Assista bot is running')

// Start scheduler
startScheduler(bot)

// Serve website static files AFTER API routes
app.use(express.static(path.join(__dirname, 'public')))

module.exports = app
