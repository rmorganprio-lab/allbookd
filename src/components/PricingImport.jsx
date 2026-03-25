/**
 * PricingImport
 *
 * Modal for bulk-importing pricing_matrix rows from a CSV or Excel file.
 * Used in both Settings.jsx (org owner) and AdminOrgs.jsx (platform admin).
 *
 * Props:
 *   orgId        - The org to import into
 *   serviceTypes - Existing service_types rows for this org: [{ id, name }]
 *   onClose      - Close callback
 *   onImported   - Called after a successful import so the caller can refresh
 */
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV, downloadXLSXTemplate } from '../lib/csv'

const FREQ_LABELS = {
  one_time: 'One-time',
  weekly:   'Weekly',
  biweekly: 'Biweekly',
  monthly:  'Monthly',
}

function normalizeFrequency(val) {
  if (!val) return null
  const v = val.toLowerCase().trim().replace(/[-_\s]/g, '')
  if (['onetime', 'once', '1x', 'onetimeclean'].includes(v)) return 'one_time'
  if (['weekly', 'week', 'wk'].includes(v)) return 'weekly'
  if (['biweekly', 'biweek', 'every2weeks', '2weeks', 'fortnightly', '2x', 'everyotherweek'].includes(v)) return 'biweekly'
  if (['monthly', 'month', 'mo'].includes(v)) return 'monthly'
  return null
}

function validateRow(row, serviceTypes) {
  const issues = []

  const stName = (row.service_type || '').trim()
  if (!stName) issues.push('Service Type is required')

  const beds = Number(row.bedrooms)
  if (!row.bedrooms || isNaN(beds) || beds < 1 || !Number.isInteger(beds)) {
    issues.push('Bedrooms must be a whole number ≥ 1')
  }

  const baths = Number(row.bathrooms)
  if (!row.bathrooms || isNaN(baths) || baths < 1 || !Number.isInteger(baths)) {
    issues.push('Bathrooms must be a whole number ≥ 1')
  }

  const freq = normalizeFrequency(row.frequency)
  if (!freq) issues.push('Frequency must be: one_time, weekly, biweekly, or monthly')

  const price = Number(row.price)
  if (!row.price || isNaN(price) || price <= 0) issues.push('Price must be a positive number')

  const matchedST = serviceTypes.find(
    (st) => st.name.toLowerCase() === stName.toLowerCase()
  )

  return {
    ...row,
    _stName: stName,
    _stMatched: matchedST || null,
    _beds: Number.isInteger(beds) && beds >= 1 ? beds : null,
    _baths: Number.isInteger(baths) && baths >= 1 ? baths : null,
    _freq: freq,
    _price: price > 0 ? price : null,
    _issues: issues,
    _valid: issues.length === 0,
  }
}

const TEMPLATE_DEF = {
  headers: ['service_type', 'bedrooms', 'bathrooms', 'frequency', 'price'],
  required: ['service_type', 'bedrooms', 'bathrooms', 'frequency', 'price'],
  sample:  { service_type: 'Standard Clean', bedrooms: '2', bathrooms: '1', frequency: 'one_time',  price: '120' },
  sample2: { service_type: 'Standard Clean', bedrooms: '3', bathrooms: '2', frequency: 'biweekly',  price: '150' },
  instructions: [
    ['TimelyOps — Pricing Matrix Import Template', '', ''],
    ['', '', ''],
    ['Column', 'Required?', 'Notes'],
    ['Service Type', 'Yes', 'Must match a service type name (or it will be created). Case-insensitive.'],
    ['Bedrooms',     'Yes', 'Whole number, e.g. 1, 2, 3, 4, 5'],
    ['Bathrooms',    'Yes', 'Whole number, e.g. 1, 2, 3, 4'],
    ['Frequency',    'Yes', 'one_time  |  weekly  |  biweekly  |  monthly'],
    ['Price',        'Yes', 'Dollar amount — no $ sign (e.g. 120 or 149.99)'],
    ['', '', ''],
    ['Accepted frequency values', '', ''],
    ['one_time',  '', 'Also: once, 1x'],
    ['weekly',    '', 'Also: week, wk'],
    ['biweekly',  '', 'Also: bi-weekly, every 2 weeks, fortnightly'],
    ['monthly',   '', 'Also: month, mo'],
    ['', '', ''],
    ['Notes', '', ''],
    ['- If a price already exists for the same combination, it will be updated.', '', ''],
    ['- If a Service Type name is not found, it will be created automatically.', '', ''],
  ],
}

export default function PricingImport({ orgId, serviceTypes, onClose, onImported }) {
  const [step, setStep] = useState('upload') // upload | preview | importing | done
  const [rows, setRows] = useState([])
  const [parseError, setParseError] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  const validRows  = rows.filter((r) => r._valid)
  const invalidRows = rows.filter((r) => !r._valid)
  const unknownServiceTypes = [
    ...new Set(validRows.filter((r) => !r._stMatched).map((r) => r._stName)),
  ]

  function downloadTemplate() {
    downloadXLSXTemplate('TOPricingTemplate.xlsx', TEMPLATE_DEF)
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)

    try {
      let csvText

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const XLSX = await import('xlsx')
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer)
        const ws = wb.Sheets[wb.SheetNames[0]]
        csvText = XLSX.utils.sheet_to_csv(ws)
      } else {
        csvText = await file.text()
      }

      // Normalise the header row before passing to parseCSV
      const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      if (lines.length < 2) {
        setParseError('File is empty or has no data rows.')
        return
      }

      const normaliseHeader = (h) =>
        h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')

      lines[0] = lines[0]
        .split(',')
        .map((h) => {
          const norm = normaliseHeader(h.replace(/"/g, ''))
          if (['service_type', 'servicetype', 'service'].includes(norm)) return 'service_type'
          return norm
        })
        .join(',')

      const { headers, rows: parsed, errors } = parseCSV(lines.join('\n'))

      if (errors.length > 0 && parsed.length === 0) {
        setParseError(errors[0])
        return
      }

      const required = ['service_type', 'bedrooms', 'bathrooms', 'frequency', 'price']
      const missing = required.filter((r) => !headers.includes(r))
      if (missing.length > 0) {
        setParseError(
          `Missing required columns: ${missing.join(', ')}. ` +
          `Expected headers: Service Type, Bedrooms, Bathrooms, Frequency, Price.`
        )
        return
      }

      setRows(parsed.map((r) => validateRow(r, serviceTypes)))
      setStep('preview')
    } catch (err) {
      setParseError(`Failed to read file: ${err.message}`)
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleImport() {
    setStep('importing')

    let inserted = 0
    let updated  = 0
    const skipped = invalidRows.length

    try {
      // Build a name→id map starting from existing service types
      const stMap = {}
      for (const st of serviceTypes) {
        stMap[st.name.toLowerCase()] = st.id
      }

      // Create missing service types
      for (const stName of unknownServiceTypes) {
        const { data: newST, error } = await supabase
          .from('service_types')
          .insert({ org_id: orgId, name: stName, default_duration_minutes: 120, is_active: true })
          .select('id')
          .single()
        if (!error && newST) {
          stMap[stName.toLowerCase()] = newST.id
        }
      }

      // Resolve each valid row to a DB row and classify insert vs update
      const stIds = [
        ...new Set(validRows.map((r) => stMap[r._stName.toLowerCase()]).filter(Boolean)),
      ]

      // Fetch existing rows to determine insert vs update
      const { data: existing } = await supabase
        .from('pricing_matrix')
        .select('service_type_id, bedrooms, bathrooms, frequency')
        .eq('org_id', orgId)
        .in('service_type_id', stIds.length > 0 ? stIds : ['00000000-0000-0000-0000-000000000000'])

      const existingKeys = new Set(
        (existing || []).map(
          (r) => `${r.service_type_id}:${r.bedrooms}:${r.bathrooms}:${r.frequency}`
        )
      )

      // Deduplicate: if the CSV has the same combination twice, last row wins
      const seen = new Map()
      for (const row of validRows) {
        const stId = stMap[row._stName.toLowerCase()]
        if (!stId) continue
        const key = `${stId}:${row._beds}:${row._baths}:${row._freq}`
        seen.set(key, { org_id: orgId, service_type_id: stId, bedrooms: row._beds, bathrooms: row._baths, frequency: row._freq, price: row._price })
        if (existingKeys.has(key)) updated++
        else inserted++
      }

      const upsertRows = [...seen.values()]

      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from('pricing_matrix')
          .upsert(upsertRows, {
            onConflict: 'org_id,service_type_id,bedrooms,bathrooms,frequency',
          })
        if (error) throw error
      }

      setImportResult({
        inserted,
        updated,
        skipped,
        newServiceTypes: unknownServiceTypes.length,
      })
      onImported()
    } catch (err) {
      setImportResult({ error: err.message })
    }

    setStep('done')
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-3xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Import Pricing</h2>
            <p className="text-sm text-stone-500 mt-0.5">Upload a CSV or Excel file to set prices in bulk</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Upload ────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div>
            <div
              className="border-2 border-dashed border-stone-200 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-sm font-medium text-stone-700 mb-1">Click to upload a file</div>
              <div className="text-xs text-stone-400">CSV or Excel (.xlsx) · Columns: Service Type, Bedrooms, Bathrooms, Frequency, Price</div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {parseError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {parseError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-stone-400">Not sure of the format?</p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Template
              </button>
            </div>
          </div>
        )}

        {/* ── Preview ───────────────────────────────────────────────── */}
        {step === 'preview' && (
          <div>
            {/* Summary chips */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <div className="px-3 py-1.5 bg-emerald-50 rounded-lg text-xs">
                <span className="font-semibold text-emerald-700">{validRows.length}</span>
                <span className="text-emerald-600 ml-1">valid row{validRows.length !== 1 ? 's' : ''}</span>
              </div>
              {invalidRows.length > 0 && (
                <div className="px-3 py-1.5 bg-red-50 rounded-lg text-xs">
                  <span className="font-semibold text-red-700">{invalidRows.length}</span>
                  <span className="text-red-600 ml-1">will be skipped (errors)</span>
                </div>
              )}
              {unknownServiceTypes.length > 0 && (
                <div className="px-3 py-1.5 bg-amber-50 rounded-lg text-xs">
                  <span className="font-semibold text-amber-700">{unknownServiceTypes.length}</span>
                  <span className="text-amber-600 ml-1">new service type{unknownServiceTypes.length !== 1 ? 's' : ''} will be created</span>
                </div>
              )}
            </div>

            {/* New service type notice */}
            {unknownServiceTypes.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <span className="font-medium">New service types will be created: </span>
                {unknownServiceTypes.join(', ')}
              </div>
            )}

            {/* Row table */}
            <div className="overflow-auto max-h-72 border border-stone-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-stone-500">Service Type</th>
                    <th className="text-center px-2 py-2 font-medium text-stone-500">Beds</th>
                    <th className="text-center px-2 py-2 font-medium text-stone-500">Baths</th>
                    <th className="text-left px-2 py-2 font-medium text-stone-500">Frequency</th>
                    <th className="text-right px-3 py-2 font-medium text-stone-500">Price</th>
                    <th className="text-left px-3 py-2 font-medium text-stone-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-stone-50 last:border-0 ${!row._valid ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="px-3 py-2 text-stone-700">{row._stName || '—'}</td>
                      <td className="px-2 py-2 text-center text-stone-500">{row._beds ?? row.bedrooms ?? '—'}</td>
                      <td className="px-2 py-2 text-center text-stone-500">{row._baths ?? row.bathrooms ?? '—'}</td>
                      <td className="px-2 py-2 text-stone-500">{FREQ_LABELS[row._freq] || row.frequency || '—'}</td>
                      <td className="px-3 py-2 text-right text-stone-700">
                        {row._price != null ? `$${row._price}` : row.price || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {!row._valid ? (
                          <span className="text-red-600">Skip — {row._issues[0]}</span>
                        ) : !row._stMatched ? (
                          <span className="text-amber-600">Will create service type</span>
                        ) : (
                          <span className="text-emerald-600">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {validRows.length === 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                No valid rows to import. Fix the errors above and try again.
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setRows([]); setStep('upload') }}
                className="flex-1 py-2.5 border border-stone-200 rounded-xl text-stone-600 text-sm hover:bg-stone-50"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-40"
              >
                Import {validRows.length} price{validRows.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── Importing ─────────────────────────────────────────────── */}
        {step === 'importing' && (
          <div className="py-12 text-center text-stone-400 text-sm">Importing…</div>
        )}

        {/* ── Done ──────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div>
            {importResult?.error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">
                Import failed: {importResult.error}
              </div>
            ) : (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl mb-4">
                <div className="font-semibold text-emerald-800 mb-2">Import complete</div>
                <ul className="text-sm text-emerald-700 space-y-1">
                  <li>{importResult.inserted} price{importResult.inserted !== 1 ? 's' : ''} added</li>
                  {importResult.updated > 0 && (
                    <li>{importResult.updated} price{importResult.updated !== 1 ? 's' : ''} updated</li>
                  )}
                  {importResult.skipped > 0 && (
                    <li className="text-stone-500">
                      {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped (invalid data)
                    </li>
                  )}
                  {importResult.newServiceTypes > 0 && (
                    <li>{importResult.newServiceTypes} new service type{importResult.newServiceTypes !== 1 ? 's' : ''} created</li>
                  )}
                </ul>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
