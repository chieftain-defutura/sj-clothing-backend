import cors from "cors";
import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("<h2>Hello world </h2>");
});

const SECRET_KEY = process.env.STRIPE_SECRET_KEY || "default_secret_key";

const stripe = new Stripe(SECRET_KEY);

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { email, name, currency, amount } = req.body;
    // if (!name) return res.status(400).json({ message: "Please enter a name" });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency,
      payment_method_types: ["card"],
      metadata: {
        email,
        name,
        currency,
        amount,
      },
    });
    const clientSecret = paymentIntent.client_secret;
    res.json({
      message: "Payment initiated",
      amount: amount,
      currency: currency,
      clientSecret,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/stripe-payment", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (typeof sig !== "string") {
    res.status(400).json({ message: "Bad Request" });
    return;
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (typeof stripeWebhookSecret !== "string" || stripeWebhookSecret === "") {
    console.error("Stripe webhook secret is not defined or empty.");
    res.status(500).json({ message: "Internal server error" });
    return;
  }

  let event;

  try {
    event = await stripe.webhooks.constructEvent(
      req.body,
      sig,
      stripeWebhookSecret
    );
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Bad Request" });
    return;
  }

  if (event.type === "payment_intent.created") {
    console.log(`${event.data.object.metadata.name} initated payment!`);
  }
  if (event.type === "payment_intent.succeeded") {
    console.log(`${event.data.object.metadata.name} succeeded payment!`);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`server running on PORT ${PORT}`);
});
