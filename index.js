require('dotenv').config()
const express = require('express')
const crypto = require('crypto')
const app = express()
const bot = require('./src/bot/bot')
const { startScheduler } = require('./src/scheduler')
const path = require('path')
const { handleWhatsAppMessage } = require('./src/whatsapp/handler')

// Capture raw body for signature verification (must be before json parser)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Farma Assista API is running',
    timestamp: new Date().toISOString()
  })
})

// WhatsApp webhook verification (GET)
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

// Verify Meta X-Hub-Signature-256
function verifySignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    // Soft-fail during transition if secret not yet set; log warning
    console.warn('WHATSAPP_APP_SECRET not set — skipping signature verification')
    return true
  }

  const signature = req.get('X-Hub-Signature-256')
  if (!signature) {
    console.warn('Missing X-Hub-Signature-256 header')
    return false
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  } catch (e) {
    return false
  }
}

// WhatsApp webhook incoming messages (POST)
app.post('/webhook', async (req, res) => {
  // Always acknowledge quickly so Meta does not retry
  res.sendStatus(200)

  if (!verifySignature(req)) {
    console.warn('Webhook signature verification failed — rejecting payload')
    return
  }

  const body = req.body
  if (!body || body.object !== 'whatsapp_business_account') return

  // Lightweight deduplication set (in-memory)
  if (!global.__waProcessedIds) global.__waProcessedIds = new Set()
  const processed = global.__waProcessedIds

  const { sendMessage } = require('./src/whatsapp/whatsapp')

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages
      if (!messages) continue

      for (const message of messages) {
        try {
          // Skip already-processed messages
          if (message.id && processed.has(message.id)) continue
          if (message.id) {
            processed.add(message.id)
            if (processed.size > 1000) {
              const first = processed.values().next().value
              processed.delete(first)
            }
          }

          let text = null
          const from = message.from

          if (message.type === 'text') {
            text = message.text?.body || ''
          } else if (message.type === 'interactive') {
            // Button or list reply
            const interactive = message.interactive
            if (interactive?.type === 'button_reply') {
              text = interactive.button_reply?.title || interactive.button_reply?.id
            } else if (interactive?.type === 'list_reply') {
              text = interactive.list_reply?.title || interactive.list_reply?.id
            }
          } else {
            // Voice, image, video, document, location, sticker, etc.
            console.log(`Unsupported message type "${message.type}" from ${from}`)
            await sendMessage(
              from,
              "I can only read text and button taps for now 😊\nPlease type your message or use the buttons."
            )
            continue
          }

          if (!text) continue

          console.log(`WhatsApp message from ${from}: "${text}" (type=${message.type})`)
          await handleWhatsAppMessage(from, text)
        } catch (err) {
          console.error(`Error processing message ${message.id}:`, err.message)
        }
      }
    }
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

// Serve website static files AFTER API routes
app.use(express.static(path.join(__dirname, 'public')))

module.exports = app