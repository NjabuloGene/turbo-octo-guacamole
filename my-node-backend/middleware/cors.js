const cors = require('cors');

// Configure CORS options
const corsOptions = {
  origin: 'http://localhost:3001', // your frontend URL
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);