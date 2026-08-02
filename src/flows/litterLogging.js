const {
  logLitterCondition,
  checkConsecutiveWetLitter
} = require('../services/litterService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')

async function startLitterLogging(ctx, session) {
  // Only relevant for broiler flocks
  const broilerFlocks = session.active_flocks.filter(f => f.type === 'BROILER')

  if (broilerFlocks.length === 0) {
    await ctx.reply(
      'Litter condition logging is for broiler flocks.\n\n' +
      'You do not have any active broiler flocks.',
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  session.current_flow = 'LITTER_LOGGING'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (broilerFlocks.length === 1) {
    const flock = broilerFlocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_MOISTURE'
    await saveSession(session.farmer_id, session)

    await askMoisture(ctx, flock.flock_name)
    return
  }

  const flockButtons = broilerFlocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '🪹 Litter Condition\n\nWhich flock are you checking?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleLitterStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_FLOCK') {
    const flock = session.active_flocks.find(
      f => f.flock_name === input && f.type === 'BROILER'
    )

    if (!flock) {
      await ctx.reply('Please select a broiler flock from the options.')
      return
    }

    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_MOISTURE'
    await saveSession(session.farmer_id, session)

    await askMoisture(ctx, flock.flock_name)
    return
  }

  if (currentStep === 'ASK_MOISTURE') {
    const moistureMap = {
      '✅ Dry — perfect condition': 'DRY',
      '🟡 Slightly damp': 'SLIGHTLY_DAMP',
      '🟠 Wet': 'WET',
      '🔴 Very wet': 'VERY_WET'
    }

    const moisture = moistureMap[input]

    if (!moisture) {
      await ctx.reply('Please select an option from the buttons.')
      return
    }

    session.collected_data.moisture_level = moisture
    session.current_step = 'ASK_CAKING'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Is the litter caking — forming hard clumps on the floor?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '✅ No caking' }, { text: '⚠️ Yes, caking present' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_CAKING') {
    if (input !== '✅ No caking' && input !== '⚠️ Yes, caking present') {
      await ctx.reply('Please use the buttons to select an option.')
      return
    }

    session.collected_data.caking = input === '⚠️ Yes, caking present'
    session.current_step = 'ASK_ODOUR'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How is the smell in the pen today?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Normal smell' }],
            [{ text: '🟡 Strong smell' }],
            [{ text: '🔴 Very strong smell' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_ODOUR') {
    const odourMap = {
      '✅ Normal smell': 'NORMAL',
      '🟡 Strong smell': 'STRONG',
      '🔴 Very strong smell': 'VERY_STRONG'
    }

    const odour = odourMap[input]

    if (!odour) {
      await ctx.reply('Please select an option from the buttons.')
      return
    }

    session.collected_data.odour_level = odour
    session.current_step = 'ASK_SAWDUST'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Did you add fresh sawdust or litter material today?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Yes, added sawdust' }, { text: '❌ No' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_SAWDUST') {
    if (input !== '✅ Yes, added sawdust' && input !== '❌ No') {
      await ctx.reply('Please use the buttons to select an option.')
      return
    }

    session.collected_data.sawdust_added = input === '✅ Yes, added sawdust'
    session.current_step = 'ASK_NOTES'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Any additional notes about the litter or pen condition?\n\n` +
      `Tap Skip if nothing to add.`,
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

  if (currentStep === 'ASK_NOTES') {
    session.collected_data.notes = input === 'Skip' ? null : input
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)
    await showConfirmation(ctx, session)
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startLitterLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveLitterCondition(ctx, session)
    return
  }
}

async function askMoisture(ctx, flockName) {
  await ctx.reply(
    `🪹 Litter Condition — ${flockName}\n\n` +
    `How would you describe the litter moisture today?\n\n` +
    `💡 Good litter should be dry and crumbly — ` +
    `like dry soil you can break apart easily.`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Dry — perfect condition' }],
          [{ text: '🟡 Slightly damp' }],
          [{ text: '🟠 Wet' }],
          [{ text: '🔴 Very wet' }],
          [{ text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

async function showConfirmation(ctx, session) {
  const data = session.collected_data

  const moistureLabels = {
    'DRY': '✅ Dry',
    'SLIGHTLY_DAMP': '🟡 Slightly damp',
    'WET': '🟠 Wet',
    'VERY_WET': '🔴 Very wet'
  }

  const odourLabels = {
    'NORMAL': '✅ Normal',
    'STRONG': '🟡 Strong',
    'VERY_STRONG': '🔴 Very strong'
  }

  await ctx.reply(
    `Please confirm litter condition:\n\n` +
    `🐔 Flock: ${data.flock_name}\n` +
    `💧 Moisture: ${moistureLabels[data.moisture_level]}\n` +
    `🧱 Caking: ${data.caking ? '⚠️ Yes' : '✅ No'}\n` +
    `👃 Odour: ${odourLabels[data.odour_level]}\n` +
    `🪵 Sawdust added: ${data.sawdust_added ? '✅ Yes' : '❌ No'}\n` +
    `📝 Notes: ${data.notes || 'None'}\n\n` +
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

async function saveLitterCondition(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const log = await logLitterCondition({
    flock_id: data.flock_id,
    date: today,
    moisture_level: data.moisture_level,
    caking: data.caking,
    odour_level: data.odour_level,
    sawdust_added: data.sawdust_added,
    notes: data.notes
  })

  if (!log) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  await saveUndoEntry(session.farmer_id, {
    type: 'LITTER_CONDITION',
    record_id: log.id,
    table: 'litter_condition_logs',
    description: `Litter condition logged for ${data.flock_name}`
  })

  // Check consecutive wet litter days
  const wetDays = await checkConsecutiveWetLitter(data.flock_id)

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  // Build advisory message
  let advisory = ''

  if (data.moisture_level === 'VERY_WET') {
    advisory =
      `\n\n🔴 Very wet litter is urgent.\n` +
      `• Remove and replace litter immediately\n` +
      `• Check drinkers for leaks\n` +
      `• Improve ventilation\n` +
      `• Very wet litter causes ammonia buildup which damages bird lungs`
  } else if (data.moisture_level === 'WET') {
    advisory =
      `\n\n🟠 Wet litter needs attention.\n` +
      `• Add fresh dry sawdust on top\n` +
      `• Check drinkers for leaks\n` +
      `• Increase ventilation if possible`
  } else if (data.moisture_level === 'SLIGHTLY_DAMP') {
    advisory =
      `\n\n🟡 Slightly damp — monitor closely.\n` +
      `• Add sawdust if it gets worse\n` +
      `• Check water spillage around drinkers`
  }

  if (wetDays >= 3) {
    advisory +=
      `\n\n⚠️ Alert: Litter has been wet or very wet for ${wetDays} consecutive days.\n` +
      `This significantly increases risk of:\n` +
      `• Coccidiosis\n` +
      `• Respiratory disease\n` +
      `• Footpad dermatitis\n\n` +
      `Consider a health check if birds show any symptoms.`
  }

  if (data.caking) {
    advisory +=
      `\n\n⚠️ Caking detected — break up clumps manually and add fresh litter. ` +
      `Caked litter prevents proper drying and harbours bacteria.`
  }

  if (data.odour_level === 'VERY_STRONG') {
    advisory +=
      `\n\n🔴 Very strong odour indicates high ammonia levels. ` +
      `This is harmful to bird lungs and your own health. ` +
      `Increase ventilation immediately and change litter as soon as possible.`
  }

  await ctx.reply(
    `✅ Litter condition recorded!\n\n` +
    `🐔 Flock: ${data.flock_name}\n` +
    `💧 Moisture: ${data.moisture_level.replace('_', ' ')}\n` +
    `👃 Odour: ${data.odour_level}\n` +
    `🪵 Sawdust added: ${data.sawdust_added ? 'Yes' : 'No'}` +
    advisory +
    `\n\nWhat would you like to do next?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '📋 Daily Logs' }, { text: '💵 Sales & Finance' }],
          [{ text: '📦 Farm Management' }, { text: '🏠 Main Menu' }]
        ],
        resize_keyboard: true
      }
    }
  )
}

module.exports = {
  startLitterLogging,
  handleLitterStep
}