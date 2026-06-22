const { createFarmer } = require('../services/farmerService')
const { saveSession, clearSession } = require('../utils/sessionManager')

// All the steps in the onboarding flow in order
const STEPS = [
  'ASK_NAME',
  'ASK_FARM_NAME',
  'ASK_STATE',
  'ASK_LGA',
  'CONFIRM'
]

// The first message when a new farmer starts
async function startOnboarding(ctx, session) {
  session.current_flow = 'ONBOARDING'
  session.current_step = 'ASK_NAME'
  session.collected_data = {}

  await saveSession(session.farmer_id, session)

  await ctx.reply(
    `Welcome to Farma Assista! 🐔\n\n` +
    `I am here to help you manage your poultry farm — ` +
    `track your birds, monitor health, manage stock, ` +
    `and see how much profit you are making.\n\n` +
    `Let us get you set up. This will only take 2 minutes.\n\n` +
    `What is your name?`
  )
}

// Handle each step as the farmer responds
async function handleOnboardingStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  // ASK_NAME — collect farmer's name
  if (currentStep === 'ASK_NAME') {
    if (input.length < 2) {
      await ctx.reply('Please enter your full name.')
      return
    }

    session.collected_data.name = input
    session.current_step = 'ASK_FARM_NAME'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Nice to meet you, ${input}! 👋\n\n` +
      `What is the name of your farm?\n\n` +
      `(If you do not have a name yet, you can just say "My Farm")`
    )
    return
  }

  // ASK_FARM_NAME — collect farm name
  if (currentStep === 'ASK_FARM_NAME') {
    if (input.length < 2) {
      await ctx.reply('Please enter a name for your farm.')
      return
    }

    session.collected_data.farm_name = input
    session.current_step = 'ASK_STATE'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Great name! 🏡\n\n` +
      `Which state is ${input} located in?\n\n` +
      `For example: Lagos, Abuja, Kano, Oyo, Rivers`
    )
    return
  }

  // ASK_STATE — collect state
  if (currentStep === 'ASK_STATE') {
    if (input.length < 2) {
      await ctx.reply('Please enter your state.')
      return
    }

    session.collected_data.state = input
    session.current_step = 'ASK_LGA'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Got it — ${input}.\n\n` +
      `What Local Government Area (LGA) is your farm in?`
    )
    return
  }

  // ASK_LGA — collect LGA
  if (currentStep === 'ASK_LGA') {
    if (input.length < 2) {
      await ctx.reply('Please enter your LGA.')
      return
    }

    session.collected_data.lga = input
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)

    const data = session.collected_data

    await ctx.reply(
      `Almost done! Let me confirm your details:\n\n` +
      `👤 Name: ${data.name}\n` +
      `🏡 Farm: ${data.farm_name}\n` +
      `📍 Location: ${data.lga}, ${data.state}\n\n` +
      `Is this correct? Reply YES to continue or NO to start over.`
    )
    return
  }

  // CONFIRM — save to database or restart
  if (currentStep === 'CONFIRM') {
    if (input.toUpperCase() === 'NO') {
      // Start over
      await startOnboarding(ctx, session)
      return
    }

    if (input.toUpperCase() !== 'YES') {
      await ctx.reply('Please reply YES to confirm or NO to start over.')
      return
    }

    // Save farmer to database
    const data = session.collected_data
    const farmer = await createFarmer({
      phone_number: session.farmer_id,
      name: data.name,
      farm_name: data.farm_name,
      state: data.state,
      lga: data.lga
    })

    if (!farmer) {
      await ctx.reply(
        'Sorry, something went wrong saving your details. Please try again.'
      )
      return
    }

    // Update session with farmer info
    session.is_registered = true
    session.farmer_name = farmer.name
    session.farm_name = farmer.farm_name
    session.farmer_db_id = farmer.id
    session.current_flow = null
    session.current_step = null
    session.collected_data = {}

    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Welcome to Farma Assista, ${farmer.name}! 🎉\n\n` +
      `${farmer.farm_name} is now registered.\n\n` +
      `Next, let us add your first flock of birds.\n\n` +
      `Do you have BROILER (meat) birds or LAYER (egg) birds?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '🐔 Broiler' }, { text: '🥚 Layer' }],
            [{ text: 'I have both' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    )
    return
  }
}

module.exports = {
  startOnboarding,
  handleOnboardingStep
}