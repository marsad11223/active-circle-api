import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Login.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function Login({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [step, setStep] = useState('login'); // 'login' | 'signup' | 'verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState('member');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/signup`, {
        email,
        password,
        name,
        address,
        role,
      });

      if (response.data?.requiresEmailVerification) {
        setVerifyEmail(response.data.email || email);
        setSuccess('Account created! Check your email for the 6-digit code.');
        setStep('verify');
      } else {
        setSuccess('Account created successfully! Please login.');
        setIsSignup(false);
        setEmail('');
        setPassword('');
        setName('');
        setAddress('');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Signup failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/verify-email`, {
        email: verifyEmail,
        otp: otp.trim(),
      });
      const token = response.data?.accessToken;
      const userData = response.data?.data;
      if (token && userData) {
        onLogin(token, userData);
      } else {
        setError('Verification succeeded but no session received.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Invalid or expired code. Try again or resend.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await axios.post(`${API_URL}/auth/resend-email-otp`, { email: verifyEmail });
      setSuccess('New code sent. Check your email.');
      setResendCooldown(60);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not resend code. Try again later.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });

      const token = response.data?.accessToken;
      const userData = response.data?.data;

      if (token && userData) {
        onLogin(token, userData);
      } else {
        setError('Login successful but incomplete data received');
      }
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 403 && (data?.code === 'EMAIL_NOT_VERIFIED' || data?.message?.code === 'EMAIL_NOT_VERIFIED')) {
        setVerifyEmail(data?.email || data?.message?.email || email);
        setStep('verify');
        setError('');
        setSuccess('Please verify your email. Enter the 6-digit code we sent you.');
      } else {
        const msg = data?.message;
        setError(
          typeof msg === 'string' ? msg : (msg?.message || 'Login failed. Please check your credentials.'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Verify email step (OTP)
  if (step === 'verify') {
    return (
      <div className="login-container">
        <div className="login-box">
          <h2>Verify your email</h2>
          <p className="login-subtitle">
            We sent a 6-digit code to <strong>{verifyEmail}</strong>. Enter it below.
          </p>

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

          <form onSubmit={handleVerifyEmail}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={verifyEmail}
                readOnly
                className="read-only-input"
              />
            </div>
            <div className="form-group">
              <label>Verification code</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                pattern="[0-9]{6}"
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading || otp.length !== 6}>
              {loading ? 'Verifying...' : 'Verify & log in'}
            </button>
            <div className="auth-switch" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="link-button"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
              <span style={{ margin: '0 8px' }}> | </span>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setStep(isSignup ? 'signup' : 'login');
                  setOtp('');
                  setError('');
                  setSuccess('');
                }}
              >
                Back
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{isSignup ? 'Create Account' : 'Login'}</h2>
        <p className="login-subtitle">
          {isSignup
            ? 'Create a Member, Standard Member, or Premium Member account'
            : 'Login to test booking features'}
        </p>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        <form onSubmit={isSignup ? handleSignup : handleLogin}>
          {isSignup && (
            <>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="form-group">
                <label>Address *</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, State"
                  required
                />
              </div>

              <div className="form-group">
                <label>Sign up as</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  <option value="member">Member (Can book activities)</option>
                  <option value="standardMember">Standard Member (Host plan)</option>
                  <option value="premiumMember">Premium Member (Host plan)</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              minLength={8}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading 
              ? (isSignup ? 'Creating account...' : 'Logging in...') 
              : (isSignup ? 'Sign Up' : 'Login')}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setIsSignup(!isSignup);
                setError('');
                setSuccess('');
              }}
            >
              {isSignup ? 'Login' : 'Sign Up'}
            </button>
          </p>
        </div>

        <div className="test-info">
          <h4>💡 Test Information</h4>
          <p>Make sure your backend is running on port 3000</p>
          <p>Create a member account to book activities</p>
          <p>Create a host account to create activities and manage bookings</p>
          <p>After signup, verify your email with the 6-digit code sent to your inbox.</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
