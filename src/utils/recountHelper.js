const { updateBirdCount, getFlockById } = require('../services/flockService')
const { saveSession } = require('./sessionManager')
const { mainMenuKeyboard } = require('./keyboards')

// Add recount prompt to any message
async function askRecountPrompt(ctx, session, flockId, flockName, currentCount) {
  session.recount_pending = {
    flock_id: flockId,
    flock_name: flockName,
    old_count: currentCount
  }
  await saveSession(session.farmer_id, session)

  await ctx.reply(
    `🐔 System shows ${currentCount} birds remaining in ${flockName}.\n` +
    `Does this match your actual count?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Yes, correct' }, { text: '🔢 No, let me recount' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

// Handle recount response
async function handleRecountResponse(ctx, session, input) {
  if (input === '✅ Yes, correct') {
    session.recount_pending = null
    await saveSession(session.farmer_id, session)
    await ctx.reply('✅ Count confirmed.', mainMenuKeyboard)
    return true
  }

  if (input === '🔢 No, let me recount') {
    session.recount_step = 'ASK_NEW_COUNT'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `What is the actual current bird count for ${session.recount_pending.flock_name}?\n\n` +
      `Enter the correct number:`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return true
  }

  if (session.recount_step === 'ASK_NEW_COUNT') {
    const newCount = parseInt(input)

    if (isNaN(newCount) || newCount < 0 || newCount > 500) {
      await ctx.reply('Please enter a valid number between 0 and 500.')
      return true
    }

    const pending = session.recount_pending
    await updateBirdCount(pending.flock_id, newCount)

    // Update session active flocks
    const flockIndex = session.active_flocks.findIndex(
      f => f.id === pending.flock_id
    )
    if (flockIndex !== -1) {
      session.active_flocks[flockIndex].current_bird_count = newCount
    }

    session.recount_pending = null
    session.recount_step = null
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `✅ Bird count corrected for ${pending.flock_name}.\n\n` +
      `Previous count: ${pending.old_count}\n` +
      `New count: ${newCount}\n\n` +
      `All calculations will now use the corrected count.`,
      mainMenuKeyboard
    )
    return true
  }

  return false
}

// Check if recount is pending for this session
function isRecountPending(session) {
  return !!(session.recount_pending || session.recount_step === 'ASK_NEW_COUNT')
}

module.exports = {
  askRecountPrompt,
  handleRecountResponse,
  isRecountPending
}