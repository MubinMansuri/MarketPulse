import type { CanonicalReport } from "./model";
import { brand } from "./brand";
export const sampleReport: CanonicalReport = {
  schemaVersion: "1.0",
  id: "marketpulse-demo-2026-10-09",
  date: "2026-10-09",
  sourceLocale: "en",
  locale: "en",
  metadata: {
    title: "Daily Market Report",
    edition: "GLOBAL MARKETS · DAILY BRIEFING",
    brandName: brand.name,
  },
  sections: [
    {
      id: "overview",
      type: "cover",
      title: "Market overview",
      data: {
        text: "Markets at a turning point",
        caption: "A measured outlook across currencies, commodities, and global indices.",
      },
    },
    {
      id: "summary",
      type: "paragraph",
      title: "Executive summary",
      data: {
        text: "The US dollar remains in focus as investors reassess the path of interest rates. Gold consolidates near recent highs, while equity indices hold a cautious upward bias. Today’s focus is on inflation expectations and the response of Treasury yields. Patience around key levels remains essential.",
      },
    },
    {
      id: "dashboard",
      type: "dashboard",
      title: "Market dashboard",
      data: {
        table: {
          columns: [
            { key: "instrument", label: "INSTRUMENT" },
            { key: "price", label: "REFERENCE PRICE" },
            { key: "change", label: "CHANGE" },
            { key: "bias", label: "DAILY BIAS" },
          ],
          rows: [
            { instrument: "EUR/USD", price: 1.165, change: "+0.24%", bias: "Bullish" },
            { instrument: "GBP/USD", price: 1.3382, change: "+0.18%", bias: "Bullish" },
            { instrument: "XAU/USD", price: 3980.5, change: "−0.12%", bias: "Neutral" },
            { instrument: "US30", price: 46520, change: "+0.36%", bias: "Bullish" },
            { instrument: "WTI", price: 62.84, change: "−0.48%", bias: "Bearish" },
          ],
        },
      },
    },
    {
      id: "calendar",
      type: "economic-calendar",
      title: "Economic calendar",
      data: {
        table: {
          columns: [
            { key: "time", label: "TIME (UTC)" },
            { key: "currency", label: "CCY" },
            { key: "event", label: "EVENT" },
            { key: "impact", label: "IMPACT" },
          ],
          rows: [
            {
              time: "12:30",
              currency: "USD",
              event: "Inflation expectations · sample event",
              impact: "High",
            },
            {
              time: "14:00",
              currency: "USD",
              event: "Consumer sentiment · sample event",
              impact: "High",
            },
          ],
        },
      },
    },
    {
      id: "technical",
      type: "technical-analysis",
      title: "EUR/USD · Technical outlook",
      data: {
        instrument: "EUR/USD",
        text: "EUR/USD maintains a constructive structure above the 1.1600 support zone. A sustained break through 1.1680 would open the path toward 1.1720. Momentum is improving, but confirmation is needed before extending a directional position.",
      },
    },
    {
      id: "fundamental",
      type: "fundamental-analysis",
      title: "Fundamental context",
      data: {
        text: "Relative rate expectations remain the primary driver. A softer US yield environment could support the euro, while renewed dollar demand would challenge the current recovery. Monitor central-bank commentary and incoming macroeconomic releases.",
      },
    },
    {
      id: "scenario",
      type: "scenario",
      title: "Trading scenarios",
      data: {
        bullish:
          "A confirmed hold above 1.1680 favors continuation toward 1.1720. The bullish view weakens below 1.1600.",
        bearish:
          "A close below 1.1600 exposes 1.1560 support. A recovery above 1.1680 would invalidate the bearish view.",
      },
    },
    {
      id: "chart",
      type: "chart",
      title: "EUR/USD · Price structure",
      data: { instrument: "EUR/USD", caption: "4-hour timeframe · chart image pending" },
    },
    {
      id: "sources",
      type: "sources",
      title: "Sources & methodology",
      data: {
        text: "This sample edition uses illustrative prices and editorial commentary to demonstrate the report format. No live market feed is connected. Reference levels, price changes, and calendar events are not verified market information.",
      },
    },
    {
      id: "risk",
      type: "risk-disclosure",
      title: "Risk disclosure",
      data: {
        text: "This document is demonstration content, not investment advice or a recommendation to trade. Trading leveraged financial instruments involves substantial risk. Past performance is not indicative of future results. Independently verify all market information before making financial decisions.",
      },
    },
  ],
};
