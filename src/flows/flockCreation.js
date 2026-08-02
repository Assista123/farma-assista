const { createFlock, getBirdAgeDays } = require('../services/flockService')
const { generateVaccinationSchedule } = require('../services/vaccinationService')
const { saveSession } = require('../utils/sessionManager')

// Start flock creation flow
async function startFlockCreation(ctx, session, flockType) {
  session.current_flow = 'FLOCK_CREATION'
  session.current_step = 'ASK_FLOCK_NAME'
  session.collected_data = {
    type: flockType
  }

  await saveSession(session.farmer_id, session)

  const typeLabel = flockType === 'BROILER' ? 'broiler (meat)' : 'layer (egg)'

  await ctx.reply(
    `Great! Let us set up your ${typeLabel} flock. 🐔\n\n` +
    `What would you like to call this flock?\n\n` +
    `For example: March Batch, Backyard Birds, Main Flock`
  )
}

// Handle each step of flock creation
async function handleFlockCreationStep(ctx, session) {
  const input = ctx.message.text.trim()
  const currentStep = session.current_step

  // ASK_FLOCK_NAME
  if (currentStep === 'ASK_FLOCK_NAME') {
    if (input.length < 2) {
      await ctx.reply('Please enter a name for this flock.')
      return
    }

    session.collected_data.flock_name = input
    session.current_step = 'ASK_BIRD_COUNT'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Nice name — ${input}! 👍\n\n` +
      `How many birds are in this flock?`
    )
    return
  }

  // ASK_BIRD_COUNT
  if (currentStep === 'ASK_BIRD_COUNT') {
    const count = parseInt(input)

    if (isNaN(count) || count < 1 || count > 500) {
      await ctx.reply(
        'Please enter a valid number of birds between 1 and 500.'
      )
      return
    }

    session.collected_data.initial_bird_count = count
    session.current_step = 'ASK_BREED'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Got it — ${count} birds. 🐥\n\n` +
      `What breed are they?\n\n` +
      `Common breeds:\n` +
      `• Broilers: Marshall, Arbor Acres, Ross 308, Cobb 500\n` +
      `• Layers: Isa Brown, Lohmann Brown, Hisex Brown\n\n` +
      `If you are not sure, just say "Not sure" and we will skip this.`
    )
    return
  }

  // ASK_BREED
  if (currentStep === 'ASK_BREED') {
    const breed = input.toLowerCase() === 'not sure' ? null : input

    session.collected_data.breed = breed
    session.current_step = 'ASK_START_DATE'
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `Got it! 📅\n\n` +
      `When did these birds arrive on your farm?\n\n` +
      `Please enter the date like this: 15 June 2026\n` +
      `Or type TODAY if they just arrived.`
    )
    return
  }

  // ASK_START_DATE
  if (currentStep === 'ASK_START_DATE') {
    let startDate

    if (input.toUpperCase() === 'TODAY') {
      startDate = new Date().toISOString().split('T')[0]
    } else {
      const parsed = new Date(input)
      if (isNaN(parsed.getTime())) {
        await ctx.reply(
          'Sorry, I did not understand that date.\n\n' +
          'Please try again like this: 15 June 2026\n' +
          'Or type TODAY if they just arrived.'
        )
        return
      }
      startDate = parsed.toISOString().split('T')[0]
    }

    session.collected_data.start_date = startDate
    session.current_step = 'CONFIRM'
    await saveSession(session.farmer_id, session)

    const data = session.collected_data
    const breedText = data.breed || 'Not specified'
    const ageDays = getBirdAgeDays(startDate)

    await ctx.reply(
      `Let me confirm your flock details:\n\n` +
      `🐔 Flock name: ${data.flock_name}\n` +
      `📋 Type: ${data.type}\n` +
      `🔢 Birds: ${data.initial_bird_count}\n` +
      `🧬 Breed: ${breedText}\n` +
      `📅 Start date: ${startDate}\n` +
      `🗓️ Age: ${ageDays} days old\n\n` +
      `Is this correct? Reply YES to save or NO to start over.`
    )
    return
  }

  // CONFIRM
  if (currentStep === 'CONFIRM') {
    if (input.toUpperCase() === 'NO') {
      await startFlockCreation(ctx, session, session.collected_data.type)
      return
    }

    if (input.toUpperCase() !== 'YES') {
      await ctx.reply('Please reply YES to confirm or NO to start over.')
      return
    }

    // Save flock to database
    const data = session.collected_data
    const flock = await createFlock({
      farmer_id: session.farmer_db_id,
      flock_name: data.flock_name,
      type: data.type,
      breed: data.breed,
      initial_bird_count: data.initial_bird_count,
      start_date: data.start_date
    })

    if (!flock) {
      await ctx.reply(
        'Sorry, something went wrong saving your flock. Please try again.'
      )
      return
    }

    // Generate vaccination schedule automatically
    await generateVaccinationSchedule(
      flock.id,
      flock.type,
      flock.start_date
    )

    // Update session
    session.active_flocks.push({
      id: flock.id,
      flock_name: flock.flock_name,
      type: flock.type
    })
    session.current_flow = null
    session.current_step = null
    session.collected_data = {}
    await saveSession(session.farmer_id, session)

    await ctx.reply(
      `${flock.flock_name} has been added successfully! 🎉\n\n` +
      `📋 ${data.initial_bird_count} ${data.type} birds registered\n` +
      `💉 Vaccination schedule generated automatically\n\n` +
      `You are all set up and ready to go!\n\n` +
      `Here is what you can do:\n` +
      `• Log daily feed\n` +
      `• Record bird deaths\n` +
      `• Check stock levels\n` +
      `• Run a health check\n` +
      `• See your profit summary\n\n` +
      `What would you like to do first?`,
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
    return
  }
}

module.exports = {
  startFlockCreation,
  handleFlockCreationStep
}