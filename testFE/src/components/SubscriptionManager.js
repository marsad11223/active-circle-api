import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CheckoutForm from './CheckoutForm';
import './SubscriptionManager.css';

const API_URL = process.env.REACT_APP_API_URL;

function SubscriptionManager({ token, user, onUserUpdate }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(user);
  const [selectedPlan, setSelectedPlan] = useState('premium'); // 'premium' | 'standard'

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
    setCurrentUser(user);
  }, [token, user]);

  const handleCreateSubscription = async (plan = selectedPlan) => {
    setLoading(true);
    setError('');
    setSuccess('');

    const amount = plan === 'standard' ? '£1.99' : '£5.99';
    try {
      const response = await axios.post(
        `${API_URL}/subscription/create`,
        { plan },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const {
        clientSecret,
        subscriptionId,
        invoiceId,
        status,
        requiresPaymentMethod,
        plan: resPlan,
        message,
      } = response.data;
      const effectivePlan = resPlan || plan;

      // Always show checkout to add payment method
      // Trial will start after payment method is added
      setClientSecret('');
      setShowCheckout(true);
      setSuccess(
        message ||
          `💳 Add your card to start your 3-month free trial. No charge today — we'll charge ${amount}/month after the trial ends.`,
      );

      await fetchSubscriptionStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    try {
      // Get user data using the user ID
      if (!currentUser?._id) {
        console.warn('No user ID available to fetch user data');
        return;
      }

      const response = await axios.get(`${API_URL}/users/${currentUser._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updatedUser = response.data;
      setCurrentUser(updatedUser);
      if (onUserUpdate) {
        onUserUpdate(updatedUser);
      }
      // Also update localStorage
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) {
      console.error('Failed to fetch user data:', err);
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
      setError(err.response?.data?.message || 'Failed to cancel subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeSubscription = async () => {
    if (
      !window.confirm(
        'Upgrade to Premium? Your remaining trial time will be preserved.',
      )
    ) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(
        `${API_URL}/subscription/upgrade`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setSuccess(response.data.message);
      await fetchSubscriptionStatus();
      await fetchUserData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upgrade subscription');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId) => {
    setLoading(true);
    setError('');
    const wasMember = currentUser.role === 'member';
    setSuccess('Processing...');

    try {
      const response = await axios.post(
        `${API_URL}/subscription/pay-with-payment-method`,
        { paymentMethodId: paymentIntentId },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const isTrialActivated = response.data?.status === 'trialing_activated';
      const plan = response.data?.plan || selectedPlan;
      const amount = plan === 'standard' ? '£1.99' : '£5.99';
      const trialEnd = response.data?.trialEnd;

      if (isTrialActivated) {
        const trialEndDate = trialEnd
          ? new Date(trialEnd).toLocaleDateString()
          : '90 days';
        setSuccess(
          plan === 'standard'
            ? `🎉 3-month free trial started! 2 free + 1 paid activity per period. First charge of ${amount} on ${trialEndDate}.`
            : `🎉 3-month free trial started! Full host access. First charge of ${amount} on ${trialEndDate}.`,
        );
      } else if (wasMember) {
        setSuccess(
          '🎉 Payment successful! You are now a host (Premium Member). Your role has been upgraded.',
        );
      } else {
        setSuccess('🎉 Payment successful! Your subscription is now active.');
      }

      setShowCheckout(false);
      setClientSecret('');

      setTimeout(async () => {
        await fetchSubscriptionStatus();
        await fetchUserData();
      }, 1500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Payment succeeded but activation pending. Please refresh the page.',
      );
      setShowCheckout(false);
      setTimeout(async () => {
        await fetchSubscriptionStatus();
        await fetchUserData();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !subscription) {
    return (
      <div className="content loading">Loading subscription status...</div>
    );
  }

  return (
    <div className="content">
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="subscription-header">
        <h2>Subscription Management</h2>
        <div className="user-role-info">
          <p>
            <strong>Current Role:</strong>{' '}
            <span
              className={`role-badge role-${currentUser.role || currentUser.grantRole || 'member'}`}
            >
              {(() => {
                const r = currentUser.role || currentUser.grantRole || 'member';
                if (r === 'premiumMember') return 'Premium Member';
                if (r === 'standardMember') return 'Standard Member';
                if (r === 'member') return 'Member';
                if (r === 'superAdmin') return 'Super Admin';
                if (r === 'host') return 'Host';
                return r;
              })()}
            </span>
          </p>
          {(currentUser.role === 'member' ||
            currentUser.grantRole === 'member') && (
            <div className="info-box">
              ℹ️ You are currently a <strong>Member</strong>. Subscribe to
              become a <strong>Premium Member</strong> or{' '}
              <strong>Standard Member</strong>. Your role updates after you add
              your card.
            </div>
          )}
        </div>
      </div>

      {subscription?.hasSubscription ? (
        <div className="subscription-details">
          <div className="info-box">
            <h3>
              Current Subscription
              <span className={`status-badge status-${subscription.status}`}>
                {subscription.status}
              </span>
              {subscription.plan === 'standard' && (
                <span className="status-badge plan-standard">Standard</span>
              )}
              {subscription.plan === 'premium' && (
                <span className="status-badge plan-premium">Premium</span>
              )}
              {subscription.isTrialing && (
                <span className="status-badge status-trialing-label">
                  3-month free trial
                </span>
              )}
            </h3>
            {subscription.plan === 'standard' && (
              <div className="detail-row plan-limits">
                <span className="label">Plan limits:</span>
                <span className="value">
                  2 free + 1 paid activity per billing period
                </span>
              </div>
            )}
            {subscription.isTrialing && subscription.trialEnd && (
              <div className="detail-row trial-highlight">
                <span className="label">Trial ends:</span>
                <span className="value">
                  {new Date(subscription.trialEnd).toLocaleDateString()} — first
                  charge ({subscription.plan === 'standard' ? '£1.99' : '£5.99'}
                  ) on this date
                </span>
              </div>
            )}
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
                  : (() => {
                      const amount =
                        subscription.plan === 'standard' ? '£1.99' : '£5.99';
                      const date =
                        subscription.isTrialing && subscription.trialEnd
                          ? new Date(subscription.trialEnd)
                          : new Date(subscription.currentPeriodEnd);
                      return `${amount} on ${date.toLocaleDateString()}${subscription.isTrialing ? ' (after trial)' : ''}`;
                    })()}
              </span>
            </div>
          </div>

          {subscription.status === 'incomplete' && (
            <div className="incomplete-actions">
              <div className="info-box" style={{ marginBottom: '15px' }}>
                ⚠️ Add your payment card to start your 3-month free trial. No
                charge today — you'll be charged after the trial ends.
              </div>
              <button
                onClick={() => {
                  setShowCheckout(true);
                  setSuccess(
                    'Add your card details to start your free trial. No charge today!',
                  );
                }}
                className="btn-primary"
                disabled={loading}
              >
                Add Card & Start Trial
              </button>
            </div>
          )}

          {(subscription.status === 'active' ||
            subscription.status === 'trialing') &&
            !subscription.cancelAtPeriodEnd && (
              <>
                {subscription.plan === 'standard' && (
                  <button
                    onClick={handleUpgradeSubscription}
                    className="btn-primary"
                    disabled={loading}
                    style={{ marginRight: '10px' }}
                  >
                    Upgrade to Premium
                  </button>
                )}
                <button
                  onClick={handleCancelSubscription}
                  className="btn-danger"
                  disabled={loading}
                >
                  Cancel Subscription
                </button>
              </>
            )}
        </div>
      ) : (
        <div className="no-subscription">
          <h3 style={{ marginBottom: '20px', color: '#1f2937' }}>
            Choose your plan
          </h3>
          <div className="plan-cards">
            <div
              className={`pricing-card ${selectedPlan === 'premium' ? 'selected' : ''}`}
              onClick={() => setSelectedPlan('premium')}
            >
              <h3>Premium Member</h3>
              <div className="trial-badge">
                Add card to start 3-month free trial
              </div>
              <div className="price">
                <span className="currency">£</span>
                <span className="amount">5.99</span>
                <span className="period">/month after trial</span>
              </div>
              <ul className="features">
                <li>✓ 3-month free trial (starts when you add card)</li>
                <li>✓ No charge today</li>
                <li>✓ Unlimited activities</li>
                <li>✓ Full host features</li>
                <li>✓ Create and manage events</li>
                <li>✓ Member management & payouts</li>
              </ul>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateSubscription('premium');
                }}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Start Premium Trial'}
              </button>
            </div>

            <div
              className={`pricing-card pricing-card-standard ${selectedPlan === 'standard' ? 'selected' : ''}`}
              onClick={() => setSelectedPlan('standard')}
            >
              <h3>Standard Member</h3>
              <div className="trial-badge">
                Add card to start 3-month free trial
              </div>
              <div className="price">
                <span className="currency">£</span>
                <span className="amount">1.99</span>
                <span className="period">/month after trial</span>
              </div>
              <ul className="features">
                <li>✓ 3-month free trial (starts when you add card)</li>
                <li>✓ No charge today</li>
                <li>✓ 2 free + 1 paid activity per period</li>
                <li>✓ Host features (with limits)</li>
                <li>✓ Create events, manage bookings</li>
                <li>✓ Payouts for paid activities</li>
              </ul>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateSubscription('standard');
                }}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Start Standard Trial'}
              </button>
            </div>
          </div>

          <div
            className="info-box"
            style={{ marginTop: '20px', fontSize: '0.9em' }}
          >
            <strong>🧪 Test:</strong> Pick a plan and add your card. Trial
            starts immediately. No charge today. Use test card 4242 4242 4242
            4242.
          </div>
        </div>
      )}

      {showCheckout && (
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
            <h3>
              {clientSecret
                ? 'Complete Your Payment'
                : 'Add Card — Start Free Trial'}
            </h3>
            <CheckoutForm
              clientSecret={clientSecret}
              isTrialFlow={!clientSecret}
              plan={selectedPlan}
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
