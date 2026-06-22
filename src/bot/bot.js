const { Bot } = require('grammy')
const {
  getSession,
  saveSession,
  createNewSession
} = require('../utils/sessionManager')
const {
  startOnboarding,
  handleOnboardingStep
} = require('../flows/onboarding')
const {
  startFlockCreation,
  handleFlockCreationStep
} = require('../flows/flockCreation')
const { getFarmerByPhone } = require('../services/farmerService')
const { getActiveFlocks } = require('../services/flockService')

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env file')
}

const bot = new Bot(token)

// Handle all text messages
bot.on('message:text', async (ctx) => {
  const farmerId = ctx.from.id.toString()
  const input = ctx.message.text.trim()

  try {
    // Load or create session
    let session = await getSession(farmerId)

    if (!session) {
      session = createNewSession(farmerId)
      await saveSession(farmerId, session)
    }

    // Update last active
    session.last_active = new Date().toISOString()

    // Is farmer registered?
    if (!session.is_registered) {
      const existingFarmer = await getFarmerByPhone(farmerId)

      if (existingFarmer) {
        // Restore session from database
        const flocks = await getActiveFlocks(existingFarmer.id)
        session.is_registered = true
        session.farmer_name = existingFarmer.name
        session.farm_name = existingFarmer.farm_name
        session.farmer_db_id = existingFarmer.id
        session.active_flocks = flocks.map(f => ({
          id: f.id,
          flock_name: f.flock_name,
          type: f.type
        }))
        await saveSession(farmerId, session)
      } else {
        // New farmer
        if (session.current_flow === 'ONBOARDING') {
          await handleOnboardingStep(ctx, session)
        } else {
          await startOnboarding(ctx, session)
        }
        return
      }
    }

    // Handle flock creation flow
    if (session.current_flow === 'FLOCK_CREATION') {
      await handleFlockCreationStep(ctx, session)
      return
    }

    // Handle broiler/layer selection after onboarding
    if (
      input === '🐔 Broiler' ||
      input.toUpperCase() === 'BROILER'
    ) {
      await startFlockCreation(ctx, session, 'BROILER')
      return
    }

    if (
      input === '🥚 Layer' ||
      input.toUpperCase() === 'LAYER'
    ) {
      await startFlockCreation(ctx, session, 'LAYER')
      return
    }

    if (input === 'I have both') {
      await ctx.reply(
        `No problem! Let us add them one at a time.\n\n` +
        `Which flock do you want to add first?`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '🐔 Broiler' }, { text: '🥚 Layer' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      )
      return
    }

    // Farmer is registered — show main menu
    await ctx.reply(
      `Hello ${session.farmer_name}! 👋\n\n` +
      `What would you like to do today?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
            [{ text: '📦 Check Stock' }, { text: '❤️ Health Check' }],
            [{ text: '💰 Profit Summary' }]
          ],
          resize_keyboard: true
        }
      }
    )

  } catch (err) {
    console.error('Bot error:', err.message)
    await ctx.reply(
      'Sorry, something went wrong. Please try again in a moment.'
    )
  }
})

// Handle errors
bot.catch((err) => {
  console.error('Bot error:', err)
})

module.exports = bot