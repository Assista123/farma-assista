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
const { getFarmerByPhone } = require('../services/farmerService')

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env file')
}

const bot = new Bot(token)

// Handle all text messages
bot.on('message:text', async (ctx) => {
  const farmerId = ctx.from.id.toString()
  const farmerName = ctx.from.first_name

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
      // Check database in case session expired but farmer exists
      const existingFarmer = await getFarmerByPhone(farmerId)

      if (existingFarmer) {
        // Farmer exists in DB — restore session
        session.is_registered = true
        session.farmer_name = existingFarmer.name
        session.farm_name = existingFarmer.farm_name
        session.farmer_db_id = existingFarmer.id
        await saveSession(farmerId, session)
      } else {
        // Brand new farmer — start onboarding
        if (session.current_flow === 'ONBOARDING') {
          // Already mid-onboarding — continue
          await handleOnboardingStep(ctx, session)
        } else {
          // Fresh start
          await startOnboarding(ctx, session)
        }
        return
      }
    }

    // Farmer is registered — handle their message
    // For now just greet them — we will add more flows next
    await ctx.reply(
      `Hello ${session.farmer_name}! 👋\n\n` +
      `Welcome back to ${session.farm_name}.\n\n` +
      `What would you like to do today?`
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