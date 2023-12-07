# Sprinkle Nadar Payment and Notification System

## Introduction

This project implements a payment and notification system using the Express.js framework, Stripe for payment processing, and Twilio for sending SMS notifications. The system allows users to initiate payments, handles payment webhooks, and sends notifications via SMS.

## Technologies Used

- Express.js: A web application framework for Node.js used to build the backend server.
- Stripe: A payment processing platform for handling online payments securely.
- Twilio: A cloud communications platform for building SMS and voice applications.
- Axios: A promise-based HTTP client for making HTTP requests.
- Firebase Firestore: A NoSQL cloud database for storing payment-related information.

## Setup

1. Clone the repository:

```bash
git clone <repository-url>
```

2. Install dependencies:

```
npm install
```

3. Create a .env file in the project root and set the following environment variables:

```
PORT=3001
STRIPE_SECRET_KEY=<your_stripe_secret_key>
STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_secret>
TWILIO_ACCOUNT_SID=<your_twilio_account_sid>
TWILIO_AUTH_TOKEN=<your_twilio_auth_token>
```

## Project Structure

- index.js: Entry point of the application, sets up Express server and defines routes.
- webhooks: Handles incoming Stripe webhooks for payment events.
  create-payment-intent: Endpoint for creating a payment intent and initiating payments.
- send-otp: Endpoint for sending appointment confirmation SMS using Twilio.

## Endpoints

1. GET /

- Returns a simple "Hello world" message for testing server availability.

2. POST /webhooks

- Handles incoming Stripe webhooks for payment events.
- Updates the payment status in the Firebase Firestore database.

3. POST /create-payment-intent

- Creates a payment intent using the Stripe API.
- Initiates a payment and returns the payment details.

4. POST /send-otp

- Sends an appointment confirmation SMS using Twilio.

## Usage

1. Run the server:

```bash
npm start
```

2. Access the endpoints using a tool like Postman or integrate them into your frontend application.

## Notes

- Ensure that the required environment variables are correctly set in the .env file.
- Make sure to replace placeholder values in the documentation with your actual credentials and details.
