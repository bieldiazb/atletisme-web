import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { getFunctions } from "firebase/functions"

const firebaseConfig = {
  apiKey: "AIzaSyC09cNolrDC5frhfXep9iiwq8lf-Y4mCYY",
  authDomain: "sub10-ecc96.firebaseapp.com",
  projectId: "sub10-ecc96",
  storageBucket: "sub10-ecc96.appspot.com",
  messagingSenderId: "281812157491",
  appId: "1:281812157491:web:aa4e61897199eeedebcf46",
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)

/**
 * 🔥 CLAU ABSOLUTA
 * Regió explícita per evitar FirebaseError: internal / CORS
 */
export const functions = getFunctions(app, "us-central1")