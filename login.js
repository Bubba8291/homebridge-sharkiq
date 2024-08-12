const express = require('express');
const fetch = require('node-fetch');

const crypto = require('crypto');
const fs = require('fs');

const app = express();
const port = 3000;

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
}

const state = generateRandomString(43);
const code_verify = generateRandomString(43);
const code_challenge = crypto.createHash('sha256').update(code_verify).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const scopes = 'openid profile email offline_access read:users read:current_user read:user_idp_tokens';
const redirect_uri = 'com.sharkninja.shark://login.sharkninja.com/ios/com.sharkninja.shark/callback';
const client_id = 'wsguxrqm77mq4LtrTrwg8ZJUxmSrexGi';

const auth0Client = 'eyJ2ZXJzaW9uIjoiMi42LjAiLCJuYW1lIjoiQXV0aDAuc3dpZnQiLCJlbnYiOnsiaU9TIjoiMTcuNiIsInN3aWZ0IjoiNS54In19';

const url = 'https://login.sharkninja.com/authorize'
  + '?response_type=code'
  + '&client_id='+encodeURIComponent(client_id)
  + '&state='+encodeURIComponent(state)
  + '&scope='+encodeURIComponent(scopes)
  + '&redirect_uri='+encodeURIComponent(redirect_uri)
  + '&code_challenge='+encodeURIComponent(code_challenge)
  + '&code_challenge_method=S256'
  + '&ui_locales=en'
  + '&auth0Client='+auth0Client;

console.log('Open this URL in your browser:', url);

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.send('Error: No code provided');
    return;
  }

  const data = {
    grant_type: 'authorization_code',
    client_id: client_id,
    code: code,
    code_verifier: code_verify,
    redirect_uri: redirect_uri,
  };

  try {
    const reqData = {};
    reqData['method'] = 'POST';
    reqData['headers'] = {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      'Accept': '*/*',
      'Auth0-Client': auth0Client,
    };
    reqData['body'] = JSON.stringify(data);

    const response = await fetch('https://login.sharkninja.com/oauth/token', reqData);
    const tokenData = await response.json();

    const reqData2 = {};
    reqData2['method'] = 'POST';
    reqData2['headers'] = {
      'Content-Type': 'application/json',
    };
    reqData2['body'] = JSON.stringify({
      'app_id': 'ios_shark_prod-3A-id',
      'app_secret': 'ios_shark_prod-74tFWGNg34LQCmR0m45SsThqrqs',
      'token': tokenData.id_token,
    });
    const response2 = await fetch('https://user-field-39a9391a.aylanetworks.com/api/v1/token_sign_in', reqData2);
    const aylaTokenData = await response2.json();
    fs.writeFileSync('sharkiq.json', JSON.stringify(aylaTokenData));
    res.header('Content-Type', 'application/json');
    res.send(JSON.stringify(aylaTokenData));
  } catch (error) {
    res.send('Error: ' + error);
  }

});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
