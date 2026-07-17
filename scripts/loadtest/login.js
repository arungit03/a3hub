import http from "k6/http";
import { check } from "k6";
import { FIREBASE_SIGNIN_URL } from "./config.js";

/**
 * Logs in a user via Firebase Authentication REST API.
 * Returns the idToken and localId (UID).
 */
export function firebaseLogin(email, password) {
  if (!email || !password) {
    return null;
  }
  
  const payload = JSON.stringify({
    email: String(email).trim(),
    password: String(password).trim(),
    returnSecureToken: true,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    tags: { name: "firebase_login" },
  };

  const response = http.post(FIREBASE_SIGNIN_URL, payload, params);

  const loginSuccess = check(response, {
    "login status is 200": (r) => r.status === 200,
    "login returns idToken": (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.idToken === "string" && body.idToken.length > 0;
      } catch (e) {
        return false;
      }
    },
  });

  if (!loginSuccess) {
    return null;
  }

  const resBody = JSON.parse(response.body);
  return {
    idToken: resBody.idToken,
    localId: resBody.localId,
  };
}
