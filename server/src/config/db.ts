import mongoose from "mongoose";
import { env } from "./env.js";

/**
 * Connects to MongoDB and surfaces a clear error if it fails.
 * Called once from `index.ts` before the server starts listening.
 */
export async function connectDB(): Promise<void> {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}
