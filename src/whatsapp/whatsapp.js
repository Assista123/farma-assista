const axios = require('axios')

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

// Send a text message to a WhatsApp number
async function sendMessage(to, text) {
  try {
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
    return response.data
  } catch (err) {
    console.error('WhatsApp send error:', err.response?.data || err.message)
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
              reply: { id: `btn_${i}`, title: btn.slice(0, 20) }
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

module.exports = { sendMessage, sendButtons, sendList }