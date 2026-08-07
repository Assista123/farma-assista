const { saveSession } = require('../utils/sessionManager')
const { saveDiagnosisLog, getAllConditions } = require('../services/healthService')
const { getFlockById, getBirdAgeDays, getAgeCategory } = require('../services/flockService')
const supabase = require('../config/database')

// All symptoms with plain language labels
const SYMPTOMS = [
  { key: 'sudden_deaths', label: 'Sudden deaths without warning' },
  { key: 'lethargy', label: 'Birds sluggish and not moving around' },
  { key: 'not_eating', label: 'Birds not touching their feed' },
  { key: 'breathing_difficulty', label: 'Struggling to breathe, mouth open' },
  { key: 'twisted_neck', label: 'Neck bending backwards or sideways' },
  { key: 'ruffled_feathers', label: 'Feathers rough and puffed up' },
  { key: 'pale_comb', label: 'Red part on head looks faded or white' },
  { key: 'swollen_face', label: 'Face or flaps under beak look swollen' },
  { key: 'hunched_posture', label: 'Birds bending over and sitting low' },
  { key: 'coughing', label: 'Strange sounds from nose or throat' },
  { key: 'bloody_droppings', label: 'Blood visible in droppings' },
  { key: 'weight_loss', label: 'Birds losing weight or growing slowly' },
  { key: 'reduced_eggs', label: 'Fewer eggs than normal' }
]

const DROPPING_COLORS = [
  { label: '⬜ White or chalky', value: 'WHITE' },
  { label: '🟢 Green', value: 'GREEN' },
  { label: '🟤 Normal brown', value: 'BROWN' },
  { label: '🟡 Yellow or mustard', value: 'YELLOW' },
  { label: '🔴 Bloody or dark red', value: 'BLOODY' },
  { label: '⚪ Looks normal', value: 'NORMAL' }
]

const DROPPING_TEXTURES = [
  { label: '💧 Very watery and runny', value: 'WATERY' },
  { label: '🫧 Bubbly or foamy', value: 'FOAMY' },
  { label: '🟫 Firm and normal', value: 'SOLID' },
  { label: '🫠 Slimy or sticky', value: 'MUCOUSY' }
]

async function startHealthDiagnosis(ctx, session) {
  session.current_flow = 'HEALTH_DIAGNOSIS'
  session.current_step = 'ASK_FLOCK'
  session.collected_data = { symptoms: [] }
  await saveSession(session.farmer_id, session)

  if (session.active_flocks.length === 1) {
    const flock = session.active_flocks[0]
    session.collected_data.flock_id = flock.id
    session.collected_data.flock_name = flock.flock_name
    session.current_step = 'ASK_SYMPTOMS'
    await saveSession(session.farmer_id, session)
    await askSymptoms(ctx, [])
    return
  }

  const flockButtons = session.active_flocks.map(f => [{ text: f.flock_name }])
  flockButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    '❤️ Health Check\n\nWhich flock are you concerned about?',
    {
      reply_markup: {
        keyboard: flockButtons,
        resize_keyboard: true
      }
    }
  )
}

async function handleHealthDiagnosisStep(ctx, session) {
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
    session.current_step = 'ASK_SYMPTOMS'
    await saveSession(session.farmer_id, session)
    await askSymptoms(ctx, [])
    return
  }

  if (currentStep === 'ASK_SYMPTOMS') {
    if (input === '✅ Done selecting') {
      if (session.collected_data.symptoms.length === 0) {
        await ctx.reply(
          'Please select at least one symptom before continuing.',
          {
            reply_markup: {
              keyboard: buildSymptomKeyboard(session.collected_data.symptoms),
              resize_keyboard: true
            }
          }
        )
        return
      }

      session.current_step = 'ASK_DROPPING_COLOR'
      await saveSession(session.farmer_id, session)
      await askDroppingColor(ctx)
      return
    }

    // Check if symptom is being toggled
    const symptom = SYMPTOMS.find(s => s.label === input || `✓ ${s.label}` === input)

    if (!symptom) {
      await ctx.reply('Please select symptoms from the options.')
      return
    }

    const symptoms = session.collected_data.symptoms
    const index = symptoms.indexOf(symptom.key)

    if (index === -1) {
      symptoms.push(symptom.key)
    } else {
      symptoms.splice(index, 1)
    }

    session.collected_data.symptoms = symptoms
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `${symptoms.length} symptom(s) selected. Keep selecting or tap Done.`,
      {
        reply_markup: {
          keyboard: buildSymptomKeyboard(symptoms),
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_DROPPING_COLOR') {
    const color = DROPPING_COLORS.find(c => c.label === input)

    if (!color) {
      await ctx.reply('Please select a dropping color from the options.')
      return
    }

    session.collected_data.dropping_color = color.value
    session.current_step = 'ASK_DROPPING_TEXTURE'
    await saveSession(session.farmer_id, session)
    await askDroppingTexture(ctx)
    return
  }

  if (currentStep === 'ASK_DROPPING_TEXTURE') {
    const texture = DROPPING_TEXTURES.find(t => t.label === input)

    if (!texture) {
      await ctx.reply('Please select a dropping texture from the options.')
      return
    }

    session.collected_data.dropping_texture = texture.value
    session.current_step = 'DIAGNOSING'
    await saveSession(session.farmer_id, session)

    await ctx.reply('🔍 Analysing symptoms...')
    await runDiagnosis(ctx, session)
    return
  }

  if (currentStep === 'CONFIRM_VET') {
    if (input === '✅ Yes, connect me to a vet') {
      session.current_flow = null
      session.current_step = null
      session.collected_data = {}
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        '🩺 Vet consultation is coming in Phase 2.\n\n' +
        'For now please contact a local vet immediately.\n\n' +
        'In an emergency call : 07088388691',
        mainMenuKeyboard
      )
      return
    }

    if (input === '❌ I will manage for now') {
      session.current_flow = null
      session.current_step = null
      session.collected_data = {}
      await saveSession(session.farmer_id, session)

      await ctx.reply(
        'Okay. Please monitor your flock closely and do not delay if things get worse.',
        mainMenuKeyboard
      )
      return
    }
  }
}

function buildSymptomKeyboard(selectedSymptoms) {
  const keyboard = SYMPTOMS.map(s => {
    const isSelected = selectedSymptoms.includes(s.key)
    return [{ text: isSelected ? `✓ ${s.label}` : s.label }]
  })
  keyboard.push([{ text: '✅ Done selecting' }])
  keyboard.push([{ text: '🏠 Main Menu' }])
  return keyboard
}

async function askSymptoms(ctx, selectedSymptoms) {
  await ctx.reply(
    `❤️ Health Check\n\n` +
    `Select all symptoms you are seeing.\n` +
    `Tap a symptom to select it. Tap again to deselect.\n` +
    `Tap Done when finished.\n\n` +
    `💡 Be as accurate as possible for a better diagnosis.`,
    {
      reply_markup: {
        keyboard: buildSymptomKeyboard(selectedSymptoms),
        resize_keyboard: true
      }
    }
  )
}

async function askDroppingColor(ctx) {
  const colorButtons = DROPPING_COLORS.map(c => [{ text: c.label }])
  colorButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    'What colour are the droppings?\n\n' +
    '💡 Check fresh droppings on the litter or under perches.',
    {
      reply_markup: {
        keyboard: colorButtons,
        resize_keyboard: true
      }
    }
  )
}

async function askDroppingTexture(ctx) {
  const textureButtons = DROPPING_TEXTURES.map(t => [{ text: t.label }])
  textureButtons.push([{ text: '🏠 Main Menu' }])

  await ctx.reply(
    'What is the texture of the droppings?',
    {
      reply_markup: {
        keyboard: textureButtons,
        resize_keyboard: true
      }
    }
  )
}

async function runDiagnosis(ctx, session) {
  try {
    const data = session.collected_data
    const flock = await getFlockById(data.flock_id)
    const birdAgeDays = getBirdAgeDays(flock.start_date)
    const ageCategory = getAgeCategory(flock.type, birdAgeDays)

    // Get all conditions from database
    const conditions = await getAllConditions()

    if (!conditions || conditions.length === 0) {
      await ctx.reply(
        'Sorry, we could not run the diagnosis right now. Please try again.',
        mainMenuKeyboard
      )
      return
    }

    // Score each condition
    const scores = conditions.map(condition => {
      let score = 0
      let maxScore = 0

      // Symptom matching — 10 points each
      const conditionSymptoms = condition.symptoms.map(s => s.key)
      for (const symptom of data.symptoms) {
        maxScore += 10
        if (conditionSymptoms.includes(symptom)) score += 10
      }

      // Dropping color — 30 points
      maxScore += 30
      if (condition.dropping_colors.includes(data.dropping_color)) score += 30

      // Dropping texture — 25 points
      maxScore += 25
      if (condition.dropping_textures.includes(data.dropping_texture)) score += 25

      // Age vulnerability — 20 points
      maxScore += 20
      if (
        condition.age_vulnerability === 'ANY' ||
        condition.age_vulnerability === ageCategory
      ) score += 20

      // Flock type — 15 points
      maxScore += 15
      if (
        condition.flock_type === 'ANY' ||
        condition.flock_type === flock.type
      ) score += 15

      const percentage = maxScore > 0
        ? Math.round((score / maxScore) * 100)
        : 0

      return { condition, score, percentage }
    })

    // Sort by score descending
    scores.sort((a, b) => b.percentage - a.percentage)

    const topMatch = scores[0]
    const secondMatch = scores[1]

    // Determine confidence
    let confidence = 'UNCERTAIN'
    if (topMatch.percentage >= 90) confidence = 'HIGH'
    else if (topMatch.percentage >= 70) confidence = 'MODERATE'
    else if (topMatch.percentage >= 50) confidence = 'LOW'

    // Check if two conditions are close
    const twoConditionsClose = secondMatch &&
      (topMatch.percentage - secondMatch.percentage) <= 15 &&
      topMatch.percentage >= 50

    // Save diagnosis to database
    await saveDiagnosisLog({
      flock_id: data.flock_id,
      date: new Date().toISOString().split('T')[0],
      bird_age_days: birdAgeDays,
      symptoms_reported: data.symptoms,
      dropping_color: data.dropping_color,
      dropping_texture: data.dropping_texture,
      diagnosis_result: topMatch.condition.name,
      recommended_drugs: topMatch.condition.recommended_drugs,
      severity: topMatch.condition.severity,
      vet_escalated: topMatch.condition.always_escalate || twoConditionsClose || confidence === 'UNCERTAIN',
      followup_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    })

    // Build diagnosis message
    let diagnosisText = ''

    if (confidence === 'UNCERTAIN') {
      diagnosisText =
        `⚠️ We could not confidently identify the condition.\n\n` +
        `The symptoms you described do not clearly match a single condition. ` +
        `Please consult a vet immediately.`
    } else if (twoConditionsClose) {
      diagnosisText =
        `🔍 Two possible conditions detected:\n\n` +
        `1. ${topMatch.condition.name} (${topMatch.percentage}% match)\n` +
        `2. ${secondMatch.condition.name} (${secondMatch.percentage}% match)\n\n` +
        `These conditions need different treatments. ` +
        `Please consult a vet to confirm before treating.`
    } else {
      const confidenceText = {
        HIGH: `This looks like **${topMatch.condition.name}** (${topMatch.percentage}% match).`,
        MODERATE: `This could be **${topMatch.condition.name}** (${topMatch.percentage}% match). Monitor closely.`,
        LOW: `Possibly **${topMatch.condition.name}** (${topMatch.percentage}% match) but we are not certain.`
      }
      diagnosisText = confidenceText[confidence]
    }

    // Build drug recommendation
    let drugText = ''
    if (
      confidence !== 'UNCERTAIN' &&
      !twoConditionsClose &&
      topMatch.condition.recommended_drugs.length > 0
    ) {
      if (topMatch.condition.no_drug_note) {
        drugText = `\n\n💊 Treatment:\n${topMatch.condition.no_drug_note}`
      } else {
        drugText = `\n\n💊 Recommended treatment:`
        for (const drug of topMatch.condition.recommended_drugs) {
          drugText += `\n• ${drug.name}: ${drug.dosage}`
        }
      }
    }

    // Prevention note
    let preventionText = ''
    if (topMatch.condition.prevention_note) {
      preventionText = `\n\n🛡️ Prevention:\n${topMatch.condition.prevention_note}`
    }

    // Severity warning
    let severityText = ''
    if (topMatch.condition.severity === 'SEVERE') {
      severityText = `\n\n🔴 This is a SEVERE condition.`
    } else if (topMatch.condition.severity === 'MODERATE') {
      severityText = `\n\n🟡 This is a MODERATE condition.`
    }

    const needsVet = topMatch.condition.always_escalate ||
      twoConditionsClose ||
      confidence === 'UNCERTAIN' ||
      (topMatch.condition.severity === 'SEVERE' && confidence !== 'HIGH')

    session.current_step = needsVet ? 'CONFIRM_VET' : null
    session.current_flow = needsVet ? 'HEALTH_DIAGNOSIS' : null
    if (!needsVet) {
      session.collected_data = {}
    }
    await saveSession(session.farmer_id, session)

    const fullMessage =
      `❤️ Health Diagnosis — ${data.flock_name}\n\n` +
      `📅 Bird age: ${birdAgeDays} days\n\n` +
      diagnosisText +
      severityText +
      drugText +
      preventionText

    if (needsVet) {
      await ctx.reply(
        fullMessage +
        `\n\n🩺 We strongly recommend a vet consultation for this condition.\n\n` +
        `Would you like us to connect you to a vet?`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '✅ Yes, connect me to a vet' }],
              [{ text: '❌ I will manage for now' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
    } else {
      await ctx.reply(fullMessage, mainMenuKeyboard)
    }

  } catch (err) {
    console.error('Health diagnosis error:', err.message)
    await ctx.reply(
      'Sorry, something went wrong with the diagnosis. Please try again.',
      mainMenuKeyboard
    )
  }
}

module.exports = {
  startHealthDiagnosis,
  handleHealthDiagnosisStep
}