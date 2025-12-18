import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

const API_URL = process.env.REACT_APP_API_URL;

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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
        <h2>Login to Test Subscription</h2>
        <p className="login-subtitle">
          Use a host account to test subscription features
        </p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="host@example.com"
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
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="test-info">
          <h4>💡 Test Information</h4>
          <p>Make sure your backend is running on port 3000</p>
          <p>You need a user with role="host" to test subscriptions</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
