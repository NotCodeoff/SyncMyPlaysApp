const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

function getPrivateKey() {
  const b64 = process.env.APPLE_MUSIC_PRIVATE_KEY_BASE64;
  if (!b64) throw new Error('APPLE_MUSIC_PRIVATE_KEY_BASE64 missing');
  return Buffer.from(b64, 'base64').toString('utf8');
}

router.get('/developer-token', (req, res) => {
  try {
    const teamId = process.env.APPLE_MUSIC_TEAM_ID;
    const keyId = process.env.APPLE_MUSIC_KEY_ID;
    const priv = getPrivateKey();

    if (!teamId || !keyId) {
      return res.status(500).json({ error: 'APPLE_MUSIC_TEAM_ID or APPLE_MUSIC_KEY_ID missing' });
    }

    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { iss: teamId, iat: now, exp: now + 60 * 60 * 24 * 30 },
      priv,
      { algorithm: 'ES256', header: { alg: 'ES256', kid: keyId } }
    );

    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

module.exports = router;


