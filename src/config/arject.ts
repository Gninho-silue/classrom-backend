import arcjet, { shield, detectBot, tokenBucket, slidingWindow } from "@arcjet/node";

if (!process.env.ARCJET_KEY && process.env.NODE_ENV !=="test") {
  throw new Error("Missing required env var: ARCJET_KEY");
}

export const aj = arcjet({
 
  key: process.env.ARCJET_KEY!,
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE", 
      allow: [
        "CATEGORY:SEARCH_ENGINE", 
        "CATEGORY:PREVIEW",
      ],
    }),
    
    slidingWindow({
      mode: "LIVE",
      interval: 2,
      max: 5,
      
    })
  ],
});