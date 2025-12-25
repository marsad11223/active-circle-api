import React, { useState } from 'react';
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from '@stripe/react-stripe-js';
import './PaymentModal.css';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
    },
  },
};

function PaymentModal({ isOpen, onClose, amount, activityTitle, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError('');

    const cardElement = elements.getElement(CardNumberElement);

    try {
      // Create payment method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (pmError) {
        setError(pmError.message);
        onError(pmError.message);
        setProcessing(false);
        return;
      }

      // Success - return payment method ID
      onSuccess(paymentMethod.id);
    } catch (err) {
      const errorMessage = err.message || 'Payment method creation failed. Please try again.';
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="payment-modal-overlay" onClick={onClose}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <h2>Payment Details</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="payment-modal-content">
          <div className="payment-summary">
            <p><strong>Activity:</strong> {activityTitle}</p>
            <p><strong>Amount:</strong> ${amount}</p>
          </div>

          <form onSubmit={handleSubmit} className="payment-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Card Number</label>
              <div className="card-element-wrapper">
                <CardNumberElement options={CARD_ELEMENT_OPTIONS} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expiry Date</label>
                <div className="card-element-wrapper">
                  <CardExpiryElement options={CARD_ELEMENT_OPTIONS} />
                </div>
              </div>

              <div className="form-group">
                <label>CVC</label>
                <div className="card-element-wrapper">
                  <CardCvcElement options={CARD_ELEMENT_OPTIONS} />
                </div>
              </div>
            </div>

            <div className="payment-info">
              <p>💳 Test Card: 4242 4242 4242 4242</p>
              <p>🔒 Secure payment powered by Stripe</p>
            </div>

            <div className="payment-modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={onClose}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-pay"
                disabled={!stripe || processing}
              >
                {processing ? 'Processing...' : `Pay $${amount}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PaymentModal;


