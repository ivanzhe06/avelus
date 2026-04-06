/**
 * AVÉLUS — Backend Server
 * Node.js + Express + Stripe + JWT Auth
 * 
 * SETUP: npm install express stripe jsonwebtoken bcryptjs
 *        cors helmet express-rate-limit express-validator dotenv
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();

// ─── SECURITY MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// Rate limiting — prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 auth attempts per window
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Body parsing — limit size to prevent payload attacks
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── IN-MEMORY STORE (replace with PostgreSQL/MongoDB in production) ────────
const users = new Map();
const products = [
  {
    id: 0, name: 'Ambre Sacré', family: 'Oriental · Woody',
    variants: [
      { label: '50 ml', price: 28500, stripePriceId: 'price_ambre_50ml' },
      { label: '100 ml', price: 39500, stripePriceId: 'price_ambre_100ml' },
      { label: '200 ml', price: 54500, stripePriceId: 'price_ambre_200ml' },
    ],
  },
  {
    id: 1, name: 'Iris Nuit', family: 'Aquatic · Floral',
    variants: [
      { label: '50 ml', price: 26500, stripePriceId: 'price_iris_50ml' },
      { label: '100 ml', price: 36500, stripePriceId: 'price_iris_100ml' },
      { label: '200 ml', price: 49500, stripePriceId: 'price_iris_200ml' },
    ],
  },
  {
    id: 2, name: 'Rose Écarlate', family: 'Floral · Chypre',
    variants: [
      { label: '50 ml', price: 29500, stripePriceId: 'price_rose_50ml' },
      { label: '100 ml', price: 41500, stripePriceId: 'price_rose_100ml' },
      { label: '200 ml', price: 57500, stripePriceId: 'price_rose_200ml' },
    ],
  },
];

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// ─── PRODUCTS API ─────────────────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  // Return products without sensitive stripe price IDs to the client
  const safe = products.map(p => ({
    id: p.id, name: p.name, family: p.family,
    variants: p.variants.map(v => ({ label: v.label, price: v.price })),
  }));
  res.json(safe);
});

app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
  const product = products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const safe = {
    id: product.id, name: product.name, family: product.family,
    variants: product.variants.map(v => ({ label: v.label, price: v.price })),
  };
  res.json(safe);
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
// Input validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be 8+ characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain letters and numbers'),
  body('firstName').trim().isLength({ min: 1, max: 50 }).escape().withMessage('First name required'),
  body('lastName').trim().isLength({ min: 1, max: 50 }).escape().withMessage('Last name required'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }),
];

app.post('/api/auth/register', registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, firstName, lastName } = req.body;

  if (users.has(email)) {
    // Generic message — don't reveal if email exists (prevents user enumeration)
    return res.status(409).json({ error: 'Registration failed. Please try again.' });
  }

  try {
    // bcrypt with cost factor 12 (good security/performance balance)
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: `usr_${Date.now()}`,
      email,
      passwordHash, // NEVER store plain text passwords
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
    };
    users.set(email, user);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d', issuer: 'avelus', audience: 'avelus-client' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', loginValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Generic error to prevent user enumeration
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { email, password } = req.body;

  try {
    const user = users.get(email);

    // Always run bcrypt compare to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashfortimingatttackprevention';
    const passwordMatch = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d', issuer: 'avelus', audience: 'avelus-client' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = users.get(req.user.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id, email: user.email,
    firstName: user.firstName, lastName: user.lastName,
  });
});

// ─── STRIPE CHECKOUT ──────────────────────────────────────────────────────────
app.post('/api/checkout/create-session', async (req, res) => {
  const { items } = req.body;

  // Validate cart items server-side — NEVER trust client prices
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    const lineItems = [];
    for (const item of items) {
      // Sanitize and validate each item
      const productId = parseInt(item.id);
      const variantLabel = String(item.variant).slice(0, 20);
      const qty = Math.max(1, Math.min(10, parseInt(item.qty) || 1));

      if (isNaN(productId)) {
        return res.status(400).json({ error: 'Invalid product' });
      }

      const product = products.find(p => p.id === productId);
      if (!product) {
        return res.status(400).json({ error: `Product not found: ${productId}` });
      }

      const variant = product.variants.find(v => v.label === variantLabel);
      if (!variant) {
        return res.status(400).json({ error: `Variant not found: ${variantLabel}` });
      }

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${product.name} — ${variant.label}`,
            description: `AVÉLUS Eau de Parfum · ${product.family}`,
            // images: [`${process.env.FRONTEND_URL}/images/${product.id}.jpg`],
          },
          unit_amount: variant.price, // Already in cents
        },
        quantity: qty,
      });
    }

    // Create Stripe Checkout Session — hosted, PCI-compliant
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}?page=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}?page=cart`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'GB', 'FR', 'DE', 'SG', 'JP', 'AU', 'CA'],
      },
      // Payment intent data — no card details stored by us
      payment_intent_data: {
        metadata: { source: 'avelus_checkout' },
      },
      metadata: { source: 'avelus' },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// ─── STRIPE WEBHOOK (verify payment success server-side) ─────────────────────
app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }), // Raw body needed for signature verification
  (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      // Verify webhook signature — prevents forged webhook attacks
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        // ✅ Fulfill order here — update database, send email, etc.
        console.log('Order fulfilled for session:', session.id);
        break;
      case 'payment_intent.payment_failed':
        console.log('Payment failed:', event.data.object.id);
        break;
    }

    res.json({ received: true });
  }
);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Don't leak error details in production
  res.status(500).json({ error: 'An unexpected error occurred' });
});

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AVÉLUS API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
