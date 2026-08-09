require('dotenv').config()
const { detectIntent } = require('./intentDetector')
const { generateResponse } = require('./responseGenerator')

async function testGemini() {
  console.log('Testing Gemini integration...\n')

  // Test intent detection
  const testMessages = [
    'my bird don dey die since morning',
    'feed don finish',
    'I want to check my profit',
    'dem dey sick, droppings green',
    'how many eggs today',
    'I bought 10 bags of feed'
  ]

  console.log('--- Intent Detection ---')
  for (const message of testMessages) {
    const intent = await detectIntent(message, 'Solomon')
    console.log(`"${message}" → ${intent}`)
  }

  // Test response generation
  console.log('\n--- Response Generation ---')
  const response = await generateResponse(
    'Tell the farmer their feed consumption of 12.5kg STARTER has been recorded for June Flock. Current stock is 3 days remaining.',
    {
      farmer_name: 'Solomon',
      farm_name: 'Sunrise Farms',
      active_flocks: [{ flock_name: 'June Flock', type: 'BROILER' }]
    }
  )
  console.log('Generated response:')
  console.log(response)

  console.log('\nGemini test complete')
  process.exit(0)
}

testGemini().catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})