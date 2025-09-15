export default function Customers() {
  return (
    <div className="card">
      <h3>Customers (static)</h3>
      <ul style={{margin:0, paddingLeft:16}}>
        <li>Roger DC — Partner</li>
        <li>Acme Corp — Customer</li>
      </ul>
      <p className="helper" style={{marginTop:8}}>We’ll load this from the DB later.</p>
    </div>
  )
}
