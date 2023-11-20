import cors from "cors";
import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import { db } from "./db";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("<h2>Hello world </h2>");
});

const SECRET_KEY = process.env.STRIPE_SECRET_KEY || "default_secret_key";

const stripe = new Stripe(SECRET_KEY);

app.post(
  "/webhooks",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("called");
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
      console.log(event.data);
      console.log(`${event.data.object.metadata.name} succeeded payment!`);
      await db
        .collection("Orders")
        .doc(event.data.object.id)
        .update({ paymentStatus: "SUCCESS" });
      console.log(`updaetd on db`);
    }
    res.json({ ok: true });
  }
);

app.use(express.json({}));

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { email, name, currency, amount, address } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      shipping: {
        name: name,
        address: {
          line1: address.line1,
          line2: address.line2,
          postal_code: address.postal_code,
          city: address.city,
          state: address.state,
          country: address.country,
        },
      },
      description: "shipping address",
      currency: currency,
    });
    console.log(paymentIntent.status);
    if (paymentIntent.status === "succeeded") {
      // Payment was successful
      console.log("success");
    } else if (paymentIntent.status === "requires_payment_method") {
      // Handle payment method error here
      console.log(paymentIntent.last_payment_error);
      const error = paymentIntent.last_payment_error;
      if (error) {
        if (error.code === "insufficient_funds") {
          // Handle insufficient funds error
          console.error("Insufficient Funds Error");
          // Display an error message to the user
          // You can use an alert or update your UI to inform the user about the issue
        } else {
          // Handle other payment method errors
          console.error("Payment Method Error:", error.message);
          // Display a relevant error message to the user
        }
      }
    }
    const clientSecret = paymentIntent.client_secret;
    console.log(paymentIntent.id);
    res.json({
      clientSecret,
      paymentId: paymentIntent.id,
    });
  } catch (error) {
    console.log(error);
    //@ts-ignore
    res.status(500).json({ message: `Internal server error : ${err}` });
  }
});

// app.post("/create-payment-intent", async (req, res) => {
//   try {
//     const { email, name, currency, amount } = req.body;
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: Math.round(amount * 100),
//       currency: currency,
//       payment_method_types: ["card"],
//       // automatic_payment_methods: {
//       //   enabled: true,
//       // },
//       metadata: {
//         email,
//         name,
//         currency,
//         amount,
//       },
//     });
//     console.log(paymentIntent.status);

//     if (paymentIntent.status === "succeeded") {
//       // Payment was successful
//       console.log("success");
//     } else if (paymentIntent.status === "requires_payment_method") {
//       // Handle payment method error here
//       console.log(paymentIntent.last_payment_error);
//       const error = paymentIntent.last_payment_error;
//       if (error) {
//         if (error.code === "insufficient_funds") {
//           // Handle insufficient funds error
//           console.error("Insufficient Funds Error");
//           // Display an error message to the user
//           // You can use an alert or update your UI to inform the user about the issue
//         } else {
//           // Handle other payment method errors
//           console.error("Payment Method Error:", error.message);
//           // Display a relevant error message to the user
//         }
//       }
//     }
//     const clientSecret = paymentIntent.client_secret;
//     console.log(paymentIntent.id);
//     res.json({
//       message: "Payment initiated",
//       amount: amount,
//       email: email,
//       name: name,
//       currency: currency,
//       clientSecret,
//       paymentId: paymentIntent.client_secret,
//     });
//   } catch (err) {
//     console.error(err);
//     //@ts-ignore
//     res.status(500).json({ message: `Internal server error : ${err}` });
//   }
// });

app.listen(PORT, () => {
  console.log(`server running on PORT ${PORT}`);
});
