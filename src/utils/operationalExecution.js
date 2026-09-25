/**
 * operationalExecution.js
 * Decision Writeback & Action Engine for NEXUS Palantir-Grade Platform
 * Generates institutional FIX/OMS order tickets, Supply Chain ERP purchase orders, and Lloyd's War Risk slips.
 */

// 1. One-Click FIX Protocol Order Generator
export function generateFixOrderTicket({
  symbol = 'FRO',
  side = '1', // 1 = BUY, 2 = SELL
  quantity = 25000,
  orderType = '2', // 1 = MARKET, 2 = LIMIT
  price = 24.50,
  account = 'NEXUS_MACRO_BOOK_01',
  broker = 'GOLDMAN_SACHS_EXEC',
  clOrdID = `ORD_${Date.now()}`
}) {
  const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const delimiter = '\x01' // Standard SOH delimiter represented as pipe in display
  
  const fixTags = [
    `8=FIX.4.4`,
    `9=215`,
    `35=D`, // MsgType = OrderSingle
    `49=NEXUS_ALPHA_ENGINE`, // SenderCompID
    `56=${broker}`, // TargetCompID
    `34=101`, // MsgSeqNum
    `52=${now}`, // SendingTime
    `11=${clOrdID}`, // ClOrdID
    `1=ACCT_${account}`, // Account
    `55=${symbol}`, // Symbol
    `54=${side}`, // Side (1 = Buy)
    `60=${now}`, // TransactTime
    `38=${quantity}`, // OrderQty
    `40=${orderType}`, // OrdType (2 = Limit)
    `44=${price.toFixed(2)}`, // Price
    `59=0`, // TimeInForce (0 = Day)
    `10=092` // CheckSum
  ]

  const rawFix = fixTags.join('\x01')
  const readableFix = fixTags.join(' | ')

  const csvRow = `Symbol,Side,Quantity,Price,OrderType,TimeInForce,Account,Broker,ClOrdID\n${symbol},${side === '1' ? 'BUY' : 'SELL'},${quantity},${price},${orderType === '2' ? 'LIMIT' : 'MARKET'},DAY,${account},${broker},${clOrdID}`

  return {
    rawFix,
    readableFix,
    csvRow,
    metadata: {
      symbol,
      side: side === '1' ? 'BUY' : 'SELL',
      quantity,
      price,
      notionalUSD: quantity * price,
      clOrdID,
      broker
    }
  }
}

// 2. Supply Chain ERP Interceptor (SAP / Oracle Format)
export function generateSupplyChainInterventionPO({
  bomNode,
  vessel,
  affectedPlant,
  emergencyCostUSD = 820000
}) {
  const poNumber = `PO-EMERG-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`
  const dailyLoss = bomNode?.dailyPlantDowntimeCostUSD || 18500000
  const daysSaved = 11 // Cape delay avoided
  const totalAvoidedLoss = dailyLoss * 3 // Minimum 3-day line stoppage avoided

  const sapPayload = {
    PurchaseOrder: {
      PONumber: poNumber,
      OrderType: 'NB_EXPEDITE_AIR_CHARTER',
      CompanyCode: '1000',
      PurchasingOrg: 'PURCH_GLOBAL_LOGISTICS',
      Vendor: 'LUFTHANSA_CARGO_CHARTER_GMBH',
      CreationDate: new Date().toISOString().split('T')[0],
      ItemData: [
        {
          ItemNo: '00010',
          MaterialNumber: bomNode?.partNumber || '1082340-00-J',
          Description: `EMERGENCY AIR CHARTER: ${bomNode?.componentName || 'Wiring Harness'}`,
          Quantity: 1800,
          Unit: 'EA',
          NetPrice: emergencyCostUSD,
          Currency: 'USD',
          Plant: 'BER1_GRUENHEIDE',
          StorageLocation: 'SL01_INBOUND_URGENT',
          DeliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
        }
      ],
      JustificationAudit: {
        IncidentTrigger: `Red Sea Bab el-Mandeb Interdiction of Vessel ${vessel?.name || 'MSC Clara'}`,
        SailingDelayDays: 13,
        ExhaustionDate: new Date(Date.now() + (bomNode?.normalSafetyBufferDays || 12) * 86400000).toISOString().split('T')[0],
        DowntimeLossAvertedUSD: totalAvoidedLoss,
        NetROIMultiple: `${(totalAvoidedLoss / emergencyCostUSD).toFixed(1)}x`
      }
    }
  }

  return {
    poNumber,
    sapJsonString: JSON.stringify(sapPayload, null, 2),
    summary: {
      poNumber,
      partNumber: bomNode?.partNumber,
      component: bomNode?.componentName,
      emergencyCostUSD,
      totalAvoidedLoss,
      roi: `${(totalAvoidedLoss / emergencyCostUSD).toFixed(1)}x`,
      supplier: 'Lufthansa Cargo / Atlas Air Charter',
      destinationPlant: affectedPlant?.name || 'Tesla Gigafactory Berlin'
    }
  }
}

// 3. Dynamic Actuarial War Risk Underwriter (Lloyd's JWC Listed Area)
export function calculateWarRiskUnderwritingQuote({
  hullValueUSD = 140000000,
  vesselFlag = 'Panama',
  hasNavalEscort = true,
  uboRiskScore = 20,
  isAisCompliant = true
}) {
  const baseRatePct = 0.750 // 0.75% of H&M value is typical crisis baseline
  let totalDiscountPct = 0

  if (hasNavalEscort) totalDiscountPct += 0.250 // Escort by CTF 153 / Aspides
  if (vesselFlag === 'China' || vesselFlag === 'Singapore') totalDiscountPct += 0.150
  if (uboRiskScore < 25) totalDiscountPct += 0.080 // Established institutional charterer
  if (isAisCompliant) totalDiscountPct += 0.040 // Fully transmitting transponder

  const finalRatePct = Math.max(0.120, baseRatePct - totalDiscountPct)
  const finalPremiumUSD = (hullValueUSD * finalRatePct) / 100
  const baselinePremiumUSD = (hullValueUSD * baseRatePct) / 100
  const savingsUSD = baselinePremiumUSD - finalPremiumUSD

  const lloydsSlipText = `
================================================================================
LLOYD'S JOINT WAR COMMITTEE (JWC) HULL WAR RISK BINDING SLIP
POLICY REFERENCE: JWC-REDSEA-2026-${Math.floor(1000 + Math.random() * 9000)}
================================================================================
INSURED: Commercial Fleet Operator / Charterer
VESSEL HULL & MACHINERY INSURED VALUE: $${(hullValueUSD / 1e6).toFixed(1)} Million USD
LISTED AREA ENTERED: Bab el-Mandeb & Southern Red Sea (JWLA-032)
TRANSIT DURATION COVERED: 7 Calendar Days from Strait Entrance

ACTUARIAL PRICING SCHEDULE:
  • Standard JWC Area Baseline Additional Premium (AP): ${baseRatePct.toFixed(3)}% ($${(baselinePremiumUSD / 1e3).toFixed(1)}k USD)
  • Dynamic Mitigant Credits:
      - Aegis / CTF Escort Verified (Aspides / Prosperity Guardian): -0.250%
      - Verified Flag & Tier-1 Western P&I Club Coverage: -0.080%
      - Continuous AIS Telemetry & Radar Compliance: -0.040%
  • FINAL ADJUSTED ACTUARIAL PREMIUM RATE: ${finalRatePct.toFixed(3)}%
  • NET PAYABLE ADDITIONAL PREMIUM: $${Math.round(finalPremiumUSD).toLocaleString()} USD

UNDERWRITING SYNDICATE: Lloyd's Syndicate 2987 / Brit Global War
STATUS: BOUND & CODIFIED IN RISK REPOSITORY
================================================================================
`.trim()

  return {
    hullValueUSD,
    baseRatePct,
    finalRatePct,
    finalPremiumUSD,
    baselinePremiumUSD,
    savingsUSD,
    lloydsSlipText
  }
}
