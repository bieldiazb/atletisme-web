import { initializeApp } from "firebase/app"
import { getFirestore, collection, getDocs, query, where, Timestamp } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyC09cNolrDC5frhfXep9iiwq8lf-Y4mCYY",
  authDomain: "sub10-ecc96.firebaseapp.com",
  projectId: "sub10-ecc96",
  storageBucket: "sub10-ecc96.appspot.com",
  messagingSenderId: "281812157491",
  appId: "1:281812157491:web:aa4e61897199eeedebcf46",
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

try {
  const allSnap = await getDocs(collection(db, "events"))
  console.log("=== ALL EVENTS (raw) count:", allSnap.size, "===")
  allSnap.docs.forEach(d => {
    const data = d.data()
    console.log(d.id, JSON.stringify({
      title: data.title,
      date: data.date?.toDate?.()?.toISOString(),
      categories: data.categories,
      tipusPista: data.tipusPista,
    }))
  })

  const today = Timestamp.now()
  console.log("\n=== today Timestamp ===", today.toDate().toISOString())
  const q = query(collection(db, "events"), where("date", ">=", today))
  const snap = await getDocs(q)
  console.log("\n=== FUTURE EVENTS QUERY RESULT (count:", snap.size, ") ===")
  snap.docs.forEach(d => console.log(d.id, d.data().title))
  process.exit(0)
} catch (err) {
  console.error("ERROR:", err.code, err.message)
  process.exit(1)
}
