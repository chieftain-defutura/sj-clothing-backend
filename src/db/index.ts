import firebaseAdmin from "firebase-admin";
import { serviceAccount } from "./service-account";

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});

const db = firebaseAdmin.firestore();
const message = firebaseAdmin.messaging();

export { db, message };
