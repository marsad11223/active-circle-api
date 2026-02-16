import React, { useState } from 'react';
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from '@stripe/react-stripe-js';
import './CheckoutForm.css';

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

function CheckoutForm({ clientSecret, isTrialFlow, plan = 'premium', onSuccess, onError }) {
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
      if (clientSecret) {
        // Normal flow: clientSecret exists, confirm payment
        const { error: stripeError, paymentIntent } =
          await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardElement,
            },
          });

        if (stripeError) {
          setError(stripeError.message);
          onError(stripeError.message);
        } else if (paymentIntent.status === 'succeeded') {
          onSuccess(paymentIntent.id);
        }
      } else {
        // No clientSecret: Create payment method first, then backend will use invoices.pay()
        const { error: pmError, paymentMethod } =
          await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
          });

        if (pmError) {
          setError(pmError.message);
          onError(pmError.message);
        } else {
          // Pass payment method ID to backend
          onSuccess(paymentMethod.id);
        }
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
      onError('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      {error && <div className="error">{error}</div>}

      <div className="form-group">
        <label>Card Number</label>
        <div className="card-element">
          <CardNumberElement options={CARD_ELEMENT_OPTIONS} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Expiry Date</label>
          <div className="card-element">
            <CardExpiryElement options={CARD_ELEMENT_OPTIONS} />
          </div>
        </div>

        <div className="form-group">
          <label>CVC</label>
          <div className="card-element">
            <CardCvcElement options={CARD_ELEMENT_OPTIONS} />
          </div>
        </div>
      </div>

      {(() => {
        const amount = plan === 'standard' ? '£1.99' : '£5.99';
        return (
          <>
            <div className="payment-info">
              {isTrialFlow ? (
                <>
                  <p>🆓 No charge today — 3-month free trial</p>
                  <p>💳 We'll charge {amount}/month at the start of month 4</p>
                  {plan === 'standard' && (
                    <p style={{ fontSize: '0.9em', color: '#6b7280' }}>Standard: 2 free + 1 paid activity per period</p>
                  )}
                </>
              ) : (
                <p>💳 You will be charged {amount} per month</p>
              )}
              <p>🔒 Secure payment powered by Stripe</p>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={!stripe || processing}
            >
              {processing
                ? 'Processing...'
                : isTrialFlow
                  ? 'Add card & start free trial'
                  : `Pay ${amount}`}
            </button>
          </>
        );
      })()}
    </form>
  );
}

export default CheckoutForm;
