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
const {
  startFeedLogging,
  handleFeedLoggingStep
} = require('../flows/feedLogging')
const {
  startMortalityLogging,
  handleMortalityStep
} = require('../flows/mortalityLogging')
const {
  startSalesLogging,
  handleSalesStep
} = require('../flows/salesLogging')
const { getFarmerByPhone } = require('../services/farmerService')
const { getActiveFlocks } = require('../services/flockService')
const { getUndoEntry, clearUndoEntry } = require('../utils/undoManager')
const { deleteRecord } = require('../services/undoService')

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env file')
}

const bot = new Bot(token)

// Standard main menu keyboard — used everywhere
const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
      [{ text: '💵 Log Sales' }, { text: '📦 Check Stock' }],
      [{ text: '❤️ Health Check' }, { text: '💰 Profit Summary' }],
      [{ text: '🏠 Main Menu' }]
    ],
    resize_keyboard: true
  }
}

bot.on('message:text', async (ctx) => {
  const farmerId = ctx.from.id.toString()
  const input = ctx.message.text.trim()

  try {
    let session = await getSession(farmerId)

    if (!session) {
      session = createNewSession(farmerId)
      await saveSession(farmerId, session)
    }

    session.last_active = new Date().toISOString()

    // Is farmer registered?
    if (!session.is_registered) {
      const existingFarmer = await getFarmerByPhone(farmerId)

      if (existingFarmer) {
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
        if (session.current_flow === 'ONBOARDING') {
          await handleOnboardingStep(ctx, session)
        } else {
          await startOnboarding(ctx, session)
        }
        return
      }
    }

    // Handle undo confirmation first
    if (session.current_flow === 'UNDO_CONFIRM') {
      if (input === '✅ Yes, undo it') {
        const undoEntry = await getUndoEntry(farmerId)

        if (!undoEntry) {
          await ctx.reply(
            'The 5-minute undo window has passed — this entry can no longer be removed automatically.\n\n' +
            'If you need to correct an older entry, send us a message describing the error and we will fix it for you.\n\n' +
            'Format: "Correction — [what needs to be fixed]"\n\n' +
            'For example: "Correction — I logged 15kg feed consumption but it should be 12kg for June Flock on 22 June"',
            mainMenuKeyboard
          )
          session.current_flow = null
          await saveSession(farmerId, session)
          return
        }

        const deleted = await deleteRecord(undoEntry.table, undoEntry.record_id)
        await clearUndoEntry(farmerId)
        session.current_flow = null
        await saveSession(farmerId, session)

        if (deleted) {
          await ctx.reply(
            `✅ Entry removed successfully.\n\n${undoEntry.description} has been deleted.`,
            mainMenuKeyboard
          )
        } else {
          await ctx.reply('Sorry, something went wrong. Please try again.')
        }
        return
      }

      if (input === '❌ No, keep it') {
        session.current_flow = null
        await saveSession(farmerId, session)
        await ctx.reply('No problem — entry kept.', mainMenuKeyboard)
        return
      }
    }

    // Global exit — cancel any active flow
    if (
      input.toLowerCase() === 'cancel' ||
      input.toLowerCase() === 'menu' ||
      input === '🏠 Main Menu'
    ) {
      session.current_flow = null
      session.current_step = null
      session.collected_data = {}
      await saveSession(farmerId, session)
      await ctx.reply(`No problem! What would you like to do?`, mainMenuKeyboard)
      return
    }

    // Route to active flow
    if (session.current_flow === 'FLOCK_CREATION') {
      await handleFlockCreationStep(ctx, session)
      return
    }

    if (session.current_flow === 'FEED_LOGGING') {
      await handleFeedLoggingStep(ctx, session)
      return
    }

    if (session.current_flow === 'MORTALITY_LOGGING') {
      await handleMortalityStep(ctx, session)
      return
    }

    if (session.current_flow === 'SALES_LOGGING') {
      await handleSalesStep(ctx, session)
      return
    }

    // Handle menu buttons
    if (input === '🐔 Broiler' || input.toUpperCase() === 'BROILER') {
      await startFlockCreation(ctx, session, 'BROILER')
      return
    }

    if (input === '🥚 Layer' || input.toUpperCase() === 'LAYER') {
      await startFlockCreation(ctx, session, 'LAYER')
      return
    }

    if (input === 'I have both') {
      await ctx.reply(
        'No problem! Let us add them one at a time.\n\nWhich flock do you want to add first?',
        {
          reply_markup: {
            keyboard: [
              [{ text: '🐔 Broiler' }, { text: '🥚 Layer' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input === '🌾 Log Feed') {
      await startFeedLogging(ctx, session)
      return
    }

    if (input === '💀 Log Mortality') {
      await startMortalityLogging(ctx, session)
      return
    }

    if (input === '💵 Log Sales') {
      await startSalesLogging(ctx, session)
      return
    }

    // Handle undo
    if (input === '↩️ Undo last entry') {
      const undoEntry = await getUndoEntry(farmerId)

      if (!undoEntry) {
        await ctx.reply(
          'Nothing to undo — either there is no recent entry or the 5-minute undo window has passed.\n\n' +
          'To correct an older entry send us a message like this:\n\n' +
          '"Correction — [what needs to be fixed]"\n\n' +
          'For example: "Correction — I logged 15kg feed but it should be 12kg for June Flock on 22 June"',
          mainMenuKeyboard
        )
        return
      }

      await ctx.reply(
        `Are you sure you want to undo this entry?\n\n` +
        `❌ ${undoEntry.description}\n\n` +
        `This cannot be reversed.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '✅ Yes, undo it' }, { text: '❌ No, keep it' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )

      session.current_flow = 'UNDO_CONFIRM'
      await saveSession(farmerId, session)
      return
    }

    // Default — show main menu
    await ctx.reply(
      `Hello ${session.farmer_name}! 👋\n\nWhat would you like to do today?`,
      mainMenuKeyboard
    )

  } catch (err) {
    console.error('Bot error:', err.message)
    await ctx.reply('Sorry, something went wrong. Please try again in a moment.')
  }
})

bot.catch((err) => {
  console.error('Bot error:', err)
})

module.exports = bot