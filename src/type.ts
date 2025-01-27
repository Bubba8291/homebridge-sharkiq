interface AuthData {
  access_token: string
  refresh_token: string
  expiration: Date
}

interface OAuthData {
  state: string
  code_verify: string
  code_challenge: string
}

export { AuthData, OAuthData }
