const model = require('../config/gemini')

async function generateResponse(instruction, context) {
  try {
    const prompt =
      `You are Farma Assista, a friendly poultry farm assistant on Telegram helping Nigerian smallholder farmers.\n\n` +
      `CONTEXT:\n` +
      `Farmer name: ${context.farmer_name}\n` +
      `Farm name: ${context.farm_name}\n` +
      `Active flocks: ${context.active_flocks?.map(f => `${f.flock_name} (${f.type})`).join(', ') || 'None'}\n\n` +
      `INSTRUCTION:\n${instruction}\n\n` +
      `RULES:\n` +
      `- Write in warm, simple, plain English\n` +
      `- Keep responses short — this is a chat app not an email\n` +
      `- Use emojis occasionally to make it friendly\n` +
      `- Never use technical jargon\n` +
      `- Address the farmer by first name\n` +
      `- If the instruction has data (numbers, naira amounts), include them accurately\n` +
      `- Maximum 3 short paragraphs\n` +
      `- Do not repeat the instruction back\n` +
      `- Write the message only, no preamble`

    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (err) {
    console.error('Response generation error:', err.message)
    return null
  }
}

module.exports = { generateResponse }