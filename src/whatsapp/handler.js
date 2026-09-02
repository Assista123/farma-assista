const { sendMessage, sendButtons, sendList } = require('./whatsapp')
const { getSession, saveSession, createNewSession } = require('../utils/sessionManager')
const { getFarmerByPhone } = require('../services/farmerService')
const { getActiveFlocks } = require('../services/flockService')
const { getUndoEntry, clearUndoEntry } = require('../utils/undoManager')
const { deleteRecord } = require('../services/undoService')
const { handleRecountResponse, isRecountPending } = require('../utils/recountHelper')
const supabase = require('../config/database')

// Import all flows
const { startOnboarding, handleOnboardingStep } = require('../flows/onboarding')
const { startFlockCreation, handleFlockCreationStep } = require('../flows/flockCreation')
const { startFeedLogging, handleFeedLoggingStep } = require('../flows/feedLogging')
const { startMortalityLogging, handleMortalityStep } = require('../flows/mortalityLogging')
const { startSalesLogging, handleSalesStep } = require('../flows/salesLogging')
const { startWeightLogging, handleWeightStep } = require('../flows/weightLogging')
const { startEggProductionLogging, handleEggProductionStep } = require('../flows/eggProductionLogging')
const { startCloseFlock, handleCloseFlockStep } = require('../flows/closeFlock')
const { startLitterLogging, handleLitterStep } = require('../flows/litterLogging')
const { startDrugLogging, handleDrugStep } = require('../flows/drugLogging')
const { startExpenseLogging, handleExpenseStep } = require('../flows/expenseLogging')
const { showStockSummary, startAddStockItem, handleAddStockItem, startLogUsage, handleLogUsage, startUpdateQuantity, handleUpdateQuantity } = require('../flows/stockManagement')
const { startProfitSummary, handleReportsStep } = require('../flows/reports')
const { showVaccinationSchedule, handleVaccinationStep } = require('../flows/vaccinationFlow')
const { startHealthDiagnosis, handleHealthDiagnosisStep } = require('../flows/healthDiagnosis')
const { detectIntent } = require('../utils/intentDetector')
const { generateResponse } = require('../utils/responseGenerator')

// Build a WhatsApp-compatible ctx object that mirrors the Telegram ctx API
function buildCtx(to) {
    return {
    reply: async (text, options) => {
      console.log(`Sending WhatsApp reply to ${to}: "${text.slice(0, 80)}"`)
      // Extract keyboard buttons if present
      const keyboard = options?.reply_markup?.keyboard
      if (keyboard && keyboard.length > 0) {
        // Flatten keyboard to get all button texts
        const allButtons = keyboard.flat().map(btn => btn.text)

        // Filter out navigation buttons for cleaner display
        const actionButtons = allButtons.filter(b =>
          b !== '🏠 Main Menu' && b !== '🔙 Back'
        )

        if (actionButtons.length > 0 && actionButtons.length <= 3) {
          // Use WhatsApp reply buttons (max 3)
          await sendButtons(to, text, actionButtons)
        } else if (actionButtons.length > 3 && actionButtons.length <= 10) {
          // Use WhatsApp list menu
          const items = actionButtons.map((btn, i) => ({
            id: `item_${i}`,
            title: btn.slice(0, 24)
          }))
          await sendList(to, 'Options', text, 'Choose an option', [{
            title: 'Select one',
            rows: items
          }])
        } else {
          // Just send as text
          await sendMessage(to, text)
        }
      } else {
        await sendMessage(to, text)
      }
    },
    message: { text: '' } // populated before use
  }
}

// Main WhatsApp message handler
async function handleWhatsAppMessage(from, messageText) {
  const farmerId = from
  const input = messageText.trim()

  try {
    let session = await getSession(farmerId)

    if (!session) {
      session = createNewSession(farmerId)
      await saveSession(farmerId, session)
    }

    session.last_active = new Date().toISOString()
    console.log(`Processing WhatsApp message from ${farmerId}: "${input}" | registered: ${session.is_registered}`)

    // Track last message for 24hr window
    if (session.farmer_db_id) {
      supabase
        .from('farmers')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', session.farmer_db_id)
        .then(() => {})
    }

    const ctx = buildCtx(from)
    ctx.message = { text: input }

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

    // Undo confirmation
    if (session.current_flow === 'UNDO_CONFIRM') {
      if (input === '✅ Yes, undo it') {
        const undoEntry = await getUndoEntry(farmerId)
        if (!undoEntry) {
          await sendMessage(from,
            'The 5-minute undo window has passed.\n\n' +
            'To correct an older entry send:\n' +
            '"Correction — [what needs to be fixed]"'
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
          await sendMessage(from, `✅ Entry removed.\n\n${undoEntry.description} has been deleted.`)
        }
        return
      }
      if (input === '❌ No, keep it') {
        session.current_flow = null
        await saveSession(farmerId, session)
        await sendMessage(from, 'No problem — entry kept.')
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
      await sendMessage(from, `What would you like to do, ${session.farmer_name}?\n\nType any of these:\n• Log Feed\n• Log Mortality\n• Log Sales\n• Health Check\n• Profit Summary\n• Check Vaccinations\n• Check Stock`)
      return
    }

    // Recount check
    if (isRecountPending(session)) {
      const handled = await handleRecountResponse(ctx, session, input)
      if (handled) return
    }

    // Route to active flow
    if (session.current_flow === 'FLOCK_CREATION') { await handleFlockCreationStep(ctx, session); return }
    if (session.current_flow === 'FEED_LOGGING') { await handleFeedLoggingStep(ctx, session); return }
    if (session.current_flow === 'MORTALITY_LOGGING') { await handleMortalityStep(ctx, session); return }
    if (session.current_flow === 'SALES_LOGGING') { await handleSalesStep(ctx, session); return }
    if (session.current_flow === 'WEIGHT_LOGGING') { await handleWeightStep(ctx, session); return }
    if (session.current_flow === 'EGG_PRODUCTION_LOGGING') { await handleEggProductionStep(ctx, session); return }
    if (session.current_flow === 'CLOSE_FLOCK') { await handleCloseFlockStep(ctx, session); return }
    if (session.current_flow === 'LITTER_LOGGING') { await handleLitterStep(ctx, session); return }
    if (session.current_flow === 'DRUG_LOGGING') { await handleDrugStep(ctx, session); return }
    if (session.current_flow === 'EXPENSE_LOGGING') { await handleExpenseStep(ctx, session); return }
    if (session.current_flow === 'ADD_STOCK_ITEM') { await handleAddStockItem(ctx, session); return }
    if (session.current_flow === 'LOG_STOCK_USAGE') { await handleLogUsage(ctx, session); return }
    if (session.current_flow === 'UPDATE_STOCK_QUANTITY') { await handleUpdateQuantity(ctx, session); return }
    if (session.current_flow === 'PROFIT_SUMMARY') { await handleReportsStep(ctx, session); return }
    if (session.current_flow === 'VACCINATION') { await handleVaccinationStep(ctx, session); return }
    if (session.current_flow === 'HEALTH_DIAGNOSIS') { await handleHealthDiagnosisStep(ctx, session); return }

    // Menu button handlers
    if (input === '🌾 Log Feed') { await startFeedLogging(ctx, session); return }
    if (input === '💀 Log Mortality') { await startMortalityLogging(ctx, session); return }
    if (input === '💵 Log Sales') { await startSalesLogging(ctx, session); return }
    if (input === '⚖️ Log Weight') { await startWeightLogging(ctx, session); return }
    if (input === '🥚 Log Eggs') { await startEggProductionLogging(ctx, session); return }
    if (input === '🔒 Close Flock Cycle') { await startCloseFlock(ctx, session); return }
    if (input === '🪹 Litter Check') { await startLitterLogging(ctx, session); return }
    if (input === '💊 Log Drug') { await startDrugLogging(ctx, session); return }
    if (input === '💰 Log Expense') { await startExpenseLogging(ctx, session); return }
    if (input === '📊 Profit Summary') { await startProfitSummary(ctx, session); return }
    if (input === '📦 Check Stock') { await showStockSummary(ctx, session); return }
    if (input === '➕ Add Stock Item') { await startAddStockItem(ctx, session); return }
    if (input === '📝 Log Usage') { await startLogUsage(ctx, session); return }
    if (input === '🔄 Update Quantity') { await startUpdateQuantity(ctx, session); return }
    if (input === '💉 Vaccinations') { await showVaccinationSchedule(ctx, session); return }
    if (input === '❤️ Health Check' || input === '❤️ Run Health Check') { await startHealthDiagnosis(ctx, session); return }
    if (input === '🐔 Broiler' || input === '🐔 Start New Broiler Flock') { await startFlockCreation(ctx, session, 'BROILER'); return }
    if (input === '🥚 Layer' || input === '🥚 Start New Layer Flock') { await startFlockCreation(ctx, session, 'LAYER'); return }

    // Undo
    if (input === '↩️ Undo last entry') {
      const undoEntry = await getUndoEntry(farmerId)
      if (!undoEntry) {
        await sendMessage(from, 'Nothing to undo — undo window has passed.\n\nSend: "Correction — [what needs fixing]" to correct an older entry.')
        return
      }
      await sendButtons(from,
        `Undo this entry?\n\n❌ ${undoEntry.description}\n\nThis cannot be reversed.`,
        ['✅ Yes, undo it', '❌ No, keep it']
      )
      session.current_flow = 'UNDO_CONFIRM'
      await saveSession(farmerId, session)
      return
    }

    // Intent detection for free text
    const intent = await detectIntent(input, session.farmer_name)
    console.log(`WhatsApp intent: ${intent} for "${input}"`)

    switch (intent) {
      case 'LOG_FEED_PURCHASE':
      case 'LOG_FEED_CONSUMPTION':
        await startFeedLogging(ctx, session); break
      case 'LOG_MORTALITY':
        await startMortalityLogging(ctx, session); break
      case 'LOG_BIRD_SALES':
      case 'LOG_EGG_SALES':
        await startSalesLogging(ctx, session); break
      case 'LOG_WEIGHT':
        await startWeightLogging(ctx, session); break
      case 'LOG_EGG_PRODUCTION':
        await startEggProductionLogging(ctx, session); break
      case 'LOG_EXPENSE':
        await startExpenseLogging(ctx, session); break
      case 'LOG_DRUG':
        await startDrugLogging(ctx, session); break
      case 'LOG_LITTER':
        await startLitterLogging(ctx, session); break
      case 'CHECK_STOCK':
      case 'ADD_STOCK':
        await showStockSummary(ctx, session); break
      case 'CHECK_PROFIT':
        await startProfitSummary(ctx, session); break
      case 'HEALTH_DIAGNOSIS':
        await startHealthDiagnosis(ctx, session); break
      case 'CHECK_VACCINATION':
        await showVaccinationSchedule(ctx, session); break
      case 'CLOSE_FLOCK':
        await startCloseFlock(ctx, session); break
      case 'NEW_FLOCK':
        await sendButtons(from, 'What type of flock are you adding?', ['🐔 Broiler', '🥚 Layer']); break
      case 'UNDO_LAST_ENTRY': {
        const undoEntry = await getUndoEntry(farmerId)
        if (!undoEntry) {
          await sendMessage(from, 'The 5-minute undo window has passed.\n\nSend: "Correction — [what needs fixing]"')
        } else {
          await sendButtons(from, `Undo this?\n\n${undoEntry.description}`, ['✅ Yes, undo it', '❌ No, keep it'])
          session.current_flow = 'UNDO_CONFIRM'
          await saveSession(farmerId, session)
        }
        break
      }
      case 'GENERAL_QUESTION': {
        const answer = await generateResponse(
          `The farmer asked: "${input}".\n\nAnswer based ONLY on what Farma Assista can do. If they want to correct a record, tell them to send: "Correction — [what needs to be fixed]"`,
          { farmer_name: session.farmer_name, farm_name: session.farm_name, active_flocks: session.active_flocks }
        )
        await sendMessage(from, answer || `Hello ${session.farmer_name}! How can I help you today?`)
        break
      }
      default:
        await sendMessage(from,
          `Hello ${session.farmer_name}! 👋\n\nWhat would you like to do?\n\n` +
          `• Log Feed\n• Log Mortality\n• Log Sales\n• Health Check\n• Profit Summary\n• Check Vaccinations\n• Check Stock`
        )
    }

  } catch (err) {
    console.error('WhatsApp handler error:', err.message)
    await sendMessage(from, 'Sorry, something went wrong. Please try again.')
  }
}

module.exports = { handleWhatsAppMessage }
