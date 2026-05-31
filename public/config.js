// firebase web config. this is fine to have public, thats just how firebase web works.
export const firebaseConfig = {
  apiKey: "AIzaSyBkvBd7fIfTVLVn09sbuVdFNrPWEk8f8mk",
  authDomain: "liinkr.firebaseapp.com",
  projectId: "liinkr",
  storageBucket: "liinkr.firebasestorage.app",
  messagingSenderId: "747794561181",
  appId: "1:747794561181:web:7ccfdc64f1b3bd1a877c74"
};

// my firebase auth uid — NOT my email. uids are opaque and safe to keep in a
// public repo. find yours in firebase console -> authentication -> users, or
// sign in and run `firebase.auth().currentUser.uid` in the browser console.
export const ADMIN_UID = "MODyWf0INhVaRwYnlJ4mLujH5ld2";
