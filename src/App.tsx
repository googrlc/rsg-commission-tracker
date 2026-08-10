/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  Search,
  Copy,
  Check,
  BookOpen,
  Filter,
  X,
  Sparkles,
  DollarSign,
  ArrowRight,
  Info,
  Calendar,
  Clock
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { CarrierRule, WonPolicy, ReconciliationStatement, CommissionMethod, CarrierSchedule } from './types';
import {
  formatCurrency,
  formatCurrencyDecimal,
  formatPercentage,
  lookupAndCalculate,
  calculateCarrierSummaries,
  getStoredData,
  setStoredData
} from './utils';
import { useAuth } from './lib/auth';
import * as repo from './data/repository';
import { LogOut, RotateCw } from 'lucide-react';
import ReconciliationQueue from './components/ReconciliationQueue';
import StatementBookSummary from './components/StatementBookSummary';
import CommissionWorkspace from './components/recon/CommissionWorkspace';
import DashboardPage from './components/recon/DashboardPage';
import QuickBooksSummaryPage from './components/recon/QuickBooksSummaryPage';
import CarrierCalendarPage from './components/recon/CarrierCalendarPage';

export default function App() {
  const { email, signOut } = useAuth();

  // Carrier pay-day calendars have no matching Supabase table yet, so they stay
  // in localStorage (non-sensitive reference data — no client names/premiums).
  const SCHEDULES_STORAGE_KEY = 'rsg_carrier_schedules';

  // State — rules/policies/reconciliations now load from Supabase (see effect).
  const [rules, setRules] = useState<CarrierRule[]>([]);
  const [policies, setPolicies] = useState<WonPolicy[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationStatement[]>([]);
  const [schedules, setSchedules] = useState<CarrierSchedule[]>(() =>
    getStoredData<CarrierSchedule[]>(SCHEDULES_STORAGE_KEY, [])
  );

  // Data-load lifecycle
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'recon' | 'policies' | 'rules' | 'queue' | 'guide' | 'workspace' | 'dashboard' | 'quickbooks' | 'calendar'>('recon');
  const [rulesSubTab, setRulesSubTab] = useState<'rules' | 'schedules'>('rules');
  const [searchQuery, setSearchQuery] = useState('');
  const [reconFilter, setReconFilter] = useState<'All' | 'Shorts' | 'Perfect' | 'Excess'>('All');
  const [copiedCarrier, setCopiedCarrier] = useState<string | null>(null);

  // Carrier filter for the Carrier Rules Matrix (look up one carrier's rules, e.g. Liberty Mutual).
  const [ruleCarrierFilter, setRuleCarrierFilter] = useState<string>('All');

  // Ingestion confirmation banner — proves a save actually landed in Supabase.
  const [ingestToast, setIngestToast] = useState<{ title: string; detail: string } | null>(null);

  // Bulk import states
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  const [bulkImportSuccess, setBulkImportSuccess] = useState<string | null>(null);

  // Carrier Schedules forms
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [editingSchedId, setEditingSchedId] = useState<string | null>(null);
  const [schedFormData, setSchedFormData] = useState<Partial<CarrierSchedule>>({
    carrier: '',
    closeDay: '',
    payDay: '',
    notes: ''
  });

  // Auto-Match deposit states
  const [showAutoMatch, setShowAutoMatch] = useState(false);
  const [autoMatchText, setAutoMatchText] = useState('');
  const [autoMatchMonth, setAutoMatchMonth] = useState<string>(
    new Date().toISOString().substring(0, 7)
  );
  const [autoMatchError, setAutoMatchError] = useState<string | null>(null);
  const [autoMatchSuccess, setAutoMatchSuccess] = useState<string | null>(null);
  const [autoMatchPreview, setAutoMatchPreview] = useState<
    Array<{
      id: string;
      depositCarrier: string;
      depositAmount: number;
      matchedPolicy: WonPolicy | null;
      matchType: 'Perfect' | 'Approximate' | 'None';
      difference: number;
      expectedAmount: number;
      selected: boolean;
    }>
  >([]);

  // Form states
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleFormData, setRuleFormData] = useState<Partial<CarrierRule>>({
    carrier: '',
    lineOfBusiness: '',
    newRenewal: 'New',
    method: '% of Premium',
    ratePercentage: undefined,
    flatOrPerEmployeeAmount: undefined,
    paymentTiming: 'As Earned',
    notes: ''
  });

  const [showPolicyForm, setShowPolicyForm] = useState(false);
  // Ledger row detail panel (slide-over) — edit a policy in place, no side-scrolling.
  const [detailPolicy, setDetailPolicy] = useState<WonPolicy | null>(null);
  const [detailForm, setDetailForm] = useState<Partial<WonPolicy>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [policyFormData, setPolicyFormData] = useState<Partial<WonPolicy>>({
    policyNumber: '',
    dateWon: new Date().toISOString().split('T')[0],
    policyEffectiveDate: '',
    clientName: '',
    carrier: '',
    lineOfBusiness: '',
    newRenewal: 'New',
    premiumAmount: undefined,
    payrollAmount: undefined,
    numberOfEmployees: undefined,
    adminFeeAmount: undefined,
    agencyFeeAmount: undefined,
    billingType: undefined,
    monthlyPremiumAmount: undefined,
    paymentTiming: undefined,
    manualExpectedAmount: undefined,
    notes: ''
  });

  const [showReconForm, setShowReconForm] = useState(false);
  const [reconFormData, setReconFormData] = useState<Partial<ReconciliationStatement>>({
    statementMonth: new Date().toISOString().substring(0, 7), // "YYYY-MM"
    policyId: '',
    receivedAmount: undefined,
    transactionType: 'Payment',
    notes: ''
  });

  // Persist only carrier schedules to localStorage (still local — see above).
  useEffect(() => {
    setStoredData(SCHEDULES_STORAGE_KEY, schedules);
  }, [schedules]);

  // Load rules / policies / reconciliations from Supabase.
  const loadData = async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const { rules, policies, reconciliations } = await repo.fetchAllData();
      setRules(rules);
      setPolicies(policies);
      setReconciliations(reconciliations);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the ingestion confirmation after a few seconds (still manually closeable).
  useEffect(() => {
    if (!ingestToast) return;
    const t = setTimeout(() => setIngestToast(null), 8000);
    return () => clearTimeout(t);
  }, [ingestToast]);

  // Rule Form Submit — writes to Supabase (admin-only, enforced by RLS)
  const handleRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleFormData.carrier || !ruleFormData.lineOfBusiness) {
      alert('Please fill out Carrier and Line of Business');
      return;
    }
    if (saving) return;

    const draft: CarrierRule = {
      id: `rule-${Date.now()}`,
      carrier: ruleFormData.carrier.trim(),
      lineOfBusiness: ruleFormData.lineOfBusiness.trim(),
      newRenewal: ruleFormData.newRenewal as 'New' | 'Renewal',
      method: ruleFormData.method as CommissionMethod,
      ratePercentage: ruleFormData.ratePercentage,
      flatOrPerEmployeeAmount: ruleFormData.flatOrPerEmployeeAmount,
      paymentTiming: ruleFormData.paymentTiming as 'As Earned' | 'In Advance',
      notes: ruleFormData.notes?.trim() || ''
    };

    setSaving(true);
    try {
      const created = await repo.createRule(draft);
      setRules([created, ...rules]);
      setShowRuleForm(false);
      // Reset form
      setRuleFormData({
        carrier: '',
        lineOfBusiness: '',
        newRenewal: 'New',
        method: '% of Premium',
        ratePercentage: undefined,
        flatOrPerEmployeeAmount: undefined,
        paymentTiming: 'As Earned',
        notes: ''
      });
    } catch (err) {
      alert(
        `Could not save rule: ${err instanceof Error ? err.message : err}.\n` +
          'Rule edits require an admin (Lamar) account.'
      );
    } finally {
      setSaving(false);
    }
  };

  // Bulk Rule import handler
  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkImportError(null);
    setBulkImportSuccess(null);

    if (!bulkImportText.trim()) {
      setBulkImportError('Please paste some rules data first.');
      return;
    }

    const lines = bulkImportText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newRulesToInject: CarrierRule[] = [];
    const errors: string[] = [];

    const validMethods: CommissionMethod[] = [
      '% of Premium',
      '% of Monthly Premium',
      '% of Admin Fee',
      '% of Payroll',
      'Flat $',
      'Per Employee',
      'Manual'
    ];

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      if (
        index === 0 &&
        (lowerLine.includes('carrier') ||
          lowerLine.includes('line of business') ||
          lowerLine.includes('commission method') ||
          lowerLine.includes('new/renewal') ||
          lowerLine.includes('lob') ||
          lowerLine.includes('timing'))
      ) {
        return; // skip index header row
      }

      // Try tab split first (Excel copy-paste), then fall back to comma split (CSV), then semi-colon
      let parts = line.split('\t');
      if (parts.length < 3) {
        parts = line.split(',');
      }
      if (parts.length < 3) {
        parts = line.split(';');
      }

      if (parts.length < 4) {
        errors.push(`Row ${index + 1}: Insufficient columns. Need Carrier, Line of Business, New/Renewal, and Commission Method.`);
        return;
      }

      const carrier = parts[0]?.trim();
      const lineOfBusiness = parts[1]?.trim();
      const newRenewalRaw = parts[2]?.trim();
      const methodRaw = parts[3]?.trim();
      const rateRaw = parts[4]?.trim();
      const amountRaw = parts[5]?.trim();
      const timingRaw = parts[6]?.trim();
      const notes = parts[7]?.trim();

      if (!carrier || !lineOfBusiness) {
        errors.push(`Row ${index + 1}: Carrier and Line of Business are required.`);
        return;
      }

      let newRenewal: 'New' | 'Renewal' = 'New';
      if (newRenewalRaw && (newRenewalRaw.toLowerCase().includes('renew') || newRenewalRaw.toLowerCase() === 'renewal' || newRenewalRaw.toLowerCase() === 'renewals')) {
        newRenewal = 'Renewal';
      }

      let method: CommissionMethod = '% of Premium';
      const normalizedMethod = methodRaw ? methodRaw.toLowerCase() : '';

      if (normalizedMethod.includes('monthly') || normalizedMethod.includes('monthly premium')) {
        method = '% of Monthly Premium';
      } else if (normalizedMethod.includes('admin') || normalizedMethod.includes('fee')) {
        method = '% of Admin Fee';
      } else if (normalizedMethod.includes('payroll')) {
        method = '% of Payroll';
      } else if (normalizedMethod.includes('premium')) {
        method = '% of Premium';
      } else if (normalizedMethod.includes('flat')) {
        method = 'Flat $';
      } else if (normalizedMethod.includes('per employee') || normalizedMethod.includes('employee') || normalizedMethod.includes('per-emp')) {
        method = 'Per Employee';
      } else if (normalizedMethod.includes('manual')) {
        method = 'Manual';
      } else {
        const found = validMethods.find(vm => vm.toLowerCase() === normalizedMethod);
        if (found) {
          method = found;
        } else {
          errors.push(`Row ${index + 1}: Unknown Commission Method "${methodRaw}". Choose from: ${validMethods.join(', ')}.`);
          return;
        }
      }

      let ratePercentage: number | undefined;
      if (rateRaw && rateRaw !== '-' && rateRaw !== '—') {
        const cleanRate = rateRaw.replace('%', '').trim();
        const parsed = Number(cleanRate);
        if (!isNaN(parsed)) {
          ratePercentage = parsed;
        }
      }

      let flatOrPerEmployeeAmount: number | undefined;
      if (amountRaw && amountRaw !== '-' && amountRaw !== '—') {
        const cleanAmt = amountRaw.replace('$', '').trim();
        const parsed = Number(cleanAmt);
        if (!isNaN(parsed)) {
          flatOrPerEmployeeAmount = parsed;
        }
      }

      let paymentTiming: 'As Earned' | 'In Advance' = 'As Earned';
      if (timingRaw && (timingRaw.toLowerCase().includes('advance') || timingRaw.toLowerCase().includes('upfront') || timingRaw.toLowerCase() === 'in advance')) {
        paymentTiming = 'In Advance';
      }

      const ruleId = `rule-bulk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      newRulesToInject.push({
        id: ruleId,
        carrier,
        lineOfBusiness,
        newRenewal,
        method,
        ratePercentage,
        flatOrPerEmployeeAmount,
        paymentTiming,
        notes: notes || 'Bulk imported'
      });
    });

    if (errors.length > 0) {
      setBulkImportError(`Parsing rules list failed with ${errors.length} error(s):\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more errors.` : ''}`);
      return;
    }

    if (newRulesToInject.length === 0) {
      setBulkImportError('No valid rows found to import.');
      return;
    }

    try {
      const created = await repo.createRulesBulk(newRulesToInject);
      setRules(prev => [...created, ...prev]);
      setBulkImportSuccess(`Success! Imported ${created.length} custom commission rules into your rulebook.`);
      setBulkImportText('');
      setTimeout(() => {
        setShowBulkImport(false);
        setBulkImportSuccess(null);
      }, 2500);
    } catch (err) {
      setBulkImportError(
        `Could not save rules: ${err instanceof Error ? err.message : err}. ` +
          'Rule edits require an admin (Lamar) account.'
      );
    }
  };
  const handlePolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyFormData.policyNumber || !policyFormData.clientName || !policyFormData.carrier || !policyFormData.lineOfBusiness) {
      alert('Please fill out Policy Number, Client Name, Carrier and Line of Business');
      return;
    }
    if (saving) return;

    const draft: WonPolicy = {
      id: `policy-${Date.now()}`,
      policyNumber: policyFormData.policyNumber.trim(),
      dateWon: policyFormData.dateWon || new Date().toISOString().split('T')[0],
      policyEffectiveDate: policyFormData.policyEffectiveDate || undefined,
      clientName: policyFormData.clientName.trim(),
      carrier: policyFormData.carrier.trim(),
      lineOfBusiness: policyFormData.lineOfBusiness.trim(),
      newRenewal: policyFormData.newRenewal as 'New' | 'Renewal',
      premiumAmount: policyFormData.premiumAmount,
      payrollAmount: policyFormData.payrollAmount,
      numberOfEmployees: policyFormData.numberOfEmployees,
      adminFeeAmount: policyFormData.adminFeeAmount ?? policyFormData.agencyFeeAmount,
      agencyFeeAmount: policyFormData.agencyFeeAmount ?? policyFormData.adminFeeAmount,
      billingType: policyFormData.billingType,
      monthlyPremiumAmount: policyFormData.monthlyPremiumAmount,
      paymentTiming: policyFormData.paymentTiming as 'As Earned' | 'In Advance' | undefined,
      manualExpectedAmount: policyFormData.manualExpectedAmount,
      notes: policyFormData.notes?.trim() || ''
    };

    // Compute expected commission from the rulebook so the ledger row carries it.
    const { expectedAmount } = lookupAndCalculate(draft, rules);

    setSaving(true);
    try {
      const created = await repo.createPolicy(draft, expectedAmount);
      setPolicies([created, ...policies]);
      setShowPolicyForm(false);
      // Reset form
      setPolicyFormData({
        policyNumber: '',
        dateWon: new Date().toISOString().split('T')[0],
        policyEffectiveDate: '',
        clientName: '',
        carrier: '',
        lineOfBusiness: '',
        newRenewal: 'New',
        premiumAmount: undefined,
        payrollAmount: undefined,
        numberOfEmployees: undefined,
        adminFeeAmount: undefined,
        agencyFeeAmount: undefined,
        billingType: undefined,
        monthlyPremiumAmount: undefined,
        paymentTiming: undefined,
        manualExpectedAmount: undefined,
        notes: ''
      });
    } catch (err) {
      alert(`Could not save policy: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  // Recon Form Submit
  const handleReconSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconFormData.policyId || reconFormData.receivedAmount === undefined) {
      alert('Please choose a Policy and enter Received Amount');
      return;
    }
    if (saving) return;

    const policy = policies.find((p) => p.id === reconFormData.policyId);
    if (!policy) {
      alert('Selected policy could not be found. Refresh and try again.');
      return;
    }

    const draft: ReconciliationStatement = {
      id: `recon-${Date.now()}`,
      statementMonth: reconFormData.statementMonth || new Date().toISOString().substring(0, 7),
      policyId: reconFormData.policyId,
      receivedAmount: Number(reconFormData.receivedAmount),
      transactionType: reconFormData.transactionType as 'Payment' | 'Chargeback',
      notes: reconFormData.notes?.trim() || ''
    };

    setSaving(true);
    try {
      const created = await repo.createReconciliation(draft, policy);
      setReconciliations([created, ...reconciliations]);
      setShowReconForm(false);
      // Confirm the ingestion actually landed — echo the persisted values so the
      // user can see the save was taken (created.id proves it hit Supabase).
      const { expectedAmount } = lookupAndCalculate(policy, rules);
      const signedReceived = created.transactionType === 'Chargeback' ? -created.receivedAmount : created.receivedAmount;
      const variance = signedReceived - expectedAmount;
      const varianceNote = expectedAmount
        ? ` · expected ${formatCurrencyDecimal(expectedAmount)}, variance ${variance >= 0 ? '+' : ''}${formatCurrencyDecimal(variance)}`
        : '';
      setIngestToast({
        title: `Statement ingested — saved to ledger`,
        detail: `${created.transactionType} ${formatCurrencyDecimal(created.receivedAmount)} for ${policy.clientName} · ${policy.carrier} · ${created.statementMonth}${varianceNote}`,
      });
      setReconFormData({
        statementMonth: new Date().toISOString().substring(0, 7),
        policyId: '',
        receivedAmount: undefined,
        transactionType: 'Payment',
        notes: ''
      });
    } catch (err) {
      alert(`Could not save reconciliation: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this carrier rule? All matching policies will fallback to Manual calculation if rule is removed.')) return;
    try {
      await repo.deleteRule(id);
      setRules(rules.filter((r) => r.id !== id));
    } catch (err) {
      alert(`Could not delete rule: ${err instanceof Error ? err.message : err}. Rule edits require an admin (Lamar) account.`);
    }
  };

  const openPolicyDetail = (policy: WonPolicy) => {
    setDetailPolicy(policy);
    setDetailForm({ ...policy });
  };

  const closePolicyDetail = () => {
    setDetailPolicy(null);
    setDetailForm({});
  };

  const savePolicyDetail = async () => {
    if (!detailPolicy || detailSaving) return;
    if (!detailForm.policyNumber?.trim() || !detailForm.clientName?.trim() || !detailForm.carrier?.trim()) {
      alert('Policy #, Client, and Carrier are required.');
      return;
    }
    const draft: WonPolicy = {
      ...detailPolicy,
      ...detailForm,
      policyNumber: detailForm.policyNumber.trim(),
      clientName: detailForm.clientName.trim(),
      carrier: detailForm.carrier.trim(),
      lineOfBusiness: (detailForm.lineOfBusiness ?? '').trim(),
      notes: detailForm.notes?.trim() || ''
    };
    const { expectedAmount } = lookupAndCalculate(draft, rules);
    setDetailSaving(true);
    try {
      const updated = await repo.updatePolicy(draft, expectedAmount);
      setPolicies(policies.map((p) => (p.id === updated.id ? updated : p)));
      closePolicyDetail();
    } catch (err) {
      alert(`Could not update policy: ${err instanceof Error ? err.message : err}`);
    } finally {
      setDetailSaving(false);
    }
  };

  const deletePolicy = async (id: string) => {
    if (!confirm("Delete this won policy? This will also remove any reconciliation statements tied to this policy number.")) return;
    try {
      await repo.deletePolicy(id);
      setPolicies(policies.filter((p) => p.id !== id));
      setReconciliations(reconciliations.filter((rc) => rc.policyId !== id));
    } catch (err) {
      alert(`Could not delete policy: ${err instanceof Error ? err.message : err}`);
    }
  };

  const deleteRecon = async (id: string) => {
    if (!confirm('Remove this reconciliation record?')) return;
    try {
      await repo.deleteReconciliation(id);
      setReconciliations(reconciliations.filter((rc) => rc.id !== id));
    } catch (err) {
      alert(`Could not delete reconciliation: ${err instanceof Error ? err.message : err}`);
    }
  };

  // Carrier Schedules actions
  const handleSchedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedFormData.carrier || !schedFormData.closeDay || !schedFormData.payDay) {
      alert('Please fill out Carrier, Close Day, and Pay Day');
      return;
    }

    if (editingSchedId) {
      setSchedules(prev =>
        prev.map(s =>
          s.id === editingSchedId
            ? {
                ...s,
                carrier: schedFormData.carrier!.trim(),
                closeDay: schedFormData.closeDay!.trim(),
                payDay: schedFormData.payDay!.trim(),
                notes: schedFormData.notes?.trim() || ''
              }
            : s
        )
      );
      setEditingSchedId(null);
    } else {
      const newSched: CarrierSchedule = {
        id: `sched-${Date.now()}`,
        carrier: schedFormData.carrier.trim(),
        closeDay: schedFormData.closeDay.trim(),
        payDay: schedFormData.payDay.trim(),
        notes: schedFormData.notes?.trim() || ''
      };
      setSchedules([newSched, ...schedules]);
    }

    setShowSchedForm(false);
    setSchedFormData({ carrier: '', closeDay: '', payDay: '', notes: '' });
  };

  const deleteSchedule = (id: string) => {
    if (confirm('Delete this carrier schedule?')) {
      setSchedules(schedules.filter(s => s.id !== id));
    }
  };

  const startEditSchedule = (sched: CarrierSchedule) => {
    setEditingSchedId(sched.id);
    setSchedFormData({
      carrier: sched.carrier,
      closeDay: sched.closeDay,
      payDay: sched.payDay,
      notes: sched.notes || ''
    });
    setShowSchedForm(true);
  };

  // Auto-Match deposit helpers
  const isCarrierMatch = (policyCarrier: string, depositCarrier: string): boolean => {
    const pc = policyCarrier.toLowerCase().trim();
    const dc = depositCarrier.toLowerCase().trim();
    return pc.includes(dc) || dc.includes(pc);
  };

  const handleAutoMatchAnalyse = () => {
    setAutoMatchError(null);
    setAutoMatchSuccess(null);
    if (!autoMatchText.trim()) {
      setAutoMatchError('Please enter or paste your bank deposits.');
      setAutoMatchPreview([]);
      return;
    }

    const lines = autoMatchText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsedDeposits: Array<{ carrier: string; amount: number; originalText: string }> = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // split delimiters
      let parts = trimmed.split('\t');
      if (parts.length < 2) parts = trimmed.split(',');
      if (parts.length < 2) parts = trimmed.split(';');
      if (parts.length < 2) parts = trimmed.split('-');
      if (parts.length < 2) parts = trimmed.split(':');

      let carrier = '';
      let amountVal = 0;

      if (parts.length >= 2) {
        carrier = parts.slice(0, parts.length - 1).join(' ').trim();
        const possibleAmount = parts[parts.length - 1].trim();
        const cleanAmt = possibleAmount.replace(/[\$,]/g, '').trim();
        const parsed = parseFloat(cleanAmt);
        if (!isNaN(parsed)) amountVal = parsed;
      }

      if (amountVal === 0) {
        const match = trimmed.match(/(\d[\d,]*\.?\d*)\s*$/) || trimmed.match(/\$?(\d[\d,]*\.?\d*)/);
        if (match) {
          const cleanAmt = match[1].replace(/,/g, '').trim();
          const parsed = parseFloat(cleanAmt);
          if (!isNaN(parsed)) {
            amountVal = parsed;
            carrier = trimmed.replace(match[0], '').replace(/[\-:,]/g, '').trim();
          }
        }
      }

      carrier = carrier.replace(/^[\s\-:,]+|[\s\-:,]+$/g, '').replace(/\s+/g, ' ');

      if (carrier && amountVal > 0) {
        parsedDeposits.push({
          carrier,
          amount: amountVal,
          originalText: trimmed
        });
      }
    });

    if (parsedDeposits.length === 0) {
      setAutoMatchError('Could not parse any valid carrier and deposit amount. Try copy-pasting a simple text list like "GEICO, 1450" or "TrueCraft PEO - $750.00".');
      setAutoMatchPreview([]);
      return;
    }

    const matchedItems: any[] = [];
    const alreadyMatchedPolicyIds = new Set<string>();

    parsedDeposits.forEach((dep, index) => {
      let candidates = policies.filter(p => isCarrierMatch(p.carrier, dep.carrier));
      let isFallback = false;

      if (candidates.length === 0) {
        candidates = policies;
        isFallback = true;
      }

      let bestPolicy: WonPolicy | null = null;
      let minDifference = Infinity;
      let bestExpectedAmount = 0;

      candidates.forEach((policy) => {
        const { expectedAmount } = lookupAndCalculate(policy, rules);
        const diff = Math.abs(expectedAmount - dep.amount);

        const isAlreadyMatched = alreadyMatchedPolicyIds.has(policy.id);
        let score = diff;
        if (isAlreadyMatched) {
          score += 500000;
        }
        if (isFallback) {
          score += 100000;
        }

        if (score < minDifference) {
          minDifference = score;
          bestPolicy = policy;
          bestExpectedAmount = expectedAmount;
        }
      });

      const actualDiff = bestPolicy ? Math.abs(bestExpectedAmount - dep.amount) : Infinity;

      if (bestPolicy) {
        const matchType = isFallback || actualDiff > 15.0 
          ? 'None' 
          : (actualDiff < 0.01 ? 'Perfect' : 'Approximate');
        
        matchedItems.push({
          id: `preview-${index}-${Date.now()}`,
          depositCarrier: dep.carrier,
          depositAmount: dep.amount,
          matchedPolicy: bestPolicy,
          matchType,
          difference: actualDiff,
          expectedAmount: bestExpectedAmount,
          selected: matchType !== 'None'
        });

        alreadyMatchedPolicyIds.add(bestPolicy.id);
      } else {
        matchedItems.push({
          id: `preview-${index}-${Date.now()}`,
          depositCarrier: dep.carrier,
          depositAmount: dep.amount,
          matchedPolicy: null,
          matchType: 'None',
          difference: Infinity,
          expectedAmount: 0,
          selected: false
        });
      }
    });

    setAutoMatchPreview(matchedItems);
  };

  const handleAutoMatchCommit = async () => {
    const selectedPreviews = autoMatchPreview.filter(p => p.selected && p.matchedPolicy);
    if (selectedPreviews.length === 0) {
      setAutoMatchError('Please select at least one matched deposit to commit.');
      return;
    }
    if (saving) return;

    const items = selectedPreviews.map((p) => ({
      stmt: {
        id: `recon-auto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        statementMonth: autoMatchMonth,
        policyId: p.matchedPolicy!.id,
        receivedAmount: p.depositAmount,
        transactionType: 'Payment' as const,
        notes: `AUTO-MATCHED: Parsed from bank deposit list. Closest fit (difference: $${p.difference.toFixed(2)})`
      },
      policy: p.matchedPolicy!,
    }));

    setSaving(true);
    try {
      const created = await repo.createReconciliationsBulk(items);
      setReconciliations(prev => [...created, ...prev]);
      setAutoMatchSuccess(`Success! Reconciled and recorded ${created.length} statements successfully.`);
      setAutoMatchText('');
      setAutoMatchPreview([]);
      setTimeout(() => {
        setShowAutoMatch(false);
        setAutoMatchSuccess(null);
      }, 2500);
    } catch (err) {
      setAutoMatchError(`Could not commit: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  // Live expected lookup helper inside policy creation form to help user preview
  const liveLookupResult = () => {
    const mockPolicy: WonPolicy = {
      id: 'tmp',
      policyNumber: '',
      dateWon: '',
      clientName: '',
      carrier: policyFormData.carrier || '',
      lineOfBusiness: policyFormData.lineOfBusiness || '',
      newRenewal: (policyFormData.newRenewal as 'New' | 'Renewal') || 'New',
      premiumAmount: policyFormData.premiumAmount,
      payrollAmount: policyFormData.payrollAmount,
      numberOfEmployees: policyFormData.numberOfEmployees,
      manualExpectedAmount: policyFormData.manualExpectedAmount
    };
    return lookupAndCalculate(mockPolicy, rules);
  };

  // Summaries Calculations
  const carrierSummaries = calculateCarrierSummaries(policies, reconciliations, rules);

  // Carrier Rules Matrix — distinct carriers for the filter, and the rows to show.
  // Sorted by carrier (then LOB) so a carrier's rules read together; the dropdown
  // narrows to one carrier (e.g. Liberty Mutual).
  const ruleCarriers = ['All', ...Array.from(new Set<string>(rules.map((r) => r.carrier))).sort((a, b) => a.localeCompare(b))];
  const visibleRules = rules
    .filter((r) => ruleCarrierFilter === 'All' || r.carrier === ruleCarrierFilter)
    .sort((a, b) => a.carrier.localeCompare(b.carrier) || a.lineOfBusiness.localeCompare(b.lineOfBusiness));

  // Big aggregated metrics
  const totalExpected = policies.reduce((acc, policy) => {
    const { expectedAmount } = lookupAndCalculate(policy, rules);
    return acc + expectedAmount;
  }, 0);

  // Net cash actually deposited (Payments minus Chargeback reversals)
  const netReceived = reconciliations.reduce((acc, rc) => {
    if (rc.transactionType === 'Chargeback') {
      return acc - rc.receivedAmount;
    }
    return acc + rc.receivedAmount;
  }, 0);

  // Total amount clawed back as chargebacks
  const totalChargebacks = reconciliations
    .filter((rc) => rc.transactionType === 'Chargeback')
    .reduce((acc, rc) => acc + rc.receivedAmount, 0);

  // Sum of all active shortages per carrier
  const totalShortage = carrierSummaries.reduce((acc, summary) => acc + summary.short, 0);

  // Advance vs Earned analysis
  let advanceExpected = 0;
  let advanceReceived = 0;
  let earnedExpected = 0;
  let earnedReceived = 0;

  policies.forEach((policy) => {
    const { expectedAmount, paymentTiming } = lookupAndCalculate(policy, rules);
    if (paymentTiming === 'In Advance') {
      advanceExpected += expectedAmount;
    } else {
      earnedExpected += expectedAmount;
    }
  });

  reconciliations.forEach((rc) => {
    const policy = policies.find((p) => p.id === rc.policyId);
    if (!policy) return;
    const { paymentTiming } = lookupAndCalculate(policy, rules);
    const amt = rc.receivedAmount || 0;
    const isChargeback = rc.transactionType === 'Chargeback';
    const delta = isChargeback ? -amt : amt;

    if (paymentTiming === 'In Advance') {
      advanceReceived += delta;
    } else {
      earnedReceived += delta;
    }
  });

  // Quick Copy to Clipboard functionality for carrier summary
  const copyCarrierToClipboard = (summary: any) => {
    const text = `Carrier: ${summary.carrier}\nExpected: ${formatCurrencyDecimal(summary.expected)}\nReceived: ${formatCurrencyDecimal(summary.received)}\nShort/Owed: ${formatCurrencyDecimal(summary.short)}\nChargebacks: ${formatCurrencyDecimal(summary.chargebacks)}`;
    navigator.clipboard.writeText(text);
    setCopiedCarrier(summary.carrier);
    setTimeout(() => setCopiedCarrier(null), 2000);
  };

  // Data-load states (auth is already handled by <AuthGate> above this component)
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-500">
        <RotateCw className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Loading commission data…</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900">Couldn't load data</h2>
          <p className="mt-2 text-sm text-slate-600 break-words">{dataError}</p>
          <button
            onClick={loadData}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
          >
            <RotateCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // §11 Commission Workspace (statement reconciliation) — a self-contained shell
  // over the transaction layer. Entered from the classic view; returns via onExit.
  if (activeTab === 'workspace') {
    return (
      <CommissionWorkspace
        email={email}
        signOut={signOut}
        onExit={() => setActiveTab('recon')}
      />
    );
  }

  // Standalone Commission Dashboard — the §11b analytics as its own page.
  if (activeTab === 'dashboard') {
    return (
      <DashboardPage
        email={email}
        signOut={signOut}
        onExit={() => setActiveTab('recon')}
        onOpenWorkspace={() => setActiveTab('workspace')}
      />
    );
  }

  // Standalone month-end QuickBooks Summary — close one month at a time.
  if (activeTab === 'quickbooks') {
    return (
      <QuickBooksSummaryPage
        email={email}
        signOut={signOut}
        onExit={() => setActiveTab('recon')}
      />
    );
  }

  // Standalone carrier payment calendar — when each carrier pays, all year.
  if (activeTab === 'calendar') {
    return (
      <CarrierCalendarPage
        email={email}
        signOut={signOut}
        onExit={() => setActiveTab('recon')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Ingestion confirmation — fixed banner proving the save was taken. */}
      {ingestToast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-white border border-emerald-200 shadow-lg rounded-xl p-4 flex items-start gap-3">
            <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{ingestToast.title}</p>
              <p className="text-xs text-slate-600 mt-0.5 break-words">{ingestToast.detail}</p>
            </div>
            <button
              onClick={() => setIngestToast(null)}
              className="text-slate-400 hover:text-slate-600 shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Banner and Brand Navbar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold font-display tracking-tight">
                  RSG Commission Tracker & Reconciliation
                </h1>
              </div>
              <p className="text-slate-400 text-xs mt-1.5 font-mono">
                Lamar's Premium Workspace — Risk Solutions Group
              </p>
            </div>

            {/* Account + data controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                title="Book-wide commission analytics dashboard"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('quickbooks')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                title="Month-end QuickBooks summary — close one month at a time"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Month-End
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                title="Carrier payment calendar — when each carrier pays, all year"
              >
                <Calendar className="w-3.5 h-3.5" />
                Pay Calendar
              </button>
              <button
                onClick={() => setActiveTab('workspace')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg border border-blue-500 transition flex items-center gap-1.5"
                title="Upload carrier statements and work the reconciliation queue"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Commission Workspace
              </button>
              {email && (
                <span className="text-[11px] text-slate-400 font-mono px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700">
                  {email}
                </span>
              )}
              <button
                onClick={loadData}
                disabled={saving}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                title="Reload live data from Supabase"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
              {email && (
                <button
                  onClick={() => signOut()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Hub: Metrics Panel */}
      <section className="bg-slate-900 text-white border-t border-slate-800/50 pb-8 pt-2 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {/* Expected Summary */}
            <div className="bg-slate-800/40 rounded-xl p-5 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-xs font-mono tracking-wider uppercase">Projected Expected</span>
                <div className="text-2xl lg:text-3xl font-bold mt-1 text-white font-mono">
                  {formatCurrency(totalExpected)}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Sum of projected payouts</p>
              </div>
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* Received Deposits */}
            <div className="bg-slate-800/40 rounded-xl p-5 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-xs font-mono tracking-wider uppercase">Deposits (Net Cash)</span>
                <div className="text-2xl lg:text-3xl font-bold mt-1 text-emerald-400 font-mono">
                  {formatCurrency(netReceived)}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Net statements received</p>
              </div>
              <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-lg shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            {/* Shorts / Variance */}
            <div className="bg-yellow-500/5 rounded-xl p-5 border border-yellow-500/20 flex items-center justify-between">
              <div>
                <span className="text-yellow-400/95 text-xs font-medium tracking-wider uppercase flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                  Money Owed (Shorts)
                </span>
                <div className="text-2xl lg:text-3xl font-bold mt-1 text-yellow-300 font-mono">
                  {formatCurrency(totalShortage)}
                </div>
                <p className="text-[10px] text-yellow-400/60 mt-1">Discrepancies to chase</p>
              </div>
              <div className="p-2.5 bg-yellow-500/10 text-yellow-300 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            {/* Chargebacks / Clawbacks */}
            <div className="bg-rose-500/5 rounded-xl p-5 border border-rose-500/20 flex items-center justify-between">
              <div>
                <span className="text-rose-400 text-xs font-medium tracking-wider uppercase flex items-center gap-1">
                  Chargebacks (Reversals)
                </span>
                <div className="text-2xl lg:text-3xl font-bold mt-1 text-rose-400 font-mono">
                  {formatCurrency(totalChargebacks)}
                </div>
                <p className="text-[10px] text-rose-400/60 mt-1">Clawbacks from audits/cancels</p>
              </div>
              <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Outer Layout & Quick Start Checklist Info */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Simple Workflow Guide Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 mb-8 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1">
              <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 uppercase tracking-wider">
                Workspace Rulebook Method
              </span>
              <h2 className="text-base font-semibold text-slate-800 mt-1.5">
                Catching Every Broker Short in 4 Seamless Steps
              </h2>
              <p className="text-slate-500 text-xs max-w-2xl">
                Fill the Carrier rulebook, log won policies to secure an expected price projection, post direct statement payouts, and let the audit screen spot shortages for Quickbooks export.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'rules' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                1. Carrier Rules ({rules.length})
              </button>
              <div className="self-center text-slate-300 hidden sm:block">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <button
                onClick={() => setActiveTab('policies')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'policies' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                2. Won Policies ({policies.length})
              </button>
              <div className="self-center text-slate-300 hidden sm:block">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <button
                onClick={() => setActiveTab('recon')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'recon' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                3. Reconciliation ({reconciliations.length})
              </button>
              <div className="self-center text-slate-300 hidden sm:block">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'queue' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                4. Shortage Queue
              </button>
              <div className="self-center text-slate-300 hidden sm:block">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <button
                onClick={() => setActiveTab('guide')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'guide' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Legend & FAQ
              </button>
            </div>
          </div>
        </div>

        {/* Outer Tabs and List Layout — full-width (QuickBooks summary moved to its
            own Month-End page; the right sidebar was removed so the ledger uses the
            whole width). */}
        <div className="w-full">
          {/* Main Action Workspace area */}
          <section className="space-y-6">
            
            {/* Tab: RECONCILIATION */}
            {activeTab === 'recon' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Reconciled statement book — real actual money from uploaded
                    carrier statements (Commission Reconciliation Slice 1). */}
                <StatementBookSummary />
                {/* Visual Chart & Cash Timing Bento Panel */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Recharts Bar Chart Card (Takes 2 cols on desktop) */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 md:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Carrier Performance: Expected vs Received</h4>
                        <p className="text-[11px] text-slate-500">Visual breakdown of direct deposit accuracy by carrier</p>
                      </div>
                      <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-semibold uppercase">
                        Real-time Chart
                      </span>
                    </div>

                    <div className="h-56 mt-2">
                      {carrierSummaries.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400 font-mono">
                          No active billing summaries to plot. Please add won policies first!
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={carrierSummaries.map((summary) => ({
                              carrier: summary.carrier,
                              Expected: summary.expected,
                              Received: summary.received,
                              Short: summary.short,
                              Chargebacks: summary.chargebacks,
                            }))}
                            margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="carrier"
                              tick={{ fill: '#64748b', fontSize: 10 }}
                              axisLine={{ stroke: '#cbd5e1', strokeWidth: 0.5 }}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fill: '#64748b', fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `$${v}`}
                            />
                            <Tooltip
                              formatter={(value) => [`$${Number(value).toFixed(0)}`, undefined]}
                              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontFamily: 'sans-serif' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'sans-serif', paddingTop: '5px' }} />
                            <Bar dataKey="Expected" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Expected Commission" />
                            <Bar dataKey="Received" fill="#10b981" radius={[4, 4, 0, 0]} name="Reconciled Deposits" />
                            <Bar dataKey="Short" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Shortage Gap" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Payment Timing Breakdown Widget Card (Takes 1 col on desktop) */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-slate-800">Carrier Cash Timing</h4>
                        <HelpCircle className="w-4 h-4 text-slate-400" title="Analyzes payments structured upfront vs. received continuously" />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal mb-4">
                        Some carriers pay upfront <strong>In Advance</strong> (e.g. homeowners), while commercial lines pay monthly <strong>As Earned</strong> as premium is reported.
                      </p>

                      <div className="space-y-3">
                        {/* Timing 1: In Advance */}
                        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/40">
                          <div className="flex justify-between text-xs font-semibold text-blue-900">
                            <span>In Advance (Upfront)</span>
                            <span className="font-mono text-blue-700">
                              {advanceExpected > 0 ? `${Math.round((advanceReceived / advanceExpected) * 100)}%` : '0%'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 mt-1.5 gap-1 text-[11px] text-slate-500 font-mono font-normal">
                            <div>
                              Expected: <span className="text-slate-700 font-semibold">{formatCurrency(advanceExpected)}</span>
                            </div>
                            <div>
                              Received: <span className="text-emerald-700 font-semibold">{formatCurrency(advanceReceived)}</span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full transition-all duration-500"
                              style={{ width: `${Math.min(100, advanceExpected > 0 ? (advanceReceived / advanceExpected) * 100 : 0)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Timing 2: As Earned */}
                        <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/40">
                          <div className="flex justify-between text-xs font-semibold text-indigo-900">
                            <span>As Earned (Installments)</span>
                            <span className="font-mono text-indigo-700">
                              {earnedExpected > 0 ? `${Math.round((earnedReceived / earnedExpected) * 100)}%` : '0%'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 mt-1.5 gap-1 text-[11px] text-slate-500 font-mono font-normal">
                            <div>
                              Expected: <span className="text-slate-700 font-semibold">{formatCurrency(earnedExpected)}</span>
                            </div>
                            <div>
                              Received: <span className="text-emerald-700 font-semibold">{formatCurrency(earnedReceived)}</span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full transition-all duration-500"
                              style={{ width: `${Math.min(100, earnedExpected > 0 ? (earnedReceived / earnedExpected) * 100 : 0)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 mt-4 text-[10px] text-slate-400 font-mono text-center">
                      Reconciliation timing indexes live
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/55">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                      Statement Reconciliation Ledger
                      <span className="text-xs font-normal px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-200">
                        AUDIT SHEET
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enter the direct amount received from carrier checks. Check variance for underpaid shorts.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    <button
                      onClick={() => {
                        setShowAutoMatch(!showAutoMatch);
                        setShowReconForm(false);
                      }}
                      className={`px-4 py-2 font-medium text-xs rounded-lg border shadow-xs transition flex items-center gap-1.5 ${
                        showAutoMatch
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold'
                          : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
                      }`}
                      id="auto-match-deposits-btn"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Auto-Match Bank Deposits
                    </button>
                    <button
                      onClick={() => {
                        if (policies.length === 0) {
                          alert('Log a won policy first before adding reconciliation entries!');
                          return;
                        }
                        setShowReconForm(!showReconForm);
                        setShowAutoMatch(false);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg shadow-sm transition flex items-center gap-1.5"
                      id="add-recon-btn"
                    >
                      <Plus className="w-4 h-4" />
                      Reconcile Carrier Payout
                    </button>
                  </div>
                </div>

                {/* Auto-Match Deposits Block Area */}
                {showAutoMatch && (
                  <div className="p-6 bg-emerald-50/40 border-b border-slate-200 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                          Auto-Match Bank Deposits Engine
                        </h4>
                      </div>
                      <button onClick={() => setShowAutoMatch(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 mb-4 leading-relaxed font-sans">
                      Paste a list of bank deposits (direct sweeps or check data). The engine parses the amounts and targets the closest matching <strong>'Perfect Match'</strong> policies by carrier name similarities and expected commission formulas.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Statement Month for Matches <span className="text-emerald-700 font-bold">*</span>
                        </label>
                        <input
                          type="month"
                          required
                          value={autoMatchMonth}
                          onChange={(e) => setAutoMatchMonth(e.target.value)}
                          className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 font-mono"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Paste Bank Deposits (One per line: "Carrier, Amount")
                        </label>
                        <div className="relative">
                          <textarea
                            rows={4}
                            value={autoMatchText}
                            onChange={(e) => setAutoMatchText(e.target.value)}
                            placeholder="Example P&C Co, 627.00&#10;TrueCraft PEO - $750.00&#10;AmTrust Financial, 85"
                            className="w-full font-mono text-xs p-3.5 bg-white border border-slate-300 rounded-lg shadow-xs outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
                            id="automatch-deposit-textarea"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setAutoMatchText(
                                "Example P&C Co\t627.00\nTrueCraft PEO\t750.00\nAmTrust Financial\t85.00\nINVO PEO\t2500.00"
                              );
                              setAutoMatchError(null);
                            }}
                            className="absolute right-3.5 bottom-3.5 py-1 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-sans font-semibold rounded border border-slate-200 flex items-center gap-1 transition"
                          >
                            <Sparkles className="w-3 h-3 text-emerald-500" /> Use Seed Demo Deposits
                          </button>
                        </div>
                      </div>
                    </div>

                    {autoMatchError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-xs font-mono mb-4">
                        {autoMatchError}
                      </div>
                    )}

                    {autoMatchSuccess && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3.5 text-xs font-semibold mb-4 animate-bounce">
                        {autoMatchSuccess}
                      </div>
                    )}

                    <div className="flex justify-between items-center mb-5 pb-4 border-b border-dashed border-slate-200">
                      <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                        Matches are computed in real-time by analyzing deviation margins against won commission schedules.
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAutoMatchText('');
                            setAutoMatchPreview([]);
                            setAutoMatchError(null);
                          }}
                          className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-lg font-medium transition"
                        >
                          Clear Text
                        </button>
                        <button
                          type="button"
                          onClick={handleAutoMatchAnalyse}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-semibold transition shadow-sm flex items-center gap-1"
                        >
                          <Search className="w-3.5 h-3.5" />
                          Run Match Analysis
                        </button>
                      </div>
                    </div>

                    {/* Auto Match Results Table */}
                    {autoMatchPreview.length > 0 && (
                      <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center">
                          <h5 className="text-[11px] font-bold text-slate-700 font-mono tracking-wider uppercase">
                            MATCH PROPOSED GRID ({autoMatchPreview.filter(p => p.matchType !== 'None').length} Candidates Spotted)
                          </h5>
                          <span className="text-[10px] font-semibold text-slate-500 bg-white border px-2 py-0.5 rounded shadow-2xs">
                            Select rows to record on ledger
                          </span>
                        </div>

                        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] tracking-tight">
                                <th className="p-3 pl-4 text-center w-10">Select</th>
                                <th className="p-3">Parsed Bank Deposit</th>
                                <th className="p-3">Closest Found Policy Candidate</th>
                                <th className="p-3 text-right">Expected Commission</th>
                                <th className="p-3 text-right">Match Quality</th>
                                <th className="p-3 text-center">Variance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                              {autoMatchPreview.map((item) => (
                                <tr
                                  key={item.id}
                                  className={`hover:bg-slate-50 transition ${
                                    !item.matchedPolicy ? 'bg-slate-50/50' : item.selected ? 'bg-emerald-50/10' : ''
                                  }`}
                                >
                                  <td className="p-3 pl-4 text-center">
                                    <input
                                      type="checkbox"
                                      disabled={!item.matchedPolicy}
                                      checked={item.selected}
                                      onChange={(e) => {
                                        setAutoMatchPreview(
                                          autoMatchPreview.map((p) =>
                                            p.id === item.id ? { ...p, selected: e.target.checked } : p
                                          )
                                        );
                                      }}
                                      className="w-3.5 h-3.5 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 disabled:opacity-30"
                                    />
                                  </td>
                                  <td className="p-3">
                                    <span className="block font-mono text-slate-800 text-xs">{item.depositCarrier}</span>
                                    <span className="text-[10px] font-mono text-emerald-700">
                                      {formatCurrencyDecimal(item.depositAmount)} received
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    {item.matchedPolicy ? (
                                      <div>
                                        <span className="block text-slate-950 font-sans text-xs">
                                          {item.matchedPolicy.clientName}
                                        </span>
                                        <span className="block text-[10px] text-slate-500 font-mono font-medium">
                                          Policy #{item.matchedPolicy.policyNumber} &bull; {item.matchedPolicy.carrier}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 font-mono font-normal">
                                        No active policies for carrier are logged
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right font-mono font-medium text-xs">
                                    {item.matchedPolicy ? formatCurrencyDecimal(item.expectedAmount) : '—'}
                                  </td>
                                  <td className="p-3 text-right">
                                    {item.matchType === 'Perfect' ? (
                                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold animate-pulse">
                                        ✓ PERFECT MATCH
                                      </span>
                                    ) : item.matchType === 'Approximate' ? (
                                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                                        ⚠ CLOSE FIT (+-${formatCurrencyDecimal(item.difference)})
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded text-[10px] font-mono font-medium">
                                        NO MATCH FOUND
                                      </span>
                                    )}
                                  </td>
                                  <td className={`p-3 text-center font-mono ${item.difference === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                                    {item.matchedPolicy ? `$${item.difference.toFixed(2)}` : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex justify-end gap-3.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAutoMatchPreview([]);
                              setAutoMatchError(null);
                            }}
                            className="px-4 py-2 bg-slate-200 text-slate-700 text-xs rounded-lg font-medium hover:bg-slate-300 transition"
                          >
                            Cancel Preview
                          </button>
                          <button
                            type="button"
                            onClick={handleAutoMatchCommit}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-semibold transition shadow-sm flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            Commit Reconciled Matches ({autoMatchPreview.filter((p) => p.selected).length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Inline Reconciliation Form */}
                {showReconForm && (
                  <div className="p-6 bg-slate-50 border-b border-slate-200/60 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                        POST DEPOSIT STATEMENT
                      </h4>
                      <button onClick={() => setShowReconForm(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleReconSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Statement Month <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="month"
                            required
                            value={reconFormData.statementMonth}
                            onChange={(e) => setReconFormData({ ...reconFormData, statementMonth: e.target.value })}
                            className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2 bg-white text-blue-700 font-mono"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Select Won Policy (Policy # & Client) <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <select
                            required
                            value={reconFormData.policyId}
                            onChange={(e) => setReconFormData({ ...reconFormData, policyId: e.target.value })}
                            className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          >
                            <option value="">-- Choose Won Policy --</option>
                            {policies.map((p) => {
                              const lookup = lookupAndCalculate(p, rules);
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.policyNumber} — {p.clientName} ({p.carrier} / {p.lineOfBusiness}) - Expected: {formatCurrency(lookup.expectedAmount)}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Display live expected numbers based on selection */}
                      {reconFormData.policyId && (
                        <div className="bg-white rounded-lg p-3.5 border border-slate-200/80 text-xs flex flex-wrap justify-between gap-4">
                          <div>
                            <span className="text-slate-400 font-mono block">CLIENT & CARRIER:</span>
                            <span className="font-semibold text-slate-700">
                              {policies.find((p) => p.id === reconFormData.policyId)?.clientName} ({policies.find((p) => p.id === reconFormData.policyId)?.carrier})
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-mono block">EXPECTED COMMISSION:</span>
                            <span className="font-semibold text-green-700">
                              {formatCurrencyDecimal(
                                lookupAndCalculate(
                                  policies.find((p) => p.id === reconFormData.policyId)!,
                                  rules
                                ).expectedAmount
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-mono block">RULE METHOD:</span>
                            <span className="font-medium text-slate-700">
                              {lookupAndCalculate(
                                policies.find((p) => p.id === reconFormData.policyId)!,
                                rules
                              ).method || 'N/A (No Matching Rule found)'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Transaction Type <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <select
                            value={reconFormData.transactionType || 'Payment'}
                            onChange={(e) =>
                              setReconFormData({
                                ...reconFormData,
                                transactionType: e.target.value as 'Payment' | 'Chargeback'
                              })
                            }
                            className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2 bg-white text-blue-600 outline-none"
                          >
                            <option value="Payment">Payment (Cash Receipt)</option>
                            <option value="Chargeback">Chargeback (Carrier Clawback)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            {reconFormData.transactionType === 'Chargeback' ? 'Clawed Back Amount ($)' : 'Received Amount ($)'} <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-blue-600 font-bold font-mono text-xs">$</span>
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder="0.00"
                              value={reconFormData.receivedAmount ?? ''}
                              onChange={(e) =>
                                setReconFormData({
                                  ...reconFormData,
                                  receivedAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs font-semibold border border-slate-300 rounded-lg pl-6 pr-3 py-2 bg-white text-blue-600 font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Audit Notes
                          </label>
                          <input
                            type="text"
                            placeholder="Add deposit notes or dispute status..."
                            value={reconFormData.notes || ''}
                            onChange={(e) => setReconFormData({ ...reconFormData, notes: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-600"
                          />
                        </div>
                      </div>

                      {reconFormData.policyId && reconFormData.receivedAmount !== undefined && (
                        <div className="bg-slate-100 rounded-lg p-3 text-xs flex justify-between items-center text-slate-700">
                          <span>
                            Live Variance Check:{' '}
                            <strong className="font-mono">
                              {formatCurrencyDecimal(
                                lookupAndCalculate(
                                  policies.find((p) => p.id === reconFormData.policyId)!,
                                  rules
                                ).expectedAmount - Number(reconFormData.receivedAmount)
                              )}
                            </strong>
                          </span>
                          {lookupAndCalculate(policies.find((p) => p.id === reconFormData.policyId)!, rules).expectedAmount - Number(reconFormData.receivedAmount) > 0 ? (
                            <span className="text-amber-600 font-bold flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <AlertTriangle className="w-3.5 h-3.5" /> SHORT
                            </span>
                          ) : lookupAndCalculate(policies.find((p) => p.id === reconFormData.policyId)!, rules).expectedAmount - Number(reconFormData.receivedAmount) < 0 ? (
                            <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              Excess Payout
                            </span>
                          ) : (
                            <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                              ✓ Perfect Match
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowReconForm(false)}
                          className="px-4 py-2 bg-slate-200 text-slate-700 text-xs rounded-lg font-medium hover:bg-slate-300 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs rounded-lg font-semibold transition shadow-sm"
                        >
                          Post Reconciled Record
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Search query box */}
                {/* Search query box & Filter Chips */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20">
                  <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 w-full md:max-w-md shadow-xs">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search by Policy #, Client name, or Carrier..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs text-slate-700 bg-transparent border-0 outline-none p-0 focus:outline-none"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter chips */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none" id="recon-filter-chips">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold mr-1 shrink-0">Filter Payouts:</span>
                    <button
                      type="button"
                      onClick={() => setReconFilter('All')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition shrink-0 ${
                        reconFilter === 'All'
                          ? 'bg-slate-900 text-white shadow-xs border border-slate-900'
                          : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                      }`}
                    >
                      All ({reconciliations.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconFilter('Shorts')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                        reconFilter === 'Shorts'
                          ? 'bg-amber-600 text-white shadow-xs border border-amber-600 font-bold'
                          : 'bg-amber-50/50 text-amber-700 hover:bg-amber-50 border border-amber-200/50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${reconFilter === 'Shorts' ? 'bg-white' : 'bg-amber-500'}`}></span>
                      Shorts ({
                        reconciliations.filter(rc => {
                          const p = policies.find(p => p.id === rc.policyId);
                          if (!p) return false;
                          const isC = rc.transactionType === 'Chargeback';
                          const { expectedAmount } = lookupAndCalculate(p, rules);
                          const variance = (isC ? 0 : expectedAmount) - (isC ? -rc.receivedAmount : rc.receivedAmount);
                          return !isC && variance > 0;
                        }).length
                      })
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconFilter('Perfect')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                        reconFilter === 'Perfect'
                          ? 'bg-emerald-600 text-white shadow-xs border border-emerald-600 font-bold'
                          : 'bg-emerald-50/50 text-emerald-800 hover:bg-emerald-50 border border-emerald-200/50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${reconFilter === 'Perfect' ? 'bg-white' : 'bg-emerald-500'}`}></span>
                      Perfect Matches ({
                        reconciliations.filter(rc => {
                          const p = policies.find(p => p.id === rc.policyId);
                          if (!p) return false;
                          const isC = rc.transactionType === 'Chargeback';
                          const { expectedAmount } = lookupAndCalculate(p, rules);
                          const variance = (isC ? 0 : expectedAmount) - (isC ? -rc.receivedAmount : rc.receivedAmount);
                          return !isC && variance === 0;
                        }).length
                      })
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconFilter('Excess')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                        reconFilter === 'Excess'
                          ? 'bg-blue-600 text-white shadow-xs border border-blue-600 font-bold'
                          : 'bg-blue-50/50 text-blue-700 hover:bg-blue-50 border border-blue-200/50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${reconFilter === 'Excess' ? 'bg-white' : 'bg-blue-500'}`}></span>
                      Excess Paid ({
                        reconciliations.filter(rc => {
                          const p = policies.find(p => p.id === rc.policyId);
                          if (!p) return false;
                          const isC = rc.transactionType === 'Chargeback';
                          const { expectedAmount } = lookupAndCalculate(p, rules);
                          const variance = (isC ? 0 : expectedAmount) - (isC ? -rc.receivedAmount : rc.receivedAmount);
                          return !isC && variance < 0;
                        }).length
                      })
                    </button>
                  </div>
                </div>

                {/* Table details with styling legends */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                        <th className="p-3.5 pl-6 font-semibold">Statement Month</th>
                        <th className="p-3.5 font-semibold">Policy #</th>
                        <th className="p-3.5 font-semibold">Client</th>
                        <th className="p-3.5 font-semibold">Carrier</th>
                        <th className="p-3.5 text-right font-semibold text-green-700">Expected ($)</th>
                        <th className="p-3.5 text-right font-semibold text-blue-700">Received ($)</th>
                        <th className="p-3.5 text-right font-semibold text-slate-800">Variance ($)</th>
                        <th className="p-3.5 font-semibold">Audit Status</th>
                        <th className="p-3.5 font-semibold">Notes</th>
                        <th className="p-3.5 pr-6 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {(() => {
                        if (reconciliations.length === 0) {
                          return (
                            <tr>
                              <td colSpan={10} className="p-8 text-center text-slate-400 font-sans">
                                No statement records reconciliated yet. Log won policies first, then input the carrier check receipts.
                              </td>
                            </tr>
                          );
                        }

                        const items = reconciliations.filter((rc) => {
                          const policy = policies.find((p) => p.id === rc.policyId);
                          if (!policy) return false;

                          const isChargeback = rc.transactionType === 'Chargeback';
                          const { expectedAmount } = lookupAndCalculate(policy, rules);
                          const displayExpected = isChargeback ? 0 : expectedAmount;
                          const displayReceived = isChargeback ? -rc.receivedAmount : rc.receivedAmount;
                          const variance = displayExpected - displayReceived;

                          const isShort = !isChargeback && variance > 0;
                          const isExcess = !isChargeback && variance < 0;
                          const isPerfect = !isChargeback && variance === 0;

                          if (reconFilter === 'Shorts' && !isShort) return false;
                          if (reconFilter === 'Perfect' && !isPerfect) return false;
                          if (reconFilter === 'Excess' && !isExcess) return false;

                          const term = searchQuery.toLowerCase();
                          return (
                            rc.statementMonth.toLowerCase().includes(term) ||
                            policy.policyNumber.toLowerCase().includes(term) ||
                            policy.clientName.toLowerCase().includes(term) ||
                            policy.carrier.toLowerCase().includes(term)
                          );
                        });

                        if (items.length === 0) {
                          return (
                            <tr>
                              <td colSpan={10} className="p-8 text-center text-slate-400 font-sans text-slate-500">
                                No matching reconciled payouts found for filter <span className="font-semibold text-slate-700">"{reconFilter === 'Perfect' ? 'Perfect Matches' : reconFilter === 'Excess' ? 'Excess Paid' : reconFilter}"</span> {searchQuery && (<span>and search query <span className="font-semibold text-slate-700">"{searchQuery}"</span></span>)}.
                              </td>
                            </tr>
                          );
                        }

                        return items.map((rc) => {
                          const policy = policies.find((p) => p.id === rc.policyId)!;

                          const isChargeback = rc.transactionType === 'Chargeback';
                          const { expectedAmount } = lookupAndCalculate(policy, rules);
                          const displayExpected = isChargeback ? 0 : expectedAmount;
                          const displayReceived = isChargeback ? -rc.receivedAmount : rc.receivedAmount;
                          const variance = displayExpected - displayReceived;
                          const isShort = !isChargeback && variance > 0;
                          const isExcess = !isChargeback && variance < 0;
                          const isExample = rc.notes?.includes('EXAMPLE') || policy.notes?.includes('EXAMPLE');

                          return (
                            <tr
                              key={rc.id}
                              className={`group hover:bg-slate-50 transition border-b border-slate-100 ${
                                isExample ? 'bg-yellow-50/50 hover:bg-yellow-50' : 'bg-white'
                              }`}
                            >
                              <td className="p-3 pl-6 text-slate-500">{rc.statementMonth}</td>
                              <td className="p-3 font-semibold text-slate-700 group-hover:text-blue-600 transition">
                                {policy.policyNumber}
                              </td>
                              <td className="p-3 text-slate-800 font-sans">{policy.clientName}</td>
                              <td className="p-3 text-slate-600 font-sans">
                                <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 border border-slate-200">
                                  {policy.carrier}
                                </span>
                              </td>
                              <td className="p-3 text-right font-medium text-green-700 pulled-green">
                                {isChargeback ? '—' : formatCurrencyDecimal(expectedAmount)}
                              </td>
                              <td className={`p-3 text-right font-semibold ${isChargeback ? 'text-rose-600 font-bold' : 'text-blue-700 input-blue'}`}>
                                {isChargeback ? '-' : ''}{formatCurrencyDecimal(rc.receivedAmount)}
                                {isChargeback && (
                                  <span className="block text-[9px] font-semibold text-rose-500 uppercase tracking-tight leading-none mt-0.5">Clawback</span>
                                )}
                              </td>
                              <td
                                className={`p-3 text-right font-bold font-mono ${
                                  isChargeback ? 'text-rose-500 font-bold' : isShort ? 'text-amber-600' : isExcess ? 'text-blue-600' : 'text-slate-900'
                                }`}
                              >
                                {isChargeback ? '-' : ''}{formatCurrencyDecimal(Math.abs(variance))}
                              </td>
                              <td className="p-3 font-sans">
                                {isChargeback ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/50 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    ↶ Clawed Back
                                  </span>
                                ) : isShort ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    ⚠ SHORT - chase
                                  </span>
                                ) : isExcess ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                    Excess Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    ✓ Reconciled
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-slate-400 font-sans max-w-[140px] truncate text-xs" title={rc.notes}>
                                {isExample ? (
                                  <span className="text-yellow-600 font-medium bg-yellow-100 px-1 py-0.5 rounded text-[10px]">
                                    SAMPLE ROW
                                  </span>
                                ) : (
                                  rc.notes || '—'
                                )}
                              </td>
                              <td className="p-3 text-center pr-6">
                                <button
                                  onClick={() => deleteRecon(rc.id)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 transition"
                                  title="Delete statement record"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Color Scheme guide */}
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-slate-400 font-mono">Legend:</span>
                    <span className="font-semibold text-blue-700 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 bg-blue-600 rounded"></span> Blue = Custom Typed
                    </span>
                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 bg-emerald-600 rounded"></span> Green = Pulled Lookup
                    </span>
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 bg-slate-900 rounded"></span> Black = Calculated Auto
                    </span>
                    <span className="font-semibold text-yellow-600 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 bg-yellow-200 rounded"></span> Yellow = Example Row
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Rates calculated live. Audit matches instantly.
                  </p>
                </div>
              </div>
            </div>
            )}

            {/* Tab: WON POLICIES */}
            {activeTab === 'policies' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/55">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                      Won Policies Ledger
                      <span className="text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-800 rounded border border-blue-200">
                        EXPECTED EMISSION
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Add a row for each client won. Expected Commission calculates dynamically off the carrier rules.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPolicyForm(!showPolicyForm)}
                    className="self-start sm:self-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg shadow-sm transition flex items-center gap-1.5"
                    id="add-policy-btn"
                  >
                    <Plus className="w-4 h-4" />
                    Log New Won Policy
                  </button>
                </div>

                {/* Inline Policy Form */}
                {showPolicyForm && (
                  <div className="p-6 bg-slate-50 border-b border-slate-200/60 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                        LOG CLIENT WON POLICY
                      </h4>
                      <button onClick={() => setShowPolicyForm(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handlePolicySubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Policy # <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. EX-001"
                            value={policyFormData.policyNumber || ''}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, policyNumber: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Date Won <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={policyFormData.dateWon}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, dateWon: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Effective Date
                          </label>
                          <input
                            type="date"
                            value={policyFormData.policyEffectiveDate || ''}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, policyEffectiveDate: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700 font-mono"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Client Name <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Marcus & Tina Ellison"
                            value={policyFormData.clientName || ''}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, clientName: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Carrier Dropdown from Rules for type safety / lookup parity */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Carrier Name <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            list="carriers-list"
                            required
                            placeholder="e.g. Example P&C Co"
                            value={policyFormData.carrier || ''}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, carrier: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                          <datalist id="carriers-list">
                            {Array.from(new Set(rules.map((r) => r.carrier))).map((car) => (
                              <option key={car} value={car} />
                            ))}
                          </datalist>
                        </div>

                        {/* Line of Business Dropdown from rules */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Line of Business <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            list="lob-list"
                            required
                            placeholder="e.g. Homeowners"
                            value={policyFormData.lineOfBusiness || ''}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, lineOfBusiness: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                          <datalist id="lob-list">
                            {Array.from(new Set(rules.map((r) => r.lineOfBusiness))).map((lob) => (
                              <option key={lob} value={lob} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            New / Renewal <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <select
                            value={policyFormData.newRenewal}
                            onChange={(e) => setPolicyFormData({ ...policyFormData, newRenewal: e.target.value as 'New' | 'Renewal' })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          >
                            <option value="New">New</option>
                            <option value="Renewal">Renewal</option>
                          </select>
                        </div>
                      </div>

                      {/* Display calculations section depending on matched rules */}
                      <div className="bg-white rounded-xl p-4 border border-slate-200/80 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-blue-500" />
                            Rule Calculator Preview
                          </span>
                          {!liveLookupResult().ruleFound ? (
                            <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-semibold">
                              ⚠ No rule found (Expected defaults to zero)
                            </span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold flex items-center gap-1">
                              Match found: {liveLookupResult().method} ({liveLookupResult().ratePercentage ? `${liveLookupResult().ratePercentage}%` : ''} {liveLookupResult().flatOrPerEmployeeAmount ? formatCurrency(liveLookupResult().flatOrPerEmployeeAmount) : ''})
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Premium Amount ($)
                            </label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={policyFormData.premiumAmount ?? ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  premiumAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Payroll Amount ($)
                            </label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={policyFormData.payrollAmount ?? ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  payrollAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              # of Employees
                            </label>
                            <input
                              type="number"
                              placeholder="0"
                              value={policyFormData.numberOfEmployees ?? ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  numberOfEmployees: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Manual Expected ($)
                            </label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={policyFormData.manualExpectedAmount ?? ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  manualExpectedAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>
                        </div>

                        {/* Billing + agency fee (RSG charges insured) + advanced calc inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100/50">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Billing type
                            </label>
                            <select
                              value={policyFormData.billingType || ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  billingType: e.target.value === '' ? undefined : e.target.value
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700"
                            >
                              <option value="">— Not set —</option>
                              <option value="Direct Bill">Direct Bill</option>
                              <option value="Agency Bill">Agency Bill</option>
                              <option value="Direct Bill 100">Direct Bill 100</option>
                              <option value="Agency Bill 100">Agency Bill 100</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Agency fee ($) <span className="text-slate-400 font-normal">(RSG charges insured)</span>
                            </label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={policyFormData.agencyFeeAmount ?? policyFormData.adminFeeAmount ?? ''}
                              onChange={(e) => {
                                const n = e.target.value === '' ? undefined : Number(e.target.value);
                                setPolicyFormData({
                                  ...policyFormData,
                                  agencyFeeAmount: n,
                                  adminFeeAmount: n,
                                });
                              }}
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Monthly Premium ($) <span className="text-slate-400 font-normal">(for % of Monthly Premium)</span>
                            </label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={policyFormData.monthlyPremiumAmount ?? ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  monthlyPremiumAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Admin Fee Amount ($) <span className="text-slate-400 font-normal">(for % of Admin Fee rules)</span>
                            </label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={policyFormData.adminFeeAmount ?? ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  adminFeeAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Cash Timing Override
                            </label>
                            <select
                              value={policyFormData.paymentTiming || ''}
                              onChange={(e) =>
                                setPolicyFormData({
                                  ...policyFormData,
                                  paymentTiming: e.target.value === '' ? undefined : (e.target.value as 'As Earned' | 'In Advance')
                                })
                              }
                              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-700"
                            >
                              <option value="">Use Rulebook Default</option>
                              <option value="As Earned">As Earned (Installments)</option>
                              <option value="In Advance">In Advance (Upfront)</option>
                            </select>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500 text-xs font-medium">LIVE EXPECTED CALCULATION:</span>
                          <span className="text-base font-bold text-slate-900 font-mono">
                            {formatCurrencyDecimal(liveLookupResult().expectedAmount)}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Client Notes
                        </label>
                        <input
                          type="text"
                          placeholder="General policy details..."
                          value={policyFormData.notes || ''}
                          onChange={(e) => setPolicyFormData({ ...policyFormData, notes: e.target.value })}
                          className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                        />
                      </div>

                      <div className="flex justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowPolicyForm(false)}
                          className="px-4 py-2 bg-slate-200 text-slate-700 text-xs rounded-lg font-medium hover:bg-slate-300 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs rounded-lg font-semibold transition shadow-sm"
                        >
                          Save Won Policy
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Policies list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                        <th className="p-3.5 pl-6 font-semibold">Policy #</th>
                        <th className="p-3.5 font-semibold">Date Won</th>
                        <th className="p-3.5 font-semibold">Eff Date</th>
                        <th className="p-3.5 font-semibold">Client</th>
                        <th className="p-3.5 font-semibold">Carrier</th>
                        <th className="p-3.5 font-semibold">Line of Business</th>
                        <th className="p-3.5 font-semibold">Billing</th>
                        <th className="p-3.5 text-right font-semibold">Agency fee</th>
                        <th className="p-3.5 font-semibold text-center">New/Renewal</th>
                        <th className="p-3.5 text-right font-semibold">Premium ($)</th>
                        <th className="p-3.5 font-semibold">Method</th>
                        <th className="p-3.5 text-right font-semibold font-mono text-green-700">Expected ($)</th>
                        <th className="p-3.5 pr-6 font-semibold text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {policies.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="p-8 text-center text-slate-400 font-sans">
                            No active won policies logged. Click "Log New Won Policy" to get started!
                          </td>
                        </tr>
                      ) : (
                        policies.map((policy) => {
                          const lookup = lookupAndCalculate(policy, rules);
                          const isExample = policy.notes?.includes('EXAMPLE');

                          return (
                            <tr
                              key={policy.id}
                              onClick={() => openPolicyDetail(policy)}
                              title="Click to open details"
                              className={`hover:bg-slate-50 transition border-b border-slate-100 cursor-pointer ${
                                isExample ? 'bg-yellow-50/50 hover:bg-yellow-50' : 'bg-white'
                              } ${detailPolicy?.id === policy.id ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                            >
                              <td className="p-3.5 pl-6 font-semibold text-slate-800">{policy.policyNumber}</td>
                              <td className="p-3.5 text-slate-500">{policy.dateWon}</td>
                              <td className="p-3.5 text-slate-500">{policy.policyEffectiveDate || policy.dateWon}</td>
                              <td className="p-3.5 text-slate-800 font-sans font-medium">{policy.clientName}</td>
                              <td className="p-3.5 text-slate-600 font-sans">{policy.carrier}</td>
                              <td className="p-3.5 text-slate-600 font-sans">{policy.lineOfBusiness}</td>
                              <td className="p-3.5 font-sans">
                                {/agency/i.test(policy.billingType || '') ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                    {policy.billingType || 'Agency Bill'}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[11px]">{policy.billingType || '—'}</span>
                                )}
                              </td>
                              <td className="p-3.5 text-right text-slate-700">
                                {formatCurrency(policy.agencyFeeAmount ?? policy.adminFeeAmount)}
                              </td>
                              <td className="p-3.5 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  policy.newRenewal === 'New' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                  {policy.newRenewal}
                                </span>
                              </td>
                              <td className="p-3.5 text-right text-slate-700">{formatCurrency(policy.premiumAmount)}</td>
                              <td className="p-3.5 font-sans">
                                {lookup.ruleFound ? (
                                  <span className="text-slate-600 font-medium text-[11px]">
                                    {lookup.method}
                                  </span>
                                ) : (
                                  <span className="text-amber-500 font-bold text-[11px] flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Manual
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-right text-slate-900 font-bold calc-black">
                                {formatCurrencyDecimal(lookup.expectedAmount)}
                              </td>
                              <td className="p-3.5 text-center pr-6">
                                <button
                                  onClick={(e) => { e.stopPropagation(); deletePolicy(policy.id); }}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 transition"
                                  title="Delete won policy"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Policy detail slide-over — work a row in place, no horizontal scrolling */}
                {detailPolicy && (
                  <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
                    <div
                      className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
                      onClick={closePolicyDetail}
                    />
                    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
                      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-slate-900 font-display text-base leading-tight">
                            {detailForm.clientName || 'Policy Detail'}
                          </h4>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {detailForm.policyNumber} · {detailForm.carrier}
                          </p>
                        </div>
                        <button
                          onClick={closePolicyDetail}
                          className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 text-sm leading-none"
                          title="Close"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-xs">
                        {(() => {
                          const merged = { ...detailPolicy, ...detailForm } as WonPolicy;
                          const lk = lookupAndCalculate(merged, rules);
                          return (
                            <div className={`rounded-lg border p-3 flex items-center justify-between ${lk.ruleFound ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Expected commission</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{lk.ruleFound ? lk.method : 'No rule matched — manual'}</p>
                              </div>
                              <p className="text-lg font-bold font-mono text-slate-900">{formatCurrencyDecimal(lk.expectedAmount)}</p>
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Policy #</span>
                            <input value={detailForm.policyNumber ?? ''} onChange={(e) => setDetailForm({ ...detailForm, policyNumber: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono" />
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Date won / effective</span>
                            <input type="date" value={detailForm.dateWon ?? ''} onChange={(e) => setDetailForm({ ...detailForm, dateWon: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5" />
                          </label>
                        </div>

                        <label className="block">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Client</span>
                          <input value={detailForm.clientName ?? ''} onChange={(e) => setDetailForm({ ...detailForm, clientName: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5" />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Carrier</span>
                            <input value={detailForm.carrier ?? ''} onChange={(e) => setDetailForm({ ...detailForm, carrier: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5" />
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Line of business</span>
                            <input value={detailForm.lineOfBusiness ?? ''} onChange={(e) => setDetailForm({ ...detailForm, lineOfBusiness: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5" />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">New / Renewal</span>
                            <select value={detailForm.newRenewal ?? 'New'} onChange={(e) => setDetailForm({ ...detailForm, newRenewal: e.target.value as 'New' | 'Renewal' })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 bg-white">
                              <option value="New">New</option>
                              <option value="Renewal">Renewal</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Payment timing</span>
                            <select value={detailForm.paymentTiming ?? ''} onChange={(e) => setDetailForm({ ...detailForm, paymentTiming: (e.target.value || undefined) as 'As Earned' | 'In Advance' | undefined })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 bg-white">
                              <option value="">— From rule —</option>
                              <option value="As Earned">As Earned</option>
                              <option value="In Advance">In Advance</option>
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Premium ($)</span>
                            <input type="number" step="0.01" value={detailForm.premiumAmount ?? ''} onChange={(e) => setDetailForm({ ...detailForm, premiumAmount: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Payroll ($)</span>
                            <input type="number" step="0.01" value={detailForm.payrollAmount ?? ''} onChange={(e) => setDetailForm({ ...detailForm, payrollAmount: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Billing</span>
                            <select value={detailForm.billingType ?? ''} onChange={(e) => setDetailForm({ ...detailForm, billingType: e.target.value || undefined })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 bg-white">
                              <option value="">— Not set —</option>
                              <option value="Direct Bill">Direct Bill</option>
                              <option value="Agency Bill">Agency Bill</option>
                              <option value="Direct Bill 100">Direct Bill 100</option>
                              <option value="Agency Bill 100">Agency Bill 100</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Agency fee ($) · RSG → insured</span>
                            <input type="number" step="0.01" value={detailForm.agencyFeeAmount ?? detailForm.adminFeeAmount ?? ''} onChange={(e) => {
                              const n = e.target.value === '' ? undefined : Number(e.target.value);
                              setDetailForm({ ...detailForm, agencyFeeAmount: n, adminFeeAmount: n });
                            }} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                          </label>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500"># Emp</span>
                            <input type="number" value={detailForm.numberOfEmployees ?? ''} onChange={(e) => setDetailForm({ ...detailForm, numberOfEmployees: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Admin fee ($)</span>
                            <input type="number" step="0.01" value={detailForm.adminFeeAmount ?? ''} onChange={(e) => setDetailForm({ ...detailForm, adminFeeAmount: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                          </label>
                          <label className="block">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Mo. prem ($)</span>
                            <input type="number" step="0.01" value={detailForm.monthlyPremiumAmount ?? ''} onChange={(e) => setDetailForm({ ...detailForm, monthlyPremiumAmount: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                          </label>
                        </div>

                        <label className="block">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Manual expected ($) — overrides rulebook</span>
                          <input type="number" step="0.01" value={detailForm.manualExpectedAmount ?? ''} onChange={(e) => setDetailForm({ ...detailForm, manualExpectedAmount: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 font-mono text-right" />
                        </label>

                        <label className="block">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Notes</span>
                          <textarea rows={3} value={detailForm.notes ?? ''} onChange={(e) => setDetailForm({ ...detailForm, notes: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5" />
                        </label>
                      </div>

                      <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                        <button
                          onClick={() => { const id = detailPolicy.id; closePolicyDetail(); deletePolicy(id); }}
                          className="px-3 py-2 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition"
                        >
                          Delete
                        </button>
                        <div className="flex items-center gap-2">
                          <button onClick={closePolicyDetail} className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition">
                            Cancel
                          </button>
                          <button onClick={savePolicyDetail} disabled={detailSaving} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition disabled:opacity-50">
                            {detailSaving ? 'Saving…' : 'Save changes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: CARRIER RULES */}
            {activeTab === 'rules' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/55">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                      Carrier Rules & Calendars Matrix
                      <span className="text-xs font-normal px-2 py-0.5 bg-green-100 text-green-800 rounded border border-green-200">
                        RULEBOOK
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Define commission expectations and manage monthly carrier direct deposit calendars to automate audit matching.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    {rulesSubTab === 'rules' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBulkImport(!showBulkImport);
                            setShowRuleForm(false);
                          }}
                          className={`px-4 py-2 font-medium text-xs rounded-lg border shadow-xs transition flex items-center gap-1.5 ${
                            showBulkImport
                              ? 'bg-slate-100 border-slate-400 text-slate-800 font-bold'
                              : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
                          }`}
                          id="bulk-import-rules-btn"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          Bulk Import Rules
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowRuleForm(!showRuleForm);
                            setShowBulkImport(false);
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg shadow-sm transition flex items-center gap-1.5"
                          id="add-rule-btn"
                        >
                          <Plus className="w-4 h-4" />
                          Add Commission Rule
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSchedForm(!showSchedForm);
                          setEditingSchedId(null);
                          setSchedFormData({ carrier: '', closeDay: '', payDay: '', notes: '' });
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg shadow-sm transition flex items-center gap-1.5"
                        id="add-schedule-btn"
                      >
                        <Plus className="w-4 h-4" />
                        Add Carrier Schedule
                      </button>
                    )}
                  </div>
                </div>

                {/* Rules & Schedules Subtab Navigation */}
                <div className="px-6 py-2.5 bg-slate-100/60 border-b border-slate-200/80 flex gap-2">
                  <button
                    onClick={() => setRulesSubTab('rules')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition ${
                      rulesSubTab === 'rules'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                    Commission Rules Matrix
                  </button>
                  <button
                    onClick={() => setRulesSubTab('schedules')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition ${
                      rulesSubTab === 'schedules'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Billing Cycles & Payout Schedules
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full leading-none">
                      {schedules.length}
                    </span>
                  </button>
                </div>

                {/* Bulk Import Form Block */}
                {showBulkImport && (
                  <div className="p-6 bg-slate-50 border-b border-slate-200/60 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                          Bulk Commission Rules Spreadsheet Importer
                        </h4>
                      </div>
                      <button onClick={() => setShowBulkImport(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 mb-4 leading-relaxed font-sans">
                      Pasting your commission matrices directly from Excel, Google Sheets, or a text file? Copy the rows (including or excluding headers) and paste them in the text box below. Ensure the columns are in the following structural order (delimited by tabs or commas):
                    </p>

                    {/* Blueprint grid mapping */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-5 text-[10px] font-mono select-none">
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 1</span>
                        <strong className="text-slate-800 font-bold font-sans">Carrier</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 2</span>
                        <strong className="text-slate-800 font-bold font-sans">Line of Business</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 3</span>
                        <strong className="text-slate-800 font-bold font-sans">New/Renewal</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 4</span>
                        <strong className="text-slate-800 font-bold font-sans">Method</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 5</span>
                        <strong className="text-slate-800 font-bold font-sans">Rate %</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 6</span>
                        <strong className="text-slate-800 font-bold font-sans">Flat/Per-Emp $</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 7</span>
                        <strong className="text-slate-800 font-bold font-sans">Timing</strong>
                      </div>
                      <div className="bg-white p-2 border border-slate-200 rounded text-center">
                        <span className="text-slate-400 block font-sans">COL 8</span>
                        <strong className="text-slate-800 font-bold font-sans">Notes</strong>
                      </div>
                    </div>

                    <form onSubmit={handleBulkImportSubmit} className="space-y-4">
                      <div className="relative">
                        <textarea
                          rows={6}
                          value={bulkImportText}
                          onChange={(e) => setBulkImportText(e.target.value)}
                          placeholder="Example Auto Co&#9;Personal Auto&#9;New&#9;% of Premium&#9;15.0&#9;—&#9;In Advance&#9;Standard Auto Rates New LOB&#10;Example Auto Co&#9;Personal Auto&#9;Renewal&#9;% of Premium&#9;10.0&#9;—&#9;As Earned&#9;Auto Renewals&#10;Invo PEO&#9;Employee Benefits&#9;New&#9;Per Employee&#9;—&#9;75.00&#9;As Earned&#9;$75 administrative service fee"
                          className="w-full font-mono text-xs p-3 bg-white border border-slate-300 rounded-lg shadow-xs focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                          id="bulk-import-textarea"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setBulkImportText(
                              "Example Auto Co\tPersonal Auto\tNew\t% of Premium\t15.0\t—\tIn Advance\tAuto rates new business\nExample Auto Co\tPersonal Auto\tRenewal\t% of Premium\t10.0\t—\tAs Earned\tAuto renewal business\nInvo PEO\tWorkers Comp\tNew\t% of Payroll\t1.1\t—\tAs Earned\tPEO Workers Comp rate"
                            );
                            setBulkImportError(null);
                          }}
                          className="absolute right-3.5 bottom-3.5 py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-sans font-bold rounded border border-slate-300 flex items-center gap-1 transition"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" /> Load Excel Paste Demo
                        </button>
                      </div>

                      {bulkImportError && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3.5 text-xs font-mono whitespace-pre-line">
                          {bulkImportError}
                        </div>
                      )}

                      {bulkImportSuccess && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3.5 text-xs font-semibold">
                          {bulkImportSuccess}
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Auto-detects Excel tab-spacing and Standard CSV delimiters.
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowBulkImport(false);
                              setBulkImportText('');
                              setBulkImportError(null);
                            }}
                            className="px-4 py-2 bg-slate-200 text-slate-700 text-xs rounded-lg font-medium hover:bg-slate-300 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs rounded-lg font-semibold transition shadow-sm"
                          >
                            Execute Bulk Import
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}

                {/* Inline Rule Form */}
                {showRuleForm && (
                  <div className="p-6 bg-slate-50 border-b border-slate-200/60 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                        ADD COMMISSION RATE RULE
                      </h4>
                      <button onClick={() => setShowRuleForm(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleRuleSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Carrier Name <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Example Auto Co"
                            value={ruleFormData.carrier || ''}
                            onChange={(e) => setRuleFormData({ ...ruleFormData, carrier: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Line of Business <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Personal Auto"
                            value={ruleFormData.lineOfBusiness || ''}
                            onChange={(e) => setRuleFormData({ ...ruleFormData, lineOfBusiness: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            New / Renewal <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <select
                            value={ruleFormData.newRenewal}
                            onChange={(e) => setRuleFormData({ ...ruleFormData, newRenewal: e.target.value as 'New' | 'Renewal' })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          >
                            <option value="New">New</option>
                            <option value="Renewal">Renewal</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Commission Method <span className="text-blue-600 font-bold">*</span>
                          </label>
                          <select
                            value={ruleFormData.method}
                            onChange={(e) => setRuleFormData({ ...ruleFormData, method: e.target.value as CommissionMethod })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          >
                            <option value="% of Premium">% of Premium</option>
                            <option value="% of Monthly Premium">% of Monthly Premium</option>
                            <option value="% of Admin Fee">% of Admin Fee</option>
                            <option value="% of Payroll">% of Payroll</option>
                            <option value="Flat $">Flat $</option>
                            <option value="Per Employee">Per Employee</option>
                            <option value="Manual">Manual (type Expected per policy)</option>
                          </select>
                        </div>

                        {/* Fields change dynamically based on selected Method */}
                        {(ruleFormData.method === '% of Premium' || ruleFormData.method === '% of Payroll' || ruleFormData.method === '% of Monthly Premium' || ruleFormData.method === '% of Admin Fee') && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Rate (%)
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.1"
                                placeholder="12.0"
                                value={ruleFormData.ratePercentage ?? ''}
                                onChange={(e) =>
                                  setRuleFormData({
                                    ...ruleFormData,
                                    ratePercentage: e.target.value === '' ? undefined : Number(e.target.value)
                                  })
                                }
                                className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700 pr-8"
                              />
                              <span className="absolute right-3 top-2 text-slate-400 font-semibold">%</span>
                            </div>
                          </div>
                        )}

                        {(ruleFormData.method === 'Flat $' || ruleFormData.method === 'Per Employee') && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Flat / Per-Employee ($ Amount)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2 text-slate-400 font-semibold">$</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="100.00"
                                value={ruleFormData.flatOrPerEmployeeAmount ?? ''}
                                onChange={(e) =>
                                  setRuleFormData({
                                    ...ruleFormData,
                                    flatOrPerEmployeeAmount: e.target.value === '' ? undefined : Number(e.target.value)
                                  })
                                }
                                className="w-full text-xs border border-slate-300 rounded-lg pl-6 pr-3 py-2 bg-white text-blue-700"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Standard Payment Timing
                          </label>
                          <select
                            value={ruleFormData.paymentTiming || 'As Earned'}
                            onChange={(e) => setRuleFormData({ ...ruleFormData, paymentTiming: e.target.value as 'As Earned' | 'In Advance' })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          >
                            <option value="As Earned">As Earned (Installments)</option>
                            <option value="In Advance">In Advance (Upfront)</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Notes / Rule Description
                          </label>
                          <input
                            type="text"
                            placeholder="Add specific rule conditions or context..."
                            value={ruleFormData.notes || ''}
                            onChange={(e) => setRuleFormData({ ...ruleFormData, notes: e.target.value })}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-blue-700"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowRuleForm(false)}
                          className="px-4 py-2 bg-slate-200 text-slate-700 text-xs rounded-lg font-medium hover:bg-slate-300 transition align-middle"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs rounded-lg font-semibold transition shadow-sm"
                        >
                          Save Rule
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                   {/* Inline Carrier Schedule Form */}
                {rulesSubTab === 'schedules' && showSchedForm && (
                  <div className="p-6 bg-emerald-50/10 border-b border-slate-200 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        {editingSchedId ? 'EDIT CARRIER CALENDAR CYCLE' : 'NEW CARRIER CALENDAR CYCLE'}
                      </h4>
                      <button
                        onClick={() => {
                          setShowSchedForm(false);
                          setEditingSchedId(null);
                          setSchedFormData({ carrier: '', closeDay: '', payDay: '', notes: '' });
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSchedSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Carrier Name <span className="text-emerald-700 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. GEICO Commercial"
                            value={schedFormData.carrier || ''}
                            onChange={(e) => setSchedFormData({ ...schedFormData, carrier: e.target.value })}
                            className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Cutoff / Billing Period Close <span className="text-emerald-700 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Last day of month"
                            value={schedFormData.closeDay || ''}
                            onChange={(e) => setSchedFormData({ ...schedFormData, closeDay: e.target.value })}
                            className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Expected Payment Sweep Date <span className="text-emerald-700 font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 7th workday of month"
                            value={schedFormData.payDay || ''}
                            onChange={(e) => setSchedFormData({ ...schedFormData, payDay: e.target.value })}
                            className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Cycle Memo / Sweep Details
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Pays monthly via ACH direct. Commission paid on admin fee portion."
                          value={schedFormData.notes || ''}
                          onChange={(e) => setSchedFormData({ ...schedFormData, notes: e.target.value })}
                          className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowSchedForm(false);
                            setEditingSchedId(null);
                            setSchedFormData({ carrier: '', closeDay: '', payDay: '', notes: '' });
                          }}
                          className="px-4 py-2 bg-slate-200 text-slate-700 text-xs rounded-lg font-medium hover:bg-slate-300 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-semibold transition shadow-sm"
                        >
                          {editingSchedId ? 'Update Schedule' : 'Save Cycle Schedule'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {rulesSubTab === 'rules' ? (
                  <div className="animate-in fade-in duration-200">
                    {/* Carrier filter — pull up one carrier's rules (e.g. Liberty Mutual). */}
                    <div className="px-6 py-3 border-b border-slate-200/70 bg-white flex flex-wrap items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <label htmlFor="rule-carrier-filter" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-mono">
                        Carrier
                      </label>
                      <select
                        id="rule-carrier-filter"
                        value={ruleCarrierFilter}
                        onChange={(e) => setRuleCarrierFilter(e.target.value)}
                        className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none max-w-[220px]"
                      >
                        {ruleCarriers.map((c) => (
                          <option key={c} value={c}>{c === 'All' ? 'All carriers' : c}</option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {visibleRules.length} rule{visibleRules.length === 1 ? '' : 's'}
                        {ruleCarrierFilter !== 'All' ? ` · ${ruleCarrierFilter}` : ''}
                      </span>
                      {ruleCarrierFilter !== 'All' && (
                        <button
                          type="button"
                          onClick={() => setRuleCarrierFilter('All')}
                          className="ml-auto text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                          <th className="p-3.5 pl-6 font-semibold">Carrier</th>
                          <th className="p-3.5 font-semibold">Line of Business</th>
                          <th className="p-3.5 font-semibold text-center">New / Renewal</th>
                          <th className="p-3.5 font-semibold">Commission Method</th>
                          <th className="p-3.5 font-semibold text-center">Timing</th>
                          <th className="p-3.5 text-right font-semibold">Rate (%)</th>
                          <th className="p-3.5 text-right font-semibold">Flat / Per-Emp ($)</th>
                          <th className="p-3.5 font-semibold">Notes</th>
                          <th className="p-3.5 pr-6 font-semibold text-center font-sans">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {rules.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-slate-400 font-sans">
                              No active commission rules entered. Start writing down your carrier rules to generate expected payouts.
                            </td>
                          </tr>
                        ) : visibleRules.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-slate-400 font-sans">
                              No commission rules for <span className="font-semibold text-slate-600">{ruleCarrierFilter}</span>.{' '}
                              <button type="button" onClick={() => setRuleCarrierFilter('All')} className="text-blue-600 hover:underline">Show all carriers</button>
                            </td>
                          </tr>
                        ) : (
                          visibleRules.map((rule) => {
                            const isExample = rule.notes?.includes('EXAMPLE');

                            return (
                              <tr
                                key={rule.id}
                                className={`hover:bg-slate-50 transition border-b border-slate-100 ${
                                  isExample ? 'bg-yellow-50/50 hover:bg-yellow-50' : 'bg-white'
                                }`}
                              >
                                <td className="p-3.5 pl-6 font-bold text-slate-900 font-sans">{rule.carrier}</td>
                                <td className="p-3.5 text-slate-700 font-sans">{rule.lineOfBusiness}</td>
                                <td className="p-3.5 text-center font-sans">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    rule.newRenewal === 'New' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}>
                                    {rule.newRenewal}
                                  </span>
                                </td>
                                <td className="p-3.5 text-slate-600 font-sans font-medium">{rule.method}</td>
                                <td className="p-3.5 text-center font-sans">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    rule.paymentTiming === 'In Advance' ? 'bg-blue-100 text-blue-850 border border-blue-200' : 'bg-indigo-100 text-indigo-850 border border-indigo-200'
                                  }`}>
                                    {rule.paymentTiming || 'As Earned'}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right font-semibold text-slate-800">
                                  {rule.ratePercentage !== undefined ? formatPercentage(rule.ratePercentage) : '—'}
                                </td>
                                <td className="p-3.5 text-right font-semibold text-slate-800">
                                  {rule.flatOrPerEmployeeAmount !== undefined ? formatCurrency(rule.flatOrPerEmployeeAmount) : '—'}
                                </td>
                                <td className="p-3.5 text-slate-400 font-sans max-w-[200px] truncate" title={rule.notes}>
                                  {isExample ? (
                                    <span className="text-yellow-600 font-medium bg-yellow-105 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                                      Example Placeholder
                                    </span>
                                  ) : (
                                    rule.notes || '—'
                                  )}
                                </td>
                                <td className="p-3.5 text-center pr-6">
                                  <button
                                    onClick={() => deleteRule(rule.id)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 transition"
                                    title="Remove rule"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto animate-in fade-in duration-200">
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                          <th className="p-3.5 pl-6 font-semibold">Insurance Carrier</th>
                          <th className="p-3.5 font-semibold">Billing Period Cutoff / Close</th>
                          <th className="p-3.5 font-semibold text-center">Payout Sweep Delay / Schedule</th>
                          <th className="p-3.5 font-semibold">Memos & Details</th>
                          <th className="p-3.5 pr-6 font-semibold text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {schedules.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400 font-medium italic">
                              No carrier payment schedules declared. Define your cycles to track direct deposit timelines.
                            </td>
                          </tr>
                        ) : (
                          schedules.map((sched) => (
                            <tr
                              key={sched.id}
                              className="hover:bg-slate-50 transition border-b border-slate-100 bg-white text-slate-700"
                            >
                              <td className="p-3.5 pl-6 font-bold text-slate-900 text-xs flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                {sched.carrier}
                              </td>
                              <td className="p-3.5 font-mono text-slate-700 font-semibold">{sched.closeDay}</td>
                              <td className="p-3.5 text-center font-mono">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                                  <Clock className="w-3 h-3 text-emerald-600" />
                                  {sched.payDay}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-500 text-xs font-normal">{sched.notes || '—'}</td>
                              <td className="p-3.5 text-center pr-6">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => startEditSchedule(sched)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition"
                                    title="Edit schedule details"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => deleteSchedule(sched.id)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 transition"
                                    title="Delete schedule"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 text-xs flex justify-between items-center">
                  <span className="text-slate-500 font-medium italic flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
                    Supabase blueprint ready: Maps 1:1 to commission_rules and payout_schedules database schemas.
                  </span>
                </div>
              </div>
            )}

            {/* Tab: SHORTAGE QUEUE (Phase 3 reconciliation discrepancies) */}
            {activeTab === 'queue' && <ReconciliationQueue />}

            {/* Tab: LEGEND & DETAILED GUIDE */}
            {activeTab === 'guide' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 font-display">
                    RSG Commission Tracker & Reconciliation Guide
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Understand the spreadsheet logic model and the color-coded ledger system before connecting it to QuickBooks.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Ledger instructions */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/60 space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                      LEGEND & COLOR ENCODING
                    </h4>
                    <ul className="text-xs space-y-2.5">
                      <li className="flex items-start gap-2 text-slate-600">
                        <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono font-medium text-[10px]">
                          BLUE Text
                        </span>
                        <span>
                          <strong>User Entry:</strong> Direct fields that you type manually. This keeps active inputs easily distinguishable.
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-slate-600">
                        <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono font-medium text-[10px]">
                          GREEN Text
                        </span>
                        <span>
                          <strong>System Lookup:</strong> Pulled data automatically synchronized from another sheet or tab. You never have to manually rekey these values.
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-slate-600">
                        <span className="inline-block px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-mono font-medium text-[10px]">
                          BLACK Text
                        </span>
                        <span>
                          <strong>Calculated:</strong> Formula calculations executing automatically (e.g. Expected Commission, Variance).
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-slate-600">
                        <span className="inline-block px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded font-mono font-medium text-[10px]">
                          YELLOW Background
                        </span>
                        <span>
                          <strong>Live data:</strong> Rules, policies, and reconciliations are stored securely in Supabase and shared across the RSG team — changes save instantly.
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Calculations Details */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/60 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                      THE 5 SUPPORTED COMMISSION METHODS
                    </h4>
                    <p className="text-xs text-slate-500">
                      We support both simple and complex lines of business:
                    </p>
                    <ul className="text-xs space-y-2 font-mono text-slate-600">
                      <li>
                        <strong>% of Premium</strong>: Rate (%) * Premium ($) / 100
                      </li>
                      <li>
                        <strong>% of Payroll</strong>: Rate (%) * Payroll ($) / 100
                      </li>
                      <li>
                        <strong>Flat $</strong>: Direct flat broker dollar fee
                      </li>
                      <li>
                        <strong>Per Employee</strong>: Dollar Fee * Number of active Employees
                      </li>
                      <li>
                        <strong>Manual</strong>: Custom dynamic fee that varies per deal (e.g., PEO deals with custom spreads you type immediately on the policy row)
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/60 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                    RECONCILIATION & QUICKBOOKS INTEGRATION FLOW
                  </h4>
                  <p className="text-xs leading-relaxed text-slate-600">
                    When the carrier sends statements at the end of the month, simply navigate of the <strong>Reconciliation</strong> tab, click <strong>Reconcile Carrier Payout</strong>, select the client's won policy, and type the actual payment. 
                    <br/><br/>
                    The audit ledger flags discrepancies instantly. For example, if a carrier has underpaid, it highlights with a <strong className="text-amber-600">⚠ SHORT - chase</strong> warning, alerting you to log structural disputes. 
                    Once confirmed, look at the <strong>QuickBooks Carrier Summary</strong> panel on the right side of the screen. You can copy the received totals per carrier with a single click and post them under Commission Income in QuickBooks.
                  </p>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}
