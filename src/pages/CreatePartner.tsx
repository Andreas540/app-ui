// src/pages/CreatePartner.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

export default function CreatePartner() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postal, setPostal] = useState('')

  const CONTROL_H = 44

  async function save() {
    if (!name.trim()) { alert(t('partners.alertNoName')); return }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const res = await fetch(`${base}/api/partners`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({
    name: name.trim(),
    phone: phone.trim() || null,
    address1: address1.trim() || null,
    address2: address2.trim() || null,
    city: city.trim() || null,
    state: state.trim() || null,
    postal_code: postal.trim() || null,
  }),
})
      
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to create partner (status ${res.status}) ${text?.slice(0,140)}`)
      }
      
      alert(t('partners.created'))
      navigate('/partners')
    } catch (e:any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  return (
    <div className="card page-normal">
      <h3>{t('partners.createTitle')}</h3>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('partners.partnerName')}</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <label>{t('phone')}</label>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('addressLine1')}</label>
          <input type="text" value={address1} onChange={e=>setAddress1(e.target.value)} />
        </div>
        <div>
          <label>{t('addressLine2')}</label>
          <input type="text" value={address2} onChange={e=>setAddress2(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('city')}</label>
          <input type="text" value={city} onChange={e=>setCity(e.target.value)} />
        </div>
        <div>
          <label>{t('state')}</label>
          <input type="text" value={state} onChange={e=>setState(e.target.value)} />
        </div>
        <div>
          <label>{t('zip')}</label>
          <input type="text" value={postal} onChange={e=>setPostal(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop:16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>{t('save')}</button>
        <button onClick={()=>history.back()} style={{ height: CONTROL_H }}>{t('cancel')}</button>
      </div>
    </div>
  )
}