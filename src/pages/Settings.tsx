export default function Settings() {
  return (
    <div className="card" style={{maxWidth:680}}>
      <h3>App Settings (static)</h3>
      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Tenant name</label>
          <input placeholder="e.g., Roger DC" />
        </div>
        <div>
          <label>Theme color</label>
          <input type="color" defaultValue="#6aa1ff" />
        </div>
      </div>
      <p className="helper" style={{marginTop:12}}>
        Later we’ll make this tenant-aware and drive branding from config.
      </p>
    </div>
  )
}
