import cors from "cors";
import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import { db } from "./db";
import { Twilio } from "twilio";
import { Expo } from "expo-server-sdk";
import apn from "apn";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import bodyParser from "body-parser";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
let expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

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
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log("req.body:", req.body);
    console.log("sig:", sig);
    console.log("stripeWebhookSecret:", stripeWebhookSecret);

    if (typeof sig !== "string") {
      res.status(400).json({ message: "Bad Request" });
      return;
    }

    if (typeof stripeWebhookSecret !== "string" || stripeWebhookSecret === "") {
      console.error("Stripe webhook secret is not defined or empty.");
      res.status(500).json({ message: "Internal server error" });
      return;
    }

    let event;
    let payload;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        stripeWebhookSecret
      );
    } catch (err: any) {
      payload = JSON.parse(err.payload);

      console.error(err);
      // res.status(400).json({ message: "Bad Request" });
      // return;
    }

    if (payload.type === "payment_intent.created") {
      console.log(`${payload.data.object.metadata.name} initated payment!`);
    }
    if (payload.type === "payment_intent.succeeded") {
      console.log(payload.data);
      console.log(`${payload.data.object.metadata.name} succeeded payment!`);
      try {
        await db
          .collection("Orders")
          .doc(payload.data.object.id)
          .update({ paymentStatus: "SUCCESS" });
      } catch (error) {
        console.log("ERROR ON STROING DB", error);
      }
      console.log(`updaetd on db`);
    }
    res.json({ ok: true });
  }
);

app.use(express.json({}));

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { email, name, currency, amount, address, description } = req.body;
    console.log("email", email);
    console.log("name", name);
    console.log("currency", currency);
    console.log("amount", amount);
    console.log("address", address);
    console.log("description", description);

    const customer = await stripe.customers.create({
      email,
      name,
      address: {
        line1: address.line1,
        postal_code: address.postal_code,
        city: address.city,
        state: address.state,
        country: address.country,
      },
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency,
      customer: customer.id,
      payment_method_types: ["card"],
      shipping: {
        name: name,
        address: {
          line1: address.line1,
          postal_code: address.postal_code,
          city: address.city,
          state: address.state,
          country: address.country,
        },
      },
      description: description || "Software development services",
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

    console.log("PAYMENT ID -> ", paymentIntent.id);

    res.json({
      message: "Payment initiated",
      amount: amount,
      email: email,
      name: name,
      currency: currency,
      clientSecret,
      customer: customer.id,
      paymentId: paymentIntent.id,
    });
  } catch (err) {
    console.error(err);
    //@ts-ignore
    res.status(500).json({ message: `Internal server error : ${err}` });
  }
});

app.post("/test", async (req, res) => {
  try {
    console.log("test");
  } catch (error) {
    console.log(error);
  }
});

app.post("/send-otp", async (req, res) => {
  const phoneNumber = req.body.phoneNumber;
  const otp = req.body.otp;

  if (!phoneNumber || !otp)
    return res.status(403).json({ error: { message: "invalid values" } });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = new Twilio(accountSid, authToken);

  try {
    const message = await client.messages.create({
      body: `Dear customer, use this One Time Password ${otp} to log in to your SprinkleNadar App. This OTP will be valid for the next 5 mins.`,
      from: "+17404956025",
      to: phoneNumber,
    });

    res.json(message);
  } catch (error) {
    res.json(error);
  }
});

app.post("/pushToken", async (req, res) => {
  try {
    const currentTime = Date.now();
    const futureTime = currentTime; // Adding 5 minutes in milliseconds

    const title = req.body.title;
    const body = req.body.body;
    // const time = req.body.time;
    const futureDate = new Date(futureTime);
    // const job = schedule.scheduleJob(futureDate, async () => {
    const dbData = await db.collection("users").get();

    let usersExpoTokens: any[] = [];

    if (!dbData.empty) {
      dbData.forEach((doc: { data: () => any }) => {
        const componentData = doc.data();
        usersExpoTokens.push(componentData);
      });
    }

    const mergedarray = usersExpoTokens
      .filter((s) => s.tokens[0] !== null)
      .map((f) => f.tokens.map((s) => s.fcmToken));
    const flattenedArray = [].concat(...mergedarray);

    const iosmergedarray = usersExpoTokens
      .filter((s) => s.tokens[0] !== null)
      .map((f) => f.tokens.map((s) => s.apnToken));
    const iosflattenedArray = [].concat(...iosmergedarray);
    // const JoinedArray = flattenedArray.concat(iosflattenedArray);
    // const finalExpoTokenArray = JoinedArray.filter((item) => item !== null);

    // for (let pushToken of flattenedArray) {
    //   // Your FCM API key
    //   const messages = {
    //     data: {
    //       key1: "value1",
    //       key2: "value2",
    //     },
    //     notification: {
    //       title: "Notification Title",
    //       body: "Notification Body",
    //     },
    //     token: pushToken,
    //   };

    //   await message
    //     .send(messages)
    //     .then((response) => {
    //       console.log("Successfully sent message:", response);
    //     })
    //     .catch((error) => {
    //       console.error("Error sending message:", error);
    //     });
    // }
    for (let apnPushToken of [
      "eadc9d5083ce3c99a1817f6fde00d9b75cf899f28322bf4482425eb350d5f690",
    ]) {
      console.log(path.join(__dirname, "./apnkey.p8"));
      const apnKey = path.join(__dirname, "./apnkey.p8");

      const options = {
        token: {
          key: apnKey,
          keyId: "9JCRBNCXX9",
          teamId: "B6R5MG79VB",
        },
        production: false, // Set to true for production environment
      };

      const apnProvider = new apn.Provider(options);

      const notification = new apn.Notification();
      notification.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
      notification.badge = 3; // Set the badge count
      notification.sound = "ping.aiff";
      notification.alert = "Hello, World!";
      notification.topic = "com.dewallstreet.sprinkle";
      // Attach custom payload if needed
      notification.payload = { customKey: "customValue" };

      // Send the notification
      apnProvider
        .send(notification, apnPushToken)
        .then((response) => {
          console.log("Notification sent:", response.failed[0].response);
          console.log(response);
        })
        .catch((error) => {
          console.error("Error sending notification:", error);
        });
    }
    res.send("success");
    // });
  } catch (error) {
    console.error("Error sending verification code:", error);
    res.status(500).json(error);
  }
});

app.post("/individualPushNotification", async (req, res) => {
  try {
    const title = req.body.title;
    const body = req.body.body;
    const uerEmail = req.body.uerEmail;

    const dbData = await db.collection("users").get();
    let usersExpoTokens: any[] = [];

    if (!dbData.empty) {
      dbData.forEach((doc: { data: () => any }) => {
        const componentData = doc.data();

        usersExpoTokens.push(componentData);
      });
    }

    console.log(usersExpoTokens.filter((f) => f.email === uerEmail));
    const mergedarray = usersExpoTokens
      .filter((f) => f.email === uerEmail)
      .map((f) => f.tokens.map((s) => s.expoAndroidToken));
    const flattenedArray = [].concat(...mergedarray);

    const iosmergedarray = usersExpoTokens
      .filter((f) => f.email === uerEmail)
      .map((f) => f.tokens.map((s) => s.expoIosToken));
    const iosflattenedArray = [].concat(...iosmergedarray);
    const JoinedArray = flattenedArray.concat(iosflattenedArray);
    const finalExpoTokenArray = JoinedArray.filter((item) => item !== "null");

    // Keep track of sent tokens
    let sentTokens: Set<string> = new Set();

    let messages: any[] = [];
    for (let pushToken of finalExpoTokenArray) {
      if (!Expo.isExpoPushToken(pushToken) || sentTokens.has(pushToken)) {
        // Skip invalid tokens or already sent tokens
        continue;
      }

      // Construct a message
      messages.push({
        to: pushToken,
        sound: "default",
        title: title,
        body: body,
        icon: "https://ibb.co/VMzNQ19",
        color: "#fffbd7",
      });

      sentTokens.add(pushToken);
    }

    if (messages.length > 0) {
      let chunks = expo.chunkPushNotifications(messages);

      let tickets: any[] = [];
      for (let chunk of chunks) {
        try {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          console.log(ticketChunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error(error);
        }
      }
    }

    res.send("success");
  } catch (error) {
    console.error("Error sending verification code:", error);
    res.status(500).json(error);
  }
});

app.post("/canvas", async (req, res) => {
  const image = req.body.image;
  const color = req.body.color;
  try {
    const canvas = createCanvas(1600, 1600);
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Load an image and draw it on the canvas
    loadImage(image).then((image) => {
      const rotationAngle = Math.PI / 1;

      // Translate to the center of the image
      context.translate(90 + 250, 90 + 250);

      // Rotate the canvas
      context.rotate(rotationAngle);

      // Draw the image
      context.drawImage(image, -320, -300, 400, 400);

      // Reset transformations (important to avoid issues with subsequent drawings)
      // context.setTransform(0);

      // const out = fs.createWriteStream("output.png");
      // const stream = canvas.createPNGStream();
      // stream.pipe(out);
      // res.send("success");
      const base64Image = canvas
        .toDataURL("image/png")
        .replace(/^data:image\/png;base64,/, "");
      res.json({ base64Image });
    });
  } catch (error) {
    console.log(error);
  }
});
app.listen(PORT, () => {
  console.log(`server running on PORT ${PORT}`);
});
