import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { parseCSV, downloadCSV, generateTemplate, downloadXLSXTemplate, normalizePhone } from '../lib/csv'

/**
 * CSVImport - Reusable modal for importing CSV data
 * 
 * Props:
 *   onClose - close the modal
 *   onImport - async (validRows) => { insert into supabase, return { success, count, errors } }
 *   templateDef - { headers, required, sample } from csv.js
 *   validateRows - (rows) => rows with _issues and _valid added
 *   entityName - "clients" or "workers" for display
 */
export default function CSVImport({ onClose, onImport, templateDef, validateRows, entityName }) {
  const { t } = useTranslation()
  const [step, setStep] = useState('upload') // upload | preview | importing | done
  const [rows, setRows] = useState([])
  const [parseErrors, setParseErrors] = useState([])
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  const validRows = rows.filter(r => r._valid)
  const invalidRows = rows.filter(r => !r._valid)

  function handleDownloadTemplate() {
    if (templateDef.instructions) {
      downloadXLSXTemplate(`TO${entityName.charAt(0).toUpperCase() + entityName.slice(1)}ImportTemplate.xlsx`, templateDef)
    } else {
      const csv = generateTemplate(templateDef.headers, templateDef.sample)
      downloadCSV(`timelyops-${entityName}-template.csv`, csv)
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      const { headers, rows: parsed, errors } = parseCSV(text)
      setParseErrors(errors)

      if (parsed.length === 0) {
        setParseErrors([...errors, 'No data rows found in file'])
        return
      }

      // Check for required headers
      const missingHeaders = templateDef.required.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        setParseErrors([...errors, `Missing required columns: ${missingHeaders.join(', ')}`])
        return
      }

      const validated = validateRows(parsed)
      setRows(validated)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    setStep('importing')
    try {
      const result = await onImport(validRows)
      setImportResult(result)
      setStep('done')
    } catch (err) {
      setImportResult({ success: false, count: 0, errors: [err.message] })
      setStep('done')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-3xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-stone-900">{t('csvimport.title', { entityName })}</h2>
            <p className="text-sm text-stone-500 mt-0.5">
              {step === 'upload' && t('csvimport.step_upload')}
              {step === 'preview' && t('csvimport.step_preview', { valid: validRows.length, invalid: invalidRows.length })}
              {step === 'importing' && t('csvimport.step_importing')}
              {step === 'done' && t('csvimport.step_done')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-stone-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── Upload Step ── */}
        {step === 'upload' && (
          <div>
            {/* Template download */}
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-emerald-800">{t('csvimport.template_title')}</div>
                  <div className="text-xs text-emerald-600 mt-1">
                    {t('csvimport.template_desc', { entityName })}
                    {t('csvimport.template_required', { required: templateDef.required[0]?.replace(/_/g, ' ') || '' })}
                  </div>
                  <div className="text-xs text-emerald-600 mt-1">{t('csvimport.template_dedup')}</div>
                </div>
                <button onClick={handleDownloadTemplate} className="shrink-0 ml-4 px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors">
                  {t('csvimport.btn_download_template')}
                </button>
              </div>
            </div>

            {/* File upload */}
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-stone-200 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
            >
              <svg className="mx-auto mb-3 text-stone-300" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="text-sm font-medium text-stone-600">{t('csvimport.upload_click')}</div>
              <div className="text-xs text-stone-400 mt-1">{t('csvimport.upload_drag')}</div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <div className="text-sm font-medium text-red-800 mb-1">{t('csvimport.issues_title')}</div>
                {parseErrors.map((e, i) => <div key={i} className="text-xs text-red-600">{e}</div>)}
              </div>
            )}

            {/* Column reference */}
            <div className="mt-6">
              <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">{t('csvimport.cols_title')}</div>
              <div className="flex flex-wrap gap-1.5">
                {templateDef.headers.map(h => (
                  <span key={h} className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    templateDef.required.includes(h)
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-stone-100 text-stone-500'
                  }`}>
                    {h.replace(/_/g, ' ')}{templateDef.required.includes(h) ? ' *' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Preview Step ── */}
        {step === 'preview' && (
          <div>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-stone-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-stone-900">{rows.length}</div>
                <div className="text-xs text-stone-500">{t('csvimport.preview_total')}</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-emerald-700">{validRows.length}</div>
                <div className="text-xs text-emerald-600">{t('csvimport.preview_ready')}</div>
              </div>
              <div className={`rounded-xl p-3 text-center ${invalidRows.length > 0 ? 'bg-amber-50' : 'bg-stone-50'}`}>
                <div className={`text-2xl font-bold ${invalidRows.length > 0 ? 'text-amber-600' : 'text-stone-400'}`}>{invalidRows.length}</div>
                <div className={`text-xs ${invalidRows.length > 0 ? 'text-amber-500' : 'text-stone-400'}`}>{t('csvimport.preview_issues')}</div>
              </div>
            </div>

            {/* Invalid rows */}
            {invalidRows.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-sm font-medium text-amber-800 mb-2">{t('csvimport.invalid_rows_title')}</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {invalidRows.map(r => (
                    <div key={r._row} className="text-xs text-amber-700">
                      {t('csvimport.invalid_row', { row: r._row, name: r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '(no name)', issues: r._issues.join(', ') })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary sentence */}
            <div className="text-sm text-stone-600 mb-3">
              {t('csvimport.summary_ready', { count: validRows.length })}
              {invalidRows.length > 0 && <span className="text-amber-600">{t('csvimport.summary_errors', { count: invalidRows.length })}</span>}
            </div>

            {/* Preview table */}
            <div className="border border-stone-200 rounded-xl overflow-hidden mb-4">
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">{t('csvimport.col_status')}</th>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">{t('csvimport.col_name')}</th>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">{t('csvimport.col_phone')}</th>
                      <th className="px-3 py-2 text-left font-semibold text-stone-500">{t('csvimport.col_email')}</th>
                      {entityName === 'clients' && <th className="px-3 py-2 text-left font-semibold text-stone-500">{t('csvimport.col_address')}</th>}
                      {entityName === 'workers' && <th className="px-3 py-2 text-left font-semibold text-stone-500">{t('csvimport.col_role')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map(r => (
                      <tr key={r._row} className={`border-t border-stone-100 ${r._valid ? '' : 'bg-amber-50/50'}`}>
                        <td className="px-3 py-2">
                          {r._valid
                            ? <span className="text-emerald-600">✓</span>
                            : <span className="text-amber-500" title={r._issues.join(', ')}>⚠</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-stone-900 font-medium">{r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                        <td className="px-3 py-2 text-stone-600">{r.phone || '—'}</td>
                        <td className="px-3 py-2 text-stone-600">{r.email || '—'}</td>
                        {entityName === 'clients' && <td className="px-3 py-2 text-stone-600 truncate max-w-[200px]">{[r.address_1, r.city].filter(Boolean).join(', ') || '—'}</td>}
                        {entityName === 'workers' && <td className="px-3 py-2 text-stone-600">{r.role || 'worker'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && (
                <div className="px-3 py-2 bg-stone-50 text-xs text-stone-400 text-center border-t border-stone-100">
                  {t('csvimport.showing_first', { total: rows.length })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => { setStep('upload'); setRows([]); setParseErrors([]) }} className="flex-1 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200 transition-colors">
                {t('csvimport.btn_back')}
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                {t('csvimport.btn_import', { count: validRows.length, entityName })}
              </button>
            </div>
          </div>
        )}

        {/* ── Importing Step ── */}
        {step === 'importing' && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-3 border-emerald-200 border-t-emerald-700 rounded-full animate-spin mb-4" style={{ borderWidth: '3px' }} />
            <div className="text-sm text-stone-600">{t('csvimport.btn_import_progress', { count: validRows.length, entityName })}</div>
          </div>
        )}

        {/* ── Done Step ── */}
        {step === 'done' && importResult && (
          <div className="text-center py-8">
            {importResult.success ? (
              <>
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div className="text-lg font-bold text-stone-900 mb-1">{t('csvimport.done_title')}</div>
                <div className="text-sm text-stone-500">{t('csvimport.done_count', { count: importResult.count, entityName })}</div>
                {importResult.skipped > 0 && (
                  <div className="text-xs text-amber-600 mt-1">{t('csvimport.done_skipped', { count: importResult.skipped })}</div>
                )}
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <div className="text-lg font-bold text-stone-900 mb-1">{t('csvimport.failed_title')}</div>
                {importResult.errors?.map((e, i) => <div key={i} className="text-sm text-red-600">{e}</div>)}
              </>
            )}
            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors">
              {t('csvimport.btn_done')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
