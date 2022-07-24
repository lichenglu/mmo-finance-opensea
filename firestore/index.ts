const {
  initializeApp,
  applicationDefault,
  cert,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
} = require("firebase-admin/firestore");

initializeApp({
  credential: applicationDefault(),
  databaseURL: 'https://mmo-finance.firebaseio.com'
});

const db = getFirestore();

export {
    db
}
