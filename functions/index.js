const { setGlobalOptions } = require("firebase-functions/v2")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const admin = require("firebase-admin")

admin.initializeApp()

setGlobalOptions({ maxInstances: 10 })

exports.createAdminUser = onCall(async (request) => {
  const { email, password, rol, categories, nom } = request.data

  if (!email || !password) {
    throw new HttpsError("invalid-argument", "Email i contrasenya obligatoris")
  }

  try {
    const user = await admin.auth().createUser({ email, password })

    await admin.firestore().collection("admins").doc(user.uid).set({
      nom:        nom ?? email.split("@")[0],
      email,
      rol:        rol ?? "admin",
      categories: rol === "admin" ? [] : (categories ?? []),
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
    })

    return { uid: user.uid }
  } catch (error) {
    console.error(error)
    throw new HttpsError("internal", error.message ?? "Error creant usuari")
  }
})