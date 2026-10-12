import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyB406Ds1PZZ9oiKHTW9pX5mbMrkW-sIbCE",
    authDomain: "health-copilot-b03f2.firebaseapp.com",
    projectId: "health-copilot-b03f2",
    storageBucket: "health-copilot-b03f2.firebasestorage.app",
    messagingSenderId: "891825820873",
    appId: "1:891825820873:web:38ca88a516383593e2a918"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };