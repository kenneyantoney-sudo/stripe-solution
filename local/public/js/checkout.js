// Checkout page client logic.
//
// Flow (Stripe "Accept a Payment" — Web + Elements):
//   1. POST /create-payment-intent with the selected item -> client_secret
//   2. Mount the Payment Element using the client_secret
//   3. On submit, stripe.confirmPayment() handles 3DS if needed and redirects
//      the browser to return_url with ?payment_intent=pi_xxx
//
// The browser sends only the ITEM ID + checkoutSessionId — never a price.
// Ref: https://docs.stripe.com/payments/accept-a-payment?platform=web&ui=elements

document.addEventListener("DOMContentLoaded", async () => {
  const { publishableKey, checkoutSessionId } = window.STRIPE_CONFIG;
  const item = new URLSearchParams(window.location.search).get("item");

  const form = document.querySelector('form[name="payment-form"]');
  const submitButton = form.querySelector('button[type="submit"]');
  const messageDiv = document.querySelector("#payment-message");
  const originalButtonHtml = submitButton.innerHTML;

  const showError = (msg) => {
    messageDiv.textContent = msg || "";
  };

  // 1. Ask the server to create a PaymentIntent (server looks up the price).
  let clientSecret;
  try {
    const response = await fetch("/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, checkoutSessionId }),
    });

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      showError(error || "Could not start checkout. Please try again.");
      submitButton.disabled = true;
      return;
    }
    ({ clientSecret } = await response.json());
  } catch (err) {
    showError("Network error — could not reach the server.");
    submitButton.disabled = true;
    return;
  }

  // 2. Mount the Payment Element. Card details enter this iframe directly
  //    and never touch our DOM (keeps us in PCI SAQ A scope).
  const stripe = Stripe(publishableKey);
  const elements = stripe.elements({ clientSecret });
  elements.create("payment").mount("#payment-element");

  // 3. Confirm the payment when the user clicks Pay. On success Stripe
  //    redirects to return_url. If the call returns here, it's an immediate
  //    validation/decline error to surface to the user.
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    submitButton.disabled = true;
    submitButton.textContent = "Processing…";

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/success` },
    });

    // NOTE: even after a successful redirect, the REAL fulfillment happens
    // server-side via the payment_intent.succeeded event — not because the
    // browser reached the success page.
    if (error) {
      showError(error.message || "Payment failed. Please try again.");
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonHtml;
    }
  });
});
