require('dotenv').config();
const app = require('./apps/gateway.app');

const port = Number(process.env.PORT || 4000);
const host = process.env.GATEWAY_HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Shemuel Plus API Gateway escuchando en http://${host}:${port}`);
});
