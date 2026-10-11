import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCostCategories, getCostTypes, createCost, getExistingCosts, updateCost, deleteCost } from '../lib/api';
import { useCurrency } from '../lib/useCurrency';
import { DateInput } from '../components/DateInput';

interface RecurringDetails {
  recur_kind: 'monthly' | 'weekly' | 'yearly';
  recur_interval: number;
}

interface RecurringCostSummary {
  cost_type: string;
  start_month: string;
  total_amount: number;
  details: Array<{
    id: number | string;
    cost: string;
    amount: number;
    start_date?: string;
    end_date?: string;
    recur_kind?: 'monthly' | 'weekly' | 'yearly';
    recur_interval?: number;
  }>;
}

interface NonRecurringCostSummary {
  cost_type: string;
  month: string;
  total_amount: number;
  details: Array<{
    id: number | string;
    cost: string;
    amount: number;
    cost_date?: string;
  }>;
}

const NewCost = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { parseAmount, fmtInput, fmtMoney } = useCurrency();
  const formRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef<boolean>(false);
  
  // Edit state
  const [editingCostId, setEditingCostId] = useState<number | string | null>(null);
  const [editingCostType, setEditingCostType] = useState<'recurring' | 'non-recurring' | null>(null);
  const [pendingCostTypeValue, setPendingCostTypeValue] = useState<string | null>(null);
  
  // Form state
  const [businessPrivate, setBusinessPrivate] = useState<'B' | 'P'>('B');
  const [costCategory, setCostCategory] = useState<string>('');
  const [recurringDetails, setRecurringDetails] = useState<RecurringDetails>({
    recur_kind: 'monthly',
    recur_interval: 1
  });
  const [costType, setCostType] = useState<string>('');
  const [cost, setCost] = useState<string>('');
  const [costDate, setCostDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [amount, setAmount] = useState<string>('');   // display string (raw while typing)
  
  // Options from backend
  const [costCategoryOptions, setCostCategoryOptions] = useState<string[]>([]);
  const [costTypeOptions, setCostTypeOptions] = useState<string[]>([]);
  
  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Cost viewing state
  const _now = new Date();
  const [selectedYear,  setSelectedYear]  = useState(_now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(_now.getMonth() + 1);
  const [filterType, setFilterType] = useState<'all' | 'B' | 'P'>('B');
  const [filterKind, setFilterKind] = useState<'all' | 'recurring' | 'non-recurring'>('all');
  const [bRecurring,    setBRecurring]    = useState<RecurringCostSummary[]>([]);
  const [bNonRecurring, setBNonRecurring] = useState<NonRecurringCostSummary[]>([]);
  const [pRecurring,    setPRecurring]    = useState<RecurringCostSummary[]>([]);
  const [pNonRecurring, setPNonRecurring] = useState<NonRecurringCostSummary[]>([]);
  const [expandedKeys,  setExpandedKeys]  = useState<Set<string>>(new Set());
  const [loadingCosts,  setLoadingCosts]  = useState(false);

  // Derived state - check if it's recurring (but NOT non-recurring)
  const isRecurring = costCategory.toLowerCase().includes('recurring') && !costCategory.toLowerCase().includes('non-recurring');

  // Load cost category options when businessPrivate changes
  useEffect(() => {
    // Skip automatic loading if we're in edit mode (manual load handles it)
    if (isEditingRef.current) {
      console.log('Skipping automatic category load - in edit mode (ref)');
      return;
    }
    
    loadCostCategoryOptions();
  }, [businessPrivate]);

  // Load cost type options when cost category changes
  useEffect(() => {
    // Skip automatic loading if we're in edit mode (manual load handles it)
    if (isEditingRef.current) {
      console.log('Skipping automatic cost type load - in edit mode (ref)');
      return;
    }
    
    if (costCategory) {
      loadCostTypeOptions();
    } else {
      setCostTypeOptions([]);
      setCostType('');
    }
  }, [costCategory]);

  // Apply pending cost type value once options are loaded
  useEffect(() => {
    console.log('=== PENDING COST TYPE EFFECT ===');
    console.log('pendingCostTypeValue:', pendingCostTypeValue);
    console.log('costTypeOptions.length:', costTypeOptions.length);
    console.log('costTypeOptions:', costTypeOptions);
    
    if (pendingCostTypeValue && costTypeOptions.length > 0) {
      console.log('Applying pending cost type:', pendingCostTypeValue);
      setCostType(pendingCostTypeValue);
      setPendingCostTypeValue(null);
      console.log('Pending cost type applied and cleared');
    } else {
      console.log('Conditions not met for applying pending cost type');
    }
  }, [costTypeOptions, pendingCostTypeValue]);

  // Load costs when filters change
  useEffect(() => {
    loadExistingCosts();
  }, [filterType, selectedYear, selectedMonth]);

  const loadCostCategoryOptions = async () => {
    try {
      const response = await getCostCategories(businessPrivate);
      setCostCategoryOptions(response.categories || []);
      
      // Only clear these if NOT in edit mode
      if (editingCostId === null) {
        setCostCategory('');
        setCostType('');
      }
    } catch (err) {
      console.error('Error loading cost categories:', err);
      setError(t('costs.failedLoadCategories'));
    }
  };

  const loadCostTypeOptions = async () => {
    try {
      const response = await getCostTypes(costCategory);
      setCostTypeOptions(response.types || []);
      setCostType('');
    } catch (err) {
      console.error('Error loading cost types:', err);
      setError(t('costs.failedLoadTypes'));
    }
  };

  const loadExistingCosts = async () => {
    setLoadingCosts(true);
    try {
      if (filterType === 'all') {
        const [bRes, pRes] = await Promise.all([
          getExistingCosts('B', selectedYear, selectedMonth),
          getExistingCosts('P', selectedYear, selectedMonth),
        ]);
        setBRecurring(bRes.recurring || []);
        setBNonRecurring(bRes.non_recurring || []);
        setPRecurring(pRes.recurring || []);
        setPNonRecurring(pRes.non_recurring || []);
      } else {
        const res = await getExistingCosts(filterType, selectedYear, selectedMonth);
        if (filterType === 'B') {
          setBRecurring(res.recurring || []);
          setBNonRecurring(res.non_recurring || []);
          setPRecurring([]); setPNonRecurring([]);
        } else {
          setPRecurring(res.recurring || []);
          setPNonRecurring(res.non_recurring || []);
          setBRecurring([]); setBNonRecurring([]);
        }
      }
    } catch (err) {
      console.error('Error loading existing costs:', err);
    } finally {
      setLoadingCosts(false);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Edit a cost - populate form with existing data
  const handleEditCost = async (costId: number | string, costType: 'recurring' | 'non-recurring', detail: any, businessPrivateContext: 'B' | 'P' = 'B') => {
    try {
      // CRITICAL: Set ref FIRST before any state changes
      isEditingRef.current = true;
      
      console.log('=== EDIT COST DEBUG ===');
      console.log('Cost ID:', costId);
      console.log('Cost Type:', costType);
      console.log('Detail:', detail);
      
      // STEP 1: Clear cost type only (not options yet)
      setCostType('');
      setPendingCostTypeValue(null);
      
      // STEP 2: Set business/private type FIRST (before edit mode)
      // This prevents the checkbox change from interfering with the edit flow
      setBusinessPrivate(businessPrivateContext);

      // STEP 3: Set edit mode AFTER businessPrivate is set
      setEditingCostId(costId);
      setEditingCostType(costType);

      // STEP 4: Determine category
      let category = '';
      if (costType === 'recurring') {
        category = businessPrivateContext === 'B' ? 'Business recurring cost' : 'Private recurring cost';
      } else {
        category = businessPrivateContext === 'B' ? 'Business non-recurring cost' : 'Private non-recurring cost';
      }
      
      const targetCostType = detail.cost_type || '';
      console.log('Target cost type to set:', targetCostType);
      
      // STEP 5: Set category FIRST (before loading options)
      // This prevents the category useEffect from interfering later
      setCostCategory(category);
      
      // STEP 6: Load options manually (overriding the automatic load from category change)
      console.log('Loading cost types for category:', category);
      const response = await getCostTypes(category);
      const types = response.types || [];
      console.log('Loaded cost type options:', types);
      
      // STEP 7: Set pending value FIRST, then options
      setPendingCostTypeValue(targetCostType);
      setCostTypeOptions(types);
      
      // The useEffect will now apply the pending value
      
      // STEP 8: Set other form fields
      setCost(detail.cost || '');
      setAmount(fmtInput(detail.amount));
      
      if (costType === 'recurring' && detail.start_date) {
        const startDate = String(detail.start_date).split('T')[0];
        setCostDate(startDate);
        
        if (detail.end_date) {
          const endDate = String(detail.end_date).split('T')[0];
          setEndDate(endDate);
        } else {
          setEndDate('');
        }
        
        setRecurringDetails({
          recur_kind: detail.recur_kind || 'monthly',
          recur_interval: detail.recur_interval || 1
        });
      } else if (detail.cost_date) {
        const costDate = String(detail.cost_date).split('T')[0];
        setCostDate(costDate);
      }
      
      setError('');
      
      console.log('Edit setup complete - waiting for useEffect to apply cost type');
      
      // Scroll to form
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('Error setting up edit:', err);
      setError(t('costs.failedLoadForEdit'));
    }
  };

  // Delete a cost
  const handleDeleteCost = async () => {
    if (!editingCostId || !editingCostType) return;
    
    if (!window.confirm(t('costs.confirmDelete'))) {
      return;
    }
    
    setLoading(true);
    try {
      await deleteCost(editingCostId, editingCostType);
      alert(t('costs.deleted'));
      handleClear();
      loadExistingCosts();
    } catch (err: any) {
      console.error('Error deleting cost:', err);
      setError(err.message || t('costs.failedDelete'));
    } finally {
      setLoading(false);
    }
  };

  // ---------- AMOUNT INPUT ----------
  // Accept "." or "," as decimal while typing; don't add thousands separators until blur.
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Keep only digits, commas, dots
    let s = raw.replace(/[^\d.,]/g, '');

    // Detect if the user just typed a decimal separator at the end
    const endsWithSep = /[.,]$/.test(s);

    // If a DOT already exists somewhere, treat all commas as thousands -> remove them
    if (s.includes('.')) {
      s = s.replace(/,/g, '');
    } else {
      // No dot present yet.
      const commaCount = (s.match(/,/g) || []).length;
      if (commaCount >= 1) {
        if (commaCount === 1) {
          // Single comma. If it's the last char, keep it as a trailing decimal marker for UX;
          // we will convert to '.' below but preserve trailing-dot state.
          s = s.replace(',', '.');
        } else {
          // Multiple commas: interpret the LAST comma as decimal sep, others as thousands (remove)
          const last = s.lastIndexOf(',');
          const intPart0 = s.slice(0, last).replace(/,/g, '');
          const decPart0 = s.slice(last + 1).replace(/,/g, '');
          s = intPart0 + '.' + decPart0;
        }
      }
      // Now there is at most one dot and no commas
    }

    // Ensure only one dot overall (strip extras after first)
    const firstDot = s.indexOf('.');
    if (firstDot !== -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    }

    // If user cleared everything or typed only non-numerics
    if (s === '') {
      setAmount('');
      return;
    }

    // Split integer and decimals (if any)
    const parts = s.split('.');
    const intRaw = parts[0] ?? '';
    let decRaw = parts[1] ?? '';

    // If user just typed a decimal separator at the end, and we have a dot,
    // keep a trailing dot visually (don't force-remove it).
    const keepTrailingDot = endsWithSep && s.includes('.') && decRaw === '';

    // Limit decimals to 2 while typing
    if (!keepTrailingDot) {
      decRaw = decRaw.slice(0, 2);
    }

    // Build raw display value WITHOUT thousands separators (prevents caret jumps)
    if (keepTrailingDot) {
      // show trailing dot
      setAmount(`${intRaw}.`);
    } else if (s.includes('.')) {
      setAmount(`${intRaw}.${decRaw}`);
    } else {
      setAmount(intRaw);
    }
  };

  const handleAmountFocus = () => { /* no-op: locale comma is the decimal separator, don't strip */ };

  // On blur: re-format to consistent 2-decimal locale format
  const handleAmountBlur = () => {
    if (!amount.trim()) return;
    const n = parseAmount(amount);
    if (Number.isFinite(n) && n > 0) setAmount(fmtInput(n));
  };

  // ---------- END AMOUNT INPUT ----------


  const validateForm = (): boolean => {
    if (!costCategory) {
      setError(t('costs.alertSelectCategory'));
      return false;
    }
    if (!costType) {
      setError(t('costs.alertSelectType'));
      return false;
    }
    if (!costDate) {
      setError(t('costs.alertSelectDate'));
      return false;
    }
    if (amount.trim() === '') {
      setError(t('costs.alertEnterAmount'));
      return false;
    }
    if (parseAmount(amount) <= 0) {
      setError(t('costs.alertEnterValidAmount'));
      return false;
    }
    if (isRecurring && recurringDetails.recur_interval < 1) {
      setError(t('costs.alertIntervalMin'));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    setError('');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const costData = {
        business_private: businessPrivate,
        cost_category: costCategory,
        cost_type: costType,
        cost: cost.trim(),
        amount: parseAmount(amount),
        ...(isRecurring ? {
          start_date: costDate,
          end_date: endDate || null,
          recur_kind: recurringDetails.recur_kind,
          recur_interval: recurringDetails.recur_interval
        } : {
          cost_date: costDate
        })
      };

      if (editingCostId && editingCostType) {
        // Update existing cost
        console.log('=== FRONTEND UPDATE DEBUG ===');
        console.log('Calling updateCost with:');
        console.log('- costId:', editingCostId, 'type:', typeof editingCostId);
        console.log('- costType:', editingCostType);
        console.log('- costData:', costData);
        
        await updateCost(editingCostId, editingCostType, costData);
        alert(t('costs.updated'));
      } else {
        // Create new cost
        await createCost(costData);
        alert(t('costs.saved'));
      }

      handleClear();
      // Reload costs to show the changes
      loadExistingCosts();
    } catch (err: any) {
      console.error('Error saving cost:', err);
      setError(err.message || t('costs.failedSave'));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    isEditingRef.current = false;
    setEditingCostId(null);
    setEditingCostType(null);
    setPendingCostTypeValue(null);
    setCostCategory('');
    setRecurringDetails({ recur_kind: 'monthly', recur_interval: 1 });
    setCostType('');
    setCost('');
    setCostDate('');
    setEndDate('');
    setAmount('');
    setError('');
  };

  const handleCancel = () => {
    if (editingCostId) {
      // If editing, just clear the form
      handleClear();
    } else {
      // If new cost, navigate back
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    }
  };

  const CONTROL_H = 44;
  const [formOpen, setFormOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  return (
    <>
      {/* Add / Edit Cost Card */}
      <div ref={formRef} className="card page-normal">
        <div
          onClick={() => setFormOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: formOpen ? 16 : 0 }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{formOpen ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>{t('costs.addOrEditTitle', 'Add new or Edit existing Cost')}</h3>
        </div>

      {formOpen && <>

        {error && (
          <div style={{
            background: '#fee',
            color: '#c33',
            padding: 12,
            borderRadius: 10,
            marginBottom: 16,
            borderLeft: '4px solid #c33'
          }}>
            {error}
          </div>
        )}

        {/* Business/Private Selection */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={businessPrivate === 'B'}
              onChange={(e) => { if (e.target.checked) setBusinessPrivate('B') }}
              disabled={editingCostId !== null}
              style={{ width: 18, height: 18 }}
            />
            <span>{t('costs.business')}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={businessPrivate === 'P'}
              onChange={(e) => { if (e.target.checked) setBusinessPrivate('P') }}
              disabled={editingCostId !== null}
              style={{ width: 18, height: 18 }}
            />
            <span>{t('costs.private')}</span>
          </label>
        </div>

        {/* Cost Category Dropdown */}
        <div style={{ marginTop: 12 }}>
          <label>{t('costs.costCategory')}</label>
          <select
            value={costCategory}
            onChange={(e) => setCostCategory(e.target.value)}
            disabled={loading || editingCostId !== null}
            style={{ height: CONTROL_H }}
          >
            <option value="">{t('costs.selectCategory')}</option>
            {costCategoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* Recurring Details - Only show if recurring category selected */}
        {isRecurring && (
          <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
            <div>
              <label>{t('costs.recurrence')}</label>
              <select
                value={recurringDetails.recur_kind}
                onChange={(e) => setRecurringDetails({
                  ...recurringDetails,
                  recur_kind: e.target.value as 'monthly' | 'weekly' | 'yearly'
                })}
                style={{ height: CONTROL_H }}
              >
                <option value="monthly">{t('costs.monthly')}</option>
                <option value="weekly">{t('costs.weekly')}</option>
                <option value="yearly">{t('costs.yearly')}</option>
              </select>
            </div>
            <div>
              <label>{t('costs.every')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={recurringDetails.recur_interval === 0 ? '' : recurringDetails.recur_interval}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, ''); // Only digits
                  setRecurringDetails({
                    ...recurringDetails,
                    recur_interval: val === '' ? 0 : parseInt(val, 10)
                  });
                }}
                onBlur={(e) => {
                  // Set to 1 if empty on blur
                  if (e.target.value === '' || parseInt(e.target.value) < 1) {
                    setRecurringDetails({
                      ...recurringDetails,
                      recur_interval: 1
                    });
                  }
                }}
                style={{ height: CONTROL_H }}
              />
              <p className="helper" style={{ marginTop: 4 }}>
                {recurringDetails.recur_kind === 'monthly' ? t('costs.months') :
                 recurringDetails.recur_kind === 'weekly' ? t('costs.weeks') :
                 t('costs.years')}
              </p>
            </div>
          </div>
        )}

        {/* Cost Type Dropdown - Show when category is selected */}
        {costCategory && (
          <div style={{ marginTop: 12 }}>
            <label>{t('costs.costType')}</label>
            <select
              value={costType}
              onChange={(e) => setCostType(e.target.value)}
              disabled={loading || !costTypeOptions.length}
              style={{ height: CONTROL_H }}
            >
              <option value="">{t('costs.selectType')}</option>
              {costTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Cost Description - Show when category is selected */}
        {costCategory && (
          <div style={{ marginTop: 12 }}>
            <label>{t('costs.costDescription')}</label>
            <input
              type="text"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder={t('costs.costDescriptionPlaceholder')}
              disabled={loading}
              style={{ height: CONTROL_H }}
            />
          </div>
        )}

        {/* Date Fields - Show when category is selected */}
        {costCategory && (
          <>
            {isRecurring ? (
              // Recurring: Show Start Date and End Date in two columns
              <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
                <div>
                  <label>{t('costs.startDate')}</label>
                  <DateInput
                    value={costDate}
                    onChange={v => setCostDate(v)}
                    disabled={loading}
                    style={{ height: CONTROL_H }}
                  />
                </div>
                <div>
                  <label>{t('costs.endDateOptional')}</label>
                  <DateInput
                    value={endDate}
                    onChange={v => setEndDate(v)}
                    disabled={loading}
                    style={{ height: CONTROL_H }}
                  />
                </div>
              </div>
            ) : (
              // Non-recurring: Show single Date field
              <div style={{ marginTop: 12 }}>
                <label>{t('date')}</label>
                <DateInput
                  value={costDate}
                  onChange={v => setCostDate(v)}
                  disabled={loading}
                  style={{ height: CONTROL_H }}
                />
              </div>
            )}
          </>
        )}

        {/* Amount Field - Show when category is selected */}
        {costCategory && (
          <div style={{ marginTop: 12 }}>
            <label>{t('costs.costAmount')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleAmountChange}
              onFocus={handleAmountFocus}
              onBlur={handleAmountBlur}
              placeholder={fmtInput(0)}
              disabled={loading}
              style={{ height: CONTROL_H }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="primary"
            onClick={handleSave}
            disabled={loading}
            style={{ height: CONTROL_H }}
          >
            {loading ? (editingCostId ? t('updating') : t('saving')) : (editingCostId ? t('update') : t('save'))}
          </button>
          {editingCostId && (
            <button
              onClick={handleDeleteCost}
              disabled={loading}
              style={{
                height: CONTROL_H,
                backgroundColor: '#d32f2f',
                color: 'white',
                border: 'none'
              }}
            >
              {t('delete')}
            </button>
          )}
          <button
            onClick={handleClear}
            disabled={loading}
            style={{ height: CONTROL_H }}
          >
            {t('clear')}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{ height: CONTROL_H }}
          >
            {t('cancel')}
          </button>
        </div>
      </>}
      </div>

      {/* Costs List Card */}
      <div className="card page-normal" style={{ marginTop: 16 }}>
        <div
          onClick={() => setListOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: listOpen ? 16 : 0 }}
        >
          <span style={{ fontSize: 'var(--expand-icon-size)', color: 'var(--muted)' }}>{listOpen ? '▼' : '▶'}</span>
          <h3 style={{ margin: 0 }}>{t('costs.allCosts', 'All Costs')}</h3>
        </div>

      {listOpen && <>
        {/* Year / Month picker */}
        {(() => {
          const now2 = new Date();
          const monthOptions: { year: number; month: number }[] = [];
          for (let i = 0; i < 24; i++) {
            const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
            monthOptions.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
          }
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return (
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                setSelectedYear(y); setSelectedMonth(m);
              }}
              style={{ marginBottom: 12 }}
            >
              {monthOptions.map(({ year, month }) => (
                <option key={`${year}-${month}`} value={`${year}-${month}`}>
                  {monthNames[month - 1]} {year}
                </option>
              ))}
            </select>
          );
        })()}

        {/* Type filter: All | Business | Private */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', marginBottom: 8 }}>
          {(['all', 'B', 'P'] as const).map(f => (
            <button key={f} onClick={() => { setFilterType(f); setFilterKind('all'); }}
              style={{ padding: '5px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: filterType === f ? 'var(--primary)' : 'transparent',
                color: filterType === f ? '#fff' : undefined }}>
              {f === 'all' ? t('costs.allCosts', 'All') : f === 'B' ? t('costs.business') : t('costs.private')}
            </button>
          ))}
        </div>

        {/* Kind filter: All | Recurring | Non-recurring (only when B or P selected) */}
        {filterType !== 'all' && (
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', marginBottom: 14 }}>
            {(['all', 'recurring', 'non-recurring'] as const).map(f => (
              <button key={f} onClick={() => setFilterKind(f)}
                style={{ padding: '5px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                  background: filterKind === f ? 'var(--primary)' : 'transparent',
                  color: filterKind === f ? '#fff' : undefined }}>
                {f === 'all' ? t('all', 'All') : f === 'recurring' ? t('costs.recurring', 'Recurring') : t('costs.nonRecurring', 'Non-recurring')}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {loadingCosts ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('costs.loadingCosts')}</div>
        ) : (() => {
          const sections: Array<{ label: string; items: RecurringCostSummary[]; kind: 'recurring'; bp: 'B' | 'P' } | { label: string; items: NonRecurringCostSummary[]; kind: 'non-recurring'; bp: 'B' | 'P' }> = [];
          if (filterType !== 'P' && filterKind !== 'non-recurring' && bRecurring.length > 0)
            sections.push({ label: t('costs.businessRecurring'), items: bRecurring, kind: 'recurring', bp: 'B' as const });
          if (filterType !== 'P' && filterKind !== 'recurring' && bNonRecurring.length > 0)
            sections.push({ label: t('costs.businessNonRecurring'), items: bNonRecurring, kind: 'non-recurring', bp: 'B' as const });
          if (filterType !== 'B' && filterKind !== 'non-recurring' && pRecurring.length > 0)
            sections.push({ label: t('costs.privateRecurring'), items: pRecurring, kind: 'recurring', bp: 'P' as const });
          if (filterType !== 'B' && filterKind !== 'recurring' && pNonRecurring.length > 0)
            sections.push({ label: t('costs.privateNonRecurring'), items: pNonRecurring, kind: 'non-recurring', bp: 'P' as const });

          if (sections.length === 0) return <p className="helper">{t('costs.noCostsFound')}</p>;

          return sections.map((section, si) => (
            <div key={si} style={{ marginBottom: si < sections.length - 1 ? 28 : 0 }}>
              <h4 style={{ margin: '0 0 10px' }}>{section.label}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, paddingBottom: 8, borderBottom: '2px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
                <div>{t('costs.monthColumn')}</div>
                <div>{t('costs.costType')}</div>
                <div style={{ textAlign: 'right' }}>{t('amount')}</div>
              </div>
              {section.kind === 'recurring'
                ? (section.items as RecurringCostSummary[]).map((item, idx) => {
                    const key = `B${si}-rec-${item.cost_type}-${item.start_month}`;
                    const isExp = expandedKeys.has(key);
                    const hasDet = item.details?.length > 0;
                    return (
                      <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingTop: 10, paddingBottom: 10 }}>
                        <div onClick={() => hasDet && toggleExpanded(key)}
                          style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, cursor: hasDet ? 'pointer' : 'default' }}>
                          <div className="helper">{item.start_month || '—'}</div>
                          <div className="helper">{item.cost_type}</div>
                          <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(item.total_amount)}</div>
                        </div>
                        {isExp && item.details.map((detail, di) => (
                          <div key={di} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto 60px', gap: 8, marginTop: 8, paddingLeft: 12, alignItems: 'center' }}>
                            <div />
                            <div className="helper">{detail.cost || t('costs.noDescription')}</div>
                            <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(detail.amount)}</div>
                            <button onClick={() => handleEditCost(detail.id, 'recurring', { ...detail, cost_type: item.cost_type }, section.bp)}
                              style={{ padding: '4px 8px', fontSize: 12, height: 'auto', minHeight: 'unset' }}>{t('edit')}</button>
                          </div>
                        ))}
                      </div>
                    );
                  })
                : (section.items as NonRecurringCostSummary[]).map((item, idx) => {
                    const key = `${si}-nr-${item.cost_type}-${item.month}`;
                    const isExp = expandedKeys.has(key);
                    const hasDet = item.details?.length > 0;
                    return (
                      <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingTop: 10, paddingBottom: 10 }}>
                        <div onClick={() => hasDet && toggleExpanded(key)}
                          style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, cursor: hasDet ? 'pointer' : 'default' }}>
                          <div className="helper">{item.month || '—'}</div>
                          <div className="helper">{item.cost_type}</div>
                          <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(item.total_amount)}</div>
                        </div>
                        {isExp && item.details.map((detail, di) => (
                          <div key={di} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto 60px', gap: 8, marginTop: 8, paddingLeft: 12, alignItems: 'center' }}>
                            <div />
                            <div className="helper">{detail.cost || t('costs.noDescription')}</div>
                            <div className="helper" style={{ textAlign: 'right' }}>{fmtMoney(detail.amount)}</div>
                            <button onClick={() => handleEditCost(detail.id, 'non-recurring', { ...detail, cost_type: item.cost_type }, section.bp)}
                              style={{ padding: '4px 8px', fontSize: 12, height: 'auto', minHeight: 'unset' }}>{t('edit')}</button>
                          </div>
                        ))}
                      </div>
                    );
                  })
              }
            </div>
          ));
        })()}
      </>}
      </div>
    </>
  );
};

export default NewCost;



