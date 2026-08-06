const { createFarmer } = require('../services/farmerService')
const { saveSession, clearSession } = require('../utils/sessionManager')
const { mainMenuKeyboard } = require('../utils/keyboards')

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
    `What is your name?`,
    {
      reply_markup: {
        keyboard: [[{ text: '🏠 Main Menu' }]],
        resize_keyboard: true
      }
    }
  )
}

async function handleOnboardingStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  if (currentStep === 'ASK_NAME') {
    if (input.length < 2) {
      await ctx.reply(
        'Please enter your full name.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.collected_data.name = input
    session.current_step = 'ASK_FARM_NAME'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Nice to meet you, ${input}! 👋\n\n` +
      `What is the name of your farm?\n\n` +
      `(If you do not have a name yet, you can just say "My Farm")`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_FARM_NAME') {
    if (input.length < 2) {
      await ctx.reply(
        'Please enter a name for your farm.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.collected_data.farm_name = input
    session.current_step = 'ASK_STATE'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Great name! 🏡\n\n` +
      `Which state is ${input} located in?\n\n` +
      `For example: Lagos, Abuja, Kano, Oyo, Rivers`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_STATE') {
    if (input.length < 2) {
      await ctx.reply(
        'Please enter your state.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

    session.collected_data.state = input
    session.current_step = 'ASK_LGA'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Got it — ${input}.\n\n` +
      `What Local Government Area (LGA) is your farm in?`,
      {
        reply_markup: {
          keyboard: [[{ text: '🏠 Main Menu' }]],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'ASK_LGA') {
    if (input.length < 2) {
      await ctx.reply(
        'Please enter your LGA.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
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
      `Is this correct?`,
      {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Yes, looks good' }, { text: '❌ No, start over' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
        }
      }
    )
    return
  }

  if (currentStep === 'CONFIRM') {
    if (input === '❌ No, start over') {
      await startOnboarding(ctx, session)
      return
    }

    if (input !== '✅ Yes, looks good') {
      await ctx.reply(
        'Please use the buttons to confirm or start over.',
        {
          reply_markup: {
            keyboard: [
              [{ text: '✅ Yes, looks good' }, { text: '❌ No, start over' }],
              [{ text: '🏠 Main Menu' }]
            ],
            resize_keyboard: true
          }
        }
      )
      return
    }

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
        'Sorry, something went wrong saving your details. Please try again.',
        {
          reply_markup: {
            keyboard: [[{ text: '🏠 Main Menu' }]],
            resize_keyboard: true
          }
        }
      )
      return
    }

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
            [{ text: 'I have both' }],
            [{ text: '🏠 Main Menu' }]
          ],
          resize_keyboard: true
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