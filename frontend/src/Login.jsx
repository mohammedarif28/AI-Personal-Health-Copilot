
import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "./firebase";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");

    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setError("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo">✚</div>

        <h1>{isSignUp ? "Create Account" : "Welcome Back"}</h1>
        <p className="login-subtitle">
          {isSignUp
            ? "Create your Health Copilot account"
            : "Sign in to access your health dashboard"}
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="password-heading">
            <label htmlFor="password">Password</label>
            {!isSignUp && (
              <button
                className="text-button"
                type="button"
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            )}
          </div>

          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={6}
            required
          />

          {error && <p className="login-message" role="status">{error}</p>}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isSignUp
                ? "Create Account →"
                : "Sign In →"}
          </button>
        </form>

        <div className="login-divider">or</div>

        <button
          className="google-button"
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          Continue with Google
        </button>

        <p className="signup-prompt">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}
          {" "}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default Login;
