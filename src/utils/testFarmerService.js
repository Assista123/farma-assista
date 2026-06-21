require('dotenv').config()
const {
  getFarmerByPhone,
  createFarmer,
  getActiveFlocks,
  updateFarmer
} = require('../services/farmerService')

async function testFarmerService() {
  console.log('Testing farmer service...')

  // Test creating a farmer
  const newFarmer = await createFarmer({
    phone_number: 'TEST_12345',
    name: 'Emeka Okafor',
    farm_name: 'Sunrise Farms',
    state: 'Lagos',
    lga: 'Alimosho'
  })
  console.log('Created farmer:', newFarmer)

  // Test getting farmer by phone
  const found = await getFarmerByPhone('TEST_12345')
  console.log('Found farmer:', found)

  // Test getting active flocks (will be empty for new farmer)
  const flocks = await getActiveFlocks(found.id)
  console.log('Active flocks:', flocks)

  // Test updating farmer
  const updated = await updateFarmer(found.id, { farm_name: 'Golden Farms' })
  console.log('Updated farmer:', updated)

  console.log('Farmer service test complete')
}

testFarmerService()