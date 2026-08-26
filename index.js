require('dotenv').config()

const express = require('express')
const app = express()
const bot = require('./src/bot/bot')
const { startScheduler } = require('./src/scheduler')
const path = require('path')

// Middleware
// Serve static website files
app.use(express.static(path.join(__dirname, 'public')))

// Health check (still available)
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
app.post('/webhook', (req, res) => {
  const body = req.body

  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        if (change.value?.messages) {
          change.value.messages.forEach(message => {
            console.log('Incoming WhatsApp message:', JSON.stringify(message))
          })
        }
      })
    })
    res.sendStatus(200)
  } else {
    res.sendStatus(404)
  }
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

module.exports = app