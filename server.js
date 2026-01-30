require('dotenv').config();
require('ts-node/register');
const app = require('./src/app').default;

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
