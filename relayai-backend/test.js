const http = require('http');

const body = JSON.stringify({
  messages: [
    {
      role: "user",
      text: "Help me build a login endpoint in Express with JWT",
      codeBlocks: []
    },
    {
      role: "assistant",
      text: "Sure! Here is a POST /auth/login endpoint using jsonwebtoken and bcrypt",
      codeBlocks: [
        {
          language: "javascript",
          code: "router.post('/auth/login', async (req, res) => { const user = await User.findOne({ email: req.body.email }); const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET); res.json({ token }); });"
        }
      ]
    },
    {
      role: "user",
      text: "I am getting Error: secretOrPrivateKey must have a value",
      codeBlocks: []
    }
  ],
  rawText: ""
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/parse-context',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const parsed = JSON.parse(data);
    console.log(JSON.stringify(parsed, null, 2));
  });
});

req.on('error', (err) => console.error('Error:', err.message));
req.write(body);
req.end();