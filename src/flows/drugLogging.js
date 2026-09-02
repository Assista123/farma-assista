const { logDrug } = require('../services/drugService')
const { saveUndoEntry } = require('../utils/undoManager')
const { saveSession } = require('../utils/sessionManager')
const { mainMenuKeyboard, buildGridKeyboard } = require('../utils/keyboards')
const { mapToOption } = require('../utils/optionMapper')
const { suggestNextAction } = require('../utils/nextActionHelper')

// Common drugs used in Nigerian poultry farming
const COMMON_DRUGS = [
  'Amprolium',
  'Toltrazuril',
  'Enrofloxacin',
  'Tylosin',
  'Tetracycline',
  'Amoxicillin',
  'Levamisole',
  'Multivitamin',
  'Electrolytes',
  'Other (type name)'
]

// Common conditions
const COMMON_CONDITIONS = [
  'Coccidiosis',
  'Newcastle Disease',
  'Gumboro Disease',
  'Respiratory infection',
  'E. coli infection',
  'Worm infestation',
  'General prevention',
  'Stress treatment',
  'Other'
]

async function startDrugLogging(ctx, session) {
  if (session.active_flocks.length === 0) {
    await ctx.reply('You have no active flocks to log drugs for.', mainMenuKeyboard)
    return
  }

  session.current_flow = 'DRUG_LOGGING'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  if (session.active_flocks.length === 1) {
    const flock = session.active_flocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_DRUG_NAME'
    await saveSession(session.farmer_id, session)

    await askDrugName(ctx, flock.flock_name)
    return
  }

  const flockButtons = buildGridKeyboard(
    session.active_flocks.map(f => f.flock_name),
    2
  )

  await ctx.reply('💊 Drug / Medication Log\n\nWhich flock are you treating?', {
    reply_markup: {
      keyboard: flockButtons,
      resize_keyboard: true
    }
  })
}

async function handleDrugStep(ctx, session) {
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
    session.current_step = 'ASK_DRUG_NAME'
    await saveSession(session.farmer_id, session)

    await askDrugName(ctx, flock.flock_name)
    return
  }

  if (currentStep === 'ASK_DRUG_NAME') {
    let drugName = input

    if (input === 'Other (type name)') {
      session.current_step = 'ASK_DRUG_NAME_CUSTOM'
      await saveSession(session.farmer_id, session)

      await ctx.reply('Please type the name of the drug:', {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      })
      return
    }

    session.collected_data.drug_name = drugName
    session.current_step = 'ASK_CONDITION'
    await saveSession(session.farmer_id, session)
    await askCondition(ctx)
    return
  }

  if (currentStep === 'ASK_DRUG_NAME_CUSTOM') {
    if (input.length < 2) {
      await ctx.reply('Please enter a valid drug name.')
      return
    }

    session.collected_data.drug_name = input
    session.current_step = 'ASK_CONDITION'
    await saveSession(session.farmer_id, session)
    await askCondition(ctx)
    return
  }

  if (currentStep === 'ASK_CONDITION') {
    let condition = input
    if (input !== 'Other' && !COMMON_CONDITIONS.includes(input)) {
      const mapped = await mapToOption(
        input,
        COMMON_CONDITIONS,
        'Farmer is selecting the condition being treated'
      )
      condition = mapped || input
    }
    session.collected_data.condition_treated = condition === 'Other' ? null : condition
    session.current_step = 'ASK_DOSAGE'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `What dosage did you give?\n\n` +
        `For example:\n` +
        `• 1 teaspoon per 4 litres of water\n` +
        `• 1ml per kg body weight\n` +
        `• As per manufacturer instructions\n\n` +
        `Or tap Skip if not sure.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: 'As per manufacturer instructions' }],
            [{ text: 'Skip' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_DOSAGE') {
    session.collected_data.dosage_given = input === 'Skip' ? null : input
    session.current_step = 'ASK_WITHDRAWAL'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `What is the withdrawal period for this drug?\n\n` +
        `💡 The withdrawal period is how many days you must wait ` +
        `after the last dose before selling birds or eggs.\n\n` +
        `Enter number of days. For example: 7\n` +
        `Or tap Skip if not applicable or unknown.`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '3' }, { text: '5' }, { text: '7' }],
            [{ text: '10' }, { text: '14' }, { text: '21' }],
            [{ text: 'Skip' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_WITHDRAWAL') {
    if (input === 'Skip') {
      session.collected_data.withdrawal_period_days = null
    } else {
      const days = parseInt(input, 10)
      if (isNaN(days) || days < 0) {
        await ctx.reply('Please enter a valid number of days or tap Skip.')
        return
      }
      session.collected_data.withdrawal_period_days = days
    }

    session.current_step = 'ASK_COST'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `How much did this drug cost in total?\n\n` +
        `Enter amount in Naira. For example: 3500\n` +
        `Or tap Skip if not sure.`,
      {
        reply_markup: {
          keyboard: [[{ text: 'Skip' }], [{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_COST') {
    if (input === 'Skip') {
      session.collected_data.cost_naira = null
    } else {
      const cost = parseFloat(input)
      if (isNaN(cost) || cost < 0) {
        await ctx.reply('Please enter a valid amount or tap Skip.')
        return
      }
      session.collected_data.cost_naira = cost
    }

    session.current_step = 'ASK_NOTES'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Any additional notes?\n\n` +
        `For example: Day 1 of 5-day treatment\n\n` +
        `Or tap Skip.`,
      {
        reply_markup: {
          keyboard: [[{ text: 'Skip' }], [{ text: '🏠 Main Menu' }]],
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
      await startDrugLogging(ctx, session)
      return
    }

    if (input !== '✅ Yes, save it') {
      await ctx.reply('Please use the buttons to confirm or start over.')
      return
    }

    await saveDrugLog(ctx, session)
    return
  }
}

async function askDrugName(ctx, flockName) {
  const drugButtons = buildGridKeyboard(COMMON_DRUGS, 2)

  await ctx.reply(
    `💊 Drug Log — ${flockName}\n\nWhat drug or medication are you giving?`,
    {
      reply_markup: {
        keyboard: drugButtons,
        resize_keyboard: true
      }
    }
  )
}

async function askCondition(ctx) {
  const conditionButtons = buildGridKeyboard(COMMON_CONDITIONS, 2)

  await ctx.reply(`What condition are you treating?`, {
    reply_markup: {
      keyboard: conditionButtons,
      resize_keyboard: true
    }
  })
}

async function showConfirmation(ctx, session) {
  const data = session.collected_data

  await ctx.reply(
    `Please confirm drug log:\n\n` +
      `💊 Drug: ${data.drug_name}\n` +
      `🐔 Flock: ${data.flock_name}\n` +
      `🦠 Condition: ${data.condition_treated || 'Not specified'}\n` +
      `💉 Dosage: ${data.dosage_given || 'Not specified'}\n` +
      `⏳ Withdrawal: ${data.withdrawal_period_days ? `${data.withdrawal_period_days} days` : 'Not applicable'}\n` +
      `💰 Cost: ${data.cost_naira ? `₦${data.cost_naira.toLocaleString()}` : 'Not recorded'}\n` +
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

async function saveDrugLog(ctx, session) {
  const data = session.collected_data
  const today = new Date().toISOString().split('T')[0]

  const log = await logDrug({
    flock_id: data.flock_id,
    date: today,
    drug_name: data.drug_name,
    condition_treated: data.condition_treated,
    dosage_given: data.dosage_given,
    withdrawal_period_days: data.withdrawal_period_days,
    cost_naira: data.cost_naira,
    notes: data.notes
  })

  if (!log) {
    await ctx.reply('Sorry, something went wrong. Please try again.')
    return
  }

  await saveUndoEntry(session.farmer_id, {
    type: 'DRUG_LOG',
    record_id: log.id,
    table: 'drug_logs',
    description: `${data.drug_name} administered to ${data.flock_name}`
  })

  const flock = session.active_flocks.find(f => f.id === data.flock_id) || null

  session.current_flow = null
  session.current_step = null
  session.collected_data = {}
  await saveSession(session.farmer_id, session)

  let withdrawalWarning = ''
  if (log.withdrawal_end_date) {
    withdrawalWarning =
      `\n\n⚠️ Withdrawal period: ${data.withdrawal_period_days} days\n` +
      `🚫 Do not sell birds or eggs before: ${log.withdrawal_end_date}\n` +
      `We will remind you when it is safe to sell.`
  }

  let costNote = ''
  if (data.cost_naira) {
    costNote = `\n💰 Cost recorded: ₦${data.cost_naira.toLocaleString()}`
  }

  const suggestion = await suggestNextAction(session, { type: 'DRUG_LOG', flock })

  await ctx.reply(
    `✅ Drug log recorded!\n\n` +
      `💊 ${data.drug_name}\n` +
      `🐔 Flock: ${data.flock_name}\n` +
      `🦠 Treating: ${data.condition_treated || 'Not specified'}` +
      costNote +
      withdrawalWarning +
      (suggestion || ''),
    mainMenuKeyboard
  )
}

module.exports = {
  startDrugLogging,
  handleDrugStep
}