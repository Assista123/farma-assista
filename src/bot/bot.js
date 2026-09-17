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
const {
  startWeightLogging,
  handleWeightStep
} = require('../flows/weightLogging')
const {
  startEggProductionLogging,
  handleEggProductionStep
} = require('../flows/eggProductionLogging')
const {
  startCloseFlock,
  handleCloseFlockStep
} = require('../flows/closeFlock')
const {
  startLitterLogging,
  handleLitterStep
} = require('../flows/litterLogging')
const {
  startDrugLogging,
  handleDrugStep
} = require('../flows/drugLogging')
const {
  startExpenseLogging,
  handleExpenseStep
} = require('../flows/expenseLogging')
const {
  showStockSummary,
  startAddStockItem,
  handleAddStockItem,
  startLogUsage,
  handleLogUsage,
  startUpdateQuantity,
  handleUpdateQuantity
} = require('../flows/stockManagement')
const {
  startProfitSummary,
  handleReportsStep
} = require('../flows/reports')
const {
  showVaccinationSchedule,
  handleVaccinationStep
} = require('../flows/vaccinationFlow')
const { getFarmerByPhone } = require('../services/farmerService')
const { getActiveFlocks } = require('../services/flockService')
const { getUndoEntry, clearUndoEntry } = require('../utils/undoManager')
const { deleteRecord } = require('../services/undoService')
const supabase = require('../config/database')
const {
  handleRecountResponse,
  isRecountPending
} = require('../utils/recountHelper')
const {
  startHealthDiagnosis,
  handleHealthDiagnosisStep
} = require('../flows/healthDiagnosis')
const { detectIntent } = require('../utils/intentDetector')
const { generateResponse } = require('../utils/responseGenerator')

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env file')
}

const bot = new Bot(token)

const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📋 Daily Logs' }, { text: '💵 Sales & Finance' }],
      [{ text: '📦 Farm Management' }, { text: '🏠 Main Menu' }]
    ],
    resize_keyboard: true
  }
}

const dailyLogsKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
      [{ text: '🥚 Log Eggs' }, { text: '⚖️ Log Weight' }],
      [{ text: '🪹 Litter Check' }, { text: '💊 Log Drug' }],
      [{ text: '🔙 Back' }]
    ],
    resize_keyboard: true
  }
}

const salesFinanceKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '💵 Log Sales' }, { text: '💰 Log Expense' }],
      [{ text: '📊 Profit Summary' }],
      [{ text: '🔙 Back' }]
    ],
    resize_keyboard: true
  }
}

const farmManagementKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📦 Check Stock' }, { text: '❤️ Health Check' }],
      [{ text: '💉 Vaccinations' }, { text: '🔒 Close Flock Cycle' }],
      [{ text: '➕ New Flock' }],
      [{ text: '🔙 Back' }]
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

        // Update last message timestamp for 24hr window tracking
    if (session.farmer_db_id) {
      supabase
        .from('farmers')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', session.farmer_db_id)
        .then(() => {}) // fire and forget — don't block the message handler
    }

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

    // Global exit
    if (
      input.toLowerCase() === 'cancel' ||
      input.toLowerCase() === 'menu' ||
      input === '🏠 Main Menu'
    ) {
      session.current_flow = null
      session.current_step = null
      session.collected_data = {}
      session.recount_pending = null
      session.recount_step = null
      await saveSession(farmerId, session)
      await ctx.reply('What would you like to do?', mainMenuKeyboard)
      return
    }

    // Handle recount if pending
    if (isRecountPending(session)) {
      const handled = await handleRecountResponse(ctx, session, input)
      if (handled) return
    }

    // Submenu navigation
    if (input === '📋 Daily Logs') {
      await ctx.reply('What would you like to log?', dailyLogsKeyboard)
      return
    }

    if (input === '💵 Sales & Finance') {
      await ctx.reply('Sales and finance options:', salesFinanceKeyboard)
      return
    }

    if (input === '📦 Farm Management') {
      await ctx.reply('Farm management options:', farmManagementKeyboard)
      return
    }

    if (input === '🔙 Back') {
      await ctx.reply('What would you like to do?', mainMenuKeyboard)
      return
    }

    if (input === '➕ New Flock') {
      await ctx.reply(
        'What type of flock are you adding?',
        {
          reply_markup: {
            keyboard: [
              [{ text: '🐔 Broiler' }, { text: '🥚 Layer' }],
              [{ text: '🔙 Back' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    // ── FLOW ROUTING ─────────────────────────────────────────────
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

    if (session.current_flow === 'WEIGHT_LOGGING') {
      await handleWeightStep(ctx, session)
      return
    }

    if (session.current_flow === 'EGG_PRODUCTION_LOGGING') {
      await handleEggProductionStep(ctx, session)
      return
    }

    if (session.current_flow === 'CLOSE_FLOCK') {
      await handleCloseFlockStep(ctx, session)
      return
    }

    if (session.current_flow === 'LITTER_LOGGING') {
      await handleLitterStep(ctx, session)
      return
    }

    if (session.current_flow === 'DRUG_LOGGING') {
      await handleDrugStep(ctx, session)
      return
    }

    if (session.current_flow === 'EXPENSE_LOGGING') {
      await handleExpenseStep(ctx, session)
      return
    }

    if (session.current_flow === 'ADD_STOCK_ITEM') {
      await handleAddStockItem(ctx, session)
      return
    }

    if (session.current_flow === 'LOG_STOCK_USAGE') {
      await handleLogUsage(ctx, session)
      return
    }

    if (session.current_flow === 'UPDATE_STOCK_QUANTITY') {
      await handleUpdateQuantity(ctx, session)
      return
    }

    if (session.current_flow === 'PROFIT_SUMMARY') {
      await handleReportsStep(ctx, session)
      return
    }

    if (session.current_flow === 'VACCINATION') {
      await handleVaccinationStep(ctx, session)
      return
    }

    if (session.current_flow === 'HEALTH_DIAGNOSIS') {
      await handleHealthDiagnosisStep(ctx, session)
      return
    }
    
    // ── MENU BUTTON HANDLERS ──────────────────────────────────────
    if (input === '🐔 Broiler' ||
        input === '🐔 Start New Broiler Flock' ||
        input.toUpperCase() === 'BROILER') {
      await startFlockCreation(ctx, session, 'BROILER')
      return
    }

    if (input === '🥚 Layer' ||
        input === '🥚 Start New Layer Flock' ||
        input.toUpperCase() === 'LAYER') {
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

    if (input === '⚖️ Log Weight') {
      await startWeightLogging(ctx, session)
      return
    }

    if (input === '🥚 Log Eggs') {
      await startEggProductionLogging(ctx, session)
      return
    }

    if (input === '🔒 Close Flock Cycle') {
      await startCloseFlock(ctx, session)
      return
    }

    if (input === '🪹 Litter Check') {
      await startLitterLogging(ctx, session)
      return
    }

    if (input === '💊 Log Drug') {
      await startDrugLogging(ctx, session)
      return
    }

    if (input === '💰 Log Expense') {
      await startExpenseLogging(ctx, session)
      return
    }

    if (input === '📊 Profit Summary') {
      await startProfitSummary(ctx, session)
      return
    }

    if (input === '📦 Check Stock') {
      await showStockSummary(ctx, session)
      return
    }

    if (input === '➕ Add Stock Item') {
      await startAddStockItem(ctx, session)
      return
    }

    if (input === '📝 Log Usage') {
      await startLogUsage(ctx, session)
      return
    }

    if (input === '🔄 Update Quantity') {
      await startUpdateQuantity(ctx, session)
      return
    }

    if (input === '💉 Vaccinations') {
      await showVaccinationSchedule(ctx, session)
      return
    }

    if (input === '❤️ Health Check' || input === '❤️ Run Health Check' || input === '🏥 Run Health Check') {
      await startHealthDiagnosis(ctx, session)
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

    // Default — use Gemini intent detection for free text
    const intent = await detectIntent(input, session.farmer_name)
    console.log(`Intent detected: ${intent} for message: "${input}"`)

    switch (intent) {
      case 'LOG_FEED_PURCHASE':
      case 'LOG_FEED_CONSUMPTION':
        await startFeedLogging(ctx, session)
        break

      case 'LOG_MORTALITY':
        await startMortalityLogging(ctx, session)
        break

      case 'LOG_BIRD_SALES':
      case 'LOG_EGG_SALES':
        await startSalesLogging(ctx, session)
        break

      case 'LOG_WEIGHT':
        await startWeightLogging(ctx, session)
        break

      case 'LOG_EGG_PRODUCTION':
        await startEggProductionLogging(ctx, session)
        break

      case 'LOG_EXPENSE':
        await startExpenseLogging(ctx, session)
        break

      case 'LOG_DRUG':
        await startDrugLogging(ctx, session)
        break

      case 'LOG_LITTER':
        await startLitterLogging(ctx, session)
        break

      case 'CHECK_STOCK':
      case 'ADD_STOCK':
        await showStockSummary(ctx, session)
        break

      case 'CHECK_PROFIT':
        await startProfitSummary(ctx, session)
        break

      case 'HEALTH_DIAGNOSIS':
        await startHealthDiagnosis(ctx, session)
        break

      case 'CHECK_VACCINATION':
        await showVaccinationSchedule(ctx, session)
        break

      case 'CLOSE_FLOCK':
        await startCloseFlock(ctx, session)
        break

      case 'NEW_FLOCK':
        await ctx.reply(
          'What type of flock are you adding?',
          {
            reply_markup: {
              keyboard: [
                [{ text: '🐔 Broiler' }, { text: '🥚 Layer' }],
                [{ text: '🔙 Back' }]
              ],
              resize_keyboard: true
            }
          }
        )
        break

      case 'UNDO_LAST_ENTRY': {
        const undoEntry = await getUndoEntry(farmerId)
        if (!undoEntry) {
          await ctx.reply(
            'The 5-minute undo window has passed for your last entry.\n\n' +
            'To correct it send a message like this:\n\n' +
            '"Correction — [what needs to be fixed]"\n\n' +
            'For example: "Correction — I logged 15kg feed but it should be 12kg for May Broiler on 5 August"',
            mainMenuKeyboard
          )
        } else {
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
        }
        break
      }
      
      case 'GENERAL_QUESTION': {
        const answer = await generateResponse(
          `The farmer asked: "${input}".\n\n` +
          `Answer their question based ONLY on what Farma Assista can actually do.\n` +
          `If they want to correct a record, tell them to use the undo button within 5 minutes, ` +
          `or send a correction message like: "Correction — [what needs to be fixed]".\n` +
          `If their question is about a farming topic, answer it briefly and accurately.\n` +
          `Never mention or suggest features that do not exist in Farma Assista.`,
          {
            farmer_name: session.farmer_name,
            farm_name: session.farm_name,
            active_flocks: session.active_flocks
          }
        )
        if (answer) {
          await ctx.reply(answer, mainMenuKeyboard)
        } else {
          await ctx.reply(
            `Hello ${session.farmer_name}! 👋\n\nWhat would you like to do today?`,
            mainMenuKeyboard
          )
        }
        break
      }
      default:
        await ctx.reply(
          `Hello ${session.farmer_name}! 👋\n\nWhat would you like to do today?`,
          mainMenuKeyboard
        )
    }

  } catch (err) {
    console.error('Bot error:', err.message)
    await ctx.reply('Sorry, something went wrong. Please try again in a moment.')
  }
})

bot.catch((err) => {
  console.error('Bot error:', err)
})

module.exports = bot