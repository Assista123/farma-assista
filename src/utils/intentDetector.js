const model = require('../config/gemini')

const INTENTS = [
  'ONBOARDING',
  'LOG_FEED_PURCHASE',
  'LOG_FEED_CONSUMPTION',
  'LOG_MORTALITY',
  'LOG_BIRD_SALES',
  'LOG_EGG_SALES',
  'LOG_WEIGHT',
  'LOG_EGG_PRODUCTION',
  'LOG_EXPENSE',
  'LOG_DRUG',
  'LOG_LITTER',
  'CHECK_STOCK',
  'ADD_STOCK',
  'CHECK_PROFIT',
  'HEALTH_DIAGNOSIS',
  'CHECK_VACCINATION',
  'CLOSE_FLOCK',
  'NEW_FLOCK',
  'GENERAL_QUESTION',
  'UNKNOWN',
  'UNDO_LAST_ENTRY'
]

async function detectIntent(message, farmerName) {
  try {
    const prompt =
      `You are an intent classifier for Farma Assista, a poultry farm management bot used by Nigerian farmers.\n\n` +
      `Farmer name: ${farmerName}\n` +
      `Farmer message: "${message}"\n\n` +
      `Classify this message into exactly one of these intents:\n` +
      `${INTENTS.join(', ')}\n\n` +
      `Rules:\n` +
      `- Understand Nigerian Pidgin English (e.g. "my bird don dey die" = LOG_MORTALITY)\n` +
      `- Understand misspellings and broken English\n` +
      `- "feed don finish" or "feed don exhaust" = CHECK_STOCK\n` +
      `- "birds dey sick" or "dem dey die" = HEALTH_DIAGNOSIS\n` +
      `- Respond with ONLY the intent name, nothing else\n` +
      `- No explanation, no punctuation, just the intent` +
      `- "I make mistake" or "correct am" or "undo" or "cancel last" = UNDO_LAST_ENTRY` +
            `- "vaccination done" or "I've vaccinated" or "vacc done" or "I gave the vaccine" = CHECK_VACCINATION\n` +

    const result = await model.generateContent(prompt)
    const intent = result.response.text().trim().toUpperCase()

    // Validate the returned intent is in our list
    if (INTENTS.includes(intent)) {
      return intent
    }

    return 'UNKNOWN'
  } catch (err) {
    console.error('Intent detection error:', err.message)
    return 'UNKNOWN'
  }
}

module.exports = { detectIntent }