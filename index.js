require('dotenv').config()

const express = require('express')
const app = express()

// Middleware
app.use(express.json())

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Farma Assista API is running',
    timestamp: new Date().toISOString()
  })
})

// Start server
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Farma Assista server running on port ${PORT}`)
})

module.exports = app