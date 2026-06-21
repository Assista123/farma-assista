const redis = require('../config/redis')

// How long a session stays alive without activity (1 hour)
const SESSION_EXPIRY = 60 * 60

// Get a farmer's session
async function getSession(farmerId) {
  try {
    const session = await redis.get(`session:${farmerId}`)
    if (session) {
      return typeof session === 'string' ? JSON.parse(session) : session
    }
    return null
  } catch (err) {
    console.error('Error getting session:', err.message)
    return null
  }
}

// Save a farmer's session
async function saveSession(farmerId, sessionData) {
  try {
    await redis.set(
      `session:${farmerId}`,
      JSON.stringify(sessionData),
      { ex: SESSION_EXPIRY }
    )
    return true
  } catch (err) {
    console.error('Error saving session:', err.message)
    return false
  }
}

// Delete a farmer's session
async function clearSession(farmerId) {
  try {
    await redis.del(`session:${farmerId}`)
    return true
  } catch (err) {
    console.error('Error clearing session:', err.message)
    return false
  }
}

// Create a fresh session for a new farmer
function createNewSession(farmerId) {
  return {
    farmer_id: farmerId,
    farmer_name: null,
    farm_name: null,
    is_registered: false,
    active_flocks: [],
    current_flow: null,
    current_step: null,
    collected_data: {},
    last_active: new Date().toISOString()
  }
}

// Update last active timestamp
async function touchSession(farmerId) {
  try {
    const session = await getSession(farmerId)
    if (session) {
      session.last_active = new Date().toISOString()
      await saveSession(farmerId, session)
    }
  } catch (err) {
    console.error('Error touching session:', err.message)
  }
}

module.exports = {
  getSession,
  saveSession,
  clearSession,
  createNewSession,
  touchSession
}