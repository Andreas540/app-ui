import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCostCategories, getCostTypes, createCost } from '../lib/api';

interface RecurringDetails {
  recur_kind: 'monthly' | 'weekly' | 'yearly';
  recur_interval: number;
}

const NewCost = () => {
  const navigate = useNavigate();
  
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

  // Derived state - check if it's recurring (but NOT non-recurring)
  const isRecurring = costCategory.toLowerCase().includes('recurring') && !costCategory.toLowerCase().includes('non-recurring');

  // Load cost category options when businessPrivate changes
  useEffect(() => {
    loadCostCategoryOptions();
  }, [businessPrivate]);

  // Load cost type options when cost category changes
  useEffect(() => {
    if (costCategory) {
      loadCostTypeOptions();
    } else {
      setCostTypeOptions([]);
      setCostType('');
    }
  }, [costCategory]);

  const loadCostCategoryOptions = async () => {
    try {
      const response = await getCostCategories(businessPrivate);
      setCostCategoryOptions(response.categories || []);
      setCostCategory('');
      setCostType('');
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

  const validateForm = (): boolean => {
    if (!costCategory) {
      setError('Please select a cost category');
      return false;
    }
    if (!costType) {
      setError('Please select a cost type');
      return false;
    }
    if (!cost.trim()) {
      setError('Please enter a cost description');
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

      await createCost(costData);
      alert('Cost saved successfully!');
      handleClear();
    } catch (err: any) {
      console.error('Error saving cost:', err);
      setError(err.message || 'Failed to save cost');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
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
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const CONTROL_H = 44;

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ margin: 0, marginBottom: 16 }}>Register New Cost</h3>

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
            style={{ width: 18, height: 18 }}
          />
          <span>Business</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={businessPrivate === 'P'}
            onChange={(e) => { if (e.target.checked) setBusinessPrivate('P') }}
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
          disabled={loading}
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
          <label>Cost</label>
          <input
            type="text"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Enter cost description"
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
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          className="primary"
          onClick={handleSave}
          disabled={loading}
          style={{ height: CONTROL_H }}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
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
  );
};

export default NewCost;


