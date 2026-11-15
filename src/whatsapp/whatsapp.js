const axios = require('axios')

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

// WhatsApp cuts button titles at 20 chars and list titles at 24, but the flows
// match on the FULL label. So every button/row carries its full label as its ID
// (max 256 chars) and the webhook reads the ID back instead of the shortened title.
// Slice by code point so an emoji is never split in half.
function clip(str, max) {
  return Array.from(String(str)).slice(0, max).join('').trim()
}

// Same, but for visible titles: if the cut lands mid-word, drop the partial word
// ("🔄 Recover Existing Farm" -> "🔄 Recover Existing", not "🔄 Recover Existing F")
function clipTitle(str, max) {
  const chars = Array.from(String(str))
  if (chars.length <= max) return chars.join('').trim()
  const cut = chars.slice(0, max)
  if (chars[max] !== ' ') {
    const lastSpace = cut.lastIndexOf(' ')
    if (lastSpace > 2) return cut.slice(0, lastSpace).join('').trim()
  }
  return cut.join('').trim()
}

// Send a text message to a WhatsApp number
async function sendMessage(to, text) {
  try {
    console.log(`Attempting to send to ${to}: "${text.slice(0, 50)}"`)
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
    console.log(`Message sent successfully to ${to}:`, JSON.stringify(response.data))
    return response.data
  } catch (err) {
    console.error(`WhatsApp send FAILED to ${to}:`, JSON.stringify(err.response?.data || err.message))
    return null
  }
}

// Send a message with reply buttons (max 3 buttons)
async function sendButtons(to, text, buttons) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: buttons.slice(0, 3).map((btn, i) => ({
              type: 'reply',
              reply: { id: clip(btn, 256), title: clipTitle(btn, 20) }
            }))
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return response.data
  } catch (err) {
    console.error('WhatsApp buttons error:', err.response?.data || err.message)
    return null
  }
}

// Send a list menu (up to 10 items)
async function sendList(to, headerText, bodyText, buttonLabel, sections) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: headerText },
          body: { text: bodyText },
          action: {
            button: buttonLabel,
            sections
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return response.data
  } catch (err) {
    console.error('WhatsApp list error:', err.response?.data || err.message)
    return null
  }
}

module.exports = { sendMessage, sendButtons, sendList, clipTitle }
