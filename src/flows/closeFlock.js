const { getFlockById, closeFlock, updateBirdCount } = require('../services/flockService')
const { getSalesSummary } = require('../services/salesService')
const { getMortalitySummary } = require('../services/mortalityService')
const { getFeedSummary } = require('../services/feedService')
const { logBirdSale } = require('../services/salesService')
const { logMortality, getTotalExpensesToDate } = require('../services/mortalityService')
const { saveSession } = require('../utils/sessionManager')
const supabase = require('../config/database')

async function startCloseFlock(ctx, session) {
  if (session.active_flocks.length === 0) {
    await ctx.reply(
      'You have no active flocks to close.',
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  session.current_flow = 'CLOSE_FLOCK'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '🔒 Close Flock Cycle\n\n' +
    'Which flock cycle are you closing?\n\n' +
    '⚠️ This marks the flock as complete. ' +
    'You will see a final summary before confirming.',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleCloseFlockStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_FLOCK') {
    const flock = session.active_flocks.find(f => f.flock_name === input)

    if (!flock) {
      await ctx.reply('Please select a flock from the options.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    await saveSession(session.farmer_id, session)

    const flockDetails = await getFlockById(flock.id)
    session.collected_data.current_bird_count = flockDetails.current_bird_count

    if (flockDetails.current_bird_count > 0) {
      session.current_step = 'ASK_REMAINING_BIRDS'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `You still have ${flockDetails.current_bird_count} birds ` +
        `showing as alive in ${flock.flock_name}.\n\n` +
        `What happened to the remaining birds?`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '🐔 I sold the remaining birds' }],
              [{ text: '💀 They all died' }],
              [{ text: '🍗 Slaughtered for personal use' }],
              [{ text: '🚨 Some were stolen' }],
              [{ text: '📦 Transferred to another farm' }],
              [{ text: '📝 Other — let me explain' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'ASK_REMAINING_BIRDS') {
    if (input === '🐔 I sold the remaining birds') {
      session.collected_data.remaining_action = 'SOLD'
      session.current_step = 'AWAITING_SALES'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Please log the sale of your remaining ` +
        `${session.collected_data.current_bird_count} birds first.\n\n` +
        `Tap 💵 Log Sales to record the sale, ` +
        `then come back and we will complete the closure.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '💵 Log Sales' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input === '💀 They all died') {
      session.collected_data.remaining_action = 'DIED'
      session.current_step = 'AWAITING_MORTALITY'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Please log the death of your remaining ` +
        `${session.collected_data.current_bird_count} birds first.\n\n` +
        `Tap 💀 Log Mortality to record the deaths, ` +
        `then come back and we will complete the closure.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '💀 Log Mortality' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input === '🍗 Slaughtered for personal use') {
      session.collected_data.remaining_action = 'SLAUGHTERED'
      session.current_step = 'ASK_SLAUGHTER_VALUE'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `${session.collected_data.current_bird_count} birds slaughtered for personal use.\n\n` +
        `What is the estimated market value per bird in Naira?\n\n` +
        `This helps us calculate the true value of what your farm produced.\n` +
        `For example: 4500\n\n` +
        `Or tap Skip if you prefer not to estimate.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: 'Skip' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input === '🚨 Some were stolen') {
      session.collected_data.remaining_action = 'STOLEN'
      session.current_step = 'ASK_STOLEN_COUNT'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Sorry to hear that. 😔\n\n` +
        `How many birds were stolen?\n\n` +
        `Enter a number or tap All of them.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: 'All of them' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input === '📦 Transferred to another farm') {
      session.collected_data.remaining_action = 'TRANSFERRED'
      session.current_step = 'ASK_TRANSFER_NOTE'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Please add a note about the transfer:\n\n` +
        `For example: Transferred to my brother's farm in Ibadan`,
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    if (input === '📝 Other — let me explain') {
      session.collected_data.remaining_action = 'OTHER'
      session.current_step = 'ASK_OTHER_NOTE'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `Please explain what happened to the remaining ` +
        `${session.collected_data.current_bird_count} birds:`,
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    await ctx.reply('Please use the buttons to select an option.')
    return
  }

  if (currentStep === 'ASK_SLAUGHTER_VALUE') {
    if (input !== 'Skip') {
      const value = parseFloat(input)
      if (isNaN(value) || value <= 0) {
        await ctx.reply(
          'Please enter a valid amount in Naira or tap Skip.\n' +
          'For example: 4500'
        )
        return
      }
      session.collected_data.slaughter_value_per_bird = value
      session.collected_data.slaughter_total_value =
        value * session.collected_data.current_bird_count
    }

    // Zero out bird count
    await updateBirdCount(session.collected_data.flock_id, 0)
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'ASK_STOLEN_COUNT') {
    let stolenCount = 0

    if (input === 'All of them') {
      stolenCount = session.collected_data.current_bird_count
    } else {
      stolenCount = parseInt(input)
      if (isNaN(stolenCount) || stolenCount <= 0) {
        await ctx.reply(
          'Please enter a valid number or tap All of them.'
        )
        return
      }
    }

    session.collected_data.stolen_count = stolenCount

    // Log stolen birds as mortality with cause UNKNOWN
    const today = new Date().toISOString().split('T')[0]
    const totalExpenses = await getTotalExpensesToDate(
      session.collected_data.flock_id, today
    )
    const costPerBird = session.collected_data.current_bird_count > 0
      ? totalExpenses / session.collected_data.current_bird_count
      : 0

    await logMortality({
      flock_id: session.collected_data.flock_id,
      date: today,
      count: stolenCount,
      bird_age_days: null,
      age_category: 'FINISHING',
      suspected_cause: 'UNKNOWN',
      custom_cause: 'Theft',
      bird_count_before_event: session.collected_data.current_bird_count,
      cost_per_bird_at_death: costPerBird.toFixed(2),
      actual_loss_naira: (costPerBird * stolenCount).toFixed(2)
    })

    // Update bird count
    const remaining = session.collected_data.current_bird_count - stolenCount
    await updateBirdCount(session.collected_data.flock_id, remaining)

    if (remaining > 0) {
      session.collected_data.current_bird_count = remaining
      session.current_step = 'ASK_REMAINING_BIRDS'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        `${stolenCount} birds logged as stolen. 😔\n\n` +
        `You still have ${remaining} birds remaining.\n\n` +
        `What happened to the rest?`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '🐔 I sold the remaining birds' }],
              [{ text: '💀 They all died' }],
              [{ text: '🍗 Slaughtered for personal use' }],
              [{ text: '📦 Transferred to another farm' }],
              [{ text: '📝 Other — let me explain' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'ASK_TRANSFER_NOTE') {
    session.collected_data.transfer_note = input
    await updateBirdCount(session.collected_data.flock_id, 0)
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'ASK_OTHER_NOTE') {
    session.collected_data.other_note = input
    await updateBirdCount(session.collected_data.flock_id, 0)
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'AWAITING_SALES') {
    const flockDetails = await getFlockById(session.collected_data.flock_id)

    if (flockDetails.current_bird_count > 0) {
      await ctx.reply(
        `You still have ${flockDetails.current_bird_count} birds remaining.\n\n` +
        `Please log all remaining birds before closing the cycle.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '💵 Log Sales' }],
              [{ text: '📝 Other — let me explain' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'AWAITING_MORTALITY') {
    const flockDetails = await getFlockById(session.collected_data.flock_id)

    if (flockDetails.current_bird_count > 0) {
      await ctx.reply(
        `You still have ${flockDetails.current_bird_count} birds remaining.\n\n` +
        `Please log all remaining birds before closing the cycle.`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '💀 Log Mortality' }],
              [{ text: '📝 Other — let me explain' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showSummary(ctx, session)
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, keep open') {
      session.current_flow = null
      session.current_step = null
      session.collected_data = {}
      await saveSession(session.farmer_id, session)

      await ctx.reply('No problem — cycle kept open.', {
        reply_markup: {
          keyboard: [
            [{ text: '🌾 Log Feed' }, { text: '💀 Log Mortality' }],
            [{ text: '💵 Log Sales' }, { text: '⚖️ Log Weight' }],
            [{ text: '🥚 Log Eggs' }, { text: '📦 Check Stock' }],
            [{ text: '❤️ Health Check' }, { text: '💰 Profit Summary' }],
            [{ text: '🔒 Close Flock Cycle' }, { text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      })
      return
    }

    if (input !== '✅ Yes, close cycle') {
      await ctx.reply('Please use the buttons to confirm or cancel.')
      return
    }

    const closed = await closeFlock(session.collected_data.flock_id)

    if (!closed) {
      await ctx.reply('Sorry, something went wrong. Please try again.')
      return
    }

    session.active_flocks = session.active_flocks.filter(
      f => f.id !== session.collected_data.flock_id
    )
    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `✅ ${closed.flock_name} cycle has been closed.\n\n` +
      `Great work this cycle! 🎉\n\n` +
      `Would you like to start a new flock?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '🐔 Start New Broiler Flock' }],
            [{ text: '🥚 Start New Layer Flock' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }
}

async function showSummary(ctx, session) {
  const data = session.collected_data
  const flockDetails = await getFlockById(data.flock_id)
  const sales = await getSalesSummary(data.flock_id)
  const mortality = await getMortalitySummary(data.flock_id)
  const feed = await getFeedSummary(data.flock_id)

  const startDate = flockDetails.start_date
  const today = new Date().toISOString().split('T')[0]
  const cycleDays = Math.ceil(
    (new Date(today) - new Date(startDate)) / (1000 * 60 * 60 * 24)
  )

  // Include slaughter value in revenue if applicable
  const slaughterValue = data.slaughter_total_value || 0
  const totalRevenue = sales.total_revenue + slaughterValue
  const profit = totalRevenue - feed.total_cost_naira
  const profitLabel = profit >= 0 ? '✅ Profit' : '❌ Loss'

  // Build additional notes
  let additionalNotes = ''
  if (data.slaughter_value_per_bird) {
    additionalNotes +=
      `\n🍗 Slaughter value: ₦${slaughterValue.toLocaleString()} ` +
      `(${data.current_bird_count} birds × ₦${data.slaughter_value_per_bird.toLocaleString()})`
  } else if (data.remaining_action === 'SLAUGHTERED') {
    additionalNotes += `\n🍗 ${data.current_bird_count} birds slaughtered (value not estimated)`
  }
  if (data.transfer_note) {
    additionalNotes += `\n📦 Transfer note: ${data.transfer_note}`
  }
  if (data.other_note) {
    additionalNotes += `\n📝 Note: ${data.other_note}`
  }
  if (data.stolen_count) {
    additionalNotes += `\n🚨 ${data.stolen_count} birds reported stolen`
  }

  await ctx.reply(
    `📊 Final Summary — ${data.flock_name}\n\n` +
    `📅 Cycle: ${startDate} → ${today} (${cycleDays} days)\n` +
    `🐔 Started with: ${flockDetails.initial_bird_count} birds\n` +
    `💀 Deaths: ${mortality.total_deaths}\n` +
    `🛒 Birds sold: ${sales.total_birds_sold}\n` +
    `🥚 Eggs sold: ${sales.total_eggs_sold}\n\n` +
    `💰 Revenue: ₦${totalRevenue.toLocaleString()}\n` +
    `📉 Feed cost: ₦${feed.total_cost_naira.toLocaleString()}\n` +
    `${profitLabel}: ₦${Math.abs(profit).toLocaleString()}` +
    additionalNotes +
    `\n\nAre you sure you want to close this cycle?\n` +
    `This cannot be undone.`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Yes, close cycle' }, { text: '❌ No, keep open' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

module.exports = {
  startCloseFlock,
  handleCloseFlockStep
}