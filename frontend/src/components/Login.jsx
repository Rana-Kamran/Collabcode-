import React, { useState } from 'react';
import { FaEnvelope, FaLock, FaUser, FaHeart, FaArrowLeft, FaPaperPlane } from 'react-icons/fa';
import api from '../utils/api';
import './Login.css';

const Login = ({ onLogin, onSignup, showToast }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});

  // ── Forgot-password state ──────────────────────────────────────────────
  const [showForgot, setShowForgot]       = useState(false);
  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent]       = useState(false);
  // ──────────────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: null });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (isSignUp && !formData.name) {
      newErrors.name = 'Name is required';
    } else if (isSignUp && formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    if (isSignUp) {
      onSignup(formData.name, formData.email, formData.password);
    } else {
      onLogin(formData.email, formData.password);
    }
  };

  // ── Forgot-password submit ─────────────────────────────────────────────
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    setForgotLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSent(true);
      showToast('Reset link sent! Check your inbox.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to send reset email.', 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowForgot(false);
    setForgotSent(false);
    setForgotEmail('');
  };
  // ──────────────────────────────────────────────────────────────────────

  return (
    <div className="login-container">
      <h2>CollabCode - Collaborative Coding Platform</h2>

      <div className={`login-card ${isSignUp ? 'signup-mode' : ''}`}>
        <div className="form-container">

          {/* ── Forgot Password Panel ─────────────────────────────── */}
          {showForgot ? (
            <div className="forgot-panel">
              <button className="forgot-back-btn" onClick={handleBackToLogin} title="Back to login">
                <FaArrowLeft /> Back
              </button>

              {forgotSent ? (
                <div className="forgot-success">
                  <div className="forgot-success-icon">✉️</div>
                  <h2>Check your inbox!</h2>
                  <p>
                    We sent a password reset link to<br />
                    <strong>{forgotEmail}</strong>
                  </p>
                  <p className="forgot-note">
                    The link expires in <strong>1 hour</strong>.<br />
                    Didn't receive it? Check your spam folder.
                  </p>
                  <button
                    className="btn btn-outline-green"
                    onClick={() => setForgotSent(false)}
                  >
                    Resend Email
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="forgot-form">
                  <h1>Forgot Password?</h1>
                  <p className="forgot-subtitle">
                    Enter the email linked to your account and we'll send you a magic reset link.
                  </p>
                  <div className="form-group" style={{ width: '100%' }}>
                    <div className="input-icon">
                      <FaEnvelope />
                      <input
                        id="forgot-email-input"
                        type="email"
                        placeholder="Your account email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={forgotLoading}
                    style={{ opacity: forgotLoading ? 0.7 : 1 }}
                  >
                    {forgotLoading
                      ? 'Sending…'
                      : <><FaPaperPlane style={{ marginRight: 8 }} />Send Reset Link</>
                    }
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ── Normal Login / Sign-Up form (original, untouched) ── */
            <form onSubmit={handleSubmit}>
              <h1>{isSignUp ? 'Create Account' : 'Sign In'}</h1>

              {isSignUp && (
                <div className="form-group">
                  <div className="input-icon">
                    <FaUser />
                    <input
                      type="text"
                      name="name"
                      placeholder="Name"
                      value={formData.name}
                      onChange={handleChange}
                      className={errors.name ? 'error' : ''}
                    />
                  </div>
                  {errors.name && <span className="error-message">{errors.name}</span>}
                </div>
              )}

              <div className="form-group">
                <div className="input-icon">
                  <FaEnvelope />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleChange}
                    className={errors.email ? 'error' : ''}
                  />
                </div>
                {errors.email && <span className="error-message">{errors.email}</span>}
              </div>

              <div className="form-group">
                <div className="input-icon">
                  <FaLock />
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleChange}
                    className={errors.password ? 'error' : ''}
                  />
                </div>
                {errors.password && <span className="error-message">{errors.password}</span>}
              </div>

              {!isSignUp && (
                <button
                  type="button"
                  id="forgot-password-btn"
                  className="forgot-link"
                  onClick={() => setShowForgot(true)}
                >
                  Forgot your password?
                </button>
              )}

              <button type="submit" className="btn btn-primary btn-lg">
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>
          )}
        </div>

        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-left">
              <h1>Welcome Back!</h1>
              <p>To keep connected with us please login with your personal info</p>
              <button className="btn btn-outline" onClick={() => setIsSignUp(false)}>
                Sign In
              </button>
            </div>
            <div className="overlay-right">
              <h1>Hello, Friend!</h1>
              <p>Enter your personal details and start your coding journey with us</p>
              <button className="btn btn-outline" onClick={() => setIsSignUp(true)}>
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="login-footer">
        <p>
          Created with <FaHeart className="heart-icon" /> by
          <a target="_blank" href="#"> KYA Team</a>
        </p>
      </div>
    </div>
  );
};

export default Login;