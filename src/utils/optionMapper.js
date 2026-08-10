const model = require('../config/gemini')

// Map free text input to the closest valid option
async function mapToOption(input, validOptions, context = '') {
  try {
    const prompt =
      `You are helping a Nigerian poultry farmer use a farm management app.\n\n` +
      `The farmer typed: "${input}"\n\n` +
      `${context ? `Context: ${context}\n\n` : ''}` +
      `Map their input to exactly one of these valid options:\n` +
      `${validOptions.join('\n')}\n\n` +
      `Rules:\n` +
      `- Understand Nigerian Pidgin English\n` +
      `- Understand misspellings and abbreviations\n` +
      `- Return ONLY the exact text of the matching option\n` +
      `- If nothing matches return: NO_MATCH\n` +
      `- No explanation, just the option text`

    const result = await model.generateContent(prompt)
    const mapped = result.response.text().trim()

    if (mapped === 'NO_MATCH' || !validOptions.includes(mapped)) {
      return null
    }

    return mapped
  } catch (err) {
    console.error('Option mapping error:', err.message)
    return null
  }
}

// Map a number from free text
async function mapToNumber(input, context = '') {
  try {
    const prompt =
      `Extract a number from this farmer's message.\n\n` +
      `Message: "${input}"\n` +
      `${context ? `Context: ${context}\n` : ''}` +
      `Rules:\n` +
      `- Understand Nigerian Pidgin (e.g. "e don reach 10" = 10)\n` +
      `- Understand written numbers (e.g. "five" = 5)\n` +
      `- Return ONLY the number, nothing else\n` +
      `- If no number found return: NO_NUMBER`

    const result = await model.generateContent(prompt)
    const mapped = result.response.text().trim()

    if (mapped === 'NO_NUMBER') return null

    const num = parseFloat(mapped)
    return isNaN(num) ? null : num
  } catch (err) {
    console.error('Number mapping error:', err.message)
    return null
  }
}

module.exports = { mapToOption, mapToNumber }