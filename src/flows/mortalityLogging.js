const { logMortality, getTotalExpensesToDate } = require('../services/mortalityService')
const { getFlockById, getBirdAgeDays, getAgeCategory, updateBirdCount } = require('../services/flockService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')
const { askRecountPrompt } = require('../utils/recountHelper')
const { mainMenuKeyboard } = require('../utils/keyboards')
const { mapToOption } = require('../utils/optionMapper')

const CAUSES = [
  { label: 'Newcastle Disease', value: 'NEWCASTLE' },
  { label: 'Coccidiosis', value: 'COCCIDIOSIS' },
  { label: 'Cholera', value: 'CHOLERA' },
  { label: 'Gumboro Disease', value: 'GUMBORO' },
  { label: 'Typhoid', value: 'TYPHOID' },
  { label: 'Cold / Heat Stress', value: 'COLD_STRESS' },
  { label: 'Dehydration', value: 'DEHYDRATION' },
  { label: 'Yolk Sac Infection', value: 'YOLK_SAC_INFECTION' },
  { label: 'Unknown', value: 'UNKNOWN' },
  { label: 'Other (specify)', value: 'OTHER' }
]

async function startMortalityLogging(ctx, session) {
  session.current_flow = 'MORTALITY_LOGGING'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (session.active_flocks.length === 1) {
    const flock = session.active_flocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_COUNT'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `💀 Mortality Log — ${flock.flock_name}\n\n` +
      `Sorry to hear about the loss. 😔\n\n` +
      `How many birds did you lose?`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '💀 Mortality Log\n\nWhich flock did you lose birds from?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleMortalityStep(ctx, session) {
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
    session.current_step = 'ASK_COUNT'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Sorry to hear about the loss. 😔\n\n` +
      `How many birds did you lose from ${flock.flock_name}?`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_COUNT') {
    const count = parseInt(input)

    if (isNaN(count) || count < 1) {
      await ctx.reply(
        'Please enter a valid number.\nFor example: 5'
      )
      return
    }

    const flock = await getFlockById(session.collected_data.flock_id)

    if (count > flock.current_bird_count) {
      await ctx.reply(
        `You currently have ${flock.current_bird_count} birds in ${flock.flock_name}.\n\n` +
        `You cannot log more deaths than birds available.\n\n` +
        `How many birds did you lose?`
      )
      return
    }

    session.collected_data.count = count
    session.collected_data.bird_count_before_event = flock.current_bird_count
    session.current_step = 'ASK_CAUSE'
    await saveSession(session.farmer_id, session)

    const causeButtons = []
    for (let i = 0; i < CAUSES.length; i += 2) {
      const row = [{ text: CAUSES[i].label }]
      if (CAUSES[i + 1]) row.push({ text: CAUSES[i + 1].label })
      causeButtons.push(row)
    }
    causeButtons.push([{ text: '🏠 Main Menu' }])

    await ctx.reply(
      `What do you think caused the death${count > 1 ? 's' : ''}?\n\n` +
      `Select the closest option:`,
      {
        reply_markup: {
          keyboard: causeButtons,
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_CAUSE') {
    let cause = CAUSES.find(c => c.label === input)

    if (!cause) {
      // Try Gemini mapping for free text
      const mapped = await mapToOption(
        input,
        CAUSES.map(c => c.label),
        'Farmer is selecting the cause of bird deaths'
      )
      if (mapped) {
        cause = CAUSES.find(c => c.label === mapped)
      }
    }

    if (!cause) {
      await ctx.reply('Please select a cause from the options.')
      return
    }

    session.collected_data.suspected_cause = cause.value

    if (cause.value === 'OTHER') {
      session.current_step = 'ASK_CUSTOM_CAUSE'
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        'Please describe what you think caused the death(s):',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showConfirmation(ctx, session)
    return
  }

  if (currentStep === 'ASK_CUSTOM_CAUSE') {
    if (input.length < 3) {
      await ctx.reply('Please describe the cause in a few words.')
      return
    }

    session.collected_data.custom_cause = input
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showConfirmation(ctx, session)
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startMortalityLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveMortality(ctx, session)
    return
  }
}

async function showConfirmation(ctx, session) {
  const data = session.collected_data
  const causeLabel = CAUSES.find(
    c => c.value === data.suspected_cause
  )?.label || data.suspected_cause

  let causeText = causeLabel
  if (data.custom_cause) {
    causeText += ` — ${data.custom_cause}`
  }

  await ctx.reply(
    `Please confirm this mortality record:\n\n` +
    `🐔 Flock: ${data.flock_name}\n` +
    `💀 Birds lost: ${data.count}\n` +
    `🦠 Cause: ${causeText}\n\n` +
    `Is this correct?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Yes, save it' }, { text: '❌ No, start over' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

async function saveMortality(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const flock = await getFlockById(data.flock_id)
  const birdAgeDays = getBirdAgeDays(flock.start_date)
  const ageCategory = getAgeCategory(flock.type, birdAgeDays)

  const totalExpenses = await getTotalExpensesToDate(data.flock_id, today)
  const costPerBird = data.bird_count_before_event > 0
    ? totalExpenses / data.bird_count_before_event
    : 0
  const actualLoss = costPerBird * data.count

  const mortality = await logMortality({
    flock_id: data.flock_id,
    date: today,
    count: data.count,
    bird_age_days: birdAgeDays,
    age_category: ageCategory,
    suspected_cause: data.suspected_cause,
    custom_cause: data.custom_cause || null,
    bird_count_before_event: data.bird_count_before_event,
    cost_per_bird_at_death: costPerBird.toFixed(2),
    actual_loss_naira: actualLoss.toFixed(2)
  })

  if (!mortality) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  const newCount = data.bird_count_before_event - data.count
  await updateBirdCount(data.flock_id, newCount)

  const flockIndex = session.active_flocks.findIndex(f => f.id === data.flock_id)
  if (flockIndex !== -1) {
    session.active_flocks[flockIndex].current_bird_count = newCount
  }

  await saveUndoEntry(session.farmer_id, {
    type: 'MORTALITY',
    record_id: mortality.id,
    table: 'mortality_logs',
    flock_id: data.flock_id,
    bird_count_before_event: data.bird_count_before_event,
    description: `${data.count} bird death(s) logged for ${data.flock_name}`
  })

  const mortalityRate = (data.count / data.bird_count_before_event) * 100
  const highMortality = mortalityRate >= 5

  let alertMessage = ''
  if (highMortality) {
    alertMessage =
      `\n\n⚠️ This is a high mortality event (${mortalityRate.toFixed(1)}% of your flock). ` +
      `Would you like to run a health check?`
  }

  // Clear flow before recount prompt
  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  await ctx.reply(
    `✅ Mortality recorded.\n\n` +
    `🐔 Flock: ${data.flock_name}\n` +
    `💀 Birds lost: ${data.count}\n` +
    `🐣 Remaining birds: ${newCount}\n` +
    `📅 Age: ${birdAgeDays} days (${ageCategory})\n` +
    `💰 Estimated loss: ₦${actualLoss.toFixed(0)}` +
    alertMessage,
    highMortality
      ? {
          reply_markup: {
            keyboard: [
              [{ text: '❤️ Run Health Check' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      : mainMenuKeyboard
  )

  // Ask recount prompt after mortality
  await askRecountPrompt(ctx, session, data.flock_id, data.flock_name, newCount)
}

module.exports = {
  startMortalityLogging,
  handleMortalityStep
}