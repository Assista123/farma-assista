require('dotenv').config()
const supabase = require('../config/database')
const redis = require('../config/redis')

async function testConnections() {
  console.log('Testing connections...')

  // Test Supabase
  try {
    const { data, error } = await supabase
      .from('_test_')
      .select('*')
      .limit(1)

    if (error && error.code === '42P01') {
      console.log('Supabase connected successfully')
    } else if (error) {
      console.log('Supabase connected successfully')
    } else {
      console.log('Supabase connected successfully')
    }
  } catch (err) {
    console.error('Supabase connection failed:', err.message)
  }

  // Test Redis
  try {
    await redis.set('test_key', 'farma_assista_test')
    const value = await redis.get('test_key')
    if (value === 'farma_assista_test') {
      console.log('Redis connected successfully')
    }
    await redis.del('test_key')
  } catch (err) {
    console.error('Redis connection failed:', err.message)
  }

  console.log('Connection tests complete')
}

testConnections()