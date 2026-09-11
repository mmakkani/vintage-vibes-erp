import { Router, Request, Response } from 'express';
import { paymentService } from './paymentService.ts';
import { relationalStore } from '../db/relationalStore.ts';

export const paymentRouter = Router();

// Test live credentials against Stripe / Gateway
paymentRouter.post('/test-credentials', async (req: Request, res: Response) => {
  const { secretKey } = req.body;
  const result = await paymentService.testCredentials(secretKey);
  return res.json(result);
});

// Create PaymentIntent for Apple Pay / Google Pay / Card checkout
paymentRouter.post('/create-intent', async (req: Request, res: Response) => {
  const { amountAed, orderReference, customerName, customerEmail, customerPhone, invoiceId } = req.body;
  
  if (!amountAed || amountAed <= 0) {
    return res.status(400).json({ error: 'amountAed must be greater than 0' });
  }

  const result = await paymentService.createPaymentIntent({
    amountAed: Number(amountAed),
    orderReference: orderReference || `ORD-${Date.now().toString().slice(-6)}`,
    customerName,
    customerEmail,
    customerPhone,
    invoiceId
  });

  return res.json(result);
});

// Save / Update Gateway Configuration
paymentRouter.post('/config', (req: Request, res: Response) => {
  const profile = relationalStore.getCompanyProfile();
  if (!profile) {
    return res.status(500).json({ error: 'Company profile not found' });
  }

  profile.paymentGateway = {
    ...(profile.paymentGateway || {
      provider: 'STRIPE_UAE',
      environment: 'SANDBOX',
      isEnabled: true,
      allowApplePay: true,
      allowGooglePay: true,
      allowCreditDebitCards: true,
      currency: 'AED'
    }),
    ...req.body
  };

  relationalStore.updateCompanyProfile(profile);
  return res.json({ success: true, paymentGateway: profile.paymentGateway });
});

// Get current gateway configuration (omitting sensitive secret key in response)
paymentRouter.get('/config', (req: Request, res: Response) => {
  const profile = relationalStore.getCompanyProfile();
  const gw = profile?.paymentGateway;
  
  if (!gw) {
    return res.json({
      provider: 'STRIPE_UAE',
      environment: 'SANDBOX',
      isEnabled: false,
      publishableKey: '',
      hasSecretKey: false,
      allowApplePay: true,
      allowGooglePay: true,
      allowCreditDebitCards: true,
      currency: 'AED'
    });
  }

  return res.json({
    ...gw,
    secretKey: gw.secretKey ? `${gw.secretKey.slice(0, 7)}...${gw.secretKey.slice(-4)}` : '',
    hasSecretKey: !!gw.secretKey
  });
});

// Webhook endpoint (Stripe signature & generic payment confirmation)
paymentRouter.post(['/webhook', '/payment-success'], async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const result = await paymentService.handleStripeWebhook(req.body, sig);
  return res.json(result);
});

// Generate dynamic high-res base64 payment QR for checkout
paymentRouter.get('/qr/:sku', async (req: Request, res: Response) => {
  const { sku } = req.params;
  const result = await paymentService.generatePaymentQr(sku);
  return res.json(result);
});
