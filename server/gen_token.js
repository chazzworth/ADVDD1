const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET);
console.log(token);
