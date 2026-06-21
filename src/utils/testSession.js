require('dotenv').config()
const {
  getSession,
  saveSession,
  clearSession,
  createNewSession
} = require('./sessionManager')

async function testSession() {
  const testFarmerId = 'test_farmer_123'

  console.log('Testing session manager...')

  // Create a new session
  const newSession = createNewSession(testFarmerId)
  console.log('Created new session:', newSession)

  // Save it
  await saveSession(testFarmerId, newSession)
  console.log('Session saved')

  // Retrieve it
  const retrieved = await getSession(testFarmerId)
  console.log('Retrieved session:', retrieved)

  // Update it
  retrieved.farmer_name = 'Emeka'
  retrieved.current_flow = 'ONBOARDING'
  await saveSession(testFarmerId, retrieved)
  console.log('Session updated')

  // Retrieve again to confirm update
  const updated = await getSession(testFarmerId)
  console.log('Updated session:', updated)

  // Clear it
  await clearSession(testFarmerId)
  console.log('Session cleared')

  // Confirm it is gone
  const gone = await getSession(testFarmerId)
  console.log('Session after clear:', gone)

  console.log('Session manager test complete')
}

testSession()