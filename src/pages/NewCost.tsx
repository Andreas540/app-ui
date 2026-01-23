import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCostCategories, getCostTypes, createCost, getExistingCosts, updateCost, deleteCost } from '../lib/api';

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
  const [viewMode, setViewMode] = useState<'B' | 'P'>('B');
  const [recurringCosts, setRecurringCosts] = useState<RecurringCostSummary[]>([]);
  const [nonRecurringCosts, setNonRecurringCosts] = useState<NonRecurringCostSummary[]>([]);
  const [expandedRecurring, setExpandedRecurring] = useState<Set<string>>(new Set());
  const [expandedNonRecurring, setExpandedNonRecurring] = useState<Set<string>>(new Set());
  const [loadingCosts, setLoadingCosts] = useState(false);

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

  // Load costs when viewMode changes
  useEffect(() => {
    loadExistingCosts();
  }, [viewMode]);

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
      setError('Failed to load cost categories');
    }
  };

  const loadCostTypeOptions = async () => {
    try {
      const response = await getCostTypes(costCategory);
      setCostTypeOptions(response.types || []);
      setCostType('');
    } catch (err) {
      console.error('Error loading cost types:', err);
      setError('Failed to load cost types');
    }
  };

  const loadExistingCosts = async () => {
    setLoadingCosts(true);
    try {
      const response = await getExistingCosts(viewMode);
      setRecurringCosts(response.recurring || []);
      setNonRecurringCosts(response.non_recurring || []);
    } catch (err) {
      console.error('Error loading existing costs:', err);
    } finally {
      setLoadingCosts(false);
    }
  };

  const toggleRecurringExpanded = (key: string) => {
    const newExpanded = new Set(expandedRecurring);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedRecurring(newExpanded);
  };

  const toggleNonRecurringExpanded = (key: string) => {
    const newExpanded = new Set(expandedNonRecurring);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedNonRecurring(newExpanded);
  };

  // Edit a cost - populate form with existing data
  const handleEditCost = async (costId: number | string, costType: 'recurring' | 'non-recurring', detail: any) => {
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
      setBusinessPrivate(viewMode);
      
      // STEP 3: Set edit mode AFTER businessPrivate is set
      setEditingCostId(costId);
      setEditingCostType(costType);
      
      // STEP 4: Determine category
      let category = '';
      if (costType === 'recurring') {
        category = viewMode === 'B' ? 'Business recurring cost' : 'Private recurring cost';
      } else {
        category = viewMode === 'B' ? 'Business non-recurring cost' : 'Private non-recurring cost';
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
      setAmount(formatCurrency(detail.amount));
      
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
      setError('Failed to load cost for editing');
    }
  };

  // Delete a cost
  const handleDeleteCost = async () => {
    if (!editingCostId || !editingCostType) return;
    
    if (!window.confirm('Are you sure you want to delete this cost?')) {
      return;
    }
    
    setLoading(true);
    try {
      await deleteCost(editingCostId, editingCostType);
      alert('Cost deleted successfully!');
      handleClear();
      loadExistingCosts();
    } catch (err: any) {
      console.error('Error deleting cost:', err);
      setError(err.message || 'Failed to delete cost');
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

  // On focus: strip any commas (if any) to keep typing smooth
  const handleAmountFocus = () => {
    if (!amount) return;
    setAmount(amount.replace(/,/g, ''));
  };

  // On blur: pretty-format with thousands separators and normalize decimals to 2 places
  const handleAmountBlur = () => {
    const a = amount.trim();
    if (a === '') return;

    // Normalize: remove commas, ensure dot decimal
    let s = a.replace(/,/g, '');

    // If ends with a dot (user typed "123."), finalize as "123.00"
    if (s.endsWith('.')) s = s.slice(0, -1);

    const [i0 = '', d0 = ''] = s.split('.');
    const intPart = (i0 === '' ? '0' : i0).replace(/^0+(?=\d)/, ''); // keep single 0
    let dec = d0;
    if (dec.length === 0) dec = '00';
    else if (dec.length === 1) dec = dec + '0';
    else dec = dec.slice(0, 2);

    const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    setAmount(`${intWithSep}.${dec}`);
  };

  const parseAmount = (formattedAmount: string): number => {
    if (!formattedAmount) return 0;
    // Strip thousands and parse US-style decimal
    const n = Number(formattedAmount.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  // ---------- END AMOUNT INPUT ----------

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const validateForm = (): boolean => {
    if (!costCategory) {
      setError('Please select a cost category');
      return false;
    }
    if (!costType) {
      setError('Please select a cost type');
      return false;
    }
    if (!costDate) {
      setError('Please select a date');
      return false;
    }
    if (amount.trim() === '') {
      setError('Please enter an amount');
      return false;
    }
    if (parseAmount(amount) <= 0) {
      setError('Please enter a valid amount');
      return false;
    }
    if (isRecurring && recurringDetails.recur_interval < 1) {
      setError('Recurrence interval must be at least 1');
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
        alert('Cost updated successfully!');
      } else {
        // Create new cost
        await createCost(costData);
        alert('Cost saved successfully!');
      }
      
      handleClear();
      // Reload costs to show the changes
      loadExistingCosts();
    } catch (err: any) {
      console.error('Error saving cost:', err);
      setError(err.message || 'Failed to save cost');
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

  return (
    <>
      {/* Register/Edit Cost Card */}
      <div ref={formRef} className="card" style={{ maxWidth: 720 }}>
        <h3 style={{ margin: 0, marginBottom: 16 }}>
          {editingCostId ? 'Edit Cost' : 'Register New Cost'}
        </h3>

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
            <span>Business</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={businessPrivate === 'P'}
              onChange={(e) => { if (e.target.checked) setBusinessPrivate('P') }}
              disabled={editingCostId !== null}
              style={{ width: 18, height: 18 }}
            />
            <span>Private</span>
          </label>
        </div>

        {/* Cost Category Dropdown */}
        <div style={{ marginTop: 12 }}>
          <label>Cost Category</label>
          <select
            value={costCategory}
            onChange={(e) => setCostCategory(e.target.value)}
            disabled={loading || editingCostId !== null}
            style={{ height: CONTROL_H }}
          >
            <option value="">Select category...</option>
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
              <label>Recurrence</label>
              <select
                value={recurringDetails.recur_kind}
                onChange={(e) => setRecurringDetails({
                  ...recurringDetails,
                  recur_kind: e.target.value as 'monthly' | 'weekly' | 'yearly'
                })}
                style={{ height: CONTROL_H }}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label>Every (interval)</label>
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
                {recurringDetails.recur_kind === 'monthly' ? 'month(s)' :
                 recurringDetails.recur_kind === 'weekly' ? 'week(s)' :
                 'year(s)'}
              </p>
            </div>
          </div>
        )}

        {/* Cost Type Dropdown - Show when category is selected */}
        {costCategory && (
          <div style={{ marginTop: 12 }}>
            <label>Cost Type</label>
            <select
              value={costType}
              onChange={(e) => setCostType(e.target.value)}
              disabled={loading || !costTypeOptions.length}
              style={{ height: CONTROL_H }}
            >
              <option value="">Select type...</option>
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
            <label>Cost description (optional)</label>
            <input
              type="text"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Enter cost description (optional)"
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
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={costDate}
                    onChange={(e) => setCostDate(e.target.value)}
                    disabled={loading}
                    style={{ height: CONTROL_H }}
                  />
                </div>
                <div>
                  <label>End Date (optional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={loading}
                    min={costDate}
                    style={{ height: CONTROL_H }}
                  />
                </div>
              </div>
            ) : (
              // Non-recurring: Show single Date field
              <div style={{ marginTop: 12 }}>
                <label>Date</label>
                <input
                  type="date"
                  value={costDate}
                  onChange={(e) => setCostDate(e.target.value)}
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
            <label>Cost Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleAmountChange}
              onFocus={handleAmountFocus}
              onBlur={handleAmountBlur}
              placeholder="0.00"
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
            {loading ? (editingCostId ? 'Updating...' : 'Saving...') : (editingCostId ? 'Update' : 'Save')}
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
              Delete
            </button>
          )}
          <button
            onClick={handleClear}
            disabled={loading}
            style={{ height: CONTROL_H }}
          >
            Clear
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{ height: CONTROL_H }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* View Costs Card */}
      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
        {/* Filter Buttons for Viewing Costs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <button
            className="primary"
            onClick={() => setViewMode('B')}
            aria-pressed={viewMode === 'B'}
            style={{ height: 'calc(var(--control-h) * 0.67)' }}
          >
            See Business Costs
          </button>
          <button
            className="primary"
            onClick={() => setViewMode('P')}
            aria-pressed={viewMode === 'P'}
            style={{ height: 'calc(var(--control-h) * 0.67)' }}
          >
            See Private Costs
          </button>
        </div>

        {/* Existing Costs Display */}
        <div style={{ marginTop: 24 }}>
          {loadingCosts ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
              Loading costs...
            </div>
          ) : (
            <>
              {/* Recurring Costs Section */}
              {recurringCosts.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h4 style={{ margin: 0, marginBottom: 12 }}>
                    {viewMode === 'B' ? 'Business recurring costs' : 'Private recurring costs'}
                  </h4>
                  
                  {/* Headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr auto',
                    gap: 8,
                    paddingBottom: 8,
                    borderBottom: '2px solid #ddd',
                    fontWeight: 600,
                    fontSize: 14
                  }}>
                    <div>Month</div>
                    <div>Cost Type</div>
                    <div style={{ textAlign: 'right' }}>Amount</div>
                  </div>

                  {/* Data rows */}
                  <div style={{ display: 'grid' }}>
                    {recurringCosts.map((item, idx) => {
                      const key = `${item.cost_type}-${item.start_month}`;
                      const isExpanded = expandedRecurring.has(key);
                      const hasDetails = item.details && item.details.length > 0;
                      
                      return (
                        <div key={idx} style={{ borderBottom: '1px solid #eee', paddingTop: 12, paddingBottom: 12 }}>
                          {/* Main row */}
                          <div
                            onClick={() => hasDetails && toggleRecurringExpanded(key)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '80px 1fr auto',
                              gap: 8,
                              cursor: hasDetails ? 'pointer' : 'default'
                            }}
                            onMouseEnter={(e) => hasDetails && (e.currentTarget.style.backgroundColor = 'var(--panel)')}
                            onMouseLeave={(e) => hasDetails && (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <div className="helper">{item.start_month || '—'}</div>
                            <div className="helper">{item.cost_type}</div>
                            <div className="helper" style={{ textAlign: 'right' }}>
                              ${formatCurrency(item.total_amount)}
                            </div>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && item.details.map((detail, detailIdx) => (
                            <div
                              key={detailIdx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '80px 1fr auto 60px',
                                gap: 8,
                                marginTop: 8,
                                paddingLeft: 12,
                                alignItems: 'center'
                              }}
                            >
                              <div></div>
                              <div className="helper" style={{ lineHeight: '1.4' }}>
                                {detail.cost || '(No description)'}
                              </div>
                              <div className="helper" style={{ textAlign: 'right' }}>
                                ${formatCurrency(detail.amount)}
                              </div>
                              <button
                                onClick={() => handleEditCost(detail.id, 'recurring', {
                                  ...detail,
                                  cost_type: item.cost_type
                                })}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  height: 'auto',
                                  minHeight: 'unset'
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Non-Recurring Costs Section */}
              {nonRecurringCosts.length > 0 && (
                <div>
                  <h4 style={{ margin: 0, marginBottom: 12 }}>
                    {viewMode === 'B' ? 'Business non-recurring costs' : 'Private non-recurring costs'}
                  </h4>
                  
                  {/* Headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr auto',
                    gap: 8,
                    paddingBottom: 8,
                    borderBottom: '2px solid #ddd',
                    fontWeight: 600,
                    fontSize: 14
                  }}>
                    <div>Month</div>
                    <div>Cost Type</div>
                    <div style={{ textAlign: 'right' }}>Amount</div>
                  </div>

                  {/* Data rows */}
                  <div style={{ display: 'grid' }}>
                    {nonRecurringCosts.map((item, idx) => {
                      const key = `${item.cost_type}-${item.month}`;
                      const isExpanded = expandedNonRecurring.has(key);
                      const hasDetails = item.details && item.details.length > 0;
                      
                      return (
                        <div key={idx} style={{ borderBottom: '1px solid #eee', paddingTop: 12, paddingBottom: 12 }}>
                          {/* Main row */}
                          <div
                            onClick={() => hasDetails && toggleNonRecurringExpanded(key)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '80px 1fr auto',
                              gap: 8,
                              cursor: hasDetails ? 'pointer' : 'default'
                            }}
                            onMouseEnter={(e) => hasDetails && (e.currentTarget.style.backgroundColor = 'var(--panel)')}
                            onMouseLeave={(e) => hasDetails && (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <div className="helper">{item.month || '—'}</div>
                            <div className="helper">{item.cost_type}</div>
                            <div className="helper" style={{ textAlign: 'right' }}>
                              ${formatCurrency(item.total_amount)}
                            </div>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && item.details.map((detail, detailIdx) => (
                            <div
                              key={detailIdx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '80px 1fr auto 60px',
                                gap: 8,
                                marginTop: 8,
                                paddingLeft: 12,
                                alignItems: 'center'
                              }}
                            >
                              <div></div>
                              <div className="helper" style={{ lineHeight: '1.4' }}>
                                {detail.cost || '(No description)'}
                              </div>
                              <div className="helper" style={{ textAlign: 'right' }}>
                                ${formatCurrency(detail.amount)}
                              </div>
                              <button
                                onClick={() => handleEditCost(detail.id, 'non-recurring', {
                                  ...detail,
                                  cost_type: item.cost_type
                                })}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  height: 'auto',
                                  minHeight: 'unset'
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No costs message */}
              {recurringCosts.length === 0 && nonRecurringCosts.length === 0 && (
                <p className="helper">No costs found for the last 3 months</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default NewCost;



