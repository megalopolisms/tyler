/**
 * Firebase Web SDK config — public values, safe to commit.
 *
 * These are not secrets. Firebase API keys identify the project to client
 * SDKs; access control is enforced by Firestore + Storage security rules
 * (see Firestore/Storage rules in repo `firestore.rules` / `storage.rules`).
 */
export const firebaseConfig = {
  projectId: "tyler-trips",
  appId: "1:405091837777:web:6d8734822b1dbaf83b9570",
  storageBucket: "tyler-trips.firebasestorage.app",
  apiKey: "AIzaSyCAMuAI8sFUzQtu_twmMk2zDCooBrHHoKQ",
  authDomain: "tyler-trips.firebaseapp.com",
  messagingSenderId: "405091837777",
};

/**
 * Password gate.
 *
 * The string `tyler123` (default) is hashed with SHA-256(salt + password) and
 * compared against PASSWORD_HASH. To rotate the password, regenerate the hash
 * with:
 *
 *   echo -n "tyler-salt-v1::NEWPASSWORD" | shasum -a 256
 *
 * Update PASSWORD_HASH below and redeploy.
 */
export const PASSWORD_SALT = "tyler-salt-v1::";

// SHA-256 hex of "tyler-salt-v1::tyler123"
// (will be replaced once Yuri picks a real password)
export const PASSWORD_HASH =
  "36a5febe15b3dc4387fa2b0876b383e95910704a4701586a0a4eba64f8074dfc";
