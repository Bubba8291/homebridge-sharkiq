type AuthData = {
    access_token: string;
    expires_in: number;
    refresh_token: string;
};

type OAuthData = {
    state: string;
    code_verify: string;
    code_challenge: string;
};

export { AuthData, OAuthData };
