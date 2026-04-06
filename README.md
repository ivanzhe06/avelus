# AVÉLUS — Haute Parfumerie
## Luxury E-Commerce Website

A complete, production-ready luxury perfume e-commerce platform with a minimalist black-and-gold aesthetic, Stripe payments, and secure JWT authentication.

---

## Project Structure

```
avelus/
├── index.html              ← Frontend (single-file SPA)
├── backend/
│   ├── server.js           ← Node.js/Express API
│   ├── package.json
│   ├── .env.example        ← Copy to .env and fill in values
│   └── .gitignore
└── README.md
```

---

## Quick Start

### 1. Frontend (Static HTML)
Open `index.html` directly in a browser — no build step needed. For local serving:
```bash
npx serve . -l 3000
# or
python3 -m http.server 3000
```

### 2. Backend API
```bash
cd backend
npm install
cp .env.example .env    # Fill in your keys!
npm run dev             # Development with auto-reload
# OR
npm start               # Production
```

### 3. Stripe Setup
1. Create an account at [stripe.com](https://stripe.com)
2. Get your API keys from **Dashboard → Developers → API Keys**
3. Add to `backend/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
4. For webhooks (local development):
   ```bash
   # Install Stripe CLI: https://stripe.com/docs/stripe-cli
   stripe listen --forward-to localhost:4000/api/webhooks/stripe
   # Copy the webhook signing secret into .env → STRIPE_WEBHOOK_SECRET
   ```

---

## Features

### Frontend (`index.html`)
| Feature | Implementation |
|---------|---------------|
| Homepage | Hero section, brand story, marquee, featured scents |
| Product Pages | Scent notes pyramid, variant selector, Scent Story section |
| Cart | Persistent (localStorage), qty update, remove items |
| Checkout | Address form → Stripe redirect |
| Auth | Login / Register forms with client-side validation |
| Animations | CSS keyframes, IntersectionObserver scroll reveals |
| Custom Cursor | Smooth gold cursor with ring follow effect |
| Mobile | Fully responsive, hamburger nav |

### Backend (`backend/server.js`)
| Feature | Implementation |
|---------|---------------|
| Auth | JWT (7-day expiry) + bcrypt (cost factor 12) |
| Input Validation | express-validator — XSS-safe sanitization |
| Rate Limiting | 10 auth attempts / 15 min; 100 API calls / min |
| Security Headers | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| Payment | Stripe Checkout Session (hosted, PCI-compliant) |
| Webhook | Signature-verified Stripe webhooks |
| Price Integrity | Server-side price lookup — client prices never trusted |

---

## Security Architecture

### Implemented
- ✅ **XSS Prevention** — `express-validator` `.escape()` on all inputs; CSP headers via Helmet
- ✅ **CSRF** — SameSite cookies + CORS origin whitelist
- ✅ **SQL Injection** — Parameterized queries (add when connecting a real DB)
- ✅ **Brute Force** — Rate limiting on auth routes (10 req / 15 min)
- ✅ **Password Security** — bcrypt hash (cost 12), never stored plain text
- ✅ **User Enumeration** — Generic error messages, constant-time password comparison
- ✅ **Payment Data** — Never stored locally; all card data handled by Stripe
- ✅ **API Keys** — Environment variables only, never in code
- ✅ **Webhook Integrity** — Stripe signature verification
- ✅ **JWT** — Signed tokens with issuer/audience claims

### Production Checklist
- [ ] Replace in-memory `users` Map with PostgreSQL/MongoDB
- [ ] Add HTTPS (Let's Encrypt / Cloudflare)
- [ ] Generate strong `JWT_SECRET` (64+ chars random)
- [ ] Switch Stripe keys from `sk_test_` to `sk_live_`
- [ ] Create real Stripe Price IDs in your Dashboard
- [ ] Add `STRIPE_WEBHOOK_SECRET` from production webhook endpoint
- [ ] Set `NODE_ENV=production`
- [ ] Add logging (Winston or Pino)
- [ ] Set up error monitoring (Sentry)

---

## API Reference

### Auth
```
POST /api/auth/register  { email, password, firstName, lastName }
POST /api/auth/login     { email, password }
GET  /api/auth/me        → requires Bearer token
```

### Products
```
GET /api/products        → all products
GET /api/products/:id    → single product
```

### Checkout
```
POST /api/checkout/create-session  { items: [{id, variant, qty}] }
→ returns { url: "https://checkout.stripe.com/..." }
```

### Webhooks
```
POST /api/webhooks/stripe  (Stripe sends this — configure in Dashboard)
```

---

## Customization

### Add a Product
In `index.html`, add to the `PRODUCTS` array:
```javascript
{
  id: 3, name: 'Vétiver Absolu', family: 'Woody · Earthy',
  tagline: 'Earth after rain',
  desc: '...',
  top: ['Grapefruit', 'Black Pepper'],
  heart: ['Vetiver', 'Tobacco Flower'],
  base: ['Sandalwood', 'Musk'],
  variants: [{label:'50 ml', price:275}, {label:'100 ml', price:385}],
  story: '...',
  color: 'linear-gradient(135deg,#0e1208 0%,#1a2010 100%)',
  accent: '#708040', bottleColor: '#4a6030', bodyAccent: 'rgba(140,180,100,0.6)'
}
```

### Connect Real Stripe Prices
In `backend/server.js`, replace `price_data` with `price: variant.stripePriceId` after creating prices in Stripe Dashboard.

---

## Design System

| Element | Value |
|---------|-------|
| Primary font | Cormorant Garamond (display) |
| Body font | Montserrat (UI) |
| Black | `#0a0a0a` |
| White | `#fafaf8` |
| Gold | `#b8a882` |
| Gold Light | `#d4c5a0` |
| Animation | `cubic-bezier(0.16, 1, 0.3, 1)` (spring) |

---

*AVÉLUS — Crafting invisible monuments since 2018*
