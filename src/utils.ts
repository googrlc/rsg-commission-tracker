/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarrierRule, WonPolicy, ReconciliationStatement, RuleLookupResult, CarrierSummary, CarrierSchedule } from './types';

// Seed / Initial Data with real-world scenarios representing each methodology
export const INITIAL_RULES: CarrierRule[] = [
  // Example guidelines for references
  {
    id: 'rule-1',
    carrier: 'Example Auto Co',
    lineOfBusiness: 'Personal Auto',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'As Earned',
    notes: 'EXAMPLE — replace with your real rate'
  },
  {
    id: 'rule-2',
    carrier: 'Example Auto Co',
    lineOfBusiness: 'Personal Auto',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'EXAMPLE — renewal often pays less'
  },
  {
    id: 'rule-3',
    carrier: 'Example P&C Co',
    lineOfBusiness: 'Homeowners',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'EXAMPLE — homeowners paid upfront'
  },
  {
    id: 'rule-4',
    carrier: 'Example P&C Co',
    lineOfBusiness: 'Commercial Auto',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'In Advance',
    notes: 'EXAMPLE — premium paid in advance'
  },
  {
    id: 'rule-5',
    carrier: 'INVO PEO',
    lineOfBusiness: "Workers' Comp (PEO)",
    newRenewal: 'New',
    method: 'Manual',
    paymentTiming: 'As Earned',
    notes: "PEO comp varies per deal — confirm your cut with INVO, then type Expected on the policy row"
  },
  {
    id: 'rule-6',
    carrier: 'AmTrust Financial',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Monthly Premium',
    ratePercentage: 8.5,
    paymentTiming: 'As Earned',
    notes: 'Complex split: paid Monthly as client payroll is reported'
  },
  {
    id: 'rule-7',
    carrier: 'TrueCraft PEO',
    lineOfBusiness: 'Co-Employment HR',
    newRenewal: 'New',
    method: '% of Admin Fee',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Admin fee share based on 15% of administrative billable charges'
  },

  // --- Real RSG Carrier Commission rates ---
  
  // AmTrust
  {
    id: 'rule-amtrust-wc-new',
    carrier: 'AmTrust',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 16.0,
    paymentTiming: 'As Earned',
    notes: 'Third largest Workers Comp writer. Paid via First Connect. High confidence.'
  },
  {
    id: 'rule-amtrust-wc-renew',
    carrier: 'AmTrust',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'AmTrust Workers Comp renewal rate via First Connect aggregator.'
  },

  // Attune
  {
    id: 'rule-attune-wc-new',
    carrier: 'Attune',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'First Connect Attune program. Flat rate, high confidence.'
  },
  {
    id: 'rule-attune-wc-renew',
    carrier: 'Attune',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'First Connect Attune program. Flat rate, high confidence.'
  },
  {
    id: 'rule-attune-bop-new',
    carrier: 'Attune',
    lineOfBusiness: 'BOP',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Attune Business Owners Policy via First Connect.'
  },
  {
    id: 'rule-attune-bop-renew',
    carrier: 'Attune',
    lineOfBusiness: 'BOP',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Attune Business Owners Policy renewal.'
  },
  {
    id: 'rule-attune-gl-new',
    carrier: 'Attune',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Attune Standalone Commercial General Liability.'
  },
  {
    id: 'rule-attune-gl-renew',
    carrier: 'Attune',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Attune Commercial General Liability Renewal.'
  },

  // Liberty Mutual
  {
    id: 'rule-lm-br-mono-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: "Builder's Risk",
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 18.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual monoline Builder\'s Risk. Standard high rate.'
  },
  {
    id: 'rule-lm-br-mono-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: "Builder's Risk",
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 18.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Builder\'s Risk renewal (monoline).'
  },
  {
    id: 'rule-lm-bop-ne-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'BOP',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 20.0,
    paymentTiming: 'In Advance',
    notes: 'Premium pricing Northeast BOP (CT MA ME NH NJ NY PA RI VT).'
  },
  {
    id: 'rule-lm-bop-ne-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'BOP',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 20.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual premium pricing Northeast BOP renewal.'
  },
  {
    id: 'rule-lm-bop-other-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'BOP',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual BOP standard outside NE region.'
  },
  {
    id: 'rule-lm-bop-other-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'BOP',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual BOP standard renewal outside NE.'
  },
  {
    id: 'rule-lm-gl-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Standalone General Liability.'
  },
  {
    id: 'rule-lm-gl-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Standalone General Liability Renewal.'
  },
  {
    id: 'rule-lm-prop-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Commercial Property',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Standalone Commercial Property.'
  },
  {
    id: 'rule-lm-prop-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Commercial Property',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Standalone Property Renewal.'
  },
  {
    id: 'rule-lm-auto-mono-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Commercial Auto',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Lowest rate — standalone monoline Commercial Auto.'
  },
  {
    id: 'rule-lm-auto-mono-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Commercial Auto',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual monoline Commercial Auto Renewal.'
  },
  {
    id: 'rule-lm-excess-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Excess Liability',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Excess Liability / Umbrella.'
  },
  {
    id: 'rule-lm-excess-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Excess Liability',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Excess Liability Renewal.'
  },
  {
    id: 'rule-lm-im-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Inland Marine',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Standalone Inland Marine.'
  },
  {
    id: 'rule-lm-im-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Inland Marine',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'Liberty Mutual Inland Marine Renewal.'
  },
  {
    id: 'rule-lm-wc-mm-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Workers Comp Middle Market tier ($100K-250K).'
  },
  {
    id: 'rule-lm-wc-mm-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Workers Comp Middle Market Renewal.'
  },
  {
    id: 'rule-lm-wc-sm-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'Workers Comp Small Commercial tier ($25K-100K).'
  },
  {
    id: 'rule-lm-wc-sm-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Workers Comp Small Commercial Renewal.'
  },
  {
    id: 'rule-lm-wc-micro-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Workers Comp Micro Business tier (<$25K).'
  },
  {
    id: 'rule-lm-wc-micro-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Workers Comp Micro Business Renewal.'
  },

  // State specific schedules (Liberty Mutual)
  {
    id: 'rule-lm-wc-fl-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp (FL)',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 13.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Florida specific Workers Comp rate.'
  },
  {
    id: 'rule-lm-wc-fl-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp (FL)',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Florida Workers Comp renewal.'
  },
  {
    id: 'rule-lm-wc-or-new',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp (OR)',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 11.5,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Oregon specific Workers Comp rate.'
  },
  {
    id: 'rule-lm-wc-or-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp (OR)',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.5,
    paymentTiming: 'As Earned',
    notes: 'Liberty Mutual Oregon Workers Comp renewal.'
  },
  {
    id: 'rule-lm-wc-se-renew',
    carrier: 'Liberty Mutual',
    lineOfBusiness: 'Workers Comp (GA/SE)',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Southeast region WC renewal rate (inception prior to 1/1/2022).'
  },

  // Pathpoint
  {
    id: 'rule-pp-bop-new',
    carrier: 'Pathpoint',
    lineOfBusiness: 'BOP',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'E&S Wholesaler BOP (Markel, Westchester, etc).'
  },
  {
    id: 'rule-pp-bop-renew',
    carrier: 'Pathpoint',
    lineOfBusiness: 'BOP',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint BOP Renewal.'
  },
  {
    id: 'rule-pp-cyber-new',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Commercial Cyber',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Commercial Cyber (New).'
  },
  {
    id: 'rule-pp-cyber-renew',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Commercial Cyber',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Commercial Cyber Renewal.'
  },
  {
    id: 'rule-pp-gl-new',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'As Earned',
    notes: 'Pathpoint Commercial General Liability.'
  },
  {
    id: 'rule-pp-gl-renew',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'As Earned',
    notes: 'Pathpoint Commercial General Liability Renewal.'
  },
  {
    id: 'rule-pp-prop-new',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Commercial Property',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Commercial Property (New).'
  },
  {
    id: 'rule-pp-prop-renew',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Commercial Property',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Commercial Property Renewal.'
  },
  {
    id: 'rule-pp-excess-new',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Excess Liability',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Commercial Excess / Umbrella.'
  },
  {
    id: 'rule-pp-excess-renew',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Excess Liability',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 11.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Excess Liability Renewal.'
  },
  {
    id: 'rule-pp-mm-new',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Middle Market Comm Lines',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Middle Market accounts standard rate.'
  },
  {
    id: 'rule-pp-mm-renew',
    carrier: 'Pathpoint',
    lineOfBusiness: 'Middle Market Comm Lines',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'In Advance',
    notes: 'Pathpoint Middle Market Renewal.'
  },

  // ISC
  {
    id: 'rule-isc-br-new',
    carrier: 'ISC',
    lineOfBusiness: "Builder's Risk",
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'ISC Builder\'s Risk program. Tech-driven program admin.'
  },
  {
    id: 'rule-isc-br-renew',
    carrier: 'ISC',
    lineOfBusiness: "Builder's Risk",
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'In Advance',
    notes: 'ISC Builder\'s Risk Renewal.'
  },
  {
    id: 'rule-isc-gl-new',
    carrier: 'ISC',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'ISC Commercial General Liability (New).'
  },
  {
    id: 'rule-isc-gl-renew',
    carrier: 'ISC',
    lineOfBusiness: 'Commercial GL',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 15.0,
    paymentTiming: 'As Earned',
    notes: 'ISC General Liability Renewal.'
  },
  {
    id: 'rule-isc-landlord-new',
    carrier: 'ISC',
    lineOfBusiness: 'Landlord',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'In Advance',
    notes: 'ISC Landlord Package program (New).'
  },
  {
    id: 'rule-isc-landlord-renew',
    carrier: 'ISC',
    lineOfBusiness: 'Landlord',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'In Advance',
    notes: 'ISC Landlord Package Renewal.'
  },

  // biBERK
  {
    id: 'rule-biberk-wc-new',
    carrier: 'biBERK',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Berkshire Hathaway. Paid via First Connect.'
  },
  {
    id: 'rule-biberk-wc-renew',
    carrier: 'biBERK',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 7.5,
    paymentTiming: 'As Earned',
    notes: 'biBERK Workers Comp renewal rate.'
  },
  {
    id: 'rule-biberk-bop-new',
    carrier: 'biBERK',
    lineOfBusiness: 'BOP',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'In Advance',
    notes: 'biBERK BOP program (New).'
  },
  {
    id: 'rule-biberk-bop-renew',
    carrier: 'biBERK',
    lineOfBusiness: 'BOP',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'In Advance',
    notes: 'biBERK BOP program renewal.'
  },

  // Employers
  {
    id: 'rule-emp-wc-new',
    carrier: 'Employers',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'Employers Workers Comp via First Connect. High confidence.'
  },
  {
    id: 'rule-emp-wc-renew',
    carrier: 'Employers',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Employers Workers Comp Renewal.'
  },

  // Fairmatic
  {
    id: 'rule-fairmatic-new',
    carrier: 'Fairmatic',
    lineOfBusiness: 'Fleet Auto',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'Cannabis delivery, last-mile commercial DSP fleets.'
  },
  {
    id: 'rule-fairmatic-renew',
    carrier: 'Fairmatic',
    lineOfBusiness: 'Fleet Auto',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 10.0,
    paymentTiming: 'As Earned',
    notes: 'Fairmatic Fleet Auto Renewal.'
  },

  // Normandy
  {
    id: 'rule-normandy-wc-new',
    carrier: 'Normandy',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'As Earned',
    notes: 'Normandy Workers Comp (New). Safe-harbor WC program.'
  },
  {
    id: 'rule-normandy-wc-renew',
    carrier: 'Normandy',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'As Earned',
    notes: 'Normandy Workers Comp Renewal.'
  },

  // Scraped Portal references 
  {
    id: 'rule-scraped-fetch-new',
    carrier: 'Fetch',
    lineOfBusiness: 'Commercial Lines',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 9.0,
    paymentTiming: 'In Advance',
    notes: 'Scraped portal rate (confirm in portal before acting).'
  },
  {
    id: 'rule-scraped-novella-new',
    carrier: 'Novella',
    lineOfBusiness: 'Commercial Lines',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 8.0,
    paymentTiming: 'As Earned',
    notes: 'Scraped portal rate (confirm in portal before acting).'
  },
  {
    id: 'rule-scraped-rli-new',
    carrier: 'RLI',
    lineOfBusiness: 'Commercial Lines',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 13.0,
    paymentTiming: 'In Advance',
    notes: 'Scraped portal rate (Property / Cyber / Umbrella).'
  },
  {
    id: 'rule-scraped-steadily-new',
    carrier: 'Steadily',
    lineOfBusiness: 'Commercial Lines',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 12.0,
    paymentTiming: 'In Advance',
    notes: 'Scraped portal rate (Commercial Landlord Property).'
  },

  // Benefits & Supplemental: Aflac Group schedules
  {
    id: 'rule-aflac-life-new',
    carrier: 'Aflac',
    lineOfBusiness: 'Whole Life Group',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 90.0,
    paymentTiming: 'As Earned',
    notes: 'First Year commission Level 14 Broker schedule.'
  },
  {
    id: 'rule-aflac-life-renew',
    carrier: 'Aflac',
    lineOfBusiness: 'Whole Life Group',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 4.0,
    paymentTiming: 'As Earned',
    notes: 'Aflac Whole Life group renewal.'
  },
  {
    id: 'rule-aflac-term-new',
    carrier: 'Aflac',
    lineOfBusiness: 'Term Life Group',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 56.3,
    paymentTiming: 'As Earned',
    notes: 'First Year Term Life 31-60 Group schedule.'
  },
  {
    id: 'rule-aflac-term-renew',
    carrier: 'Aflac',
    lineOfBusiness: 'Term Life Group',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 12.8,
    paymentTiming: 'As Earned',
    notes: 'Aflac Term Life group renewal.'
  },
  {
    id: 'rule-aflac-ci-new',
    carrier: 'Aflac',
    lineOfBusiness: 'Critical Illness',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: 63.3,
    paymentTiming: 'In Advance',
    notes: 'First Year Lump Sum Critical Illness Broker schedule.'
  },
  {
    id: 'rule-aflac-ci-renew',
    carrier: 'Aflac',
    lineOfBusiness: 'Critical Illness',
    newRenewal: 'Renewal',
    method: '% of Premium',
    ratePercentage: 8.6,
    paymentTiming: 'In Advance',
    notes: 'Aflac Critical Illness group renewal.'
  }
];

export const INITIAL_POLICIES: WonPolicy[] = [
  {
    id: 'policy-1',
    policyNumber: 'EX-001',
    dateWon: '2026-06-05',
    clientName: 'Marcus & Tina Ellison',
    carrier: 'Example P&C Co',
    lineOfBusiness: 'Homeowners',
    newRenewal: 'New',
    premiumAmount: 4180,
    paymentTiming: 'In Advance',
    notes: 'EXAMPLE — delete'
  },
  {
    id: 'policy-2',
    policyNumber: 'EX-002',
    dateWon: '2026-06-05',
    clientName: 'TrueCraft Drywall',
    carrier: 'INVO PEO',
    lineOfBusiness: "Workers' Comp (PEO)",
    newRenewal: 'New',
    payrollAmount: 170000,
    numberOfEmployees: 4,
    manualExpectedAmount: 2500,
    paymentTiming: 'As Earned',
    notes: 'EXAMPLE — PEO, Manual expected typed in'
  },
  {
    id: 'policy-3',
    policyNumber: 'EX-003',
    dateWon: '2026-06-06',
    clientName: 'Apex Woodworks',
    carrier: 'TrueCraft PEO',
    lineOfBusiness: 'Co-Employment HR',
    newRenewal: 'New',
    adminFeeAmount: 5000,
    paymentTiming: 'As Earned',
    notes: 'EXAMPLE — calculations based on % of admin fee ($5,000)'
  },
  {
    id: 'policy-4',
    policyNumber: 'EX-004',
    dateWon: '2026-06-06',
    clientName: 'Coastal Builders Corp',
    carrier: 'AmTrust Financial',
    lineOfBusiness: 'Workers Comp',
    newRenewal: 'New',
    premiumAmount: 12000,
    monthlyPremiumAmount: 1000,
    paymentTiming: 'As Earned',
    notes: 'EXAMPLE — premium paid monthly'
  }
];

export const INITIAL_RECONCILIATION: ReconciliationStatement[] = [
  {
    id: 'statement-1',
    statementMonth: '2026-06',
    policyId: 'policy-1', // maps to EX-001 which has $627 expected
    receivedAmount: 580,
    transactionType: 'Payment',
    notes: 'EXAMPLE — deposit check 40129'
  },
  {
    id: 'statement-2',
    statementMonth: '2026-06',
    policyId: 'policy-1', // maps to EX-001 (Homeowners short check)
    receivedAmount: 47,
    transactionType: 'Chargeback',
    notes: 'EXAMPLE — endorsement refund adjustment chargeback'
  },
  {
    id: 'statement-3',
    statementMonth: '2026-06',
    policyId: 'policy-3', // Apex Woodworks: Expected $750
    receivedAmount: 750,
    transactionType: 'Payment',
    notes: 'EXAMPLE — direct electronic sweep'
  }
];

// Formatting Utilities
export const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  const prefix = val < 0 ? '-' : '';
  const absVal = Math.abs(val);
  return prefix + new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(absVal);
};

export const formatCurrencyDecimal = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  const prefix = val < 0 ? '-' : '';
  const absVal = Math.abs(val);
  return prefix + new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absVal);
};

export const formatPercentage = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  return `${val.toFixed(1)}%`;
};

// Main Rule Lookup and Calculation Logic with complex types matched
export function lookupAndCalculate(
  policy: WonPolicy,
  rules: CarrierRule[]
): RuleLookupResult {
  // Try exact match matching Carrier, Line of Business, and New/Renewal (case-insensitive trim)
  const matchedRule = rules.find(
    (r) =>
      r.carrier.trim().toLowerCase() === policy.carrier.trim().toLowerCase() &&
      r.lineOfBusiness.trim().toLowerCase() === policy.lineOfBusiness.trim().toLowerCase() &&
      r.newRenewal === policy.newRenewal
  );

  // Default timing fallback: use policy field, then rule field, else default to 'As Earned'
  const finalTiming = policy.paymentTiming || (matchedRule ? matchedRule.paymentTiming : undefined) || 'As Earned';

  if (!matchedRule) {
    return {
      ruleFound: false,
      paymentTiming: finalTiming,
      expectedAmount: policy.manualExpectedAmount || 0
    };
  }

  let expectedAmount = 0;
  const method = matchedRule.method;
  const ratePercentage = matchedRule.ratePercentage || 0;
  const flatOrPerEmployeeAmount = matchedRule.flatOrPerEmployeeAmount || 0;

  switch (method) {
    case '% of Premium': {
      const premium = policy.premiumAmount || 0;
      expectedAmount = (premium * ratePercentage) / 100;
      break;
    }
    case '% of Payroll': {
      const payroll = policy.payrollAmount || 0;
      expectedAmount = (payroll * ratePercentage) / 100;
      break;
    }
    case 'Flat $': {
      expectedAmount = flatOrPerEmployeeAmount;
      break;
    }
    case 'Per Employee': {
      const emps = policy.numberOfEmployees || 0;
      expectedAmount = flatOrPerEmployeeAmount * emps;
      break;
    }
    case '% of Monthly Premium': {
      const monthlyPremium = policy.monthlyPremiumAmount || (policy.premiumAmount ? policy.premiumAmount / 12 : 0);
      expectedAmount = (monthlyPremium * ratePercentage) / 100;
      break;
    }
    case '% of Admin Fee': {
      const adminFee = policy.adminFeeAmount || 0;
      expectedAmount = (adminFee * ratePercentage) / 100;
      break;
    }
    case 'Manual': {
      expectedAmount = policy.manualExpectedAmount || 0;
      break;
    }
    default:
      expectedAmount = 0;
  }

  return {
    ruleFound: true,
    method,
    ratePercentage: matchedRule.ratePercentage,
    flatOrPerEmployeeAmount: matchedRule.flatOrPerEmployeeAmount,
    paymentTiming: finalTiming,
    expectedAmount
  };
}

// Calculate Carrier Summary for QuickBooks (Expected, Received, Short, Chargebacks per carrier)
export function calculateCarrierSummaries(
  policies: WonPolicy[],
  statements: ReconciliationStatement[],
  rules: CarrierRule[]
): CarrierSummary[] {
  const summariesMap = new Map<string, { expected: number; received: number; chargebacks: number }>();

  // Gather Expected from all won policies
  policies.forEach((policy) => {
    const { expectedAmount } = lookupAndCalculate(policy, rules);
    const key = policy.carrier.trim();
    if (!key) return;

    const current = summariesMap.get(key) || { expected: 0, received: 0, chargebacks: 0 };
    summariesMap.set(key, { ...current, expected: current.expected + expectedAmount });
  });

  // Gather Received and Chargebacks from reconciliation statements
  statements.forEach((stmt) => {
    const matchingPolicy = policies.find((p) => p.id === stmt.policyId);
    if (!matchingPolicy) return;

    const key = matchingPolicy.carrier.trim();
    if (!key) return;

    const current = summariesMap.get(key) || { expected: 0, received: 0, chargebacks: 0 };
    const amt = stmt.receivedAmount || 0;

    if (stmt.transactionType === 'Chargeback') {
      // Chargeback reduces active cash received on the ledger, and is accumulated in chargebacks separately
      current.received = current.received - amt;
      current.chargebacks = current.chargebacks + amt;
    } else {
      current.received = current.received + amt;
    }

    summariesMap.set(key, current);
  });

  // Convert to array and compute shortages
  const result: CarrierSummary[] = [];
  summariesMap.forEach((val, carrier) => {
    // Variance could be short
    const short = Math.max(0, val.expected - val.received);
    result.push({
      carrier,
      expected: val.expected,
      received: val.received,
      short,
      chargebacks: val.chargebacks
    });
  });

  return result.sort((a, b) => b.short - a.short || a.carrier.localeCompare(b.carrier));
}

// LocalStorage helpers
export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Failed to read key "${key}" from localStorage:`, e);
    return defaultValue;
  }
}

export function setStoredData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to write key "${key}" to localStorage:`, e);
  }
}

export const INITIAL_S_SCHEDULES: CarrierSchedule[] = [
  {
    id: 'sched-1',
    carrier: 'GEICO Commercial',
    closeDay: 'Last day of month',
    payDay: '7th workday of month',
    notes: 'GEICO commercial pays every 7th workday of the month.'
  },
  {
    id: 'sched-2',
    carrier: 'Example Auto Co',
    closeDay: '20th of the month',
    payDay: '28th of the month',
    notes: 'Standard auto broker splits.'
  },
  {
    id: 'sched-3',
    carrier: 'Example P&C Co',
    closeDay: '15th of the month',
    payDay: '5th of following month',
    notes: 'Upfront commissions are compiled mid-month and swept ACH.'
  },
  {
    id: 'sched-4',
    carrier: 'AmTrust Financial',
    closeDay: '25th of the month',
    payDay: '10th of following month',
    notes: 'Requires monthly payroll report validation first.'
  },
  {
    id: 'sched-5',
    carrier: 'INVO PEO',
    closeDay: 'Weekly on Friday',
    payDay: 'Following Thursday',
    notes: 'PEO commissions are paid on administrative service fees.'
  },
  {
    id: 'sched-6',
    carrier: 'TrueCraft PEO',
    closeDay: 'Semi-monthly (15th / 30th)',
    payDay: '7 calendar days after period close',
    notes: 'Direct payout deposit.'
  }
];

