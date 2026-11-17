/** Cookie holding the fake user id in mock mode (local development / tests only). */
export const MOCK_COOKIE = "bahad_mock_uid";
/** Signed session cookie in direct-Google mode (BAHAD_AUTH=google). */
export const SESSION_COOKIE = "bahad_session";
/** Short-lived signed cookie carrying OAuth state / PKCE verifier / nonce between start and callback. */
export const GOOGLE_FLOW_COOKIE = "bahad_google_flow";
