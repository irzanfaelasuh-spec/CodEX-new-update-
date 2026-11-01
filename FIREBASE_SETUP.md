# Firebase cloud accounts for CodEX AI

Firebase is optional. Without it, CodEX uses Local Mode: accounts are stored only in the current browser/app installation. To make usernames unique across devices, connect a Firebase project before creating the account.

## 1. Create the Firebase project

1. Open https://console.firebase.google.com/ and create or select a project.
2. Add a **Web App** from Project Overview. The app nickname can be `CodEX AI`.
3. Copy the Firebase web configuration values.
4. Open **Authentication → Sign-in method** and enable **Email/Password**.
5. Open **Firestore Database** and create a database.

CodEX creates an internal synthetic email from the normalized username. The user still enters only a name and password; no email inbox is required. Password recovery by email is not included in this design, so keep the password safe.

## 2. Add the configuration

In CodEX AI, open **Config** and enter the Firebase Web App values:

- API Key
- Auth Domain
- Project ID
- App ID
- Messaging Sender ID (optional)

The configuration is saved in this browser/app. It is not part of the GitHub source.

You can instead create a `.env` file from `.env.example` and provide the same values as `VITE_FIREBASE_*` variables before building. Do not commit private credentials or a Gemini API key. Firebase web config identifies a Firebase project; Firestore Security Rules and Authentication controls access.

## 3. Apply Firestore rules

In Firebase Console → Firestore Database → Rules, replace the rules with the contents of `firestore.rules`, then publish.

The rules let signed-in users read a username reservation, create a reservation only for their own Firebase UID, and prevent username documents from being changed or deleted by clients. Profile documents can only be read or modified by the matching account.

## 4. Create the cloud account

1. Reload CodEX AI.
2. Choose **Create Account**.
3. Enter a unique name (3–20 letters/numbers/underscores/hyphens) and a password of at least 6 characters.
4. The same normalized name cannot create a second Firebase Authentication account.

If an account was first created in Local Mode, it does not automatically migrate. Sign out and register a cloud account after adding Firebase.

## Important notes

- Firebase Authentication stores the account identity. Firestore reserves normalized usernames.
- Do not make the `usernames` or `profiles` collections publicly writable.
- Do not disable Firebase App Check or loosen Firestore rules to fix permission errors. Confirm that Authentication and Firestore are enabled and that the supplied configuration belongs to the same project.
- Firebase web config is visible to users in a browser build. Security must come from Authentication and Firestore Rules, not from hiding the config values.
