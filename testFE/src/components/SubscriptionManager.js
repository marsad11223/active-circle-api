import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CheckoutForm from './CheckoutForm';
import './SubscriptionManager.css';

const API_URL = process.env.REACT_APP_API_URL;

function SubscriptionManager({ token, user }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/subscription/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubscription(response.data);
    } catch (err) {
      setError('Failed to fetch subscription status');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [token]);

  const handleCreateSubscription = async () => {
    if (user.role !== 'host') {
      setError('Only hosts can create subscriptions');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(
        `${API_URL}/subscription/create`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setClientSecret(response.data.clientSecret);
      setShowCheckout(true);
      setSuccess('Subscription created! Please complete payment.');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Failed to create subscription'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription?')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.delete(`${API_URL}/subscription/cancel`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess(response.data.message);
      await fetchSubscriptionStatus();
    } catch (err) {
      setError(
        err.response?.data?.message || 'Failed to cancel subscription'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setSuccess('🎉 Payment successful! Your subscription is now active.');
    setShowCheckout(false);
    setClientSecret('');
    setTimeout(() => {
      fetchSubscriptionStatus();
    }, 2000);
  };

  if (loading && !subscription) {
    return <div className="content loading">Loading subscription status...</div>;
  }

  return (
    <div className="content">
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="subscription-header">
        <h2>Subscription Management</h2>
        {user.role !== 'host' && (
          <div className="warning-box">
            ⚠️ You are logged in as a <strong>{user.role}</strong>. Only hosts can
            manage subscriptions.
          </div>
        )}
      </div>

      {subscription?.hasSubscription ? (
        <div className="subscription-details">
          <div className="info-box">
            <h3>
              Current Subscription
              <span className={`status-badge status-${subscription.status}`}>
                {subscription.status}
              </span>
            </h3>
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className="value">{subscription.status}</span>
            </div>
            <div className="detail-row">
              <span className="label">Period Start:</span>
              <span className="value">
                {new Date(subscription.currentPeriodStart).toLocaleDateString()}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Period End:</span>
              <span className="value">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Next Billing:</span>
              <span className="value">
                {subscription.cancelAtPeriodEnd
                  ? '❌ Canceled (active until period end)'
                  : `£5.00 on ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}`}
              </span>
            </div>
          </div>

          {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && (
            <button
              onClick={handleCancelSubscription}
              className="btn-danger"
              disabled={loading}
            >
              Cancel Subscription
            </button>
          )}
        </div>
      ) : (
        <div className="no-subscription">
          <div className="pricing-card">
            <h3>Host Monthly Subscription</h3>
            <div className="price">
              <span className="currency">£</span>
              <span className="amount">5</span>
              <span className="period">/month</span>
            </div>
            <ul className="features">
              <li>✓ Access to all host features</li>
              <li>✓ Create and manage events</li>
              <li>✓ Member management tools</li>
              <li>✓ Priority support</li>
            </ul>

            {user.role === 'host' ? (
              <button
                onClick={handleCreateSubscription}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Subscribe Now'}
              </button>
            ) : (
              <div className="warning-box">
                Only hosts can subscribe. Current role: {user.role}
              </div>
            )}
          </div>
        </div>
      )}

      {showCheckout && clientSecret && (
        <div className="checkout-modal">
          <div className="checkout-content">
            <button
              className="close-button"
              onClick={() => {
                setShowCheckout(false);
                setClientSecret('');
              }}
            >
              ×
            </button>
            <h3>Complete Your Payment</h3>
            <CheckoutForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              onError={(msg) => {
                setError(msg);
                setShowCheckout(false);
              }}
            />
          </div>
        </div>
      )}

      <div className="test-cards-info">
        <h4>🧪 Test Card Numbers</h4>
        <div className="test-cards">
          <div className="test-card">
            <strong>Success:</strong> 4242 4242 4242 4242
          </div>
          <div className="test-card">
            <strong>Decline:</strong> 4000 0000 0000 0002
          </div>
          <div className="test-card">
            <strong>3D Secure:</strong> 4000 0025 0000 3155
          </div>
        </div>
        <p className="test-note">
          Use any future expiry date, any 3-digit CVC, and any postal code
        </p>
      </div>
    </div>
  );
}

export default SubscriptionManager;

