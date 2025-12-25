import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function Login({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState('member'); // 'member' or 'host'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

      setSuccess('Account created successfully! Please login.');
      setIsSignup(false);
      setEmail('');
      setPassword('');
      setName('');
      setAddress('');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Signup failed. Please try again.',
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

      // Handle the response structure: response.data.accessToken and response.data.data (user info)
      const token = response.data?.accessToken;
      const userData = response.data?.data;

      console.log('Token:', token);
      console.log('User Data:', userData);

      if (token && userData) {
        onLogin(token, userData);
      } else {
        setError('Login successful but incomplete data received');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Login failed. Please check your credentials.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{isSignup ? 'Create Account' : 'Login'}</h2>
        <p className="login-subtitle">
          {isSignup 
            ? 'Create a member or host account to test booking flow'
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
                <label>Account Type</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  <option value="member">Member (Can book activities)</option>
                  <option value="host">Host (Can create activities)</option>
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
        </div>
      </div>
    </div>
  );
}

export default Login;
