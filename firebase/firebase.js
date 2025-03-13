import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBa1TRgIsn1uGDYOFYYy46ooc8tURwBzWU",
    authDomain: "audiovideocall-92169.firebaseapp.com",
    projectId: "audiovideocall-92169",
    storageBucket: "audiovideocall-92169.firebasestorage.app",
    messagingSenderId: "776966973353",
    appId: "1:776966973353:android:fc0fd3df52d527da6fc6b8",
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// export const auth = firebase.auth();
// export const firestore = firebase.firestore();